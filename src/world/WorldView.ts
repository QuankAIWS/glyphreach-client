import { Application, Container, Graphics } from 'pixi.js';
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
const CAMERA_SCALE = 2;
const NORTH_GATE = { x: 610, y: 230 };
const WAYSTONE = { x: 955, y: 55 };

const TREE_POINTS: Position[] = [
  { x: 72, y: 84 }, { x: 130, y: 150 }, { x: 88, y: 382 }, { x: 175, y: 520 },
  { x: 260, y: 74 }, { x: 335, y: 540 }, { x: 430, y: 66 }, { x: 474, y: 532 },
  { x: 650, y: 522 }, { x: 706, y: 390 }, { x: 845, y: 350 }, { x: 938, y: 410 },
  { x: 970, y: 250 }, { x: 875, y: 545 }, { x: 225, y: 300 }, { x: 120, y: 255 },
];

const STONE_POINTS: Position[] = [
  { x: 822, y: 80 }, { x: 854, y: 42 }, { x: 885, y: 92 }, { x: 920, y: 26 },
  { x: 962, y: 108 }, { x: 888, y: 155 }, { x: 936, y: 166 }, { x: 796, y: 138 },
];

export class WorldView {
  private readonly app = new Application();
  private readonly worldLayer = new Container();
  private readonly environmentLayer = new Graphics();
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
  private playerFacingMode = false;
  private canvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
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
    this.playerFacingMode = this.shouldUsePlayerFacingMode();

    const sharedOptions = {
      background: '#101710',
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    };
    if (this.playerFacingMode) {
      await this.app.init({ ...sharedOptions, resizeTo: host });
    } else {
      await this.app.init({ ...sharedOptions, width: 960, height: 540 });
    }

    this.app.canvas.setAttribute('aria-label', 'GlyphReach world');
    this.app.canvas.setAttribute('data-testid', 'world-canvas-element');
    this.app.canvas.setAttribute('data-camera-mode', this.playerFacingMode ? 'player' : 'overview');
    host.replaceChildren(this.app.canvas);
    this.canvas = this.app.canvas;
    this.canvas.addEventListener('pointerdown', this.onPointerDown);

    if (!this.playerFacingMode) {
      const innerWidth = this.app.screen.width - FRAME_MARGIN * 2;
      const innerHeight = this.app.screen.height - FRAME_MARGIN * 2;
      this.app.stage.addChild(
        new Graphics()
          .roundRect(FRAME_MARGIN, FRAME_MARGIN, innerWidth, innerHeight, 18)
          .fill({ color: 0x121c26 })
          .stroke({ color: 0x30465b, width: 2 }),
      );
    }

    this.app.stage.addChild(this.worldLayer);
    this.worldLayer.addChild(this.environmentLayer);

    this.targetMarker = new Graphics()
      .circle(0, 0, 11)
      .stroke({ color: 0xe0c978, width: 2, alpha: 0.95 })
      .circle(0, 0, 3)
      .fill({ color: 0xe0c978, alpha: 0.72 });
    this.targetMarker.visible = false;
    this.worldLayer.addChild(this.targetMarker);

    this.roadMarker = new Graphics();
    this.worldLayer.addChild(this.roadMarker);
    this.waystoneMarker = new Graphics();
    this.worldLayer.addChild(this.waystoneMarker);

    if (this.playerFacingMode) {
      this.worldLayer.scale.set(CAMERA_SCALE);
      this.resizeObserver = new ResizeObserver(() => this.updateCamera());
      this.resizeObserver.observe(host);
    }

    this.mounted = true;
    this.renderEnvironment();
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
    if (!this.mounted) return;
    this.renderEnvironment();
    this.renderChapterMarkers();
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
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

  private shouldUsePlayerFacingMode(): boolean {
    const params = new URLSearchParams(window.location.search);
    if (params.get('prototype') === '0') return true;
    return !['127.0.0.1', 'localhost', '::1'].includes(window.location.hostname);
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

    let target: Position;
    if (this.playerFacingMode) {
      target = {
        x: clamp((stageX - this.worldLayer.position.x) / CAMERA_SCALE, bounds.minX, bounds.maxX),
        y: clamp((stageY - this.worldLayer.position.y) / CAMERA_SCALE, bounds.minY, bounds.maxY),
      };
    } else {
      const innerWidth = this.app.screen.width - FRAME_MARGIN * 2;
      const innerHeight = this.app.screen.height - FRAME_MARGIN * 2;
      if (stageX < FRAME_MARGIN || stageX > FRAME_MARGIN + innerWidth || stageY < FRAME_MARGIN || stageY > FRAME_MARGIN + innerHeight) return;
      target = {
        x: bounds.minX + ((stageX - FRAME_MARGIN) / innerWidth) * (bounds.maxX - bounds.minX),
        y: bounds.minY + ((stageY - FRAME_MARGIN) / innerHeight) * (bounds.maxY - bounds.minY),
      };
    }

    this.positionGraphic(marker, target);
    marker.visible = true;
    moveTarget(target);
  }

