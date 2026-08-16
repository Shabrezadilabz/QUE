import { Navigate, useSearchParams } from 'react-router-dom'

/** /outcome → single Chat assistant (optional q= seeds the composer). */
export function OutcomePage() {
  const [params] = useSearchParams()
  const q = params.get('q')
  const to = q ? `/chat?q=${encodeURIComponent(q)}` : '/chat'
  return <Navigate to={to} replace />
}
