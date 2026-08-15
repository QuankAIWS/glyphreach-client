import type { GlyphReachApp } from './App';
import type { Position } from '../protocol/v1';
import type { QuestJournalSnapshot } from '../protocol/quest-v1';
import './chapter-landmarks.css';

const CAMERA_SCALE = 2;
const WORLD = { minX: 0, minY: 0, maxX: 1000, maxY: 600 } as const;

type AppState = {
  quests: QuestJournalSnapshot[];
};

type Landmark = {
  id: string;
  label: string;
  position: Position;
  kind: 'vault' | 'ledger' | 'cache';
};

const LANDMARKS: Record<Landmark['kind'], Landmark> = {
  vault: { id: 'northreach-vault-alpha-1', label: 'Northreach vault entrance', position: { x: 900, y: 270 }, kind: 'vault' },
  ledger: { id: 'northreach-ledger-wall-alpha-1', label: 'Resonant survey mark', position: { x: 944, y: 318 }, kind: 'ledger' },
  cache: { id: 'northreach-cache-alpha-1', label: 'Collapsed survey cache', position: { x: 972, y: 474 }, kind: 'cache' },
};

export function installChapterLandmarks(root: HTMLElement, app: GlyphReachApp): void {
  const query = new URLSearchParams(window.location.search);
  const legacyAutomation = ['127.0.0.1', 'localhost', '::1'].includes(window.location.hostname) && query.get('prototype') !== '0';
  if (legacyAutomation) return;
  const worldShell = root.querySelector<HTMLElement>('[data-testid="world-shell"]');
  if (!worldShell) return;
  new ChapterLandmarkLayer(root, worldShell, app as unknown as AppState).start();
}

class ChapterLandmarkLayer {
  private readonly layer = document.createElement('div');
  private readonly elements = new Map<string, HTMLElement>();
  private timer = 0;

  constructor(private readonly root: HTMLElement, private readonly shell: HTMLElement, private readonly state: AppState) {
    this.layer.className = 'chapter-landmark-layer';
    this.layer.dataset.testid = 'chapter-landmark-layer';
    shell.append(this.layer);
  }

  start(): void {
    this.sync();
    this.timer = window.setInterval(() => this.sync(), 120);
    window.addEventListener('beforeunload', () => window.clearInterval(this.timer), { once: true });
  }

  private sync(): void {
    const active = new Map(this.visibleLandmarks().map((landmark) => [landmark.id, landmark]));
    for (const [id, element] of this.elements) {
      if (active.has(id)) continue;
      element.remove();
      this.elements.delete(id);
    }
    for (const landmark of active.values()) {
      let element = this.elements.get(landmark.id);
      if (!element) {
        element = this.create(landmark);
        this.elements.set(landmark.id, element);
        this.layer.append(element);
      }
      const point = this.worldToShell(landmark.position);
      if (!point) { element.hidden = true; continue; }
      element.hidden = point.x < -100 || point.y < -100 || point.x > this.shell.clientWidth + 100 || point.y > this.shell.clientHeight + 100;
      element.style.left = `${Math.round(point.x)}px`;
      element.style.top = `${Math.round(point.y)}px`;
    }
  }

  private visibleLandmarks(): Landmark[] {
    const stone = this.state.quests.find((quest) => quest.questId === 'stone-below-alpha');
    if (stone?.status !== 'active') return [];
    const out: Landmark[] = [LANDMARKS.vault];
    const foundVault = stone.objectives.find((objective) => objective.id === 'find_vault')?.complete ?? false;
    if (foundVault) out.push(LANDMARKS.ledger, LANDMARKS.cache);
    return out;
  }

  private create(landmark: Landmark): HTMLElement {
    const element = document.createElement('div');
    element.className = `chapter-landmark chapter-landmark-${landmark.kind}`;
    element.dataset.landmarkId = landmark.id;
    element.setAttribute('aria-label', landmark.label);
    element.innerHTML = landmarkMarkup(landmark.kind);
    return element;
  }

  private worldToShell(position: Position): Position | null {
    const canvas = this.root.querySelector<HTMLCanvasElement>('canvas[data-camera-mode="player"]');
    const local = localPosition(this.root);
    if (!canvas || !local) return null;
    const rect = canvas.getBoundingClientRect();
    const shellRect = this.shell.getBoundingClientRect();
    const view = camera(rect.width, rect.height, local);
    return {
      x: rect.left - shellRect.left + view.x + position.x * CAMERA_SCALE,
      y: rect.top - shellRect.top + view.y + position.y * CAMERA_SCALE,
    };
  }
}

function landmarkMarkup(kind: Landmark['kind']): string {
  if (kind === 'vault') return '<i class="vault-shadow"></i><i class="vault-left"></i><i class="vault-right"></i><i class="vault-cap"></i><i class="vault-dark"></i>';
  if (kind === 'ledger') return '<i class="ledger-shadow"></i><i class="ledger-slab"><b></b><b></b><b></b></i>';
  return '<i class="cache-shadow"></i><i class="cache-stone cache-a"></i><i class="cache-stone cache-b"></i><i class="cache-box"></i>';
}

function localPosition(root: HTMLElement): Position | null {
  const text = root.querySelector<HTMLElement>('[data-testid="local-position"]')?.textContent ?? '';
  const [x, y] = text.split(',').map((part) => Number(part.trim()));
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function camera(width: number, height: number, local: Position): Position {
  const scaledWidth = (WORLD.maxX - WORLD.minX) * CAMERA_SCALE;
  const scaledHeight = (WORLD.maxY - WORLD.minY) * CAMERA_SCALE;
  return {
    x: Math.round(scaledWidth <= width ? (width - scaledWidth) / 2 : clamp(width / 2 - local.x * CAMERA_SCALE, width - WORLD.maxX * CAMERA_SCALE, -WORLD.minX * CAMERA_SCALE)),
    y: Math.round(scaledHeight <= height ? (height - scaledHeight) / 2 : clamp(height / 2 - local.y * CAMERA_SCALE, height - WORLD.maxY * CAMERA_SCALE, -WORLD.minY * CAMERA_SCALE)),
  };
}

function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
