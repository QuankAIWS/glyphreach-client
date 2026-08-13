import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

const port = Number(process.env.MOCK_BACKEND_PORT ?? 8787);
const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 600 };
const resource = { id: 'copper-vein-alpha-1', kind: 'copper_vein' as const, position: { x: 760, y: 300 }, available: true, respawnAt: null as number | null };
const stations = [
  { id: 'furnace-alpha-1', kind: 'furnace' as const, position: { x: 570, y: 155 } },
  { id: 'anvil-alpha-1', kind: 'anvil' as const, position: { x: 570, y: 445 } },
];
const services = [
  { id: 'bank-alpha-1', kind: 'bank' as const, position: { x: 300, y: 180 } },
  { id: 'merchant-alpha-1', kind: 'merchant' as const, position: { x: 300, y: 420 }, offers: [
    { itemId: 'copper_ore', buyPrice: 4, sellPrice: 2 },
    { itemId: 'copper_bar', buyPrice: 9, sellPrice: 3 },
    { itemId: 'copper_pickaxe', buyPrice: 22, sellPrice: 7 },
    { itemId: 'copper_sword', buyPrice: 24, sellPrice: 8 },
  ] },
];
const npcs = [{ id: 'surveyor-alpha-1', displayName: 'Surveyor Rhea', position: { x: 515, y: 345 } }];
const enemy = { id: 'reach-rat-alpha-1', kind: 'reach_rat' as const, position: { x: 820, y: 470 }, health: 14, maxHealth: 14, alive: true, respawnAt: null as number | null };

let revision = 0;
let combatRevision = 0;
let playerNumber = 0;
const players = new Map<WebSocket, Player>();

