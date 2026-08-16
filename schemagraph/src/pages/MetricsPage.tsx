import { Navigate } from 'react-router-dom'

/** Metrics live inside Report Studio (/bi) — one page with Certified BI. */
export function MetricsPage() {
  return <Navigate to="/bi?focus=data" replace />
}

export default MetricsPage
