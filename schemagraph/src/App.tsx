import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
import { RequireAuth } from '@/components/RequireAuth'
import { LoginPage } from '@/pages/LoginPage'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { AttestationVerifyPage } from '@/pages/AttestationVerifyPage'
import { WorkspacePage } from '@/pages/WorkspacePage'
import { ChatPage } from '@/pages/ChatPage'
import { JobsPage } from '@/pages/JobsPage'
import { SourcesPage } from '@/pages/SourcesPage'
import { JoinReviewPage } from '@/pages/JoinReviewPage'
import { LineagePage } from '@/pages/LineagePage'
import { SettingsLayout } from '@/layouts/SettingsLayout'
import { JobsLayout } from '@/layouts/JobsLayout'
import { SourcesLayout } from '@/layouts/SourcesLayout'
import { MembersSettingsPage } from '@/pages/settings/MembersSettingsPage'
import { SecuritySettingsPage } from '@/pages/settings/SecuritySettingsPage'
import { AutomationSettingsPage } from '@/pages/settings/AutomationSettingsPage'
import { GovernanceSettingsPage } from '@/pages/settings/GovernanceSettingsPage'
import { BillingSettingsPage } from '@/pages/settings/BillingSettingsPage'
import { AiPolicySettingsPage } from '@/pages/settings/AiPolicySettingsPage'
import { DomainsSettingsPage } from '@/pages/settings/DomainsSettingsPage'
import { DriftAgentPage } from '@/pages/DriftAgentPage'
import { ValidationSuitePage } from '@/pages/ValidationSuitePage'
import { CatalogPage } from '@/pages/CatalogPage'
import { GlossaryPage } from '@/pages/GlossaryPage'
import { StewardPage } from '@/pages/StewardPage'
import { TeamSettingsPage } from '@/pages/settings/TeamSettingsPage'
import { EnterpriseSettingsPage } from '@/pages/settings/EnterpriseSettingsPage'
import { BiAccessSettingsPage } from '@/pages/settings/BiAccessSettingsPage'
import { ManagedDatasetsPage } from '@/pages/ManagedDatasetsPage'
import { ManagedPlanePage } from '@/pages/ManagedPlanePage'
import { BiChartsPage } from '@/pages/BiChartsPage'
import { CompliancePage } from '@/pages/CompliancePage'
import { ProductPage } from '@/pages/ProductPage'
import { RulesPage } from '@/pages/RulesPage'
import { TransformsPage } from '@/pages/TransformsPage'
import { ProposalsPage } from '@/pages/ProposalsPage'
import { MetricsPage } from '@/pages/MetricsPage'
import { EvalPage } from '@/pages/EvalPage'
import { MarketplacePage } from '@/pages/MarketplacePage'
import { MonkModePage } from '@/pages/MonkModePage'
import { PackStudioPage } from '@/pages/PackStudioPage'
import { JobTemplatesPage } from '@/pages/JobTemplatesPage'
import { OutcomePage } from '@/pages/OutcomePage'
import { ShipPage } from '@/pages/ShipPage'
import { StatusPage } from '@/pages/StatusPage'
import { PublicEvalPage } from '@/pages/PublicEvalPage'
import { SalesPage } from '@/pages/SalesPage'
import { PricingPage } from '@/pages/PricingPage'
import { RoiCalculatorPage } from '@/pages/RoiCalculatorPage'
import { ConnectorMatrixPage } from '@/pages/ConnectorMatrixPage'
import { BiEmbedPage } from '@/pages/BiEmbedPage'
import { LoadPage } from '@/pages/LoadPage'
import { ModelPage } from '@/pages/ModelPage'
import { PipesPage } from '@/pages/PipesPage'
import { ObservePage } from '@/pages/ObservePage'
import { PlatformHubPage } from '@/pages/PlatformHubPage'
import { StudioGridPage } from '@/pages/StudioGridPage'

