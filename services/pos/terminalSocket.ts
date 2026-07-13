import { ENV } from "@/utils/constants";

/**
 * POS terminal WebSocket client. A merchant device in terminal mode holds this
 * socket open; the backend pushes SALE messages down it for this terminalId
 * (see backend/src/server.ts POS section). React Native's WebSocket auto-responds
 * to the server's protocol-level ping frames, so this only handles (re)connection
 * and message dispatch — no app-level heartbeat needed.
 */

export type SaleMessage = {
  type: "SALE";
  sessionId: string;
  amountMicros: number;
  totalCents: number;
  netCents: number;
  vatCents: number;
  tillId: string;
};

export type ConnectionState = "connecting" | "connected" | "disconnected";

type Handlers = {
  onSale: (sale: SaleMessage) => void;
  onState: (state: ConnectionState) => void;
};

/** Derive the ws(s) socket URL from the configured backend http(s) origin. */
function socketUrl(terminalId: string, token: string): string {
  const base = ENV.backendUrl.replace(/^http/, "ws").replace(/\/+$/, "");
  return `${base}/pos/v1/socket?terminalId=${encodeURIComponent(terminalId)}&token=${encodeURIComponent(token)}`;
}

export class TerminalSocket {
  private ws: WebSocket | null = null;
  private closedByUs = false;
  private retry = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private terminalId: string,
    private token: string,
    private handlers: Handlers,
  ) {}

  start(): void {
    this.closedByUs = false;
    this.connect();
  }

  stop(): void {
    this.closedByUs = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
    this.handlers.onState("disconnected");
  }

  /** Send a JSON message to the backend (e.g. a SALE ACK) if connected. */
  send(message: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private connect(): void {
    this.handlers.onState("connecting");
    const ws = new WebSocket(socketUrl(this.terminalId, this.token));
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.handlers.onState("connected");
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg?.type === "SALE") this.handlers.onSale(msg as SaleMessage);
      } catch {
        // ignore non-JSON / unknown frames
      }
    };
    ws.onerror = () => {
      // onclose follows; reconnection is handled there.
    };
    ws.onclose = () => {
      this.ws = null;
      this.handlers.onState("disconnected");
      if (!this.closedByUs) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    // Exponential backoff capped at 15s (1, 2, 4, 8, 15, 15…).
    const delay = Math.min(15_000, 1_000 * 2 ** this.retry);
    this.retry += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
