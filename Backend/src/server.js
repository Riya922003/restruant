const http = require("http");
const { WebSocketServer } = require("ws");
const { app } = require("./app");
const { env, assertRequiredEnv } = require("./config/env");
const { pool } = require("./config/database");
const { verifyToken } = require("./utils/jwt");
const { registerOrderSocket } = require("./realtime/order-events");

function attachRealtime(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket, request) => {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const token = url.searchParams.get("token");

    if (!token) {
      socket.close(4401, "Unauthorized");
      return;
    }

    try {
      const payload = verifyToken(token);
      registerOrderSocket(socket, {
        id: Number(payload.sub),
        role: payload.role,
      });
    } catch {
      socket.close(4401, "Unauthorized");
    }
  });
}

async function startServer() {
  assertRequiredEnv();
  await pool.query("SELECT 1");

  const server = http.createServer(app);
  attachRealtime(server);

  server.listen(env.port, () => {
    console.log(`RestaurantOS API listening on port ${env.port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start API server", error);
  process.exit(1);
});
