import { Navigate } from 'react-router-dom'

/** /transforms → unified Review queue on /proposals. */
export function TransformsPage() {
  return <Navigate to="/proposals" replace />
}

export default TransformsPage
