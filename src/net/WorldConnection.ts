import {
  createHello,
  createMoveIntent,
  parseServerMessage,
  type WelcomeMessage,
  type WorldStateMessage,
} from '../protocol/v1';

export type ConnectionState = 'connecting' | 'connected' | 'rejected' | 'disconnected' | 'error';

export class WorldConnection {
  private socket: WebSocket | null = null;
  private sequence = 0;

  constructor(
    private readonly url: string,
    private readonly clientBuild: string,
    private readonly onState: (state: ConnectionState, detail?: string) => void,
    private readonly onWorldState: (state: WorldStateMessage) => void,
  ) {}

  connect(resumeToken?: string, timeoutMs = 5_000): Promise<WelcomeMessage> {
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
        socket.send(JSON.stringify(createHello(this.clientBuild, resumeToken)));
      });

      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') {
          if (!settled) finishReject(new Error('World server sent a non-text handshake message'));
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

          if (message.type === 'WELCOME') {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              this.onState('connected');
              resolve(message);
            }
            return;
          }

          if (settled) this.onWorldState(message);
        } catch (error) {
          socket.close(1002, 'invalid server message');
          if (!settled) {
            finishReject(error instanceof Error ? error : new Error('Invalid world handshake'));
          } else {
            this.onState('error', error instanceof Error ? error.message : 'Invalid world message');
          }
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

  move(dx: -1 | 0 | 1, dy: -1 | 0 | 1): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || (dx === 0 && dy === 0)) return false;
    socket.send(JSON.stringify(createMoveIntent(this.sequence++, dx, dy)));
    return true;
  }

  close(): void {
    this.socket?.close(1000, 'client shutdown');
    this.socket = null;
  }
}
