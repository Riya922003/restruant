const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { ApiError } = require("../utils/api-error");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

// Ensure the upload directory exists at boot.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    const id = req.params.id || "new";
    // Deterministic-ish unique name; Date.now is fine in the server runtime.
    cb(null, `inv-${id}-${Date.now()}${ext.toLowerCase()}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new ApiError(422, "Unsupported file type; allowed: PDF, PNG, JPG, WEBP"));
  }
  cb(null, true);
};

const upload = multer({ storage, limits: { fileSize: MAX_SIZE }, fileFilter });

// Wrap multer's single-file handler so its errors become ApiErrors with clean
// messages instead of raw multer errors.
function uploadSingle(field) {
  const handler = upload.single(field);
  return (req, res, next) => {
    handler(req, res, (err) => {
      if (!err) return next();
      if (err instanceof ApiError) return next(err);
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(new ApiError(422, "File exceeds 10 MB limit"));
      }
      return next(new ApiError(400, "File upload failed"));
    });
  };
}

// Backwards-compatible no-op export kept for any existing import.
function uploadMiddleware(_req, _res, next) {
  next();
}

module.exports = { uploadMiddleware, uploadSingle, UPLOAD_DIR };
