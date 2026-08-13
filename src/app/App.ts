import { WorldConnection, type ConnectionState } from '../net/WorldConnection';
import type {
  ActionRejectedMessage,
  GatheringMode,
  PlayerProgressSnapshot,
  PlayerSnapshot,
  PlayerStateMessage,
  ResourceNodeSnapshot,
  WorldStateMessage,
} from '../protocol/v1';
import { WorldView } from '../world/WorldView';

const RESUME_TOKEN_KEY = 'glyphreach.devResumeToken.v1';

export class GlyphReachApp {
  private readonly worldView = new WorldView();
  private connection: WorldConnection | null = null;
  private localPlayerId: string | null = null;
  private root: HTMLElement | null = null;
  private resources: ResourceNodeSnapshot[] = [];
  private progress: PlayerProgressSnapshot | null = null;
  private readonly onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);

  async mount(root: HTMLElement): Promise<void> {
    this.root = root;
    root.innerHTML = `
      <main class="shell">
        <header class="topbar">
          <div>
            <div class="eyebrow">FIRST SKILL LOOP</div>
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
            <div class="label">Players online</div>
            <div data-testid="player-count">0</div>
            <div class="label">Position</div>
            <div data-testid="local-position">—</div>
            <div class="label">Movement</div>
            <div class="control-note">Click the world to move. WASD / arrows are alternate controls.</div>
            <div class="label">Mining</div>
            <div class="skill-line"><span>Level</span><strong data-testid="mining-level">1</strong></div>
            <div class="skill-line"><span>XP</span><strong data-testid="mining-xp">0</strong></div>
            <div class="button-stack">
              <button type="button" data-testid="mine-focused">Focused mine</button>
              <button type="button" data-testid="mine-steady">Steady mine · AFK</button>
              <button type="button" class="button-muted" data-testid="mine-cancel">Cancel</button>
            </div>
            <div class="action-status" data-testid="action-status">Walk near the copper vein to mine.</div>
            <div class="label">Inventory</div>
            <div class="skill-line"><span>Slots</span><strong data-testid="inventory-slots">0 / —</strong></div>
            <div class="skill-line"><span>Copper ore</span><strong data-testid="copper-ore-count">0</strong></div>
            <div class="label">World revision</div>
            <div data-testid="world-revision">—</div>
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

    this.connection = new WorldConnection(
      wsUrl,
      clientBuild,
      (state, detail) => this.updateConnectionStatus(root, state, detail),
      (state) => this.applyWorldState(root, state),
      (state) => this.applyPlayerState(root, state),
      (message) => this.applyActionRejected(root, message),
    );

    this.requireElement(root, '[data-testid="mine-focused"]').addEventListener('click', () => this.startMining('focused'));
    this.requireElement(root, '[data-testid="mine-steady"]').addEventListener('click', () => this.startMining('steady'));
    this.requireElement(root, '[data-testid="mine-cancel"]').addEventListener('click', () => this.connection?.cancelGathering());

    try {
      const resumeToken = window.localStorage.getItem(RESUME_TOKEN_KEY) || undefined;
      const welcome = await this.connection.connect(resumeToken);
      window.localStorage.setItem(RESUME_TOKEN_KEY, welcome.resumeToken);
      this.localPlayerId = welcome.player.id;
      this.resources = welcome.resources;
      this.progress = welcome.progress;
      this.requireElement(root, '[data-testid="world-id"]').textContent = welcome.worldId;
      this.requireElement(root, '[data-testid="player-id"]').textContent = welcome.player.id;
      this.requireElement(root, '[data-testid="server-build"]').textContent = welcome.serverBuild;
      this.updatePlayerSummary(root, welcome.players);
      this.renderProgress(root);
      const canvasHost = this.requireElement(root, '[data-testid="world-canvas"]');
      await this.worldView.mount(canvasHost, welcome, (target) => {
        if (this.connection?.moveTarget(target)) {
          this.requireElement(root, '[data-testid="action-status"]').textContent = 'Moving to target…';
        }
      });
      window.addEventListener('keydown', this.onKeyDown);
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
    window.removeEventListener('keydown', this.onKeyDown);
    this.connection?.close();
    this.worldView.destroy();
    this.root = null;
  }

  private applyWorldState(root: HTMLElement, state: WorldStateMessage): void {
    this.resources = state.resources;
    this.worldView.updateWorld(state.players, state.resources);
    this.requireElement(root, '[data-testid="world-revision"]').textContent = String(state.revision);
    this.updatePlayerSummary(root, state.players);
  }

  private applyPlayerState(root: HTMLElement, state: PlayerStateMessage): void {
    this.progress = state.progress;
    this.renderProgress(root);
  }

  private applyActionRejected(root: HTMLElement, message: ActionRejectedMessage): void {
    const labels: Record<ActionRejectedMessage['reason'], string> = {
      invalid_target: 'That destination is outside the playable field.',
      too_far: 'Move closer to the copper vein first.',
      node_unavailable: 'That vein is depleted. Give it a moment.',
      inventory_full: 'Your inventory is full.',
      already_gathering: 'You are already mining.',
      not_gathering: 'There is no Mining action to cancel.',
    };
    this.requireElement(root, '[data-testid="action-status"]').textContent = labels[message.reason];
  }

  private updatePlayerSummary(root: HTMLElement, players: PlayerSnapshot[]): void {
    this.requireElement(root, '[data-testid="player-count"]').textContent = String(players.length);
    const local = players.find((player) => player.id === this.localPlayerId);
    if (local) {
      this.requireElement(root, '[data-testid="local-position"]').textContent =
        `${Math.round(local.position.x)}, ${Math.round(local.position.y)}`;
    }
  }

  private renderProgress(root: HTMLElement): void {
    const progress = this.progress;
    if (!progress) return;
    const mining = progress.skills.mining;
    this.requireElement(root, '[data-testid="mining-level"]').textContent = String(mining.level);
    this.requireElement(root, '[data-testid="mining-xp"]').textContent = String(mining.xp);
    this.requireElement(root, '[data-testid="inventory-slots"]').textContent =
      `${progress.inventory.slots.length} / ${progress.inventory.capacity}`;
    const copper = progress.inventory.slots
      .filter((slot) => slot.itemId === 'copper_ore')
      .reduce((total, slot) => total + slot.quantity, 0);
    this.requireElement(root, '[data-testid="copper-ore-count"]').textContent = String(copper);

    if (progress.gathering) {
      this.requireElement(root, '[data-testid="action-status"]').textContent =
        progress.gathering.mode === 'steady'
          ? 'Steady Mining active · continues automatically.'
          : 'Focused Mining…';
    } else if (copper > 0) {
      this.requireElement(root, '[data-testid="action-status"]').textContent = 'Copper ore acquired.';
    }
  }

  private startMining(mode: GatheringMode): void {
    const root = this.root;
    const node = this.resources.find((resource) => resource.kind === 'copper_vein');
    if (!root || !node || !this.connection) return;
    if (this.connection.startGathering(node.id, mode)) {
      this.requireElement(root, '[data-testid="action-status"]').textContent =
        mode === 'steady' ? 'Starting steady Mining…' : 'Starting focused Mining…';
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const direction = directionForKey(event.key);
    if (!direction) return;
    event.preventDefault();
    this.connection?.move(direction.dx, direction.dy);
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

function directionForKey(key: string): { dx: -1 | 0 | 1; dy: -1 | 0 | 1 } | null {
  switch (key.toLowerCase()) {
    case 'a':
    case 'arrowleft':
      return { dx: -1, dy: 0 };
    case 'd':
    case 'arrowright':
      return { dx: 1, dy: 0 };
    case 'w':
    case 'arrowup':
      return { dx: 0, dy: -1 };
    case 's':
    case 'arrowdown':
      return { dx: 0, dy: 1 };
    default:
      return null;
  }
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}
