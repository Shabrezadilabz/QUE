import { Navigate, useSearchParams } from 'react-router-dom'

/**
 * /outcome → unified Assistant Outcome mode.
 */
export function OutcomePage() {
  const [params] = useSearchParams()
  const q = params.get('q')
  const to = q
    ? `/chat?mode=outcome&q=${encodeURIComponent(q)}`
    : '/chat?mode=outcome'
  return <Navigate to={to} replace />
}
