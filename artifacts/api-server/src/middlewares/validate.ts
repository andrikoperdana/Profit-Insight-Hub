import type { Request, Response, NextFunction } from "express";
import type { ZodTypeAny } from "zod";

// Structural request-body validation using the Zod schemas generated from the
// OpenAPI contract (@workspace/api-zod). This standardizes the "is the payload
// shaped correctly" gate that route handlers used to do with ad-hoc
// `if (!field)` checks. It deliberately does NOT replace req.body with the
// parsed result, so handlers keep reading the original body (and their own
// semantic checks — ranges, dates, role-based field gates — still apply).
export function validateBody(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const first = result.error.issues[0];
      const path = first?.path?.length ? `${first.path.join(".")}: ` : "";
      res.status(400).json({ error: `${path}${first?.message ?? "Invalid request body"}` });
      return;
    }
    next();
  };
}
