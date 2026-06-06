import ExcelJS from "exceljs";
import type { WorkHoursPeriod, WorkHoursStatus } from "./work-hours.js";

export type WorkHoursMemberRow = {
  userName: string;
  role: string;
  businessUnitName: string | null;
  required: boolean;
  week: WorkHoursPeriod;
  month: WorkHoursPeriod;
  year: WorkHoursPeriod;
};

const ROLE_LABELS: Record<string, string> = {
  MANAGEMENT: "Management",
  PROJECT_MANAGER: "Project Manager",
  SALES: "Sales",
  KONSULTAN: "Konsultan",
  TECHNICAL_WRITER: "Technical Writer",
  ADMIN_PROJECT: "Admin Project",
  PRINCIPAL_KONSULTAN: "Principal Konsultan",
  PRINCIPAL_TECHNICAL_WRITER: "Principal Technical Writer",
  PRINCIPAL_ADMIN_PROJECT: "Principal Admin Project",
  FINANCE: "Finance",
  HR: "HR",
  SITE_ADMIN: "Site Admin",
};

const STATUS_LABELS: Record<WorkHoursStatus, string> = {
  MET: "On Target",
  ON_TRACK: "On Track",
  BEHIND: "Slightly Behind",
  AT_RISK: "Behind",
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

function statusLabel(p: WorkHoursPeriod, required: boolean): string {
  if (!required || p.targetHours <= 0) return "Not Required";
  return STATUS_LABELS[p.status];
}

const COLUMNS: { header: string; width: number }[] = [
  { header: "Name", width: 24 },
  { header: "Role", width: 22 },
  { header: "Business Unit", width: 18 },
  { header: "Week Logged (h)", width: 16 },
  { header: "Week Target (h)", width: 16 },
  { header: "Week Pending (h)", width: 16 },
  { header: "Week Status", width: 16 },
  { header: "Month Logged (h)", width: 16 },
  { header: "Month Target (h)", width: 16 },
  { header: "Month Pending (h)", width: 16 },
  { header: "Month Status", width: 16 },
  { header: "Year Logged (h)", width: 16 },
  { header: "Year Target (h)", width: 16 },
  { header: "Year Pending (h)", width: 16 },
  { header: "Year Status", width: 16 },
];

type Cell = string | number;

function rowCells(m: WorkHoursMemberRow): Cell[] {
  return [
    m.userName,
    roleLabel(m.role),
    m.businessUnitName ?? "",
    m.week.loggedHours,
    m.week.targetHours,
    m.week.pendingHours,
    statusLabel(m.week, m.required),
    m.month.loggedHours,
    m.month.targetHours,
    m.month.pendingHours,
    statusLabel(m.month, m.required),
    m.year.loggedHours,
    m.year.targetHours,
    m.year.pendingHours,
    statusLabel(m.year, m.required),
  ];
}

function neutralizeFormula(s: string): string {
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) return "'" + s;
  return s;
}

function escapeCsv(value: Cell): string {
  const raw = typeof value === "number" ? String(value) : neutralizeFormula(value);
  if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function workHoursCsv(members: WorkHoursMemberRow[]): string {
  const lines = [COLUMNS.map((c) => escapeCsv(c.header)).join(",")];
  for (const m of members) {
    lines.push(rowCells(m).map(escapeCsv).join(","));
  }
  return lines.join("\n");
}

export async function workHoursXlsx(members: WorkHoursMemberRow[], title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SecureProfit Hub";
  wb.created = new Date();
  const ws = wb.addWorksheet("Work Hours");

  ws.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };

  for (const m of members) {
    const cells = rowCells(m);
    const added = ws.addRow(cells.map((c) => (typeof c === "string" ? neutralizeFormula(c) : c)));
    // Number formatting for the hours columns (indexes 3-5, 7-9, 11-13 are numeric).
    for (const idx of [4, 5, 6, 8, 9, 10, 12, 13, 14]) {
      added.getCell(idx).numFmt = "0.0";
    }
  }

  ws.views = [{ state: "frozen", ySplit: 1 }];
  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr as ArrayBuffer);
}