  private renderEnvironment(): void {
    const g = this.environmentLayer;
    const bounds = this.bounds;
    if (!bounds) return;
    g.clear();
    if (!this.playerFacingMode) return;

    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    g.rect(bounds.minX, bounds.minY, width, height).fill({ color: 0x263426 });

    // Settled ground: practical, worn clearings rather than abstract activity clusters.
    g.ellipse(465, 310, 225, 168).fill({ color: 0x384334, alpha: 0.86 });
    g.ellipse(470, 318, 155, 116).fill({ color: 0x4a4634, alpha: 0.66 });
    g.ellipse(748, 118, 150, 96).fill({ color: 0x33443a, alpha: 0.92 });
    g.ellipse(748, 118, 105, 65).fill({ color: 0x4b4938, alpha: 0.54 });

    // Main survey road and the colder northern spur.
    g.moveTo(280, 405)
      .bezierCurveTo(390, 350, 500, 310, 610, 230)
      .bezierCurveTo(675, 183, 705, 138, 755, 112)
      .stroke({ color: 0x5d5540, width: 50, alpha: 0.92 });
    g.moveTo(280, 405)
      .bezierCurveTo(390, 350, 500, 310, 610, 230)
      .bezierCurveTo(675, 183, 705, 138, 755, 112)
      .stroke({ color: 0x81704e, width: 25, alpha: 0.72 });
    g.moveTo(755, 112)
      .bezierCurveTo(835, 90, 900, 70, 978, 50)
      .stroke({ color: this.northernRoadOpen ? 0x5e5949 : 0x3d4138, width: 34, alpha: 0.88 });
    g.moveTo(755, 112)
      .bezierCurveTo(835, 90, 900, 70, 978, 50)
      .stroke({ color: this.northernRoadOpen ? 0x80765c : 0x505447, width: 15, alpha: 0.7 });

    // Northwater river band and ford/pool language.
    g.moveTo(610, 42)
      .bezierCurveTo(705, 62, 780, 55, 858, 86)
      .bezierCurveTo(912, 107, 960, 95, 1014, 116)
      .stroke({ color: 0x213f45, width: 72, alpha: 0.94 });
    g.moveTo(610, 42)
      .bezierCurveTo(705, 62, 780, 55, 858, 86)
      .bezierCurveTo(912, 107, 960, 95, 1014, 116)
      .stroke({ color: 0x35636a, width: 48, alpha: 0.76 });
    g.moveTo(650, 54).bezierCurveTo(750, 77, 820, 62, 940, 101).stroke({ color: 0x73989a, width: 3, alpha: 0.42 });

    // Starter survey camp landmarks: tent, survey table, stacked crates and work scars.
    g.ellipse(520, 320, 78, 48).fill({ color: 0x594b34, alpha: 0.55 });
    g.moveTo(375, 286).lineTo(414, 242).lineTo(452, 286).closePath().fill({ color: 0x7a6848 }).stroke({ color: 0xb29a6a, width: 3 });
    g.moveTo(414, 242).lineTo(414, 286).stroke({ color: 0x463b2d, width: 2 });
    g.rect(462, 352, 48, 27).fill({ color: 0x6e5739 }).stroke({ color: 0x9b7950, width: 2 });
    g.rect(505, 365, 33, 22).fill({ color: 0x665036 }).stroke({ color: 0x927047, width: 2 });
    g.rect(500, 250, 54, 25).fill({ color: 0x62503b }).stroke({ color: 0x968061, width: 2 });
    g.moveTo(497, 249).lineTo(492, 232).stroke({ color: 0xc0aa76, width: 2 });
    g.moveTo(557, 249).lineTo(563, 231).stroke({ color: 0xc0aa76, width: 2 });

    // Northwatch structures: watch shelter, cooking yard and simple timber posts.
    g.rect(660, 132, 85, 45).fill({ color: 0x4b493a, alpha: 0.8 }).stroke({ color: 0x776f55, width: 3 });
    g.moveTo(650, 132).lineTo(702, 96).lineTo(754, 132).closePath().fill({ color: 0x655d47 }).stroke({ color: 0x8c8060, width: 3 });
    g.rect(774, 125, 7, 48).fill({ color: 0x594b36 });
    g.rect(804, 119, 7, 54).fill({ color: 0x594b36 });
    g.moveTo(774, 132).lineTo(808, 128).stroke({ color: 0x766247, width: 5 });

    // Northreach: cold broken survey masonry and old geometric foundations.
    g.ellipse(900, 92, 125, 92).fill({ color: 0x29312f, alpha: 0.88 });
    for (const stone of STONE_POINTS) {
      g.roundRect(stone.x - 14, stone.y - 9, 28, 18, 3)
        .fill({ color: 0x46504d, alpha: 0.9 })
        .stroke({ color: 0x68726d, width: 1, alpha: 0.7 });
    }
    g.moveTo(835, 142).lineTo(835, 70).lineTo(903, 70).stroke({ color: 0x59625d, width: 9, alpha: 0.8 });
    g.moveTo(903, 70).lineTo(948, 40).stroke({ color: 0x59625d, width: 9, alpha: 0.7 });

    // Frontier vegetation. Large silhouettes break the empty board-plane read.
    for (const tree of TREE_POINTS) {
      g.ellipse(tree.x + 4, tree.y + 9, 18, 9).fill({ color: 0x111a13, alpha: 0.35 });
      g.rect(tree.x - 3, tree.y - 2, 6, 22).fill({ color: 0x54452f });
      g.circle(tree.x - 8, tree.y - 10, 15).fill({ color: 0x213322 });
      g.circle(tree.x + 9, tree.y - 11, 17).fill({ color: 0x29412b });
      g.circle(tree.x, tree.y - 24, 16).fill({ color: 0x304b31 });
    }

    // Sparse survey stakes keep the field-survey identity present without labels.
    for (const stake of [{ x: 322, y: 340 }, { x: 595, y: 270 }, { x: 640, y: 192 }, { x: 790, y: 96 }]) {
      g.rect(stake.x - 2, stake.y - 16, 4, 28).fill({ color: 0xa58b57 });
      g.moveTo(stake.x - 8, stake.y - 8).lineTo(stake.x + 8, stake.y - 8).stroke({ color: 0xc2a66b, width: 2 });
    }
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
      .ellipse(2, 17, 15, 7)
      .fill({ color: 0x151a18, alpha: 0.45 })
      .moveTo(-9, 18)
      .lineTo(-13, -15)
      .lineTo(7, -22)
      .lineTo(13, 18)
      .closePath()
      .fill({ color: this.waystoneDiscovered ? 0x716d64 : 0x444c4d })
      .stroke({ color: this.waystoneDiscovered ? 0xc1a97a : 0x6d7779, width: 2 })
      .moveTo(-4, -9)
      .lineTo(5, -2)
      .lineTo(-2, 7)
      .stroke({ color: this.waystoneDiscovered ? 0xd6bf80 : 0x647273, width: 2, alpha: 0.9 });
    waystone.visible = this.northernRoadOpen;
    this.positionGraphic(waystone, WAYSTONE);
  }

