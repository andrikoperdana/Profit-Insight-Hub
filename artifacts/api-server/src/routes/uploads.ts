import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { requireAuth } from "../middlewares/auth.js";

const uploadDir = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, _file, cb) => {
    // Unguessable name: a millisecond timestamp alone is brute-forceable, and
    // preserving the client's extension lets attackers store .html payloads
    // that express would serve as text/html (stored XSS). Only PDFs are
    // accepted, so the stored name is always random + ".pdf".
    cb(null, `${Date.now()}-${crypto.randomBytes(16).toString("hex")}.pdf`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Cheap first-pass check only — file.mimetype is attacker-controlled
    // (taken from the multipart Content-Type header). Real validation is the
    // magic-byte check on the stored file below.
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed"));
  },
});

/** True when the file on disk starts with the PDF magic bytes "%PDF-". */
function isPdfFile(filePath: string): boolean {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(5);
    const read = fs.readSync(fd, buf, 0, 5, 0);
    return read === 5 && buf.toString("latin1") === "%PDF-";
  } catch {
    return false;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

const router: IRouter = Router();
router.use(requireAuth);

router.post("/uploads", upload.single("file"), (req, res) => {
  const f = req.file;
  if (!f) {
    res.status(400).json({ error: "file required" });
    return;
  }
  // Content-based validation: the declared MIME type is attacker-controlled,
  // so verify the actual bytes are a PDF; otherwise remove the file.
  if (!isPdfFile(f.path)) {
    try {
      fs.unlinkSync(f.path);
    } catch {
      /* already gone */
    }
    res.status(400).json({ error: "Only PDF files are allowed" });
    return;
  }
  res.status(201).json({
    fileName: f.originalname,
    fileUrl: `/api/files/${f.filename}`,
    size: f.size,
  });
});

export default router;
