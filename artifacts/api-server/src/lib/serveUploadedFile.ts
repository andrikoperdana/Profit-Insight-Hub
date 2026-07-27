import type { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "@workspace/db";
import { userCanAccessProject } from "./projectAccess.js";

const uploadDir = path.resolve(process.cwd(), "uploads");

// Only names our own uploader generates (letters, digits, dot, dash,
// underscore). Anything else — path separators, "..", encoded traversal —
// is rejected outright.
const SAFE_NAME = /^[a-zA-Z0-9._-]+$/;

/**
 * Streams an uploaded file to the caller, but only after verifying the caller
 * has project-level access to a Document record that references the file.
 * This closes the broken-object-level-authorization hole where any
 * authenticated user could download any upload by guessing its filename.
 */
export async function serveUploadedFile(req: Request, res: Response): Promise<void> {
  const filename = String(req.params.filename || "");
  if (!SAFE_NAME.test(filename) || filename.includes("..")) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const fileUrl = `/api/files/${filename}`;
  // A file is only downloadable once a Document record points at it; access
  // then follows the same project-membership rule as the metadata API.
  const docs = await prisma.document.findMany({
    where: { fileUrl },
    select: { projectId: true },
  });
  if (docs.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const projectIds = [...new Set(docs.map((d) => d.projectId))];
  let allowed = false;
  for (const projectId of projectIds) {
    if (await userCanAccessProject(projectId, req.user!)) {
      allowed = true;
      break;
    }
  }
  if (!allowed) {
    // 404 (not 403) so unauthorized callers can't confirm a file exists.
    res.status(404).json({ error: "Not found" });
    return;
  }

  const filePath = path.join(uploadDir, filename);
  if (!filePath.startsWith(uploadDir + path.sep) || !fs.existsSync(filePath)) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Fixed content type + attachment disposition: even if a non-PDF ever
  // reached disk, it can never render as HTML in the app's origin.
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.sendFile(filePath);
}
