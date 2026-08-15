import type { GlyphReachApp } from './App';
import type {
  CombatProgressSnapshot,
  EnemySnapshot,
  GatheringMode,
  PlayerProgressSnapshot,
  Position,
  ResourceNodeSnapshot,
  ServiceSnapshot,
  StationSnapshot,
} from '../protocol/v1';
import type { DialogueSnapshot, NpcSnapshot, QuestJournalSnapshot } from '../protocol/quest-v1';
import './player-interface.css';

const CAMERA_SCALE = 2;
const WORLD = { minX: 0, minY: 0, maxX: 1000, maxY: 600 } as const;
const ACTION_RANGE = 70;
const PANEL_LEASH = 105;

const LANDMARKS = {
  waystone: { id: 'weathered-waystone-alpha-1', label: 'Weathered waystone', position: { x: 955, y: 55 } },
  vault: { id: 'northreach-vault-alpha-1', label: 'Northreach vault entrance', position: { x: 900, y: 270 } },
  ledger: { id: 'northreach-ledger-wall-alpha-1', label: 'Resonant survey mark', position: { x: 944, y: 318 } },
  cache: { id: 'northreach-cache-alpha-1', label: 'Collapsed survey cache', position: { x: 972, y: 474 } },
} as const;

const ITEM_NAMES: Record<string, string> = {
  copper_ore: 'Copper ore', copper_bar: 'Copper bar', copper_pickaxe: 'Copper pickaxe', copper_sword: 'Copper sword',
  reach_rat_tail: 'Reach rat tail', raw_riverfish: 'Raw Northwater fish', cooked_riverfish: 'Cooked Northwater fish',
  fish_bones: 'Fish bones', road_wolf_pelt: 'Road wolf pelt', waystone_fragment: 'Weathered waystone fragment',
  warden_core: 'Waystone Warden core', old_route_token: 'Old Northreach route token',
};

type ConnectionLike = {
  moveTarget(position: Position): boolean;
  startGathering(nodeId: string, mode: GatheringMode): boolean;
  cancelGathering(): boolean;
  startProcessing(stationId: string, recipeId: string): boolean;
  cancelProcessing(): boolean;
  equipItem(itemId: string): boolean;
  useItem(itemId: string): boolean;
  bankDeposit(serviceId: string, itemId: string, quantity?: number): boolean;
  bankWithdraw(serviceId: string, itemId: string, quantity?: number): boolean;
  merchantBuy(serviceId: string, itemId: string, quantity?: number): boolean;
  merchantSell(serviceId: string, itemId: string, quantity?: number): boolean;
  attackTarget(targetId: string): boolean;
  interactNpc(targetId: string): boolean;
  dialogueChoice(npcId: string, choiceId: string): boolean;
};

type AppState = {
  connection: ConnectionLike | null;
  resources: ResourceNodeSnapshot[];
  stations: StationSnapshot[];
  services: ServiceSnapshot[];
  enemies: EnemySnapshot[];
  npcs: NpcSnapshot[];
  quests: QuestJournalSnapshot[];
  dialogue: DialogueSnapshot | null;
  progress: PlayerProgressSnapshot | null;
  combat: CombatProgressSnapshot | null;
};

type Target =
  | { type: 'npc'; id: string; label: string; position: Position; npc: NpcSnapshot }
  | { type: 'resource'; id: string; label: string; position: Position; resource: ResourceNodeSnapshot }
  | { type: 'station'; id: string; label: string; position: Position; station: StationSnapshot }
  | { type: 'service'; id: string; label: string; position: Position; service: ServiceSnapshot }
  | { type: 'enemy'; id: string; label: string; position: Position; enemy: EnemySnapshot }
  | { type: 'landmark'; id: string; label: string; position: Position; detail: string };

type Pending = { target: Target; action: Action };
type Action = 'talk' | 'focused' | 'steady' | 'attack' | 'open' | 'inspect' | 'examine';
type PanelKind = 'pack' | 'journal' | 'skills' | 'bank' | 'merchant' | 'station' | null;

export function installPlayerInterface(root: HTMLElement, app: GlyphReachApp): void {
  const query = new URLSearchParams(window.location.search);
  const legacyAutomation = ['127.0.0.1', 'localhost', '::1'].includes(window.location.hostname) && query.get('prototype') !== '0';
  if (legacyAutomation) return;
  const worldShell = root.querySelector<HTMLElement>('[data-testid="world-shell"]');
  if (!worldShell || worldShell.querySelector('[data-testid="player-interface"]')) return;
  new PlayerInterface(root, worldShell, app as unknown as AppState).start();
}

