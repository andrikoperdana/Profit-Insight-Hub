import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { REPORT_DEFINITIONS, getReportById } from "../reports/definitions.js";
import { exportCsv, exportXlsx, exportPdf } from "../reports/exports.js";
import type { OptionsSource, FilterOption, ReportContext } from "../reports/types.js";

const router: IRouter = Router();
router.use(requireAuth);

const ALLOWED_ROLES = new Set(["MANAGEMENT", "PROJECT_MANAGER", "FINANCE"]);

async function loadOptions(source: OptionsSource, viewer: { sub: string; role: string }): Promise<FilterOption[]> {
  const isPm = viewer.role === "PROJECT_MANAGER";
  switch (source) {
    case "businessUnits": {
      const bus = await prisma.businessUnit.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
      return bus.map((b) => ({ value: b.id, label: b.name }));
    }
    case "pms": {
      if (isPm) {
        const me = await prisma.user.findUnique({ where: { id: viewer.sub }, select: { id: true, name: true } });
        return me ? [{ value: me.id, label: me.name }] : [];
      }
      const pms = await prisma.user.findMany({ where: { role: "PROJECT_MANAGER", isActive: true }, orderBy: { name: "asc" } });
      return pms.map((p) => ({ value: p.id, label: p.name }));
    }
    case "clients": {
      if (isPm) {
        const myProjects = await prisma.project.findMany({ where: { pmId: viewer.sub, deletedAt: null }, select: { clientId: true } });
        const ids = Array.from(new Set(myProjects.map((p) => p.clientId).filter((x): x is string => !!x)));
        const clients = await prisma.client.findMany({ where: { id: { in: ids } }, orderBy: { name: "asc" } });
        return clients.map((c) => ({ value: c.id, label: c.name }));
      }
      const clients = await prisma.client.findMany({ orderBy: { name: "asc" } });
      return clients.map((c) => ({ value: c.id, label: c.name }));
    }
    case "projects": {
      const where: any = { deletedAt: null };
      if (isPm) where.pmId = viewer.sub;
      const projects = await prisma.project.findMany({ where, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } });
      return projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }));
    }
    case "projectStatuses":
      return ["DRAFT", "OBSERVATION", "ACTIVE", "PAUSE", "COMPLETE", "CLOSED"].map((v) => ({ value: v, label: v }));
    case "expenseCategories":
      return ["SOFTWARE", "HARDWARE", "LICENSE", "TRAVEL", "OTHER"].map((v) => ({ value: v, label: v }));
    case "expenseStatuses":
      return ["PENDING", "APPROVED", "REJECTED"].map((v) => ({ value: v, label: v }));
    case "billingStatuses":
      return ["PLANNED", "INVOICED", "PAID", "CANCELLED"].map((v) => ({ value: v, label: v }));
    case "agingBuckets":
      return [
        { value: "0-30", label: "0–30 days" },
        { value: "31-60", label: "31–60 days" },
        { value: "61-90", label: "61–90 days" },
        { value: "90+", label: "90+ days" },
      ];
    case "seniorities":
      return ["JUNIOR", "MID", "SENIOR", "PRINCIPAL"].map((v) => ({ value: v, label: v }));
    case "yearList": {
      const y = new Date().getFullYear();
      return [y - 2, y - 1, y, y + 1].map((v) => ({ value: String(v), label: String(v) }));
    }
    case "users": {
      if (isPm) {
        const myProjects = await prisma.project.findMany({ where: { pmId: viewer.sub, deletedAt: null }, select: { id: true } });
        const projectIds = myProjects.map((p) => p.id);
        const resources = await prisma.projectResource.findMany({ where: { projectId: { in: projectIds } }, select: { userId: true } });
        const ids = Array.from(new Set(resources.map((r) => r.userId)));
        const users = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, orderBy: { name: "asc" } });
        return users.map((u) => ({ value: u.id, label: u.name }));
      }
      const users = await prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
      return users.map((u) => ({ value: u.id, label: u.name }));
    }
    case "roles":
      return ["MANAGEMENT", "PROJECT_MANAGER", "SALES", "KONSULTAN", "TECHNICAL_WRITER", "ADMIN_PROJECT"].map((v) => ({ value: v, label: v }));
  }
}

