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
  | "project.client_change_rejected"
  | "project.status_changed"
  | "project.pm_replaced"
  | "project.deleted"
  | "project.archived"
  | "project.unarchived"
  | "project.restored"
  | "project.auto_closed"
  | "project.auto_archived"
  | "project.auto_archive_exempted"
  | "project.auto_archive_unexempted"
  | "project.csat_waived"
  | "project.csat_waiver_removed"
  | "timesheet.created"
  | "timesheet.approved"
  | "timesheet.rejected"
  | "timesheet.bulk_approved"
  | "timesheet.bulk_created"
  | "task_template.created"
  | "task_template.updated"
  | "task_template.deleted"
  | "task_template.applied"
  | "project_template.created"
  | "project_template.updated"
  | "project_template.deleted"
  | "project_template.applied"
  | "leave.created"
  | "leave.deleted"
  | "timesheet.deleted"
  | "document.uploaded"
  | "document.deleted"
  | "resource.assigned"
  | "resource.updated"
  | "resource.removed"
  | "resource.proposed"
  | "resource.accepted"
  | "resource.approval_requested"
  | "resource.rejected"
  | "survey.submitted"
  | "survey.template_updated"
  | "survey.seed_demo"
  | "project.seed_demo"
  | "expense.created"
  | "expense.deleted"
  | "expense.approved"
  | "expense.rejected"
  | "expense.settled"
  | "skill.created"
  | "skill.updated"
  | "skill.deleted"
  | "business_unit.created"
  | "business_unit.updated"
  | "business_unit.deleted"
  | "task.created"
  | "task.updated"
  | "task.deleted"
  | "task.time_logged"
  | "billing_milestone.created"
  | "billing_milestone.updated"
  | "billing_milestone.deleted"
  | "billing_milestone.invoice_generated"
  | "billing_milestone.xero_invoice_created"
  | "xero.connected"
  | "xero.disconnected"
  | "client.xero_synced"
  | "invoice_settings.updated"
  | "app_settings.updated"
  | "host_setup.draft_saved"
  | "host_setup.validated"
  | "host_setup.pipedrive_webhook_repaired"
  | "host_setup.activated"
  | "host_setup.restored"
  | "app_settings.email_notifications_updated"
  | "project.report_updated"
  | "project_report.created"
  | "project_report.updated"
  | "project_report.deleted"
  | "admin.sample_data_seeded"
  | "admin.emails_renamed"
  | "raid.created"
  | "raid.updated"
  | "raid.deleted"
  | "performance_review.created"
  | "performance_review.updated"
  | "performance_review.submitted"
  | "performance_review.acknowledged"
  | "performance_review.deleted"
  | "performance_review.project_rated"
  | "performance_review.project_rating_removed"
  | "workstream.created"
  | "workstream.updated"
  | "workstream.deleted"
  | "pipedrive.synced"
  | "pipedrive.settings_updated"
  | "pipedrive.stage_mappings_updated"
  | "change_request.created"
  | "change_request.updated"
  | "change_request.approved"
  | "change_request.rejected"
  | "change_request.applied"
  | "change_request.deleted"
  | "feedback360.submitted"
  | "access_request.created"
  | "access_request.approved"
  | "access_request.rejected";

export type EntityType =
  | "User"
  | "Project"
  | "Timesheet"
  | "Document"
  | "ProjectResource"
  | "Survey"
  | "SurveyResponse"
  | "SurveyTemplate"
  | "TaskTemplate"
  | "ProjectTemplate"
  | "UserLeave"
  | "ProjectExpense"
  | "Task"
  | "TaskTimeLog"
  | "Skill"
  | "BusinessUnit"
  | "BillingMilestone"
  | "ProjectRaidItem"
  | "PerformanceReview"
  | "PerformanceReviewProjectRating"
  | "ProjectWorkstream"
  | "ProjectReport"
  | "InvoiceSetting"
  | "AppSetting"
  | "Client"
  | "XeroConnection"
  | "PipedriveStageMapping"
  | "ChangeRequest"
  | "ProjectFeedback360"
  | "AccessRequest"
  | "System";

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
