import { Navigate } from 'react-router-dom'

/**
 * Managed preview/certify lives on Jobs → Results (inline table layer).
 * Keep route for old links; send people to Jobs.
 */
export function ManagedDatasetsPage() {
  return <Navigate to="/jobs" replace />
}

export default ManagedDatasetsPage
