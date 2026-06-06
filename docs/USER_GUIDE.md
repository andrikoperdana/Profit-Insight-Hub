# SecureProfit Hub — User Guide

A complete walkthrough of every feature in the SecureProfit Hub web application
for the non-technical end user. SecureProfit Hub is a project, time and
profitability management system designed for an Indonesian IT security
consulting firm.

---

## 1. Getting Started

### 1.1 Logging In

1. Open the application URL in your browser.
2. Enter your email and password and click **Initialize Session**.
3. On first login the test environment shows a "Test Credentials" panel for
   each role — these can be used for demo or training purposes.

If you enter the wrong password 5 times within 15 minutes, the login form is
locked for that email/IP combination for 15 minutes (brute‑force protection).

### 1.2 Roles and What You Can See

The sidebar adapts to your role. The roles are:

| Role | Typical user | Main responsibilities |
|---|---|---|
| **MANAGEMENT** (PMO Director) | Senior management | Full visibility, BI, audit logs, all approvals |
| **PROJECT_MANAGER** | PM | Approve timesheets, manage their projects, capacity planning |
| **SALES** | Account exec | Register new opportunities, track contract value |
| **KONSULTAN** | Consultant / Pentester | Submit timesheets against assigned projects |
| **TECHNICAL_WRITER** | Report writer | Submit timesheets, write deliverables |
| **ADMIN_PROJECT** | Project administrator | Upload BAST/Invoices, manage clients |

### 1.3 The Sidebar

* **Dashboard** — your role-specific home page
* **Projects** — list and detail of all projects
* **Time Tracking** — your personal timesheet entries
* **Approval Inbox** *(PM/Management)* — pending timesheets to approve
* **Resources** *(PM/Management)* — utilization of every consultant
* **Capacity Planning** *(PM/Management)* — upcoming workload calendar
* **Clients** *(Management/Admin)* — client master data
* **Users** *(Management)* — user master data
* **Business Intelligence** *(Management)* — executive analytics
* **Audit Log** *(Management)* — full change history
* **Settings** — your profile and preferences

The user avatar at the bottom-left shows your name and role and includes the
**Logout** button.

---

## 2. Dashboards

The dashboard automatically adjusts to your role.

### 2.1 Management Dashboard

Shows the entire firm at a glance:

* KPI tiles: total projects, active projects, total contract value, total
  actual cost, total actual profit, average margin, pending timesheets, and
  total mandays delivered.
* **Profit Trend** chart (revenue vs cost vs profit over time).
* **Status Breakdown** (Observation / Active / Pause / Complete / Closed).
* **Top Projects** by contract value.
* **Project Type** quick stats.
* **Pending Approval Aging** — shows how old the oldest unapproved timesheet
  is, with 24h / 48h / 72h+ buckets.
* **Utilization Trend** — daily utilization for the past 30 days.
* **Resource Utilization Detail** — per‑person status (Active / Idle /
  Overloaded), assignment end dates, and people finishing soon.
* **Recent Activity** — the latest events from across the system.

### 2.2 Project Manager Dashboard

A focused subset of the Management dashboard, restricted to projects where the
user is the assigned PM.

### 2.3 Other Roles

Sales / Konsultan / Writer / Admin land on a personal dashboard that shows
their open work and recent activity.

---

## 3. Projects

### 3.1 Project List

The Projects page lists every project with: code (SPK/PO), name, client,
status badge, contract value, profit, and margin. You can filter by status and
search by name or code.

### 3.2 Creating a Project

Click **+ New Project** (Sales or Management).

Fill in:

* SPK/PO code (must be unique)
* Name and description
* Client (select from the client master)
* Sales and PM owners
* Start and end dates
* Contract value (IDR), estimated cost, planned mandays

The project starts in **OBSERVATION** status.

### 3.3 The 5-Status Lifecycle