function LegacyJobsRedirect() {
  const [params] = useSearchParams()
  const job = params.get('job')
  const tab = params.get('tab') || 'notebook'
  if (job) return <Navigate to={`/jobs/${job}/${tab}`} replace />
  return <JobsPage />
}

function LegacySourcesRedirect() {
  const [params] = useSearchParams()
  const view = params.get('view')
  const id = params.get('id')
  const connector = params.get('connector')
  if (view === 'catalog') return <Navigate to="/sources/new" replace />
  if (view === 'form') {
    return (
      <Navigate
        to={`/sources/new/${connector || 'postgresql'}`}
        replace
      />
    )
  }
  if (view === 'detail' && id) {
    return <Navigate to={`/sources/${id}`} replace />
  }
  return <SourcesPage />
}

function JobTabRedirect() {
  const { jobId } = useParams()
  return <Navigate to={`/jobs/${jobId}/notebook`} replace />
}

/**
 * App root — nested routing for Que workspace.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/verify" element={<AttestationVerifyPage />} />
            <Route path="/status" element={<StatusPage />} />
            <Route path="/sales" element={<SalesPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/roi" element={<RoiCalculatorPage />} />
            <Route path="/connectors" element={<ConnectorMatrixPage />} />
            <Route path="/eval/public" element={<PublicEvalPage />} />
            <Route path="/embed/:token" element={<BiEmbedPage />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Navigate to="/hub" replace />
                </RequireAuth>
              }
            />
            <Route
              path="/workspace"
              element={
                <RequireAuth>
                  <WorkspacePage />
                </RequireAuth>
              }
            />
            <Route
              path="/chat"
              element={
                <RequireAuth>
                  <ChatPage />
                </RequireAuth>
              }
            />
            <Route
              path="/agent"
              element={
                <RequireAuth>
                  <Navigate to="/chat?agent=1" replace />
                </RequireAuth>
              }
            />
            <Route
              path="/validation"
              element={
                <RequireAuth>
                  <ValidationSuitePage />
                </RequireAuth>
              }
            />
            <Route
              path="/drift-agent"
              element={
                <RequireAuth>
                  <DriftAgentPage />
                </RequireAuth>
              }
            />
            <Route
              path="/domains"
              element={
                <RequireAuth>
                  <Navigate to="/settings/domains" replace />
                </RequireAuth>
              }
            />
            <Route
              path="/catalog"
              element={
                <RequireAuth>
                  <CatalogPage />
                </RequireAuth>
              }
            />
            <Route
              path="/pipes"
              element={
                <RequireAuth>
                  <PipesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/observe"
              element={
                <RequireAuth>
                  <ObservePage />
                </RequireAuth>
              }
            />
            <Route
              path="/hub"
              element={
                <RequireAuth>
                  <PlatformHubPage />
                </RequireAuth>
              }
            />
            <Route
              path="/glossary"
              element={
                <RequireAuth>
                  <GlossaryPage />
                </RequireAuth>
              }
            />
            <Route
              path="/steward"
              element={
                <RequireAuth>
                  <StewardPage />
                </RequireAuth>
              }
            />
            <Route
              path="/managed"
              element={
                <RequireAuth>
                  <ManagedDatasetsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/plane"
              element={
                <RequireAuth>
                  <ManagedPlanePage />
                </RequireAuth>
              }
            />
            <Route
              path="/bi"
              element={
                <RequireAuth>
                  <BiChartsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/compliance"
              element={
                <RequireAuth>
                  <CompliancePage />
                </RequireAuth>
              }
            />
            <Route
              path="/product"
              element={
                <RequireAuth>
                  <ProductPage />
                </RequireAuth>
              }
            />
            <Route
              path="/rules"
              element={
                <RequireAuth>
                  <RulesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/transforms"
              element={
                <RequireAuth>
                  <TransformsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/proposals"
              element={
                <RequireAuth>
                  <ProposalsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/metrics"
              element={
                <RequireAuth>
                  <MetricsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/eval"
              element={
                <RequireAuth>
                  <EvalPage />
                </RequireAuth>
              }
            />
            <Route
              path="/marketplace"
              element={
                <RequireAuth>
                  <MarketplacePage />
                </RequireAuth>
              }
            />
            <Route
              path="/monk"
              element={
                <RequireAuth>
                  <MonkModePage />
                </RequireAuth>
              }
            />
            <Route
              path="/pack-studio"
              element={
                <RequireAuth>
                  <PackStudioPage />
                </RequireAuth>
              }
            />
            <Route
              path="/templates"
              element={
                <RequireAuth>
                  <JobTemplatesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/load"
              element={
                <RequireAuth>
                  <LoadPage />
                </RequireAuth>
              }
            />
            <Route
              path="/load/pipelines"
              element={
                <RequireAuth>
                  <Navigate to="/load?tab=pipelines" replace />
                </RequireAuth>
              }
            />
            <Route
              path="/load/runs"
              element={
                <RequireAuth>
                  <Navigate to="/load?tab=runs" replace />
                </RequireAuth>
              }
            />
            <Route
              path="/model"
              element={
                <RequireAuth>
                  <ModelPage />
                </RequireAuth>
              }
            />
            <Route
              path="/model/:modelId"
              element={
                <RequireAuth>
                  <ModelPage />
                </RequireAuth>
              }
            />
            <Route
              path="/studio"
              element={
                <RequireAuth>
                  <Navigate to="/studio/grid" replace />
                </RequireAuth>
              }
            />
            <Route
              path="/studio/grid"
              element={
                <RequireAuth>
                  <StudioGridPage />
                </RequireAuth>
              }
            />
            <Route
              path="/joins"
              element={
                <RequireAuth>
                  <JoinReviewPage />
                </RequireAuth>
              }
            />
            <Route
              path="/outcome"
              element={
                <RequireAuth>
                  <OutcomePage />
                </RequireAuth>
              }
            />
            <Route
              path="/ship"
              element={
                <RequireAuth>
                  <ShipPage />
                </RequireAuth>
              }
            />
            <Route
              path="/lineage"
              element={
                <RequireAuth>
                  <LineagePage />
                </RequireAuth>
              }
            />

            <Route
              path="/sources"
              element={
                <RequireAuth>
                  <SourcesLayout />
                </RequireAuth>
              }
            >
              <Route index element={<LegacySourcesRedirect />} />
              <Route path="new" element={<SourcesPage />} />
              <Route path="new/:connector" element={<SourcesPage />} />
              <Route path=":sourceId" element={<SourcesPage />} />
            </Route>

            <Route
              path="/jobs"
              element={
                <RequireAuth>
                  <JobsLayout />
                </RequireAuth>
              }
            >
              <Route index element={<LegacyJobsRedirect />} />
              <Route path=":jobId" element={<JobTabRedirect />} />
              <Route path=":jobId/:tab" element={<JobsPage />} />
            </Route>

            <Route
              path="/settings"
              element={
                <RequireAuth>
                  <SettingsLayout />
                </RequireAuth>
              }
            >
              <Route index element={<Navigate to="members" replace />} />
              <Route path="members" element={<MembersSettingsPage />} />
              <Route path="security" element={<SecuritySettingsPage />} />
              <Route path="enterprise" element={<EnterpriseSettingsPage />} />
              <Route path="bi-access" element={<BiAccessSettingsPage />} />
              <Route path="automation" element={<AutomationSettingsPage />} />
              <Route path="governance" element={<GovernanceSettingsPage />} />
              <Route path="team" element={<TeamSettingsPage />} />
              <Route path="domains" element={<DomainsSettingsPage />} />
              <Route path="billing" element={<BillingSettingsPage />} />
              <Route path="ai-policy" element={<AiPolicySettingsPage />} />
            </Route>

            <Route
              path="*"
              element={
                <RequireAuth>
                  <Navigate to="/workspace" replace />
                </RequireAuth>
              }
            />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
