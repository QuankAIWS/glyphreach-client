import { Application, Graphics } from 'pixi.js';
import type { PlayerSnapshot, Position, ResourceNodeSnapshot, StationSnapshot, WelcomeMessage, WorldBounds } from '../protocol/v1';

const FRAME_MARGIN = 36;

export class WorldView {
  private readonly app = new Application();
  private readonly playerGraphics = new Map<string, Graphics>();
  private readonly resourceGraphics = new Map<string, Graphics>();
  private readonly stationGraphics = new Map<string, Graphics>();
  private targetMarker: Graphics | null = null;
  private mounted = false;
  private bounds: WorldBounds | null = null;
  private localPlayerId: string | null = null;
  private latestPlayers: PlayerSnapshot[] = [];
  private latestResources: ResourceNodeSnapshot[] = [];
  private latestStations: StationSnapshot[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private onMoveTarget: ((position: Position) => void) | null = null;
  private readonly onPointerDown = (event: PointerEvent) => this.handlePointerDown(event);

  async mount(host: HTMLElement, snapshot: WelcomeMessage, onMoveTarget: (position: Position) => void): Promise<void> {
    this.bounds = snapshot.world.bounds;
    this.localPlayerId = snapshot.player.id;
    this.latestPlayers = snapshot.players;
    this.latestResources = snapshot.resources;
    this.latestStations = snapshot.stations;
    this.onMoveTarget = onMoveTarget;
    await this.app.init({ width: 960, height: 540, background: '#0b1017', antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
    this.app.canvas.setAttribute('aria-label', 'GlyphReach world');
    this.app.canvas.setAttribute('data-testid', 'world-canvas-element');
    host.replaceChildren(this.app.canvas);
    this.canvas = this.app.canvas;
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    const innerWidth = this.app.screen.width - FRAME_MARGIN * 2;
    const innerHeight = this.app.screen.height - FRAME_MARGIN * 2;
    this.app.stage.addChild(new Graphics().roundRect(FRAME_MARGIN, FRAME_MARGIN, innerWidth, innerHeight, 18).fill({ color: 0x121c26 }).stroke({ color: 0x30465b, width: 2 }));
    this.targetMarker = new Graphics().circle(0, 0, 9).stroke({ color: 0xd8c27a, width: 2, alpha: 0.9 });
    this.targetMarker.visible = false;
    this.app.stage.addChild(this.targetMarker);
    this.mounted = true;
    this.renderStations();
    this.renderResources();
    this.renderPlayers();
  }

  updateWorld(players: PlayerSnapshot[], resources: ResourceNodeSnapshot[], stations: StationSnapshot[]): void {
    this.latestPlayers = players;
    this.latestResources = resources;
    this.latestStations = stations;
    if (!this.mounted) return;
    this.renderStations();
    this.renderResources();
    this.renderPlayers();
  }

  destroy(): void {
    this.canvas?.removeEventListener('pointerdown', this.onPointerDown);
    this.playerGraphics.clear(); this.resourceGraphics.clear(); this.stationGraphics.clear();
    this.targetMarker = null; this.canvas = null; this.onMoveTarget = null; this.mounted = false;
    this.app.destroy(true, { children: true });
  }

  private handlePointerDown(event: PointerEvent): void {
    const canvas = this.canvas; const bounds = this.bounds; const marker = this.targetMarker; const moveTarget = this.onMoveTarget;
    if (event.button !== 0 || !canvas || !bounds || !marker || !moveTarget) return;
    const rect = canvas.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) return;
    const stageX = ((event.clientX - rect.left) / rect.width) * this.app.screen.width;
    const stageY = ((event.clientY - rect.top) / rect.height) * this.app.screen.height;
    const innerWidth = this.app.screen.width - FRAME_MARGIN * 2; const innerHeight = this.app.screen.height - FRAME_MARGIN * 2;
    if (stageX < FRAME_MARGIN || stageX > FRAME_MARGIN + innerWidth || stageY < FRAME_MARGIN || stageY > FRAME_MARGIN + innerHeight) return;
    const normalizedX = (stageX - FRAME_MARGIN) / innerWidth; const normalizedY = (stageY - FRAME_MARGIN) / innerHeight;
    const target = { x: bounds.minX + normalizedX * (bounds.maxX - bounds.minX), y: bounds.minY + normalizedY * (bounds.maxY - bounds.minY) };
    this.positionGraphic(marker, target); marker.visible = true; moveTarget(target);
  }

  private renderPlayers(): void {
    const ids = new Set(this.latestPlayers.map((player) => player.id));
    for (const [id, graphic] of this.playerGraphics) if (!ids.has(id)) { this.app.stage.removeChild(graphic); graphic.destroy(); this.playerGraphics.delete(id); }
    for (const player of this.latestPlayers) {
      let graphic = this.playerGraphics.get(player.id);
      if (!graphic) {
        const local = player.id === this.localPlayerId;
        graphic = new Graphics().circle(0, 0, local ? 13 : 11).fill({ color: local ? 0xe5c46b : 0x6ba7e5 }).stroke({ color: local ? 0xfff0bd : 0xc5e1ff, width: 2 });
        this.playerGraphics.set(player.id, graphic); this.app.stage.addChild(graphic);
      }
      this.positionGraphic(graphic, player.position);
    }
    const local = this.latestPlayers.find((player) => player.id === this.localPlayerId);
    if (local && this.targetMarker?.visible) {
      const target = this.worldPositionForGraphic(this.targetMarker);
      if (target && Math.hypot(local.position.x - target.x, local.position.y - target.y) < 8) this.targetMarker.visible = false;
    }
  }

  private renderResources(): void {
    const ids = new Set(this.latestResources.map((resource) => resource.id));
    for (const [id, graphic] of this.resourceGraphics) if (!ids.has(id)) { this.app.stage.removeChild(graphic); graphic.destroy(); this.resourceGraphics.delete(id); }
    for (const resource of this.latestResources) {
      const existing = this.resourceGraphics.get(resource.id); if (existing) { this.app.stage.removeChild(existing); existing.destroy(); }
      const graphic = new Graphics().circle(0, 0, 19).fill({ color: resource.available ? 0xb6764f : 0x5b4a42 }).stroke({ color: resource.available ? 0xe0a27a : 0x7c6b62, width: 3 }).circle(-5, -4, 5).fill({ color: resource.available ? 0xd2946a : 0x6b5c55 });
      this.positionGraphic(graphic, resource.position); this.resourceGraphics.set(resource.id, graphic); this.app.stage.addChild(graphic);
    }
  }

  private renderStations(): void {
    const ids = new Set(this.latestStations.map((station) => station.id));
    for (const [id, graphic] of this.stationGraphics) if (!ids.has(id)) { this.app.stage.removeChild(graphic); graphic.destroy(); this.stationGraphics.delete(id); }
    for (const station of this.latestStations) {
      const existing = this.stationGraphics.get(station.id); if (existing) { this.app.stage.removeChild(existing); existing.destroy(); }
      const graphic = station.kind === 'furnace'
        ? new Graphics().roundRect(-18, -18, 36, 36, 7).fill({ color: 0x8b4937 }).stroke({ color: 0xf09655, width: 3 }).circle(0, 5, 7).fill({ color: 0xf6b45f })
        : new Graphics().rect(-22, -9, 44, 18).fill({ color: 0x66717c }).stroke({ color: 0xaab7c2, width: 2 }).rect(-7, 9, 14, 13).fill({ color: 0x4e5963 });
      this.positionGraphic(graphic, station.position); this.stationGraphics.set(station.id, graphic); this.app.stage.addChild(graphic);
    }
  }

  private positionGraphic(graphic: Graphics | null, position: Position): void {
    if (!graphic || !this.bounds) return;
    const innerWidth = this.app.screen.width - FRAME_MARGIN * 2; const innerHeight = this.app.screen.height - FRAME_MARGIN * 2;
    const normalizedX = (position.x - this.bounds.minX) / (this.bounds.maxX - this.bounds.minX); const normalizedY = (position.y - this.bounds.minY) / (this.bounds.maxY - this.bounds.minY);
    graphic.position.set(FRAME_MARGIN + normalizedX * innerWidth, FRAME_MARGIN + normalizedY * innerHeight);
  }
  private worldPositionForGraphic(graphic: Graphics): Position | null {
    if (!this.bounds) return null;
    const innerWidth = this.app.screen.width - FRAME_MARGIN * 2; const innerHeight = this.app.screen.height - FRAME_MARGIN * 2;
    return { x: this.bounds.minX + ((graphic.position.x - FRAME_MARGIN) / innerWidth) * (this.bounds.maxX - this.bounds.minX), y: this.bounds.minY + ((graphic.position.y - FRAME_MARGIN) / innerHeight) * (this.bounds.maxY - this.bounds.minY) };
  }
}
