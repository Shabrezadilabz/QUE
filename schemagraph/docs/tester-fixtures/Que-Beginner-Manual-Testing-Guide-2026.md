# Que — Beginner Manual Testing Guide (step-by-step)

**Who this is for:** Someone testing Que for the **first time**. No data engineering background needed.  
**Read this like a recipe:** do Step 1, check the result, then Step 2. Do not skip the “You should see…” boxes.  
**Your manager already loaded ecommerce data?** Start at **Part 2 — Path A**.  
**Empty workspace?** Start at **Part 2 — Path B**.

**Other docs (for later):**
- [`Que-Ecommerce-Flow-Test-Plan-2026.md`](Que-Ecommerce-Flow-Test-Plan-2026.md) — shorter checklist for experienced QA
- [`../customer/Que-Customer-Guide-And-Testing-Flows-2026.md`](../customer/Que-Customer-Guide-And-Testing-Flows-2026.md) — what each page means

---

## 0. Before you open the app (5 minutes)

### 0.1 What is Que? (one paragraph)

Que is a website where a company connects its data sources (Shopify, payments, databases), sees tables as a **picture (graph)**, **approves** how tables link together (**joins**), builds **SQL jobs**, asks **AI chat** questions, and ships **dashboards**.  
**Important rule:** Que does **not** merge your data automatically. A human (you) must click **Promote** on joins before cross-table jobs work.

### 0.2 What you need from your manager

Ask your manager to fill this in **before Day 1**:

| Item | Write it here | Example |
|------|---------------|---------|
| **Website URL (UI)** | | `https://….vercel.app` |
| **Login email** | | `you@company.com` |
| **Login password** | | *(do not share in Slack)* |
| **Workspace name** | | `Demo India D2C` |
| **Is ecommerce data already installed?** | Yes / No | Yes = Shopify + Razorpay + Stripe |
| **Browser** | Chrome or Edge (latest) | |

### 0.3 What to keep open while testing

1. **This document** (left half of screen)  
2. **Que website** (right half of screen)  
3. **A blank notes file** — copy the worksheet below

### 0.4 Your daily worksheet (copy into Notes)

For every step, write one of: **PASS** · **FAIL** · **SKIP**

```
Date: ___________
Tester name: ___________
UI URL: ___________

PART 1 Login          PASS / FAIL / SKIP   Notes: ___________
PART 2 Data check     PASS / FAIL / SKIP   Notes: ___________
PART 3 Hub            PASS / FAIL / SKIP   Notes: ___________
PART 3 Sources        PASS / FAIL / SKIP   Notes: ___________
PART 3 Workspace      PASS / FAIL / SKIP   Notes: ___________
PART 3 Joins          PASS / FAIL / SKIP   Notes: ___________
PART 3 Chat           PASS / FAIL / SKIP   Notes: ___________
PART 3 Jobs           PASS / FAIL / SKIP   Notes: ___________
PART 4 Golden order   PASS / FAIL / SKIP   Notes: ___________
PART 5 All pages      PASS / FAIL / SKIP   Notes: ___________
```

### 0.5 Words you will see (mini dictionary)

| Word | Simple meaning |
|------|----------------|
| **Source / Connection** | A link to one system (e.g. Shopify) |
| **Sync** | Que reads table names and columns (not always all row data) |
| **Workspace** | Your project folder inside Que |
| **Table** | One sheet of data, like `orders` or `customers` |
| **Join** | How two tables connect (e.g. order id = payment order id) |
| **Promote** | You **approve** a suggested join |
| **Reject** | You **decline** a bad join |
| **Job** | Saved SQL notebook you can test and export |
| **Validate** | Run SQL for real but only show ~20 rows |
| **Run Test** | Dry-run — checks SQL without live warehouse |
| **Fixture / POC pack** | Fake demo data built into Que (no real passwords) |
| **CEO mode (Chat)** | Plain English answers |
| **Engineer mode (Chat)** | Shows SQL and technical detail |

### 0.6 Golden test numbers (write these on a sticky note)

