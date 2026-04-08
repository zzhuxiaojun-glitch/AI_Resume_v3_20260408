import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHRWebSocket } from './useWebSocket';

// Minimal WebSocket mock
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1; // OPEN
  sentMessages: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    // Simulate async open
    setTimeout(() => this.onopen?.(), 0);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.onclose?.();
  }

  simulateMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useHRWebSocket', () => {
  it('starts disconnected and becomes connected on open', async () => {
    const { result } = renderHook(() => useHRWebSocket('wss://test'));

    expect(result.current.connected).toBe(false);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.connected).toBe(true);
  });

  it('updates lastEvent when a message is received', async () => {
    const { result } = renderHook(() => useHRWebSocket('wss://test'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
      MockWebSocket.instances[0].simulateMessage({
        type: 'heartbeat',
        timestamp: '2026-04-08T00:00:00.000Z',
        connectedClients: 2,
      });
    });

    expect(result.current.lastEvent?.type).toBe('heartbeat');
  });

  it('calls registered event handlers for matching event type', async () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useHRWebSocket('wss://test'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    result.current.on('candidate:new', handler);

    await act(async () => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'candidate:new',
        candidateId: 'c-1',
        name: '张三',
        positionId: 'p-1',
        positionTitle: '工程师',
        source: 'email',
        timestamp: '2026-04-08T00:00:00.000Z',
      });
    });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].candidateId).toBe('c-1');
  });

  it('sends ping message to WebSocket', async () => {
    const { result } = renderHook(() => useHRWebSocket('wss://test'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => {
      result.current.ping();
    });

    const ws = MockWebSocket.instances[0];
    expect(ws.sentMessages).toContain(JSON.stringify({ type: 'ping' }));
  });

  it('becomes disconnected when WebSocket closes', async () => {
    const { result } = renderHook(() => useHRWebSocket('wss://test'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.connected).toBe(true);

    await act(async () => {
      MockWebSocket.instances[0].onclose?.();
    });

    expect(result.current.connected).toBe(false);
  });
});
