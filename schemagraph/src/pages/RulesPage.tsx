import { Navigate } from 'react-router-dom'

/**
 * Rules UI hidden for now — not on the critical path.
 * Backend still learns rules from Promote / packs and injects them into chat + transforms.
 * Re-enable a proper Rules surface once Outcome/agent also consume the pack end-to-end.
 */
export function RulesPage() {
  return <Navigate to="/chat" replace />
}

export default RulesPage
