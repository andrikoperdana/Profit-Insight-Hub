# Activate - SPH | WRICEF Functional Specification Document (FSD)

**Document Information**
- **Project Name**: SecureProfit Hub (SPH) Implementation
- **Parent Master FSD**: `10-03_Explore-05_WRICEF_Functional_Specification_FSD_SPH_v0.01.md`
- **Document Identifier**: SPH-FSD-I-DEMO-07
- **WRICEF Title**: Pipedrive Inbound Deal Margin Health Evaluator
- **WRICEF Type**: Interface (I)
- **Phase**: 03 - Explore / 04 - Realize
- **Workstream**: Commercial Integrations & Risk Controls
- **Sprint Allocation**: Sprint 2 (5 Story Points)
- **Complexity**: Medium
- **Functional Author**: Antigravity AI (Integration Track)
- **Business Process Owner**: Hendra Wijaya (Commercial Lead) & Maya Anggraini (Finance Lead)
- **Version**: v0.02
- **Status**: Draft
- **Date**: 2026-08-28

---

## 1. Business Requirement & Objective
- **Business Need**: Opportunities synchronized from Pipedrive CRM may contain pricing negotiated below corporate margin thresholds. Evaluating margin health automatically upon inbound webhook ingestion prevents unprofitable deals from progressing through the sales funnel unnoticed.
- **User Story**: *As a Commercial Lead, I want Pipedrive deals evaluated for margin health upon sync, so that unprofitable deals (< 25% gross margin) raise automatic management alerts.*
- **Trigger Event**: Inbound webhook received at `POST /api/pipedrive/webhook` with deal update payload.

---

## 2. Immediate Operational & System Effect Post-Implementation

> [!IMPORTANT]
> **Developer Goal & Operational Target**:
> This customization implements an automated pre-flight profitability gate on all CRM synchronization events, intercepting loss-making contracts before they reach commercial commitment.

### Immediate Effects:
1. **Automated CRM Profitability Screen**: Inbound Pipedrive webhook payloads are automatically evaluated against the corporate $25\%$ gross margin threshold ($\text{Margin} = \frac{\text{Value} - \text{Cost}}{\text{Value}} \times 100$).
2. **Instant Management Alerting**: Flagged deals immediately trigger real-time warning badges (`⚠️ CRITICAL LOW MARGIN`) and email notifications to the Commercial Lead and Finance Controller.
3. **Loss-Leader Prevention**: Prevents deeply discounted deals closed in external CRM tools from entering the delivery pipeline without formal executive awareness and pricing escalation.

---

## 3. Functional Architecture & Data Flow

```mermaid
flowchart TD
    Pipedrive["Pipedrive CRM Cloud"] -->|1. Webhook HTTP POST (HMAC Signed)| Hook["routes/pipedrive.ts (Webhook Handler)"]
    Hook -->|2. Verify Signature & Parse Custom Fields| Parser["Extract Deal Value & Estimated Cost"]
    Parser -->|3. Compute Margin %| Formula["Margin = ((Value - Cost) / Value) * 100"]
    Formula --> CheckThreshold{"Margin < 25.0%?"}
    CheckThreshold -- YES --> FlagRisk["4a. Set Lead.hasLowMarginAlert = true\n4b. Dispatch Alert to Sales Management"]
    CheckThreshold -- NO --> CleanSync["4c. Set Lead.hasLowMarginAlert = false"]
    FlagRisk & CleanSync --> SaveLead["5. Upsert Lead in PostgreSQL"]
```

---

## 4. Detailed Functional Requirements & Business Rules

### 4.1 Margin Formula & Thresholds
- **Formula**:
  $$\text{Gross Margin \%} = \left(\frac{\text{Deal Value} - \text{Estimated Delivery Cost}}{\text{Deal Value}}\right) \times 100$$
- **Threshold Rule**:
  - If $\text{Gross Margin} \ge 35\%$: Status = `HEALTHY` (Green Badge).
  - If $25\% \le \text{Gross Margin} < 35\%$: Status = `MODERATE` (Yellow Badge).
  - If $\text{Gross Margin} < 25\%$: Status = `CRITICAL_LOW_MARGIN` (Red Warning Banner + In-app Alert).

### 4.2 Notification Dispatch
- When a deal is flagged `CRITICAL_LOW_MARGIN`:
  - An alert is dispatched to `Commercial Lead` and `Finance Controller`.
  - Notification text: *"⚠️ Low Margin Alert: Pipedrive Deal '[Deal Title]' has an estimated margin of [X]%, which is below the 25% corporate threshold."*

---

## 5. Error Handling & Edge Cases
- **Missing Cost Field in Pipedrive**: If Pipedrive payload does not contain an estimated cost custom field, SPH assigns a `MARGIN_UNVERIFIED` flag and prompts the AE to input cost in SPH.
- **Zero Value Deal**: If deal value is 0, margin check is bypassed to prevent division by zero.

---

## 6. Test Scenarios & Acceptance Criteria

| Test Case ID | Test Scenario | Input Data | Expected Result | Pass / Fail |
| :---: | :--- | :--- | :--- | :---: |
| **TC-DEMO-07-01** | Healthy margin sync | Value = $100k, Cost = $60k (40% Margin) | Lead saved; Margin status = `HEALTHY` | [ ] |
| **TC-DEMO-07-02** | Low margin alert trigger | Value = $100k, Cost = $80k (20% Margin) | Low-margin flag set; alert sent to Commercial Lead | [ ] |
| **TC-DEMO-07-03** | Missing cost field handling | Value = $50k, Cost = null | Status set to `MARGIN_UNVERIFIED` | [ ] |

---

## 7. Sign-off and Approvals

| Stakeholder Role | Name & Title | Signature | Date |
| :--- | :--- | :--- | :--- |
| **Commercial Process Owner** | | ____________________ | YYYY-MM-DD |
| **Finance Process Owner** | | ____________________ | YYYY-MM-DD |

---

## 8. Document Revision History

| Version | Date | Author / Role | Summary of Changes |
| :---: | :--- | :--- | :--- |
| `v0.01` | 2026-08-28 | Antigravity AI | Initial functional specification creation. |
| `v0.02` | 2026-08-28 | Antigravity AI | Added dedicated Section 2: Immediate Operational & System Effect Post-Implementation. |
