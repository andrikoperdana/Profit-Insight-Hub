---
name: Non-commercial project lifecycle exemptions
description: How INTERNAL/PRESALES/TRAINING projects are exempted from billing & BAST gates, and where the rule must stay mirrored.
---

# Non-commercial project exemptions

Project.kind (CLIENT default; INTERNAL/PRESALES/TRAINING are "non-commercial" — no client invoice). Any kind != CLIENT is exempt from the invoice/BAST-related lifecycle requirements.

**Rule (must stay consistent across these points):**
- ACTIVE gate: skip `contractValue > 0` and the billing-milestone-totals-100% checks.
- COMPLETE gate: skip the "no PLANNED billing milestone" and "BAST uploaded" checks.
- Still enforced for all kinds: core Overview, PM, ≥1 Resource/Task/RAID, estimatedCost>0, plannedMandays>0, tasks DONE, no SUBMITTED timesheet, no PENDING expense, no OPEN RAID, statusChangeReason.
- Web: Billing + Report tabs (trigger AND content) hidden when kind != CLIENT; Financials stays visible but renders a cost-only view (budget/actual/accrued/remaining/burn/forecast cost) instead of revenue/profit/margin.

**Why:** internal/presales/training work has no client billing or handover, so forcing 100% billing milestones + BAST made those projects un-activatable/un-completable.

**How to apply:** the gate uses an *effective kind* — `b.kind` is only honored when the caller is MANAGEMENT/SUPER_ADMIN, otherwise it falls back to the stored kind. Never let a non-privileged PATCH `kind` change relax a gate. If you add a new billing/invoice/BAST-style gate, also exempt non-commercial there or internal projects will silently break again.
