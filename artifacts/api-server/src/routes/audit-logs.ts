import { Router, type IRouter } from "express";
import { prisma, type Prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireAuth);

router.get(
  "/audit-logs",
  requireRole("SITE_ADMIN"),
  async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    const userId = req.query.userId ? String(req.query.userId) : null;
    const action = req.query.action ? String(req.query.action) : null;
    const entityType = req.query.entityType ? String(req.query.entityType) : null;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize) || 50));

    const where: Prisma.AuditLogWhereInput = {};
    if (from || to) {
      where.createdAt = {};
      if (from && !isNaN(from.getTime())) (where.createdAt as Prisma.DateTimeFilter).gte = from;
      if (to && !isNaN(to.getTime())) (where.createdAt as Prisma.DateTimeFilter).lte = to;
    }
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      items: items.map((a) => ({
        id: a.id,
        userId: a.userId,
        userName: a.userName,
        userRole: a.userRole,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        description: a.description,
        dataBefore: a.dataBefore,
        dataAfter: a.dataAfter,
        createdAt: a.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    });
  },
);

router.get(
  "/audit-logs/actions",
  requireRole("SITE_ADMIN"),
  async (_req, res) => {
    const grouped = await prisma.auditLog.groupBy({
      by: ["action"],
      _count: { action: true },
      orderBy: { action: "asc" },
    });
    res.json(grouped.map((g) => ({ action: g.action, count: g._count.action })));
  },
);

export default router;
