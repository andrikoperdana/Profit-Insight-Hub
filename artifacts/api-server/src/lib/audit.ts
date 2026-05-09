import { prisma, type Prisma } from "@workspace/db";
import type { Request } from "express";
import { logger } from "./logger.js";

export type AuditAction =
  | "user.created"
  | "user.updated"
  | "user.deleted"
  | "user.restored"
  | "user.login"
  | "user.login_failed"
  | "project.created"
  | "project.updated"
  | "project.status_changed"
  | "project.deleted"
  | "project.restored"
  | "project.auto_closed"
  | "timesheet.created"
  | "timesheet.approved"
  | "timesheet.rejected"
  | "timesheet.bulk_approved"
  | "timesheet.deleted"
  | "document.uploaded"
  | "document.deleted"
  | "resource.assigned"
  | "resource.updated"
  | "resource.removed"
  | "resource.proposed"
  | "resource.accepted"
  | "survey.submitted"
  | "survey.template_updated"
  | "survey.seed_demo"
  | "project.seed_demo"
  | "expense.created"
  | "expense.deleted"
  | "task.created"
  | "task.updated"
  | "task.deleted"
  | "task.time_logged"
  | "project.report_updated";

export type EntityType =
  | "User"
  | "Project"
  | "Timesheet"
  | "Document"
  | "ProjectResource"
  | "Survey"
  | "SurveyResponse"
  | "SurveyTemplate"
  | "ProjectExpense"
  | "Task"
  | "TaskTimeLog";

interface AuditInput {
  action: AuditAction;
  entityType: EntityType;
  entityId?: string | null;
  description: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Strip sensitive fields and Date objects from an audit payload so it can
 * be safely serialized to JSONB. Removes password hashes and tokens.
 */
function sanitize(value: unknown): unknown {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "passwordHash" || k === "password" || k === "token") continue;
      out[k] = sanitize(v);
    }
    return out;
  }
  return value;
}

/**
 * Persist an audit log entry. Failures are swallowed (audit must never break
 * the parent request) but are logged to the server log.
 */
export async function recordAudit(req: Request, input: AuditInput): Promise<void> {
  try {
    const userId = req.user?.sub ?? null;
    let userName = "System";
    let userRole = "SYSTEM";
    if (userId) {
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, role: true },
      });
      if (u) {
        userName = u.name;
        userRole = u.role;
      }
    }
    await prisma.auditLog.create({
      data: {
        userId,
        userName,
        userRole,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        description: input.description,
        dataBefore: input.before === undefined ? undefined : (sanitize(input.before) as Prisma.InputJsonValue),
        dataAfter: input.after === undefined ? undefined : (sanitize(input.after) as Prisma.InputJsonValue),
      },
    });
  } catch (err) {
    logger.warn({ err, action: input.action }, "audit log failed");
  }
}

/**
 * Variant for unauthenticated audit (e.g. login attempts). Caller supplies
 * the actor identity directly.
 */
export async function recordAuditAnon(input: {
  action: AuditAction;
  entityType: EntityType;
  entityId?: string | null;
  description: string;
  userName: string;
  userRole: string;
  userId?: string | null;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        userName: input.userName,
        userRole: input.userRole,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        description: input.description,
        dataBefore: input.before === undefined ? undefined : (sanitize(input.before) as Prisma.InputJsonValue),
        dataAfter: input.after === undefined ? undefined : (sanitize(input.after) as Prisma.InputJsonValue),
      },
    });
  } catch (err) {
    logger.warn({ err, action: input.action }, "audit log failed");
  }
}
