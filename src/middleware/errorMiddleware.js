function notFoundHandler(req, res) {
  res.status(404).json({ message: "Route not found" });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || "Internal server error";

  if (statusCode >= 500) {
    console.error(error);
  } else {
    console.warn(`${statusCode} ${message}`);
  }

  return res.status(statusCode).json({ message });
}

module.exports = { notFoundHandler, errorHandler };
