import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

export interface PaginationState {
  page: number;
  pageSize: number;
}

export function usePagination<T>(items: T[] | undefined, opts?: { defaultPageSize?: number; resetKey?: unknown }) {
  const list = items ?? [];
  const [pageSize, setPageSize] = useState<number>(opts?.defaultPageSize ?? DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState<number>(1);

  // Reset to page 1 when the dataset's identity changes (e.g. filter/search).
  useEffect(() => {
    setPage(1);
  }, [opts?.resetKey]);

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return list.slice(start, start + pageSize);
  }, [list, safePage, pageSize]);

  return {
    page: safePage,
    pageSize,
    totalPages,
    total,
    pageItems,
    setPage,
    setPageSize: (n: number) => {
      setPageSize(n);
      setPage(1);
    },
  };
}

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  className?: string;
  testId?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  className,
  testId,
}: PaginationProps) {
  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  // Compact page-number window: first, last, neighbours of current.
  const numbers = pageNumberWindow(page, totalPages);

  return (
    <div
      className={
        "flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t " +
        (className ?? "")
      }
      data-testid={testId}
    >
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          Showing <span className="font-medium text-foreground">{start}</span>–
          <span className="font-medium text-foreground">{end}</span> of{" "}
          <span className="font-medium text-foreground">{total}</span>
        </span>
        <div className="flex items-center gap-1.5">
          <span>Rows per page:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger className="h-7 w-[70px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          data-testid={testId ? `${testId}-prev` : undefined}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {numbers.map((n, i) =>
          n === "…" ? (
            <span key={`gap-${i}`} className="px-2 text-xs text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={n}
              size="sm"
              variant={n === page ? "default" : "outline"}
              onClick={() => onPageChange(n)}
              className="h-8 min-w-8 px-2.5 text-xs"
              aria-current={n === page ? "page" : undefined}
              aria-label={`Go to page ${n}`}
              data-testid={testId ? `${testId}-page-${n}` : undefined}
            >
              {n}
            </Button>
          ),
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          data-testid={testId ? `${testId}-next` : undefined}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function pageNumberWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const out: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}
