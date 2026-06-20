import type { GanttTask } from "./utils";
import { startOfDay, addDays, diffDays } from "./utils";

const CPM_EPSILON = 1e-6;

export type CriticalPathResult = {
  /** Ids of leaf tasks lying on the critical path (zero slack). */
  criticalIds: Set<string>;
  /** True when the dependency graph contains a cycle (critical path is then unreliable, so empty). */
  hasCycle: boolean;
};

/**
 * Inclusive duration in whole days, matching the Gantt bar width convention
 * (the end day is inclusive, so a same-day task is 1 day).
 */
function taskDurationDays(t: GanttTask): number {
  if (!t.startDate || !t.endDate) return 0;
  const s = startOfDay(new Date(t.startDate));
  const e = startOfDay(new Date(t.endDate));
  return Math.max(1, diffDays(addDays(e, 1), s));
}

/**
 * Critical Path Method (CPM) over the project's leaf, scheduled tasks.
 *
 * - Summary/parent tasks are excluded (a task is a parent if any other task
 *   names it as parentTaskId) — only leaf work items carry duration.
 * - Edges are finish-to-start dependencies, kept only when BOTH endpoints are
 *   leaf-scheduled tasks.
 * - Forward pass yields earliest start/finish; backward pass (anchored on the
 *   computed project finish) yields latest start/finish. Slack = LS - ES; a
 *   task with ~zero slack is on the critical path.
 * - A fully-isolated task (no dependency edges in or out) is never highlighted:
 *   with no chain running through it and no explicit project-end constraint to
 *   pin it to, a lone bar has no meaningful "path" to lie on.
 * - The graph is acyclic by construction (the server BFS-guards dependency
 *   creation); if a cycle is nonetheless present we bail out with an empty set.
 */
export function computeCriticalPath(tasks: GanttTask[]): CriticalPathResult {
  const empty: CriticalPathResult = { criticalIds: new Set(), hasCycle: false };

  const parentIds = new Set<string>();
  for (const t of tasks) {
    if (t.parentTaskId) parentIds.add(t.parentTaskId);
  }
  const nodes = tasks.filter((t) => t.startDate && t.endDate && !parentIds.has(t.id));
  if (nodes.length === 0) return empty;

  const idSet = new Set(nodes.map((t) => t.id));
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const t of nodes) {
    preds.set(t.id, []);
    succs.set(t.id, []);
  }

  let edgeCount = 0;
  for (const t of nodes) {
    for (const d of t.dependencies ?? []) {
      const from = d.dependsOnTaskId;
      const to = t.id;
      if (!idSet.has(from) || !idSet.has(to) || from === to) continue;
      preds.get(to)!.push(from);
      succs.get(from)!.push(to);
      edgeCount++;
    }
  }

  // Without any dependency edge there is no meaningful critical *path*.
  if (edgeCount === 0) return empty;

  // Topological order (Kahn). If not every node is emitted there is a cycle.
  const indeg = new Map<string, number>();
  for (const t of nodes) indeg.set(t.id, preds.get(t.id)!.length);
  const queue: string[] = [];
  for (const t of nodes) if (indeg.get(t.id) === 0) queue.push(t.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const s of succs.get(id)!) {
      const next = indeg.get(s)! - 1;
      indeg.set(s, next);
      if (next === 0) queue.push(s);
    }
  }
  if (order.length !== nodes.length) {
    return { criticalIds: new Set(), hasCycle: true };
  }

  const dur = new Map<string, number>();
  for (const t of nodes) dur.set(t.id, taskDurationDays(t));

  // Forward pass — earliest start/finish.
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of order) {
    const p = preds.get(id)!;
    const start = p.length ? Math.max(...p.map((x) => ef.get(x)!)) : 0;
    es.set(id, start);
    ef.set(id, start + dur.get(id)!);
  }

  // Connected components over the UNDIRECTED dependency graph. The project
  // finish that anchors the backward pass is computed PER component, not
  // globally: a long isolated task must not inflate the anchor for a real
  // chain, and two independent chains must each be measured against their own
  // finish. Fully-isolated tasks (their own singleton, skipped below) never
  // join a component, so they cannot contribute to any anchor.
  const compOf = new Map<string, number>();
  let comp = 0;
  for (const t of nodes) {
    if (compOf.has(t.id)) continue;
    if (preds.get(t.id)!.length === 0 && succs.get(t.id)!.length === 0) continue;
    const stack = [t.id];
    compOf.set(t.id, comp);
    while (stack.length) {
      const cur = stack.pop()!;
      for (const n of [...preds.get(cur)!, ...succs.get(cur)!]) {
        if (!compOf.has(n)) {
          compOf.set(n, comp);
          stack.push(n);
        }
      }
    }
    comp++;
  }
  const compFinish = new Map<number, number>();
  for (const t of nodes) {
    const c = compOf.get(t.id);
    if (c === undefined) continue;
    compFinish.set(c, Math.max(compFinish.get(c) ?? -Infinity, ef.get(t.id)!));
  }

  // Backward pass — latest finish/start, anchored on each node's component finish.
  const lf = new Map<string, number>();
  const ls = new Map<string, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const c = compOf.get(id);
    const s = succs.get(id)!;
    const finish = s.length
      ? Math.min(...s.map((x) => ls.get(x)!))
      : c !== undefined
        ? compFinish.get(c)!
        : ef.get(id)!;
    lf.set(id, finish);
    ls.set(id, finish - dur.get(id)!);
  }

  const criticalIds = new Set<string>();
  for (const t of nodes) {
    // A fully-isolated task (no predecessors and no successors) lies on no
    // dependency path. With no explicit project-end constraint to pin it to we
    // never highlight it — otherwise a long standalone bar would light up even
    // though no chain runs through it.
    if (preds.get(t.id)!.length === 0 && succs.get(t.id)!.length === 0) continue;
    const slack = ls.get(t.id)! - es.get(t.id)!;
    if (slack > CPM_EPSILON) continue;
    criticalIds.add(t.id);
  }
  return { criticalIds, hasCycle: false };
}
