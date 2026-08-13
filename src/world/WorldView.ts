import { Application, Graphics } from 'pixi.js';
import type { PlayerSnapshot, WelcomeMessage, WorldBounds } from '../protocol/v1';

export class WorldView {
  private readonly app = new Application();
  private readonly playerGraphics = new Map<string, Graphics>();
  private mounted = false;
  private bounds: WorldBounds | null = null;
  private localPlayerId: string | null = null;
  private latestPlayers: PlayerSnapshot[] = [];

  async mount(host: HTMLElement, snapshot: WelcomeMessage): Promise<void> {
    this.bounds = snapshot.world.bounds;
    this.localPlayerId = snapshot.player.id;
    this.latestPlayers = snapshot.players;

    await this.app.init({
      width: 960,
      height: 540,
      background: '#0b1017',
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });

    this.app.canvas.setAttribute('aria-label', 'GlyphReach world');
    host.replaceChildren(this.app.canvas);

    const margin = 36;
    const innerWidth = this.app.screen.width - margin * 2;
    const innerHeight = this.app.screen.height - margin * 2;

    const frame = new Graphics()
      .roundRect(margin, margin, innerWidth, innerHeight, 18)
      .fill({ color: 0x121c26 })
      .stroke({ color: 0x30465b, width: 2 });
    this.app.stage.addChild(frame);

    this.mounted = true;
    this.renderPlayers();
  }

  updatePlayers(players: PlayerSnapshot[]): void {
    this.latestPlayers = players;
    if (this.mounted) this.renderPlayers();
  }

  destroy(): void {
    this.playerGraphics.clear();
    this.mounted = false;
    this.app.destroy(true, { children: true });
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

    const margin = 36;
    const innerWidth = this.app.screen.width - margin * 2;
    const innerHeight = this.app.screen.height - margin * 2;

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

      const normalizedX = (player.position.x - bounds.minX) / (bounds.maxX - bounds.minX);
      const normalizedY = (player.position.y - bounds.minY) / (bounds.maxY - bounds.minY);
      graphic.position.set(
        margin + normalizedX * innerWidth,
        margin + normalizedY * innerHeight,
      );
    }
  }
}
