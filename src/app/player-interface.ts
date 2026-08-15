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
const WORLD_BOUNDS = { minX: 0, minY: 0, maxX: 1000, maxY: 600 } as const;
const SAFE_INTERACTION_RANGE = 70;

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

type PlayerFacingAppState = {
  connection: ConnectionLike | null;
  localPlayerId: string | null;
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
  | { type: 'landmark'; id: string; label: string; position: Position };

type PendingAction = {
  target: Target;
  action: string;
};

type PanelKind = 'pack' | 'journal' | 'skills' | 'bank' | 'merchant' | 'station' | null;

const ITEM_NAMES: Record<string, string> = {
  copper_ore: 'Copper ore',
  copper_bar: 'Copper bar',
  copper_pickaxe: 'Copper pickaxe',
  copper_sword: 'Copper sword',
  reach_rat_tail: 'Reach rat tail',
  raw_riverfish: 'Raw Northwater fish',
  cooked_riverfish: 'Cooked Northwater fish',
  fish_bones: 'Fish bones',
  road_wolf_pelt: 'Road wolf pelt',
  waystone_fragment: 'Weathered waystone fragment',
  warden_core: 'Waystone Warden core',
  old_route_token: 'Old Northreach route token',
};

export function installPlayerInterface(root: HTMLElement, app: GlyphReachApp): void {
  const query = new URLSearchParams(window.location.search);
  const localAutomation = ['127.0.0.1', 'localhost', '::1'].includes(window.location.hostname) && query.get('prototype') !== '0';
  if (localAutomation) return;

  const worldShell = root.querySelector<HTMLElement>('[data-testid="world-shell"]');
  if (!worldShell || worldShell.querySelector('[data-testid="player-interface"]')) return;

  const state = app as unknown as PlayerFacingAppState;
  const ui = new PlayerInterface(root, worldShell, state);
  ui.start();
}

class PlayerInterface {
  private readonly host: HTMLElement;
  private readonly hover: HTMLElement;
  private readonly selection: HTMLElement;
  private readonly contextMenu: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly dialogue: HTMLElement;
  private readonly activity: HTMLElement;
  private readonly quickbar: HTMLElement;
  private canvas: HTMLCanvasElement | null = null;
  private pending: PendingAction | null = null;
  private selected: Target | null = null;
  private panelKind: PanelKind = null;
  private panelTargetId: string | null = null;
  private hoverTarget: Target | null = null;
  private syncTimer = 0;
  private readonly onCanvasPointerDown = (event: PointerEvent) => this.handlePointerDown(event);
  private readonly onCanvasPointerMove = (event: PointerEvent) => this.handlePointerMove(event);
  private readonly onCanvasPointerLeave = () => this.hideHover();
  private readonly onCanvasContextMenu = (event: MouseEvent) => this.handleContextMenu(event);

  constructor(
    private readonly root: HTMLElement,
    private readonly worldShell: HTMLElement,
    private readonly state: PlayerFacingAppState,
  ) {
    this.host = document.createElement('div');
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
    this.hover = this.required('world-hover-label');
    this.selection = this.required('world-selection-ring');
    this.contextMenu = this.required('world-context-menu');
    this.panel = this.required('player-context-panel');
    this.dialogue = this.required('player-dialogue');
    this.activity = this.required('player-activity');
    this.quickbar = this.host.querySelector<HTMLElement>('.player-quickbar')!;
  }

  start(): void {
    this.quickbar.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-panel]');
      if (!button) return;
      const kind = button.dataset.panel as Exclude<PanelKind, 'bank' | 'merchant' | 'station' | null>;
      this.openUtilityPanel(this.panelKind === kind ? null : kind);
    });

    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      this.pending = null;
      this.contextMenu.hidden = true;
      this.openUtilityPanel(null);
      if (!this.state.dialogue) this.clearSelection();
    });

    this.sync();
    this.syncTimer = window.setInterval(() => this.sync(), 100);
    window.addEventListener('beforeunload', () => window.clearInterval(this.syncTimer), { once: true });
  }

  private sync(): void {
    this.bindCanvas();
    this.checkPending();
    this.renderSelection();
    this.renderDialogue();
    this.renderActivity();
    this.renderOpenPanel();
  }

  private bindCanvas(): void {
    const next = this.root.querySelector<HTMLCanvasElement>('canvas[data-camera-mode="player"]');
    if (!next || next === this.canvas) return;
    this.unbindCanvas();
    this.canvas = next;
    next.addEventListener('pointerdown', this.onCanvasPointerDown);
    next.addEventListener('pointermove', this.onCanvasPointerMove);
    next.addEventListener('pointerleave', this.onCanvasPointerLeave);
    next.addEventListener('contextmenu', this.onCanvasContextMenu);
  }

  private unbindCanvas(): void {
    if (!this.canvas) return;
    this.canvas.removeEventListener('pointerdown', this.onCanvasPointerDown);
    this.canvas.removeEventListener('pointermove', this.onCanvasPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onCanvasPointerLeave);
    this.canvas.removeEventListener('contextmenu', this.onCanvasContextMenu);
    this.canvas = null;
  }

  private handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    this.contextMenu.hidden = true;
    const target = this.hitTarget(event.clientX, event.clientY);
    if (!target) {
      this.pending = null;
      if (!this.state.dialogue) this.clearSelection();
      if (this.panelKind === 'bank' || this.panelKind === 'merchant' || this.panelKind === 'station') this.openUtilityPanel(null);
      return;
    }
    this.select(target);
    this.performPrimary(target);
  }

  private handlePointerMove(event: PointerEvent): void {
    const target = this.hitTarget(event.clientX, event.clientY);
    if (!target) {
      this.hideHover();
      if (this.canvas) this.canvas.style.cursor = 'default';
      return;
    }
    this.hoverTarget = target;
    if (this.canvas) this.canvas.style.cursor = 'pointer';
    const shellRect = this.worldShell.getBoundingClientRect();
    this.hover.hidden = false;
    this.hover.style.left = `${Math.round(event.clientX - shellRect.left + 15)}px`;
    this.hover.style.top = `${Math.round(event.clientY - shellRect.top + 15)}px`;
    this.hover.innerHTML = `<strong>${escapeHtml(target.label)}</strong><span>${escapeHtml(primaryVerb(target))}</span>`;
  }

  private hideHover(): void {
    this.hoverTarget = null;
    this.hover.hidden = true;
    if (this.canvas) this.canvas.style.cursor = 'default';
  }

  private handleContextMenu(event: MouseEvent): void {
    const target = this.hitTarget(event.clientX, event.clientY);
    if (!target) return;
    event.preventDefault();
    this.select(target);
    this.showContextMenu(target, event.clientX, event.clientY);
  }

  private showContextMenu(target: Target, clientX: number, clientY: number): void {
    const shellRect = this.worldShell.getBoundingClientRect();
    this.contextMenu.replaceChildren();
    const title = document.createElement('div');
    title.className = 'context-menu-title';
    title.textContent = target.label;
    this.contextMenu.append(title);
    for (const option of targetOptions(target)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      button.addEventListener('click', () => {
        this.contextMenu.hidden = true;
        if (option.action === 'examine') this.examine(target);
        else this.queueOrPerform(target, option.action);
      });
      this.contextMenu.append(button);
    }
    this.contextMenu.style.left = `${Math.round(clientX - shellRect.left)}px`;
    this.contextMenu.style.top = `${Math.round(clientY - shellRect.top)}px`;
    this.contextMenu.hidden = false;
  }

  private performPrimary(target: Target): void {
    if (target.type === 'npc') this.queueOrPerform(target, 'talk');
    else if (target.type === 'resource') this.queueOrPerform(target, 'focused');
    else if (target.type === 'enemy') this.queueOrPerform(target, 'attack');
    else if (target.type === 'station' || target.type === 'service') this.queueOrPerform(target, 'open');
    else this.queueOrPerform(target, 'inspect');
  }

  private queueOrPerform(target: Target, action: string): void {
    const local = this.localPosition();
    if (!local) return;
    if (distance(local, target.position) <= SAFE_INTERACTION_RANGE) {
      this.pending = null;
      this.perform(target, action);
      return;
    }
    this.pending = { target, action };
    this.state.connection?.moveTarget(target.position);
    this.setStatus(`Walking to ${target.label}…`);
    this.renderTargetSummary(target, `Walking there · ${primaryVerb(target)}`);
  }

  private checkPending(): void {
    const pending = this.pending;
    if (!pending) return;
    const local = this.localPosition();
    if (!local) return;
    if (distance(local, pending.target.position) > SAFE_INTERACTION_RANGE) return;
    this.pending = null;
    this.perform(pending.target, pending.action);
  }

  private perform(target: Target, action: string): void {
    const connection = this.state.connection;
    if (!connection) return;

    if (action === 'examine') {
      this.examine(target);
      return;
    }

    if (target.type === 'npc' && action === 'talk') {
      if (connection.interactNpc(target.id)) this.setStatus(`Talking to ${target.label}…`);
      return;
    }
    if (target.type === 'resource') {
      if (action === 'focused' || action === 'steady') {
        if (connection.startGathering(target.id, action)) {
          const noun = target.resource.kind === 'river_pool' ? 'Fishing' : 'Mining';
          this.setStatus(`${action === 'steady' ? 'Steady' : 'Focused'} ${noun.toLowerCase()} started.`);
        }
      }
      return;
    }
    if (target.type === 'enemy' && action === 'attack') {
      if (connection.attackTarget(target.id)) this.setStatus(`Attacking ${target.label}…`);
      return;
    }
    if (target.type === 'service' && action === 'open') {
      this.panelTargetId = target.id;
      this.openUtilityPanel(target.service.kind === 'bank' ? 'bank' : 'merchant');
      return;
    }
    if (target.type === 'station' && action === 'open') {
      this.panelTargetId = target.id;
      this.openUtilityPanel('station');
      return;
    }
    if (target.type === 'landmark') {
      this.examine(target);
    }
  }

  private examine(target: Target): void {
    const descriptions: Record<string, string> = {
      'surveyor-alpha-1': 'Surveyor Rhea keeps the camp ledger and the northern fieldwork line moving.',
      'northwatch-cook-alpha-1': 'Cook Sella keeps Northwatch fed and has no patience for wasted provisions.',
      'copper-vein-alpha-1': 'A workable copper seam. Focused work is faster; steady work trades speed for low attention.',
      'northwater-pool-alpha-1': 'A cold Northwater pool with fish moving below the surface.',
      'bank-alpha-1': 'The camp bank stores your carried items safely.',
      'merchant-alpha-1': 'A frontier merchant. Prices are shown only when you trade here.',
      'furnace-alpha-1': 'A compact field furnace for smelting ore into workable metal.',
      'anvil-alpha-1': 'A heavy survey anvil used to forge tools and weapons.',
      'north-campfire-alpha-1': 'Northwatch cooking fire. Raw riverfish can be cooked here.',
      'reach-rat-alpha-1': 'A large Reach rat prowling the work line.',
      'road-wolf-alpha-1': 'A road wolf holding the northern ford.',
      'waystone-warden-alpha-1': 'The old vault Warden. It was built to keep people out.',
      'weathered-waystone-alpha-1': 'An old Northreach waystone cut with survey marks older than the current road.',
    };
    this.renderTargetSummary(target, descriptions[target.id] ?? 'Something in the Reach worth a closer look.');
  }

  private select(target: Target): void {
    this.selected = target;
    this.renderSelection();
    this.renderTargetSummary(target, primaryVerb(target));
  }

  private clearSelection(): void {
    this.selected = null;
    this.selection.hidden = true;
    if (this.panelKind === null) this.panel.hidden = true;
  }

  private renderTargetSummary(target: Target, detail: string): void {
    if (this.panelKind !== null) return;
    this.panel.className = 'player-context-panel target-summary';
    this.panel.innerHTML = `
      <span class="panel-kicker">${escapeHtml(targetTypeLabel(target))}</span>
      <strong>${escapeHtml(target.label)}</strong>
      <span>${escapeHtml(detail)}</span>
      <small>Left-click for ${escapeHtml(primaryVerb(target).toLowerCase())} · right-click for options</small>`;
    this.panel.hidden = false;
  }

  private renderSelection(): void {
    if (!this.selected || !this.canvas) {
      this.selection.hidden = true;
      return;
    }
    const point = this.worldToShell(this.selected.position);
    if (!point) {
      this.selection.hidden = true;
      return;
    }
    this.selection.hidden = false;
    this.selection.style.left = `${Math.round(point.x)}px`;
    this.selection.style.top = `${Math.round(point.y)}px`;
  }

  private renderDialogue(): void {
    const dialogue = this.state.dialogue;
    if (!dialogue) {
      this.dialogue.hidden = true;
      return;
    }
    this.dialogue.replaceChildren();
    const kicker = document.createElement('span'); kicker.className = 'panel-kicker'; kicker.textContent = 'Conversation';
    const speaker = document.createElement('strong'); speaker.textContent = dialogue.speaker;
    const text = document.createElement('p'); text.textContent = dialogue.text;
    const choices = document.createElement('div'); choices.className = 'dialogue-choice-list';
    for (const choice of dialogue.choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = choice.label;
      button.addEventListener('click', () => this.state.connection?.dialogueChoice(dialogue.npcId, choice.id));
      choices.append(button);
    }
    this.dialogue.append(kicker, speaker, text, choices);
    this.dialogue.hidden = false;
  }

  private renderActivity(): void {
    const progress = this.state.progress;
    if (!progress?.gathering && !progress?.processing) {
      this.activity.hidden = true;
      return;
    }
    const gathering = progress.gathering;
    const processing = progress.processing;
    const label = gathering
      ? `${gathering.mode === 'steady' ? 'Steady' : 'Focused'} ${this.resourceLabel(gathering.nodeId)}`
      : recipeLabel(processing!.recipeId);
    this.activity.replaceChildren();
    const text = document.createElement('span'); text.innerHTML = `<small>ACTIVE</small><strong>${escapeHtml(label)}</strong>`;
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => gathering ? this.state.connection?.cancelGathering() : this.state.connection?.cancelProcessing());
    this.activity.append(text, cancel);
    this.activity.hidden = false;
  }

  private openUtilityPanel(kind: PanelKind): void {
    this.panelKind = kind;
    if (!kind) {
      this.panelTargetId = null;
      this.panel.hidden = true;
      this.quickbar.querySelectorAll('button').forEach((button) => button.removeAttribute('data-active'));
      if (this.selected) this.renderTargetSummary(this.selected, primaryVerb(this.selected));
      return;
    }
    this.quickbar.querySelectorAll<HTMLButtonElement>('button[data-panel]').forEach((button) => {
      if (button.dataset.panel === kind) button.dataset.active = 'true'; else button.removeAttribute('data-active');
    });
    this.renderOpenPanel();
  }

  private renderOpenPanel(): void {
    const kind = this.panelKind;
    if (!kind) return;
    if (kind === 'pack') this.renderPack();
    else if (kind === 'journal') this.renderJournal();
    else if (kind === 'skills') this.renderSkills();
    else if (kind === 'bank') this.renderBank();
    else if (kind === 'merchant') this.renderMerchant();
    else this.renderStation();
  }

  private panelHeader(kicker: string, title: string, subtitle?: string): HTMLElement[] {
    const k = document.createElement('span'); k.className = 'panel-kicker'; k.textContent = kicker;
    const h = document.createElement('strong'); h.className = 'panel-title'; h.textContent = title;
    const close = document.createElement('button'); close.type = 'button'; close.className = 'panel-close'; close.setAttribute('aria-label', 'Close panel'); close.textContent = '×'; close.addEventListener('click', () => this.openUtilityPanel(null));
    const header = document.createElement('div'); header.className = 'panel-header';
    const titles = document.createElement('div'); titles.append(k, h);
    header.append(titles, close);
    if (!subtitle) return [header];
    const sub = document.createElement('p'); sub.className = 'panel-subtitle'; sub.textContent = subtitle;
    return [header, sub];
  }

  private renderPack(): void {
    const progress = this.state.progress;
    this.panel.className = 'player-context-panel utility-panel pack-panel';
    this.panel.replaceChildren(...this.panelHeader('Inventory', 'Field pack', progress ? `${progress.inventory.slots.length} / ${progress.inventory.capacity} slots used` : 'Loading…'));
    const list = document.createElement('div'); list.className = 'item-list';
    if (!progress || progress.inventory.slots.length === 0) list.append(emptyState('Your pack is empty.'));
    else {
      for (const slot of progress.inventory.slots) {
        const row = itemRow(slot.itemId, slot.quantity);
        const actions = row.querySelector<HTMLElement>('.item-actions')!;
        if (slot.itemId === 'copper_pickaxe' || slot.itemId === 'copper_sword') actions.append(actionButton('Equip', () => this.state.connection?.equipItem(slot.itemId)));
        if (slot.itemId === 'cooked_riverfish') actions.append(actionButton('Eat', () => this.state.connection?.useItem(slot.itemId)));
        list.append(row);
      }
    }
    this.panel.append(list);
    this.panel.hidden = false;
  }

  private renderJournal(): void {
    this.panel.className = 'player-context-panel utility-panel journal-panel';
    this.panel.replaceChildren(...this.panelHeader('Journal', 'Field notes', 'Objectives update from authoritative world events.'));
    const list = document.createElement('div'); list.className = 'quest-list';
    if (this.state.quests.length === 0) list.append(emptyState('No fieldwork recorded yet.'));
    for (const quest of this.state.quests) {
      const card = document.createElement('section'); card.className = 'quest-card';
      const status = document.createElement('span'); status.className = `quest-state quest-${quest.status}`; status.textContent = quest.status === 'completed' ? 'Completed' : quest.status === 'not_started' ? 'Available' : quest.stage === 'return' ? 'Return' : 'Active';
      const title = document.createElement('strong'); title.textContent = quest.title;
      const objectives = document.createElement('div'); objectives.className = 'quest-objectives';
      for (const objective of quest.objectives) {
        const item = document.createElement('div'); item.dataset.complete = String(objective.complete); item.innerHTML = `<span>${objective.complete ? '✓' : '○'}</span><span>${escapeHtml(objective.label)}</span>`; objectives.append(item);
      }
      card.append(status, title, objectives); list.append(card);
    }
    this.panel.append(list);
    this.panel.hidden = false;
  }

  private renderSkills(): void {
    const progress = this.state.progress;
    const combat = this.state.combat;
    this.panel.className = 'player-context-panel utility-panel skills-panel';
    this.panel.replaceChildren(...this.panelHeader('Character', 'Skills'));
    const grid = document.createElement('div'); grid.className = 'skill-grid';
    const skills = progress ? [
      ['Mining', progress.skills.mining.level, progress.skills.mining.xp],
      ['Smithing', progress.skills.smithing.level, progress.skills.smithing.xp],
      ['Fishing', progress.skills.fishing.level, progress.skills.fishing.xp],
      ['Cooking', progress.skills.cooking.level, progress.skills.cooking.xp],
    ] as const : [];
    for (const [name, level, xp] of skills) grid.append(skillCard(name, level, xp));
    if (combat) grid.append(skillCard('Combat', combat.skill.level, combat.skill.xp));
    this.panel.append(grid);
    this.panel.hidden = false;
  }

  private renderBank(): void {
    const progress = this.state.progress;
    const bank = this.state.services.find((service) => service.id === this.panelTargetId && service.kind === 'bank') ?? this.state.services.find((service) => service.kind === 'bank');
    this.panel.className = 'player-context-panel utility-panel service-panel';
    this.panel.replaceChildren(...this.panelHeader('Camp service', 'Bank', progress ? `${progress.bank.slots.length} / ${progress.bank.capacity} bank slots` : 'Loading…'));
    if (!progress || !bank) { this.panel.append(emptyState('Bank unavailable.')); this.panel.hidden = false; return; }

    const columns = document.createElement('div'); columns.className = 'bank-columns';
    const carried = document.createElement('section'); carried.innerHTML = '<h3>Carried</h3>';
    const carriedList = document.createElement('div'); carriedList.className = 'item-list compact';
    if (progress.inventory.slots.length === 0) carriedList.append(emptyState('Nothing carried.'));
    for (const slot of progress.inventory.slots) {
      const row = itemRow(slot.itemId, slot.quantity);
      row.querySelector('.item-actions')?.append(
        actionButton('1', () => this.state.connection?.bankDeposit(bank.id, slot.itemId, 1)),
        actionButton('5', () => this.state.connection?.bankDeposit(bank.id, slot.itemId, Math.min(5, slot.quantity))),
        actionButton('All', () => this.state.connection?.bankDeposit(bank.id, slot.itemId, slot.quantity)),
      );
      carriedList.append(row);
    }
    carried.append(carriedList);

    const stored = document.createElement('section'); stored.innerHTML = '<h3>Stored</h3>';
    const storedList = document.createElement('div'); storedList.className = 'item-list compact';
    if (progress.bank.slots.length === 0) storedList.append(emptyState('Bank is empty.'));
    for (const slot of progress.bank.slots) {
      const row = itemRow(slot.itemId, slot.quantity);
      row.querySelector('.item-actions')?.append(
        actionButton('1', () => this.state.connection?.bankWithdraw(bank.id, slot.itemId, 1)),
        actionButton('5', () => this.state.connection?.bankWithdraw(bank.id, slot.itemId, Math.min(5, slot.quantity))),
        actionButton('All', () => this.state.connection?.bankWithdraw(bank.id, slot.itemId, slot.quantity)),
      );
      storedList.append(row);
    }
    stored.append(storedList);
    columns.append(carried, stored);
    this.panel.append(columns);
    this.panel.hidden = false;
  }

  private renderMerchant(): void {
    const progress = this.state.progress;
    const merchant = this.state.services.find((service): service is Extract<ServiceSnapshot, { kind: 'merchant' }> => service.id === this.panelTargetId && service.kind === 'merchant')
      ?? this.state.services.find((service): service is Extract<ServiceSnapshot, { kind: 'merchant' }> => service.kind === 'merchant');
    this.panel.className = 'player-context-panel utility-panel service-panel merchant-panel';
    this.panel.replaceChildren(...this.panelHeader('Frontier trade', 'Merchant', progress ? `${progress.wallet.coins} coins` : 'Loading…'));
    if (!merchant || !progress) { this.panel.append(emptyState('Merchant unavailable.')); this.panel.hidden = false; return; }
    const list = document.createElement('div'); list.className = 'merchant-list';
    for (const offer of merchant.offers) {
      const owned = quantity(progress.inventory.slots, offer.itemId);
      const card = document.createElement('section'); card.className = 'merchant-row';
      card.innerHTML = `<div><strong>${escapeHtml(itemName(offer.itemId))}</strong><small>You carry ${owned}</small></div><div class="merchant-prices"><span>Buy <b>${offer.buyPrice}</b></span><span>Sell <b>${offer.sellPrice}</b></span></div>`;
      const actions = document.createElement('div'); actions.className = 'item-actions';
      actions.append(
        actionButton('Buy 1', () => this.state.connection?.merchantBuy(merchant.id, offer.itemId, 1)),
        actionButton('Buy 5', () => this.state.connection?.merchantBuy(merchant.id, offer.itemId, 5)),
      );
      if (owned > 0) actions.append(
        actionButton('Sell 1', () => this.state.connection?.merchantSell(merchant.id, offer.itemId, 1)),
        actionButton('Sell all', () => this.state.connection?.merchantSell(merchant.id, offer.itemId, owned)),
      );
      card.append(actions); list.append(card);
    }
    this.panel.append(list);
    this.panel.hidden = false;
  }

  private renderStation(): void {
    const station = this.state.stations.find((candidate) => candidate.id === this.panelTargetId);
    this.panel.className = 'player-context-panel utility-panel station-panel';
    this.panel.replaceChildren(...this.panelHeader('Workstation', station ? stationLabel(station) : 'Workstation'));
    if (!station) { this.panel.append(emptyState('Workstation unavailable.')); this.panel.hidden = false; return; }
    const recipes = station.kind === 'furnace'
      ? [{ id: 'smelt_copper', label: 'Smelt copper bar', requirement: '1 copper ore' }]
      : station.kind === 'anvil'
        ? [
            { id: 'smith_copper_pickaxe', label: 'Forge copper pickaxe', requirement: '2 copper bars' },
            { id: 'smith_copper_sword', label: 'Forge copper sword', requirement: '2 copper bars' },
          ]
        : [{ id: 'cook_riverfish', label: 'Cook Northwater fish', requirement: '1 raw fish' }];
    const list = document.createElement('div'); list.className = 'recipe-list';
    for (const recipe of recipes) {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'recipe-card';
      card.innerHTML = `<strong>${escapeHtml(recipe.label)}</strong><small>Requires ${escapeHtml(recipe.requirement)}</small>`;
      card.addEventListener('click', () => this.state.connection?.startProcessing(station.id, recipe.id));
      list.append(card);
    }
    this.panel.append(list);
    this.panel.hidden = false;
  }

  private hitTarget(clientX: number, clientY: number): Target | null {
    const world = this.screenToWorld(clientX, clientY);
    if (!world) return null;
    const candidates = this.targets();
    let best: { target: Target; distance: number } | null = null;
    for (const target of candidates) {
      const hitRadius = target.type === 'enemy' ? 32 : target.type === 'service' || target.type === 'station' ? 30 : target.type === 'resource' ? 29 : 25;
      const d = distance(world, target.position);
      if (d > hitRadius || (best && best.distance <= d)) continue;
      best = { target, distance: d };
    }
    return best?.target ?? null;
  }

  private targets(): Target[] {
    const targets: Target[] = [];
    for (const npc of this.state.npcs) targets.push({ type: 'npc', id: npc.id, label: npc.displayName, position: npc.position, npc });
    for (const resource of this.state.resources) targets.push({ type: 'resource', id: resource.id, label: resourceLabel(resource), position: resource.position, resource });
    for (const station of this.state.stations) targets.push({ type: 'station', id: station.id, label: stationLabel(station), position: station.position, station });
    for (const service of this.state.services) targets.push({ type: 'service', id: service.id, label: service.kind === 'bank' ? 'Camp bank' : 'Frontier merchant', position: service.position, service });
    for (const enemy of this.state.enemies) targets.push({ type: 'enemy', id: enemy.id, label: enemyLabel(enemy), position: enemy.position, enemy });
    if (this.state.progress?.worldFlags.northernRoadOpen) targets.push({ type: 'landmark', id: 'weathered-waystone-alpha-1', label: 'Weathered waystone', position: { x: 955, y: 55 } });
    return targets;
  }

  private screenToWorld(clientX: number, clientY: number): Position | null {
    const canvas = this.canvas;
    const local = this.localPosition();
    if (!canvas || !local) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const stageX = clientX - rect.left;
    const stageY = clientY - rect.top;
    const camera = cameraPosition(rect.width, rect.height, local);
    return {
      x: clamp((stageX - camera.x) / CAMERA_SCALE, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX),
      y: clamp((stageY - camera.y) / CAMERA_SCALE, WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY),
    };
  }

  private worldToShell(position: Position): Position | null {
    const canvas = this.canvas;
    const local = this.localPosition();
    if (!canvas || !local) return null;
    const canvasRect = canvas.getBoundingClientRect();
    const shellRect = this.worldShell.getBoundingClientRect();
    const camera = cameraPosition(canvasRect.width, canvasRect.height, local);
    return {
      x: canvasRect.left - shellRect.left + camera.x + position.x * CAMERA_SCALE,
      y: canvasRect.top - shellRect.top + camera.y + position.y * CAMERA_SCALE,
    };
  }

  private localPosition(): Position | null {
    const text = this.root.querySelector<HTMLElement>('[data-testid="local-position"]')?.textContent ?? '';
    const [x, y] = text.split(',').map((value) => Number(value.trim()));
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  private resourceLabel(id: string): string {
    const resource = this.state.resources.find((candidate) => candidate.id === id);
    return resource?.kind === 'river_pool' ? 'fishing' : 'mining';
  }

  private setStatus(message: string): void {
    const status = this.root.querySelector<HTMLElement>('[data-testid="action-status"]');
    if (status) status.textContent = message;
  }

  private required(testId: string): HTMLElement {
    const element = this.host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    if (!element) throw new Error(`Player interface missing ${testId}`);
    return element;
  }
}

