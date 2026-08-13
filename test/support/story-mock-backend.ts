import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { bounds, emptyCombat, emptyProgress, emptyQuest, npcs, services, stations, type Player } from './mock/model.js';
import { handleEconomyAction } from './mock/economy-actions.js';
import { handleWorldAction } from './mock/world-actions.js';
import { handleStoryCombatAction } from './mock/story-combat-actions.js';
import { handleStoryQuestAction } from './mock/story-quest-actions.js';
import { storyQuestSnapshot } from './mock/story-quest.js';
import { actionCategory, broadcast, broadcastCombat, enemies, nextWorldRevision, players, reject, resources, sendQuestState, snapshot, snapshots } from './mock/runtime.js';

const port = Number(process.env.MOCK_BACKEND_PORT ?? 8787);
let playerNumber = 0;
const server = createServer((request, response) => { if (request.url === '/healthz') { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ status: 'ok' })); return; } response.writeHead(404).end(); });
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 16 * 1024 });
server.on('upgrade', (request, socket, head) => { if (request.url !== '/world') { socket.destroy(); return; } wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request)); });

wss.on('connection', (socket) => {
  socket.once('message', (data, isBinary) => {
    if (isBinary) return socket.close(1002, 'text only');
    let hello: unknown; try { hello = JSON.parse(data.toString()); } catch { hello = null; }
    const record = hello && typeof hello === 'object' ? hello as Record<string, unknown> : null;
    if (!record || record.type !== 'HELLO' || record.protocolVersion !== 1) { socket.send(JSON.stringify({ type: 'REJECT', reason: 'protocol_mismatch', supportedProtocolVersion: 1 })); socket.close(1002, 'protocol mismatch'); return; }
    playerNumber += 1;
    const player: Player = { id: `test-player-${playerNumber}`, resumeToken: randomUUID(), position: { x: 380 + playerNumber * 80, y: 300 }, progressRevision: 0, combatProgressRevision: 0, questRevision: 0, dialogueRevision: 0, progress: emptyProgress(), combat: emptyCombat(), quest: emptyQuest(), activeNpcId: null, lastAttackAt: 0 };
    players.set(socket, player); nextWorldRevision();
    socket.send(JSON.stringify({ type: 'WELCOME', protocolVersion: 1, serverBuild: 'mock-story-server', connectionId: randomUUID(), resumeToken: player.resumeToken, worldId: 'alpha-1', player: snapshot(player), players: snapshots(), resources: resources(), stations, services, npcs, progress: player.progress, enemies: enemies(), combat: player.combat, quests: [storyQuestSnapshot(player)], world: { bounds } }), () => { broadcast(); broadcastCombat(); });
    socket.on('message', (nextData, nextIsBinary) => {
      if (nextIsBinary) return;
      let value: unknown; try { value = JSON.parse(nextData.toString()); } catch { return; }
      const message = value && typeof value === 'object' ? value as Record<string, unknown> : null; if (!message) return;
      if (player.combat.health.dead) { reject(socket, actionCategory(String(message.type)), 'player_dead'); return; }
      if (handleStoryQuestAction(socket, player, message)) return;
      if (handleWorldAction(socket, player, message)) { setTimeout(() => { if (players.has(socket)) sendQuestState(socket, player, storyQuestSnapshot); }, 180); return; }
      if (handleEconomyAction(socket, player, message)) return;
      handleStoryCombatAction(socket, player, message);
    });
  });
  socket.on('close', () => { if (!players.delete(socket)) return; nextWorldRevision(); broadcast(); });
});
server.listen(port, '127.0.0.1', () => console.log(`story mock GlyphReach backend listening on ${port}`));
const shutdown = () => { for (const client of wss.clients) client.terminate(); wss.close(() => server.close(() => process.exit(0))); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
