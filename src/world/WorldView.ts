import { Application, Graphics } from 'pixi.js';
import type {
  EnemySnapshot,
  PlayerSnapshot,
  Position,
  ResourceNodeSnapshot,
  ServiceSnapshot,
  StationSnapshot,
  WorldBounds,
} from '../protocol/v1';
import type { NpcSnapshot, WelcomeMessage } from '../protocol/quest-v1';

const FRAME_MARGIN = 36;
const NORTH_GATE = { x: 610, y: 230 };
const WAYSTONE = { x: 955, y: 55 };

export class WorldView {
  private readonly app = new Application();
  private readonly playerGraphics = new Map<string, Graphics>();
  private readonly resourceGraphics = new Map<string, Graphics>();
  private readonly stationGraphics = new Map<string, Graphics>();
  private readonly serviceGraphics = new Map<string, Graphics>();
  private readonly enemyGraphics = new Map<string, Graphics>();
  private readonly npcGraphics = new Map<string, Graphics>();
  private targetMarker: Graphics | null = null;
  private roadMarker: Graphics | null = null;
  private waystoneMarker: Graphics | null = null;
  private mounted = false;
  private bounds: WorldBounds | null = null;
  private localPlayerId: string | null = null;
  private latestPlayers: PlayerSnapshot[] = [];
  private latestResources: ResourceNodeSnapshot[] = [];
  private latestStations: StationSnapshot[] = [];
  private latestServices: ServiceSnapshot[] = [];
  private latestEnemies: EnemySnapshot[] = [];
  private latestNpcs: NpcSnapshot[] = [];
  private northernRoadOpen = false;
  private waystoneDiscovered = false;
  private canvas: HTMLCanvasElement | null = null;
  private onMoveTarget: ((position: Position) => void) | null = null;
  private readonly onPointerDown = (event: PointerEvent) => this.handlePointerDown(event);

  async mount(host: HTMLElement, snapshot: WelcomeMessage, onMoveTarget: (position: Position) => void): Promise<void> {
    this.bounds = snapshot.world.bounds;
    this.localPlayerId = snapshot.player.id;
    this.latestPlayers = snapshot.players;
    this.latestResources = snapshot.resources;
    this.latestStations = snapshot.stations;
    this.latestServices = snapshot.services;
    this.latestEnemies = snapshot.enemies;
    this.latestNpcs = snapshot.npcs;
    this.northernRoadOpen = snapshot.progress.worldFlags.northernRoadOpen;
    this.waystoneDiscovered = snapshot.progress.discoveries.includes('weathered-waystone-alpha-1');
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
    this.app.stage.addChild(
      new Graphics()
        .roundRect(FRAME_MARGIN, FRAME_MARGIN, innerWidth, innerHeight, 18)
        .fill({ color: 0x121c26 })
        .stroke({ color: 0x30465b, width: 2 }),
    );

    this.targetMarker = new Graphics().circle(0, 0, 9).stroke({ color: 0xd8c27a, width: 2, alpha: 0.9 });
    this.targetMarker.visible = false;
    this.app.stage.addChild(this.targetMarker);

    this.roadMarker = new Graphics();
    this.app.stage.addChild(this.roadMarker);
    this.waystoneMarker = new Graphics();
    this.app.stage.addChild(this.waystoneMarker);

    this.mounted = true;
    this.renderChapterMarkers();
    this.renderServices();
    this.renderStations();
    this.renderResources();
    this.renderNpcs();
    this.renderEnemies();
    this.renderPlayers();
  }

  updateWorld(players: PlayerSnapshot[], resources: ResourceNodeSnapshot[], stations: StationSnapshot[], services: ServiceSnapshot[]): void {
    this.latestPlayers = players;
    this.latestResources = resources;
    this.latestStations = stations;
    this.latestServices = services;
    if (!this.mounted) return;
    this.renderServices();
    this.renderStations();
    this.renderResources();
    this.renderPlayers();
  }

  updateEnemies(enemies: EnemySnapshot[]): void {
    this.latestEnemies = enemies;
    if (this.mounted) this.renderEnemies();
  }

  updateChapterState(northernRoadOpen: boolean, discoveries: string[]): void {
    this.northernRoadOpen = northernRoadOpen;
    this.waystoneDiscovered = discoveries.includes('weathered-waystone-alpha-1');
    if (this.mounted) this.renderChapterMarkers();
  }

