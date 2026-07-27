const ORDER_EVENT_ROLES = new Set(["owner", "manager", "chef", "waiter", "cashier"]);
const sockets = new Set();
const SOCKET_OPEN = 1;

function canReceiveOrderEvents(role) {
  return ORDER_EVENT_ROLES.has(role);
}

function registerOrderSocket(socket, user) {
  if (!canReceiveOrderEvents(user?.role)) {
    socket.close(4403, "Forbidden");
    return;
  }

  socket.user = { id: user.id, role: user.role };
  sockets.add(socket);

  socket.on("close", () => {
    sockets.delete(socket);
  });
}

function broadcastOrderEvent(event) {
  const payload = JSON.stringify({
    type: event.type,
    order_id: event.order_id,
    status: event.status,
    table_id: event.table_id ?? null,
    at: event.at ?? new Date().toISOString(),
  });

  for (const socket of sockets) {
    if (socket.readyState !== SOCKET_OPEN) {
      sockets.delete(socket);
      continue;
    }
    if (canReceiveOrderEvents(socket.user?.role)) {
      socket.send(payload);
    }
  }
}

module.exports = { broadcastOrderEvent, registerOrderSocket };

