import type { EnemySnapshot, PlayerProgressSnapshot } from '../protocol/v1';
import type { QuestJournalSnapshot } from '../protocol/quest-v1';
import type { GlyphReachApp } from './App';

type ChapterApp = { enemies: EnemySnapshot[]; quests: QuestJournalSnapshot[]; progress: PlayerProgressSnapshot | null };

export function startNorthreachSync(root: HTMLElement, app: GlyphReachApp): void {
  addInventoryRows(root);
  const state = app as unknown as ChapterApp;
  const sync = () => render(root, state);
  sync();
  const timer = window.setInterval(sync, 100);
  window.addEventListener('beforeunload', () => window.clearInterval(timer), { once: true });
}

function render(root: HTMLElement, state: ChapterApp): void {
  const quest = state.quests.find((item) => item.questId === 'stone-below-alpha');
  set(root, 'stone-quest-title', quest?.title ?? 'The Stone Below');
  set(root, 'stone-quest-status', quest ? status(quest) : 'Locked');
  set(root, 'stone-quest-vault-status', objective(quest, 'find_vault'));
  set(root, 'stone-quest-marks-status', objective(quest, 'read_marks'));
  set(root, 'stone-quest-warden-status', objective(quest, 'defeat_warden'));
  set(root, 'stone-quest-proof-status', objective(quest, 'bring_core', 'Ready'));
  const warden = state.enemies.find((enemy) => enemy.id === 'waystone-warden-alpha-1');
  set(root, 'warden-health', !warden ? 'Sealed' : warden.alive ? `${warden.health} / ${warden.maxHealth}` : 'Defeated');
  const slots = state.progress?.inventory.slots ?? [];
  set(root, 'warden-core-count', String(count(slots, 'warden_core')));
  set(root, 'old-route-token-count', String(count(slots, 'old_route_token')));
}

function addInventoryRows(root: HTMLElement): void {
  const anchor = root.querySelector('[data-testid="waystone-fragment-count"]')?.closest('.skill-line');
  if (!anchor) return;
  anchor.after(row('Waystone Warden core', 'warden-core-count'), row('Old Northreach route token', 'old-route-token-count'));
}
function row(label: string, id: string): HTMLElement {
  const line = document.createElement('div'); line.className = 'skill-line';
  const name = document.createElement('span'); name.textContent = label;
  const value = document.createElement('strong'); value.dataset.testid = id; value.textContent = '0';
  line.append(name, value); return line;
}
function status(quest: QuestJournalSnapshot): string { if (quest.status === 'completed') return 'Completed'; if (quest.status === 'not_started') return 'Available'; return quest.stage === 'return' ? 'Return to Surveyor' : 'Active'; }
function objective(quest: QuestJournalSnapshot | undefined, id: string, done = 'Done'): string { if (!quest || quest.status === 'not_started') return '—'; return quest.objectives.find((item) => item.id === id)?.complete ? done : 'Pending'; }
function count(slots: Array<{ itemId: string; quantity: number }>, itemId: string): number { return slots.filter((slot) => slot.itemId === itemId).reduce((sum, slot) => sum + slot.quantity, 0); }
function set(root: HTMLElement, id: string, text: string): void { const element = root.querySelector<HTMLElement>(`[data-testid="${id}"]`); if (element) element.textContent = text; }