  private renderPlayers(): void {
    const ids = new Set(this.latestPlayers.map((player) => player.id));
    for (const [id, graphic] of this.playerGraphics) {
      if (!ids.has(id)) {
        this.worldLayer.removeChild(graphic);
        graphic.destroy();
        this.playerGraphics.delete(id);
      }
    }
    for (const player of this.latestPlayers) {
      let graphic = this.playerGraphics.get(player.id);
      if (!graphic) {
        const local = player.id === this.localPlayerId;
        graphic = new Graphics()
          .ellipse(2, 16, local ? 14 : 12, 6)
          .fill({ color: 0x111411, alpha: 0.48 })
          .circle(0, -10, local ? 7 : 6)
          .fill({ color: local ? 0xd8b987 : 0xb7c2c5 })
          .moveTo(local ? -11 : -9, -2)
          .lineTo(local ? 11 : 9, -2)
          .lineTo(local ? 8 : 7, 17)
          .lineTo(local ? -8 : -7, 17)
          .closePath()
          .fill({ color: local ? 0xb99945 : 0x56758a })
          .stroke({ color: local ? 0xf1d98b : 0x9ec1d3, width: 2 });
        if (local) {
          graphic.circle(0, 3, 3).fill({ color: 0xefe0a8 });
        }
        this.playerGraphics.set(player.id, graphic);
        this.worldLayer.addChild(graphic);
      }
      this.positionGraphic(graphic, player.position);
    }

    const local = this.latestPlayers.find((player) => player.id === this.localPlayerId);
    if (local) this.updateCamera(local.position);
    if (local && this.targetMarker?.visible) {
      const target = this.worldPositionForGraphic(this.targetMarker);
      if (target && Math.hypot(local.position.x - target.x, local.position.y - target.y) < 8) this.targetMarker.visible = false;
    }
  }

