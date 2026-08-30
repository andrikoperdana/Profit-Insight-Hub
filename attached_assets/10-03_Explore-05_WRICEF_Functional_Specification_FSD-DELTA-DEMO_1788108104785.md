# Activate - SPH | WRICEF Functional Specification Document (FSD)

**Document Information**
- **Project Name**: SecureProfit Hub (SPH) Implementation
- **Parent Master FSD**: `10-03_Explore-05_WRICEF_Functional_Specification_FSD_SPH_v0.01.md`
- **Document Identifier**: SPH-FSD-E-DEMO-01
- **WRICEF Title**: Multi-Choice Industry Sector Selector at Lead Creation
- **WRICEF Type**: Enhancement (E)
- **Phase**: 03 - Explore / 04 - Realize
- **Workstream**: Commercial Intake & CRM
- **Sprint Allocation**: Sprint 1 (2 Story Points)
- **Complexity**: Simple
- **Functional Author**: Antigravity AI (Commercial Track)
- **Business Process Owner**: Hendra Wijaya (Commercial Lead)
- **Version**: v0.02
- **Status**: Draft
- **Date**: 2026-08-28

---

## 1. Business Requirement & Objective
- **Business Need**: Large corporate clients and conglomerates often span multiple industries (e.g., Financial Services and Telecommunications, or Healthcare and Government). Restricting lead creation to a single industry dropdown prevents multi-sector account segmentation, analytics, and targeted consultant staffing.
- **User Story**: *As a Sales AE, I want to select multiple industry sectors during lead creation, so that multi-sector corporate accounts are categorized accurately in the pipeline.*
- **Trigger Event**: User opens the "Create Lead" modal in `web/src/pages/Leads.tsx` and interacts with the Industry field.

---

## 2. Immediate Operational & System Effect Post-Implementation

> [!IMPORTANT]
> **Developer Goal & Operational Target**:
> This customization transforms how SPH classifies enterprise market segments, shifting from rigid single-string values to searchable multi-dimensional industry arrays.

### Immediate Effects:
1. **Multi-Sector Account Categorization**: Sales AEs can immediately tag conglomerate and multi-sector opportunities with composite industry sectors (e.g., Banking + Telecommunications) without data truncation.
2. **Dynamic Pipeline & Kanban Filtering**: The Leads pipeline filtering engine can instantly query and aggregate deals across overlapping industry sectors.
3. **Targeted Consultant Skill Pre-Matching**: Eliminates miscategorized accounts, enabling the Resource Matching Recommender (`E-03`) to pre-screen consultants with the exact industry compliance domain experience (e.g., PCI-DSS for Banking, HIPAA for Healthcare).

---

## 3. Functional Architecture & Data Flow

```mermaid
flowchart TD
    User["Sales AE / Commercial Ops"] -->|1. Opens Lead Creation Modal| UI["Lead Intake Form (React UI)"]
    UI -->|2. Selects Multiple Industries (e.g. Banking, Telecom)| Chip["Multi-Select Tag / Chip Component"]
    Chip -->|3. Submits Form (POST /api/leads)| API["Leads Controller (routes/leads.ts)"]
    API -->|4. Validates String[] Array| DB["PostgreSQL Database (Prisma)"]
    DB -->|5. Persists industries array in Lead model| LeadRecord["Lead Record (industries: String[])"]
```

---

## 4. Detailed Functional Requirements & Business Rules

### 4.1 UI & Frontend Behavior
1. **Component Type**: Searchable multi-select chip input (Ant Design / Tailwind UI pattern).
2. **Standard Option Catalog**:
   - `BANKING_FINANCE` (Banking & Financial Services)
   - `TELECOMMUNICATIONS` (Telecommunications & Media)
   - `HEALTHCARE_PHARMA` (Healthcare & Pharmaceuticals)
   - `ENERGY_UTILITIES` (Oil, Gas, Energy & Mining)
   - `GOVERNMENT_PUBLIC` (Public Sector & Defense)
   - `RETAIL_ECOMMERCE` (Retail, FMCG & E-Commerce)
   - `MANUFACTURING` (Industrial Manufacturing & Logistics)
   - `TECHNOLOGY` (Tech, SaaS & Startups)
   - `OTHER` (Other Services)
3. **Selection Rule**: Minimum 1 industry required; Maximum 5 industries per lead.
4. **Visual Display**: Selected items render as removable chips/tags. In the pipeline table/kanban view, if $> 2$ tags are selected, render as `Tag1, Tag2 +N more`.

### 4.2 Data Model & API Contract
- **Prisma Schema Update**:
  ```prisma
  model Lead {
    id          String   @id @default(cuid())
    leadNumber  String   @unique
    title       String
    industries  String[] @default([]) // Converted from scalar industry String? to String[]
    // ...
  }
  ```
- **API Endpoint**: `POST /api/leads` / `PUT /api/leads/:id`
  ```json
  {
    "title": "Enterprise Cloud Migration",
    "clientId": "cl_acme_corp_01",
    "industries": ["BANKING_FINANCE", "TELECOMMUNICATIONS"],
    "businessUnitId": "bu_cloud_01"
  }
  ```

---

## 5. Error Handling & Edge Cases
- **Empty Selection**: If `industries` array is empty upon submission, UI blocks submission and returns validation error: `"At least one industry sector must be selected."`
- **Exceeding Maximum**: If user attempts to select $> 5$ industries, selector prevents adding further chips and displays notification: `"Maximum 5 industries allowed."`
- **Legacy Record Migration**: Existing single-string `industry` values are migrated to `industries: [existing_industry]` via Prisma migration script.

---

## 6. Test Scenarios & Acceptance Criteria

| Test Case ID | Test Scenario | Input Data | Expected Result | Pass / Fail |
| :---: | :--- | :--- | :--- | :---: |
| **TC-DEMO-01-01** | Standard multi-industry selection | Select `BANKING_FINANCE` + `TELECOMMUNICATIONS` | Form validates; `industries` saved as 2-element array | [ ] |
| **TC-DEMO-01-02** | Validation on empty industry | Select 0 industries and submit | Form blocks submit; displays required validation message | [ ] |
| **TC-DEMO-01-03** | Max limit boundary check | Attempt to select 6 industries | 6th item disabled; warning banner displayed | [ ] |
| **TC-DEMO-01-04** | Pipeline filter by industry | Filter pipeline by `BANKING_FINANCE` | Displays all leads containing `BANKING_FINANCE` in array | [ ] |

---

## 7. Sign-off and Approvals

| Stakeholder Role | Name & Title | Signature | Date |
| :--- | :--- | :--- | :--- |
| **Commercial Process Owner** | | ____________________ | YYYY-MM-DD |
| **Lead Technical Architect** | | ____________________ | YYYY-MM-DD |

---

## 8. Document Revision History

| Version | Date | Author / Role | Summary of Changes |
| :---: | :---: | :--- | :--- |
| `v0.01` | 2026-08-28 | Antigravity AI | Initial functional specification creation. |
| `v0.02` | 2026-08-28 | Antigravity AI | Added dedicated Section 2: Immediate Operational & System Effect Post-Implementation. |
