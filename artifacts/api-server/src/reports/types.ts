import type { UserRole } from "@workspace/db";

export type FilterType =
  | "date"
  | "year"
  | "month"
  | "select"
  | "multiselect"
  | "text";

export type OptionsSource =
  | "businessUnits"
  | "pms"
  | "clients"
  | "projects"
  | "projectStatuses"
  | "expenseCategories"
  | "expenseStatuses"
  | "billingStatuses"
  | "agingBuckets"
  | "seniorities"
  | "users"
  | "roles"
  | "yearList"
  | "projectKinds"
  | "internalProjectKinds";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterSpec {
  key: string;
  label: string;
  type: FilterType;
  options?: FilterOption[];
  optionsSource?: OptionsSource;
  defaultValue?: string;
  placeholder?: string;
  scope?: UserRole[];
}

export type ColumnType =
  | "string"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "month"
  | "badge";

export type AggType = "sum" | "avg" | "min" | "max";

export interface ColumnSpec {
  key: string;
  label: string;
  type: ColumnType;
  align?: "left" | "right" | "center";
  width?: number;
  total?: AggType;
  fixed?: number;
  badgeMap?: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning">;
}

export interface ChartSpec {
  type: "bar" | "line" | "pie";
  xKey: string;
  yKey: string | string[];
  yLabel?: string;
  stacked?: boolean;
}

export type ReportCategory = "profitability" | "operations" | "cashflow" | "compliance";

export interface ReportContext {
  user: { sub: string; role: UserRole };
  filters: Record<string, string | undefined>;
}

export type ReportRow = Record<string, unknown>;

export interface ReportResult {
  rows: ReportRow[];
  totals?: ReportRow;
}

export interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  category: ReportCategory;
  scope: UserRole[];
  filters: FilterSpec[];
  columns: ColumnSpec[];
  chart?: ChartSpec;
  query: (ctx: ReportContext) => Promise<ReportResult>;
}