  private renderResources(): void {
    const ids = new Set(this.latestResources.map((resource) => resource.id));
    for (const [id, graphic] of this.resourceGraphics) {
      if (!ids.has(id)) {
        this.worldLayer.removeChild(graphic);
        graphic.destroy();
        this.resourceGraphics.delete(id);
      }
    }
    for (const resource of this.latestResources) {
      const existing = this.resourceGraphics.get(resource.id);
      if (existing) {
        this.worldLayer.removeChild(existing);
        existing.destroy();
      }
      const graphic = resource.kind === 'river_pool'
        ? new Graphics()
          .ellipse(2, 13, 29, 9)
          .fill({ color: 0x111719, alpha: 0.34 })
          .ellipse(0, 0, 31, 18)
          .fill({ color: resource.available ? 0x315c67 : 0x33454a })
          .stroke({ color: resource.available ? 0x6ea2a7 : 0x566e77, width: 2 })
          .moveTo(-18, 1)
          .bezierCurveTo(-7, -6, 4, 8, 19, 0)
          .stroke({ color: 0x9bc5c2, width: 2, alpha: resource.available ? 0.75 : 0.25 })
        : new Graphics()
          .ellipse(2, 13, 23, 8)
          .fill({ color: 0x161311, alpha: 0.4 })
          .moveTo(-22, 10).lineTo(-14, -13).lineTo(2, -22).lineTo(20, -8).lineTo(22, 12).closePath()
          .fill({ color: resource.available ? 0x785642 : 0x4d4640 })
          .stroke({ color: resource.available ? 0xb87955 : 0x6c625a, width: 2 })
          .moveTo(-8, 3).lineTo(0, -9).lineTo(9, -4).stroke({ color: resource.available ? 0xd08b5f : 0x78685e, width: 4 });
      this.positionGraphic(graphic, resource.position);
      this.resourceGraphics.set(resource.id, graphic);
      this.worldLayer.addChild(graphic);
    }
  }

  private renderStations(): void {
    const ids = new Set(this.latestStations.map((station) => station.id));
    for (const [id, graphic] of this.stationGraphics) {
      if (!ids.has(id)) {
        this.worldLayer.removeChild(graphic);
        graphic.destroy();
        this.stationGraphics.delete(id);
      }
    }
    for (const station of this.latestStations) {
      const existing = this.stationGraphics.get(station.id);
      if (existing) {
        this.worldLayer.removeChild(existing);
        existing.destroy();
      }
      let graphic: Graphics;
      if (station.kind === 'furnace') {
        graphic = new Graphics()
          .ellipse(2, 18, 23, 8).fill({ color: 0x181310, alpha: 0.42 })
          .roundRect(-20, -18, 40, 39, 6).fill({ color: 0x5f4437 }).stroke({ color: 0x8f7058, width: 2 })
          .circle(0, 7, 9).fill({ color: 0x2c201b }).stroke({ color: 0xc27042, width: 2 })
          .circle(0, 7, 5).fill({ color: 0xe49b4b });
      } else if (station.kind === 'campfire') {
        graphic = new Graphics()
          .ellipse(0, 13, 24, 8).fill({ color: 0x17130f, alpha: 0.45 })
          .moveTo(-14, 12).lineTo(14, -10).stroke({ color: 0x654b35, width: 5 })
          .moveTo(-14, -10).lineTo(14, 12).stroke({ color: 0x654b35, width: 5 })
          .moveTo(0, -23).bezierCurveTo(18, -6, 11, 15, 0, 19).bezierCurveTo(-12, 14, -15, -4, 0, -23).fill({ color: 0xc86d38 })
          .circle(1, 4, 7).fill({ color: 0xf1b957 });
      } else {
        graphic = new Graphics()
          .ellipse(1, 17, 25, 7).fill({ color: 0x141718, alpha: 0.4 })
          .moveTo(-24, -5).lineTo(20, -5).lineTo(15, 8).lineTo(-17, 8).closePath().fill({ color: 0x59636a }).stroke({ color: 0x919c9f, width: 2 })
          .rect(-6, 8, 12, 13).fill({ color: 0x444b4f });
      }
      this.positionGraphic(graphic, station.position);
      this.stationGraphics.set(station.id, graphic);
      this.worldLayer.addChild(graphic);
    }
  }