Use these to check joins and chat answers. They are **fake demo data**, not real money.

| What | Value | Where |
|------|-------|-------|
| Shopify order id | **5001001** | Shopify `orders` table |
| Razorpay receipt | **shopify_5001001** | Razorpay `orders.receipt` |
| Order total (INR) | **2499.00** | Shopify `orders.total_price` |
| Razorpay amount (paise) | **249900** | Razorpay `payments.amount` |
| Buyer email | **buyer@example.in** | Shopify customers / Stripe |
| Google Ads drove orders | **5001001,5001002** | Google Ads campaign stats |

---

## Part 1 — Login (Day 1, ~10 minutes)

### Step 1.1 — Open the website

1. Open **Chrome** or **Edge**.  
2. In the address bar, paste the **UI URL** from your manager. Press **Enter**.

**You should see:**
- A login page with **Sign in** (and maybe **Create account**)
- Que logo or product name at the top
- **No password already filled in** on production

| Result | What to do |
|--------|------------|
| ✅ Page loads | Continue to Step 1.2 |
| ❌ Blank page / “Cannot connect” | Tell manager: “UI URL does not load” + screenshot |
| ❌ Wrong company branding | Tell manager: “Wrong URL?” |

---

### Step 1.2 — Sign in

1. Click in the **Email** box. Type your email exactly (no spaces).  
2. Click in the **Password** box. Type your password.  
3. Click **Sign in** (or **SIGN IN**).

**You should see:**
- You leave the login page within ~5 seconds  
- Left sidebar appears with items like **Platform**, **Workspace**, **Sources**, **Chat**  
- Top of page may show your **workspace name**

| Result | What to do |
|--------|------------|
| ✅ Sidebar visible | Mark **PART 1 PASS** |
| ❌ “Invalid credentials” | Ask manager to reset password |
| ❌ Stuck on login spinner >30s | Screenshot + tell manager “API may be down” — try `/status` URL |

---

### Step 1.3 — Sign out and sign in again (quick check)

1. Find **Settings** or your profile menu (often bottom of sidebar or top-right).  
2. Click **Sign out**.  
3. Sign in again with same email/password.

**You should see:** Same workspace loads again.

| Result | Mark |
|--------|------|
| ✅ Works | PART 1 **PASS** |
| ❌ Error | PART 1 **FAIL** — note exact error text |

---

## Part 2 — Check your data (Day 1, ~15 minutes)

Your manager said ecommerce data is **already created**. Follow **Path A**.  
If the workspace is **empty**, follow **Path B**.

---

### Path A — Data already installed (most likely for you)

#### Step 2A.1 — Open Sources

1. In the **left sidebar**, click **Sources**.  
2. Wait until the page finishes loading (no spinning forever).

**You should see a list of connections.** Look for names like:

- `POC · Shopify fixture`
- `POC · Razorpay fixture`
- `POC · Stripe fixture`

(You might also see MySQL, Google Ads, HubSpot, Chargebee if other packs were installed.)

**Count them:** write the number here: ______ connections

| Result | What to do |
|--------|------------|
| ✅ At least **3** commerce connections | Continue |
| ❌ List is **empty** | Switch to **Path B** or ask manager |
| ⚠️ Yellow/orange dot on a row | Note which one — still continue, we sync in Step 2A.2 |

---

#### Step 2A.2 — Sync one connection

1. Find **POC · Shopify fixture** (or any Shopify row).  
2. Click **Sync** on that row (button may say **Sync now** or a refresh icon).  
3. Wait up to **60 seconds**.

**You should see:**
- A green toast / message like **“Synced”** or **“X tables synced”**
- **X** should be **greater than 0** (often 3–8 tables)
- Status dot turns **grey/green** (active)

| Result | Mark |
|--------|------|
| ✅ tables synced > 0 | Continue |
| ❌ Error toast | Screenshot message → FAIL — tell manager |
| ❌ 0 tables synced | FAIL — note connection name |

---

#### Step 2A.3 — Sync ALL connections (one by one)

