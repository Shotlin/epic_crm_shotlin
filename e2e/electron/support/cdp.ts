type CdpError = {
  code: number;
  message: string;
  data?: string;
};

type CdpResponse = {
  id?: number;
  result?: unknown;
  error?: CdpError;
  method?: string;
  params?: unknown;
};

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type CdpEventHandler = (params: unknown) => void;

/**
 * Small, dependency-free CDP client for the packaged Electron test seam.
 * It drives the Chromium window that Electron launched; it does not replace
 * the preload bridge, renderer, main process, or SQLite implementation.
 */
export class CdpClient {
  private readonly pending = new Map<number, PendingRequest>();
  private readonly handlers = new Map<string, Set<CdpEventHandler>>();
  private nextRequestId = 1;
  private closed = false;

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => this.onMessage(event));
    socket.addEventListener('close', () => this.onClose());
    socket.addEventListener('error', () => this.rejectPending('CDP socket failed.'));
  }

  public static async connect(endpoint: string): Promise<CdpClient> {
    const socket = new WebSocket(endpoint);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out connecting to Electron CDP at ${endpoint}.`));
      }, 15_000);
      socket.addEventListener('open', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      socket.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error(`Could not connect to Electron CDP at ${endpoint}.`));
      }, { once: true });
    });
    return new CdpClient(socket);
  }

  public on(method: string, handler: CdpEventHandler): () => void {
    const handlers = this.handlers.get(method) ?? new Set<CdpEventHandler>();
    handlers.add(handler);
    this.handlers.set(method, handlers);
    return () => {
      handlers.delete(handler);
      if (!handlers.size) this.handlers.delete(method);
    };
  }

  public async send<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.closed) throw new Error(`Cannot call ${method}; the CDP connection is closed.`);
    const id = this.nextRequestId;
    this.nextRequestId += 1;

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command ${method} timed out.`));
      }, 30_000);
      this.pending.set(id, {
        resolve: (result) => resolve(result as T),
        reject,
        timeout,
      });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  public async evaluate<T>(expression: string): Promise<T> {
    const response = await this.send<{
      result: { value?: unknown; description?: string };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    }>('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      const detail = response.exceptionDetails.exception?.description
        ?? response.exceptionDetails.text
        ?? 'Unknown renderer evaluation error';
      throw new Error(detail);
    }
    return response.result.value as T;
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 2_000);
      this.socket.addEventListener('close', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.socket.close();
    });
  }

  private onMessage(event: MessageEvent<unknown>): void {
    let message: CdpResponse;
    try {
      message = JSON.parse(String(event.data)) as CdpResponse;
    } catch {
      return;
    }
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`CDP ${message.error.code}: ${message.error.message}${message.error.data ? ` (${message.error.data})` : ''}`));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (!message.method) return;
    for (const handler of this.handlers.get(message.method) ?? []) {
      handler(message.params);
    }
  }

  private onClose(): void {
    this.closed = true;
    this.rejectPending('CDP connection closed.');
  }

  private rejectPending(message: string): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(message));
      this.pending.delete(id);
    }
  }
}
