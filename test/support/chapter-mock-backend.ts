import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

const port = Number(process.env.MOCK_BACKEND_PORT ?? 8787);
const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 600 };
const resources = [
  { id: 'copper-vein-alpha-1', kind: 'copper_vein' as const, position: { x: 760, y: 300 }, available: true, respawnAt: null as number | null },
  { id: 'northwater-pool-alpha-1', kind: 'river_pool' as const, position: { x: 825, y: 105 }, available: true, respawnAt: null as number | null },
];
const stations = [
  { id: 'furnace-alpha-1', kind: 'furnace' as const, position: { x: 570, y: 155 } },
  { id: 'anvil-alpha-1', kind: 'anvil' as const, position: { x: 570, y: 445 } },
  { id: 'north-campfire-alpha-1', kind: 'campfire' as const, position: { x: 735, y: 105 } },
];
const services = [
  { id: 'bank-alpha-1', kind: 'bank' as const, position: { x: 300, y: 180 } },
  { id: 'merchant-alpha-1', kind: 'merchant' as const, position: { x: 300, y: 420 }, offers: [
    { itemId: 'copper_ore', buyPrice: 4, sellPrice: 2 },
    { itemId: 'copper_bar', buyPrice: 9, sellPrice: 3 },
    { itemId: 'copper_pickaxe', buyPrice: 22, sellPrice: 7 },
    { itemId: 'copper_sword', buyPrice: 24, sellPrice: 8 },
    { itemId: 'raw_riverfish', buyPrice: 12, sellPrice: 2 },
    { itemId: 'cooked_riverfish', buyPrice: 20, sellPrice: 5 },
  ] },
];
const npcs = [
  { id: 'surveyor-alpha-1', displayName: 'Surveyor Rhea', position: { x: 515, y: 345 } },
  { id: 'northwatch-cook-alpha-1', displayName: 'Cook Sella', position: { x: 700, y: 105 } },
];
const enemyDefinitions = {
  'reach-rat-alpha-1': { id: 'reach-rat-alpha-1', kind: 'reach_rat' as const, position: { x: 820, y: 470 }, maxHealth: 14, retaliation: 5, xp: 12, coins: 3, drop: 'reach_rat_tail' },
  'road-wolf-alpha-1': { id: 'road-wolf-alpha-1', kind: 'road_wolf' as const, position: { x: 900, y: 135 }, maxHealth: 24, retaliation: 7, xp: 22, coins: 6, drop: 'road_wolf_pelt' },
};
const enemies = new Map(Object.values(enemyDefinitions).map((definition) => [definition.id, { ...definition, health: definition.maxHealth, alive: true, respawnAt: null as number | null }]));

interface Position { x: number; y: number; }
interface Slot { slot: number; itemId: string; quantity: number; }
interface Skill { xp: number; level: number; }
interface Progress {
  inventory: { capacity: number; slots: Slot[] };
  bank: { capacity: number; slots: Slot[] };
  wallet: { coins: number };
  equipment: { toolItemId: string | null };
  skills: { mining: Skill; smithing: Skill; fishing: Skill; cooking: Skill };
  gathering: null | { nodeId: string; mode: 'focused' | 'steady'; startedAt: number; completesAt: number };
  processing: null | { stationId: string; recipeId: string; startedAt: number; completesAt: number };
  worldFlags: { northernRoadOpen: boolean };
  discoveries: string[];
}
interface Combat {
  health: { current: number; max: number; dead: boolean; respawnAt: number | null };
  skill: Skill;
  equipment: { weaponItemId: string | null };
}
interface QuestState {
  status: 'not_started' | 'active' | 'completed';
  stage: 'available' | 'fieldwork' | 'return' | 'completed';
  minedCopper: boolean;
  killedRat: boolean;
  rewardClaimed: boolean;
}
interface NorthQuestState {
  status: 'not_started' | 'active' | 'completed';
  stage: 'available' | 'fieldwork' | 'return' | 'completed';
  fishCaught: number;
  fishCooked: number;
  killedWolf: boolean;
  rewardClaimed: boolean;
}
interface Player {
  id: string;
  resumeToken: string;
  position: Position;
  progressRevision: number;
  combatRevision: number;
  questRevision: number;
  dialogueRevision: number;
  progress: Progress;
  combat: Combat;
  quest: QuestState;
  northQuest: NorthQuestState;
  activeNpcId: string | null;
  lastAttackAt: number;
}

type RecordMessage = Record<string, unknown>;
let revision = 0;
let combatRevision = 0;
let playerNumber = 0;
const players = new Map<WebSocket, Player>();

const server = createServer((request, response) => {
  if (request.url === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  response.writeHead(404).end();
});
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 16 * 1024 });
server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/world') { socket.destroy(); return; }
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
});

