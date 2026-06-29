import express from "express";
import multer from "multer";
import { getSession, updateSessionStatus } from "./db";
import { processSession } from "./analysisService";

const router = express.Router();

const SUPPORTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/tif",
  "application/postscript", // EPS
  "application/eps",
  "image/x-eps",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
  "application/msword", // DOC
];

const SUPPORTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".eps", ".docx", ".doc"];

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const ext = "." + file.originalname.split(".").pop()?.toLowerCase();
    const mimeOk = SUPPORTED_TYPES.includes(file.mimetype);
    const extOk = SUPPORTED_EXTENSIONS.includes(ext);
    if (mimeOk || extOk) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype} (${ext})`));
    }
  },
});

// POST /api/upload/:sessionId
router.post("/:sessionId", upload.array("files", 20), async (req, res) => {
  const sessionId = parseInt(req.params.sessionId, 10);
  if (isNaN(sessionId)) {
    return res.status(400).json({ error: "Invalid session ID" });
  }

  const session = await getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  // Respond immediately, process in background
  res.json({ success: true, sessionId, fileCount: files.length });

  // Process asynchronously
  const fileData = files.map((f) => ({
    buffer: f.buffer,
    filename: f.originalname,
    mimeType: f.mimetype,
  }));

  processSession(sessionId, fileData, session.mode).catch((err) => {
    console.error("[Upload] Processing error:", err);
    updateSessionStatus(sessionId, "error", err.message).catch(() => {});
  });
});

export default router;
