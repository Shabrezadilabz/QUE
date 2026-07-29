import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

/**
 * OIDC post-login landing — API redirects with #token= (hash, not query).
 */
export function AuthCallbackPage() {
  const { ready, user, acceptToken } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    const params = new URLSearchParams(hash)
    const token = params.get('token')
    // Never accept ?token= — query tokens leak via Referer / server logs
    if (new URLSearchParams(window.location.search).get('token')) {
      window.history.replaceState({}, document.title, '/auth/callback')
      setError('Invalid SSO callback: token must not be in the query string')
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
      <div className="flex min-h-full items-center justify-center bg-canvas p-lg">
        <p className="font-body text-sm text-error">{error}</p>
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