wss.on('connection', (socket) => {
  socket.once('message', (data, isBinary) => {
    if (isBinary) return socket.close(1002, 'text only');
    const hello = parseRecord(data.toString());
    if (!hello || hello.type !== 'HELLO' || hello.protocolVersion !== 1) {
      socket.send(JSON.stringify({ type: 'REJECT', reason: 'protocol_mismatch', supportedProtocolVersion: 1 }));
      socket.close(1002, 'protocol mismatch');
      return;
    }

    playerNumber += 1;
    const chapterSeed = hello.resumeToken === 'm8-north-test';
    const player = createPlayer(chapterSeed);
    players.set(socket, player);
    revision += 1;
    socket.send(JSON.stringify(welcome(player)), () => {
      broadcast();
      broadcastCombat();
    });

    socket.on('message', (nextData, nextIsBinary) => {
      if (nextIsBinary) return;
      const message = parseRecord(nextData.toString());
      if (!message) return;
      if (player.combat.health.dead) {
        reject(socket, actionCategory(String(message.type)), 'player_dead');
        return;
      }
      handleAction(socket, player, message);
    });
  });

  socket.on('close', () => {
    if (!players.delete(socket)) return;
    revision += 1;
    broadcast();
  });
});

server.listen(port, '127.0.0.1');

function createPlayer(chapterSeed: boolean): Player {
  const progress = emptyProgress();
  const combat = emptyCombat();
  const quest = emptyQuest();
  const northQuest = emptyNorthQuest();
  if (chapterSeed) {
    progress.wallet.coins = 18;
    progress.worldFlags.northernRoadOpen = true;
    combat.equipment.weaponItemId = 'copper_sword';
    quest.status = 'completed';
    quest.stage = 'completed';
    quest.minedCopper = true;
    quest.killedRat = true;
    quest.rewardClaimed = true;
  }
  return {
    id: `test-player-${playerNumber}`,
    resumeToken: chapterSeed ? 'm8-north-test' : randomUUID(),
    position: chapterSeed ? { x: 650, y: 105 } : { x: 380 + playerNumber * 80, y: 300 },
    progressRevision: 0,
    combatRevision: 0,
    questRevision: 0,
    dialogueRevision: 0,
    progress,
    combat,
    quest,
    northQuest,
    activeNpcId: null,
    lastAttackAt: 0,
  };
}

function welcome(player: Player) {
  return {
    type: 'WELCOME', protocolVersion: 1, serverBuild: 'mock-server', connectionId: randomUUID(), resumeToken: player.resumeToken, worldId: 'alpha-1',
    player: snapshot(player), players: snapshots(), resources: resourceSnapshots(), stations, services, npcs,
    progress: player.progress, enemies: enemySnapshots(), combat: player.combat, quests: questSnapshots(player), world: { bounds },
  };
}

function handleAction(socket: WebSocket, player: Player, message: RecordMessage): void {
  if (message.type === 'MOVE_INTENT') return moveIntent(player, message);
  if (message.type === 'MOVE_TARGET') return moveTarget(player, message);
  if (message.type === 'INTERACT_NPC') return interactNpc(socket, player, message);
  if (message.type === 'DIALOGUE_CHOICE') return dialogueChoice(socket, player, message);
  if (message.type === 'START_GATHERING') return startGathering(socket, player, message);
  if (message.type === 'CANCEL_GATHERING') { player.progress.gathering = null; sendPlayerState(socket, player); return; }
  if (message.type === 'START_PROCESSING') return startProcessing(socket, player, message);
  if (message.type === 'CANCEL_PROCESSING') { player.progress.processing = null; sendPlayerState(socket, player); return; }
  if (message.type === 'EQUIP_ITEM') return equipItem(socket, player, message);
  if (message.type === 'USE_ITEM') return useItem(socket, player, message);
  if (message.type === 'BANK_DEPOSIT' || message.type === 'BANK_WITHDRAW') return bankAction(socket, player, message);
  if (message.type === 'MERCHANT_BUY' || message.type === 'MERCHANT_SELL') return merchantAction(socket, player, message);
  if (message.type === 'ATTACK_TARGET') return attack(socket, player, message);
}

function moveIntent(player: Player, message: RecordMessage): void {
  const dx = Number(message.dx);
  const dy = Number(message.dy);
  if (![-1, 0, 1].includes(dx) || ![-1, 0, 1].includes(dy) || (dx === 0 && dy === 0)) return;
  const magnitude = Math.hypot(dx, dy);
  player.position.x = clamp(player.position.x + (dx / magnitude) * 28, bounds.minX, bounds.maxX);
  player.position.y = clamp(player.position.y + (dy / magnitude) * 28, bounds.minY, bounds.maxY);
  discoverIfNeeded(player);
  revision += 1;
  broadcast();
}

