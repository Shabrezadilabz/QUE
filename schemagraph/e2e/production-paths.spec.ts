import { test, expect, type Page } from '@playwright/test'

const API = process.env.QUE_API_BASE || 'http://localhost:8787'

async function loginAsOwner(page: Page) {
  await page.goto('/login')
  await expect(
    page.getByRole('heading', { name: /workspace access/i }),
  ).toBeVisible({ timeout: 20_000 })
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

test.describe('Production client paths', () => {
  test.beforeAll(async ({ request }) => {
    const health = await request.get(`${API}/health`)
    expect(health.ok(), 'API must be running on :8787').toBeTruthy()
    const metrics = await request.get(`${API}/metrics`)
    expect(metrics.ok()).toBeTruthy()
  })

  test('joins + managed + BI + compliance + product pages load', async ({
    page,
  }) => {
    await loginAsOwner(page)

    for (const [name, path, heading] of [
      ['Joins', '/joins', /join review/i],
      ['Managed', '/managed', /managed datasets/i],
      ['BI', '/bi', /certified bi/i],
      ['Compliance', '/compliance', /compliance evidence/i],
      ['Product', '/product', /cursor for data teams/i],
    ] as const) {
      await page.goto(path)
      await expect(page).toHaveURL(new RegExp(path))
      await expect(page.getByRole('heading', { name: heading })).toBeVisible({
        timeout: 20_000,
      })
      // Prefer nav when visible (desktop)
      const nav = page.getByRole('navigation', { name: /primary/i })
      if (await nav.isVisible().catch(() => false)) {
        await expect(nav.getByRole('link', { name })).toBeVisible()
      }
    }
  })

  test('AI policy shows pinned samples + managed plane toggles', async ({
    page,
  }) => {
    await loginAsOwner(page)
    await page.goto('/settings/ai-policy')
    await expect(page.getByText(/AI may use pinned scrubbed samples/i)).toBeVisible({
      timeout: 20_000,
    })
    await expect(
      page.getByText(/Enable Que Managed Data Plane/i),
    ).toBeVisible()
    await expect(page.getByText(/Pinned sample rows/i)).toBeVisible()
  })

  test('ops metrics prometheus format', async ({ request }) => {
    const res = await request.get(`${API}/metrics?format=prom`)
    expect(res.ok()).toBeTruthy()
    const text = await res.text()
    expect(text).toContain('que_up')
    expect(text).toContain('que_managed_datasets')
  })
})
