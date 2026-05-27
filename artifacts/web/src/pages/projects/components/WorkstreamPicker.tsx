import {
  useListProjectWorkstreams,
  getListProjectWorkstreamsQueryKey,
  type ProjectWorkstream,
} from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Layers } from "lucide-react";

const NONE_VALUE = "__none";

export interface WorkstreamPickerProps {
  projectId: string;
  value: string | null | undefined;
  onChange: (workstreamId: string | null) => void;
  /** When false, picker renders nothing. Wire to `project.useWorkstreams`. */
  enabled?: boolean;
  /** When true, renders a compact filter trigger instead of a form field. */
  filter?: boolean;
  /** Optional label override. Default: "Workstream". */
  label?: string;
  /** Test id base. */
  testId?: string;
  /** Disable when no workstreams exist on the project. */
  className?: string;
  /** Hide label (still uses aria-label). */
  hideLabel?: boolean;
}

/**
 * Reusable workstream picker for resources/tasks/expenses/billing forms and
 * for tab filters. Returns null (does not render) when the project doesn't
 * have workstreams enabled, so callers can drop it in unconditionally.
 */
export function WorkstreamPicker({
  projectId,
  value,
  onChange,
  enabled = true,
  filter = false,
  label = "Workstream",
  testId = "select-workstream",
  className,
  hideLabel = false,
}: WorkstreamPickerProps) {
  const wsQuery = useListProjectWorkstreams(projectId, {
    query: {
      queryKey: getListProjectWorkstreamsQueryKey(projectId),
      enabled: enabled && !!projectId,
    },
  });
  const items = (wsQuery.data ?? []) as ProjectWorkstream[];
  if (!enabled) return null;
  if (!wsQuery.isLoading && items.length === 0) return null;

  const selectValue = value ? value : NONE_VALUE;

  const trigger = (
    <SelectTrigger
      data-testid={testId}
      className={filter ? "h-8 w-[200px]" : ""}
      aria-label={label}
    >
      <SelectValue placeholder={filter ? "All workstreams" : "Select workstream"} />
    </SelectTrigger>
  );

  const select = (
    <Select
      value={selectValue}
      onValueChange={(v) => onChange(v === NONE_VALUE ? null : v)}
    >
      {trigger}
      <SelectContent>
        <SelectItem value={NONE_VALUE}>
          {filter ? "All workstreams" : "— No workstream —"}
        </SelectItem>
        {items.map((w) => (
          <SelectItem key={w.id} value={w.id}>
            <span className="font-mono text-xs mr-2">{w.code}</span>
            {w.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (filter) {
    return (
      <div className={"flex items-center gap-2 " + (className ?? "")}>
        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
        {select}
      </div>
    );
  }

  return (
    <div className={"space-y-1.5 " + (className ?? "")}>
      {!hideLabel && (
        <Label className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
          {label}
        </Label>
      )}
      {select}
    </div>
  );
}

/**
 * Small inline badge for showing the workstream a row belongs to in a table.
 * Renders nothing when there's no match.
 */
export function WorkstreamBadge({
  projectId,
  workstreamId,
  enabled = true,
}: {
  projectId: string;
  workstreamId: string | null | undefined;
  enabled?: boolean;
}) {
  const wsQuery = useListProjectWorkstreams(projectId, {
    query: {
      queryKey: getListProjectWorkstreamsQueryKey(projectId),
      enabled: enabled && !!projectId,
    },
  });
  if (!enabled || !workstreamId) return null;
  const ws = (wsQuery.data ?? []).find((w) => w.id === workstreamId);
  if (!ws) return null;
  return (
    <Badge variant="outline" className="font-mono text-[10px] gap-1">
      <Layers className="h-3 w-3" />
      {ws.code}
    </Badge>
  );
}