function moveTarget(player: Player, message: RecordMessage): void {
  const target = message.target as { x?: unknown; y?: unknown } | undefined;
  if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') return;
  if (target.x < bounds.minX || target.x > bounds.maxX || target.y < bounds.minY || target.y > bounds.maxY) return;
  player.position = { x: target.x, y: target.y };
  discoverIfNeeded(player);
  revision += 1;
  broadcast();
  const socket = socketFor(player);
  if (socket) sendPlayerState(socket, player);
}

function interactNpc(socket: WebSocket, player: Player, message: RecordMessage): void {
  const npc = npcs.find((candidate) => candidate.id === message.targetId);
  if (!npc) { reject(socket, 'quest', 'invalid_npc'); return; }
  if (distance(player.position, npc.position) > 82) { reject(socket, 'quest', 'too_far'); return; }
  player.activeNpcId = npc.id;
  syncQuests(player);
  sendQuestState(socket, player);
  sendDialogueState(socket, player, dialogueFor(player, npc.id));
}

function dialogueChoice(socket: WebSocket, player: Player, message: RecordMessage): void {
  const npcId = String(message.npcId);
  if (npcId !== player.activeNpcId) { reject(socket, 'quest', 'conversation_not_open'); return; }
  const npc = npcs.find((candidate) => candidate.id === npcId);
  if (!npc) { reject(socket, 'quest', 'invalid_npc'); return; }
  if (distance(player.position, npc.position) > 82) { reject(socket, 'quest', 'too_far'); return; }
  const choice = String(message.choiceId);
  if (choice === 'close') { player.activeNpcId = null; sendDialogueState(socket, player, null); return; }

  if (choice === 'accept_first_fieldwork' || choice === 'accept_first_fieldwork_dry') {
    if (player.quest.status !== 'not_started') { reject(socket, 'quest', player.quest.status === 'completed' ? 'quest_already_completed' : 'invalid_choice'); return; }
    player.quest.status = 'active';
    player.quest.stage = 'fieldwork';
    sendQuestState(socket, player);
    sendDialogueState(socket, player, dialogueFor(player, npcId));
    return;
  }
  if (choice === 'turn_in_first_fieldwork') {
    syncQuests(player);
    if (player.quest.status === 'completed') { reject(socket, 'quest', 'quest_already_completed'); return; }
    if (player.quest.stage !== 'return' || player.combat.equipment.weaponItemId !== 'copper_sword') { reject(socket, 'quest', 'quest_not_ready'); return; }
    if (!consume(player.progress.inventory.slots, 'reach_rat_tail', 1)) { reject(socket, 'quest', 'missing_items'); return; }
    player.progress.wallet.coins += 18;
    player.quest.status = 'completed';
    player.quest.stage = 'completed';
    player.quest.rewardClaimed = true;
    player.progress.worldFlags.northernRoadOpen = true;
    sendQuestState(socket, player);
    sendPlayerState(socket, player);
    sendDialogueState(socket, player, dialogueFor(player, npcId));
    return;
  }

  if (choice === 'accept_north_road' || choice === 'accept_north_road_dry') {
    if (player.quest.status !== 'completed') { reject(socket, 'quest', 'route_locked'); return; }
    if (player.northQuest.status !== 'not_started') { reject(socket, 'quest', player.northQuest.status === 'completed' ? 'quest_already_completed' : 'invalid_choice'); return; }
    player.northQuest.status = 'active';
    player.northQuest.stage = 'fieldwork';
    sendQuestState(socket, player);
    sendDialogueState(socket, player, dialogueFor(player, npcId));
    return;
  }
  if (choice === 'turn_in_north_road') {
    syncQuests(player);
    if (player.northQuest.status === 'completed') { reject(socket, 'quest', 'quest_already_completed'); return; }
    if (player.northQuest.stage !== 'return') { reject(socket, 'quest', 'quest_not_ready'); return; }
    if (itemCount(player.progress.inventory.slots, 'cooked_riverfish') < 1 || itemCount(player.progress.inventory.slots, 'road_wolf_pelt') < 1) { reject(socket, 'quest', 'missing_items'); return; }
    consume(player.progress.inventory.slots, 'cooked_riverfish', 1);
    consume(player.progress.inventory.slots, 'road_wolf_pelt', 1);
    player.progress.wallet.coins += 24;
    player.northQuest.status = 'completed';
    player.northQuest.stage = 'completed';
    player.northQuest.rewardClaimed = true;
    sendQuestState(socket, player);
    sendPlayerState(socket, player);
    sendDialogueState(socket, player, dialogueFor(player, npcId));
    return;
  }
  reject(socket, 'quest', 'invalid_choice');
}