  destroy(): void {
    this.canvas?.removeEventListener('pointerdown', this.onPointerDown);
    this.playerGraphics.clear();
    this.resourceGraphics.clear();
    this.stationGraphics.clear();
    this.serviceGraphics.clear();
    this.enemyGraphics.clear();
    this.npcGraphics.clear();
    this.targetMarker = null;
    this.roadMarker = null;
    this.waystoneMarker = null;
    this.canvas = null;
    this.onMoveTarget = null;
    this.mounted = false;
    this.app.destroy(true, { children: true });
  }

  private handlePointerDown(event: PointerEvent): void {
    const canvas = this.canvas;
    const bounds = this.bounds;
    const marker = this.targetMarker;
    const moveTarget = this.onMoveTarget;
    if (event.button !== 0 || !canvas || !bounds || !marker || !moveTarget) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const stageX = ((event.clientX - rect.left) / rect.width) * this.app.screen.width;
    const stageY = ((event.clientY - rect.top) / rect.height) * this.app.screen.height;
    const innerWidth = this.app.screen.width - FRAME_MARGIN * 2;
    const innerHeight = this.app.screen.height - FRAME_MARGIN * 2;
    if (stageX < FRAME_MARGIN || stageX > FRAME_MARGIN + innerWidth || stageY < FRAME_MARGIN || stageY > FRAME_MARGIN + innerHeight) return;
    const normalizedX = (stageX - FRAME_MARGIN) / innerWidth;
    const normalizedY = (stageY - FRAME_MARGIN) / innerHeight;
    const target = {
      x: bounds.minX + normalizedX * (bounds.maxX - bounds.minX),
      y: bounds.minY + normalizedY * (bounds.maxY - bounds.minY),
    };
    this.positionGraphic(marker, target);
    marker.visible = true;
    moveTarget(target);
  }

  private renderChapterMarkers(): void {
    const road = this.roadMarker;
    const waystone = this.waystoneMarker;
    if (!road || !waystone) return;

    road.clear();
    road
      .rect(-26, -5, 52, 10)
      .fill({ color: this.northernRoadOpen ? 0x786e4b : 0x533b35 })
      .stroke({ color: this.northernRoadOpen ? 0xb8a66e : 0x9b655b, width: 2 });
    if (!this.northernRoadOpen) {
      road.moveTo(-16, -16).lineTo(16, 16).stroke({ color: 0xb86858, width: 4 });
      road.moveTo(16, -16).lineTo(-16, 16).stroke({ color: 0xb86858, width: 4 });
    }
    this.positionGraphic(road, NORTH_GATE);

    waystone.clear();
    waystone
      .moveTo(-9, 18)
      .lineTo(-13, -15)
      .lineTo(7, -22)
      .lineTo(13, 18)
      .closePath()
      .fill({ color: this.waystoneDiscovered ? 0x786f65 : 0x454b4d })
      .stroke({ color: this.waystoneDiscovered ? 0xc1a97a : 0x6d7779, width: 2 });
    waystone.visible = this.northernRoadOpen;
    this.positionGraphic(waystone, WAYSTONE);
  }

  private renderPlayers(): void {
    const ids = new Set(this.latestPlayers.map((player) => player.id));
    for (const [id, graphic] of this.playerGraphics) {
      if (!ids.has(id)) {
        this.app.stage.removeChild(graphic);
        graphic.destroy();
        this.playerGraphics.delete(id);
      }
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
      if (target && Math.hypot(local.position.x - target.x, local.position.y - target.y) < 8) this.targetMarker.visible = false;
    }
  }

