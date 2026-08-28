# Phase 2 complete — Que competitive sprint exit (2026)

**Horizon:** 12 sprints × 2 weeks = 24 weeks  
**Status:** All sprint deliverables implemented locally — **4 commits ahead of `origin/main`** (through `860352f` CI on push)  
**Plan:** [Que-Competitive-Sprint-Plan-2026.md](./Que-Competitive-Sprint-Plan-2026.md)

---

## Sprint summary

| Sprint | Theme | Backlog |
|--------|-------|---------|
| S1 | India GTM + credibility | [sprint-1/](./sprint-1/) |
| S2 | Post-ingest intelligence | [sprint-2/](./sprint-2/) |
| S3 | Semantic layer + RS-1 | [sprint-3/](./sprint-3/) |
| S4 | dbt export + Airflow | [sprint-4/](./sprint-4/) |
| S5 | Connector depth + battlecard | [sprint-5/](./sprint-5/) |
| S6 | Pack density + Genie drafts | [sprint-6/](./sprint-6/) |
| S7 | DQ loop + steward dashboard | [sprint-7/](./sprint-7/) |
| S8 | Enterprise scale + multi-source Monk | [sprint-8/](./sprint-8/) |
| S9 | Report Studio v1 + India connectors | [sprint-9/](./sprint-9/) |
| S10 | Orchestration mesh + RS-5/6 | [sprint-10/](./sprint-10/) |
| S11 | Enterprise ops + collab | [sprint-11/](./sprint-11/) |
| S12 | Long-tail + Phase 2 finish | [sprint-12/](./sprint-12/) |

---

## Phase 2 exit definition (met in code)

- [x] All 11 competitive wedges from positioning (sections A in sprint plan)
- [x] Report Studio RS-1 through RS-8
- [x] P0–P2 gap backlog addressed except external-only items
- [x] India GTM artifacts (pricing, ROI, battlecard, sandbox path)
- [x] Global GTM scaffold (USD + US/EU case studies)

## Still external or manual

- [ ] **Git push** S1–S12 to GitHub `main` (ready — say **push** to publish)
- [ ] **SOC 2 Type II letter** (~month 9–15 from S8 kickoff)
- [ ] **RS-8 demo video** (script: `docs/gtm/rs8-demo-script.md`)
- [ ] **3 paid design partners** (GTM, not engineering)
- [ ] **Fivetran-scale connector live ingest** (ongoing; honest 25+ matrix shipped)

---

## Verify locally

```bash
cd adc/schemagraph/api
npm run test:sprint8 && npm run test:sprint9 && npm run test:sprint10
npm run test:sprint11 && npm run test:sprint12 && npm run test:load

cd ..
npm run build
```

---

## Recommended next actions

### 1. Publish to GitHub (you run — agent needs approval card)

```powershell
cd d:\ADC\prosols\adc
git push origin main
```

`gh` is logged in as **Shabrezadilabz** with `repo` scope. After push, GitHub Actions runs **scim-smoke** (S8–S12 + load, no secrets).

### 2. Free pilot deploy

See [DEPLOY-FREE.md](./DEPLOY-FREE.md): Neon → Render (`render.yaml`) → Vercel (`VITE_STITCH_API_URL`).

### 3. Prod verification

```powershell
cd d:\ADC\prosols\adc\schemagraph\api
$env:QUE_API_BASE = "https://your-api.onrender.com"
npm run test:smoke
npm run test:monk-prod
```

### 4. GTM

Record RS-8 demo — script: [`docs/gtm/rs8-demo-script.md`](./gtm/rs8-demo-script.md)