function startGathering(socket: WebSocket, player: Player, message: RecordMessage): void {
  const node = resources.find((candidate) => candidate.id === message.nodeId);
  if (!node) { reject(socket, 'gathering', 'node_unavailable'); return; }
  if (node.kind === 'river_pool' && !player.progress.worldFlags.northernRoadOpen) { reject(socket, 'gathering', 'route_locked'); return; }
  if (distance(player.position, node.position) > 86) { reject(socket, 'gathering', 'too_far'); return; }
  if (!node.available) { reject(socket, 'gathering', 'node_unavailable'); return; }
  const mode = message.mode === 'steady' ? 'steady' : 'focused';
  const now = Date.now();
  player.progress.gathering = { nodeId: node.id, mode, startedAt: now, completesAt: now + 100 };
  sendPlayerState(socket, player);
  setTimeout(() => {
    if (!players.has(socket) || !node.available || player.combat.health.dead) return;
    node.available = false;
    node.respawnAt = Date.now() + 120;
    if (node.kind === 'river_pool') {
      addItem(player.progress.inventory.slots, 'raw_riverfish', 1, 10);
      player.progress.skills.fishing.xp += mode === 'steady' ? 5 : 10;
      if (player.northQuest.status === 'active') player.northQuest.fishCaught += 1;
    } else {
      addItem(player.progress.inventory.slots, 'copper_ore', 1, 1);
      player.progress.skills.mining.xp += mode === 'steady' ? 7 : 12;
      if (player.quest.status === 'active') player.quest.minedCopper = true;
    }
    player.progress.gathering = null;
    syncQuests(player);
    sendQuestState(socket, player);
    sendPlayerState(socket, player);
    revision += 1;
    broadcast();
    setTimeout(() => {
      node.available = true;
      node.respawnAt = null;
      revision += 1;
      broadcast();
    }, 120);
  }, 100);
}

function startProcessing(socket: WebSocket, player: Player, message: RecordMessage): void {
  const station = stations.find((candidate) => candidate.id === message.stationId);
  if (!station) { reject(socket, 'processing', 'wrong_station'); return; }
  if (distance(player.position, station.position) > 86) { reject(socket, 'processing', 'too_far'); return; }
  const recipeId = String(message.recipeId);
  if (recipeId === 'cook_riverfish' && !player.progress.worldFlags.northernRoadOpen) { reject(socket, 'processing', 'route_locked'); return; }
  const now = Date.now();
  player.progress.processing = { stationId: station.id, recipeId, startedAt: now, completesAt: now + 100 };
  sendPlayerState(socket, player);
  setTimeout(() => {
    if (!players.has(socket) || player.combat.health.dead) return;
    let completed = false;
    if (recipeId === 'smelt_copper' && consume(player.progress.inventory.slots, 'copper_ore', 1)) {
      addItem(player.progress.inventory.slots, 'copper_bar', 1, 1);
      player.progress.skills.smithing.xp += 6;
      completed = true;
    } else if (recipeId === 'smith_copper_pickaxe' && consume(player.progress.inventory.slots, 'copper_bar', 2)) {
      addItem(player.progress.inventory.slots, 'copper_pickaxe', 1, 1);
      player.progress.skills.smithing.xp += 16;
      completed = true;
    } else if (recipeId === 'smith_copper_sword' && consume(player.progress.inventory.slots, 'copper_bar', 2)) {
      addItem(player.progress.inventory.slots, 'copper_sword', 1, 1);
      player.progress.skills.smithing.xp += 16;
      completed = true;
    } else if (recipeId === 'cook_riverfish' && consume(player.progress.inventory.slots, 'raw_riverfish', 1)) {
      addItem(player.progress.inventory.slots, 'cooked_riverfish', 1, 10);
      player.progress.skills.cooking.xp += 8;
      if (player.northQuest.status === 'active') player.northQuest.fishCooked += 1;
      completed = true;
    }
    player.progress.processing = null;
    if (!completed) reject(socket, 'processing', 'missing_items');
    syncQuests(player);
    sendQuestState(socket, player);
    sendPlayerState(socket, player);
  }, 100);
}

function equipItem(socket: WebSocket, player: Player, message: RecordMessage): void {
  const itemId = String(message.itemId);
  if (!consume(player.progress.inventory.slots, itemId, 1)) { reject(socket, 'equipment', 'item_not_owned'); return; }
  if (itemId === 'copper_sword') {
    player.combat.equipment.weaponItemId = itemId;
    sendCombatPlayerState(socket, player);
  } else if (itemId === 'copper_pickaxe') {
    player.progress.equipment.toolItemId = itemId;
  } else {
    reject(socket, 'equipment', 'invalid_equipment');
    return;
  }
  syncQuests(player);
  sendQuestState(socket, player);
  sendPlayerState(socket, player);
}

