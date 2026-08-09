import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

/**
 * OIDC post-login landing — API redirects with #token= or #error= (hash, not query).
 */
export function AuthCallbackPage() {
  const { ready, user, acceptToken } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    const params = new URLSearchParams(hash)
    const ssoError = params.get('error')
    const token = params.get('token')
    // Never accept ?token= — query tokens leak via Referer / server logs
    if (new URLSearchParams(window.location.search).get('token')) {
      window.history.replaceState({}, document.title, '/auth/callback')
      setError('Invalid SSO callback: token must not be in the query string')
      return
    }
    if (ssoError) {
      window.history.replaceState({}, document.title, '/auth/callback')
      setError(decodeURIComponent(ssoError))
      return
    }
    if (!token) {
      setError('Missing token from SSO callback')
      return
    }
    // Strip secrets from address bar ASAP
    window.history.replaceState({}, document.title, '/auth/callback')
    let cancelled = false
    ;(async () => {
      try {
        await acceptToken(token)
        if (!cancelled) setDone(true)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [acceptToken])

  if (error) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-md bg-canvas p-lg">
        <p
          role="alert"
          className="max-w-[36rem] border border-error/40 bg-error/10 px-md py-sm font-body text-[13px] leading-snug text-error"
        >
          {error}
        </p>
        <p className="max-w-[36rem] text-center font-body text-[12px] text-on-surface-variant">
          If this workspace requires an invite, ask an admin to invite your SSO
          email, then try again.
        </p>
        <Link
          to="/login"
          className="font-label text-sm tracking-widest text-secondary hover:underline"
        >
          BACK TO SIGN IN
        </Link>
      </div>
    )
  }

  if ((done || user) && ready) {
    return <Navigate to="/workspace" replace />
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-canvas font-label text-xs tracking-widest text-on-surface-variant">
      COMPLETING SSO…
    </div>
  )
}

export default AuthCallbackPage
