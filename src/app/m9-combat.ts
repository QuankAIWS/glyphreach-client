import type { GlyphReachApp } from './App';

type CombatApp = { connection: { attackTarget(id: string): boolean } | null };

export function addNorthreachCombat(root: HTMLElement, app: GlyphReachApp): void {
  const wolfRow = root.querySelector('[data-testid="wolf-health"]')?.closest('.skill-line');
  if (wolfRow) wolfRow.after(row('Waystone Warden', 'warden-health', 'Sealed'));
  const old = root.querySelector<HTMLButtonElement>('[data-testid="attack-road-wolf"]');
  const stack = old?.closest('.button-stack');
  if (!old || !stack) return;
  const fixed = old.cloneNode(true) as HTMLButtonElement;
  old.replaceWith(fixed);
  const state = app as unknown as CombatApp;
  fixed.addEventListener('click', () => state.connection?.attackTarget('road-wolf-alpha-1'));
  const warden = document.createElement('button');
  warden.type = 'button'; warden.dataset.testid = 'attack-waystone-warden'; warden.textContent = 'Attack Waystone Warden';
  warden.addEventListener('click', () => state.connection?.attackTarget('waystone-warden-alpha-1'));
  stack.insertBefore(warden, root.querySelector('[data-testid="eat-riverfish"]'));
}

function row(label: string, id: string, value: string): HTMLElement {
  const line = document.createElement('div'); line.className = 'skill-line';
  const name = document.createElement('span'); name.textContent = label;
  const status = document.createElement('strong'); status.dataset.testid = id; status.textContent = value;
  line.append(name, status); return line;
}
