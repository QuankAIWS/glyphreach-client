import { createHello, parseServerMessage, type WelcomeMessage } from '../protocol/v1';

export type ConnectionState = 'connecting' | 'connected' | 'rejected' | 'disconnected' | 'error';

export class WorldConnection {
  private socket: WebSocket | null = null;

  constructor(
    private readonly url: string,
    private readonly clientBuild: string,
    private readonly onState: (state: ConnectionState, detail?: string) => void,
  ) {}

  connect(timeoutMs = 5_000): Promise<WelcomeMessage> {
    this.onState('connecting');

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      let settled = false;

      const finishReject = (error: Error, state: ConnectionState = 'error') => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.onState(state, error.message);
        reject(error);
      };

      const timeout = window.setTimeout(() => {
        socket.close(1000, 'handshake timeout');
        finishReject(new Error('World handshake timed out'));
      }, timeoutMs);

      socket.addEventListener('open', () => {
        socket.send(JSON.stringify(createHello(this.clientBuild)));
      });

      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') {
          finishReject(new Error('World server sent a non-text handshake message'));
          return;
        }

        try {
          const message = parseServerMessage(event.data);
          if (message.type === 'REJECT') {
            socket.close(1002, message.reason);
            finishReject(
              new Error(`World server rejected client: ${message.reason}`),
              'rejected',
            );
            return;
          }

          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            this.onState('connected');
            resolve(message);
          }
        } catch (error) {
          socket.close(1002, 'invalid handshake');
          finishReject(error instanceof Error ? error : new Error('Invalid world handshake'));
        }
      });

      socket.addEventListener('error', () => {
        finishReject(new Error('Unable to reach the GlyphReach world server'));
      });

      socket.addEventListener('close', () => {
        if (!settled) {
          finishReject(new Error('World connection closed during handshake'), 'disconnected');
        } else {
          this.onState('disconnected');
        }
      });
    });
  }

  close(): void {
    this.socket?.close(1000, 'client shutdown');
    this.socket = null;
  }
}