| Status | Meaning | How to reach it |
|---|---|---|
| **OBSERVATION** | Pre‑sales / opportunity | Default on creation |
| **ACTIVE** | Work in progress | Manual change |
| **PAUSE** | Temporarily on hold | Manual — **requires a written reason** |
| **COMPLETE** | Delivery done, awaiting closure | Manual — **requires a written reason** |
| **CLOSED** | Fully closed (no further changes) | **Automatic** when both BAST and Invoice are uploaded |

The "Last status change reason" is shown as a yellow banner on the project
detail page so everyone can see why a project was paused or completed.

### 3.4 Project Detail

The project detail page contains several panels:

* **Header** — name, code, status badge, status changer.
* **Financial summary** — contract value, estimated cost, actual cost, actual
  profit, margin %, planned vs actual mandays.
* **Timeline / Gantt** view of the project window.
* **Resources** — consultants assigned, with planned mandays and daily rate.
  PM/Management can add or remove resources here.
* **Timesheets** — all approved/submitted hours for this project.
* **Documents** — upload area for BAST, Invoice, Contract, Other. When both a
  BAST **and** an Invoice are uploaded the project auto-closes.
* **Activity** — chronological project events.

### 3.5 Excel Export

Use the **Export** button on the project list to download an Excel file of the
filtered project list with all financial KPIs. Other lists (timesheets,
resource utilization) also offer Excel export where applicable.

---

## 4. Time Tracking

### 4.1 Submitting Timesheets

1. Open **Time Tracking**.
2. Click **New Entry**.
3. Pick the project, date, hours (must be > 0 and ≤ 24), and optional
   description (max 1000 characters).
4. Save as **DRAFT** to keep editing, or **Submit** to send to your PM.

A submitted timesheet cannot be edited until your PM rejects it back to draft.

### 4.2 Approval Inbox (PM / Management)

The **Approval Inbox** shows every timesheet currently in **SUBMITTED** state
for projects you own (or all projects, for Management).

For each entry you can:

* **Approve** — the hours are now counted toward project cost and the
  consultant's utilization.
* **Reject** with a reason — the timesheet returns to the consultant as
  **REJECTED** with your note attached.

The dashboard "Pending Approval Aging" widget highlights entries older than 48
hours so nothing slips through.

### 4.3 Work Hours Compliance

Some roles are expected to log a full work week. The required roles are
**Project Manager, Konsultan, Technical Writer**, and the three **Principal**
supervisors. Each of them must log **40 hours per week** (8 hours × Monday to
Friday). Other roles (Admin Project, Sales, Finance, HR, Management, Site Admin)
are exempt and do not see this feature.

**Your own view.** If you are a required role, a **Work Hours** card appears on
your dashboard showing logged hours vs. target for **this week, this month, and
this year**, plus any hours still **pending approval** (shown separately because
only approved hours count once reviewed). A status tells you where you stand:

* **On Target** — you have met the target.
* **On Track** — you are keeping pace with the days elapsed so far.
* **Slightly Behind** / **Behind** — you are falling short and should catch up.

**Leave lowers the target.** Recorded leave (Annual, Sick, etc.) reduces the
target by 8 hours for each leave business day — so a week with one approved
leave day expects 32 hours instead of 40. Use the **Log Leave** button on the
card (the same leave dialog used elsewhere) to record time off. Overlapping
leave entries never double-count.

**Supervisor view (`Work Hours` page).** Open **Work Hours** from the sidebar to
see a compliance table for your team — name, role, business unit, and logged vs.
target hours for week/month/year with a status badge. Scope depends on your role:

* **HR** sees all required staff.
* **Management** sees the Project Managers.
* **Principals** see only the people they supervise.

**Download.** The Work Hours page header has **CSV** and **Excel** buttons that
download the full team table (one row per person, all week/month/year columns).
The download always respects your scope — you only ever export the rows you are
allowed to see.

---

## 5. Resources & Capacity

### 5.1 Resources Page

Lists every active consultant, technical writer, and PM with:

