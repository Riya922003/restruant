const express = require("express");
const cors = require("cors");
const { env } = require("./config/env");
const { errorMiddleware } = require("./middlewares/error.middleware");
const { registerRoutes } = require("./routes");

const app = express();

app.use(cors({ origin: env.frontendOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "restaurantos-api" });
});

app.use("/api", registerRoutes());
app.use(errorMiddleware);

module.exports = { app };