Repeat Step 2A.2 for **every** connection in the list.

**You should see:** Each one reports tables synced > 0 (fixture connectors always have tables).

When done, mark **PART 2 PASS** if all succeeded.

---

### Path B — Install ecommerce data yourself (empty workspace)

> Only do this if Path A showed **zero** connections and your manager said you may install demo data.

#### Step 2B.1 — Go to Sources home

1. Sidebar → **Sources**  
2. Scroll down until you see a section about **POC packs** (demo bundles).

#### Step 2B.2 — Install India D2C pack

1. Find the card: **India D2C commerce POC pack**  
   - Description mentions **Shopify + Razorpay + Stripe**  
2. Click **Install pack** (admin only — if button missing, ask manager for admin role).  
3. Wait **1–3 minutes**. Do not refresh the page aggressively.

**You should see:**
- Success toast  
- **Three new connections** appear in the list (Shopify, Razorpay, Stripe)

#### Step 2B.3 — Sync all three

Do **Path A Step 2A.2** for each new connection.

Mark **PART 2 PASS** when all three synced.

---

## Part 3 — The main story: one order across three systems (Day 2–3, ~90 minutes)

This is the **most important test**. You prove Que can link **order 5001001** from Shopify → Razorpay → Stripe.

---

### Step 3.1 — See the graph (Workspace)

1. Sidebar → **Workspace**  
2. Wait for the canvas to load.

**You should see:**
- Boxes (nodes) with table names: `orders`, `customers`, `payments`, etc.  
- Different **colors or labels** per source (Shopify vs Razorpay vs Stripe)  
- Lines between some tables (suggested joins)

**Do this:**
- Use mouse wheel or zoom controls to zoom in.  
- Click and drag empty space to **pan** the canvas.

| Result | Mark |
|--------|------|
| ✅ ≥10 table nodes visible | Continue |
| ❌ Empty canvas | Go back to Part 2 — sync failed |
| ❌ Error banner | Screenshot → FAIL |

---

### Step 3.2 — Open Joins page

1. Sidebar → **Joins**  
2. Click tab **Suggested** (if tabs exist).

**You should see:**
- A list of suggested joins (may be 5–50 items)  
- Each row shows two table/column names  
- A color or label: **Green**, **Yellow**, or **Red** (risk)

If list is **empty**:
1. Click button **Run inference** (or **Infer joins**)  
2. Wait ~30–120 seconds  
3. Refresh the list

| Result | What to do |
|--------|------------|
| ✅ List has items | Continue |
| ❌ Still empty after inference | FAIL — only one source synced? Check Part 2 |

---

### Step 3.3 — Promote safe joins (click Approve)

Promote **at least these 4** (names may vary slightly — match the **idea**):

| # | Join idea | Why |
|---|-----------|-----|
| 1 | Shopify `orders` → Shopify `customers` | Same-system order to buyer |
| 2 | Razorpay `payments` → Razorpay `orders` | Payment to Razorpay order |
| 3 | Razorpay `orders.receipt` ↔ Shopify `orders.id` | **Cross-source** — receipt `shopify_5001001` |
| 4 | Stripe charge metadata ↔ Shopify `orders.id` | **Cross-source** — order **5001001** |

**For each join:**

1. Click the row to open **details**.  
2. Read **sample overlap** or evidence (should show matching ids or receipts).  
3. Click **Promote** (or **Accept**).  
4. Row moves to **Accepted** tab or shows promoted badge.

**You should see:** Status changes to **Promoted / Accepted** and stays that way after you **reload the page** (F5).

| Result | Mark |
|--------|------|
| ✅ 4 joins promoted | Continue |
| ❌ Promote button missing | Ask manager — you may be **Viewer** role |
| ❌ Promote then disappears on reload | FAIL — bug |

---

### Step 3.4 — Reject one join (prove “no silent merge”)

1. On **Suggested** tab, pick a join that looks **weak** (Red tier or nonsense column names).  
2. Click **Reject**.  
3. Reload page (F5).

