import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

const port = Number(process.env.MOCK_BACKEND_PORT ?? 8787);
const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 600 };
const resource = { id: 'copper-vein-alpha-1', kind: 'copper_vein', position: { x: 760, y: 300 }, available: true, respawnAt: null as number | null };
const stations = [
  { id: 'furnace-alpha-1', kind: 'furnace', position: { x: 570, y: 155 } },
  { id: 'anvil-alpha-1', kind: 'anvil', position: { x: 570, y: 445 } },
];
const services = [
  { id: 'bank-alpha-1', kind: 'bank', position: { x: 300, y: 180 } },
  {
    id: 'merchant-alpha-1', kind: 'merchant', position: { x: 300, y: 420 },
    offers: [
      { itemId: 'copper_ore', buyPrice: 4, sellPrice: 2 },
      { itemId: 'copper_bar', buyPrice: 9, sellPrice: 3 },
      { itemId: 'copper_pickaxe', buyPrice: 22, sellPrice: 7 },
    ],
  },
] as const;

let revision = 0;
let playerNumber = 0;
const players = new Map<WebSocket, {
  id: string;
  resumeToken: string;
  position: { x: number; y: number };
  progressRevision: number;
  progress: ReturnType<typeof emptyProgress>;
}>();

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
    const player = {
      id: `test-player-${playerNumber}`,
      resumeToken: randomUUID(),
      position: { x: 380 + playerNumber * 80, y: 300 },
      progressRevision: 0,
      progress: emptyProgress(),
    };
    players.set(socket, player);
    revision += 1;
    socket.send(JSON.stringify({
      type: 'WELCOME', protocolVersion: 1, serverBuild: 'mock-server', connectionId: randomUUID(),
      resumeToken: player.resumeToken, worldId: 'alpha-1', player: snapshot(player), players: snapshots(),
      resources: resources(), stations, services, progress: player.progress, world: { bounds },
    }), () => broadcast());

    socket.on('message', (nextData, nextIsBinary) => {
      if (nextIsBinary) return;
      let value: unknown;
      try { value = JSON.parse(nextData.toString()); } catch { return; }
      const message = value && typeof value === 'object' ? value as Record<string, unknown> : null;
      if (!message) return;

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

      if (message.type === 'START_GATHERING') {
        if (distance(player.position, resource.position) > 86) { reject(socket, 'gathering', 'too_far'); return; }
        if (!resource.available) { reject(socket, 'gathering', 'node_unavailable'); return; }
        const mode = message.mode === 'steady' ? 'steady' : 'focused';
        const now = Date.now();
        player.progress.gathering = { nodeId: resource.id, mode, startedAt: now, completesAt: now + 100 };
        sendPlayerState(socket, player);
        setTimeout(() => {
          if (!players.has(socket) || !resource.available) return;
          resource.available = false;
          resource.respawnAt = Date.now() + 120;
          addItems(player.progress.inventory, 'copper_ore', 1);
          player.progress.skills.mining.xp += mode === 'steady' ? 7 : 12;
          player.progress.gathering = null;
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
          if (!players.has(socket)) return;
          if (recipeId === 'smelt_copper' && consumeItems(player.progress.inventory, 'copper_ore', 1)) {
            addItems(player.progress.inventory, 'copper_bar', 1);
            player.progress.skills.smithing.xp += 6;
          } else if (recipeId === 'smith_copper_pickaxe' && consumeItems(player.progress.inventory, 'copper_bar', 2)) {
            addItems(player.progress.inventory, 'copper_pickaxe', 1);
            player.progress.skills.smithing.xp += 16;
          } else {
            player.progress.processing = null;
            reject(socket, 'processing', 'missing_items');
            sendPlayerState(socket, player);
            return;
          }
          player.progress.processing = null;
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
        if (!consumeItems(player.progress.inventory, itemId, 1)) { reject(socket, 'equipment', 'item_not_owned'); return; }
        player.progress.equipment.toolItemId = itemId;
        sendPlayerState(socket, player);
        return;
      }

      if (message.type === 'BANK_DEPOSIT' || message.type === 'BANK_WITHDRAW') {
        const bank = services.find((service) => service.kind === 'bank' && service.id === message.serviceId);
        const quantity = positiveQuantity(message.quantity);
        const itemId = String(message.itemId ?? '');
        if (!bank) { reject(socket, 'bank', 'invalid_service'); return; }
        if (!quantity) { reject(socket, 'bank', 'invalid_quantity'); return; }
        if (distance(player.position, bank.position) > 86) { reject(socket, 'bank', 'too_far'); return; }
        if (message.type === 'BANK_DEPOSIT') {
          if (!consumeItems(player.progress.inventory, itemId, quantity)) { reject(socket, 'bank', 'item_not_owned'); return; }
          addItems(player.progress.bank, itemId, quantity);
        } else {
          if (!consumeItems(player.progress.bank, itemId, quantity)) { reject(socket, 'bank', 'bank_missing_item'); return; }
          addItems(player.progress.inventory, itemId, quantity);
        }
        sendPlayerState(socket, player);
        return;
      }

      if (message.type === 'MERCHANT_BUY' || message.type === 'MERCHANT_SELL') {
        const merchant = services.find((service) => service.kind === 'merchant' && service.id === message.serviceId);
        const quantity = positiveQuantity(message.quantity);
        const itemId = String(message.itemId ?? '');
        if (!merchant || merchant.kind !== 'merchant') { reject(socket, 'merchant', 'invalid_service'); return; }
        if (!quantity) { reject(socket, 'merchant', 'invalid_quantity'); return; }
        if (distance(player.position, merchant.position) > 86) { reject(socket, 'merchant', 'too_far'); return; }
        const offer = merchant.offers.find((candidate) => candidate.itemId === itemId);
        if (!offer) { reject(socket, 'merchant', 'item_not_traded'); return; }
        if (message.type === 'MERCHANT_BUY') {
          const total = offer.buyPrice * quantity;
          if (player.progress.wallet.coins < total) { reject(socket, 'merchant', 'insufficient_coins'); return; }
          player.progress.wallet.coins -= total;
          addItems(player.progress.inventory, itemId, quantity);
        } else {
          if (!consumeItems(player.progress.inventory, itemId, quantity)) { reject(socket, 'merchant', 'item_not_owned'); return; }
          player.progress.wallet.coins += offer.sellPrice * quantity;
        }
        sendPlayerState(socket, player);
      }
    });
  });
  socket.on('close', () => { if (!players.delete(socket)) return; revision += 1; broadcast(); });
});

