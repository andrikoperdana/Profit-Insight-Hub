import { Router, type IRouter } from "express";
import {
  GATE_COOKIE,
  checkCredentials,
  gateEnabled,
  gateToken,
  readGateCookie,
  verifyGateToken,
} from "../lib/site-gate.js";

const router: IRouter = Router();

// Public: lets the frontend decide whether to render the gate popup before
// mounting the app. Never requires a cookie itself.
router.get("/site-gate/status", (req, res) => {
  const enabled = gateEnabled();
  const authorized = enabled ? verifyGateToken(readGateCookie(req.headers.cookie)) : true;
  res.json({ enabled, authorized });
});

router.post("/site-gate/login", (req, res) => {
  if (!gateEnabled()) {
    res.json({ ok: true });
    return;
  }
  const { username, password } = (req.body ?? {}) as Record<string, unknown>;
  if (!checkCredentials(username, password)) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  res.cookie(GATE_COOKIE, gateToken(), {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: "/",
  });
  res.json({ ok: true });
});

export default router;
