import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const port = Number(process.env.MOCK_BACKEND_PORT ?? 8787);
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
    socket.send(JSON.stringify({
      type: 'WELCOME',
      protocolVersion: 1,
      serverBuild: 'mock-server',
      connectionId: 'mock-connection',
      worldId: 'alpha-1',
      player: { id: 'test-player', position: { x: 500, y: 300 } },
      world: { bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 600 } },
    }));
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`mock GlyphReach backend listening on ${port}`);
});

const shutdown = () => {
  for (const client of wss.clients) client.terminate();
  wss.close(() => server.close(() => process.exit(0)));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
