import { Application, Graphics } from 'pixi.js';
import type {
  PlayerSnapshot,
  Position,
  ResourceNodeSnapshot,
  WelcomeMessage,
  WorldBounds,
} from '../protocol/v1';

const FRAME_MARGIN = 36;

export class WorldView {
  private readonly app = new Application();
  private readonly playerGraphics = new Map<string, Graphics>();
  private readonly resourceGraphics = new Map<string, Graphics>();
  private targetMarker: Graphics | null = null;
  private mounted = false;
  private bounds: WorldBounds | null = null;
  private localPlayerId: string | null = null;
  private latestPlayers: PlayerSnapshot[] = [];
  private latestResources: ResourceNodeSnapshot[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private onMoveTarget: ((position: Position) => void) | null = null;
  private readonly onPointerDown = (event: PointerEvent) => this.handlePointerDown(event);

  async mount(
    host: HTMLElement,
    snapshot: WelcomeMessage,
    onMoveTarget: (position: Position) => void,
  ): Promise<void> {
    this.bounds = snapshot.world.bounds;
    this.localPlayerId = snapshot.player.id;
    this.latestPlayers = snapshot.players;
    this.latestResources = snapshot.resources;
    this.onMoveTarget = onMoveTarget;

    await this.app.init({
      width: 960,
      height: 540,
      background: '#0b1017',
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });

    this.app.canvas.setAttribute('aria-label', 'GlyphReach world');
    this.app.canvas.setAttribute('data-testid', 'world-canvas-element');
    host.replaceChildren(this.app.canvas);
    this.canvas = this.app.canvas;
    this.canvas.addEventListener('pointerdown', this.onPointerDown);

    const innerWidth = this.app.screen.width - FRAME_MARGIN * 2;
    const innerHeight = this.app.screen.height - FRAME_MARGIN * 2;
    const frame = new Graphics()
      .roundRect(FRAME_MARGIN, FRAME_MARGIN, innerWidth, innerHeight, 18)
      .fill({ color: 0x121c26 })
      .stroke({ color: 0x30465b, width: 2 });
    this.app.stage.addChild(frame);

    this.targetMarker = new Graphics()
      .circle(0, 0, 9)
      .stroke({ color: 0xd8c27a, width: 2, alpha: 0.9 });
    this.targetMarker.visible = false;
    this.app.stage.addChild(this.targetMarker);

    this.mounted = true;
    this.renderResources();
    this.renderPlayers();
  }

  updateWorld(players: PlayerSnapshot[], resources: ResourceNodeSnapshot[]): void {
    this.latestPlayers = players;
    this.latestResources = resources;
    if (!this.mounted) return;
    this.renderResources();
    this.renderPlayers();
  }

  destroy(): void {
    this.canvas?.removeEventListener('pointerdown', this.onPointerDown);
    this.playerGraphics.clear();
    this.resourceGraphics.clear();
    this.targetMarker = null;
    this.canvas = null;
    this.onMoveTarget = null;
    this.mounted = false;
    this.app.destroy(true, { children: true });
  }

  private handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !this.canvas || !this.bounds || !this.onMoveTarget) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const stageX = ((event.clientX - rect.left) / rect.width) * this.app.screen.width;
    const stageY = ((event.clientY - rect.top) / rect.height) * this.app.screen.height;
    const innerWidth = this.app.screen.width - FRAME_MARGIN * 2;
    const innerHeight = this.app.screen.height - FRAME_MARGIN * 2;
    if (
      stageX < FRAME_MARGIN || stageX > FRAME_MARGIN + innerWidth ||
      stageY < FRAME_MARGIN || stageY > FRAME_MARGIN + innerHeight
    ) return;