**You should see:** That join stays **Rejected** and does **not** appear as accepted.

Mark **PART 3 Joins PASS** if promote + reject both worked.

---

### Step 3.5 — Create a job (Jobs page)

1. Sidebar → **Jobs**  
2. Click **New job** or **Create job** (wording may vary).  
3. When asked for a name, type exactly:  
   `TEST · Order 5001001 payments`  
4. Save / Create.

**You should see:** Notebook page opens (`/jobs/.../notebook`) with empty or template SQL cells.

---

### Step 3.6 — Paste SQL (Engineer notebook)

1. Click inside the **SQL editor** (big text area).  
2. **Select all** old text and delete.  
3. **Copy and paste** this entire block:

```sql
SELECT
  s.id AS shopify_order_id,
  s.total_price,
  r.receipt AS razorpay_receipt,
  p.amount AS razorpay_amount_paise,
  p.status AS payment_status
FROM shopify_orders s
LEFT JOIN razorpay_orders r
  ON r.receipt = CONCAT('shopify_', CAST(s.id AS TEXT))
LEFT JOIN razorpay_payments p
  ON p.order_id = r.id
WHERE s.id = 5001001
LIMIT 20;
```

> **If you get “table not found”:** Your graph may use different table labels (e.g. `shopify.orders`). Ask chat in Engineer mode: `/list` and replace names in the SQL. That is still a valid test — note what names worked.

4. Click **Save** if there is a save button.

---

### Step 3.7 — Run Test (dry-run)

1. Click **Run Test** (not Validate yet).  
2. Wait up to **60 seconds**.

**You should see:**
- Log panel or message: **success** or **completed**  
- **No red error** like “syntax error” (table name errors are OK to note)

| Result | Mark |
|--------|------|
| ✅ Run Test completes without crash | Continue |
| ❌ Page crashes | FAIL + screenshot |

---

### Step 3.8 — Validate (live preview, max ~20 rows)

1. Click **Validate** (may warn about live data — click OK/Confirm).  
2. Wait up to **60 seconds**.

**You should see a small grid** with columns like:

| shopify_order_id | total_price | razorpay_receipt | razorpay_amount_paise | payment_status |
|------------------|-------------|------------------|------------------------|----------------|
| 5001001 | 2499.00 | shopify_5001001 | 249900 | captured (or similar) |

**Check these values:**

- [ ] `shopify_order_id` = **5001001**  
- [ ] `total_price` = **2499.00** (or 2499)  
- [ ] `razorpay_receipt` = **shopify_5001001**  
- [ ] `razorpay_amount_paise` = **249900**

| Result | Mark |
|--------|------|
| ✅ Row matches golden numbers | **PART 4 PASS** — main story works |
| ⚠️ 0 rows | FAIL — joins not promoted or wrong table names |
| ⚠️ Wrong numbers | FAIL — note what you got |

---

### Step 3.9 — Mark job Ready + export (optional but good)

1. Click **Mark Ready** (or change status to Ready).  
2. Open **Deploy** tab.  
3. Click **Export JSON**.  
4. A file downloads OR JSON appears — look for `"signature"` or **attestation** field.

**Optional verify:**
1. Open new tab: `{UI URL}/verify`  
2. Paste the attestation / export payload  
3. Click Verify

**You should see:** **Valid** or `ok: true`

Mark **PART 3 Jobs PASS** if Validate worked.

---

## Part 4 — Chat testing (Day 3–4, ~60 minutes)

### Step 4.0 — Turn on AI (once)

1. Sidebar → **Settings** → **AI policy** (or `/settings/ai-policy`)  
2. Find **Enable Que Agent** → turn **ON**  
3. Click **Save**

**You should see:** Success toast or toggle stays on after reload.

---

### Step 4.1 — Open Chat

1. Sidebar → **Chat**  
2. Find dropdown **CEO** / **Engineer** near the input box.

---

### Step 4.2 — Easy chat tests (copy-paste exactly)