  private renderResources(): void {
    const ids = new Set(this.latestResources.map((resource) => resource.id));
    for (const [id, graphic] of this.resourceGraphics) {
      if (!ids.has(id)) {
        this.app.stage.removeChild(graphic);
        graphic.destroy();
        this.resourceGraphics.delete(id);
      }
    }
    for (const resource of this.latestResources) {
      const existing = this.resourceGraphics.get(resource.id);
      if (existing) {
        this.app.stage.removeChild(existing);
        existing.destroy();
      }
      const graphic = resource.kind === 'river_pool'
        ? new Graphics()
          .ellipse(0, 0, 27, 16)
          .fill({ color: resource.available ? 0x315c73 : 0x2f4149 })
          .stroke({ color: resource.available ? 0x68a9c1 : 0x566e77, width: 3 })
          .moveTo(-14, 2)
          .bezierCurveTo(-5, -5, 5, 9, 15, 1)
          .stroke({ color: 0x8bc5d4, width: 2, alpha: resource.available ? 0.9 : 0.35 })
        : new Graphics()
          .circle(0, 0, 19)
          .fill({ color: resource.available ? 0xb6764f : 0x5b4a42 })
          .stroke({ color: resource.available ? 0xe0a27a : 0x7c6b62, width: 3 })
          .circle(-5, -4, 5)
          .fill({ color: resource.available ? 0xd2946a : 0x6b5c55 });
      this.positionGraphic(graphic, resource.position);
      this.resourceGraphics.set(resource.id, graphic);
      this.app.stage.addChild(graphic);
    }
  }

  private renderStations(): void {
    const ids = new Set(this.latestStations.map((station) => station.id));
    for (const [id, graphic] of this.stationGraphics) {
      if (!ids.has(id)) {
        this.app.stage.removeChild(graphic);
        graphic.destroy();
        this.stationGraphics.delete(id);
      }
    }
    for (const station of this.latestStations) {
      const existing = this.stationGraphics.get(station.id);
      if (existing) {
        this.app.stage.removeChild(existing);
        existing.destroy();
      }
      let graphic: Graphics;
      if (station.kind === 'furnace') {
        graphic = new Graphics()
          .roundRect(-18, -18, 36, 36, 7)
          .fill({ color: 0x8b4937 })
          .stroke({ color: 0xf09655, width: 3 })
          .circle(0, 5, 7)
          .fill({ color: 0xf6b45f });
      } else if (station.kind === 'campfire') {
        graphic = new Graphics()
          .moveTo(-12, 11)
          .lineTo(12, -11)
          .stroke({ color: 0x71503b, width: 5 })
          .moveTo(-12, -11)
          .lineTo(12, 11)
          .stroke({ color: 0x71503b, width: 5 })
          .moveTo(0, -20)
          .bezierCurveTo(18, -4, 10, 15, 0, 18)
          .bezierCurveTo(-11, 13, -15, -2, 0, -20)
          .fill({ color: 0xe69044 })
          .circle(1, 3, 7)
          .fill({ color: 0xf5c766 });
      } else {
        graphic = new Graphics()
          .rect(-22, -9, 44, 18)
          .fill({ color: 0x66717c })
          .stroke({ color: 0xaab7c2, width: 2 })
          .rect(-7, 9, 14, 13)
          .fill({ color: 0x4e5963 });
      }
      this.positionGraphic(graphic, station.position);
      this.stationGraphics.set(station.id, graphic);
      this.app.stage.addChild(graphic);
    }
  }

  private renderServices(): void {
    const ids = new Set(this.latestServices.map((service) => service.id));
    for (const [id, graphic] of this.serviceGraphics) {
      if (!ids.has(id)) {
        this.app.stage.removeChild(graphic);
        graphic.destroy();
        this.serviceGraphics.delete(id);
      }
    }
    for (const service of this.latestServices) {
      const existing = this.serviceGraphics.get(service.id);
      if (existing) {
        this.app.stage.removeChild(existing);
        existing.destroy();
      }
      const graphic = service.kind === 'bank'
        ? new Graphics().roundRect(-21, -15, 42, 30, 5).fill({ color: 0x315f6d }).stroke({ color: 0x7bc1cf, width: 3 }).rect(-5, -3, 10, 9).fill({ color: 0xd5c47a })
        : new Graphics().circle(0, 0, 18).fill({ color: 0x5f4678 }).stroke({ color: 0xba91d8, width: 3 }).circle(0, -2, 7).fill({ color: 0xe4c56e });
      this.positionGraphic(graphic, service.position);
      this.serviceGraphics.set(service.id, graphic);
      this.app.stage.addChild(graphic);
    }
  }

