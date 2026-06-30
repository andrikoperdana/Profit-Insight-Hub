# Adding a Commission Tracker Feature to SecureProfit Hub
### Feasibility Study, Pros/Cons, and Required Application Changes

> Decision document for management. Written so it can be used to respond to the person requesting this feature.
> Status: **not started** — this is a study only.

---

## 1. Executive Summary

Sales commissions are currently calculated **manually in an Excel file** (`ITSEC Commission Tracker`), per quarter, sourced from a **PSOhub** export. The request: **move this process into an automated feature inside SecureProfit Hub.**

**Conclusion: FEASIBLE.** Roughly **80% of the data (invoices + margin) already exists** in the app and can be computed automatically. The main effort is **not** the money math; it is adding the **commission attribution layer** (who gets credited and by how much) plus **rate configuration** and a **dedicated UI**.

**Agreed direction:** commissions are computed automatically from SecureProfit Hub data (using the app's **actual margin**), not imported from PSOhub files.

---

## 2. What Is Being Requested (summary of the spreadsheet)

The spreadsheet is a **quarterly Sales Commission Tracker** with 7 sheets: Instructions, Config, Raw Data, Commission Data — Sales, Commission Data — Presales, Summary, and Commission Slip.

Core logic:

- **Commission base = margin (gross profit), not revenue.** `Commission Base = Revenue Net × Applied Margin`.
- **Margin rule:** for projects with status exactly "Closed" → use the most conservative margin (`MIN(estimate, final)`); other statuses → use the estimated margin only.
- **Commission rates:**
  - Sales PIC: **5%** (flat per quarter)
  - Umbrella Contract: PIC pool **2.5%** + PM **2.5%**
  - Sales Manager: **0.7%**
  - Sales Director: **0.3%**
  - Presales: **3.5%**
  - Referral pool: **1%** of margin (deducted from the PIC's net)
- **Share-based:** up to 3 PICs per deal with a percentage split (totaling 100%); Manager/Director only receive the override if they are not a PIC on that deal; referral is allocated proportionally to PIC shares.
- **Output:** a per-person Summary across all roles, and a per-person Commission Slip (detailed breakdown).

---

## 3. Benefits (PROS) of Moving This Into the App

1. **Eliminate manual work & human error.** No more copy-pasting exports every quarter, broken formulas, or corrupted files.
2. **Single source of truth.** Commissions use the same invoice & margin data as the Finance/Management dashboards — no more "Excel vs system" reconciliation.
3. **Stronger, more defensible margin.** The app computes margin from **actual** costs (approved timesheets + expenses), not just deal-sheet estimates.
4. **Automatic per-quarter + instant slips.** Periods, summaries, and per-person slips can be generated and exported (PDF/XLSX) using the export engine the app **already has**.
5. **Far better confidentiality.** Commission data is CONFIDENTIAL. In-app it can be restricted by role (e.g. Management/Finance only, plus each person seeing their own slip) — much safer than circulating an Excel file.
6. **Automatic audit trail.** Every change is recorded (who, when, what).
7. **Scalable.** Adding people or changing roles is done via master data, not by editing formulas across many cells.

---

## 4. Risks & Drawbacks (CONS)

1. **Commission figures may differ from the old PSOhub sheet.** The app uses **actual** margin; PSOhub uses **estimated/deal-sheet** margin. For **in-flight** projects the gap can be noticeable; for Closed projects they tend to converge. Requires socialization before official use.
2. **WHT (withholding tax) is not tracked by the app.** In the spreadsheet, "Revenue Net = Gross − WHT". The app does not yet store WHT per invoice — it must be ignored, approximated, or added as a small field.
3. **"Service Type" is less granular than the spreadsheet.** The app groups via Business Unit (Pentest/GRC/Threat Hunting), whereas the spreadsheet uses finer categories (Pentest/Governance/Solution/MSS/Forensic). Mapping or additional categories are needed.
4. **This is a large feature, not a small tweak.** It needs development time, testing, and master-data setup (deciding who is Manager/Director/Presales, flagging Umbrella projects, assigning PIC shares).
5. **Depends on data discipline.** If timesheets/expenses are not entered consistently, the actual margin (and therefore the commission) becomes inaccurate.
6. **Policy decisions are required first.** For example: is commission recognized when an invoice is **INVOICED** or when it is **PAID** (cash-in)? This affects the results.

---

## 5. Required Application Changes

### A. Data (new models / changes)
1. **Multi-PIC sales attribution + share%** per project/invoice. Today a project has only **one** salesperson (`salesId`), with no percentage split. *(the most important change)*
2. **New roles/markers:** Presales, Sales Manager, Sales Director, plus per-deal Presales assignment (up to 3 + shares).
3. **"Umbrella Contract" marker** on projects + a mechanism for the PM's 2.5% commission.
4. **Referral** (name + percentage) per deal.
5. **Editable commission rate configuration** (effective per quarter / per effective date).
6. *(Optional)* a **WHT** field per invoice; finer **Service Type** granularity.

### B. Calculation logic
7. **Deterministic commission engine** that mirrors the Excel formulas **1:1**: applied margin (conservative rule), commission base, PIC share allocation, referral deduction, Manager/Director override, Presales commission.
8. **Quarter period & payout date** determination.

### C. UI (new pages)
9. **Commission page**: rate configuration, per-invoice/per-quarter credit assignment, **per-person Summary**, **per-person Slip**, and **XLSX/PDF export**.

### D. Access & security
10. **Strict access control** (CONFIDENTIAL): who may view whose commission — likely Management/Finance only, plus each person being able to view their own slip.

### E. Process & master data
11. **Master-data population**: lists of Presales/Manager/Director, flagging Umbrella projects, and assigning PIC shares (including historical data if backfilling is desired).

---

## 6. Points to Communicate to the Requester

- Results will use the app's **actual margin**, so they **may differ** from the old Excel file (especially for in-flight projects). Agreement is needed that this becomes the new reference.
- Commission accuracy **depends on data completeness** (timesheets, expenses, PIC & share assignment). Input discipline is mandatory.
- Several **policy decisions** must be finalized before starting (see Section 8).

---

## 7. Phased Approach (recommended execution)

- **Phase 1 — Calculation engine:** data model + commission engine that mirrors the Excel formulas, validated against the sample file so the numbers match.
- **Phase 2 — UI:** rate configuration page, credit assignment, Summary, Slip, and export.
- **Phase 3 — Security & data:** access control, audit, and historical data population/backfill.

---

## 8. Questions the Requester Must Answer (before we start)

These are the decisions only the requesting party (the business) can make. The feature cannot be finalized without clear answers:

1. **Commission recognition basis:** when an invoice is **INVOICED**, or when it is **PAID** (cash-in)?
2. **WHT treatment:** ignore it, approximate it, or track it officially per invoice?
3. **Margin source for in-flight projects:** accept the app's actual margin as-is, or allow a manual margin override per deal?
4. **Access scope:** who is allowed to view commission data (beyond each person's own slip)?
5. **Master data — people:** who is designated as Sales Manager, Sales Director, and Presales?
6. **Master data — Umbrella:** which projects count as Umbrella Contracts (so the PM share applies)?
7. **Multi-PIC shares:** how are PIC percentage splits decided and approved per deal?
8. **Referral:** who can register referrals, and what is the approval rule for the 1% pool?
9. **Backfill:** should previous quarters be recalculated, or do we start from the current quarter only?
10. **Rate authority:** who is allowed to edit the commission rate table, and how often can rates change?

---

## 9. Recommendation

**Proceed, with a phased rollout.** The app's financial foundation is mature and a good fit; the value is high (automation, accuracy, confidentiality, audit). The only prerequisites before execution are **finalizing the policy decisions in Section 8** and **preparing the master data**. After that, this feature can be built without disrupting the modules already in production.
