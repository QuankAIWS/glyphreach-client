import type { GlyphReachApp } from './App';
import type { CombatProgressSnapshot, EnemySnapshot, Position } from '../protocol/v1';
import './combat-intent.css';

const CAMERA_SCALE = 2;
const WORLD = { minX: 0, minY: 0, maxX: 1000, maxY: 600 } as const;
const ATTACK_RANGE = 70;
const ATTACK_REPEAT_MS = 450;

type CombatConnection = { attackTarget(targetId: string): boolean };
type CombatAppState = {
  connection: CombatConnection | null;
  enemies: EnemySnapshot[];
  combat: CombatProgressSnapshot | null;
};

export function installCombatIntent(root: HTMLElement, app: GlyphReachApp): void {
  const query = new URLSearchParams(window.location.search);
  const legacyAutomation = ['127.0.0.1', 'localhost', '::1'].includes(window.location.hostname) && query.get('prototype') !== '0';
  if (legacyAutomation) return;
  const worldShell = root.querySelector<HTMLElement>('[data-testid="world-shell"]');
  if (!worldShell) return;
  new CombatIntentController(root, worldShell, app as unknown as CombatAppState).start();
}

class CombatIntentController {
  private canvas: HTMLCanvasElement | null = null;
  private targetId: string | null = null;
  private contextEnemyId: string | null = null;
  private nextAttackAt = 0;
  private timer = 0;
  private readonly targetHud: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly worldShell: HTMLElement,
    private readonly state: CombatAppState,
  ) {
    this.targetHud = document.createElement('section');
    this.targetHud.className = 'combat-target-hud';
    this.targetHud.dataset.testid = 'combat-target-hud';
    this.targetHud.hidden = true;
    worldShell.append(this.targetHud);
  }

  start(): void {
    this.bindCanvas();
    this.worldShell.addEventListener('click', this.onWorldShellClick, true);
    window.addEventListener('keydown', this.onKeyDown);
    this.timer = window.setInterval(() => this.tick(), 100);
    window.addEventListener('beforeunload', () => this.destroy(), { once: true });
  }

  private destroy(): void {
    window.clearInterval(this.timer);
    this.unbindCanvas();
    this.worldShell.removeEventListener('click', this.onWorldShellClick, true);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private bindCanvas(): void {
    const next = this.root.querySelector<HTMLCanvasElement>('canvas[data-camera-mode="player"]');
    if (!next || next === this.canvas) return;
    this.unbindCanvas();
    this.canvas = next;
    next.addEventListener('pointerdown', this.onPointerDown);
    next.addEventListener('contextmenu', this.onContextMenu);
  }

  private unbindCanvas(): void {
    if (!this.canvas) return;
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas = null;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const enemy = this.enemyAt(event.clientX, event.clientY);
    if (enemy?.alive) this.acquire(enemy.id);
    else this.clear();
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    this.contextEnemyId = this.enemyAt(event.clientX, event.clientY)?.id ?? null;
  };

  private readonly onWorldShellClick = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.world-context-menu button');
    if (!button) return;
    if (this.contextEnemyId && button.textContent?.trim().startsWith('Attack ')) this.acquire(this.contextEnemyId);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.clear();
  };

  private acquire(targetId: string): void {
    this.targetId = targetId;
    // The world interaction layer sends the first authoritative attack once it
    // reaches range. Start the repeating intent after one server cooldown.
    this.nextAttackAt = Date.now() + ATTACK_REPEAT_MS;
    this.render();
  }

  private clear(): void {
    this.targetId = null;
    this.contextEnemyId = null;
    this.nextAttackAt = 0;
    this.targetHud.hidden = true;
  }

  private tick(): void {
    this.bindCanvas();
    if (!this.targetId) return;
    const enemy = this.state.enemies.find((candidate) => candidate.id === this.targetId);
    const combat = this.state.combat;
    if (!enemy || !enemy.alive || combat?.health.dead) {
      this.clear();
      return;
    }

    this.render(enemy);
    const local = this.localPosition();
    if (!local || distance(local, enemy.position) > ATTACK_RANGE) return;
    const now = Date.now();
    if (now < this.nextAttackAt) return;
    this.nextAttackAt = now + ATTACK_REPEAT_MS;
    this.state.connection?.attackTarget(enemy.id);
  }

  private render(enemy = this.state.enemies.find((candidate) => candidate.id === this.targetId)): void {
    if (!enemy || !this.targetId) {
      this.targetHud.hidden = true;
      return;
    }
    const ratio = Math.max(0, Math.min(1, enemy.health / enemy.maxHealth));
    this.targetHud.innerHTML = `
      <div class="combat-target-heading">
        <span><small>TARGET</small><strong>${escapeHtml(enemyName(enemy))}</strong></span>
        <b>${enemy.health} / ${enemy.maxHealth}</b>
      </div>
      <div class="combat-target-bar"><i style="width:${Math.round(ratio * 100)}%"></i></div>
      <span class="combat-target-state">Attacking</span>`;
    this.targetHud.hidden = false;
  }

  private enemyAt(clientX: number, clientY: number): EnemySnapshot | null {
    const point = this.screenToWorld(clientX, clientY);
    if (!point) return null;
    let best: { enemy: EnemySnapshot; distance: number } | null = null;
    for (const enemy of this.state.enemies) {
      const d = distance(point, enemy.position);
      if (d > 34 || (best && best.distance <= d)) continue;
      best = { enemy, distance: d };
    }
    return best?.enemy ?? null;
  }

  private screenToWorld(clientX: number, clientY: number): Position | null {
    const canvas = this.canvas;
    const local = this.localPosition();
    if (!canvas || !local) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const view = camera(rect.width, rect.height, local);
    return {
      x: clamp((clientX - rect.left - view.x) / CAMERA_SCALE, WORLD.minX, WORLD.maxX),
      y: clamp((clientY - rect.top - view.y) / CAMERA_SCALE, WORLD.minY, WORLD.maxY),
    };
  }

  private localPosition(): Position | null {
    const text = this.root.querySelector<HTMLElement>('[data-testid="local-position"]')?.textContent ?? '';
    const [x, y] = text.split(',').map((part) => Number(part.trim()));
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }
}

function enemyName(enemy: EnemySnapshot): string {
  if (enemy.id === 'waystone-warden-alpha-1') return 'Waystone Warden';
  return enemy.kind === 'road_wolf' ? 'Road wolf' : 'Reach rat';
}

function camera(width: number, height: number, local: Position): Position {
  const scaledWidth = (WORLD.maxX - WORLD.minX) * CAMERA_SCALE;
  const scaledHeight = (WORLD.maxY - WORLD.minY) * CAMERA_SCALE;
  return {
    x: Math.round(scaledWidth <= width ? (width - scaledWidth) / 2 : clamp(width / 2 - local.x * CAMERA_SCALE, width - WORLD.maxX * CAMERA_SCALE, -WORLD.minX * CAMERA_SCALE)),
    y: Math.round(scaledHeight <= height ? (height - scaledHeight) / 2 : clamp(height / 2 - local.y * CAMERA_SCALE, height - WORLD.maxY * CAMERA_SCALE, -WORLD.minY * CAMERA_SCALE)),
  };
}

function distance(a: Position, b: Position): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] ?? char); }