class PlayerInterface {
  private readonly host = document.createElement('div');
  private readonly hover: HTMLElement;
  private readonly selection: HTMLElement;
  private readonly contextMenu: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly dialogue: HTMLElement;
  private readonly activity: HTMLElement;
  private readonly quickbar: HTMLElement;
  private canvas: HTMLCanvasElement | null = null;
  private selected: Target | null = null;
  private pending: Pending | null = null;
  private panelKind: PanelKind = null;
  private panelTarget: Target | null = null;
  private timer = 0;
  private dialogueKey = '';
  private activityKey = '';
  private panelKey = '';

  constructor(private readonly root: HTMLElement, private readonly worldShell: HTMLElement, private readonly state: AppState) {
    this.host.className = 'player-interface';
    this.host.dataset.testid = 'player-interface';
    this.host.innerHTML = `
      <div class="world-hover-label" data-testid="world-hover-label" hidden></div>
      <div class="world-selection-ring" data-testid="world-selection-ring" hidden></div>
      <div class="world-context-menu" data-testid="world-context-menu" hidden></div>
      <section class="player-context-panel" data-testid="player-context-panel" hidden></section>
      <section class="player-dialogue" data-testid="player-dialogue" hidden></section>
      <div class="player-activity" data-testid="player-activity" hidden></div>
      <nav class="player-quickbar" aria-label="Player panels">
        <button type="button" data-panel="pack" data-testid="open-pack">Pack</button>
        <button type="button" data-panel="journal" data-testid="open-journal">Journal</button>
        <button type="button" data-panel="skills" data-testid="open-skills">Skills</button>
      </nav>`;
    worldShell.append(this.host);
    this.hover = this.need('world-hover-label');
    this.selection = this.need('world-selection-ring');
    this.contextMenu = this.need('world-context-menu');
    this.panel = this.need('player-context-panel');
    this.dialogue = this.need('player-dialogue');
    this.activity = this.need('player-activity');
    this.quickbar = this.host.querySelector<HTMLElement>('.player-quickbar')!;
  }

