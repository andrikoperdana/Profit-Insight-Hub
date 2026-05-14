export type GanttTask = {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
  startDate?: string | null;
  endDate?: string | null;
  assigneeName?: string | null;
  loggedHours?: number;
  dependencies?: { taskId: string; dependsOnTaskId: string }[];
  parentTaskId?: string | null;
};

export const TASK_STATUS_BAR: Record<GanttTask["status"], string> = {
  TODO: "bg-slate-500/70 border-slate-400",
  IN_PROGRESS: "bg-primary/80 border-primary",
  BLOCKED: "bg-destructive/80 border-destructive",
  DONE: "bg-emerald-500/80 border-emerald-500",
};

export const TASK_STATUS_LABEL: Record<GanttTask["status"], string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  BLOCKED: "Blocked",
  DONE: "Done",
};

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
}


export type DragMode = "move" | "resize-start" | "resize-end";