  private renderServices(): void {
    const ids = new Set(this.latestServices.map((service) => service.id));
    for (const [id, graphic] of this.serviceGraphics) {
      if (!ids.has(id)) {
        this.worldLayer.removeChild(graphic);
        graphic.destroy();
        this.serviceGraphics.delete(id);
      }
    }
    for (const service of this.latestServices) {
      const existing = this.serviceGraphics.get(service.id);
      if (existing) {
        this.worldLayer.removeChild(existing);
        existing.destroy();
      }
      const graphic = service.kind === 'bank'
        ? new Graphics()
          .ellipse(2, 18, 26, 8).fill({ color: 0x111516, alpha: 0.42 })
          .roundRect(-24, -18, 48, 37, 4).fill({ color: 0x42565a }).stroke({ color: 0x7e999a, width: 2 })
          .moveTo(-27, -18).lineTo(0, -33).lineTo(27, -18).closePath().fill({ color: 0x596563 }).stroke({ color: 0x89948f, width: 2 })
          .rect(-5, 1, 10, 13).fill({ color: 0xd0b76d })
        : new Graphics()
          .ellipse(2, 17, 22, 7).fill({ color: 0x151218, alpha: 0.42 })
          .moveTo(-19, 13).lineTo(-15, -13).lineTo(0, -24).lineTo(16, -11).lineTo(20, 14).closePath().fill({ color: 0x5b465f }).stroke({ color: 0x95769d, width: 2 })
          .circle(0, -5, 6).fill({ color: 0xd2b96b });
      this.positionGraphic(graphic, service.position);
      this.serviceGraphics.set(service.id, graphic);
      this.worldLayer.addChild(graphic);
    }
  }

  private renderNpcs(): void {
    const ids = new Set(this.latestNpcs.map((npc) => npc.id));
    for (const [id, graphic] of this.npcGraphics) {
      if (!ids.has(id)) {
        this.worldLayer.removeChild(graphic);
        graphic.destroy();
        this.npcGraphics.delete(id);
      }
    }
    for (const npc of this.latestNpcs) {
      const existing = this.npcGraphics.get(npc.id);
      if (existing) {
        this.worldLayer.removeChild(existing);
        existing.destroy();
      }
      const cook = npc.id === 'northwatch-cook-alpha-1';
      const graphic = new Graphics()
        .ellipse(2, 21, 14, 6).fill({ color: 0x111411, alpha: 0.45 })
        .circle(0, -11, 7).fill({ color: cook ? 0xd19b72 : 0xb98a61 })
        .moveTo(-11, -2).lineTo(11, -2).lineTo(9, 21).lineTo(-9, 21).closePath()
        .fill({ color: cook ? 0x70594f : 0x526b68 })
        .stroke({ color: cook ? 0xc5ac93 : 0x8caaa1, width: 2 });
      if (cook) {
        graphic.rect(-9, -21, 18, 5).fill({ color: 0xd8d2c3 });
        graphic.rect(-7, -25, 14, 5).fill({ color: 0xd8d2c3 });
      } else {
        graphic.moveTo(7, 2).lineTo(15, 15).stroke({ color: 0xb29b68, width: 2 });
      }
      this.positionGraphic(graphic, npc.position);
      this.npcGraphics.set(npc.id, graphic);
      this.worldLayer.addChild(graphic);
    }
  }