  start(): void {
    this.quickbar.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-panel]');
      if (!button) return;
      const kind = button.dataset.panel as 'pack' | 'journal' | 'skills';
      this.openPanel(this.panelKind === kind ? null : kind);
    });
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      this.pending = null;
      this.contextMenu.hidden = true;
      this.openPanel(null);
      if (!this.state.dialogue) this.clearSelection();
    });
    this.sync();
    this.timer = window.setInterval(() => this.sync(), 100);
    window.addEventListener('beforeunload', () => window.clearInterval(this.timer), { once: true });
  }

  private sync(): void {
    this.bindCanvas();
    this.checkPending();
    this.enforcePanelLeash();
    this.renderSelection();
    this.renderDialogue();
    this.renderActivity();
    this.renderPanel();
  }

  private bindCanvas(): void {
    const next = this.root.querySelector<HTMLCanvasElement>('canvas[data-camera-mode="player"]');
    if (!next || next === this.canvas) return;
    if (this.canvas) this.unbindCanvas(this.canvas);
    this.canvas = next;
    next.addEventListener('pointerdown', this.onPointerDown);
    next.addEventListener('pointermove', this.onPointerMove);
    next.addEventListener('pointerleave', this.onPointerLeave);
    next.addEventListener('contextmenu', this.onContextMenu);
  }

  private unbindCanvas(canvas: HTMLCanvasElement): void {
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    canvas.removeEventListener('contextmenu', this.onContextMenu);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.contextMenu.hidden = true;
    const target = this.hit(event.clientX, event.clientY);
    if (!target) {
      this.pending = null;
      if (isScopedPanel(this.panelKind)) this.openPanel(null);
      if (!this.state.dialogue) this.clearSelection();
      return;
    }
    this.select(target);
    this.queue(target, primaryAction(target));
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const target = this.hit(event.clientX, event.clientY);
    if (!target) { this.onPointerLeave(); return; }
    if (this.canvas) this.canvas.style.cursor = 'pointer';
    const shell = this.worldShell.getBoundingClientRect();
    this.hover.hidden = false;
    this.hover.style.left = `${Math.round(event.clientX - shell.left + 14)}px`;
    this.hover.style.top = `${Math.round(event.clientY - shell.top + 14)}px`;
    this.hover.innerHTML = `<strong>${html(target.label)}</strong><span>${html(primaryVerb(target))}</span>`;
  };

  private readonly onPointerLeave = (): void => {
    this.hover.hidden = true;
    if (this.canvas) this.canvas.style.cursor = 'default';
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    const target = this.hit(event.clientX, event.clientY);
    if (!target) return;
    event.preventDefault();
    this.select(target);
    this.showContextMenu(target, event.clientX, event.clientY);
  };

  private showContextMenu(target: Target, clientX: number, clientY: number): void {
    this.contextMenu.replaceChildren();
    const title = document.createElement('div'); title.className = 'context-menu-title'; title.textContent = target.label; this.contextMenu.append(title);
    for (const option of targetOptions(target)) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = option.label;
      button.addEventListener('click', () => { this.contextMenu.hidden = true; option.action === 'examine' ? this.examine(target) : this.queue(target, option.action); });
      this.contextMenu.append(button);
    }
    const shell = this.worldShell.getBoundingClientRect();
    const x = clamp(clientX - shell.left, 8, Math.max(8, shell.width - 224));
    const y = clamp(clientY - shell.top, 8, Math.max(8, shell.height - 180));
    this.contextMenu.style.left = `${Math.round(x)}px`;
    this.contextMenu.style.top = `${Math.round(y)}px`;
    this.contextMenu.hidden = false;
  }

  private queue(target: Target, action: Action): void {
    if ((target.type === 'resource' && !target.resource.available) || (target.type === 'enemy' && !target.enemy.alive)) { this.examine(target); return; }
    const local = this.localPosition();
    if (!local) return;
    if (distance(local, target.position) <= ACTION_RANGE) { this.pending = null; this.perform(target, action); return; }
    this.pending = { target, action };
    this.state.connection?.moveTarget(target.position);
    this.setStatus(`Walking to ${target.label}…`);
    this.showTargetSummary(target, `Walking there · ${primaryVerb(target)}`);
  }

  private checkPending(): void {
    if (!this.pending) return;
    const local = this.localPosition();
    if (!local || distance(local, this.pending.target.position) > ACTION_RANGE) return;
    const pending = this.pending; this.pending = null; this.perform(pending.target, pending.action);
  }

  private perform(target: Target, action: Action): void {
    const connection = this.state.connection;
    if (!connection) return;
    if (action === 'examine' || action === 'inspect') { this.examine(target); return; }
    if (target.type === 'npc' && action === 'talk') { if (connection.interactNpc(target.id)) this.setStatus(`Talking to ${target.label}…`); return; }
    if (target.type === 'resource' && (action === 'focused' || action === 'steady')) {
      if (connection.startGathering(target.id, action)) this.setStatus(`${action === 'steady' ? 'Steady' : 'Focused'} ${target.resource.kind === 'river_pool' ? 'fishing' : 'mining'} started.`);
      return;
    }
    if (target.type === 'enemy' && action === 'attack') { if (connection.attackTarget(target.id)) this.setStatus(`Attacking ${target.label}…`); return; }
    if (target.type === 'service' && action === 'open') { this.panelTarget = target; this.openPanel(target.service.kind === 'bank' ? 'bank' : 'merchant'); return; }
    if (target.type === 'station' && action === 'open') { this.panelTarget = target; this.openPanel('station'); return; }
    if (target.type === 'landmark') { this.examine(target); return; }
  }

  private select(target: Target): void { this.selected = target; this.renderSelection(); this.showTargetSummary(target, primaryVerb(target)); }
  private clearSelection(): void { this.selected = null; this.selection.hidden = true; if (!this.panelKind) this.panel.hidden = true; }

  private showTargetSummary(target: Target, detail: string): void {
    if (this.panelKind) return;
    this.panel.className = 'player-context-panel target-summary';
    this.panel.innerHTML = `<span class="panel-kicker">${html(targetType(target))}</span><strong>${html(target.label)}</strong><span>${html(detail)}</span><small>Left-click: ${html(primaryVerb(target).toLowerCase())} · right-click: options</small>`;
    this.panel.hidden = false;
  }

  private examine(target: Target): void {
    const fallback = target.type === 'landmark' ? target.detail : EXAMINE[target.id] ?? 'Something in the Reach worth a closer look.';
    this.showTargetSummary(target, fallback);
  }

  private renderSelection(): void {
    if (!this.selected) { this.selection.hidden = true; return; }
    const point = this.worldToShell(this.selected.position);
    if (!point) { this.selection.hidden = true; return; }
    this.selection.hidden = false; this.selection.style.left = `${Math.round(point.x)}px`; this.selection.style.top = `${Math.round(point.y)}px`;
  }

  private renderDialogue(): void {
    const value = this.state.dialogue;
    const key = value ? JSON.stringify(value) : 'none';
    if (key === this.dialogueKey) return;
    this.dialogueKey = key;
    if (!value) { this.dialogue.hidden = true; this.dialogue.replaceChildren(); return; }
    const kicker = el('span', 'panel-kicker', 'Conversation');
    const speaker = el('strong', '', value.speaker);
    const text = el('p', '', value.text);
    const choices = el('div', 'dialogue-choice-list');
    for (const choice of value.choices) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = choice.label;
      button.addEventListener('click', () => this.state.connection?.dialogueChoice(value.npcId, choice.id)); choices.append(button);
    }
    this.dialogue.replaceChildren(kicker, speaker, text, choices); this.dialogue.hidden = false;
  }

  private renderActivity(): void {
    const progress = this.state.progress;
    const gathering = progress?.gathering ?? null;
    const processing = progress?.processing ?? null;
    const key = gathering ? `g:${gathering.nodeId}:${gathering.mode}:${gathering.completesAt}` : processing ? `p:${processing.stationId}:${processing.recipeId}:${processing.completesAt}` : 'none';
    if (key === this.activityKey) return;
    this.activityKey = key;
    if (!gathering && !processing) { this.activity.hidden = true; this.activity.replaceChildren(); return; }
    const label = gathering ? `${gathering.mode === 'steady' ? 'Steady' : 'Focused'} ${this.resourceActivity(gathering.nodeId)}` : recipeActivity(processing!.recipeId);
    const text = el('span'); text.innerHTML = `<small>ACTIVE</small><strong>${html(label)}</strong>`;
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => gathering ? this.state.connection?.cancelGathering() : this.state.connection?.cancelProcessing());
    this.activity.replaceChildren(text, cancel); this.activity.hidden = false;
  }

  private openPanel(kind: PanelKind): void {
    this.panelKind = kind; this.panelKey = '';
    if (!kind) { this.panelTarget = null; this.panel.hidden = true; this.quickbar.querySelectorAll('button').forEach((b) => b.removeAttribute('data-active')); if (this.selected) this.showTargetSummary(this.selected, primaryVerb(this.selected)); return; }
    this.quickbar.querySelectorAll<HTMLButtonElement>('button[data-panel]').forEach((b) => b.dataset.panel === kind ? b.dataset.active = 'true' : b.removeAttribute('data-active'));
    this.renderPanel();
  }

  private renderPanel(): void {
    if (!this.panelKind) return;
    const key = this.panelStateKey();
    if (key === this.panelKey) return;
    this.panelKey = key;
    if (this.panelKind === 'pack') this.renderPack();
    else if (this.panelKind === 'journal') this.renderJournal();
    else if (this.panelKind === 'skills') this.renderSkills();
    else if (this.panelKind === 'bank') this.renderBank();
    else if (this.panelKind === 'merchant') this.renderMerchant();
    else this.renderStation();
  }

  private panelStateKey(): string {
    const kind = this.panelKind;
    if (kind === 'journal') return `journal:${JSON.stringify(this.state.quests)}`;
    if (kind === 'skills') return `skills:${JSON.stringify(this.state.progress?.skills)}:${JSON.stringify(this.state.combat?.skill)}`;
    if (kind === 'pack') return `pack:${JSON.stringify(this.state.progress?.inventory)}:${this.state.progress?.equipment.toolItemId}:${this.state.combat?.equipment.weaponItemId}`;
    if (kind === 'bank') return `bank:${this.panelTarget?.id}:${JSON.stringify(this.state.progress?.inventory)}:${JSON.stringify(this.state.progress?.bank)}`;
    if (kind === 'merchant') return `merchant:${this.panelTarget?.id}:${this.state.progress?.wallet.coins}:${JSON.stringify(this.state.progress?.inventory)}:${JSON.stringify(this.state.services)}`;
    return `station:${this.panelTarget?.id}:${JSON.stringify(this.state.progress?.inventory)}:${JSON.stringify(this.state.progress?.processing)}`;
  }

  private enforcePanelLeash(): void {
    if (!isScopedPanel(this.panelKind) || !this.panelTarget) return;
    const local = this.localPosition(); if (!local) return;
    if (distance(local, this.panelTarget.position) > PANEL_LEASH) this.openPanel(null);
  }

  private renderPack(): void {
    const progress = this.state.progress;
    this.setupPanel('Inventory', 'Field pack', progress ? `${progress.inventory.slots.length} / ${progress.inventory.capacity} slots used` : 'Loading…');
    const list = el('div', 'item-list');
    if (!progress?.inventory.slots.length) list.append(empty('Your pack is empty.'));
    for (const slot of progress?.inventory.slots ?? []) {
      const row = itemRow(slot.itemId, slot.quantity); const actions = row.querySelector<HTMLElement>('.item-actions')!;
      const equippedTool = progress.equipment.toolItemId === slot.itemId; const equippedWeapon = this.state.combat?.equipment.weaponItemId === slot.itemId;
      if (slot.itemId === 'copper_pickaxe' || slot.itemId === 'copper_sword') actions.append(actionButton(equippedTool || equippedWeapon ? 'Equipped' : 'Equip', () => this.state.connection?.equipItem(slot.itemId), equippedTool || equippedWeapon));
      if (slot.itemId === 'cooked_riverfish') actions.append(actionButton('Eat', () => this.state.connection?.useItem(slot.itemId)));
      list.append(row);
    }
    this.panel.append(list); this.panel.hidden = false;
  }

  private renderJournal(): void {
    this.setupPanel('Journal', 'Field notes', 'Objectives change only when the world says they changed.');
    const list = el('div', 'quest-list');
    if (!this.state.quests.length) list.append(empty('No fieldwork recorded yet.'));
    for (const quest of this.state.quests) {
      const card = el('section', 'quest-card');
      const status = el('span', `quest-state quest-${quest.status}`, quest.status === 'completed' ? 'Completed' : quest.status === 'not_started' ? 'Available' : quest.stage === 'return' ? 'Return' : 'Active');
      const title = el('strong', '', quest.title); const objectives = el('div', 'quest-objectives');
      for (const objective of quest.objectives) { const row = el('div'); row.dataset.complete = String(objective.complete); row.innerHTML = `<span>${objective.complete ? '✓' : '○'}</span><span>${html(objective.label)}</span>`; objectives.append(row); }
      card.append(status, title, objectives); list.append(card);
    }
    this.panel.append(list); this.panel.hidden = false;
  }

  private renderSkills(): void {
    this.setupPanel('Character', 'Skills');
    const grid = el('div', 'skill-grid'); const skills = this.state.progress?.skills;
    if (skills) { grid.append(skill('Mining', skills.mining.level, skills.mining.xp), skill('Smithing', skills.smithing.level, skills.smithing.xp), skill('Fishing', skills.fishing.level, skills.fishing.xp), skill('Cooking', skills.cooking.level, skills.cooking.xp)); }
    if (this.state.combat) grid.append(skill('Combat', this.state.combat.skill.level, this.state.combat.skill.xp));
    this.panel.append(grid); this.panel.hidden = false;
  }

  private renderBank(): void {
    const progress = this.state.progress; const target = this.panelTarget;
    const bank = target?.type === 'service' && target.service.kind === 'bank' ? target.service : this.state.services.find((s) => s.kind === 'bank');
    this.setupPanel('Camp service', 'Bank', progress ? `${progress.bank.slots.length} / ${progress.bank.capacity} bank slots` : 'Loading…', true);
    if (!progress || !bank) { this.panel.append(empty('Bank unavailable.')); this.panel.hidden = false; return; }
    const columns = el('div', 'bank-columns');
    columns.append(this.transferColumn('Carried', progress.inventory.slots, (item, qty) => this.state.connection?.bankDeposit(bank.id, item, qty)), this.transferColumn('Stored', progress.bank.slots, (item, qty) => this.state.connection?.bankWithdraw(bank.id, item, qty)));
    this.panel.append(columns); this.panel.hidden = false;
  }

  private transferColumn(title: string, slots: Array<{ itemId: string; quantity: number }>, transfer: (item: string, quantity: number) => unknown): HTMLElement {
    const section = el('section'); section.append(el('h3', '', title)); const list = el('div', 'item-list compact');
    if (!slots.length) list.append(empty(title === 'Carried' ? 'Nothing carried.' : 'Bank is empty.'));
    for (const slot of slots) { const row = itemRow(slot.itemId, slot.quantity); row.querySelector('.item-actions')?.append(actionButton('1', () => transfer(slot.itemId, 1)), actionButton('5', () => transfer(slot.itemId, Math.min(5, slot.quantity))), actionButton('All', () => transfer(slot.itemId, slot.quantity))); list.append(row); }
    section.append(list); return section;
  }

  private renderMerchant(): void {
    const progress = this.state.progress; const target = this.panelTarget;
    const merchant = target?.type === 'service' && target.service.kind === 'merchant' ? target.service : this.state.services.find((s): s is Extract<ServiceSnapshot, { kind: 'merchant' }> => s.kind === 'merchant');
    this.setupPanel('Frontier trade', 'Merchant', progress ? `${progress.wallet.coins} coins` : 'Loading…', true);
    if (!progress || !merchant) { this.panel.append(empty('Merchant unavailable.')); this.panel.hidden = false; return; }
    const list = el('div', 'merchant-list');
    for (const offer of merchant.offers) {
      const owned = quantity(progress.inventory.slots, offer.itemId); const card = el('section', 'merchant-row');
      card.innerHTML = `<div><strong>${html(itemName(offer.itemId))}</strong><small>You carry ${owned}</small></div><div class="merchant-prices"><span>Buy <b>${offer.buyPrice}</b></span><span>Sell <b>${offer.sellPrice}</b></span></div>`;
      const actions = el('div', 'item-actions'); actions.append(actionButton('Buy 1', () => this.state.connection?.merchantBuy(merchant.id, offer.itemId, 1)), actionButton('Buy 5', () => this.state.connection?.merchantBuy(merchant.id, offer.itemId, 5)));
      if (owned) actions.append(actionButton('Sell 1', () => this.state.connection?.merchantSell(merchant.id, offer.itemId, 1)), actionButton('Sell all', () => this.state.connection?.merchantSell(merchant.id, offer.itemId, owned)));
      card.append(actions); list.append(card);
    }
    this.panel.append(list); this.panel.hidden = false;
  }

  private renderStation(): void {
    const target = this.panelTarget; const station = target?.type === 'station' ? target.station : null;
    this.setupPanel('Workstation', station ? stationLabel(station) : 'Workstation', station ? 'Choose what to make here.' : 'Unavailable', true);
    if (!station) { this.panel.append(empty('Workstation unavailable.')); this.panel.hidden = false; return; }
    const recipes = station.kind === 'furnace' ? [{ id: 'smelt_copper', label: 'Smelt copper bar', need: '1 copper ore' }]
      : station.kind === 'anvil' ? [{ id: 'smith_copper_pickaxe', label: 'Forge copper pickaxe', need: '2 copper bars' }, { id: 'smith_copper_sword', label: 'Forge copper sword', need: '2 copper bars' }]
      : [{ id: 'cook_riverfish', label: 'Cook Northwater fish', need: '1 raw fish' }];
    const list = el('div', 'recipe-list');
    for (const recipe of recipes) { const button = document.createElement('button'); button.type = 'button'; button.className = 'recipe-card'; button.innerHTML = `<strong>${html(recipe.label)}</strong><small>Requires ${html(recipe.need)}</small>`; button.addEventListener('click', () => this.state.connection?.startProcessing(station.id, recipe.id)); list.append(button); }
    this.panel.append(list); this.panel.hidden = false;
  }

  private setupPanel(kicker: string, title: string, subtitle = '', wide = false): void {
    this.panel.className = `player-context-panel utility-panel${wide ? ' service-panel' : ''}`; this.panel.replaceChildren();
    const header = el('div', 'panel-header'); const titles = el('div'); titles.append(el('span', 'panel-kicker', kicker), el('strong', 'panel-title', title));
    const close = document.createElement('button'); close.type = 'button'; close.className = 'panel-close'; close.setAttribute('aria-label', 'Close panel'); close.textContent = '×'; close.addEventListener('click', () => this.openPanel(null)); header.append(titles, close); this.panel.append(header);
    if (subtitle) this.panel.append(el('p', 'panel-subtitle', subtitle));
  }

  private hit(clientX: number, clientY: number): Target | null {
    const point = this.screenToWorld(clientX, clientY); if (!point) return null;
    let best: { target: Target; d: number } | null = null;
    for (const target of this.targets()) {
      const radius = target.type === 'enemy' ? 34 : target.type === 'service' || target.type === 'station' || target.type === 'landmark' ? 31 : target.type === 'resource' ? 30 : 27;
      const d = distance(point, target.position); if (d <= radius && (!best || d < best.d)) best = { target, d };
    }
    return best?.target ?? null;
  }

  private targets(): Target[] {
    const out: Target[] = [];
    for (const npc of this.state.npcs) out.push({ type: 'npc', id: npc.id, label: npc.displayName, position: npc.position, npc });
    for (const resource of this.state.resources) out.push({ type: 'resource', id: resource.id, label: resource.kind === 'river_pool' ? 'Northwater fishing pool' : 'Copper vein', position: resource.position, resource });
    for (const station of this.state.stations) out.push({ type: 'station', id: station.id, label: stationLabel(station), position: station.position, station });
    for (const service of this.state.services) out.push({ type: 'service', id: service.id, label: service.kind === 'bank' ? 'Camp bank' : 'Frontier merchant', position: service.position, service });
    for (const enemy of this.state.enemies) out.push({ type: 'enemy', id: enemy.id, label: enemy.id === 'waystone-warden-alpha-1' ? 'Waystone Warden' : enemy.kind === 'road_wolf' ? 'Road wolf' : 'Reach rat', position: enemy.position, enemy });
    const progress = this.state.progress; const stoneQuest = this.state.quests.find((q) => q.questId === 'stone-below-alpha');
    if (progress?.worldFlags.northernRoadOpen) out.push({ type: 'landmark', ...LANDMARKS.waystone, detail: 'An old Northreach waystone cut with survey marks older than the current road.' });
    if (stoneQuest?.status === 'active') {
      const foundVault = stoneQuest.objectives.find((o) => o.id === 'find_vault')?.complete ?? false;
      const readMarks = stoneQuest.objectives.find((o) => o.id === 'read_marks')?.complete ?? false;
      out.push({ type: 'landmark', ...LANDMARKS.vault, detail: foundVault ? 'The buried survey-vault entrance you uncovered.' : 'A half-buried retaining wall where the old road turns back on itself.' });
      if (foundVault) {
        out.push({ type: 'landmark', ...LANDMARKS.ledger, detail: readMarks ? 'The old resonant survey mark, now deciphered.' : 'The marked survey stone Rhea described. Carry the fragment onto it.' });
        out.push({ type: 'landmark', ...LANDMARKS.cache, detail: 'A collapsed survey cache tucked into the old vault works.' });
      }
    }
    return out;
  }

  private screenToWorld(clientX: number, clientY: number): Position | null {
    const canvas = this.canvas, local = this.localPosition(); if (!canvas || !local) return null;
    const r = canvas.getBoundingClientRect(); if (!r.width || !r.height) return null;
    const camera = camera(r.width, r.height, local);
    return { x: clamp((clientX - r.left - camera.x) / CAMERA_SCALE, WORLD.minX, WORLD.maxX), y: clamp((clientY - r.top - camera.y) / CAMERA_SCALE, WORLD.minY, WORLD.maxY) };
  }

  private worldToShell(position: Position): Position | null {
    const canvas = this.canvas, local = this.localPosition(); if (!canvas || !local) return null;
    const r = canvas.getBoundingClientRect(), shell = this.worldShell.getBoundingClientRect(), c = camera(r.width, r.height, local);
    return { x: r.left - shell.left + c.x + position.x * CAMERA_SCALE, y: r.top - shell.top + c.y + position.y * CAMERA_SCALE };
  }

  private localPosition(): Position | null {
    const text = this.root.querySelector<HTMLElement>('[data-testid="local-position"]')?.textContent ?? '';
    const [x, y] = text.split(',').map((part) => Number(part.trim())); return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  private resourceActivity(nodeId: string): string { return this.state.resources.find((r) => r.id === nodeId)?.kind === 'river_pool' ? 'fishing' : 'mining'; }
  private setStatus(message: string): void { const status = this.root.querySelector<HTMLElement>('[data-testid="action-status"]'); if (status) status.textContent = message; }
  private need(id: string): HTMLElement { const value = this.host.querySelector<HTMLElement>(`[data-testid="${id}"]`); if (!value) throw new Error(`Missing player interface element ${id}`); return value; }
}

