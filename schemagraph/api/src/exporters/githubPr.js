/**
 * Optional GitHub PR opener for Que dbt export bundles.
 * Token from env only (GITHUB_TOKEN) — never stored in workspace settings.
 */
async function gh(token, path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text }
  }
  if (!res.ok) {
    const msg =
      body?.message ||
      body?.error ||
      `GitHub ${res.status} ${path}`
    const err = new Error(msg)
    err.status = res.status
    err.body = body
    throw err
  }
  return body
}

/**
 * Create a branch from base, commit files via Contents API, open a PR.
 * @returns {{ prUrl, branch, number, htmlUrl }}
 */
export async function createGithubPullRequest({
  token,
  owner,
  repo,
  baseBranch = 'main',
  branchName,
  title,
  body,
  files,
}) {
  if (!token) {
    return {
      opened: false,
      reason: 'GITHUB_TOKEN not set on API server',
    }
  }
  if (!owner || !repo) {
    return {
      opened: false,
      reason: 'githubOwner / githubRepo not configured in workspace settings',
    }
  }

  const baseRef = await gh(
    token,
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`,
  )
  const baseSha = baseRef.object?.sha
  if (!baseSha) {
    return { opened: false, reason: `Could not resolve base branch ${baseBranch}` }
  }

  const branch = branchName || `que/stitch-${Date.now()}`

  try {
    await gh(token, `/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: baseSha,
      }),
    })
  } catch (err) {
    // Branch may already exist — continue and update files.
    if (err.status !== 422) throw err
  }

  for (const file of files) {
    const path = String(file.path).replace(/^\/+/, '')
    let existingSha
    try {
      const existing = await gh(
        token,
        `/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
      )
      existingSha = existing.sha
    } catch {
      existingSha = undefined
    }

    await gh(token, `/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Que: add ${path}`,
        content: Buffer.from(file.content, 'utf8').toString('base64'),
        branch,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    })
  }

  const pr = await gh(token, `/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title,
      head: branch,
      base: baseBranch,
      body,
    }),
  })

  return {
    opened: true,
    prUrl: pr.html_url,
    htmlUrl: pr.html_url,
    number: pr.number,
    branch,
    owner,
    repo,
    baseBranch,
  }
}

/**
 * Comment on an existing PR (or open a tracking issue) when accepted joins break on sync.
 */
export async function postGithubDriftComment({
  token,
  owner,
  repo,
  issueNumber,
  body,
}) {
  if (!token || !owner || !repo || !issueNumber) {
    return { posted: false, reason: 'missing token/owner/repo/issueNumber' }
  }
  try {
    const comment = await gh(
      token,
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ body }),
      },
    )
    return {
      posted: true,
      url: comment.html_url,
      id: comment.id,
    }
  } catch (err) {
    return { posted: false, reason: String(err.message || err) }
  }
}

/**
 * Open a lightweight GitHub issue for high-severity Que drift (broken accepted joins).
 */
export async function openGithubDriftIssue({
  token,
  owner,
  repo,
  title,
  body,
}) {
  if (!token) {
    return { opened: false, reason: 'GITHUB_TOKEN not set on API server' }
  }
  if (!owner || !repo) {
    return {
      opened: false,
      reason: 'githubOwner / githubRepo not configured',
    }
  }
  try {
    const issue = await gh(token, `/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        body,
        labels: ['que-drift'],
      }),
    })
    return {
      opened: true,
      url: issue.html_url,
      number: issue.number,
    }
  } catch (err) {
    // Labels may not exist — retry without labels
    try {
      const issue = await gh(token, `/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        body: JSON.stringify({ title, body }),
      })
      return {
        opened: true,
        url: issue.html_url,
        number: issue.number,
        reason: String(err.message || err),
      }
    } catch (err2) {
      return { opened: false, reason: String(err2.message || err2) }
    }
  }
}
