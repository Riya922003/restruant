"use client";

import { useEffect, useRef } from "react";
import { API_BASE_URL, getToken } from "@/lib/api";

export type OrderEvent = {
  type: "order.created" | "order.status_changed" | "order.payment_taken" | "order.cancelled";
  order_id: number;
  status: string;
  table_id: number | null;
  at: string;
};

const BACKOFF_MS = [1000, 2000, 5000];

function websocketUrl(token: string) {
  const url = new URL(API_BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = url.pathname.replace(/\/api\/?$/, "/ws");
  url.search = "";
  url.searchParams.set("token", token);
  return url.toString();
}

export function useOrderEvents(
  onEvent: (event: OrderEvent) => void,
  options: { poll?: () => void; pollMs?: number } = {}
) {
  const onEventRef = useRef(onEvent);
  const pollRef = useRef(options.poll);

  useEffect(() => {
    onEventRef.current = onEvent;
    pollRef.current = options.poll;
  }, [onEvent, options.poll]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const authToken = token;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    let attempts = 0;
    const pollMs = options.pollMs ?? 5000;

    function startPolling() {
      if (!pollRef.current || pollTimer) return;
      pollTimer = setInterval(() => {
        pollRef.current?.();
      }, pollMs);
    }

    function connect() {
      if (stopped) return;
      try {
        socket = new WebSocket(websocketUrl(authToken));
      } catch {
        startPolling();
        return;
      }

      socket.onopen = () => {
        attempts = 0;
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      };

      socket.onmessage = (message) => {
        try {
          onEventRef.current(JSON.parse(message.data) as OrderEvent);
        } catch {
          // Ignore malformed realtime payloads; HTTP refetch remains authoritative.
        }
      };

      socket.onerror = () => {
        startPolling();
      };

      socket.onclose = () => {
        if (stopped) return;
        attempts += 1;
        if (attempts >= BACKOFF_MS.length) startPolling();
        reconnectTimer = setTimeout(connect, BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]);
      };
    }

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollTimer) clearInterval(pollTimer);
      socket?.close();
    };
  }, [options.pollMs]);
}