function useItem(socket: WebSocket, player: Player, message: RecordMessage): void {
  const itemId = String(message.itemId);
  if (itemId !== 'cooked_riverfish') { reject(socket, 'consumable', 'invalid_equipment'); return; }
  if (player.combat.health.current >= player.combat.health.max) { reject(socket, 'consumable', 'full_health'); return; }
  if (!consume(player.progress.inventory.slots, itemId, 1)) { reject(socket, 'consumable', 'item_not_owned'); return; }
  addItem(player.progress.inventory.slots, 'fish_bones', 1, 20);
  player.combat.health.current = Math.min(player.combat.health.max, player.combat.health.current + 7);
  sendPlayerState(socket, player);
  sendCombatPlayerState(socket, player);
}

function bankAction(socket: WebSocket, player: Player, message: RecordMessage): void {
  const bank = services.find((service) => service.kind === 'bank' && service.id === message.serviceId);
  if (!bank) { reject(socket, 'bank', 'invalid_service'); return; }
  if (distance(player.position, bank.position) > 86) { reject(socket, 'bank', 'too_far'); return; }
  const itemId = String(message.itemId);
  const quantity = Number(message.quantity);
  const source = message.type === 'BANK_DEPOSIT' ? player.progress.inventory.slots : player.progress.bank.slots;
  const destination = message.type === 'BANK_DEPOSIT' ? player.progress.bank.slots : player.progress.inventory.slots;
  if (!consume(source, itemId, quantity)) { reject(socket, 'bank', message.type === 'BANK_DEPOSIT' ? 'item_not_owned' : 'bank_missing_item'); return; }
  addItem(destination, itemId, quantity, stackLimitFor(itemId));
  sendPlayerState(socket, player);
}

function merchantAction(socket: WebSocket, player: Player, message: RecordMessage): void {
  const merchant = services.find((service) => service.kind === 'merchant' && service.id === message.serviceId);
  if (!merchant || merchant.kind !== 'merchant') { reject(socket, 'merchant', 'invalid_service'); return; }
  if (distance(player.position, merchant.position) > 86) { reject(socket, 'merchant', 'too_far'); return; }
  const itemId = String(message.itemId);
  const quantity = Number(message.quantity);
  const offer = merchant.offers.find((candidate) => candidate.itemId === itemId);
  if (!offer) { reject(socket, 'merchant', 'item_not_traded'); return; }
  if (message.type === 'MERCHANT_BUY') {
    const total = offer.buyPrice * quantity;
    if (player.progress.wallet.coins < total) { reject(socket, 'merchant', 'insufficient_coins'); return; }
    player.progress.wallet.coins -= total;
    addItem(player.progress.inventory.slots, itemId, quantity, stackLimitFor(itemId));
  } else {
    if (!consume(player.progress.inventory.slots, itemId, quantity)) { reject(socket, 'merchant', 'item_not_owned'); return; }
    player.progress.wallet.coins += offer.sellPrice * quantity;
  }
  sendPlayerState(socket, player);
}

function attack(socket: WebSocket, player: Player, message: RecordMessage): void {
  const targetId = String(message.targetId);
  const enemy = enemies.get(targetId);
  const definition = enemyDefinitions[targetId as keyof typeof enemyDefinitions];
  if (!enemy || !definition) { reject(socket, 'combat', 'invalid_target'); return; }
  if (!enemy.alive) { reject(socket, 'combat', 'target_dead'); return; }
  if (distance(player.position, enemy.position) > 82) { reject(socket, 'combat', 'too_far'); return; }
  const now = Date.now();
  if (now - player.lastAttackAt < 90) { reject(socket, 'combat', 'cooldown'); return; }
  player.lastAttackAt = now;
  const damage = player.combat.equipment.weaponItemId === 'copper_sword' ? 4 : 2;
  enemy.health = Math.max(0, enemy.health - damage);
  if (enemy.health <= 0) {
    enemy.alive = false;
    enemy.respawnAt = now + 180;
    player.combat.skill.xp += definition.xp;
    player.progress.wallet.coins += definition.coins;
    addItem(player.progress.inventory.slots, definition.drop, 1, stackLimitFor(definition.drop));
    if (definition.kind === 'reach_rat' && player.quest.status === 'active') player.quest.killedRat = true;
    if (definition.kind === 'road_wolf' && player.northQuest.status === 'active') player.northQuest.killedWolf = true;
    syncQuests(player);
    sendQuestState(socket, player);
    sendPlayerState(socket, player);
    sendCombatPlayerState(socket, player);
    combatRevision += 1;
    broadcastCombat();
    setTimeout(() => {
      enemy.health = enemy.maxHealth;
      enemy.alive = true;
      enemy.respawnAt = null;
      combatRevision += 1;
      broadcastCombat();
    }, 180);
    return;
  }
  player.combat.health.current = Math.max(0, player.combat.health.current - definition.retaliation);
  if (player.combat.health.current <= 0) {
    player.combat.health.dead = true;
    player.combat.health.respawnAt = now + 160;
  }
  sendCombatPlayerState(socket, player);
  combatRevision += 1;
  broadcastCombat();
  if (player.combat.health.dead) {
    setTimeout(() => {
      if (!players.has(socket)) return;
      player.combat.health.current = player.combat.health.max;
      player.combat.health.dead = false;
      player.combat.health.respawnAt = null;
      player.position = { x: 440, y: 300 };
      sendCombatPlayerState(socket, player);
      revision += 1;
      broadcast();
    }, 160);
  }
}

