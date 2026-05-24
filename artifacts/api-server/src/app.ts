import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { requireAuth } from "./middlewares/auth.js";

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
