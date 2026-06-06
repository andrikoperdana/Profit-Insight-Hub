import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { requireAuth } from "./middlewares/auth.js";
import { gateEnabled, readGateCookie, verifyGateToken } from "./lib/site-gate.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ exposedHeaders: ["X-Total-Count"] }));
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true }));

// Front-door gate (deployment-only when SITE_GATE_PASS is set). Sits in front
// of every /api route except the health check and the gate endpoints, so a
// published demo isn't openly reachable. Uses a dedicated signed cookie — never
// the Authorization header — so it never collides with the Bearer JWT.
app.use("/api", (req, res, next) => {
  if (!gateEnabled()) return next();
  const p = req.path;
  if (p === "/healthz" || p.startsWith("/site-gate")) return next();
  // Xero redirects the browser back to this callback with no app cookies;
  // it authenticates via a signed OAuth state, so it must bypass the gate.
  if (p === "/xero/callback") return next();
  // Public, token-gated endpoints (client portal, customer survey) are designed
  // to be reachable without a session — they must bypass the front-door gate.
  // Each is individually protected by an unguessable token.
  if (p.startsWith("/public/")) return next();
  if (verifyGateToken(readGateCookie(req.headers.cookie))) return next();
  res.setHeader("X-Site-Gate", "required");
  res.status(403).json({ error: "site_gate_required" });
});

// File serving is auth-gated: uploaded BAST/Invoice/Report PDFs may contain
// confidential client data, so we never expose the uploads directory publicly.
// Anyone with a valid session can fetch by filename — fine-grained per-document
// authorization is enforced by routes/documents.ts.
app.use(
  "/api/files",
  requireAuth,
  express.static(path.resolve(process.cwd(), "uploads"), {
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  }),
);
app.use("/api", router);

export default app;