* current project and client (if assigned)
* days remaining in the current assignment
* days since last approved timesheet
* utilization % for the current month
* visual status: **Active**, **Idle**, **Overloaded**, **Finishing Soon**,
  **Idle Long**

### 5.2 Capacity Planning (PM / Management)

A calendar grid of upcoming weeks shows planned mandays vs available capacity
per person, so you can see at a glance who is over- or under-booked.

---

## 6. Clients & Users

### 6.1 Clients

Management and Admin Project can create and edit client records (name,
contact person, email, phone, industry).

### 6.2 Users

Management can create users, assign roles, set daily rate, and deactivate
users. **Deletion is "soft"** — a deleted user is hidden from all lists but
their historical timesheets and audit trail are preserved. Deleted users can
no longer log in.

When a user is created or modified, an audit-log entry is recorded showing
the before/after snapshot (passwords are never stored in the audit log).

---

## 7. Business Intelligence (Management only)

Open **Business Intelligence** in the sidebar. The page is a single executive
dashboard with global filters at the top:

* **Period** — This Month, This Quarter, This Year, or **Custom** date range
* **Principal** — all PMs/Management or one specific principal
* **Project Type** — all or one of: Pentest, VAPT, GRC, SOC, Threat Modeling,
  Threat Hunting, Fraud Investigation, Forensics, Red Team, Audit, Training,
  Other.

### 7.1 Health KPI Strip

Five compact tiles across the top:

* **Margin (Month)** and **Margin (Quarter)** — overall profit margin %
* **Avg Project Duration** — across closed/completed projects
* **Project Success Rate** — % of CLOSED projects with positive profit, plus
  the absolute counts
* **Util. Trend (3mo avg)** — average utilization over the past 3 months

Green = healthy, red = below target.

### 7.2 Profitability by Project Type

* Bar chart of revenue and profit per type
* Pie chart of profit distribution
* Top 3 most profitable types (highlighted cards)
* Detail table with revenue, cost, profit, margin per type

### 7.3 Team Performance by Principal

* Bar chart of revenue and profit per principal
* Ranking table sorted by profit, showing project count, team size, revenue,
  profit, average margin and average team utilization

### 7.4 Resource Demand Forecast (Next 3 Months)

A stacked bar chart projecting mandays needed each month, broken down by:
Junior, Senior/Consultant, Tech Writer, Admin Project, PM. Below the chart,
three monthly cards show whether capacity covers the forecast — a red
**Shortage** badge appears when demand exceeds capacity.

### 7.5 Utilization Trend & Top 5 Most Profitable Projects

Two side-by-side cards: a 3-month utilization line chart and the 5 projects
with the largest profit in the selected scope.

---

## 8. Audit Log (Management only)

Open **Audit Log** in the sidebar. Every important change in the system
appears here:

* User login and failed login attempts (with the email tried)
* User create / update / delete
* Project create / update / delete / status change
* Timesheet submit / approve / reject
* Document upload
* Resource add / remove

Filters: date range, user, action type, entity type. Click any row to open a
**Details** dialog that shows the full **before** and **after** JSON snapshot
of what changed. This is the system of record for compliance and incident
investigation.

---

## 9. Notifications

Important events generate in-app notifications shown via toast messages:

* Timesheet submitted → notifies the PM
* Timesheet approved/rejected → notifies the consultant
* Document uploaded → notifies the PM
* Project status changed → recorded in activity feed
* Project auto-closed when BAST + Invoice are present → recorded in activity
  feed

---

## 10. Tips & Best Practices

* Always provide a clear **status change reason** when pausing or completing
  a project — it appears as a yellow banner and is auditable.
* PMs should clear the Approval Inbox at least once a day to keep the
  "Pending Aging" widget green.
* Use the BI **Custom** period to compare quarter‑over‑quarter or
  year‑over‑year performance for a specific principal.
* Re-check your daily rate in **Users** if your profit numbers look wrong —
  cost is computed as `(hours / 8) × dailyRate`.
* If you are locked out after too many wrong passwords, wait 15 minutes or
  contact a Management user to reset.
