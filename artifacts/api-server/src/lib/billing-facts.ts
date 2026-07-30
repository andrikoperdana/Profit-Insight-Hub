import { prisma, type Prisma } from "@workspace/db";

/**
 * Shared billing math for AI features (assistant chat + weekly digest).
 *
 * Both consumers must report the SAME overdue/outstanding numbers, so they both
 * fetch through here: one uncapped query with a narrow select, amounts resolved
 * by a single rule. Slice for display AFTER summing, never before.
 */

/** Milestone statuses that still represent money to collect. */
export const OPEN_MILESTONE_STATUSES = ["PLANNED", "INVOICED"] as const;

export type OpenMilestoneRow = {
  name: string;
  status: "PLANNED" | "INVOICED";
  dueDate: Date | null;
  invoiceNumber: string | null;
  /** Resolved amount in IDR (explicit amount or percentage of contract value). */
  amount: number;
  /** `code` is the display identifier: canonical projectId, falling back to SPK/PO code. */
  project: { id: string; code: string; name: string };
};

/** Single source of truth: explicit amount wins, else percentage of contract. */
export function resolveMilestoneAmount(ms: {
  amount: number | null;
  percentage: number | null;
  contractValue: number;
}): number {
  return ms.amount ?? (ms.contractValue * (ms.percentage ?? 0)) / 100;
}

export function sumAmounts(rows: readonly { amount: number }[]): number {
  return rows.reduce((acc, r) => acc + r.amount, 0);
}

/**
 * ALL open (PLANNED/INVOICED) billing milestones of non-deleted projects in
 * scope, ordered by dueDate asc. Deliberately uncapped so totals computed from
 * this list are exact — the table stays small (a handful of milestones per
 * contract), and the select is narrow.
 */
export async function fetchOpenMilestones(
  projectScope: Prisma.ProjectWhereInput = {},
): Promise<OpenMilestoneRow[]> {
  const rows = await prisma.billingMilestone.findMany({
    where: {
      status: { in: [...OPEN_MILESTONE_STATUSES] },
      project: { deletedAt: null, ...projectScope },
    },
    select: {
      name: true,
      status: true,
      amount: true,
      percentage: true,
      dueDate: true,
      invoiceNumber: true,
      project: { select: { id: true, projectId: true, code: true, name: true, contractValue: true } },
    },
    orderBy: { dueDate: "asc" },
  });
  return rows.map((ms) => ({
    name: ms.name,
    status: ms.status as "PLANNED" | "INVOICED",
    dueDate: ms.dueDate,
    invoiceNumber: ms.invoiceNumber ?? null,
    amount: resolveMilestoneAmount({
      amount: ms.amount,
      percentage: ms.percentage,
      contractValue: ms.project.contractValue,
    }),
    project: {
      id: ms.project.id,
      code: ms.project.projectId ?? ms.project.code ?? "",
      name: ms.project.name,
    },
  }));
}
