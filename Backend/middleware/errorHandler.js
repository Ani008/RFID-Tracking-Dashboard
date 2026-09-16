// Centralized Express error-handling middleware.
// Any controller that calls next(err) ends up here.
export function errorHandler(err, req, res, next) {
  // eslint-disable-line no-unused-vars
  console.error("[error]", err);

  if (err.name === "ValidationError") {
    return res
      .status(400)
      .json({ error: "Validation error", details: err.errors });
  }

  if (err.code === 11000) {
    return res
      .status(409)
      .json({ error: "Duplicate key", details: err.keyValue });
  }
  // Multer file-upload errors (bad file type, too large, etc.) are client errors, not 500s.
  if (
    err.name === "MulterError" ||
    /only \.(xlsx|xls|csv) files are supported/i.test(err.message || "")
  ) {
    return res.status(400).json({ error: err.message || "File upload error" });
  }

  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
}

export function notFoundHandler(req, res) {
  res
    .status(404)
    .json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}