interface Slot { slot: number; itemId: string; quantity: number; }
interface Progress {
  inventory: { capacity: number; slots: Slot[] };
  bank: { capacity: number; slots: Slot[] };
  wallet: { coins: number };
  equipment: { toolItemId: string | null };
  skills: { mining: { xp: number; level: number }; smithing: { xp: number; level: number } };
  gathering: null | { nodeId: string; mode: 'focused' | 'steady'; startedAt: number; completesAt: number };
  processing: null | { stationId: string; recipeId: string; startedAt: number; completesAt: number };
}
interface Combat {
  health: { current: number; max: number; dead: boolean; respawnAt: number | null };
  skill: { xp: number; level: number };
  equipment: { weaponItemId: string | null };
}
interface QuestState {
  status: 'not_started' | 'active' | 'completed';
  stage: 'available' | 'fieldwork' | 'return' | 'completed';
  minedCopper: boolean;
  killedRat: boolean;
  rewardClaimed: boolean;
}
interface Player {
  id: string;
  resumeToken: string;
  position: { x: number; y: number };
  progressRevision: number;
  combatProgressRevision: number;
  questRevision: number;
  dialogueRevision: number;
  progress: Progress;
  combat: Combat;
  quest: QuestState;
  activeNpcId: string | null;
  lastAttackAt: number;
}

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
    let hello: unknown;
    try { hello = JSON.parse(data.toString()); } catch { hello = null; }
    const record = hello && typeof hello === 'object' ? hello as Record<string, unknown> : null;
    if (!record || record.type !== 'HELLO' || record.protocolVersion !== 1) {
      socket.send(JSON.stringify({ type: 'REJECT', reason: 'protocol_mismatch', supportedProtocolVersion: 1 }));
      socket.close(1002, 'protocol mismatch');
      return;
    }

    playerNumber += 1;
    const player: Player = {
      id: `test-player-${playerNumber}`,
      resumeToken: randomUUID(),
      position: { x: 380 + playerNumber * 80, y: 300 },
      progressRevision: 0,
      combatProgressRevision: 0,
      questRevision: 0,
      dialogueRevision: 0,
      progress: emptyProgress(),
      combat: emptyCombat(),
      quest: emptyQuest(),
      activeNpcId: null,
      lastAttackAt: 0,
    };
    players.set(socket, player);
    revision += 1;
    socket.send(JSON.stringify({
      type: 'WELCOME',
      protocolVersion: 1,
      serverBuild: 'mock-server',
      connectionId: randomUUID(),
      resumeToken: player.resumeToken,
      worldId: 'alpha-1',
      player: snapshot(player),
      players: snapshots(),
      resources: resources(),
      stations,
      services,
      npcs,
      progress: player.progress,
      enemies: enemies(),
      combat: player.combat,
      quests: [questSnapshot(player)],
      world: { bounds },
    }), () => { broadcast(); broadcastCombat(); });

    socket.on('message', (nextData, nextIsBinary) => {
      if (nextIsBinary) return;
      let value: unknown;
      try { value = JSON.parse(nextData.toString()); } catch { return; }
      const message = value && typeof value === 'object' ? value as Record<string, unknown> : null;
      if (!message) return;

      if (player.combat.health.dead) {
        socket.send(JSON.stringify({ type: 'ACTION_REJECTED', action: actionCategory(String(message.type)), reason: 'player_dead' }));
        return;
      }

      if (message.type === 'MOVE_INTENT') {
        const dx = Number(message.dx);
        const dy = Number(message.dy);
        if (![-1, 0, 1].includes(dx) || ![-1, 0, 1].includes(dy) || (dx === 0 && dy === 0)) return;
        const magnitude = Math.hypot(dx, dy);
        player.position.x = clamp(player.position.x + (dx / magnitude) * 28, bounds.minX, bounds.maxX);
        player.position.y = clamp(player.position.y + (dy / magnitude) * 28, bounds.minY, bounds.maxY);
        revision += 1;
        broadcast();
        return;
      }
      if (message.type === 'MOVE_TARGET') {
        const target = message.target as { x?: unknown; y?: unknown } | undefined;
        if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') return;
        if (target.x < bounds.minX || target.x > bounds.maxX || target.y < bounds.minY || target.y > bounds.maxY) {
          reject(socket, 'movement', 'invalid_target');
          return;
        }
        player.position = { x: target.x, y: target.y };
        revision += 1;
        broadcast();
        return;
      }

      if (message.type === 'INTERACT_NPC') {
        const npc = npcs.find((candidate) => candidate.id === message.targetId);
        if (!npc) { reject(socket, 'quest', 'invalid_npc'); return; }
        if (distance(player.position, npc.position) > 82) { reject(socket, 'quest', 'too_far'); return; }
        player.activeNpcId = npc.id;
        sendQuestState(socket, player);
        sendDialogueState(socket, player, dialogueFor(player));
        return;
      }
      if (message.type === 'DIALOGUE_CHOICE') {
        if (message.npcId !== player.activeNpcId) { reject(socket, 'quest', 'conversation_not_open'); return; }
        const npc = npcs.find((candidate) => candidate.id === message.npcId);
        if (!npc) { reject(socket, 'quest', 'invalid_npc'); return; }
        if (distance(player.position, npc.position) > 82) { reject(socket, 'quest', 'too_far'); return; }
        if (message.choiceId === 'close') {
          player.activeNpcId = null;
          sendDialogueState(socket, player, null);
          return;
        }
        if (message.choiceId === 'accept_first_fieldwork') {
          if (player.quest.status !== 'not_started') {
            reject(socket, 'quest', player.quest.status === 'completed' ? 'quest_already_completed' : 'invalid_choice');
            return;
          }
          player.quest.status = 'active';
          player.quest.stage = 'fieldwork';
          sendQuestState(socket, player);
          sendDialogueState(socket, player, dialogueFor(player));
          return;
        }
        if (message.choiceId === 'turn_in_first_fieldwork') {
          syncQuest(player);
          if (player.quest.status === 'completed') { reject(socket, 'quest', 'quest_already_completed'); return; }
          if (player.quest.stage !== 'return') { reject(socket, 'quest', 'quest_not_ready'); return; }
          if (itemCount(player.progress.inventory.slots, 'copper_ore') < 1 || itemCount(player.progress.inventory.slots, 'reach_rat_tail') < 1) {
            reject(socket, 'quest', 'missing_items');
            return;
          }
          consume(player.progress.inventory.slots, 'copper_ore', 1);
          consume(player.progress.inventory.slots, 'reach_rat_tail', 1);
          player.progress.wallet.coins += 12;
          player.quest.status = 'completed';
          player.quest.stage = 'completed';
          player.quest.rewardClaimed = true;
          sendQuestState(socket, player);
          sendPlayerState(socket, player);
          sendDialogueState(socket, player, dialogueFor(player));
          return;
        }
        reject(socket, 'quest', 'invalid_choice');
        return;
      }

      if (message.type === 'START_GATHERING') {
        if (distance(player.position, resource.position) > 86) { reject(socket, 'gathering', 'too_far'); return; }
        if (!resource.available) { reject(socket, 'gathering', 'node_unavailable'); return; }
        const mode = message.mode === 'steady' ? 'steady' : 'focused';
        const now = Date.now();
        player.progress.gathering = { nodeId: resource.id, mode, startedAt: now, completesAt: now + 100 };
        sendPlayerState(socket, player);
        setTimeout(() => {
          if (!players.has(socket) || !resource.available || player.combat.health.dead) return;
          resource.available = false;
          resource.respawnAt = Date.now() + 120;
          addItem(player.progress.inventory.slots, 'copper_ore', 1, 1);
          player.progress.skills.mining.xp += mode === 'steady' ? 7 : 12;
          player.progress.gathering = null;
          if (player.quest.status === 'active') {
            player.quest.minedCopper = true;
            syncQuest(player);
            sendQuestState(socket, player);
          }
          sendPlayerState(socket, player);
          revision += 1;
          broadcast();
          setTimeout(() => {
            resource.available = true;
            resource.respawnAt = null;
            revision += 1;
            broadcast();
          }, 120);
        }, 100);
        return;
      }
      if (message.type === 'CANCEL_GATHERING') {
        player.progress.gathering = null;
        sendPlayerState(socket, player);
        return;
      }

      if (message.type === 'START_PROCESSING') {
        const station = stations.find((candidate) => candidate.id === message.stationId);
        if (!station) return;
        if (distance(player.position, station.position) > 86) { reject(socket, 'processing', 'too_far'); return; }
        const recipeId = String(message.recipeId);
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
          }
          player.progress.processing = null;
          if (!completed) reject(socket, 'processing', 'missing_items');
          sendPlayerState(socket, player);
        }, 100);
        return;
      }
      if (message.type === 'CANCEL_PROCESSING') {
        player.progress.processing = null;
        sendPlayerState(socket, player);
        return;
      }

      if (message.type === 'EQUIP_ITEM') {
        const itemId = String(message.itemId);
        if (!consume(player.progress.inventory.slots, itemId, 1)) { reject(socket, 'equipment', 'item_not_owned'); return; }
        if (itemId === 'copper_sword') {
          player.combat.equipment.weaponItemId = itemId;
          sendPlayerState(socket, player);
          sendCombatPlayerState(socket, player);
          return;
        }
        player.progress.equipment.toolItemId = itemId;
        sendPlayerState(socket, player);
        return;
      }

      if (message.type === 'BANK_DEPOSIT' || message.type === 'BANK_WITHDRAW') {
        const bank = services.find((service) => service.kind === 'bank' && service.id === message.serviceId);
        if (!bank || distance(player.position, bank.position) > 86) { reject(socket, 'bank', bank ? 'too_far' : 'invalid_service'); return; }
        const itemId = String(message.itemId);
        const quantity = Number(message.quantity);
        const source = message.type === 'BANK_DEPOSIT' ? player.progress.inventory.slots : player.progress.bank.slots;
        const destination = message.type === 'BANK_DEPOSIT' ? player.progress.bank.slots : player.progress.inventory.slots;
        if (!consume(source, itemId, quantity)) { reject(socket, 'bank', message.type === 'BANK_DEPOSIT' ? 'item_not_owned' : 'bank_missing_item'); return; }
        addItem(destination, itemId, quantity, stackLimitFor(itemId));
        sendPlayerState(socket, player);
        return;
      }

      if (message.type === 'MERCHANT_BUY' || message.type === 'MERCHANT_SELL') {
        const merchant = services.find((service) => service.kind === 'merchant' && service.id === message.serviceId);
        if (!merchant || merchant.kind !== 'merchant' || distance(player.position, merchant.position) > 86) { reject(socket, 'merchant', merchant ? 'too_far' : 'invalid_service'); return; }
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
        return;
      }

      if (message.type === 'ATTACK_TARGET') {
        if (message.targetId !== enemy.id) { reject(socket, 'combat', 'invalid_target'); return; }
        if (!enemy.alive) { reject(socket, 'combat', 'target_dead'); return; }
        if (distance(player.position, enemy.position) > 82) { reject(socket, 'combat', 'too_far'); return; }
        const now = Date.now();
        if (now - player.lastAttackAt < 80) { reject(socket, 'combat', 'cooldown'); return; }
        player.lastAttackAt = now;
        const damage = player.combat.equipment.weaponItemId === 'copper_sword' ? 4 : 2;
        enemy.health = Math.max(0, enemy.health - damage);
        if (enemy.health === 0) {
          enemy.alive = false;
          enemy.respawnAt = now + 400;
          player.progress.wallet.coins += 3;
          addItem(player.progress.inventory.slots, 'reach_rat_tail', 1, 10);
          player.combat.skill.xp += 12;
          if (player.quest.status === 'active') {
            player.quest.killedRat = true;
            syncQuest(player);
            sendQuestState(socket, player);
          }
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
          }, 400);
          return;
        }
        player.combat.health.current = Math.max(0, player.combat.health.current - 5);
        if (player.combat.health.current === 0) {
          player.combat.health.dead = true;
          player.combat.health.respawnAt = now + 180;
          sendCombatPlayerState(socket, player);
          combatRevision += 1;
          broadcastCombat();
          setTimeout(() => {
            if (!players.has(socket)) return;
            player.position = { x: 440, y: 300 };
            player.combat.health.current = player.combat.health.max;
            player.combat.health.dead = false;
            player.combat.health.respawnAt = null;
            sendCombatPlayerState(socket, player);
            revision += 1;
            broadcast();
          }, 180);
          return;
        }
        sendCombatPlayerState(socket, player);
        combatRevision += 1;
        broadcastCombat();
      }
    });
  });

  socket.on('close', () => {
    if (!players.delete(socket)) return;
    revision += 1;
    broadcast();
  });
});