function targetOptions(target: Target): Array<{ action: string; label: string }> {
  if (target.type === 'npc') return [{ action: 'talk', label: `Talk to ${target.label}` }, { action: 'examine', label: 'Examine' }];
  if (target.type === 'resource') {
    if (!target.resource.available) return [{ action: 'examine', label: 'Examine depleted resource' }];
    const verb = target.resource.kind === 'river_pool' ? 'Fish' : 'Mine';
    return [
      { action: 'focused', label: `${verb} · focused` },
      { action: 'steady', label: `${verb} · steady / AFK` },
      { action: 'examine', label: 'Examine' },
    ];
  }
  if (target.type === 'enemy') return target.enemy.alive ? [{ action: 'attack', label: `Attack ${target.label}` }, { action: 'examine', label: 'Examine' }] : [{ action: 'examine', label: 'Examine remains' }];
  if (target.type === 'station') return [{ action: 'open', label: `Use ${target.label}` }, { action: 'examine', label: 'Examine' }];
  if (target.type === 'service') return [{ action: 'open', label: target.service.kind === 'bank' ? 'Bank' : 'Trade' }, { action: 'examine', label: 'Examine' }];
  return [{ action: 'inspect', label: 'Inspect' }];
}

function primaryVerb(target: Target): string {
  if (target.type === 'npc') return `Talk to ${target.label}`;
  if (target.type === 'resource') return target.resource.kind === 'river_pool' ? 'Fish' : 'Mine';
  if (target.type === 'enemy') return target.enemy.alive ? 'Attack' : 'Examine';
  if (target.type === 'station') return `Use ${target.label}`;
  if (target.type === 'service') return target.service.kind === 'bank' ? 'Bank' : 'Trade';
  return 'Inspect';
}