const EXAMINE: Record<string, string> = {
  'surveyor-alpha-1': 'Surveyor Rhea keeps the camp ledger and the northern fieldwork line moving.',
  'northwatch-cook-alpha-1': 'Cook Sella keeps Northwatch fed and has no patience for wasted provisions.',
  'copper-vein-alpha-1': 'A workable copper seam. Focused work is faster; steady work trades speed for low attention.',
  'northwater-pool-alpha-1': 'A cold Northwater pool with fish moving below the surface.',
  'bank-alpha-1': 'The camp bank stores carried items safely.', 'merchant-alpha-1': 'A frontier merchant. Prices belong here, not in a global action list.',
  'furnace-alpha-1': 'A compact field furnace for smelting ore.', 'anvil-alpha-1': 'A heavy survey anvil for forging tools and weapons.',
  'north-campfire-alpha-1': 'Northwatch cooking fire.', 'reach-rat-alpha-1': 'A large Reach rat prowling the work line.',
  'road-wolf-alpha-1': 'A road wolf holding the northern ford.', 'waystone-warden-alpha-1': 'The old vault Warden. It was built to keep people out.',
};

function targetOptions(target: Target): Array<{ action: Action; label: string }> {
  if (target.type === 'npc') return [{ action: 'talk', label: `Talk to ${target.label}` }, { action: 'examine', label: 'Examine' }];
  if (target.type === 'resource') return target.resource.available ? [{ action: 'focused', label: `${target.resource.kind === 'river_pool' ? 'Fish' : 'Mine'} · focused` }, { action: 'steady', label: `${target.resource.kind === 'river_pool' ? 'Fish' : 'Mine'} · steady / AFK` }, { action: 'examine', label: 'Examine' }] : [{ action: 'examine', label: 'Examine depleted resource' }];
  if (target.type === 'enemy') return target.enemy.alive ? [{ action: 'attack', label: `Attack ${target.label}` }, { action: 'examine', label: 'Examine' }] : [{ action: 'examine', label: 'Examine remains' }];
  if (target.type === 'station') return [{ action: 'open', label: `Use ${target.label}` }, { action: 'examine', label: 'Examine' }];
  if (target.type === 'service') return [{ action: 'open', label: target.service.kind === 'bank' ? 'Bank' : 'Trade' }, { action: 'examine', label: 'Examine' }];
  return [{ action: 'inspect', label: 'Inspect' }];
}
function primaryAction(target: Target): Action { if (target.type === 'npc') return 'talk'; if (target.type === 'resource') return 'focused'; if (target.type === 'enemy') return 'attack'; if (target.type === 'station' || target.type === 'service') return 'open'; return 'inspect'; }
function primaryVerb(target: Target): string { if (target.type === 'npc') return `Talk to ${target.label}`; if (target.type === 'resource') return target.resource.available ? (target.resource.kind === 'river_pool' ? 'Fish' : 'Mine') : 'Depleted'; if (target.type === 'enemy') return target.enemy.alive ? 'Attack' : 'Examine'; if (target.type === 'station') return `Use ${target.label}`; if (target.type === 'service') return target.service.kind === 'bank' ? 'Bank' : 'Trade'; return 'Inspect'; }
function targetType(target: Target): string { return target.type === 'npc' ? 'Person' : target.type === 'resource' ? 'Resource' : target.type === 'enemy' ? 'Hostile' : target.type === 'station' ? 'Workstation' : target.type === 'service' ? 'Service' : 'Landmark'; }
function stationLabel(station: StationSnapshot): string { return station.kind === 'furnace' ? 'Field furnace' : station.kind === 'anvil' ? 'Survey anvil' : 'Northwatch campfire'; }
function recipeActivity(id: string): string { return id === 'smelt_copper' ? 'Smelting copper' : id === 'smith_copper_pickaxe' ? 'Forging copper pickaxe' : id === 'smith_copper_sword' ? 'Forging copper sword' : id === 'cook_riverfish' ? 'Cooking Northwater fish' : 'Working'; }
function itemName(id: string): string { return ITEM_NAMES[id] ?? id.replaceAll('_', ' '); }
function itemGlyph(id: string): string { return id.includes('ore') ? '◆' : id.includes('bar') ? '▰' : id.includes('pickaxe') ? '⛏' : id.includes('sword') ? '†' : id.includes('fish') ? '◖' : id.includes('pelt') ? '≈' : id.includes('fragment') || id.includes('token') || id.includes('core') ? '◇' : '•'; }
function itemRow(itemId: string, count: number): HTMLElement { const row = el('div', 'item-row'); row.innerHTML = `<div class="item-name"><span class="item-glyph">${html(itemGlyph(itemId))}</span><span><strong>${html(itemName(itemId))}</strong><small>x${count}</small></span></div><div class="item-actions"></div>`; return row; }
function actionButton(label: string, action: () => unknown, disabled = false): HTMLButtonElement { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.disabled = disabled; if (!disabled) b.addEventListener('click', () => { action(); }); return b; }
function empty(text: string): HTMLElement { return el('div', 'panel-empty', text); }
function skill(name: string, level: number, xp: number): HTMLElement { const card = el('div', 'skill-card'); card.innerHTML = `<span>${html(name)}</span><strong>${level}</strong><small>${xp} XP</small>`; return card; }
function quantity(slots: Array<{ itemId: string; quantity: number }>, itemId: string): number { return slots.filter((s) => s.itemId === itemId).reduce((sum, s) => sum + s.quantity, 0); }
function camera(width: number, height: number, local: Position): Position { const sw = (WORLD.maxX - WORLD.minX) * CAMERA_SCALE, sh = (WORLD.maxY - WORLD.minY) * CAMERA_SCALE; return { x: Math.round(sw <= width ? (width - sw) / 2 : clamp(width / 2 - local.x * CAMERA_SCALE, width - WORLD.maxX * CAMERA_SCALE, -WORLD.minX * CAMERA_SCALE)), y: Math.round(sh <= height ? (height - sh) / 2 : clamp(height / 2 - local.y * CAMERA_SCALE, height - WORLD.maxY * CAMERA_SCALE, -WORLD.minY * CAMERA_SCALE)) }; }
function isScopedPanel(kind: PanelKind): boolean { return kind === 'bank' || kind === 'merchant' || kind === 'station'; }
function distance(a: Position, b: Position): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function html(value: string): string { return value.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c] ?? c); }
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
