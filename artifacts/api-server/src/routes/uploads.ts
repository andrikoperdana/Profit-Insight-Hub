import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth } from "../middlewares/auth.js";

const uploadDir = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${ts}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed"));
  },
});

const router: IRouter = Router();
router.use(requireAuth);

router.post("/uploads", upload.single("file"), (req, res) => {
  const f = req.file;
  if (!f) {
    res.status(400).json({ error: "file required" });
    return;
  }
  res.status(201).json({
    fileName: f.originalname,
    fileUrl: `/api/files/${f.filename}`,
    size: f.size,
  });
});

export default router;
