const path = require("path");
const express = require("express");
const cors = require("cors");
const { env } = require("./config/env");
const { errorMiddleware } = require("./middlewares/error.middleware");
const { registerRoutes } = require("./routes");

const app = express();

// Allow one or more frontend origins (comma-separated in FRONTEND_ORIGIN).
// Trailing slashes are stripped so "https://app.vercel.app/" and
// "https://app.vercel.app" both match the browser's Origin header. Requests with
// no Origin (curl, health checks, same-origin) are allowed through.
const stripSlash = (s) => s.trim().replace(/\/+$/, "");
const allowedOrigins = env.frontendOrigin.split(",").map(stripSlash).filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(stripSlash(origin))) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded invoice files (path persisted as supplier_invoices.file_url).
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "restaurantos-api" });
});

app.use("/api", registerRoutes());
app.use(errorMiddleware);

module.exports = { app };