Do these in **Engineer** mode first.  
After each message, press **Enter** or click **Send**.  
Wait up to **30 seconds** per reply.

| # | Type this exactly | You should see (PASS if…) | PASS / FAIL |
|---|-------------------|---------------------------|-------------|
| 4.2.1 | `/help` | A list of slash commands (`/list`, `/describe`, …). **Not** a red error page. | |
| 4.2.2 | `/list` | Names of tables (shopify, razorpay, stripe, orders, …) | |
| 4.2.3 | `/describe orders` | Column names for an orders table | |
| 4.2.4 | `/suggested` | Mentions joins waiting for review OR already promoted | |
| 4.2.5 | `/privacy` | Text about schema-only / privacy policy | |

**If `/help` shows error or “500”:**  
Tell manager: *“Chat broken on prod — need database migration.”* Mark chat **FAIL** until fixed.

---

### Step 4.3 — CEO mode (plain English)

1. Switch audience to **CEO**.  
2. Type: `What tables do we have?`  
3. Send.

**You should see:** Plain list of tables — **not** a wall of SQL code.

| PASS | FAIL |
|------|------|
| Readable table list | Error or empty |

---

### Step 4.4 — Engineer question about your golden order

1. Switch to **Engineer**.  
2. Type: `How do I join Shopify orders to Razorpay payments for order 5001001?`  
3. Send.

**You should see:** Answer mentions **`receipt`**, **`shopify_`**, and/or order **5001001**.

---

### Step 4.5 — Agent job from chat (advanced)

1. Stay in **Engineer** mode.  
2. Type: `/que Create a job joining Shopify orders and Razorpay payments for order 5001001`  
3. Send.  
4. If a **plan card** appears with **Approve** button → click **Approve**.  
5. If it asks you to **Promote a join** → go to Joins, promote, come back, click **Continue** or **Approve** again.

**You should see:** A link to open a job in **Jobs** OR a new job in the list.

Mark **PART 3 Chat PASS** if 4.2.1–4.2.3 and 4.4 worked.

---

## Part 5 — Click every page (Day 4–5, ~2 hours)

Open each item below. For each: **click once**, wait for load, write PASS if no crash.

Use sidebar groups. Sub-pages are in parentheses.

### 5.1 Platform group

| # | Click this in sidebar | URL (check address bar) | You should see | PASS / FAIL |
|---|----------------------|-------------------------|----------------|-------------|
| 5.1.1 | **Platform** | `/hub` | Grid of **6 modules** (Load, Model, Studio, …) + summary strip | |
| 5.1.2 | **Load** | `/load` | List of your connections + **Sync** buttons | |
| 5.1.3 | Load → **Runs** tab | `/load?tab=runs` | Queue/history table (may be empty — OK) | |
| 5.1.4 | **Model** | `/model` | Model list or “create first model” empty state | |
| 5.1.5 | **Studio** (or BI Studio) | `/studio/grid` | Table picker (may say need warehouse — OK) | |
| 5.1.6 | **Catalog** | `/catalog` | Search box; search `orders` shows tables | |
| 5.1.7 | **Pipes** | `/pipes` | Big text box + **Draft** button | |
| 5.1.8 | **Observe** | `/observe` | Health score + stat cards | |

---

### 5.2 Core group

| # | Click | URL | You should see | PASS / FAIL |
|---|-------|-----|----------------|-------------|
| 5.2.1 | **Workspace** | `/workspace` | Graph from Part 3 | |
| 5.2.2 | **Sources** | `/sources` | Your POC connections | |
| 5.2.3 | **Joins** | `/joins` | Promoted joins from Part 3 | |
| 5.2.4 | **Chat** | `/chat` | Chat input | |

---

### 5.3 Build group

| # | Click | URL | You should see | PASS / FAIL |
|---|-------|-----|----------------|-------------|
| 5.3.1 | **Jobs** | `/jobs` | Your test job listed | |
| 5.3.2 | Open your test job | `/jobs/.../notebook` | SQL from Part 3 | |
| 5.3.3 | **Lineage** | `/lineage` | Graph or empty state | |
| 5.3.4 | **Templates** | `/templates` | Template list | |
| 5.3.5 | **Validation** | `/validation` | Validation UI | |
| 5.3.6 | **Drift agent** | `/drift-agent` | Drift list or empty | |