function targetTypeLabel(target: Target): string {
  if (target.type === 'npc') return 'Person';
  if (target.type === 'resource') return 'Resource';
  if (target.type === 'enemy') return 'Hostile';
  if (target.type === 'station') return 'Workstation';
  if (target.type === 'service') return 'Service';
  return 'Landmark';
}

function resourceLabel(resource: ResourceNodeSnapshot): string {
  return resource.kind === 'river_pool' ? 'Northwater fishing pool' : 'Copper vein';
}

function stationLabel(station: StationSnapshot): string {
  if (station.kind === 'furnace') return 'Field furnace';
  if (station.kind === 'anvil') return 'Survey anvil';
  return 'Northwatch campfire';
}

function enemyLabel(enemy: EnemySnapshot): string {
  if (enemy.id === 'waystone-warden-alpha-1') return 'Waystone Warden';
  return enemy.kind === 'road_wolf' ? 'Road wolf' : 'Reach rat';
}

function recipeLabel(id: string): string {
  if (id === 'smelt_copper') return 'Smelting copper';
  if (id === 'smith_copper_pickaxe') return 'Forging copper pickaxe';
  if (id === 'smith_copper_sword') return 'Forging copper sword';
  if (id === 'cook_riverfish') return 'Cooking Northwater fish';
  return 'Working';
}