function syncQuests(player: Player): void {
  if (player.quest.status === 'active') {
    const blade = player.combat.equipment.weaponItemId === 'copper_sword';
    player.quest.stage = player.quest.minedCopper && blade && player.quest.killedRat && itemCount(player.progress.inventory.slots, 'reach_rat_tail') > 0 ? 'return' : 'fieldwork';
  }
  if (player.northQuest.status === 'active') {
    player.northQuest.stage = player.northQuest.fishCaught >= 2 && player.northQuest.fishCooked >= 2 && player.northQuest.killedWolf && itemCount(player.progress.inventory.slots, 'cooked_riverfish') > 0 && itemCount(player.progress.inventory.slots, 'road_wolf_pelt') > 0 ? 'return' : 'fieldwork';
  }
}

function questSnapshots(player: Player) {
  syncQuests(player);
  const firstCompleted = player.quest.status === 'completed';
  const first = {
    questId: 'first-fieldwork-alpha', title: 'The Silent Bell', status: player.quest.status, stage: player.quest.stage,
    objectives: [
      { id: 'mine_copper', label: 'Cut fresh copper from the eastern vein', complete: firstCompleted || player.quest.minedCopper },
      { id: 'forge_blade', label: 'Smelt copper, forge a copper sword, and equip it', complete: firstCompleted || player.combat.equipment.weaponItemId === 'copper_sword' },
      { id: 'defeat_rat', label: 'Clear the Reach rat from the old bell route', complete: firstCompleted || player.quest.killedRat },
      { id: 'bring_proof', label: 'Bring Surveyor Rhea the Reach rat tail', complete: firstCompleted || itemCount(player.progress.inventory.slots, 'reach_rat_tail') > 0 },
    ],
  };
  if (!firstCompleted) return [first];
  const northCompleted = player.northQuest.status === 'completed';
  return [first, {
    questId: 'north-road-provisions-alpha', title: 'A Cold Supper', status: player.northQuest.status, stage: player.northQuest.stage,
    objectives: [
      { id: 'catch_supper', label: 'Pull two fish from the Northwater', complete: northCompleted || player.northQuest.fishCaught >= 2 },
      { id: 'cook_supper', label: 'Cook two fish at the Northwatch fire', complete: northCompleted || player.northQuest.fishCooked >= 2 },
      { id: 'clear_ford', label: 'Drive the road wolf off the northern ford', complete: northCompleted || player.northQuest.killedWolf },
      { id: 'bring_supper', label: 'Bring Sella one cooked fish and the wolf pelt', complete: northCompleted || (itemCount(player.progress.inventory.slots, 'cooked_riverfish') > 0 && itemCount(player.progress.inventory.slots, 'road_wolf_pelt') > 0) },
    ],
  }];
}

function dialogueFor(player: Player, npcId: string) {
  if (npcId === 'northwatch-cook-alpha-1') return sellaDialogue(player);
  if (player.quest.status === 'not_started') return { npcId, speaker: 'Surveyor Rhea', text: 'The old waybell east of camp has gone silent. Cut fresh copper, make yourself a blade, clear whatever nested there, and bring me proof.', choices: [{ id: 'accept_first_fieldwork', label: "I'll get the bell route open." }, { id: 'accept_first_fieldwork_dry', label: 'Danger, metallurgy, then paperwork. Fine.' }, { id: 'close', label: 'Not yet.' }] };
  if (player.quest.status === 'completed') return { npcId, speaker: 'Surveyor Rhea', text: 'The waybell is ringing again. I signed the northern road open. Cook Sella has a camp at the ford.', choices: [{ id: 'close', label: 'Head north.' }] };
  if (!player.quest.minedCopper) return { npcId, speaker: 'Surveyor Rhea', text: 'Start with the copper vein east of camp. Fresh ore, not something bought back from Toma.', choices: [{ id: 'close', label: 'Head for the eastern vein.' }] };
  if (player.combat.equipment.weaponItemId !== 'copper_sword') return { npcId, speaker: 'Surveyor Rhea', text: 'Good ore. Now make it useful: smelt two bars, forge a copper sword, and equip it.', choices: [{ id: 'close', label: 'Smelt, forge, equip.' }] };
  if (!player.quest.killedRat) return { npcId, speaker: 'Surveyor Rhea', text: 'That blade will do. Deal with the Reach rat and bring me its tail.', choices: [{ id: 'close', label: 'Follow the tracks.' }] };
  return { npcId, speaker: 'Surveyor Rhea', text: 'That tail matches the bite marks. The bell route is clear, your blade survived, and I can finally sign the northern road open.', choices: [{ id: 'turn_in_first_fieldwork', label: 'Reopen the route.' }, { id: 'close', label: 'Give me a minute.' }] };
}

