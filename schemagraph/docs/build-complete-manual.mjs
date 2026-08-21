/**
 * Builds Que-Complete-Product-Manual.html (v3, ~50 print pages) then optionally PDF.
 * Usage: node docs/build-complete-manual.mjs
 *        node docs/build-complete-manual.mjs --pdf
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outHtml = join(__dirname, 'Que-Complete-Product-Manual.html')
const outPdf = join(__dirname, 'Que-Complete-Product-Manual.pdf')

const css = `
@page { size: A4; margin: 11mm 10mm; }
* { box-sizing: border-box; }
body {
  font-family: "Segoe UI", Calibri, system-ui, sans-serif;
  font-size: 9pt; line-height: 1.36; color: #1a1a1a;
  max-width: 900px; margin: 0 auto; padding: 12px 14px 40px;
}
h1 { font-size: 16pt; margin: 0 0 6px; letter-spacing: -0.02em; color: #1e293b; }
h2 {
  font-size: 11.5pt; margin: 0 0 8px; padding-bottom: 3px;
  border-bottom: 2px solid #0e7490; color: #0e4a5c; page-break-after: avoid;
}
h3 { font-size: 10pt; margin: 10px 0 4px; color: #155e75; page-break-after: avoid; }
h4 { font-size: 9.2pt; margin: 8px 0 3px; color: #0e7490; }
p, li { margin: 0 0 3px; }
ul, ol { margin: 0 0 7px; padding-left: 1.15em; }
.meta { color: #555; font-size: 8pt; margin-bottom: 8px; }
.cover {
  border: 2px solid #0e7490; padding: 18px 16px; margin-bottom: 12px;
  background: linear-gradient(165deg, #f0f9ff 0%, #e0f2fe 55%, #f8fafc 100%);
  page-break-after: always;
}
.cover .brand {
  font-size: 8.5pt; font-weight: 700; letter-spacing: 0.16em;
  text-transform: uppercase; color: #0369a1;
}
.toc { page-break-after: always; }
.toc a { color: #0f172a; text-decoration: none; }
.toc ol { columns: 2; column-gap: 16px; }
.toc li { break-inside: avoid; margin-bottom: 2px; font-size: 8pt; }
table {
  width: 100%; border-collapse: collapse; margin: 5px 0 9px;
  font-size: 7.6pt; page-break-inside: avoid;
}
th, td { border: 1px solid #bae6fd; padding: 3px 5px; text-align: left; vertical-align: top; }
th { background: #e0f2fe; font-weight: 600; }
code {
  font-family: Consolas, "Courier New", monospace; font-size: 7.2pt;
  background: #f1f5f9; padding: 1px 3px;
}
pre.flow {
  font-family: Consolas, monospace; font-size: 7pt; line-height: 1.28;
  background: #0f172a; color: #e2e8f0; padding: 9px 11px; border-radius: 6px;
  white-space: pre-wrap; page-break-inside: avoid;
}
.ok { border-left: 3px solid #059669; background: #ecfdf5; padding: 5px 8px; margin: 4px 0; font-size: 8pt; }
.note { border-left: 3px solid #0284c7; background: #f0f9ff; padding: 5px 8px; margin: 4px 0; font-size: 8pt; }
.warn { border-left: 3px solid #d97706; background: #fffbeb; padding: 5px 8px; margin: 4px 0; font-size: 8pt; }
.out { border-left: 3px solid #dc2626; background: #fef2f2; padding: 5px 8px; margin: 4px 0; font-size: 8pt; }
.card {
  border: 1px solid #bae6fd; padding: 8px 10px; margin: 6px 0 10px;
  background: #fff; page-break-inside: avoid;
}
.card > h3, .card > h4 { margin-top: 0; }
.pb { page-break-before: always; }
.footer-note { margin-top: 16px; font-size: 7pt; color: #64748b; }
.ctrl { font-weight: 600; color: #0e7490; }
.route { font-family: Consolas, monospace; font-size: 7.4pt; color: #0369a1; }
.steps { counter-reset: step; list-style: none; padding-left: 0; }
.steps li {
  counter-increment: step; margin: 0 0 4px; padding: 4px 7px 4px 30px;
  position: relative; background: #f8fafc; border: 1px solid #e2e8f0;
  page-break-inside: avoid;
}
.steps li::before {
  content: counter(step); position: absolute; left: 5px; top: 4px;
  width: 17px; height: 17px; border-radius: 50%; background: #0e7490; color: #fff;
  font-size: 7pt; font-weight: 700; text-align: center; line-height: 17px;
}
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.tiny { font-size: 7.4pt; color: #475569; }
@media print {
  body { max-width: none; padding: 0; }
  a { color: inherit; text-decoration: none; }
}
`

function sec(id, title, body, { pageBreak = true } = {}) {
  return `${pageBreak ? '<div class="pb"></div>' : ''}<h2 id="${id}">${title}</h2>\n${body}\n`
}

const sections = []

sections.push(`
<div class="cover">
  <div class="brand">Que · SchemaGraph · Official Product Manual</div>
  <h1>Complete Product Manual — Every Surface, Workflow &amp; Control</h1>
  <p class="meta">
    Product: <strong>Que</strong> — Cursor for data teams · schema-first · HITL · attested delivery<br/>
    Local UI: <code>http://localhost:5174</code> · API: <code>http://localhost:8787</code><br/>
    Repository: <code>github.com/Shabrezadilabz/QUE</code> · Manual version: <strong>3.1</strong> · August 2026<br/>
    Audience: data engineers, analytics engineers, stewards, admins, pilot leads, CEOs reviewing HITL trust
  </p>
  <p class="ok"><strong>What this manual is:</strong> a full operating handbook for the current product IA
  (Assistant-unified chat + agent, Settings Domains, Jobs Results for managed/validation, Report Studio, Review inbox).
  Target length ≈ <strong>50 A4 pages</strong> when printed.</p>
  <p class="warn"><strong>Boundaries:</strong> Que is not your warehouse, not Tableau, and not SOC 2 Type II by itself.
  AI never receives the full lake — only metadata plus scrubbed pinned samples (typically 5–10 rows).</p>
  <p class="note"><strong>How to use:</strong> Print to PDF (A4) or open HTML side-by-side with the app.
  Follow Scenario chapters for day-1 production; use page chapters as a control encyclopedia.</p>
</div>
`)

sections.push(`
<nav class="toc">
  <h2>Table of contents</h2>
  <ol>
    <li><a href="#start">1. Quick start &amp; environment</a></li>
    <li><a href="#dna">2. Product DNA &amp; Offer A / B</a></li>
    <li><a href="#ia">3. Information architecture &amp; navigation</a></li>
    <li><a href="#roles">4. Roles &amp; permissions</a></li>
    <li><a href="#arch">5. Architecture &amp; master flows</a></li>
    <li><a href="#privacy">6. Privacy, samples &amp; AI policy</a></li>
    <li><a href="#hitl">7. HITL trust model (Promote tiers)</a></li>
    <li><a href="#scenario-a">8. Scenario A — Offer A warehouse stitch</a></li>
    <li><a href="#scenario-b">9. Scenario B — Offer B managed + BI</a></li>
    <li><a href="#scenario-c">10. Scenario C — Team Cursor loop</a></li>
    <li><a href="#scenario-d">11. Scenario D — CEO Outcome → Ship</a></li>
    <li><a href="#scenario-e">12. Scenario E — Industry template playbook</a></li>
    <li><a href="#login">13. Login &amp; public pages</a></li>
    <li><a href="#assistant">14. Assistant (/chat)</a></li>
    <li><a href="#agent">15. Stitch Agent (in Assistant)</a></li>
    <li><a href="#workspace">16. Workspace canvas</a></li>
    <li><a href="#sources">17. Sources &amp; connectors</a></li>
    <li><a href="#joins">18. Joins (HITL review)</a></li>
    <li><a href="#jobs">19. Jobs (notebook / results / deploy)</a></li>
    <li><a href="#review">20. Review (proposals + transforms)</a></li>
    <li><a href="#bi">21. Report Studio</a></li>
    <li><a href="#ship">22. Ship</a></li>
    <li><a href="#marketplace">23. Marketplace</a></li>
    <li><a href="#eval">24. Eval</a></li>
    <li><a href="#lineage">25. Lineage</a></li>
    <li><a href="#drift">26. Drift agent</a></li>
    <li><a href="#governance-wip">27. Catalog / Glossary / Steward (WIP)</a></li>
    <li><a href="#compliance">28. Compliance</a></li>
    <li><a href="#product">29. Product brief page</a></li>
    <li><a href="#settings">30. Settings (all tabs)</a></li>
    <li><a href="#domains">31. Domains (Settings)</a></li>
    <li><a href="#redirects">32. Redirects &amp; legacy routes</a></li>
    <li><a href="#ops">33. Ops, status, digests</a></li>
    <li><a href="#upskill">34. Team operating model</a></li>
    <li><a href="#trouble">35. Troubleshooting</a></li>
    <li><a href="#claims">36. Claims you can / cannot make</a></li>
    <li><a href="#controls">37. Deep control inventory</a></li>
    <li><a href="#glossary">38. Glossary of Que terms</a></li>
    <li><a href="#api">39. API quick reference</a></li>
    <li><a href="#checklist">40. Production go-live checklist</a></li>
  </ol>
</nav>
`)

sections.push(sec('start', '1. Quick start &amp; environment', `
<table>
  <tr><th>Piece</th><th>Command / URL</th></tr>
  <tr><td>Postgres</td><td>Docker service (typical user/db/pass <code>stitch</code>) on <code>:5432</code></td></tr>
  <tr><td>Migrate</td><td><code>cd api &amp;&amp; npm run migrate</code></td></tr>
  <tr><td>Seed demo owner</td><td><code>npm run seed:demo</code> → <code>demo@que.local</code> / <code>que-demo-2026</code></td></tr>
  <tr><td>API</td><td><code>cd api &amp;&amp; npm run dev</code> → <code>http://localhost:8787</code></td></tr>
  <tr><td>UI</td><td><code>npm run dev</code> (repo root / schemagraph) → <code>http://localhost:5174</code></td></tr>
  <tr><td>Public health</td><td><code>GET /health</code> · UI <span class="route">/status</span> · <code>GET /metrics?format=prom</code></td></tr>
</table>
<ol class="steps">
  <li>Start Postgres, run migrations, seed demo user.</li>
  <li>Start API then UI; open <span class="route">/login</span>.</li>
  <li>Sign in as demo owner; confirm workspace switcher shows a workspace.</li>
  <li>Open <span class="route">/sources</span> → connect at least two systems (or fixtures).</li>
  <li>Sync schema → open <span class="route">/workspace</span> → confirm tables on canvas.</li>
  <li>Run join inference → <span class="route">/joins</span> Promote → draft a job on <span class="route">/jobs</span>.</li>
  <li>Use <span class="route">/chat</span> for schema Q&amp;A, <code>/outcome</code>, or <code>/agent</code>.</li>
</ol>
<div class="note">Legacy demo accounts may exist (e.g. <code>owner@stitch.local</code>). Prefer the Que demo seed for client walkthroughs.</div>
`, { pageBreak: false }))

sections.push(sec('dna', '2. Product DNA &amp; Offer A / B', `
<table>
  <tr><th>Rule</th><th>Production meaning</th></tr>
  <tr><td>Schema-first</td><td>Connectors introspect structure; Que does not ETL your lake into Que as SoR.</td></tr>
  <tr><td>Pinned samples 5–10</td><td>Scrubbed, frozen until re-pin; used for overlap evidence for joins.</td></tr>
  <tr><td>Human Promote</td><td>Suggested joins are not production truth until Promote (HITL).</td></tr>
  <tr><td>Attested delivery</td><td>Jobs/exports carry evidence; warehouse or managed plane holds rows.</td></tr>
  <tr><td>AI denied lake</td><td>Chat/agent see metadata + scrubbed grids only — never full managed payloads.</td></tr>
</table>
<div class="grid2">
  <div class="card"><h3>Offer A — Bring your warehouse</h3>
  <p>Snowflake / Databricks / Postgres remain system of record. Que proposes joins, drafts jobs, digests external failures, exports / triggers dbt PRs.</p>
  <p><strong>Choose when:</strong> you already have a warehouse and want a control-plane HITL layer.</p></div>
  <div class="card"><h3>Offer B — Que managed plane</h3>
  <p>Land certified datasets from jobs into Que (quotas + retention). Certify on Jobs → Results → build Report Studio → Ship / embed.</p>
  <p><strong>Choose when:</strong> Excel/SQL teams need attested DA without a full warehouse yet.</p></div>
</div>
`))

sections.push(sec('ia', '3. Information architecture &amp; navigation', `
<p>Que uses a dark IDE shell: primary top nav + collapsible Tools sidebar + status bar.</p>
<h3>Primary nav (top)</h3>
<table>
  <tr><th>Label</th><th>Route</th><th>Job</th></tr>
  <tr><td>Assistant</td><td><span class="route">/chat</span></td><td>Schema Q&amp;A, Outcome plans, Stitch Agent HITL</td></tr>
  <tr><td>Workspace</td><td><span class="route">/workspace</span></td><td>Schema graph canvas, edit joins, inspect tables</td></tr>
  <tr><td>Sources</td><td><span class="route">/sources</span></td><td>Connectors, sync, source detail</td></tr>
  <tr><td>Joins</td><td><span class="route">/joins</span></td><td>HITL Promote / Reject / edit mappings</td></tr>
  <tr><td>Ship</td><td><span class="route">/ship</span></td><td>Delivery drafts toward BI / stakeholders</td></tr>
</table>
<h3>Tools sidebar</h3>
<table>
  <tr><th>Label</th><th>Route</th><th>Notes</th></tr>
  <tr><td>Jobs</td><td><span class="route">/jobs</span></td><td>Notebook · Results (managed + validation) · Deploy</td></tr>
  <tr><td>Review</td><td><span class="route">/proposals</span></td><td>Proposals + transforms inbox</td></tr>
  <tr><td>Report Studio</td><td><span class="route">/bi</span></td><td>Certified BI canvas (metrics unified here)</td></tr>
  <tr><td>Marketplace</td><td><span class="route">/marketplace</span></td><td>Industry template packs</td></tr>
  <tr><td>Eval</td><td><span class="route">/eval</span></td><td>Golden-set / quality scoreboard</td></tr>
  <tr><td>Lineage</td><td><span class="route">/lineage</span></td><td>Column / asset lineage lite</td></tr>
  <tr><td>Drift</td><td><span class="route">/drift-agent</span></td><td>Schema-change remap proposals</td></tr>
  <tr><td>Catalog / Glossary / Steward</td><td>respective routes</td><td><strong>WIP glass overlay</strong> — preview only</td></tr>
  <tr><td>Compliance</td><td><span class="route">/compliance</span></td><td>Evidence / digests / ops checklist</td></tr>
  <tr><td>Product</td><td><span class="route">/product</span></td><td>Client positioning brief</td></tr>
  <tr><td>Settings</td><td><span class="route">/settings</span></td><td>Members → Domains → AI &amp; Policy, etc.</td></tr>
</table>
<div class="warn">Agent and Domains are <em>not</em> separate Tools items anymore — use Assistant (<code>/agent</code>) and Settings → Domains.</div>
`))

sections.push(sec('roles', '4. Roles &amp; permissions', `
<table>
  <tr><th>Role</th><th>Can</th><th>Cannot (typical)</th></tr>
  <tr><td class="ctrl">Viewer</td><td>Browse schema, joins, lineage, BI preview</td><td>Sync, Promote, settings writes, mint embeds</td></tr>
  <tr><td class="ctrl">Member</td><td>Sync, edit joins, Promote/Reject, jobs, chat write, comments</td><td>Most admin security / billing / enterprise</td></tr>
  <tr><td class="ctrl">Admin</td><td>Members, security, enterprise, automation, delete domains, golden schedule</td><td>Owner-only break-glass / destructive ops as configured</td></tr>
  <tr><td class="ctrl">Owner</td><td>Full workspace + billing + break-glass</td><td>—</td></tr>
</table>
<p>Team OS settings can raise minimum role for Propose vs Promote. Presence chips show active teammates (HTTP heartbeat — not live cursors).</p>
`))

sections.push(sec('arch', '5. Architecture &amp; master flows', `
<pre class="flow">Sources (connectors)
    │ sync schema + optional pin 5–10 scrubbed rows
    ▼
Workspace canvas  ←→  Joins HITL (Promote / Reject)
    │
    ├─► Assistant: Q&amp;A · /outcome · /agent checkpoints
    ├─► Review: proposals / transform diffs
    └─► Jobs: notebook → dry-run / live → Results
              ├─ Offer A: export / dbt / warehouse status
              └─ Offer B: certify managed → Report Studio → Ship / embed

Drift agent ← schema change → remap proposals → Accept/Dismiss
Eval ← golden pairs → recall scoreboard (not row preview)
Domains (Settings) ← ownership boundaries for sources / globs</pre>
<p class="tiny">Rules pack still learns from Promote/templates in the backend and injects into chat/transforms even though the Rules UI redirects to Assistant.</p>
`))

sections.push(sec('privacy', '6. Privacy, samples &amp; AI policy', `
<ul>
  <li><strong>Schema pack:</strong> table/column names, types, keys, relationship suggestions.</li>
  <li><strong>Pinned samples:</strong> typically 5–10 scrubbed rows per table; frozen until human re-pins.</li>
  <li><strong>Verify rows in chat:</strong> shows scrubbed samples only — never full managed dataset payloads.</li>
  <li><strong>Settings → AI &amp; Policy:</strong> toggles for pinned samples, Stitch Agent enablement, auto-promote low-risk (default off), BYOK keys, GitHub/dbt branches, execution plane (customer vs managed).</li>
  <li><strong>Attestation:</strong> exports and job artifacts can carry fingerprints verifiable via <span class="route">/verify</span>.</li>
</ul>
<div class="out">Never paste production secrets into chat. Use Settings secret slots / BYOK for model keys.</div>
`))

sections.push(sec('hitl', '7. HITL trust model (Promote tiers)', `
<table>
  <tr><th>Tier</th><th>Meaning</th><th>Typical action</th></tr>
  <tr><td>Green</td><td>High overlap / strong name evidence</td><td>Still Promote for audit unless auto-promote policy ON (default off)</td></tr>
  <tr><td>Yellow</td><td>Plausible but ambiguous</td><td>Edit mapping, discuss in thread, then Promote or Reject</td></tr>
  <tr><td>Red</td><td>Weak / conflicting</td><td>Reject or mark incorrect join on canvas with confirm</td></tr>
</table>
<ol class="steps">
  <li>Infer joins (Assistant, Agent, Job tools, or Joins page).</li>
  <li>Open Join Review; inspect left/right columns and sample overlap.</li>
  <li>Edit if needed; add comments for DA/DE debate.</li>
  <li>Promote (truth) or Reject (discard suggestion).</li>
  <li>Downstream jobs / Outcome / Agent continue only after HITL gates clear.</li>
</ol>
`))

// Scenarios
sections.push(sec('scenario-a', '8. Scenario A — Offer A warehouse stitch (production day)', `
<ol class="steps">
  <li>Admin connects Snowflake/Databricks/Postgres on <span class="route">/sources</span>; Sync.</li>
  <li>Pin scrubbed samples on critical tables (5–10).</li>
  <li>Infer joins; Promote Green/Yellow after review on <span class="route">/joins</span>.</li>
  <li>Settings → AI &amp; Policy: execution plane <span class="ctrl">customer</span> (Offer A).</li>
  <li>Draft stitch job (Assistant <code>/job</code> or Jobs → New); dry-run.</li>
  <li>Freeze contract; export SQL/dbt or open PR; warehouse CI runs.</li>
  <li>External status / digests surface on Compliance and Assistant strips.</li>
</ol>
<div class="ok"><strong>Success:</strong> Promoted joins feed job contract; warehouse remains SoR; Que holds decisions + evidence.</div>
`))

sections.push(sec('scenario-b', '9. Scenario B — Offer B managed plane + certified BI', `
<ol class="steps">
  <li>Connect Excel/CSV/Postgres fixtures; sync + pin samples.</li>
  <li>Promote joins needed for the stitch notebook.</li>
  <li>Run job → open <span class="route">/jobs/:id/results</span>.</li>
  <li>Use Managed layer: land/preview scrubbed result → <span class="ctrl">Certify</span>.</li>
  <li>Open Report Studio (<span class="route">/bi</span>) → Scaffold from managed / chat <code>/bi</code>.</li>
  <li>Run visuals, certify report tiles, Ship or mint embed token.</li>
</ol>
<div class="note">Standalone <span class="route">/managed</span> redirects to Jobs — managed UX lives on Results.</div>
`))

sections.push(sec('scenario-c', '10. Scenario C — Team Cursor loop (daily DE/DA)', `
<ol class="steps">
  <li>Org conventions live in backend rules (learned from Promote / packs).</li>
  <li>DE opens Assistant with <code>@tables</code> or <code>/agent</code> → draft transform/job.</li>
  <li>Diff lands in Review (<span class="route">/proposals</span>); peer Approve/Reject.</li>
  <li>Promote joins when needed; comments capture debate.</li>
  <li>Eval golden pairs on schedule; watch recall before enabling auto-promote.</li>
  <li>Marketplace install for domain bootstrap when starting a new product area.</li>
</ol>
`))

sections.push(sec('scenario-d', '11. Scenario D — CEO Outcome → Ship', `
<ol class="steps">
  <li>In Assistant type <code>/outcome I want revenue by region…</code>.</li>
  <li>Review Outcome plan card steps (sources → joins → metrics → chart).</li>
  <li>Use <span class="ctrl">Infer joins</span> / <span class="ctrl">Run next</span>; Promote Yellow/Red on Joins.</li>
  <li>Optional: Approve/Advance linked agent from the Outcome card.</li>
  <li><span class="ctrl">Ship to BI</span> creates a Ship draft; refine on <span class="route">/ship</span>.</li>
  <li>Or <code>/bi</code> to scaffold Report Studio after managed certify.</li>
</ol>
`))

sections.push(sec('scenario-e', '12. Scenario E — Industry template playbook', `
<ol class="steps">
  <li>Open Marketplace or Eval template install.</li>
  <li>Apply pack: schema match, seed rules, infer joins (HITL), draft job, Outcome, Ship draft, optional BI scaffold.</li>
  <li>Review Open links in Marketplace result — does <strong>not</strong> auto-Promote.</li>
  <li>Human Promotes joins; completes job / BI as needed.</li>
</ol>
<div class="warn">Templates accelerate setup; trust gates remain human.</div>
`))

// Public
sections.push(sec('login', '13. Login &amp; public pages', `
<table>
  <tr><th>Route</th><th>Auth</th><th>Purpose</th></tr>
  <tr><td><span class="route">/login</span></td><td>Public</td><td>Email/password (SSO when configured)</td></tr>
  <tr><td><span class="route">/auth/callback</span></td><td>Public</td><td>OAuth/SSO callback → workspace</td></tr>
  <tr><td><span class="route">/status</span></td><td>Public</td><td>API ok, DB latency, inventory counts</td></tr>
  <tr><td><span class="route">/sales</span></td><td>Public</td><td>Honest Offer A/B positioning</td></tr>
  <tr><td><span class="route">/verify</span></td><td>Public</td><td>Attestation fingerprint verification</td></tr>
  <tr><td><span class="route">/embed/:token</span></td><td>Token</td><td>Embedded certified BI view</td></tr>
</table>
<p>Status page uses fixed rem widths (avoid Tailwind <code>max-w-xl</code> — custom spacing tokens collapse those utilities to 16–40px).</p>
`))

// Assistant
sections.push(sec('assistant', '14. Assistant (/chat) — full functionality', `
<p>Single thread for schema Q&amp;A, Outcome plans, Stitch Agent, and BI scaffold intents.</p>
<h3>Composer &amp; context</h3>
<ul>
  <li><strong>@mentions:</strong> <code>@table</code> / <code>@table.column</code> ground answers.</li>
  <li><strong>Skills:</strong> type <code>/</code> or open Skills chip.</li>
  <li><strong>Attachments / voice:</strong> when enabled in UI, attach text snippets or dictate.</li>
  <li><strong>Sidebar:</strong> schema tables, expand columns, insert mentions; roadmap / graph link.</li>
  <li><strong>Feedback:</strong> +1 / −1 on assistant messages.</li>
</ul>
<h3>Slash skills</h3>
<table>
  <tr><th>Skill</th><th>Purpose</th></tr>
  <tr><td><code>/list</code></td><td>Inventory tables</td></tr>
  <tr><td><code>/describe</code></td><td>Columns/keys for focused table</td></tr>
  <tr><td><code>/joins</code> · <code>/suggested</code></td><td>Explain or list suggested joins</td></tr>
  <tr><td><code>/sql</code></td><td>Schema-only SELECT/JOIN draft</td></tr>
  <tr><td><code>/job</code></td><td>Draft stitch job artifact</td></tr>
  <tr><td><code>/diff</code></td><td>Schema summary counts</td></tr>
  <tr><td><code>/privacy</code></td><td>Explain schema-only policy</td></tr>
  <tr><td><code>/outcome</code></td><td>CEO Outcome plan card</td></tr>
  <tr><td><code>/agent</code></td><td>Stitch Agent HITL pipeline</td></tr>
  <tr><td><code>/bi</code></td><td>Scaffold Report Studio</td></tr>
  <tr><td><code>/help</code></td><td>Skills help</td></tr>
</table>
<h3>Outcome follow-ups (type in chat)</h3>
<p><code>run next</code> · <code>infer joins</code> · <code>ship</code> · <code>approve</code> / <code>advance</code> (outcome-linked agent).</p>
<h3>Verify rows</h3>
<p>Shows scrubbed sample grids only (max 5–10) — never lake dumps.</p>
`))

sections.push(sec('agent', '15. Stitch Agent (inside Assistant)', `
<p>Former standalone Agent page is merged into chat. Enable via Settings → AI &amp; Policy → <span class="ctrl">Enable Stitch Agent</span>.</p>
<ol class="steps">
  <li>Type <code>/agent Build trusted customer 360…</code> (or Skills → Stitch agent).</li>
  <li>Inline <strong>Agent plan card</strong> shows status, steps, open checkpoint, tool transcript.</li>
  <li>Approve plan → tools run (list sources, infer joins, draft job…).</li>
  <li>On promote_joins checkpoint: open Join Review, Promote, then <span class="ctrl">Continue after Promote</span>.</li>
  <li>Open drafted job from card when <code>jobId</code> appears.</li>
</ol>
<p>Chat follow-ups: <code>approve</code> · <code>reject</code> · <code>continue after promote</code> · <code>refresh</code>.</p>
<p>Deep link: <span class="route">/agent</span> → <span class="route">/chat?agent=1</span> (resumes open session).</p>
<div class="warn">Auto-promote remains off unless policy explicitly enabled after Eval gates.</div>
`))

sections.push(sec('workspace', '16. Workspace canvas', `
<ul>
  <li>Visual schema graph: tables as nodes, joins as edges.</li>
  <li>Select table → inspector (columns, keys, sample blurb).</li>
  <li>Edit join edges; incorrect-join confirm dialog before saving bad mappings.</li>
  <li>Minimap / canvas tools; presence of suggested vs promoted relationships.</li>
  <li>Entry point after sync; pairs with Joins for HITL.</li>
</ul>
<div class="note">Use Workspace for structural understanding; use Joins for formal Promote decisions.</div>
`))

sections.push(sec('sources', '17. Sources &amp; connectors', `
<p>Routes: <span class="route">/sources/new</span>, <span class="route">/sources/new/:connector</span>, <span class="route">/sources/:sourceId</span>.</p>
<h3>Catalog categories</h3>
<p>Databases · Warehouses · Files · CRM · Custom.</p>
<h3>Connectors (current catalog)</h3>
<table>
  <tr><th>Type</th><th>Typical use</th></tr>
  <tr><td>PostgreSQL</td><td>OLTP / analytics Postgres</td></tr>
  <tr><td>MongoDB</td><td>Document collections → schema inference</td></tr>
  <tr><td>Snowflake</td><td>Offer A warehouse</td></tr>
  <tr><td>Databricks</td><td>Offer A lakehouse</td></tr>
  <tr><td>Excel / CSV</td><td>File-based Offer B paths</td></tr>
  <tr><td>BigQuery</td><td>GCP warehouse</td></tr>
  <tr><td>Salesforce</td><td>CRM objects</td></tr>
</table>
<ol class="steps">
  <li>Pick connector → fill host/creds or fixtures path.</li>
  <li>Test connection → Save → Sync schema.</li>
  <li>Pin scrubbed samples on tables used for join inference.</li>
  <li>Re-sync after upstream DDL; watch Drift for remap proposals.</li>
</ol>
`))

sections.push(sec('joins', '18. Joins (HITL review)', `
<ul>
  <li>Inbox of suggested relationships with confidence / overlap.</li>
  <li>Edit left/right columns and cardinality/direction.</li>
  <li><span class="ctrl">Promote</span> accepts into contract; <span class="ctrl">Reject</span> discards.</li>
  <li>Threads/comments for DE↔DA debate.</li>
  <li>Incorrect join from canvas requires explicit confirm.</li>
</ul>
<p>AI join quality depends on sample overlap — pin samples before trusting suggestions.</p>
`))

sections.push(sec('jobs', '19. Jobs — notebook, results, deploy', `
<p>List monitor + focused views: <span class="route">/jobs/:jobId/notebook</span> · <code>/results</code> · <code>/deploy</code>.</p>
<h3>Notebook</h3>
<ul>
  <li>Markdown + SQL cells; save; dirty-state guards.</li>
  <li>Dry-run (capped) vs live (bounded).</li>
  <li>Templates panel; create from Assistant drafts.</li>
</ul>
<h3>Results</h3>
<ul>
  <li>Run output / live results.</li>
  <li><strong>Managed data layer:</strong> preview scrubbed → Certify (Offer B).</li>
  <li><strong>Validation layer:</strong> generate/run suite checks (former /validation page).</li>
</ul>
<h3>Deploy</h3>
<ul>
  <li>Export JSON / SQL / dbt; open dbt PR when GitHub configured.</li>
  <li>Schedules / private runner / orchestrator hooks (also Settings → Automation).</li>
  <li>Contract freeze + attestation evidence.</li>
</ul>
`))

sections.push(sec('review', '20. Review — proposals &amp; transforms', `
<p><span class="route">/proposals</span> is the unified Review inbox. <span class="route">/transforms</span> redirects here.</p>
<ul>
  <li>List open diffs (joins, SQL, transforms, agent drafts).</li>
  <li>Select item → right panel: who, nature, query, referred tables.</li>
  <li>Approve / Reject; side-by-side diff when available.</li>
  <li>Link to Stitch Agent via <span class="route">/chat?agent=1</span>.</li>
</ul>
`))

sections.push(sec('bi', '21. Report Studio (/bi)', `
<p>Power BI–like studio: ribbon, fields, multi-tile canvas, filters, visuals. <span class="route">/metrics</span> → <span class="route">/bi?focus=data</span>.</p>
<ol class="steps">
  <li>Certify a managed dataset from Jobs → Results (Offer B) or connect semantic sources.</li>
  <li>Scaffold from managed or chat <code>/bi</code> / “build report…”.</li>
  <li>Add KPI/card/bar/line/pie/table tiles; bind fields; Run all.</li>
  <li>Certify visuals; Ship or embed.</li>
</ol>
<div class="note">Schema-first preview uses certified managed data only — not the raw lake.</div>
`))

sections.push(sec('ship', '22. Ship', `
<ul>
  <li>Delivery drafts created from Outcome <span class="ctrl">Ship to BI</span> or manual Ship flows.</li>
  <li>Title, chart hint, outcome linkage, stakeholder-ready packaging.</li>
  <li>Pairs with Report Studio embeds for Offer B demos.</li>
</ul>
`))

sections.push(sec('marketplace', '23. Marketplace', `
<ul>
  <li>Browse industry packs.</li>
  <li>Apply = end-to-end playbook install (schema match, rules seed, join infer HITL, job, Outcome, Ship, optional BI).</li>
  <li>Does not auto-Promote.</li>
  <li>Open links jump into the created artifacts.</li>
</ul>
`))

sections.push(sec('eval', '24. Eval', `
<ul>
  <li>Quality / Green eligibility scoreboard — not a row preview tool.</li>
  <li>Configure golden pairs JSON; schedule; Run now.</li>
  <li>Watch recall before enabling auto-promote low-risk joins.</li>
  <li>May also surface template install entry points.</li>
</ul>
`))

sections.push(sec('lineage', '25. Lineage', `
<ul>
  <li>Column / pipeline lineage lite across catalogued assets and job outputs.</li>
  <li>Use before Promote or after Drift to see blast radius.</li>
</ul>
`))

sections.push(sec('drift', '26. Drift agent', `
<ul>
  <li>Schema change → impact → suggested remap / re-freeze.</li>
  <li>Accept / Dismiss remain human trust gates.</li>
  <li>Distinct from Stitch Agent (which lives in Assistant).</li>
  <li>Digests can notify Slack/Teams via Team OS settings.</li>
</ul>
`))

sections.push(sec('governance-wip', '27. Catalog / Glossary / Steward (work in progress)', `
<p>These Phase-4 surfaces show a frosted <strong>Work in progress</strong> overlay. Navigation remains; body interaction is blocked.</p>
<table>
  <tr><th>Page</th><th>Intended future job</th><th>Use today instead</th></tr>
  <tr><td>Catalog</td><td>Dashboards/metrics/pipelines as assets</td><td>Jobs, Lineage, Report Studio</td></tr>
  <tr><td>Glossary</td><td>Business terms ↔ tables/columns</td><td>Assistant + future steward tickets</td></tr>
  <tr><td>Steward</td><td>Certify/expire queues, policy packs, tickets</td><td>Review, Jobs Results, Compliance</td></tr>
</table>
`))

sections.push(sec('compliance', '28. Compliance', `
<ul>
  <li>Evidence packs, digests, ops checklist for pilot/customer reviews.</li>
  <li>Build digest for Offer A failure summaries.</li>
  <li>Pairs with Settings → Governance attestations / signed artifacts / audit log.</li>
</ul>
`))

sections.push(sec('product', '29. Product brief page', `
<p><span class="route">/product</span> — honest client positioning (Offer A/B, HITL, schema-only). Use in demos; not a full marketing site.</p>
`))

sections.push(sec('settings', '30. Settings — every tab', `
<table>
  <tr><th>Tab</th><th>Route</th><th>Contents</th></tr>
  <tr><td>Members</td><td><span class="route">/settings/members</span></td><td>Roles, invites, remove members</td></tr>
  <tr><td>Security</td><td><span class="route">/settings/security</span></td><td>SSO status, API keys summary, sessions</td></tr>
  <tr><td>Enterprise</td><td><span class="route">/settings/enterprise</span></td><td>SCIM, CMK, SIEM, SOC2 pack, break-glass (admin)</td></tr>
  <tr><td>Automation</td><td><span class="route">/settings/automation</span></td><td>Scheduled sync/jobs, orchestrator, private runner</td></tr>
  <tr><td>Governance</td><td><span class="route">/settings/governance</span></td><td>Drift alerts, attestations, signed artifacts, audit</td></tr>
  <tr><td>Team OS</td><td><span class="route">/settings/team</span></td><td>Propose vs Promote min roles, Slack/Teams digests</td></tr>
  <tr><td>Domains</td><td><span class="route">/settings/domains</span></td><td>Data products, stewards, sources, table globs</td></tr>
  <tr><td>Billing</td><td><span class="route">/settings/billing</span></td><td>Seats, checkout, usage (admin)</td></tr>
  <tr><td>AI &amp; Policy</td><td><span class="route">/settings/ai-policy</span></td><td>Flags, BYOK, GitHub/dbt, Stitch Agent, samples</td></tr>
</table>
`))

sections.push(sec('domains', '31. Domains (Settings) — full workflow', `
<ol class="steps">
  <li>Open Settings → Domains (or <span class="route">/domains</span> redirect).</li>
  <li>Seed Orders / Finance / Growth or create custom domain.</li>
  <li>Assign steward (workspace member), link sources, set table globs.</li>
  <li>Save; use stats for unscoped sources coverage.</li>
  <li>Jump to Joins / Jobs / Assistant for scoped work.</li>
  <li>Admin can delete domains; updates audited.</li>
</ol>
<p>Active domain preference may be stored in localStorage per workspace for Team OS continuity.</p>
`))

sections.push(sec('redirects', '32. Redirects &amp; legacy routes', `
<table>
  <tr><th>Old / alias</th><th>Goes to</th></tr>
  <tr><td><span class="route">/agent</span></td><td><span class="route">/chat?agent=1</span></td></tr>
  <tr><td><span class="route">/domains</span></td><td><span class="route">/settings/domains</span></td></tr>
  <tr><td><span class="route">/outcome</span></td><td>Assistant (outcome intent)</td></tr>
  <tr><td><span class="route">/metrics</span></td><td><span class="route">/bi?focus=data</span></td></tr>
  <tr><td><span class="route">/managed</span></td><td><span class="route">/jobs</span></td></tr>
  <tr><td><span class="route">/validation</span></td><td>Jobs (Results)</td></tr>
  <tr><td><span class="route">/transforms</span></td><td><span class="route">/proposals</span></td></tr>
  <tr><td><span class="route">/rules</span></td><td><span class="route">/chat</span></td></tr>
</table>
`))

sections.push(sec('ops', '33. Ops, status, digests', `
<ul>
  <li>Public <span class="route">/status</span>: API, DB latency, workspaces/connections/jobs/managed counts.</li>
  <li>Prometheus: <code>GET /metrics?format=prom</code>.</li>
  <li>Team OS digests: drift + join review notifications.</li>
  <li>Compliance digests for Offer A external failures.</li>
  <li>Enterprise break-glass for emergency access (owner).</li>
</ul>
`))

sections.push(sec('upskill', '34. Team operating model &amp; upskilling', `
<table>
  <tr><th>Role</th><th>Weekly habit</th></tr>
  <tr><td>DE</td><td>Sync, canvas edits, job notebooks, Review diffs, Agent plans</td></tr>
  <tr><td>DA</td><td>Join threads, Outcome plans, Ship, Report Studio</td></tr>
  <tr><td>Steward/Admin</td><td>Domains ownership, digests, Eval recall, AI policy</td></tr>
  <tr><td>CEO/Pilot lead</td><td>Outcome → Ship demos; read Compliance evidence</td></tr>
</table>
<p>Train on HITL first; AI second. Never skip Promote for Yellow/Red in production pilots.</p>
`))

sections.push(sec('trouble', '35. Troubleshooting cheat sheet', `
<table>
  <tr><th>Symptom</th><th>Check</th></tr>
  <tr><td>Chat answers empty schema</td><td>Sync sources; reindex AI; confirm workspace</td></tr>
  <tr><td>Join suggestions weak</td><td>Pin 5–10 samples; check name overlap</td></tr>
  <tr><td>Agent disabled</td><td>Settings → AI &amp; Policy → Enable Stitch Agent</td></tr>
  <tr><td>BI scaffold fails</td><td>Certify managed on Jobs → Results first</td></tr>
  <tr><td>UI thin vertical strip</td><td>Avoid <code>max-w-md/xl</code> with custom spacing tokens — use rem widths</td></tr>
  <tr><td>Redirect loops</td><td>See §32 legacy map</td></tr>
  <tr><td>Status page blank</td><td>API up; open <code>GET /status</code></td></tr>
</table>
`))

sections.push(sec('claims', '36. Claims you can / cannot make', `
<div class="ok"><strong>Can say:</strong> schema-first HITL stitch; scrubbed samples; attested exports; Offer A/B; human Promote; eval recall gates.</div>
<div class="out"><strong>Cannot say:</strong> “AI saw your whole warehouse”; “fully automatic trusted joins”; “we are your BI warehouse”; “SOC 2 certified product alone”; “Catalog/Glossary/Steward are production-complete” (WIP).</div>
`))

sections.push(sec('controls', '37. Deep control inventory (selected)', `
<table>
  <tr><th>Surface</th><th>Controls</th></tr>
  <tr><td>Assistant</td><td>Skills, @mention, Outcome card actions, Agent card Approve/Reject/Continue, Verify rows, feedback, reindex</td></tr>
  <tr><td>Joins</td><td>Infer, edit mapping, Promote, Reject, comments, incorrect-join confirm</td></tr>
  <tr><td>Jobs</td><td>New job, notebook save, dry-run/live, managed certify, validation suite, deploy exports, schedules</td></tr>
  <tr><td>Review</td><td>Approve/Reject proposal, side-by-side, transform panel</td></tr>
  <tr><td>Report Studio</td><td>Scaffold, Run all, tile edit, certify, filters</td></tr>
  <tr><td>Domains</td><td>Create/edit/delete, steward, sources, globs, seed starters</td></tr>
  <tr><td>Drift</td><td>Propose fixes, Accept, Dismiss</td></tr>
  <tr><td>Settings AI</td><td>enableStitchAgent, samples, auto-promote, BYOK, plane</td></tr>
</table>
`))

sections.push(sec('glossary', '38. Glossary of Que terms', `
<table>
  <tr><th>Term</th><th>Definition</th></tr>
  <tr><td>HITL</td><td>Human-in-the-loop — Promote/Approve gates before truth</td></tr>
  <tr><td>Promote</td><td>Accept a suggested join into the production contract</td></tr>
  <tr><td>Pinned sample</td><td>Scrubbed 5–10 row grid frozen for AI/join evidence</td></tr>
  <tr><td>Offer A / B</td><td>Customer warehouse vs Que managed plane</td></tr>
  <tr><td>Outcome</td><td>CEO-style plan object in Assistant</td></tr>
  <tr><td>Stitch Agent</td><td>Multi-step tool plan with checkpoints in Assistant</td></tr>
  <tr><td>Managed dataset</td><td>Certified job output in Que plane (Offer B)</td></tr>
  <tr><td>Report Studio</td><td>Certified BI canvas at /bi</td></tr>
  <tr><td>Domain</td><td>Owned data product boundary (Settings)</td></tr>
  <tr><td>Eval</td><td>Golden-set quality scoreboard</td></tr>
  <tr><td>Drift</td><td>Schema-change remap agent</td></tr>
  <tr><td>Attestation</td><td>Evidence fingerprint on delivered artifacts</td></tr>
</table>
`))

sections.push(sec('api', '39. API quick reference (power users)', `
<table>
  <tr><th>Area</th><th>Examples</th></tr>
  <tr><td>Health</td><td><code>GET /health</code> · <code>GET /status</code> · <code>GET /metrics</code></td></tr>
  <tr><td>Auth</td><td><code>POST /auth/login</code> · <code>GET /auth/me</code></td></tr>
  <tr><td>Sources</td><td>Workspace connections CRUD + sync</td></tr>
  <tr><td>Joins</td><td>Infer, promote, reject endpoints</td></tr>
  <tr><td>Chat</td><td>Chat message + context pack</td></tr>
  <tr><td>Agent</td><td><code>/workspaces/:id/agent/sessions</code> + checkpoint</td></tr>
  <tr><td>Domains</td><td><code>/workspaces/:id/domains</code> CRUD</td></tr>
  <tr><td>Jobs</td><td>Notebook update, run, export, managed certify</td></tr>
  <tr><td>BI</td><td>Scaffold report, charts, embed tokens</td></tr>
</table>
<p class="tiny">All workspace routes require auth bearer + workspace membership. Admin routes use <code>requireMinRole</code>.</p>
`))

sections.push(sec('checklist', '40. Production go-live checklist', `
<ol class="steps">
  <li>Demo/prod workspace created; owners/admins assigned.</li>
  <li>SSO/security reviewed; API keys rotated; BYOK if required.</li>
  <li>≥2 production sources synced; samples pinned on join-critical tables.</li>
  <li>Join golden set loaded in Eval; recall measured.</li>
  <li>Auto-promote still OFF unless recall gate met and policy signed.</li>
  <li>Stitch Agent enabled only if team trained on checkpoints.</li>
  <li>Offer A plane or Offer B quotas configured.</li>
  <li>First job dry-run + attested export rehearsed.</li>
  <li>Drift digests + Compliance path validated.</li>
  <li>Domains stewarded for Orders/Finance/Growth (or client equivalents).</li>
  <li>Catalog/Glossary/Steward understood as WIP — not sold as complete.</li>
  <li>Status page + on-call know API health endpoints.</li>
</ol>
<p class="footer-note">Que Complete Product Manual v3.0 · August 2026 · github.com/Shabrezadilabz/QUE · Generated for print (A4 ≈ 50 pages with section breaks).</p>
`))

// Extra depth pages to reach ~50 printed pages
const depth = []

depth.push(sec('assistant-depth', '14b. Assistant — message anatomy &amp; CEO mode', `
<p>Owner/CEO sessions may show a CEO badge and stronger Outcome defaults. Each assistant bubble can include:</p>
<ul>
  <li>Natural language answer grounded in schema pack + retrieved chunks.</li>
  <li>Optional SQL draft + Save job.</li>
  <li>Referenced tables visualization.</li>
  <li>Sample preview panels (scrubbed).</li>
  <li>Citations / retrieved chunk refs for auditability.</li>
  <li>Inline OutcomePlanCard or AgentPlanCard.</li>
</ul>
<p>Context refresh runs on focus, visibility, schema-change bus, and periodic timer so @mentions stay current after sync.</p>
`))

depth.push(sec('sources-depth', '17b. Sources — sync &amp; fixture tips', `
<ul>
  <li>Use fixture paths for Snowflake/Databricks demos when live creds unavailable.</li>
  <li>MongoDB: collections inferred into tabular schema views.</li>
  <li>Excel/CSV: watch type inference; re-pin samples after column renames.</li>
  <li>After sync, open Workspace to verify node counts; then pin samples before Infer.</li>
  <li>Connection failures: check host/port/SSL, workspace role (viewer cannot sync).</li>
</ul>
`))

depth.push(sec('jobs-depth', '19b. Jobs — contract freeze &amp; export gates', `
<ul>
  <li>Freeze contract after Promoted joins stabilize.</li>
  <li>Export gates may require promoted joins and clear drift.</li>
  <li>dbt PR needs GitHub branch settings under AI &amp; Policy.</li>
  <li>Private runner / orchestrator webhook for customer VPC execution (Offer A).</li>
  <li>Validation suite on Results: generate checks, run, inspect statuses.</li>
  <li>Managed certify creates dataset usable by Report Studio scaffold.</li>
</ul>
`))

depth.push(sec('bi-depth', '21b. Report Studio — visual types &amp; certify', `
<ul>
  <li>Visuals: KPI, card, bar, line, pie, table (scaffold packs multiple).</li>
  <li>Field well: drag measures/dimensions; filters on canvas.</li>
  <li>Run all executes against certified managed preview path.</li>
  <li>Certify tiles before embedding; embed tokens minted by admins.</li>
  <li>Chat <code>/bi</code> creates pack then navigates to <span class="route">/bi?report=…</span>.</li>
</ul>
`))

depth.push(sec('settings-depth', '30b. Settings — Team OS &amp; AI flags detail', `
<h3>Team OS</h3>
<ul>
  <li>Min role to propose/infer joins.</li>
  <li>Min role to Promote.</li>
  <li>Slack/Teams webhook digests for drift and join review.</li>
</ul>
<h3>AI &amp; Policy (selected flags)</h3>
<ul>
  <li>Pinned samples for AI (default on).</li>
  <li>Enable Stitch Agent.</li>
  <li>Auto-promote low-risk (Green) after recall gate — default off.</li>
  <li>Snowflake query join assist from ACCOUNT_USAGE (optional).</li>
  <li>BYOK OpenAI/Anthropic secret slots.</li>
  <li>GitHub repo + dbt deploy branches.</li>
  <li>Execution plane: customer vs managed.</li>
</ul>
`))

depth.push(sec('security-depth', '30c. Security &amp; Enterprise notes', `
<ul>
  <li>Revoke sessions; revoke other sessions.</li>
  <li>SSO enforce can block password login except break-glass.</li>
  <li>Enterprise: SCIM provisioning, CMK, SIEM export, SOC2 evidence pack downloads.</li>
  <li>Break-glass: owner opens time-boxed emergency access with reason; close when done.</li>
  <li>Audit log under Governance captures domain create/update/delete and other actions.</li>
</ul>
`))

depth.push(sec('marketplace-depth', '23b. Marketplace playbook — what gets created', `
<p>A full industry apply typically yields:</p>
<ul>
  <li>Matched tables / suggested mappings.</li>
  <li>Seeded org rules (backend).</li>
  <li>Join inference proposals awaiting Promote.</li>
  <li>Draft stitch job notebook.</li>
  <li>Outcome plan and optional Ship draft.</li>
  <li>Optional BI scaffold if managed path ready.</li>
</ul>
<p>Human still Promotes joins and validates job dry-run before production export.</p>
`))

depth.push(sec('eval-depth', '24b. Eval — golden pairs &amp; auto-promote gate', `
<ol class="steps">
  <li>Author golden join pairs JSON for critical relationships.</li>
  <li>Run Eval now; note recall.</li>
  <li>Enable schedule for regression.</li>
  <li>Only if recall ≥ configured gate AND leadership accepts risk, consider auto-promote Green.</li>
  <li>Keep Yellow/Red always HITL.</li>
</ol>
`))

depth.push(sec('drift-depth', '26b. Drift — accept remap workflow', `
<ol class="steps">
  <li>Upstream renames/drops column; sync detects drift event.</li>
  <li>Drift agent proposes remap / re-freeze.</li>
  <li>Review impact on jobs and joins.</li>
  <li>Accept to apply proposal or Dismiss with note.</li>
  <li>Re-run affected job dry-run; update promoted joins if needed.</li>
</ol>
`))

depth.push(sec('day-in-life', 'Appendix A — Day-in-the-life scripts', `
<h3>DE morning</h3>
<ol class="steps">
  <li>Check Drift + Compliance digests.</li>
  <li>Sync overnight sources; open Workspace.</li>
  <li>Clear Join Review backlog (Promote/Reject).</li>
  <li>Advance Agent checkpoint or job notebook dry-run.</li>
  <li>Respond to Review diffs from DA.</li>
</ol>
<h3>DA afternoon</h3>
<ol class="steps">
  <li>Assistant Outcome for stakeholder question.</li>
  <li>Promote joins with DE comments.</li>
  <li>Ship draft → Report Studio polish.</li>
  <li>Share embed or export evidence.</li>
</ol>
`))

depth.push(sec('training', 'Appendix B — 2-hour pilot training outline', `
<ol class="steps">
  <li>0:00 DNA + Offer A/B + privacy (samples).</li>
  <li>0:20 Connect two sources; sync; pin samples.</li>
  <li>0:40 Infer + Promote joins (Yellow example).</li>
  <li>1:00 Assistant skills + Outcome.</li>
  <li>1:20 /agent checkpoint through draft job.</li>
  <li>1:40 Jobs Results certify + /bi scaffold (Offer B) or export (Offer A).</li>
  <li>1:55 Domains + WIP honesty + status page.</li>
</ol>
`))

depth.push(sec('faq', 'Appendix C — FAQ', `
<table>
  <tr><th>Question</th><th>Answer</th></tr>
  <tr><td>Where did Agent go?</td><td>Inside Assistant via /agent; /agent redirects.</td></tr>
  <tr><td>Where did Domains go?</td><td>Settings → Domains.</td></tr>
  <tr><td>Where is Managed?</td><td>Jobs → Results managed layer.</td></tr>
  <tr><td>Where is Validation?</td><td>Jobs → Results validation layer.</td></tr>
  <tr><td>Where are Metrics?</td><td>Report Studio (/bi?focus=data).</td></tr>
  <tr><td>Where are Transforms?</td><td>Review (/proposals).</td></tr>
  <tr><td>Where are Rules?</td><td>Backend + learn-from-Promote; UI redirects to chat.</td></tr>
  <tr><td>Is Catalog ready?</td><td>No — WIP overlay.</td></tr>
</table>
`))

depth.push(sec('print', 'Appendix D — Printing this manual', `
<ul>
  <li>Open <code>Que-Complete-Product-Manual.html</code> in Chrome/Edge.</li>
  <li>Print → Save as PDF · Paper A4 · Margins default · Background graphics ON.</li>
  <li>Or run <code>node docs/build-complete-manual.mjs --pdf</code> with Playwright installed.</li>
  <li>Expected length ≈ 50 pages depending on font metrics.</li>
</ul>
<p class="footer-note">End of Que Complete Product Manual v3.0</p>
`))

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Que — Complete Product Manual v3.0</title>
  <style>${css}</style>
</head>
<body>
${sections.join('\n')}
${depth.join('\n')}
${(await import('./manual-extra-sections.mjs')).EXTRA_SECTIONS}
</body>
</html>
`

writeFileSync(outHtml, html, 'utf8')
console.log('Wrote', outHtml, `(${html.length} bytes)`)

if (process.argv.includes('--pdf')) {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto('file:///' + outHtml.replace(/\\/g, '/'), { waitUntil: 'load' })
  await page.pdf({
    path: outPdf,
    format: 'A4',
    printBackground: true,
    margin: { top: '11mm', bottom: '11mm', left: '10mm', right: '10mm' },
  })
  await browser.close()
  console.log('Wrote', outPdf)
}