function itemName(id: string): string {
  return ITEM_NAMES[id] ?? id.replaceAll('_', ' ');
}

function itemRow(itemId: string, count: number): HTMLElement {
  const row = document.createElement('div'); row.className = 'item-row';
  row.innerHTML = `<div class="item-name"><span class="item-glyph">${escapeHtml(itemGlyph(itemId))}</span><span><strong>${escapeHtml(itemName(itemId))}</strong><small>x${count}</small></span></div><div class="item-actions"></div>`;
  return row;
}

function itemGlyph(itemId: string): string {
  if (itemId.includes('ore')) return '◆';
  if (itemId.includes('bar')) return '▰';
  if (itemId.includes('pickaxe')) return '⛏';
  if (itemId.includes('sword')) return '†';
  if (itemId.includes('fish')) return '◖';
  if (itemId.includes('pelt')) return '≈';
  if (itemId.includes('fragment') || itemId.includes('token') || itemId.includes('core')) return '◇';
  return '•';
}

function actionButton(label: string, action: () => unknown): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = label; button.addEventListener('click', () => { action(); });
  return button;
}

function emptyState(text: string): HTMLElement {
  const empty = document.createElement('div'); empty.className = 'panel-empty'; empty.textContent = text; return empty;
}

function skillCard(name: string, level: number, xp: number): HTMLElement {
  const card = document.createElement('div'); card.className = 'skill-card'; card.innerHTML = `<span>${escapeHtml(name)}</span><strong>${level}</strong><small>${xp} XP</small>`; return card;
}

function quantity(slots: Array<{ itemId: string; quantity: number }>, itemId: string): number {
  return slots.filter((slot) => slot.itemId === itemId).reduce((sum, slot) => sum + slot.quantity, 0);
}

function cameraPosition(width: number, height: number, local: Position): Position {
  const scaledWidth = (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX) * CAMERA_SCALE;
  const scaledHeight = (WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY) * CAMERA_SCALE;
  const x = scaledWidth <= width
    ? (width - scaledWidth) / 2 - WORLD_BOUNDS.minX * CAMERA_SCALE
    : clamp(width / 2 - local.x * CAMERA_SCALE, width - WORLD_BOUNDS.maxX * CAMERA_SCALE, -WORLD_BOUNDS.minX * CAMERA_SCALE);
  const y = scaledHeight <= height
    ? (height - scaledHeight) / 2 - WORLD_BOUNDS.minY * CAMERA_SCALE
    : clamp(height / 2 - local.y * CAMERA_SCALE, height - WORLD_BOUNDS.maxY * CAMERA_SCALE, -WORLD_BOUNDS.minY * CAMERA_SCALE);
  return { x: Math.round(x), y: Math.round(y) };
}

function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}
