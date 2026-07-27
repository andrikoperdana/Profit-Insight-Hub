import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { requireAuth } from "./middlewares/auth.js";
import { serveUploadedFile } from "./lib/serveUploadedFile.js";
import { gateEnabled, readGateCookie, verifyGateToken } from "./lib/site-gate.js";

const app: Express = express();

// The app always runs behind the platform reverse proxy (dev preview and
// autoscale deployments), so req.ip must be derived from X-Forwarded-For or
// every client shares the proxy's address — which would make per-IP rate
// limits on the public endpoints throttle everyone (or no one) collectively.
app.set("trust proxy", true);

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
  // Pipedrive posts deal-change pings to this webhook with no app cookies; it
  // authenticates via a shared secret checked in the handler, so it must bypass
  // the front-door gate.
  if (p === "/pipedrive/webhook") return next();
  // Public, token-gated endpoints (client portal, customer survey) are designed
  // to be reachable without a session — they must bypass the front-door gate.
  // Each is individually protected by an unguessable token.
  if (p.startsWith("/public/")) return next();
  // The Expo mobile app has no UI to enter the shared gate credentials, so it
  // tags every request with this header to bypass the front-door gate. The web
  // app never sets it, so the website stays gated. Per-user JWT auth still
  // applies to every /api route below, so data remains protected either way.
  if (req.get("x-secureprofit-client") === "mobile") return next();
  if (verifyGateToken(readGateCookie(req.headers.cookie))) return next();
  res.setHeader("X-Site-Gate", "required");
  res.status(403).json({ error: "site_gate_required" });
});

// File serving is auth-gated AND authorization-gated: uploaded
// BAST/Invoice/Report PDFs may contain confidential client data, so downloads
// require project-level access to the Document record referencing the file —
// a valid session alone is not enough (no cross-project enumeration by
// filename). Files are always served as PDF attachments so a stored payload
// can never render as HTML in the app's origin.
app.get("/api/files/:filename", requireAuth, serveUploadedFile);
app.use("/api", router);

export default app;
