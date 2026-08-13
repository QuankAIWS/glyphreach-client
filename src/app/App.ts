import { WorldConnection, type ConnectionState } from '../net/WorldConnection';
import { WorldView } from '../world/WorldView';

export class GlyphReachApp {
  private readonly worldView = new WorldView();
  private connection: WorldConnection | null = null;

  async mount(root: HTMLElement): Promise<void> {
    root.innerHTML = `
      <main class="shell">
        <header class="topbar">
          <div>
            <div class="eyebrow">ALPHA FOUNDATION</div>
            <h1>GlyphReach</h1>
          </div>
          <div class="connection-pill" data-testid="connection-status">Connecting…</div>
        </header>
        <section class="world-shell" data-testid="world-shell">
          <div class="world-canvas" data-testid="world-canvas"></div>
          <aside class="connection-card">
            <div class="label">World</div>
            <div data-testid="world-id">Awaiting server…</div>
            <div class="label">Player</div>
            <div data-testid="player-id">Awaiting server…</div>
            <div class="label">Build pair</div>
            <div class="build-pair">
              <span>client <code data-testid="client-build"></code></span>
              <span>server <code data-testid="server-build">—</code></span>
            </div>
          </aside>
        </section>
      </main>
    `;

    const clientBuild = import.meta.env.VITE_GLYPHREACH_BUILD_SHA || 'dev';
    const wsUrl = import.meta.env.VITE_GLYPHREACH_WS_URL || 'ws://127.0.0.1:8787/world';
    this.requireElement(root, '[data-testid="client-build"]').textContent = clientBuild;

    this.connection = new WorldConnection(wsUrl, clientBuild, (state, detail) => {
      this.updateConnectionStatus(root, state, detail);
    });

    try {
      const welcome = await this.connection.connect();
      this.requireElement(root, '[data-testid="world-id"]').textContent = welcome.worldId;
      this.requireElement(root, '[data-testid="player-id"]').textContent = welcome.player.id;
      this.requireElement(root, '[data-testid="server-build"]').textContent = welcome.serverBuild;
      const canvasHost = this.requireElement(root, '[data-testid="world-canvas"]');
      await this.worldView.mount(canvasHost, welcome);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to enter GlyphReach';
      this.requireElement(root, '[data-testid="world-canvas"]').innerHTML = `
        <div class="world-error">
          <strong>World unavailable</strong>
          <span>${escapeHtml(message)}</span>
        </div>
      `;
    }
  }

  destroy(): void {
    this.connection?.close();
    this.worldView.destroy();
  }

  private updateConnectionStatus(root: HTMLElement, state: ConnectionState, detail?: string): void {
    const element = this.requireElement(root, '[data-testid="connection-status"]');
    element.dataset.state = state;
    const labels: Record<ConnectionState, string> = {
      connecting: 'Connecting…',
      connected: 'Connected',
      rejected: 'Rejected',
      disconnected: 'Disconnected',
      error: 'Connection error',
    };
    element.textContent = detail ? `${labels[state]} · ${detail}` : labels[state];
  }

  private requireElement(root: HTMLElement, selector: string): HTMLElement {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing app element: ${selector}`);
    return element;
  }
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}
