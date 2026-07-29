import { test, expect, type Page } from '@playwright/test'

const API = process.env.QUE_API_BASE || 'http://localhost:8787'

async function loginAsOwner(page: Page) {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: /workspace access/i })).toBeVisible({
    timeout: 20_000,
  })
  const ownerBtn = page.getByRole('button', { name: /owner/i }).first()
  if (await ownerBtn.isVisible().catch(() => false)) {
    await ownerBtn.click()
  } else {
    await page.locator('input[type="email"]').fill('dev@stitch.local')
    await page.locator('input[type="password"]').fill('stitch-dev')
  }
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page).toHaveURL(/\/workspace/, { timeout: 25_000 })
}

test.describe('Que browser flows', () => {
  test.beforeAll(async ({ request }) => {
    const health = await request.get(`${API}/health`)
    expect(health.ok(), 'API must be running on :8787').toBeTruthy()
  })

  test('login page is Que (not another app on :5173)', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /workspace access/i })).toBeVisible()
    await expect(page.getByText('Welcome Back to ProSols')).toHaveCount(0)
  })

  test('login rejects bad password', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('dev@stitch.local')
    await page.locator('input[type="password"]').fill('wrong-password')
    await page.getByRole('button', { name: /^sign in$/i }).click()
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('owner login → workspace → navigate all primary pages', async ({
    page,
  }) => {
    await loginAsOwner(page)

    await expect(page.getByRole('navigation', { name: /primary/i })).toBeVisible()

    for (const [name, path] of [
      ['AI Chat', '/chat'],
      ['Sources', '/sources'],
      ['Jobs', '/jobs'],
      ['Settings', '/settings'],
      ['Workspace', '/workspace'],
    ] as const) {
      await page
        .getByRole('navigation', { name: /primary/i })
        .getByRole('link', { name })
        .click()
      await expect(page).toHaveURL(new RegExp(path))
      await expect(page).not.toHaveURL(/\/login/)
    }
  })

  test('settings shows scrub / drift policy toggles', async ({ page }) => {
    await loginAsOwner(page)
    await page
      .getByRole('navigation', { name: /primary/i })
      .getByRole('link', { name: 'Settings' })
      .click()
    await expect(page).toHaveURL(/\/settings/)
    await page
      .getByRole('button', { name: /show policy, byok & ai settings/i })
      .click()
    await expect(page.getByText(/scrub \/ tokenize samples/i)).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText(/block dbt pr on column/i)).toBeVisible()
    await expect(page.getByText('Sarah Miller')).toHaveCount(0)
  })

  test('sources page shows create affordance', async ({ page }) => {
    await loginAsOwner(page)
    await page
      .getByRole('navigation', { name: /primary/i })
      .getByRole('link', { name: 'Sources' })
      .click()
    await expect(page).toHaveURL(/\/sources/)
    await expect(
      page.getByRole('button', { name: /add|new|create|connect/i }).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('jobs page loads', async ({ page }) => {
    await loginAsOwner(page)
    await page
      .getByRole('navigation', { name: /primary/i })
      .getByRole('link', { name: 'Jobs' })
      .click()
    await expect(page).toHaveURL(/\/jobs/)
    await expect(page.getByText(/job|notebook|draft|ready|sync/i).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('chat page accepts /help', async ({ page }) => {
    await loginAsOwner(page)
    await page
      .getByRole('navigation', { name: /primary/i })
      .getByRole('link', { name: 'AI Chat' })
      .click()
    await expect(page).toHaveURL(/\/chat/)
    const box = page.locator('textarea').last()
    await expect(box).toBeVisible({ timeout: 15_000 })
    await box.fill('/help')
    const send = page.getByRole('button', { name: /send|ask|submit/i }).first()
    if (await send.isVisible().catch(() => false)) {
      await send.click()
    } else {
      await box.press('Enter')
    }
    await expect(
      page.getByText(/help|skill|command|\/list|\/joins|schema/i).first(),
    ).toBeVisible({ timeout: 30_000 })
  })

  test('logout returns to login', async ({ page }) => {
    await loginAsOwner(page)
    await page.getByRole('button', { name: /signed in as|sign out/i }).click()
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })

  test('protected route redirects when logged out', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/workspace')
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  })
})
