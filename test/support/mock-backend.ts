import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

const port = Number(process.env.MOCK_BACKEND_PORT ?? 8787);
const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 600 };
let revision = 0;
let playerNumber = 0;
const players = new Map<WebSocket, { id: string; resumeToken: string; position: { x: number; y: number } }>();

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
      world: { bounds },
    }), () => broadcast());

    socket.on('message', (nextData, nextIsBinary) => {
      if (nextIsBinary) return;
      let value: unknown;
      try { value = JSON.parse(nextData.toString()); } catch { return; }
      const message = value && typeof value === 'object' ? value as Record<string, unknown> : null;
      if (!message || message.type !== 'MOVE_INTENT') return;
      const dx = Number(message.dx);
      const dy = Number(message.dy);
      if (![-1, 0, 1].includes(dx) || ![-1, 0, 1].includes(dy) || (dx === 0 && dy === 0)) return;
      const magnitude = Math.hypot(dx, dy);
      player.position.x = clamp(player.position.x + (dx / magnitude) * 28, bounds.minX, bounds.maxX);
      player.position.y = clamp(player.position.y + (dy / magnitude) * 28, bounds.minY, bounds.maxY);
      revision += 1;
      broadcast();
    });
  });

  socket.on('close', () => {
    if (!players.delete(socket)) return;
    revision += 1;
    broadcast();
  });
});

function snapshot(player: { id: string; position: { x: number; y: number } }) {
  return { id: player.id, position: { ...player.position } };
}

function snapshots() {
  return [...players.values()].map(snapshot).sort((a, b) => a.id.localeCompare(b.id));
}

function broadcast() {
  const payload = JSON.stringify({ type: 'WORLD_STATE', revision, players: snapshots() });
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