function emptyProgress() {
  return {
    inventory: { capacity: 24, slots: [] as Array<{ slot: number; itemId: string; quantity: number }> },
    bank: { capacity: 60, slots: [] as Array<{ slot: number; itemId: string; quantity: number }> },
    wallet: { coins: 0 },
    equipment: { toolItemId: null as string | null },
    skills: { mining: { xp: 0, level: 1 }, smithing: { xp: 0, level: 1 } },
    gathering: null as null | { nodeId: string; mode: 'focused' | 'steady'; startedAt: number; completesAt: number },
    processing: null as null | { stationId: string; recipeId: string; startedAt: number; completesAt: number },
  };
}

function addItems(storage: { slots: Array<{ slot: number; itemId: string; quantity: number }> }, itemId: string, quantity: number): void {
  const occupied = new Set(storage.slots.map((slot) => slot.slot));
  for (let count = 0; count < quantity; count += 1) {
    let slot = 0;
    while (occupied.has(slot)) slot += 1;
    storage.slots.push({ slot, itemId, quantity: 1 });
    occupied.add(slot);
  }
}

function consumeItems(storage: { slots: Array<{ slot: number; itemId: string; quantity: number }> }, itemId: string, quantity: number): boolean {
  const matches = storage.slots.filter((slot) => slot.itemId === itemId);
  if (matches.length < quantity) return false;
  for (let index = 0; index < quantity; index += 1) {
    const target = matches[index]!;
    const slotIndex = storage.slots.indexOf(target);
    storage.slots.splice(slotIndex, 1);
  }
  return true;
}

function positiveQuantity(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 99 ? Number(value) : null;
}
function snapshot(player: { id: string; position: { x: number; y: number } }) { return { id: player.id, position: { ...player.position } }; }
function snapshots() { return [...players.values()].map(snapshot).sort((a, b) => a.id.localeCompare(b.id)); }
function resources() { return [{ ...resource, position: { ...resource.position } }]; }
function sendPlayerState(socket: WebSocket, player: { progressRevision: number; progress: ReturnType<typeof emptyProgress> }) { player.progressRevision += 1; socket.send(JSON.stringify({ type: 'PLAYER_STATE', revision: player.progressRevision, progress: player.progress })); }
function broadcast() { const payload = JSON.stringify({ type: 'WORLD_STATE', revision, players: snapshots(), resources: resources(), stations, services }); for (const socket of players.keys()) if (socket.readyState === WebSocket.OPEN) socket.send(payload); }
function reject(socket: WebSocket, action: string, reason: string) { socket.send(JSON.stringify({ type: 'ACTION_REJECTED', action, reason })); }
function distance(a: { x: number; y: number }, b: { x: number; y: number }): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
server.listen(port, '127.0.0.1', () => console.log(`mock GlyphReach backend listening on ${port}`));
const shutdown = () => { for (const client of wss.clients) client.terminate(); wss.close(() => server.close(() => process.exit(0))); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
