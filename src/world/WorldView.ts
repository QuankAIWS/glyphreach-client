import { Application, Graphics } from 'pixi.js';
import type { WelcomeMessage } from '../protocol/v1';

export class WorldView {
  private readonly app = new Application();

  async mount(host: HTMLElement, snapshot: WelcomeMessage): Promise<void> {
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

    const { bounds } = snapshot.world;
    const normalizedX = (snapshot.player.position.x - bounds.minX) / (bounds.maxX - bounds.minX);
    const normalizedY = (snapshot.player.position.y - bounds.minY) / (bounds.maxY - bounds.minY);

    const player = new Graphics()
      .circle(0, 0, 13)
      .fill({ color: 0xe5c46b })
      .stroke({ color: 0xfff0bd, width: 2 });
    player.position.set(
      margin + normalizedX * innerWidth,
      margin + normalizedY * innerHeight,
    );
    this.app.stage.addChild(player);
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
  }
}