---

### 5.4 Analytics group

| # | Click | URL | You should see | PASS / FAIL |
|---|-------|-----|----------------|-------------|
| 5.4.1 | **BI** | `/bi` | Report Studio canvas | |
| 5.4.2 | **Metrics** | `/metrics` | KPI list (may be empty) | |
| 5.4.3 | **Ship** | `/ship` | Draft ship UI | |

**Quick Ship test (optional):**
1. Type draft title: `TEST Revenue dashboard`  
2. Create draft → **Approve** → copy embed link if shown  
3. Open embed link in **Incognito** window → chart or placeholder loads  

---

### 5.5 Govern group

| # | Click | URL | You should see | PASS / FAIL |
|---|-------|-----|----------------|-------------|
| 5.5.1 | **Compliance** | `/compliance` | Evidence sections | |
| 5.5.2 | **Marketplace** | `/marketplace` | Pack cards | |
| 5.5.3 | **Monk** | `/monk` | Industry pack picker | |
| 5.5.4 | **Eval** | `/eval` | Golden eval UI | |
| 5.5.5 | **Glossary** | `/glossary` | Add term form | |

**Glossary mini-test:**
1. Term: `D2C`  
2. Definition: `Direct to consumer online sales`  
3. Save → term appears in list  

---

### 5.6 Settings (gear icon or sidebar)

| # | Open | You should see | PASS / FAIL |
|---|------|----------------|-------------|
| 5.6.1 | **Members** | Your email + role (Owner/Admin/Member) | |
| 5.6.2 | **AI policy** | Que Agent toggle | |
| 5.6.3 | **Governance** | Export audit button (admin) | |

When all rows PASS → mark **PART 5 PASS**.

---

## Part 6 — Extra tests (when Parts 1–5 pass)

### 6.1 Pipes (natural language job)

1. `/pipes`  
2. Type: `Load Shopify orders, join Razorpay payments, show daily revenue`  
3. Click **Draft** → wait  
4. Click **Approve** → **Apply**

**You should see:** Redirect to a **new Job** notebook.

---

### 6.2 Platform Hub after work

1. Go `/hub`  
2. Click **Refresh**

**You should see:** Module cards show **ready** or **review** (not all empty) after you synced and promoted joins.

---

### 6.3 Load — Provision warehouse (admin only)

1. `/load`  
2. If you see **Provision Que Warehouse** → click it → wait 1–2 min  
3. Go `/studio/grid` → pick a table → **Run grid**

**You should see:** Up to 200 rows OR clear message why not.

---

### 6.4 Monk autopilot (45 min — optional)

1. `/monk`  
2. Pick **Ecommerce** pack → **Start**  
3. Watch phases until **Certify**  
4. `/metrics` → see KPIs

---

## Part 7 — Public pages (no login)

Open in **Incognito** window (Ctrl+Shift+N):

| URL | You should see | PASS / FAIL |
|-----|----------------|-------------|
| `{UI URL}/login` | Login form | |
| `{UI URL}/status` | API health (ok true if up) | |
| `{UI URL}/connectors` | Connector comparison table | |

---

## Part 8 — When something goes wrong

| What you see | What it probably means | What you do |
|--------------|------------------------|-------------|
| Empty Workspace | No sync yet | Part 2 — Sync all sources |
| No suggested joins | Only one source OR need inference | Install 2+ sources → Joins → Run inference |
| Chat `/help` error 500 | Server database old | Tell manager — run migrations on prod |
| Promote button missing | You are **Viewer** | Ask manager to make you **Member** or **Admin** |
| Validate 0 rows | Joins not promoted or wrong SQL table names | Re-do Part 3.3; use `/list` for names |
| “Que Agent disabled” | Toggle off | Settings → AI policy → ON |
| Page white / frozen | Browser or API | Hard refresh Ctrl+F5; try again in 5 min |
| Sync fails all connections | API sleeping (free tier) | Wait 60s, retry; tell manager |