function serializeMeta(role: string) {
  const allowed = REPORT_DEFINITIONS.filter((r) => r.scope.includes(role as any));
  return allowed.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    scope: r.scope,
    filters: r.filters
      .filter((f) => !f.scope || f.scope.includes(role as any))
      .map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        options: f.options ?? null,
        optionsSource: f.optionsSource ?? null,
        defaultValue: f.defaultValue ?? null,
        placeholder: f.placeholder ?? null,
      })),
    columns: r.columns.map((c) => ({
      key: c.key,
      label: c.label,
      type: c.type,
      align: c.align ?? null,
      width: c.width ?? null,
      total: c.total ?? null,
      fixed: c.fixed ?? null,
      badgeMap: c.badgeMap ?? null,
    })),
    chart: r.chart ?? null,
  }));
}

router.get("/reports", async (req, res) => {
  if (!req.user || !ALLOWED_ROLES.has(req.user.role)) {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }
  res.json(serializeMeta(req.user.role));
});

router.get("/reports/options", async (req, res) => {
  if (!req.user || !ALLOWED_ROLES.has(req.user.role)) {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }
  const source = String(req.query.source || "");
  const valid: OptionsSource[] = [
    "businessUnits", "pms", "clients", "projects", "projectStatuses",
    "expenseCategories", "expenseStatuses", "billingStatuses", "agingBuckets",
    "seniorities", "users", "roles", "yearList",
  ];
  if (!valid.includes(source as OptionsSource)) {
    res.status(400).json({ error: "INVALID_SOURCE" });
    return;
  }
  const options = await loadOptions(source as OptionsSource, { sub: req.user.sub, role: req.user.role });
  res.json(options);
});

router.get("/reports/:id", async (req, res) => {
  if (!req.user || !ALLOWED_ROLES.has(req.user.role)) {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }
  const def = getReportById(req.params.id);
  if (!def) {
    res.status(404).json({ error: "REPORT_NOT_FOUND" });
    return;
  }
  if (!def.scope.includes(req.user.role as any)) {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }
  const filters: Record<string, string | undefined> = {};
  for (const f of def.filters) {
    const v = req.query[f.key];
    filters[f.key] = typeof v === "string" && v !== "" ? v : undefined;
  }
  const ctx: ReportContext = { user: { sub: req.user.sub, role: req.user.role as any }, filters };
  try {
    const result = await def.query(ctx);
    res.json({
      id: def.id,
      name: def.name,
      description: def.description,
      columns: def.columns,
      chart: def.chart ?? null,
      rows: result.rows,
      totals: result.totals ?? null,
    });
  } catch (err) {
    req.log.error({ err, reportId: def.id }, "report execution failed");
    res.status(500).json({ error: "REPORT_EXECUTION_FAILED" });
  }
});

router.get("/reports/:id/export", async (req, res) => {
  if (!req.user || !ALLOWED_ROLES.has(req.user.role)) {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }
  const def = getReportById(req.params.id);
  if (!def) {
    res.status(404).json({ error: "REPORT_NOT_FOUND" });
    return;
  }
  if (!def.scope.includes(req.user.role as any)) {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }
  const format = String(req.query.format || "csv").toLowerCase();
  if (!["csv", "xlsx", "pdf"].includes(format)) {
    res.status(400).json({ error: "INVALID_FORMAT" });
    return;
  }
  const filters: Record<string, string | undefined> = {};
  for (const f of def.filters) {
    const v = req.query[f.key];
    filters[f.key] = typeof v === "string" && v !== "" ? v : undefined;
  }
  const ctx: ReportContext = { user: { sub: req.user.sub, role: req.user.role as any }, filters };
  try {
    const result = await def.query(ctx);
    const safeName = def.id.replace(/[^a-z0-9-]/gi, "_");
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      const csv = exportCsv(def, result);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}-${stamp}.csv"`);
      res.send("\uFEFF" + csv);
      return;
    }
    if (format === "xlsx") {
      const buf = await exportXlsx(def, result);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}-${stamp}.xlsx"`);
      res.send(buf);
      return;
    }
    const pdf = await exportPdf(def, result);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}-${stamp}.pdf"`);
    res.send(pdf);
  } catch (err) {
    req.log.error({ err, reportId: def.id, format }, "report export failed");
    res.status(500).json({ error: "REPORT_EXPORT_FAILED" });
  }
});

export default router;
