/**
 * Extra depth chapters to reach ~50 A4 pages — imported by build-complete-manual.mjs
 */
export const EXTRA_SECTIONS = `
<div class="pb"></div>
<h2 id="connectors-matrix">17c. Connector field matrix</h2>
<table>
  <tr><th>Connector</th><th>Key fields</th><th>Notes</th></tr>
  <tr><td>PostgreSQL</td><td>host, port, database, user, password, SSL</td><td>Default demo user often stitch</td></tr>
  <tr><td>MongoDB</td><td>uri or host/port, database</td><td>Collections → inferred tables</td></tr>
  <tr><td>Snowflake</td><td>account, warehouse, database, schema, user, password/key, fixturesPath</td><td>Fixtures for demos</td></tr>
  <tr><td>Databricks</td><td>host, http path, token, catalog/schema, fixtures</td><td>Offer A lakehouse</td></tr>
  <tr><td>Excel</td><td>file upload / path</td><td>Sheet → table</td></tr>
  <tr><td>CSV</td><td>file path, delimiter</td><td>Type inference</td></tr>
  <tr><td>BigQuery</td><td>project, dataset, credentials JSON</td><td>GCP warehouse</td></tr>
  <tr><td>Salesforce</td><td>instance, client, secret, refresh</td><td>CRM objects</td></tr>
</table>
<p class="tiny">Always Test connection before Save. Sync after Save. Pin samples on join keys before Infer.</p>

<div class="pb"></div>
<h2 id="join-algorithms">18b. Join inference — what the model uses</h2>
<ul>
  <li>Column name similarity (customer_id ↔ cust_id).</li>
  <li>Type compatibility.</li>
  <li>Pinned sample overlap ratios (target band often cited ~88–95% for easy keys).</li>
  <li>Optional Snowflake ACCOUNT_USAGE / Databricks query-history assist when enabled.</li>
  <li>Org rules (never join on email alone for finance, etc.).</li>
</ul>
<div class="warn">Without pins, overlap evidence is weak — treat suggestions as hypotheses only.</div>

<div class="pb"></div>
<h2 id="notebook-cells">19c. Notebook cell patterns</h2>
<pre class="flow"># Markdown: intent / contract notes
## Customer 360 stitch
Promote joins: crm.customers ↔ wh.orders

-- SQL: bounded select for dry-run
SELECT c.id, c.region, o.order_id, o.amount
FROM crm.customers c
JOIN wh.orders o ON c.id = o.customer_id
WHERE o.created_at >= CURRENT_DATE - INTERVAL '30' DAY
LIMIT 500;</pre>
<ul>
  <li>Keep cells reviewable; avoid SELECT * in production contracts.</li>
  <li>Document Promoted join IDs in markdown cells for auditors.</li>
  <li>Dry-run before live; inspect null keys and dup rates on Results.</li>
</ul>

<div class="pb"></div>
<h2 id="review-states">20b. Review item lifecycle</h2>
<ol class="steps">
  <li>Created (agent draft, transform NL, join propose, SQL edit).</li>
  <li>Open in Review inbox with author + referred tables.</li>
  <li>Peer inspects unified or side-by-side diff.</li>
  <li>Approve → applies workspace truth / advances state.</li>
  <li>Reject → remains historical; author revises.</li>
</ol>

<div class="pb"></div>
<h2 id="ship-states">22b. Ship draft fields</h2>
<ul>
  <li>Title / description from Outcome chart hint.</li>
  <li>Linked outcomeId.</li>
  <li>Chart type preference (bar/line/kpi…).</li>
  <li>Open from Assistant Ship action → <span class="route">/ship?id=…</span>.</li>
  <li>Hand off to Report Studio for certified visuals when Offer B.</li>
</ul>

<div class="pb"></div>
<h2 id="embed">21c. Embeds &amp; tokens</h2>
<ol class="steps">
  <li>Certify managed dataset and report tiles.</li>
  <li>Admin mints embed token.</li>
  <li>Share <span class="route">/embed/:token</span> with stakeholder.</li>
  <li>Revoke on Settings/Security or BI admin panel when access ends.</li>
</ol>
<div class="out">Embeds show certified preview paths — not live warehouse dumps.</div>

<div class="pb"></div>
<h2 id="weekly">Appendix E — Weekly ops ritual (printable)</h2>
<pre class="flow">Mon  Sync health + Drift digests + Status page
Tue  Join Review burn-down (DE+DA)
Wed  Review inbox hour (senior DE)
Thu  Report Studio certify / Ship for stakeholders
Fri  Eval recall + Domains stewardship + Compliance checklist
</pre>

<div class="pb"></div>
<h2 id="raci">Appendix F — RACI (lightweight)</h2>
<table>
  <tr><th>Activity</th><th>R</th><th>A</th><th>C</th><th>I</th></tr>
  <tr><td>Connect sources</td><td>DE</td><td>Admin</td><td>DA</td><td>Steward</td></tr>
  <tr><td>Promote joins</td><td>DE/DA</td><td>DE lead</td><td>Steward</td><td>CEO</td></tr>
  <tr><td>Job export / dbt PR</td><td>DE</td><td>DE lead</td><td>Analytics eng</td><td>Ops</td></tr>
  <tr><td>Certify BI</td><td>DA</td><td>Analytics lead</td><td>DE</td><td>Stakeholders</td></tr>
  <tr><td>AI policy / auto-promote</td><td>Admin</td><td>Owner</td><td>DE lead</td><td>All</td></tr>
  <tr><td>Domains stewardship</td><td>Steward</td><td>Owner</td><td>DE/DA</td><td>All</td></tr>
</table>

<div class="pb"></div>
<h2 id="incident">Appendix G — Incident playbooks</h2>
<h3>Bad join promoted</h3>
<ol class="steps">
  <li>Reject or correct join; document in comments.</li>
  <li>Re-freeze affected job contracts.</li>
  <li>Re-run dry-run; notify Ship/BI owners.</li>
  <li>Add Eval golden pair to prevent regression.</li>
</ol>
<h3>Schema drift blocks export</h3>
<ol class="steps">
  <li>Open Drift agent; Accept remap or fix manually.</li>
  <li>Re-Promote joins if columns changed.</li>
  <li>Clear export gate; re-export.</li>
</ol>
<h3>Embed showing stale data</h3>
<ol class="steps">
  <li>Re-run job; re-certify managed.</li>
  <li>Refresh Report Studio Run all.</li>
  <li>Re-mint embed if token scoped to old report revision.</li>
</ol>

<div class="pb"></div>
<h2 id="security-checklist">Appendix H — Security review checklist</h2>
<ul>
  <li>Password login vs SSO enforce decision recorded.</li>
  <li>No production warehouse passwords in chat logs.</li>
  <li>BYOK keys in secret slots only.</li>
  <li>Viewer role used for external auditors.</li>
  <li>Break-glass procedure tested once.</li>
  <li>Audit log retention understood.</li>
  <li>Embed tokens inventory + revocation path.</li>
  <li>Pinned samples scrubbing policy agreed with legal.</li>
</ul>

<div class="pb"></div>
<h2 id="demo-script">Appendix I — 30-minute customer demo script</h2>
<ol class="steps">
  <li>Status page (trust / ops).</li>
  <li>Sources: show two connectors synced.</li>
  <li>Workspace canvas flyover.</li>
  <li>Joins: Promote one Yellow with commentary.</li>
  <li>Assistant: /outcome revenue by region.</li>
  <li>/agent approve → continue after promote → open job.</li>
  <li>Jobs Results: validation + managed certify (Offer B) OR export story (Offer A).</li>
  <li>Report Studio scaffold; Ship.</li>
  <li>Settings Domains + honesty on WIP Catalog.</li>
  <li>Close with claims you will not make.</li>
</ol>

<div class="pb"></div>
<h2 id="glossary2">Appendix J — Extended glossary</h2>
<table>
  <tr><th>Term</th><th>Definition</th></tr>
  <tr><td>Context pack</td><td>Schema summary sent to AI for a workspace</td></tr>
  <tr><td>Contract freeze</td><td>Lock job expectations after Promote</td></tr>
  <tr><td>Dry-run</td><td>Capped execution for validation</td></tr>
  <tr><td>External status</td><td>Warehouse/CI callback digested in Que</td></tr>
  <tr><td>Golden pair</td><td>Known-good join for Eval recall</td></tr>
  <tr><td>Incorrect join</td><td>Canvas-marked bad edge requiring confirm</td></tr>
  <tr><td>Playbook install</td><td>Marketplace full HITL bootstrap</td></tr>
  <tr><td>Private runner</td><td>Customer VPC job executor</td></tr>
  <tr><td>Proposal</td><td>Review inbox item awaiting Approve</td></tr>
  <tr><td>Reindex</td><td>Refresh vector/docs index for chat retrieval</td></tr>
  <tr><td>Scaffold</td><td>Auto-build BI pack from managed/chat</td></tr>
  <tr><td>Scrub</td><td>Mask/redact sample values before AI/UI</td></tr>
  <tr><td>SoR</td><td>System of record for rows</td></tr>
  <tr><td>Steward</td><td>Domain owner accountable for Promote quality</td></tr>
  <tr><td>Table glob</td><td>Pattern assigning tables to a Domain</td></tr>
  <tr><td>Tool transcript</td><td>Agent card log of tool calls</td></tr>
</table>

<div class="pb"></div>
<h2 id="version">Appendix K — Manual revision history</h2>
<table>
  <tr><th>Ver</th><th>Date</th><th>Notes</th></tr>
  <tr><td>2.0</td><td>Aug 2026</td><td>Production Use Guide (prior)</td></tr>
  <tr><td>3.0</td><td>16 Aug 2026</td><td>Complete manual: Agent→Assistant, Domains→Settings, Jobs Results layers, WIP overlays, Status width fix</td></tr>
  <tr><td>3.1</td><td>16 Aug 2026</td><td>Code-accurate inventory: Promote thresholds, sample caps, Ship/Workspace/Joins/Jobs controls, onboarding</td></tr>
</table>

<div class="pb"></div>
<h2 id="inventory-hitl">Appendix L — Promote tiers (code-accurate)</h2>
<p>Suggested joins are <strong>never</strong> production truth until human <span class="ctrl">Promote</span>.</p>
<table>
  <tr><th>Tier</th><th>How it is decided</th><th>Promote UX</th></tr>
  <tr><td>Red</td><td>Weak/opaque evidence (e.g. confidence &lt; 0.7, low/none pin overlap, or missing safe name/FK/history with conf &lt; 0.85)</td><td>Promote (Red · DE/admin). Gated by <code>redPromoteMinRole</code> (default admin).</td></tr>
  <tr><td>Yellow</td><td>Decent evidence; not Green</td><td>Promote (Yellow · one-click). Gated by <code>yellowPromoteMinRole</code> (default member).</td></tr>
  <tr><td>Green</td><td>High confidence (typically ≥ 0.92) + safe signals (+ pin/cross-source rules)</td><td>Auto-Promote only if <code>enableAutoPromoteLowRisk</code> and Eval recall ≥ <code>autoPromoteMinRecall</code> (default 0.9). Else treated as Yellow.</td></tr>
</table>
<ul>
  <li>Joins: filters Pending/Accepted/Rejected/All; Re-run inference; Suggest mappings; comments; rename Accept/Reject/Dismiss; golden-set report.</li>
  <li>Workspace: Incorrect-join confirm before saving a bad edge; Stitch Session (two connections → infer → ship); export PDF/PNG/JSON.</li>
</ul>

<div class="pb"></div>
<h2 id="inventory-privacy">Appendix M — Sample &amp; privacy caps (code-accurate)</h2>
<table>
  <tr><th>Cap</th><th>Limit</th><th>Where</th></tr>
  <tr><td>Pinned samples</td><td>5–10 rows (default 10)</td><td>Scrubbed; frozen until re-pin; AI when <code>aiMayUsePinnedSamples</code></td></tr>
  <tr><td>Sync column samples</td><td>Typically ≤5</td><td>Scrubbed before metadata store when scrub on</td></tr>
  <tr><td>Live Validate</td><td>≤20 rows read-only</td><td>Jobs notebook Validate (not stored as lake)</td></tr>
  <tr><td>Chat Verify rows</td><td>Hard-cap 5–10 scrubbed</td><td>Never managed dump / full lake</td></tr>
</table>

<div class="pb"></div>
<h2 id="inventory-workspace">Appendix N — Workspace &amp; Sources control map</h2>
<ul>
  <li><strong>Workspace:</strong> TopBar search ⌘K, filters, MiniMap, RightSidebar, Stitch Session, Create stitch job, Incorrect-join confirm.</li>
  <li><strong>Sources:</strong> Install POC pack; catalog → Configure (fixture vs live); Sync Schema; health/re-auth; legacy <code>?view=</code> redirects.</li>
</ul>

<div class="pb"></div>
<h2 id="inventory-jobs-ship">Appendix O — Jobs tabs &amp; Ship deep links</h2>
<table>
  <tr><th>Tab</th><th>Route</th><th>Controls</th></tr>
  <tr><td>Notebook</td><td><span class="route">/jobs/:id/notebook</span></td><td>Save; Run Test (dry_run); Validate (≤20 rows); View results / Deploy</td></tr>
  <tr><td>Results</td><td><span class="route">/jobs/:id/results</span></td><td>Managed preview/certify; Validation suite; sample tables</td></tr>
  <tr><td>Deploy</td><td><span class="route">/jobs/:id/deploy</span></td><td>Mark Ready; Contract freeze; drift ack; export JSON/SQL/dbt; Open dbt PR; schedules</td></tr>
</table>
<ul>
  <li><strong>Ship:</strong> Approve/Rollback; attestation fingerprint; jobId/materializationId; embed URL; Verify; <code>?id=</code> / <code>?outcomeId=</code>.</li>
</ul>

<div class="pb"></div>
<h2 id="inventory-chrome">Appendix P — Chrome, onboarding &amp; day-one path</h2>
<ul>
  <li>Header: Workspace switcher, Presence, onboarding <strong>?</strong> (connect → sync → Promote → jobs → policy), Auth, API status.</li>
  <li>Status bar: <code>SCHEMA-ONLY · NO RAW DATA</code> (page eyebrows may override).</li>
</ul>
<pre class="flow">Day-one path (code-aligned)
  /login → /sources (or POC pack) → Sync
  → /joins or /workspace → Promote HITL
  → /chat (/outcome or /agent) → plan
  → /jobs/.../notebook → Results → Deploy
  → /ship and/or /bi → embed
  → /compliance / /verify for diligence</pre>
<p class="footer-note">Que Complete Product Manual v3.1 — appendices L–P from live App.tsx / page code.</p>
`