**Do not guess.** Screenshot + exact error text + which step number.

---

## Part 9 — How to report a bug (copy this template)

Send to your manager or Slack #qa:

```
BUG REPORT
---------
Tester: [your name]
Date/time: [when]
Step number: [e.g. Part 3 Step 3.8]
Page URL: [copy from browser address bar]
Workspace: [name]

What I clicked/typed:
[exact buttons and text]

What I expected:
[from "You should see" in this doc]

What actually happened:
[error message or wrong data]

Screenshot: [attach]
PASS/FAIL worksheet row: [e.g. PART 4 FAIL]
```

---

## Part 10 — Suggested schedule for a new tester

| Day | Time | Do this | Done when |
|-----|------|---------|-----------|
| **Day 1** | 1 hr | Part 1 + Part 2 + Step 3.1 Workspace | Login works, all sources synced |
| **Day 2** | 2 hr | Part 3 (joins + job + validate) | Order **5001001** row in Validate grid |
| **Day 3** | 1.5 hr | Part 4 Chat | `/help`, `/list`, engineer join question work |
| **Day 4** | 2 hr | Part 5 (every page) | Worksheet all PASS or bugs filed |
| **Day 5** | 2 hr | Part 6 extras + retest FAIL items | Manager sign-off |

---

## Part 11 — Sign-off (manager checks)

**Tester finished — minimum bar:**

- [ ] Part 1 Login PASS  
- [ ] Part 2 All sources synced  
- [ ] Part 3 Four joins promoted + one rejected  
- [ ] Part 4 Validate shows order **5001001** with golden numbers  
- [ ] Part 4 Chat `/help` and `/list` PASS  
- [ ] Part 5 Every sidebar page opens without crash  
- [ ] Bug reports filed for every FAIL  

**Demo-ready for customer:** above + one Ship or BI draft created  
**Production-ready:** manager runs automated smoke on API (not your job unless asked)

---

## Appendix A — All POC packs (if manager asks you to install more)

Install from **Sources** page → scroll to **POC packs**:

| Pack name | Connectors added | Good for testing |
|-----------|------------------|------------------|
| **India D2C commerce POC pack** | Shopify, Razorpay, Stripe | Main order **5001001** story |
| **India SMB full stack POC** | MySQL, Shopify, Razorpay | Line items + OLTP |
| **Marketing attribution POC pack** | Google Ads, Shopify | Campaign → order ids |
| **India SaaS billing POC pack** | Chargebee, Stripe, HubSpot | Subscriptions + CRM |
| **SF ↔ DBX fixture POC pack** | Snowflake, Databricks | Warehouse joins |

After each install: **Sync every new connection** before testing joins.

---

## Appendix B — File fixtures (only if manager sets up local Postgres)

Folder: `docs/tester-fixtures/postgres/`

If manager runs Docker Postgres locally, connect in Que:

| Field | Value |
|-------|-------|
| Host | `localhost` |
| Port | `5432` |
| Database | `customer_demo` |
| User | `stitch` |
| Password | `stitch` |
| Schema | `public` |

After sync, Catalog should show **2500 customers**, **3500 orders** (counts in UI may vary).

Excel/Mongo/SportEdge folders: ask manager which files to upload on **Sources → Excel/CSV**.

---

## Appendix C — Chat prompt cheat sheet (print me)

**Engineer — paste one line at a time:**

```
/help
/list
/describe orders
/suggested
How do I join Shopify orders to Razorpay payments?
/que Create a job joining Shopify orders and Razorpay payments for order 5001001
/outcome I want D2C revenue reconciled across Shopify, Razorpay, and Stripe
```

**CEO — paste:**

```
What tables do we have?
What is total revenue for order 5001001?
```

---

*Version 2026-08-28 · Written for first-time manual testers · Golden keys from `api/fixtures/*_demo.json`*