function sellaDialogue(player: Player) {
  const npcId = 'northwatch-cook-alpha-1';
  if (player.quest.status !== 'completed') return { npcId, speaker: 'Cook Sella', text: "Rhea hasn't signed the northern road open.", choices: [{ id: 'close', label: 'Return to camp.' }] };
  if (player.northQuest.status === 'not_started') return { npcId, speaker: 'Cook Sella', text: "So you're the one who got Rhea's bell ringing. Good. The road is open on paper; up here the supply cart is empty and a road wolf owns the ford. Catch fish from the Northwater, cook them here, and bring me supper plus its pelt.", choices: [{ id: 'accept_north_road', label: "I'll make the road useful." }, { id: 'accept_north_road_dry', label: "So 'open' was a flexible term." }, { id: 'close', label: 'Not yet.' }] };
  if (player.northQuest.status === 'completed') return { npcId, speaker: 'Cook Sella', text: player.progress.discoveries.includes('weathered-waystone-alpha-1') ? 'The camp is fed, the ford is quiet, and you found that old waystone. Keep the fragment.' : 'The camp is fed and the ford is quiet. There is an old waystone beyond the river bend.', choices: [{ id: 'close', label: 'Leave the fire.' }] };
  syncQuests(player);
  if (player.northQuest.fishCaught < 2) return { npcId, speaker: 'Cook Sella', text: 'Fish first. The Northwater pool east of camp can be worked steadily or fast.', choices: [{ id: 'close', label: 'Go to the Northwater.' }] };
  if (player.northQuest.fishCooked < 2) return { npcId, speaker: 'Cook Sella', text: 'Raw fish is an argument, not supper. Cook both here. Carry extra into the fight if you have it.', choices: [{ id: 'close', label: 'Use the campfire.' }] };
  if (!player.northQuest.killedWolf) return { npcId, speaker: 'Cook Sella', text: 'Now the ford. That wolf hits harder than the rat. Eat before you give it another opening.', choices: [{ id: 'close', label: 'Head for the ford.' }] };
  return { npcId, speaker: 'Cook Sella', text: 'That will do. One fish for the pot, one pelt for the ledger, and the northern road is finally useful.', choices: [{ id: 'turn_in_north_road', label: 'Close the provision job.' }, { id: 'close', label: 'Give me a minute.' }] };
}

function discoverIfNeeded(player: Player): void {
  if (!player.progress.worldFlags.northernRoadOpen || player.progress.discoveries.includes('weathered-waystone-alpha-1')) return;
  if (distance(player.position, { x: 955, y: 55 }) > 48) return;
  player.progress.discoveries.push('weathered-waystone-alpha-1');
  addItem(player.progress.inventory.slots, 'waystone_fragment', 1, 1);
}

