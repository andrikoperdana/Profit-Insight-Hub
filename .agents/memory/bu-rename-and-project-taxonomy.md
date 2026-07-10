---
name: BU rename & project taxonomy
description: How Business Unit renames propagate (FK-safe in-place) and the dual projectType.ts copies that must stay aligned.
---

# BU rename & project taxonomy

- Current BU set (July 2026): Pentest, Governance (ex-GRC), Solution (ex-Threat Hunting), MSS, Forensic.
- **Rule:** BU renames must be UPDATE-in-place on the existing row (same id) so all FK references (User, ProjectWorkstream, TaskTemplate, ProjectTemplate) follow automatically. The seed has a rename-aware loop (old→new, only if the target name is absent) — never insert-new + delete-old.
- **Why:** BusinessUnit.name is unique and referenced by 4 tables; recreating rows would orphan or require rewiring every reference.
- Workstream `code: "GRC"` in sample data is a **stable key** (expense-category logic compares `w.code === "GRC"`), not a display name — do NOT rename codes when renaming BU display names.
- `projectType.ts` exists in TWO copies (api-server/src/lib + web/src/lib) that must be edited in lockstep; taxonomy: Pentest, VAPT, Governance, SOC, MSS, Solution, Threat Modeling, Fraud Investigation, Forensic, Red Team, Audit, Training, Other. MSS rule must stay BEFORE the SOC rule so "Managed SOC"/"managed security"/MDR classify as MSS.
- **How to apply:** any future taxonomy/BU change = edit both projectType.ts copies + seed buSeed/buRenames + sample buName strings + dev seed run + guarded prod SQL (NOT EXISTS target, dry-run ROLLBACK then COMMIT).
- Prod once contained user-created `F-*` test BUs; they were deleted (0 FK refs verified). If unexpected extra BUs appear in prod again, check FK counts before deleting.
