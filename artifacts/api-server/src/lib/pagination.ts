import type { Request, Response } from "express";

export interface PaginationOptions {
  defaultLimit: number;
  maxLimit: number;
}

export interface ParsedPagination {
  limit: number;
  offset: number;
  requested: boolean;
}

export function parsePagination(
  query: Request["query"],
  opts: PaginationOptions,
): ParsedPagination {
  const rawLimit = query.limit;
  const rawOffset = query.offset;
  const requested = rawLimit !== undefined || rawOffset !== undefined;

  const limitNum = Number(rawLimit);
  const limit =
    rawLimit !== undefined && Number.isFinite(limitNum) && limitNum > 0
      ? Math.min(Math.floor(limitNum), opts.maxLimit)
      : opts.defaultLimit;

  const offsetNum = Number(rawOffset);
  const offset =
    rawOffset !== undefined && Number.isFinite(offsetNum) && offsetNum >= 0
      ? Math.floor(offsetNum)
      : 0;

  return { limit, offset, requested };
}

export function setTotalCount(res: Response, total: number): void {
  res.setHeader("X-Total-Count", String(total));
}
