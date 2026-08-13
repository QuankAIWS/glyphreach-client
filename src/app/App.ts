import { WorldConnection, type ConnectionState } from '../net/WorldConnection';
import type {
  CombatPlayerStateMessage,
  CombatProgressSnapshot,
  CombatWorldStateMessage,
  EnemySnapshot,
  GatheringMode,
  PlayerProgressSnapshot,
  PlayerSnapshot,
  PlayerStateMessage,
  ResourceNodeSnapshot,
  ServiceSnapshot,
  StationKind,
  StationSnapshot,
  WorldStateMessage,
} from '../protocol/v1';
import type {
  ActionRejectedMessage,
  DialogueSnapshot,
  DialogueStateMessage,
  NpcSnapshot,
  QuestJournalSnapshot,
  QuestStateMessage,
} from '../protocol/quest-v1';
import { WorldView } from '../world/WorldView';

const RESUME_TOKEN_KEY = 'glyphreach.devResumeToken.v1';

export class GlyphReachApp {
  private readonly worldView = new WorldView();
  private connection: WorldConnection | null = null;
  private localPlayerId: string | null = null;
  private root: HTMLElement | null = null;
  private resources: ResourceNodeSnapshot[] = [];
  private stations: StationSnapshot[] = [];
  private services: ServiceSnapshot[] = [];
  private enemies: EnemySnapshot[] = [];
  private npcs: NpcSnapshot[] = [];
  private quests: QuestJournalSnapshot[] = [];
  private dialogue: DialogueSnapshot | null = null;
  private progress: PlayerProgressSnapshot | null = null;
  private combat: CombatProgressSnapshot | null = null;
  private readonly onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);

  async mount(root: HTMLElement): Promise<void> {
    this.root = root;
    root.innerHTML = `
      <main class="shell">
        <header class="topbar">
          <div><div class="eyebrow">NORTHERN ROAD CHAPTER</div><h1>GlyphReach</h1></div>
          <div class="connection-pill" data-testid="connection-status">Connecting…</div>
        </header>
        <section class="world-shell" data-testid="world-shell">
          <div class="world-canvas" data-testid="world-canvas"></div>
          <aside class="connection-card">
            <div class="label">World</div><div data-testid="world-id">Awaiting server…</div>
            <div class="skill-line"><span>Northern road</span><strong data-testid="north-road-status">Closed</strong></div>
            <div class="skill-line"><span>Waystone</span><strong data-testid="waystone-status">Undiscovered</strong></div>
            <div class="label">Player</div><div data-testid="player-id">Awaiting server…</div>
            <div class="label">Players online</div><div data-testid="player-count">0</div>
            <div class="label">Position</div><div data-testid="local-position">—</div>
            <div class="label">Movement</div><div class="control-note">Click the world to move. WASD / arrows are alternate controls.</div>

            <div class="label">Journal · Silent Bell</div>
            <div class="skill-line"><span data-testid="quest-title">The Silent Bell</span><strong data-testid="quest-status">Available</strong></div>
            <div class="skill-line"><span>Mine fresh copper</span><strong data-testid="quest-mine-status">—</strong></div>
            <div class="skill-line"><span>Forge a blade</span><strong data-testid="quest-forge-status">—</strong></div>
            <div class="skill-line"><span>Clear bell route</span><strong data-testid="quest-rat-status">—</strong></div>
            <div class="skill-line"><span>Bring proof</span><strong data-testid="quest-proof-status">—</strong></div>
            <div class="button-stack"><button type="button" data-testid="interact-surveyor">Talk to Surveyor Rhea</button></div>

            <div class="label">Journal · Northwatch</div>
            <div class="skill-line"><span data-testid="north-quest-title">A Cold Supper</span><strong data-testid="north-quest-status">Locked</strong></div>
            <div class="skill-line"><span>Catch supper</span><strong data-testid="north-quest-fish-status">—</strong></div>
            <div class="skill-line"><span>Cook supper</span><strong data-testid="north-quest-cook-status">—</strong></div>
            <div class="skill-line"><span>Clear the ford</span><strong data-testid="north-quest-wolf-status">—</strong></div>
            <div class="skill-line"><span>Bring supper + pelt</span><strong data-testid="north-quest-proof-status">—</strong></div>
            <div class="button-stack"><button type="button" data-testid="interact-sella">Talk to Cook Sella</button></div>

            <div class="dialogue-card" data-testid="dialogue-panel" hidden>
              <strong data-testid="dialogue-speaker"></strong>
              <div data-testid="dialogue-text"></div>
              <div class="button-stack" data-testid="dialogue-choices"></div>
            </div>

            <div class="label">Combat</div>
            <div class="skill-line"><span>Health</span><strong data-testid="combat-health">— / —</strong></div>
            <div class="skill-line"><span>Combat level / XP</span><strong><span data-testid="combat-level">1</span> · <span data-testid="combat-xp">0</span></strong></div>
            <div class="skill-line"><span>Reach rat</span><strong data-testid="rat-health">—</strong></div>
            <div class="skill-line"><span>Road wolf</span><strong data-testid="wolf-health">—</strong></div>
            <div class="skill-line"><span>Weapon</span><strong data-testid="equipped-weapon">None</strong></div>
            <div class="button-stack">
              <button type="button" data-testid="attack-reach-rat">Attack Reach rat</button>
              <button type="button" data-testid="attack-road-wolf">Attack road wolf</button>
              <button type="button" data-testid="eat-riverfish">Eat cooked Northwater fish</button>
            </div>

            <div class="label">Wallet</div><div class="skill-line"><span>Coins</span><strong data-testid="wallet-coins">0</strong></div>
            <div class="label">Mining</div><div class="skill-line"><span>Level / XP</span><strong><span data-testid="mining-level">1</span> · <span data-testid="mining-xp">0</span></strong></div>
            <div class="button-stack"><button type="button" data-testid="mine-focused">Focused mine</button><button type="button" data-testid="mine-steady">Steady mine · AFK</button><button type="button" class="button-muted" data-testid="mine-cancel">Cancel gathering</button></div>

            <div class="label">Fishing</div><div class="skill-line"><span>Level / XP</span><strong><span data-testid="fishing-level">1</span> · <span data-testid="fishing-xp">0</span></strong></div>
            <div class="button-stack"><button type="button" data-testid="fish-focused">Focused fish</button><button type="button" data-testid="fish-steady">Steady fish · AFK</button></div>

            <div class="label">Smithing</div><div class="skill-line"><span>Level / XP</span><strong><span data-testid="smithing-level">1</span> · <span data-testid="smithing-xp">0</span></strong></div>
            <div class="button-stack"><button type="button" data-testid="smelt-copper">Smelt copper ore</button><button type="button" data-testid="smith-pickaxe">Smith copper pickaxe</button><button type="button" data-testid="smith-sword">Smith copper sword</button><button type="button" class="button-muted" data-testid="processing-cancel">Cancel processing</button><button type="button" data-testid="equip-pickaxe">Equip copper pickaxe</button><button type="button" data-testid="equip-sword">Equip copper sword</button></div>

            <div class="label">Cooking</div><div class="skill-line"><span>Level / XP</span><strong><span data-testid="cooking-level">1</span> · <span data-testid="cooking-xp">0</span></strong></div>
            <div class="button-stack"><button type="button" data-testid="cook-riverfish">Cook Northwater fish</button></div>

            <div class="label">Bank</div>
            <div class="skill-line"><span>Slots</span><strong data-testid="bank-slots">0 / —</strong></div>
            <div class="skill-line"><span>Copper ore</span><strong data-testid="bank-copper-ore-count">0</strong></div>
            <div class="button-stack"><button type="button" data-testid="bank-deposit-ore">Deposit 1 copper ore</button><button type="button" data-testid="bank-withdraw-ore">Withdraw 1 copper ore</button></div>

            <div class="label">Merchant</div>
            <div class="skill-line"><span>Copper ore buy</span><strong><span data-testid="ore-buy-price">—</span> coins</strong></div>
            <div class="skill-line"><span>Copper ore sell</span><strong><span data-testid="ore-sell-price">—</span> coins</strong></div>
            <div class="button-stack"><button type="button" data-testid="merchant-buy-ore">Buy 1 copper ore</button><button type="button" data-testid="merchant-sell-ore">Sell 1 copper ore</button></div>

            <div class="action-status" data-testid="action-status">Click near a world object before using its action.</div>
            <div class="label">Inventory</div>
            <div class="skill-line"><span>Slots</span><strong data-testid="inventory-slots">0 / —</strong></div>
            <div class="skill-line"><span>Copper ore</span><strong data-testid="copper-ore-count">0</strong></div>
            <div class="skill-line"><span>Copper bars</span><strong data-testid="copper-bar-count">0</strong></div>
            <div class="skill-line"><span>Copper pickaxe</span><strong data-testid="copper-pickaxe-count">0</strong></div>
            <div class="skill-line"><span>Copper sword</span><strong data-testid="copper-sword-count">0</strong></div>
            <div class="skill-line"><span>Reach rat tail</span><strong data-testid="rat-tail-count">0</strong></div>
            <div class="skill-line"><span>Raw Northwater fish</span><strong data-testid="raw-fish-count">0</strong></div>
            <div class="skill-line"><span>Cooked Northwater fish</span><strong data-testid="cooked-fish-count">0</strong></div>
            <div class="skill-line"><span>Fish bones</span><strong data-testid="fish-bones-count">0</strong></div>
            <div class="skill-line"><span>Road wolf pelt</span><strong data-testid="wolf-pelt-count">0</strong></div>
            <div class="skill-line"><span>Waystone fragment</span><strong data-testid="waystone-fragment-count">0</strong></div>
            <div class="label">Equipped tool</div><div data-testid="equipped-tool">None</div>
            <div class="label">World revision</div><div data-testid="world-revision">—</div>
            <div class="label">Build pair</div><div class="build-pair"><span>client <code data-testid="client-build"></code></span><span>server <code data-testid="server-build">—</code></span></div>
          </aside>
        </section>
      </main>`;

    const clientBuild = import.meta.env.VITE_GLYPHREACH_BUILD_SHA || 'dev';
    const wsUrl = import.meta.env.VITE_GLYPHREACH_WS_URL || 'ws://127.0.0.1:8787/world';
    this.requireElement(root, '[data-testid="client-build"]').textContent = clientBuild;
    this.connection = new WorldConnection(
      wsUrl,
      clientBuild,
      (state, detail) => this.updateConnectionStatus(root, state, detail),
      (state) => this.applyWorldState(root, state),
      (state) => this.applyPlayerState(root, state),
      (state) => this.applyCombatWorldState(root, state),
      (state) => this.applyCombatPlayerState(root, state),
      (state) => this.applyQuestState(root, state),
      (state) => this.applyDialogueState(root, state),
      (message) => this.applyActionRejected(root, message),
    );

    this.button(root, 'interact-surveyor', () => this.interactNpc('surveyor-alpha-1'));
    this.button(root, 'interact-sella', () => this.interactNpc('northwatch-cook-alpha-1'));
    this.button(root, 'attack-reach-rat', () => this.attackEnemy('reach_rat'));
    this.button(root, 'attack-road-wolf', () => this.attackEnemy('road_wolf'));
    this.button(root, 'eat-riverfish', () => this.useFood());
    this.button(root, 'mine-focused', () => this.startGathering('copper_vein', 'focused'));
    this.button(root, 'mine-steady', () => this.startGathering('copper_vein', 'steady'));
    this.button(root, 'fish-focused', () => this.startGathering('river_pool', 'focused'));
    this.button(root, 'fish-steady', () => this.startGathering('river_pool', 'steady'));
    this.button(root, 'mine-cancel', () => this.connection?.cancelGathering());
    this.button(root, 'smelt-copper', () => this.startProcessing('furnace', 'smelt_copper'));
    this.button(root, 'smith-pickaxe', () => this.startProcessing('anvil', 'smith_copper_pickaxe'));
    this.button(root, 'smith-sword', () => this.startProcessing('anvil', 'smith_copper_sword'));
    this.button(root, 'cook-riverfish', () => this.startProcessing('campfire', 'cook_riverfish'));
    this.button(root, 'processing-cancel', () => this.connection?.cancelProcessing());
    this.button(root, 'equip-pickaxe', () => this.connection?.equipItem('copper_pickaxe'));
    this.button(root, 'equip-sword', () => this.connection?.equipItem('copper_sword'));
    this.button(root, 'bank-deposit-ore', () => this.bankTransfer('deposit', 'copper_ore'));
    this.button(root, 'bank-withdraw-ore', () => this.bankTransfer('withdraw', 'copper_ore'));
    this.button(root, 'merchant-buy-ore', () => this.merchantTrade('buy', 'copper_ore'));
    this.button(root, 'merchant-sell-ore', () => this.merchantTrade('sell', 'copper_ore'));

    try {
      const welcome = await this.connection.connect(window.localStorage.getItem(RESUME_TOKEN_KEY) || undefined);
      window.localStorage.setItem(RESUME_TOKEN_KEY, welcome.resumeToken);
      this.localPlayerId = welcome.player.id;
      this.resources = welcome.resources;
      this.stations = welcome.stations;
      this.services = welcome.services;
      this.enemies = welcome.enemies;
      this.npcs = welcome.npcs;
      this.quests = welcome.quests;
      this.progress = welcome.progress;
      this.combat = welcome.combat;
      this.requireElement(root, '[data-testid="world-id"]').textContent = welcome.worldId;
      this.requireElement(root, '[data-testid="player-id"]').textContent = welcome.player.id;
      this.requireElement(root, '[data-testid="server-build"]').textContent = welcome.serverBuild;
      this.updatePlayerSummary(root, welcome.players);
      this.renderProgress(root);
      this.renderMerchantPrices(root);
      this.renderCombat(root);
      this.renderQuest(root);
      this.renderDialogue(root);
      await this.worldView.mount(this.requireElement(root, '[data-testid="world-canvas"]'), welcome, (target) => {
        if (this.connection?.moveTarget(target)) this.requireElement(root, '[data-testid="action-status"]').textContent = 'Moving to target…';
      });
      window.addEventListener('keydown', this.onKeyDown);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to enter GlyphReach';
      this.requireElement(root, '[data-testid="world-canvas"]').innerHTML = `<div class="world-error"><strong>World unavailable</strong><span>${escapeHtml(message)}</span></div>`;
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.connection?.close();
    this.worldView.destroy();
    this.root = null;
  }

  private applyWorldState(root: HTMLElement, state: WorldStateMessage): void {
    this.resources = state.resources;
    this.stations = state.stations;
    this.services = state.services;
    this.worldView.updateWorld(state.players, state.resources, state.stations, state.services);
    this.requireElement(root, '[data-testid="world-revision"]').textContent = String(state.revision);
    this.updatePlayerSummary(root, state.players);
    this.renderMerchantPrices(root);
  }

  private applyPlayerState(root: HTMLElement, state: PlayerStateMessage): void {
    this.progress = state.progress;
    this.renderProgress(root);
    this.renderQuest(root);
  }

  private applyCombatWorldState(root: HTMLElement, state: CombatWorldStateMessage): void {
    this.enemies = state.enemies;
    this.worldView.updateEnemies(state.enemies);
    this.renderCombat(root);
    const wolf = state.enemies.find((enemy) => enemy.kind === 'road_wolf');
    const rat = state.enemies.find((enemy) => enemy.kind === 'reach_rat');
    if (wolf && !wolf.alive) this.requireElement(root, '[data-testid="action-status"]').textContent = 'Road wolf defeated · the northern ford is clear for now.';
    else if (rat && !rat.alive) this.requireElement(root, '[data-testid="action-status"]').textContent = 'Reach rat defeated · authoritative drop granted. It will respawn.';
  }

  private applyCombatPlayerState(root: HTMLElement, state: CombatPlayerStateMessage): void {
    this.combat = state.combat;
    this.renderCombat(root);
    if (state.combat.health.dead) this.requireElement(root, '[data-testid="action-status"]').textContent = 'You were defeated. Respawning at the safe point…';
  }

  private applyQuestState(root: HTMLElement, state: QuestStateMessage): void {
    this.quests = state.quests;
    this.renderQuest(root);
  }

  private applyDialogueState(root: HTMLElement, state: DialogueStateMessage): void {
    this.dialogue = state.dialogue;
    this.renderDialogue(root);
  }

  private applyActionRejected(root: HTMLElement, message: ActionRejectedMessage): void {
    const labels: Record<string, string> = {
      invalid_target: 'That target or destination is not valid.',
      too_far: 'Move closer to the required world object first.',
      node_unavailable: 'That resource is unavailable. Give it a moment.',
      inventory_full: 'Your inventory is full.',
      already_busy: 'Finish or cancel the current activity first.',
      not_gathering: 'There is no gathering action to cancel.',
      not_processing: 'There is no processing action to cancel.',
      invalid_recipe: 'That recipe is not available.',
      wrong_station: 'That recipe needs a different station.',
      missing_items: 'You do not have the required materials or quest proof.',
      item_not_owned: 'You do not have enough of that item in your inventory.',
      invalid_equipment: 'That item cannot be used there.',
      invalid_service: 'That world service is not available.',
      invalid_quantity: 'That quantity is not allowed.',
      bank_full: 'Your bank has no room for that item.',
      bank_missing_item: 'Your bank does not contain enough of that item.',
      insufficient_coins: 'You do not have enough coins.',
      item_not_traded: 'This merchant does not trade that item.',
      transaction_failed: 'The transaction could not be completed.',
      target_dead: 'That enemy is already defeated.',
      player_dead: 'You cannot act until you respawn.',
      cooldown: 'Your next attack is not ready yet.',
      invalid_npc: 'That NPC is not available.',
      conversation_not_open: 'Talk to that NPC before choosing a response.',
      invalid_choice: 'That response is not valid for the current conversation.',
      quest_not_ready: 'The quest objectives are not ready to turn in yet.',
      quest_already_completed: 'That quest has already been completed and rewarded.',
      full_health: 'You are already at full health.',
      route_locked: 'The northern road is still closed. Finish The Silent Bell first.',
    };
    this.requireElement(root, '[data-testid="action-status"]').textContent = labels[message.reason] ?? `Action rejected: ${message.reason}`;
  }

  private updatePlayerSummary(root: HTMLElement, players: PlayerSnapshot[]): void {
    this.requireElement(root, '[data-testid="player-count"]').textContent = String(players.length);
    const local = players.find((player) => player.id === this.localPlayerId);
    if (local) this.requireElement(root, '[data-testid="local-position"]').textContent = `${Math.round(local.position.x)}, ${Math.round(local.position.y)}`;
  }

  private renderQuest(root: HTMLElement): void {
    const silentBell = this.quests.find((candidate) => candidate.questId === 'first-fieldwork-alpha');
    if (silentBell) {
      this.requireElement(root, '[data-testid="quest-title"]').textContent = silentBell.title;
      this.requireElement(root, '[data-testid="quest-status"]').textContent = statusLabel(silentBell, 'Surveyor');
      this.requireElement(root, '[data-testid="quest-mine-status"]').textContent = objectiveLabel(silentBell, 'mine_copper');
      this.requireElement(root, '[data-testid="quest-forge-status"]').textContent = objectiveLabel(silentBell, 'forge_blade');
      this.requireElement(root, '[data-testid="quest-rat-status"]').textContent = objectiveLabel(silentBell, 'defeat_rat');
      this.requireElement(root, '[data-testid="quest-proof-status"]').textContent = objectiveLabel(silentBell, 'bring_proof', 'Ready');
    }

    const north = this.quests.find((candidate) => candidate.questId === 'north-road-provisions-alpha');
    if (!north) {
      this.requireElement(root, '[data-testid="north-quest-status"]').textContent = 'Locked';
      for (const id of ['north-quest-fish-status', 'north-quest-cook-status', 'north-quest-wolf-status', 'north-quest-proof-status']) this.requireElement(root, `[data-testid="${id}"]`).textContent = '—';
      return;
    }
    this.requireElement(root, '[data-testid="north-quest-title"]').textContent = north.title;
    this.requireElement(root, '[data-testid="north-quest-status"]').textContent = statusLabel(north, 'Cook Sella');
    this.requireElement(root, '[data-testid="north-quest-fish-status"]').textContent = objectiveLabel(north, 'catch_supper');
    this.requireElement(root, '[data-testid="north-quest-cook-status"]').textContent = objectiveLabel(north, 'cook_supper');
    this.requireElement(root, '[data-testid="north-quest-wolf-status"]').textContent = objectiveLabel(north, 'clear_ford');
    this.requireElement(root, '[data-testid="north-quest-proof-status"]').textContent = objectiveLabel(north, 'bring_supper', 'Ready');
  }

  private renderDialogue(root: HTMLElement): void {
    const panel = this.requireElement(root, '[data-testid="dialogue-panel"]');
    const choices = this.requireElement(root, '[data-testid="dialogue-choices"]');
    if (!this.dialogue) {
      panel.hidden = true;
      choices.replaceChildren();
      return;
    }
    panel.hidden = false;
    this.requireElement(root, '[data-testid="dialogue-speaker"]').textContent = this.dialogue.speaker;
    this.requireElement(root, '[data-testid="dialogue-text"]').textContent = this.dialogue.text;
    choices.replaceChildren(...this.dialogue.choices.map((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = choice.label;
      button.dataset.testid = `dialogue-choice-${choice.id}`;
      button.addEventListener('click', () => this.chooseDialogue(choice.id));
      return button;
    }));
  }

  private renderProgress(root: HTMLElement): void {
    const progress = this.progress;
    if (!progress) return;
    this.requireElement(root, '[data-testid="wallet-coins"]').textContent = String(progress.wallet.coins);
    this.requireElement(root, '[data-testid="mining-level"]').textContent = String(progress.skills.mining.level);
    this.requireElement(root, '[data-testid="mining-xp"]').textContent = String(progress.skills.mining.xp);
    this.requireElement(root, '[data-testid="smithing-level"]').textContent = String(progress.skills.smithing.level);
    this.requireElement(root, '[data-testid="smithing-xp"]').textContent = String(progress.skills.smithing.xp);
    this.requireElement(root, '[data-testid="fishing-level"]').textContent = String(progress.skills.fishing.level);
    this.requireElement(root, '[data-testid="fishing-xp"]').textContent = String(progress.skills.fishing.xp);
    this.requireElement(root, '[data-testid="cooking-level"]').textContent = String(progress.skills.cooking.level);
    this.requireElement(root, '[data-testid="cooking-xp"]').textContent = String(progress.skills.cooking.xp);
    this.requireElement(root, '[data-testid="north-road-status"]').textContent = progress.worldFlags.northernRoadOpen ? 'Open' : 'Closed';
    const discovered = progress.discoveries.includes('weathered-waystone-alpha-1');
    this.requireElement(root, '[data-testid="waystone-status"]').textContent = discovered ? 'Found' : progress.worldFlags.northernRoadOpen ? 'Uncharted' : 'Beyond closed road';
    this.worldView.updateChapterState(progress.worldFlags.northernRoadOpen, progress.discoveries);

    const inventory = progress.inventory.slots;
    this.requireElement(root, '[data-testid="inventory-slots"]').textContent = `${inventory.length} / ${progress.inventory.capacity}`;
    const inventoryIds: Record<string, string> = {
      'copper-ore-count': 'copper_ore',
      'copper-bar-count': 'copper_bar',
      'copper-pickaxe-count': 'copper_pickaxe',
      'copper-sword-count': 'copper_sword',
      'rat-tail-count': 'reach_rat_tail',
      'raw-fish-count': 'raw_riverfish',
      'cooked-fish-count': 'cooked_riverfish',
      'fish-bones-count': 'fish_bones',
      'wolf-pelt-count': 'road_wolf_pelt',
      'waystone-fragment-count': 'waystone_fragment',
    };
    for (const [testId, itemId] of Object.entries(inventoryIds)) this.requireElement(root, `[data-testid="${testId}"]`).textContent = String(this.itemCount(inventory, itemId));

    this.requireElement(root, '[data-testid="bank-slots"]').textContent = `${progress.bank.slots.length} / ${progress.bank.capacity}`;
    this.requireElement(root, '[data-testid="bank-copper-ore-count"]').textContent = String(this.itemCount(progress.bank.slots, 'copper_ore'));
    this.requireElement(root, '[data-testid="equipped-tool"]').textContent = progress.equipment.toolItemId === 'copper_pickaxe' ? 'Copper pickaxe' : 'None';

    if (progress.processing) {
      const label = progress.processing.recipeId === 'smelt_copper'
        ? 'Smelting copper…'
        : progress.processing.recipeId === 'smith_copper_sword'
          ? 'Smithing copper sword…'
          : progress.processing.recipeId === 'cook_riverfish'
            ? 'Cooking Northwater fish…'
            : 'Smithing copper pickaxe…';
      this.requireElement(root, '[data-testid="action-status"]').textContent = label;
    } else if (progress.gathering) {
      const resource = this.resources.find((candidate) => candidate.id === progress.gathering?.nodeId);
      const activity = resource?.kind === 'river_pool' ? 'Fishing' : 'Mining';
      this.requireElement(root, '[data-testid="action-status"]').textContent = progress.gathering.mode === 'steady'
        ? `Steady ${activity} active · continues automatically.`
        : `Focused ${activity}…`;
    }
  }

  private renderCombat(root: HTMLElement): void {
    const combat = this.combat;
    if (combat) {
      this.requireElement(root, '[data-testid="combat-health"]').textContent = `${combat.health.current} / ${combat.health.max}`;
      this.requireElement(root, '[data-testid="combat-level"]').textContent = String(combat.skill.level);
      this.requireElement(root, '[data-testid="combat-xp"]').textContent = String(combat.skill.xp);
      this.requireElement(root, '[data-testid="equipped-weapon"]').textContent = combat.equipment.weaponItemId === 'copper_sword' ? 'Copper sword' : 'None';
    }
    const rat = this.enemies.find((enemy) => enemy.kind === 'reach_rat');
    const wolf = this.enemies.find((enemy) => enemy.kind === 'road_wolf');
    this.requireElement(root, '[data-testid="rat-health"]').textContent = enemyHealthLabel(rat);
    this.requireElement(root, '[data-testid="wolf-health"]').textContent = enemyHealthLabel(wolf);
  }

  private renderMerchantPrices(root: HTMLElement): void {
    const merchant = this.services.find((service): service is Extract<ServiceSnapshot, { kind: 'merchant' }> => service.kind === 'merchant');
    const ore = merchant?.offers.find((offer) => offer.itemId === 'copper_ore');
    this.requireElement(root, '[data-testid="ore-buy-price"]').textContent = ore ? String(ore.buyPrice) : '—';
    this.requireElement(root, '[data-testid="ore-sell-price"]').textContent = ore ? String(ore.sellPrice) : '—';
  }

  private itemCount(slots: Array<{ itemId: string; quantity: number }>, itemId: string): number {
    return slots.filter((slot) => slot.itemId === itemId).reduce((total, slot) => total + slot.quantity, 0);
  }

  private interactNpc(id: string): void {
    const npc = this.npcs.find((candidate) => candidate.id === id);
    if (!npc || !this.connection || !this.root) return;
    if (this.connection.interactNpc(npc.id)) this.requireElement(this.root, '[data-testid="action-status"]').textContent = `Talking to ${npc.displayName}…`;
  }

  private chooseDialogue(choiceId: string): void {
    if (!this.dialogue || !this.connection || !this.root) return;
    if (this.connection.dialogueChoice(this.dialogue.npcId, choiceId)) this.requireElement(this.root, '[data-testid="action-status"]').textContent = 'Sending response…';
  }

  private attackEnemy(kind: EnemySnapshot['kind']): void {
    const enemy = this.enemies.find((candidate) => candidate.kind === kind);
    if (!enemy || !this.connection || !this.root) return;
    if (this.connection.attackTarget(enemy.id)) this.requireElement(this.root, '[data-testid="action-status"]').textContent = kind === 'road_wolf' ? 'Attacking road wolf…' : 'Attacking Reach rat…';
  }

  private useFood(): void {
    if (!this.connection || !this.root) return;
    if (this.connection.useItem('cooked_riverfish')) this.requireElement(this.root, '[data-testid="action-status"]').textContent = 'Eating Northwater fish…';
  }

  private startGathering(kind: ResourceNodeSnapshot['kind'], mode: GatheringMode): void {
    const node = this.resources.find((resource) => resource.kind === kind);
    if (!node || !this.connection || !this.root) return;
    if (this.connection.startGathering(node.id, mode)) {
      const activity = kind === 'river_pool' ? 'Fishing' : 'Mining';
      this.requireElement(this.root, '[data-testid="action-status"]').textContent = `Starting ${mode === 'steady' ? 'steady' : 'focused'} ${activity}…`;
    }
  }

  private startProcessing(kind: StationKind, recipeId: string): void {
    const station = this.stations.find((candidate) => candidate.kind === kind);
    if (!station || !this.connection || !this.root) return;
    if (this.connection.startProcessing(station.id, recipeId)) {
      const label = recipeId === 'smelt_copper'
        ? 'Starting smelt…'
        : recipeId === 'smith_copper_sword'
          ? 'Starting sword smithing…'
          : recipeId === 'cook_riverfish'
            ? 'Starting cooking…'
            : 'Starting pickaxe smithing…';
      this.requireElement(this.root, '[data-testid="action-status"]').textContent = label;
    }
  }

  private bankTransfer(direction: 'deposit' | 'withdraw', itemId: string): void {
    const bank = this.services.find((service) => service.kind === 'bank');
    if (!bank || !this.connection || !this.root) return;
    const sent = direction === 'deposit' ? this.connection.bankDeposit(bank.id, itemId, 1) : this.connection.bankWithdraw(bank.id, itemId, 1);
    if (sent) this.requireElement(this.root, '[data-testid="action-status"]').textContent = direction === 'deposit' ? 'Depositing into bank…' : 'Withdrawing from bank…';
  }

  private merchantTrade(direction: 'buy' | 'sell', itemId: string): void {
    const merchant = this.services.find((service) => service.kind === 'merchant');
    if (!merchant || !this.connection || !this.root) return;
    const sent = direction === 'buy' ? this.connection.merchantBuy(merchant.id, itemId, 1) : this.connection.merchantSell(merchant.id, itemId, 1);
    if (sent) this.requireElement(this.root, '[data-testid="action-status"]').textContent = direction === 'buy' ? 'Buying from merchant…' : 'Selling to merchant…';
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const direction = directionForKey(event.key);
    if (!direction) return;
    event.preventDefault();
    this.connection?.move(direction.dx, direction.dy);
  }

  private updateConnectionStatus(root: HTMLElement, state: ConnectionState, detail?: string): void {
    const element = this.requireElement(root, '[data-testid="connection-status"]');
    element.dataset.state = state;
    const labels: Record<ConnectionState, string> = {
      connecting: 'Connecting…',
      connected: 'Connected',
      rejected: 'Rejected',
      disconnected: 'Disconnected',
      error: 'Connection error',
    };
    element.textContent = detail ? `${labels[state]} · ${detail}` : labels[state];
  }

  private button(root: HTMLElement, testId: string, handler: () => void): void {
    this.requireElement(root, `[data-testid="${testId}"]`).addEventListener('click', handler);
  }

  private requireElement(root: HTMLElement, selector: string): HTMLElement {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing app element: ${selector}`);
    return element;
  }
}

function statusLabel(quest: QuestJournalSnapshot, returnNpc: string): string {
  if (quest.status === 'completed') return 'Completed';
  if (quest.status === 'not_started') return 'Available';
  return quest.stage === 'return' ? `Return to ${returnNpc}` : 'Active';
}

function objectiveLabel(quest: QuestJournalSnapshot, id: string, completedLabel = 'Done'): string {
  return quest.objectives.find((candidate) => candidate.id === id)?.complete ? completedLabel : 'Pending';
}

function enemyHealthLabel(enemy: EnemySnapshot | undefined): string {
  if (!enemy) return '—';
  return enemy.alive ? `${enemy.health} / ${enemy.maxHealth}` : 'Defeated';
}

function directionForKey(key: string): { dx: -1 | 0 | 1; dy: -1 | 0 | 1 } | null {
  switch (key.toLowerCase()) {
    case 'a':
    case 'arrowleft': return { dx: -1, dy: 0 };
    case 'd':
    case 'arrowright': return { dx: 1, dy: 0 };
    case 'w':
    case 'arrowup': return { dx: 0, dy: -1 };
    case 's':
    case 'arrowdown': return { dx: 0, dy: 1 };
    default: return null;
  }
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}
