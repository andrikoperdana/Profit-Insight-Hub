# Activate - SPH | WRICEF Functional Specification Document (FSD)

**Document Information**
- **Project Name**: SecureProfit Hub (SPH) Implementation
- **Parent Master FSD**: `10-03_Explore-05_WRICEF_Functional_Specification_FSD_SPH_v0.01.md`
- **Document Identifier**: SPH-FSD-E-DEMO-05
- **WRICEF Title**: Lead Types & Historical Deal Lineage Linking
- **WRICEF Type**: Enhancement (E)
- **Phase**: 03 - Explore / 04 - Realize
- **Workstream**: Commercial Intake & Account Management
- **Sprint Allocation**: Sprint 1 (5 Story Points)
- **Complexity**: Medium
- **Functional Author**: Antigravity AI (Commercial Track)
- **Business Process Owner**: Hendra Wijaya (Commercial Lead)
- **Version**: v0.02
- **Status**: Draft
- **Date**: 2026-08-28

---

## 1. Business Requirement & Objective
- **Business Need**: Opportunities originate from new accounts, annual contract renewals, expansion of existing projects (up-sell), or selling adjacent practice services into existing clients (cross-sell). Tracking deal type and linking the parent project/lead provides commercial auditability, historical pricing context, and Net Revenue Retention (NRR) reporting.
- **User Story**: *As a Sales Manager, I want to categorize lead types (New Opportunity, Renewal, Up-sell, Cross-sell) and link previous deals/projects, so that account lineage and historical delivery context are traceable.*
- **Trigger Event**: User selects `leadType` $\ne$ `NEW_OPPORTUNITY` during lead intake in `web/src/pages/Leads.tsx`.

---

## 2. Immediate Operational & System Effect Post-Implementation

> [!IMPORTANT]
> **Developer Goal & Operational Target**:
> This customization implements relational deal lineage tracking, providing historical delivery and pricing context while unlocking Net Revenue Retention (NRR) corporate metrics.

### Immediate Effects:
1. **Context-Rich Commercial Negotiations**: Sales reps can immediately open previous project contracts, historical rate cards, and EVM performance summaries during renewal or upsell discussions.
2. **Automated NRR & Expansion Analytics**: Differentiates net-new logos from existing customer expansion, feeding executive reports on Net Revenue Retention (NRR) and Customer Lifetime Value (LTV).
3. **Visual Deal Lineage**: Renders interactive lineage badges in UI linking opportunities directly to parent project workspaces (`🔗 Renewal of PRJ/2025/042`).

---

## 3. Functional Architecture & Data Flow

```mermaid
flowchart TD
    User["Sales AE"] -->|1. Selects Lead Type (e.g. RENEWAL)| TypeSelect["Lead Type Selector (LeadType Enum)"]
    TypeSelect -->|2. If not NEW_OPPORTUNITY| ParentSelect["Parent Project / Lead Picker"]
    ParentSelect -->|3. Query previous projects for Client| ClientPrjs["GET /api/clients/:clientId/projects"]
    ClientPrjs -->|4. User selects Parent Project| LinkPrj["Set parentProjectId / parentLeadId"]
    LinkPrj -->|5. Save Lead Form| DB["PostgreSQL (Lead table)"]
    DB -->|6. Renders Lineage Badge| UI["UI Lead Details View (Lineage Badge)"]
```

---

## 4. Detailed Functional Requirements & Business Rules

### 4.1 Lead Type Classification
1. `NEW_OPPORTUNITY`: Net-new client or first-time service acquisition (no parent link required).
2. `RENEWAL`: Annual or recurring subscription/service contract renewal (requires `parentProjectId`).
3. `UP_SELL`: Additional scope, hours, or tier upgrade to an active engagement (requires `parentProjectId`).
4. `CROSS_SELL`: New practice offering sold to an existing client account (requires `parentProjectId` or `parentLeadId`).

### 4.2 Dynamic Parent Link Selector
- When `leadType` is set to `RENEWAL`, `UP_SELL`, or `CROSS_SELL`:
  - An input field titled **"Reference Previous Project / Engagement"** becomes **mandatory**.
  - Dropdown displays all historical projects for the selected client with status and contract value: `[PRJ/2025/042] Cloud Security Hardening ($85,000 - COMPLETED)`.
- UI renders an interactive **Lineage Pill** in the lead header: `🔗 Renewal of PRJ/2025/042`. Clicking the badge opens the parent project overview in a slide-out drawer.

---

## 5. Error Handling & Edge Cases
- **Missing Parent Link**: If user selects `RENEWAL` or `UP_SELL` without selecting a parent project, form validation halts: *"Previous Project reference is required for Renewal and Up-sell deals."*
- **Cross-Client Integrity**: The parent project selector strictly restricts queries to the matching `clientId`.

---

## 6. Test Scenarios & Acceptance Criteria

| Test Case ID | Test Scenario | Input Data | Expected Result | Pass / Fail |
| :---: | :--- | :--- | :--- | :---: |
| **TC-DEMO-05-01** | Create Renewal lead with parent project | Type = `RENEWAL`, Parent = `PRJ/2025/042` | Lead saved with `parentProjectId`; Lineage badge rendered | [ ] |
| **TC-DEMO-05-02** | Validation on missing parent link | Type = `UP_SELL`, Parent = empty | Form blocks submission with validation alert | [ ] |
| **TC-DEMO-05-03** | New opportunity bypass | Type = `NEW_OPPORTUNITY` | Parent picker hidden; lead submits normally | [ ] |
| **TC-DEMO-05-04** | Lineage navigation | Click Lineage badge in lead view | Opens parent project summary drawer | [ ] |

---

## 7. Sign-off and Approvals

| Stakeholder Role | Name & Title | Signature | Date |
| :--- | :--- | :--- | :--- |
| **Commercial Process Owner** | | ____________________ | YYYY-MM-DD |
| **Lead Technical Architect** | | ____________________ | YYYY-MM-DD |

---

## 8. Document Revision History

| Version | Date | Author / Role | Summary of Changes |
| :---: | :--- | :--- | :--- |
| `v0.01` | 2026-08-28 | Antigravity AI | Initial functional specification creation. |
| `v0.02` | 2026-08-28 | Antigravity AI | Added dedicated Section 2: Immediate Operational & System Effect Post-Implementation. |
