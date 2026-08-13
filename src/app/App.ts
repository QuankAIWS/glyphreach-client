import { WorldConnection, type ConnectionState } from '../net/WorldConnection';
import type { ActionRejectedMessage, GatheringMode, PlayerProgressSnapshot, PlayerSnapshot, PlayerStateMessage, ResourceNodeSnapshot, StationKind, StationSnapshot, WorldStateMessage } from '../protocol/v1';
import { WorldView } from '../world/WorldView';

const RESUME_TOKEN_KEY = 'glyphreach.devResumeToken.v1';

export class GlyphReachApp {
  private readonly worldView = new WorldView();
  private connection: WorldConnection | null = null;
  private localPlayerId: string | null = null;
  private root: HTMLElement | null = null;
  private resources: ResourceNodeSnapshot[] = [];
  private stations: StationSnapshot[] = [];
  private progress: PlayerProgressSnapshot | null = null;
  private readonly onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);

  async mount(root: HTMLElement): Promise<void> {
    this.root = root;
    root.innerHTML = `
      <main class="shell">
        <header class="topbar"><div><div class="eyebrow">FIRST PRODUCTION CHAIN</div><h1>GlyphReach</h1></div><div class="connection-pill" data-testid="connection-status">Connecting…</div></header>
        <section class="world-shell" data-testid="world-shell">
          <div class="world-canvas" data-testid="world-canvas"></div>
          <aside class="connection-card">
            <div class="label">World</div><div data-testid="world-id">Awaiting server…</div>
            <div class="label">Player</div><div data-testid="player-id">Awaiting server…</div>
            <div class="label">Players online</div><div data-testid="player-count">0</div>
            <div class="label">Position</div><div data-testid="local-position">—</div>
            <div class="label">Movement</div><div class="control-note">Click the world to move. WASD / arrows are alternate controls.</div>
            <div class="label">Mining</div><div class="skill-line"><span>Level / XP</span><strong><span data-testid="mining-level">1</span> · <span data-testid="mining-xp">0</span></strong></div>
            <div class="button-stack"><button type="button" data-testid="mine-focused">Focused mine</button><button type="button" data-testid="mine-steady">Steady mine · AFK</button><button type="button" class="button-muted" data-testid="mine-cancel">Cancel Mining</button></div>
            <div class="label">Smithing</div><div class="skill-line"><span>Level / XP</span><strong><span data-testid="smithing-level">1</span> · <span data-testid="smithing-xp">0</span></strong></div>
            <div class="button-stack"><button type="button" data-testid="smelt-copper">Smelt copper ore</button><button type="button" data-testid="smith-pickaxe">Smith copper pickaxe</button><button type="button" class="button-muted" data-testid="processing-cancel">Cancel processing</button><button type="button" data-testid="equip-pickaxe">Equip copper pickaxe</button></div>
            <div class="action-status" data-testid="action-status">Click near the copper vein, furnace, or anvil before using its action.</div>
            <div class="label">Inventory</div><div class="skill-line"><span>Slots</span><strong data-testid="inventory-slots">0 / —</strong></div><div class="skill-line"><span>Copper ore</span><strong data-testid="copper-ore-count">0</strong></div><div class="skill-line"><span>Copper bars</span><strong data-testid="copper-bar-count">0</strong></div><div class="skill-line"><span>Copper pickaxe</span><strong data-testid="copper-pickaxe-count">0</strong></div>
            <div class="label">Equipped tool</div><div data-testid="equipped-tool">None</div>
            <div class="label">World revision</div><div data-testid="world-revision">—</div>
            <div class="label">Build pair</div><div class="build-pair"><span>client <code data-testid="client-build"></code></span><span>server <code data-testid="server-build">—</code></span></div>
          </aside>
        </section>
      </main>`;

    const clientBuild = import.meta.env.VITE_GLYPHREACH_BUILD_SHA || 'dev';
    const wsUrl = import.meta.env.VITE_GLYPHREACH_WS_URL || 'ws://127.0.0.1:8787/world';
    this.requireElement(root, '[data-testid="client-build"]').textContent = clientBuild;
    this.connection = new WorldConnection(wsUrl, clientBuild, (state, detail) => this.updateConnectionStatus(root, state, detail), (state) => this.applyWorldState(root, state), (state) => this.applyPlayerState(root, state), (message) => this.applyActionRejected(root, message));

    this.button(root, 'mine-focused', () => this.startMining('focused'));
    this.button(root, 'mine-steady', () => this.startMining('steady'));
    this.button(root, 'mine-cancel', () => this.connection?.cancelGathering());
    this.button(root, 'smelt-copper', () => this.startProcessing('furnace', 'smelt_copper'));
    this.button(root, 'smith-pickaxe', () => this.startProcessing('anvil', 'smith_copper_pickaxe'));
    this.button(root, 'processing-cancel', () => this.connection?.cancelProcessing());
    this.button(root, 'equip-pickaxe', () => this.connection?.equipItem('copper_pickaxe'));

    try {
      const welcome = await this.connection.connect(window.localStorage.getItem(RESUME_TOKEN_KEY) || undefined);
      window.localStorage.setItem(RESUME_TOKEN_KEY, welcome.resumeToken);
      this.localPlayerId = welcome.player.id; this.resources = welcome.resources; this.stations = welcome.stations; this.progress = welcome.progress;
      this.requireElement(root, '[data-testid="world-id"]').textContent = welcome.worldId;
      this.requireElement(root, '[data-testid="player-id"]').textContent = welcome.player.id;
      this.requireElement(root, '[data-testid="server-build"]').textContent = welcome.serverBuild;
      this.updatePlayerSummary(root, welcome.players); this.renderProgress(root);
      await this.worldView.mount(this.requireElement(root, '[data-testid="world-canvas"]'), welcome, (target) => {
        if (this.connection?.moveTarget(target)) this.requireElement(root, '[data-testid="action-status"]').textContent = 'Moving to target…';
      });
      window.addEventListener('keydown', this.onKeyDown);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to enter GlyphReach';
      this.requireElement(root, '[data-testid="world-canvas"]').innerHTML = `<div class="world-error"><strong>World unavailable</strong><span>${escapeHtml(message)}</span></div>`;
    }
  }

  destroy(): void { window.removeEventListener('keydown', this.onKeyDown); this.connection?.close(); this.worldView.destroy(); this.root = null; }
  private applyWorldState(root: HTMLElement, state: WorldStateMessage): void { this.resources = state.resources; this.stations = state.stations; this.worldView.updateWorld(state.players, state.resources, state.stations); this.requireElement(root, '[data-testid="world-revision"]').textContent = String(state.revision); this.updatePlayerSummary(root, state.players); }
  private applyPlayerState(root: HTMLElement, state: PlayerStateMessage): void { this.progress = state.progress; this.renderProgress(root); }
  private applyActionRejected(root: HTMLElement, message: ActionRejectedMessage): void {
    const labels: Record<ActionRejectedMessage['reason'], string> = {
      invalid_target: 'That destination is outside the playable field.', too_far: 'Move closer to the required world object first.', node_unavailable: 'That vein is depleted. Give it a moment.', inventory_full: 'Your inventory is full.', already_busy: 'Finish or cancel the current activity first.', not_gathering: 'There is no Mining action to cancel.', not_processing: 'There is no processing action to cancel.', invalid_recipe: 'That recipe is not available.', wrong_station: 'That recipe needs a different station.', missing_items: 'You do not have the required materials.', item_not_owned: 'That item is not in your inventory.', invalid_equipment: 'That item cannot be equipped there.'
    };
    this.requireElement(root, '[data-testid="action-status"]').textContent = labels[message.reason];
  }
  private updatePlayerSummary(root: HTMLElement, players: PlayerSnapshot[]): void { this.requireElement(root, '[data-testid="player-count"]').textContent = String(players.length); const local = players.find((player) => player.id === this.localPlayerId); if (local) this.requireElement(root, '[data-testid="local-position"]').textContent = `${Math.round(local.position.x)}, ${Math.round(local.position.y)}`; }
  private renderProgress(root: HTMLElement): void {
    const progress = this.progress; if (!progress) return;
    this.requireElement(root, '[data-testid="mining-level"]').textContent = String(progress.skills.mining.level);
    this.requireElement(root, '[data-testid="mining-xp"]').textContent = String(progress.skills.mining.xp);
    this.requireElement(root, '[data-testid="smithing-level"]').textContent = String(progress.skills.smithing.level);
    this.requireElement(root, '[data-testid="smithing-xp"]').textContent = String(progress.skills.smithing.xp);
    this.requireElement(root, '[data-testid="inventory-slots"]').textContent = `${progress.inventory.slots.length} / ${progress.inventory.capacity}`;
    this.requireElement(root, '[data-testid="copper-ore-count"]').textContent = String(this.itemCount(progress, 'copper_ore'));
    this.requireElement(root, '[data-testid="copper-bar-count"]').textContent = String(this.itemCount(progress, 'copper_bar'));
    this.requireElement(root, '[data-testid="copper-pickaxe-count"]').textContent = String(this.itemCount(progress, 'copper_pickaxe'));
    this.requireElement(root, '[data-testid="equipped-tool"]').textContent = progress.equipment.toolItemId === 'copper_pickaxe' ? 'Copper pickaxe' : 'None';
    if (progress.processing) this.requireElement(root, '[data-testid="action-status"]').textContent = progress.processing.recipeId === 'smelt_copper' ? 'Smelting copper…' : 'Smithing copper pickaxe…';
    else if (progress.gathering) this.requireElement(root, '[data-testid="action-status"]').textContent = progress.gathering.mode === 'steady' ? 'Steady Mining active · continues automatically.' : 'Focused Mining…';
    else if (progress.equipment.toolItemId === 'copper_pickaxe') this.requireElement(root, '[data-testid="action-status"]').textContent = 'Copper pickaxe equipped · Mining is faster.';
  }
  private itemCount(progress: PlayerProgressSnapshot, itemId: string): number { return progress.inventory.slots.filter((slot) => slot.itemId === itemId).reduce((total, slot) => total + slot.quantity, 0); }
  private startMining(mode: GatheringMode): void { const node = this.resources.find((resource) => resource.kind === 'copper_vein'); if (!node || !this.connection || !this.root) return; if (this.connection.startGathering(node.id, mode)) this.requireElement(this.root, '[data-testid="action-status"]').textContent = mode === 'steady' ? 'Starting steady Mining…' : 'Starting focused Mining…'; }
  private startProcessing(kind: StationKind, recipeId: string): void { const station = this.stations.find((candidate) => candidate.kind === kind); if (!station || !this.connection || !this.root) return; if (this.connection.startProcessing(station.id, recipeId)) this.requireElement(this.root, '[data-testid="action-status"]').textContent = kind === 'furnace' ? 'Starting smelt…' : 'Starting smithing…'; }
  private handleKeyDown(event: KeyboardEvent): void { if (event.ctrlKey || event.metaKey || event.altKey) return; const direction = directionForKey(event.key); if (!direction) return; event.preventDefault(); this.connection?.move(direction.dx, direction.dy); }
  private updateConnectionStatus(root: HTMLElement, state: ConnectionState, detail?: string): void { const element = this.requireElement(root, '[data-testid="connection-status"]'); element.dataset.state = state; const labels: Record<ConnectionState, string> = { connecting: 'Connecting…', connected: 'Connected', rejected: 'Rejected', disconnected: 'Disconnected', error: 'Connection error' }; element.textContent = detail ? `${labels[state]} · ${detail}` : labels[state]; }
  private button(root: HTMLElement, testId: string, handler: () => void): void { this.requireElement(root, `[data-testid="${testId}"]`).addEventListener('click', handler); }
  private requireElement(root: HTMLElement, selector: string): HTMLElement { const element = root.querySelector<HTMLElement>(selector); if (!element) throw new Error(`Missing app element: ${selector}`); return element; }
}

function directionForKey(key: string): { dx: -1 | 0 | 1; dy: -1 | 0 | 1 } | null { switch (key.toLowerCase()) { case 'a': case 'arrowleft': return { dx: -1, dy: 0 }; case 'd': case 'arrowright': return { dx: 1, dy: 0 }; case 'w': case 'arrowup': return { dx: 0, dy: -1 }; case 's': case 'arrowdown': return { dx: 0, dy: 1 }; default: return null; } }
function escapeHtml(value: string): string { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
