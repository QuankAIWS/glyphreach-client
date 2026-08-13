import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

const port = Number(process.env.MOCK_BACKEND_PORT ?? 8787);
const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 600 };
const resource = {
  id: 'copper-vein-alpha-1',
  kind: 'copper_vein',
  position: { x: 760, y: 300 },
  available: true,
  respawnAt: null as number | null,
};
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
  if (request.url !== '/world') {
    socket.destroy();
    return;
  }
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
      type: 'WELCOME',
      protocolVersion: 1,
      serverBuild: 'mock-server',
      connectionId: randomUUID(),
      resumeToken: player.resumeToken,
      worldId: 'alpha-1',
      player: snapshot(player),
      players: snapshots(),
      resources: resources(),
      progress: player.progress,
      world: { bounds },
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
          socket.send(JSON.stringify({ type: 'ACTION_REJECTED', action: 'movement', reason: 'invalid_target' }));
          return;
        }
        player.position = { x: target.x, y: target.y };
        revision += 1;
        broadcast();
        return;
      }

      if (message.type === 'START_GATHERING') {
        const mode = message.mode === 'steady' ? 'steady' : 'focused';
        if (Math.hypot(player.position.x - resource.position.x, player.position.y - resource.position.y) > 86) {
          socket.send(JSON.stringify({ type: 'ACTION_REJECTED', action: 'gathering', reason: 'too_far' }));
          return;
        }
        if (!resource.available) {
          socket.send(JSON.stringify({ type: 'ACTION_REJECTED', action: 'gathering', reason: 'node_unavailable' }));
          return;
        }
        const now = Date.now();
        player.progress.gathering = { nodeId: resource.id, mode, startedAt: now, completesAt: now + 120 };
        sendPlayerState(socket, player);
        setTimeout(() => {
          if (!players.has(socket) || !resource.available) return;
          resource.available = false;
          resource.respawnAt = Date.now() + 160;
          const slot = player.progress.inventory.slots.length;
          player.progress.inventory.slots.push({ slot, itemId: 'copper_ore', quantity: 1 });
          player.progress.skills.mining.xp += mode === 'steady' ? 7 : 12;
          player.progress.skills.mining.level = 1 + Math.floor(Math.sqrt(player.progress.skills.mining.xp / 20));
          player.progress.gathering = null;
          sendPlayerState(socket, player);
          revision += 1;
          broadcast();
          setTimeout(() => {
            resource.available = true;
            resource.respawnAt = null;
            revision += 1;
            broadcast();
          }, 160);
        }, 120);
        return;
      }

      if (message.type === 'CANCEL_GATHERING') {
        player.progress.gathering = null;
        sendPlayerState(socket, player);
      }
    });
  });

  socket.on('close', () => {
    if (!players.delete(socket)) return;
    revision += 1;
    broadcast();
  });
});

function emptyProgress() {
  return {
    inventory: { capacity: 24, slots: [] as Array<{ slot: number; itemId: string; quantity: number }> },
    skills: { mining: { xp: 0, level: 1 } },
    gathering: null as null | { nodeId: string; mode: 'focused' | 'steady'; startedAt: number; completesAt: number },
  };
}

function snapshot(player: { id: string; position: { x: number; y: number } }) {
  return { id: player.id, position: { ...player.position } };
}

function snapshots() {
  return [...players.values()].map(snapshot).sort((a, b) => a.id.localeCompare(b.id));
}

function resources() {
  return [{ ...resource, position: { ...resource.position } }];
}

function sendPlayerState(socket: WebSocket, player: { progressRevision: number; progress: ReturnType<typeof emptyProgress> }) {
  player.progressRevision += 1;
  socket.send(JSON.stringify({ type: 'PLAYER_STATE', revision: player.progressRevision, progress: player.progress }));
}

function broadcast() {
  const payload = JSON.stringify({ type: 'WORLD_STATE', revision, players: snapshots(), resources: resources() });
  for (const socket of players.keys()) {
    if (socket.readyState === WebSocket.OPEN) socket.send(payload);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

server.listen(port, '127.0.0.1', () => {
  console.log(`mock GlyphReach backend listening on ${port}`);
});

const shutdown = () => {
  for (const client of wss.clients) client.terminate();
  wss.close(() => server.close(() => process.exit(0)));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