function emptyProgress(): Progress {
  return {
    inventory: { capacity: 24, slots: [] },
    bank: { capacity: 60, slots: [] },
    wallet: { coins: 0 },
    equipment: { toolItemId: null },
    skills: { mining: { xp: 0, level: 1 }, smithing: { xp: 0, level: 1 } },
    gathering: null,
    processing: null,
  };
}
function emptyCombat(): Combat {
  return { health: { current: 20, max: 20, dead: false, respawnAt: null }, skill: { xp: 0, level: 1 }, equipment: { weaponItemId: null } };
}
function emptyQuest(): QuestState {
  return { status: 'not_started', stage: 'available', minedCopper: false, killedRat: false, rewardClaimed: false };
}
function syncQuest(player: Player): void {
  if (player.quest.status === 'active') player.quest.stage = player.quest.minedCopper && player.quest.killedRat ? 'return' : 'fieldwork';
}
function questSnapshot(player: Player) {
  syncQuest(player);
  const completed = player.quest.status === 'completed';
  return {
    questId: 'first-fieldwork-alpha',
    title: 'First Fieldwork',
    status: player.quest.status,
    stage: player.quest.stage,
    objectives: [
      { id: 'mine_copper', label: 'Mine a copper sample after accepting the job', complete: completed || player.quest.minedCopper },
      { id: 'defeat_rat', label: 'Defeat the Reach rat after accepting the job', complete: completed || player.quest.killedRat },
      { id: 'bring_proof', label: 'Return with 1 copper ore and 1 Reach rat tail', complete: completed || (itemCount(player.progress.inventory.slots, 'copper_ore') > 0 && itemCount(player.progress.inventory.slots, 'reach_rat_tail') > 0) },
    ],
  };
}
function dialogueFor(player: Player) {
  if (player.quest.status === 'not_started') {
    return {
      npcId: 'surveyor-alpha-1',
      speaker: 'Surveyor Rhea',
      text: 'Bring me a fresh copper sample and proof you handled the rat east of camp.',
      choices: [{ id: 'accept_first_fieldwork', label: 'I will take a look.' }, { id: 'close', label: 'Not right now.' }],
    };
  }
  if (player.quest.status === 'completed') {
    return { npcId: 'surveyor-alpha-1', speaker: 'Surveyor Rhea', text: 'The first survey is closed. Good work.', choices: [{ id: 'close', label: 'Leave.' }] };
  }
  syncQuest(player);
  if (player.quest.stage === 'fieldwork') {
    return { npcId: 'surveyor-alpha-1', speaker: 'Surveyor Rhea', text: 'Finish the fieldwork I assigned after we spoke.', choices: [{ id: 'close', label: 'Back to it.' }] };
  }
  return {
    npcId: 'surveyor-alpha-1',
    speaker: 'Surveyor Rhea',
    text: 'If you have the copper sample and rat tail, I can close the survey.',
    choices: [{ id: 'turn_in_first_fieldwork', label: 'Turn in the fieldwork.' }, { id: 'close', label: 'Not yet.' }],
  };
}
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
function itemCount(slots: Slot[], itemId: string): number {
  return slots.filter((slot) => slot.itemId === itemId).reduce((sum, slot) => sum + slot.quantity, 0);
}
function stackLimitFor(itemId: string): number { return itemId === 'reach_rat_tail' ? 10 : 1; }
function snapshot(player: Player) { return { id: player.id, position: { ...player.position } }; }
function snapshots() { return [...players.values()].map(snapshot).sort((a, b) => a.id.localeCompare(b.id)); }
function resources() { return [{ ...resource, position: { ...resource.position } }]; }
function enemies() { return [{ ...enemy, position: { ...enemy.position } }]; }
function sendPlayerState(socket: WebSocket, player: Player) {
  player.progressRevision += 1;
  socket.send(JSON.stringify({ type: 'PLAYER_STATE', revision: player.progressRevision, progress: player.progress }));
}
function sendCombatPlayerState(socket: WebSocket, player: Player) {
  player.combatProgressRevision += 1;
  socket.send(JSON.stringify({ type: 'COMBAT_PLAYER_STATE', revision: player.combatProgressRevision, combat: player.combat }));
}
function sendQuestState(socket: WebSocket, player: Player) {
  player.questRevision += 1;
  socket.send(JSON.stringify({ type: 'QUEST_STATE', revision: player.questRevision, quests: [questSnapshot(player)] }));
}
function sendDialogueState(socket: WebSocket, player: Player, dialogue: object | null) {
  player.dialogueRevision += 1;
  socket.send(JSON.stringify({ type: 'DIALOGUE_STATE', revision: player.dialogueRevision, dialogue }));
}
function reject(socket: WebSocket, action: string, reason: string) {
  socket.send(JSON.stringify({ type: 'ACTION_REJECTED', action, reason }));
}
function broadcast() {
  const payload = JSON.stringify({ type: 'WORLD_STATE', revision, players: snapshots(), resources: resources(), stations, services });
  for (const socket of players.keys()) if (socket.readyState === WebSocket.OPEN) socket.send(payload);
}
function broadcastCombat() {
  const payload = JSON.stringify({ type: 'COMBAT_WORLD_STATE', revision: combatRevision, enemies: enemies() });
  for (const socket of players.keys()) if (socket.readyState === WebSocket.OPEN) socket.send(payload);
}
function actionCategory(type: string): string {
  if (type === 'MOVE_INTENT' || type === 'MOVE_TARGET') return 'movement';
  if (type.includes('GATHERING')) return 'gathering';
  if (type.includes('PROCESSING')) return 'processing';
  if (type === 'EQUIP_ITEM') return 'equipment';
  if (type.startsWith('BANK_')) return 'bank';
  if (type.startsWith('MERCHANT_')) return 'merchant';
  if (type === 'INTERACT_NPC' || type === 'DIALOGUE_CHOICE') return 'quest';
  return 'combat';
}
function distance(a: { x: number; y: number }, b: { x: number; y: number }) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }

server.listen(port, '127.0.0.1', () => console.log(`mock GlyphReach backend listening on ${port}`));
const shutdown = () => {
  for (const client of wss.clients) client.terminate();
  wss.close(() => server.close(() => process.exit(0)));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
