import { useEffect, useRef, useCallback, useState } from 'react';
import type { ServerEvent } from '../lib/types';

export function useHRWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<ServerEvent | null>(null);
  const handlersRef = useRef<Map<string, Set<(e: unknown) => void>>>(new Map());

  const on = useCallback(<T extends ServerEvent['type']>(
    type: T,
    handler: (event: Extract<ServerEvent, { type: T }>) => void
  ) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set());
    }
    handlersRef.current.get(type)!.add(handler as (e: unknown) => void);
    return () => {
      handlersRef.current.get(type)?.delete(handler as (e: unknown) => void);
    };
  }, []);

  const ping = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'ping' }));
  }, []);

  useEffect(() => {
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (stopped) return;
      const ws = new WebSocket(url);

      ws.onopen = () => setConnected(true);

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as ServerEvent;
          setLastEvent(event);
          const handlers = handlersRef.current.get(event.type);
          if (handlers) {
            for (const h of handlers) h(event);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!stopped) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => ws.close();
      wsRef.current = ws;
    }

    connect();

    return () => {
      stopped = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [url]);

  return { connected, lastEvent, on, ping };
}
