import { Navigate, useSearchParams } from 'react-router-dom'

/**
 * Validation lives on Jobs → Results under the table preview.
 * Keep /validation for old links; optional ?job= deep-links the job.
 */
export function ValidationSuitePage() {
  const [params] = useSearchParams()
  const jobId = params.get('job')
  const to = jobId
    ? `/jobs/${encodeURIComponent(jobId)}/results`
    : '/jobs'
  return <Navigate to={to} replace />
}

export default ValidationSuitePage