    const normalizedX = (stageX - FRAME_MARGIN) / innerWidth;
    const normalizedY = (stageY - FRAME_MARGIN) / innerHeight;
    const target = {
      x: this.bounds.minX + normalizedX * (this.bounds.maxX - this.bounds.minX),
      y: this.bounds.minY + normalizedY * (this.bounds.maxY - this.bounds.minY),
    };
    this.positionGraphic(this.targetMarker, target);
    this.targetMarker.visible = true;
    this.onMoveTarget(target);
  }

  private renderPlayers(): void {
    const bounds = this.bounds;
    if (!bounds) return;

    const ids = new Set(this.latestPlayers.map((player) => player.id));
    for (const [id, graphic] of this.playerGraphics) {
      if (ids.has(id)) continue;
      this.app.stage.removeChild(graphic);
      graphic.destroy();
      this.playerGraphics.delete(id);
    }

    for (const player of this.latestPlayers) {
      let graphic = this.playerGraphics.get(player.id);
      if (!graphic) {
        const local = player.id === this.localPlayerId;
        graphic = new Graphics()
          .circle(0, 0, local ? 13 : 11)
          .fill({ color: local ? 0xe5c46b : 0x6ba7e5 })
          .stroke({ color: local ? 0xfff0bd : 0xc5e1ff, width: 2 });
        this.playerGraphics.set(player.id, graphic);
        this.app.stage.addChild(graphic);
      }
      this.positionGraphic(graphic, player.position);
    }

    const local = this.latestPlayers.find((player) => player.id === this.localPlayerId);
    if (local && this.targetMarker?.visible) {
      const target = this.worldPositionForGraphic(this.targetMarker);
      if (target && Math.hypot(local.position.x - target.x, local.position.y - target.y) < 8) {
        this.targetMarker.visible = false;
      }
    }
  }

  private renderResources(): void {
    const ids = new Set(this.latestResources.map((resource) => resource.id));
    for (const [id, graphic] of this.resourceGraphics) {
      if (ids.has(id)) continue;
      this.app.stage.removeChild(graphic);
      graphic.destroy();
      this.resourceGraphics.delete(id);
    }

    for (const resource of this.latestResources) {
      const existing = this.resourceGraphics.get(resource.id);
      if (existing) {
        this.app.stage.removeChild(existing);
        existing.destroy();
      }
      const rockColor = resource.available ? 0xb6764f : 0x5b4a42;
      const edgeColor = resource.available ? 0xe0a27a : 0x7c6b62;
      const graphic = new Graphics()
        .circle(0, 0, 19)
        .fill({ color: rockColor })
        .stroke({ color: edgeColor, width: 3 })
        .circle(-5, -4, 5)
        .fill({ color: resource.available ? 0xd2946a : 0x6b5c55 });
      this.positionGraphic(graphic, resource.position);
      this.resourceGraphics.set(resource.id, graphic);
      this.app.stage.addChild(graphic);
    }
  }

  private positionGraphic(graphic: Graphics | null, position: Position): void {
    if (!graphic || !this.bounds) return;
    const innerWidth = this.app.screen.width - FRAME_MARGIN * 2;
    const innerHeight = this.app.screen.height - FRAME_MARGIN * 2;
    const normalizedX = (position.x - this.bounds.minX) / (this.bounds.maxX - this.bounds.minX);
    const normalizedY = (position.y - this.bounds.minY) / (this.bounds.maxY - this.bounds.minY);
    graphic.position.set(
      FRAME_MARGIN + normalizedX * innerWidth,
      FRAME_MARGIN + normalizedY * innerHeight,
    );
  }

  private worldPositionForGraphic(graphic: Graphics): Position | null {
    if (!this.bounds) return null;
    const innerWidth = this.app.screen.width - FRAME_MARGIN * 2;
    const innerHeight = this.app.screen.height - FRAME_MARGIN * 2;
    return {
      x: this.bounds.minX + ((graphic.position.x - FRAME_MARGIN) / innerWidth) * (this.bounds.maxX - this.bounds.minX),
      y: this.bounds.minY + ((graphic.position.y - FRAME_MARGIN) / innerHeight) * (this.bounds.maxY - this.bounds.minY),
    };
  }
}