  private renderEnemies(): void {
    const ids = new Set(this.latestEnemies.map((enemy) => enemy.id));
    for (const [id, graphic] of this.enemyGraphics) {
      if (!ids.has(id)) {
        this.worldLayer.removeChild(graphic);
        graphic.destroy();
        this.enemyGraphics.delete(id);
      }
    }
    for (const enemy of this.latestEnemies) {
      const existing = this.enemyGraphics.get(enemy.id);
      if (existing) {
        this.worldLayer.removeChild(existing);
        existing.destroy();
      }
      const ratio = enemy.maxHealth > 0 ? enemy.health / enemy.maxHealth : 0;
      let graphic: Graphics;
      if (!enemy.alive) {
        graphic = new Graphics().ellipse(0, 4, enemy.kind === 'road_wolf' ? 22 : 17, 9).fill({ color: 0x302a2a, alpha: 0.7 });
      } else if (enemy.kind === 'road_wolf') {
        graphic = new Graphics()
          .ellipse(2, 13, 28, 9).fill({ color: 0x111313, alpha: 0.42 })
          .ellipse(0, 0, 27, 15).fill({ color: 0x555255 }).stroke({ color: 0x8f898e, width: 2 })
          .moveTo(-17, -10).lineTo(-10, -24).lineTo(-4, -10).fill({ color: 0x686468 })
          .moveTo(7, -10).lineTo(14, -23).lineTo(19, -7).fill({ color: 0x686468 })
          .circle(-7, -3, 2).fill({ color: 0xd8b15f })
          .circle(8, -3, 2).fill({ color: 0xd8b15f })
          .rect(-25, 24, 50, 4).fill({ color: 0x342e36 })
          .rect(-25, 24, Math.max(0, 50 * ratio), 4).fill({ color: 0xb46e66 });
      } else {
        graphic = new Graphics()
          .ellipse(2, 12, 20, 7).fill({ color: 0x161112, alpha: 0.42 })
          .ellipse(0, 1, 18, 12).fill({ color: 0x704143 }).stroke({ color: 0xa86262, width: 2 })
          .circle(-7, -8, 5).fill({ color: 0x845052 })
          .circle(7, -8, 5).fill({ color: 0x845052 })
          .circle(8, 0, 2).fill({ color: 0xd6ad63 })
          .rect(-17, 22, 34, 4).fill({ color: 0x3d2529 })
          .rect(-17, 22, Math.max(0, 34 * ratio), 4).fill({ color: 0xb86a67 });
      }
      this.positionGraphic(graphic, enemy.position);
      this.enemyGraphics.set(enemy.id, graphic);
      this.worldLayer.addChild(graphic);
    }
  }

  private updateCamera(position?: Position): void {
    if (!this.playerFacingMode || !this.bounds) return;
    const local = position ?? this.latestPlayers.find((player) => player.id === this.localPlayerId)?.position;
    if (!local) return;
    const { width, height } = this.app.screen;
    const bounds = this.bounds;
    const scaledWidth = (bounds.maxX - bounds.minX) * CAMERA_SCALE;
    const scaledHeight = (bounds.maxY - bounds.minY) * CAMERA_SCALE;

    const x = scaledWidth <= width
      ? (width - scaledWidth) / 2 - bounds.minX * CAMERA_SCALE
      : clamp(width / 2 - local.x * CAMERA_SCALE, width - bounds.maxX * CAMERA_SCALE, -bounds.minX * CAMERA_SCALE);
    const y = scaledHeight <= height
      ? (height - scaledHeight) / 2 - bounds.minY * CAMERA_SCALE
      : clamp(height / 2 - local.y * CAMERA_SCALE, height - bounds.maxY * CAMERA_SCALE, -bounds.minY * CAMERA_SCALE);
    this.worldLayer.position.set(Math.round(x), Math.round(y));
  }

  private positionGraphic(graphic: Graphics | null, position: Position): void {
    if (!graphic || !this.bounds) return;
    if (this.playerFacingMode) {
      graphic.position.set(position.x, position.y);
      return;
    }
    const innerWidth = this.app.screen.width - FRAME_MARGIN * 2;
    const innerHeight = this.app.screen.height - FRAME_MARGIN * 2;
    const normalizedX = (position.x - this.bounds.minX) / (this.bounds.maxX - this.bounds.minX);
    const normalizedY = (position.y - this.bounds.minY) / (this.bounds.maxY - this.bounds.minY);
    graphic.position.set(FRAME_MARGIN + normalizedX * innerWidth, FRAME_MARGIN + normalizedY * innerHeight);
  }

  private worldPositionForGraphic(graphic: Graphics): Position | null {
    if (!this.bounds) return null;
    if (this.playerFacingMode) return { x: graphic.position.x, y: graphic.position.y };
    const innerWidth = this.app.screen.width - FRAME_MARGIN * 2;
    const innerHeight = this.app.screen.height - FRAME_MARGIN * 2;
    return {
      x: this.bounds.minX + ((graphic.position.x - FRAME_MARGIN) / innerWidth) * (this.bounds.maxX - this.bounds.minX),
      y: this.bounds.minY + ((graphic.position.y - FRAME_MARGIN) / innerHeight) * (this.bounds.maxY - this.bounds.minY),
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