  private renderNpcs(): void {
    const ids = new Set(this.latestNpcs.map((npc) => npc.id));
    for (const [id, graphic] of this.npcGraphics) {
      if (!ids.has(id)) {
        this.app.stage.removeChild(graphic);
        graphic.destroy();
        this.npcGraphics.delete(id);
      }
    }
    for (const npc of this.latestNpcs) {
      const existing = this.npcGraphics.get(npc.id);
      if (existing) {
        this.app.stage.removeChild(existing);
        existing.destroy();
      }
      const cook = npc.id === 'northwatch-cook-alpha-1';
      const graphic = new Graphics()
        .circle(0, -7, 9)
        .fill({ color: cook ? 0xd39a6d : 0xb68b62 })
        .roundRect(-12, 3, 24, 27, 6)
        .fill({ color: cook ? 0x6b5650 : 0x4e6570 })
        .stroke({ color: cook ? 0xc9b19d : 0x91b5c3, width: 2 });
      if (cook) graphic.rect(-10, -19, 20, 5).fill({ color: 0xd9d4c8 });
      this.positionGraphic(graphic, npc.position);
      this.npcGraphics.set(npc.id, graphic);
      this.app.stage.addChild(graphic);
    }
  }

  private renderEnemies(): void {
    const ids = new Set(this.latestEnemies.map((enemy) => enemy.id));
    for (const [id, graphic] of this.enemyGraphics) {
      if (!ids.has(id)) {
        this.app.stage.removeChild(graphic);
        graphic.destroy();
        this.enemyGraphics.delete(id);
      }
    }
    for (const enemy of this.latestEnemies) {
      const existing = this.enemyGraphics.get(enemy.id);
      if (existing) {
        this.app.stage.removeChild(existing);
        existing.destroy();
      }
      const ratio = enemy.maxHealth > 0 ? enemy.health / enemy.maxHealth : 0;
      let graphic: Graphics;
      if (!enemy.alive) {
        graphic = new Graphics().circle(0, 0, enemy.kind === 'road_wolf' ? 18 : 14).fill({ color: 0x332b2d }).stroke({ color: 0x665457, width: 2 });
      } else if (enemy.kind === 'road_wolf') {
        graphic = new Graphics()
          .ellipse(0, 0, 25, 16)
          .fill({ color: 0x5f5960 })
          .stroke({ color: 0x9b8c99, width: 3 })
          .moveTo(-15, -12)
          .lineTo(-9, -25)
          .lineTo(-3, -11)
          .fill({ color: 0x6f6970 })
          .moveTo(7, -11)
          .lineTo(14, -24)
          .lineTo(18, -8)
          .fill({ color: 0x6f6970 })
          .circle(-6, -3, 2)
          .fill({ color: 0xe2ba67 })
          .circle(7, -3, 2)
          .fill({ color: 0xe2ba67 })
          .rect(-25, 25, 50, 5)
          .fill({ color: 0x342e36 })
          .rect(-25, 25, Math.max(0, 50 * ratio), 5)
          .fill({ color: 0xb46e66 });
      } else {
        graphic = new Graphics()
          .circle(0, 0, 17)
          .fill({ color: 0x7e3f42 })
          .stroke({ color: 0xd57878, width: 3 })
          .circle(-6, -10, 5)
          .fill({ color: 0xa75a5c })
          .circle(6, -10, 5)
          .fill({ color: 0xa75a5c })
          .rect(-17, 23, 34, 4)
          .fill({ color: 0x3d2529 })
          .rect(-17, 23, Math.max(0, 34 * ratio), 4)
          .fill({ color: 0xb86a67 });
      }
      this.positionGraphic(graphic, enemy.position);
      this.enemyGraphics.set(enemy.id, graphic);
      this.app.stage.addChild(graphic);
    }
  }

  private positionGraphic(graphic: Graphics | null, position: Position): void {
    if (!graphic || !this.bounds) return;
    const innerWidth = this.app.screen.width - FRAME_MARGIN * 2;
    const innerHeight = this.app.screen.height - FRAME_MARGIN * 2;
    const normalizedX = (position.x - this.bounds.minX) / (this.bounds.maxX - this.bounds.minX);
    const normalizedY = (position.y - this.bounds.minY) / (this.bounds.maxY - this.bounds.minY);
    graphic.position.set(FRAME_MARGIN + normalizedX * innerWidth, FRAME_MARGIN + normalizedY * innerHeight);
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