function emptyProgress(): Progress {
  return {
    inventory: { capacity: 24, slots: [] }, bank: { capacity: 60, slots: [] }, wallet: { coins: 0 }, equipment: { toolItemId: null },
    skills: { mining: { xp: 0, level: 1 }, smithing: { xp: 0, level: 1 }, fishing: { xp: 0, level: 1 }, cooking: { xp: 0, level: 1 } },
    gathering: null, processing: null, worldFlags: { northernRoadOpen: false }, discoveries: [],
  };
}
function emptyCombat(): Combat { return { health: { current: 20, max: 20, dead: false, respawnAt: null }, skill: { xp: 0, level: 1 }, equipment: { weaponItemId: null } }; }
function emptyQuest(): QuestState { return { status: 'not_started', stage: 'available', minedCopper: false, killedRat: false, rewardClaimed: false }; }
function emptyNorthQuest(): NorthQuestState { return { status: 'not_started', stage: 'available', fishCaught: 0, fishCooked: 0, killedWolf: false, rewardClaimed: false }; }
function snapshot(player: Player) { return { id: player.id, position: { ...player.position } }; }
function snapshots() { return [...players.values()].map(snapshot).sort((a, b) => a.id.localeCompare(b.id)); }
function resourceSnapshots() { return resources.map((resource) => ({ ...resource, position: { ...resource.position } })); }
function enemySnapshots() { return [...enemies.values()].map((enemy) => ({ id: enemy.id, kind: enemy.kind, position: { ...enemy.position }, health: enemy.health, maxHealth: enemy.maxHealth, alive: enemy.alive, respawnAt: enemy.respawnAt })); }
function broadcast() { const payload = JSON.stringify({ type: 'WORLD_STATE', revision, players: snapshots(), resources: resourceSnapshots(), stations, services }); for (const socket of players.keys()) if (socket.readyState === WebSocket.OPEN) socket.send(payload); }
function broadcastCombat() { const payload = JSON.stringify({ type: 'COMBAT_WORLD_STATE', revision: combatRevision, enemies: enemySnapshots() }); for (const socket of players.keys()) if (socket.readyState === WebSocket.OPEN) socket.send(payload); }
function sendPlayerState(socket: WebSocket, player: Player) { socket.send(JSON.stringify({ type: 'PLAYER_STATE', revision: ++player.progressRevision, progress: player.progress })); }
function sendCombatPlayerState(socket: WebSocket, player: Player) { socket.send(JSON.stringify({ type: 'COMBAT_PLAYER_STATE', revision: ++player.combatRevision, combat: player.combat })); }
function sendQuestState(socket: WebSocket, player: Player) { socket.send(JSON.stringify({ type: 'QUEST_STATE', revision: ++player.questRevision, quests: questSnapshots(player) })); }
function sendDialogueState(socket: WebSocket, player: Player, dialogue: object | null) { socket.send(JSON.stringify({ type: 'DIALOGUE_STATE', revision: ++player.dialogueRevision, dialogue })); }
function reject(socket: WebSocket, action: string, reason: string) { socket.send(JSON.stringify({ type: 'ACTION_REJECTED', action, reason })); }
function socketFor(player: Player): WebSocket | null { for (const [socket, candidate] of players) if (candidate === player) return socket; return null; }
function actionCategory(type: string): string { if (type === 'MOVE_INTENT' || type === 'MOVE_TARGET') return 'movement'; if (type.includes('GATHERING')) return 'gathering'; if (type.includes('PROCESSING')) return 'processing'; if (type === 'EQUIP_ITEM') return 'equipment'; if (type === 'USE_ITEM') return 'consumable'; if (type.startsWith('BANK_')) return 'bank'; if (type.startsWith('MERCHANT_')) return 'merchant'; if (type === 'INTERACT_NPC' || type === 'DIALOGUE_CHOICE') return 'quest'; return 'combat'; }
function stackLimitFor(itemId: string): number { if (itemId === 'reach_rat_tail') return 10; if (itemId === 'raw_riverfish' || itemId === 'cooked_riverfish') return 10; if (itemId === 'fish_bones') return 20; if (itemId === 'road_wolf_pelt') return 5; return 1; }
function addItem(slots: Slot[], itemId: string, quantity: number, stackLimit: number): void {
  let remaining = quantity;
  for (const slot of slots) {
    if (remaining <= 0) break;
    if (slot.itemId !== itemId || slot.quantity >= stackLimit) continue;
    const added = Math.min(remaining, stackLimit - slot.quantity);
    slot.quantity += added;
    remaining -= added;
  }
  const occupied = new Set(slots.map((slot) => slot.slot));
  let slotNumber = 0;
  while (remaining > 0) {
    while (occupied.has(slotNumber)) slotNumber += 1;
    const added = Math.min(remaining, stackLimit);
    slots.push({ slot: slotNumber, itemId, quantity: added });
    occupied.add(slotNumber);
    remaining -= added;
  }
  slots.sort((a, b) => a.slot - b.slot);
}
function consume(slots: Slot[], itemId: string, quantity: number): boolean {
  if (itemCount(slots, itemId) < quantity) return false;
  let remaining = quantity;
  for (const slot of slots) {
    if (remaining <= 0 || slot.itemId !== itemId) continue;
    const used = Math.min(remaining, slot.quantity);
    slot.quantity -= used;
    remaining -= used;
  }
  for (let index = slots.length - 1; index >= 0; index -= 1) if (slots[index]!.quantity <= 0) slots.splice(index, 1);
  return true;
}
function itemCount(slots: Slot[], itemId: string): number { return slots.filter((slot) => slot.itemId === itemId).reduce((sum, slot) => sum + slot.quantity, 0); }
function distance(a: Position, b: Position): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function parseRecord(raw: string): RecordMessage | null { try { const value: unknown = JSON.parse(raw); return typeof value === 'object' && value !== null ? value as RecordMessage : null; } catch { return null; } }
