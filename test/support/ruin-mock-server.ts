import { WebSocket, WebSocketServer } from 'ws';
import { createRuinState, ruinEnemies, ruinProgress, type RuinState } from './ruin-mock-data';
import { ruinQuests } from './ruin-mock-quests';

export async function startRuinMockServer(port = 8790): Promise<{ close(): Promise<void> }> {
  const wss = new WebSocketServer({ host: '127.0.0.1', port });
  await new Promise<void>((resolve, reject) => { wss.once('listening', resolve); wss.once('error', reject); });
  wss.on('connection', (socket) => {
    const state = createRuinState();
    let revision = 0;
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (message.type === 'HELLO') return send(socket, welcome(state));
      if (message.type === 'MOVE_TARGET') return move(socket, state, message.target as { x: number; y: number }, ++revision);
      if (message.type === 'INTERACT_NPC') return talk(socket, state, ++revision);
      if (message.type === 'DIALOGUE_CHOICE') return choose(socket, state, String(message.choiceId), ++revision);
      if (message.type === 'ATTACK_TARGET' && message.targetId === 'waystone-warden-alpha-1') return attack(socket, state, ++revision);
      if (message.type === 'USE_ITEM' && message.itemId === 'cooked_riverfish') return eat(socket, state, ++revision);
    });
  });
  return { close: () => new Promise<void>((resolve) => { for (const client of wss.clients) client.terminate(); wss.close(() => resolve()); }) };
}

function welcome(state: RuinState) {
  return { type: 'WELCOME', protocolVersion: 1, serverBuild: 'm9-browser-mock', connectionId: 'm9-connection', resumeToken: 'm9-browser-token', worldId: 'alpha-1', player: { id: 'm9-player', position: state.position }, players: [{ id: 'm9-player', position: state.position }], resources: [], stations: [], services: [], npcs: [{ id: 'surveyor-alpha-1', displayName: 'Surveyor Rhea', position: { x: 515, y: 345 } }, { id: 'northwatch-cook-alpha-1', displayName: 'Cook Sella', position: { x: 700, y: 105 } }], progress: ruinProgress(state), enemies: ruinEnemies(state), combat: combat(state), quests: ruinQuests(state), world: { bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 600 } } };
}

function move(socket: WebSocket, state: RuinState, target: { x: number; y: number }, revision: number): void {
  state.position = target;
  send(socket, { type: 'WORLD_STATE', revision, players: [{ id: 'm9-player', position: state.position }], resources: [], stations: [], services: [] });
  if (state.questStatus !== 'active') return;
  if (near(target, { x: 900, y: 270 }, 60)) state.vaultFound = true;
  if (state.vaultFound && near(target, { x: 944, y: 318 }, 60)) state.marksRead = true;
  if (state.vaultFound && near(target, { x: 972, y: 474 }, 55) && !state.hasToken) { state.hasToken = true; playerState(socket, state, revision); }
  questState(socket, state, revision);
}

function talk(socket: WebSocket, state: RuinState, revision: number): void {
  const choices = state.questStatus === 'not_started'
    ? [{ id: 'accept_stone_below_dry', label: 'So the ancient basement has a maintenance problem.' }]
    : state.questStage === 'return'
      ? [{ id: 'turn_in_stone_below', label: 'Add it to the survey ledger.' }]
      : [{ id: 'close', label: 'Return to the vault.' }];
  const text = state.questStatus === 'not_started' ? 'The fragment points to a buried Northreach vault. Take food.' : state.questStage === 'return' ? 'That core matches the old survey marks.' : 'The vault is east of the old road.';
  send(socket, { type: 'DIALOGUE_STATE', revision, dialogue: { npcId: 'surveyor-alpha-1', speaker: 'Surveyor Rhea', text, choices } });
}

function choose(socket: WebSocket, state: RuinState, choice: string, revision: number): void {
  if (choice === 'accept_stone_below_dry') { state.questStatus = 'active'; state.questStage = 'fieldwork'; questState(socket, state, revision); return; }
  if (choice === 'turn_in_stone_below' && state.questStage === 'return' && state.hasCore) { state.questStatus = 'completed'; state.questStage = 'completed'; state.hasCore = false; state.coins += 36; questState(socket, state, revision); playerState(socket, state, revision); talk(socket, state, revision); return; }
  send(socket, { type: 'ACTION_REJECTED', action: 'quest', reason: state.questStatus === 'completed' ? 'quest_already_completed' : 'quest_not_ready' });
}

function attack(socket: WebSocket, state: RuinState, revision: number): void {
  if (state.questStatus !== 'active' || !state.marksRead) { send(socket, { type: 'ACTION_REJECTED', action: 'combat', reason: 'route_locked' }); return; }
  if (state.wardenHealth <= 0) return;
  state.wardenHealth = Math.max(0, state.wardenHealth - 4);
  if (state.wardenHealth > 0) state.playerHealth = Math.max(0, state.playerHealth - 5);
  send(socket, { type: 'COMBAT_WORLD_STATE', revision, enemies: ruinEnemies(state) });
  send(socket, { type: 'COMBAT_PLAYER_STATE', revision, combat: combat(state) });
  if (state.wardenHealth === 0) { state.wardenDefeated = true; state.hasCore = true; state.coins += 8; state.questStage = 'return'; playerState(socket, state, revision); questState(socket, state, revision); }
}

function eat(socket: WebSocket, state: RuinState, revision: number): void {
  if (state.cookedFish < 1 || state.playerHealth >= 20) return;
  state.cookedFish -= 1; state.playerHealth = Math.min(20, state.playerHealth + 7);
  playerState(socket, state, revision); send(socket, { type: 'COMBAT_PLAYER_STATE', revision, combat: combat(state) });
}
function combat(state: RuinState) { return { health: { current: state.playerHealth, max: 20, dead: state.playerHealth <= 0, respawnAt: null }, skill: { xp: 34, level: 2 }, equipment: { weaponItemId: 'copper_sword' } }; }
function playerState(socket: WebSocket, state: RuinState, revision: number): void { send(socket, { type: 'PLAYER_STATE', revision, progress: ruinProgress(state) }); }
function questState(socket: WebSocket, state: RuinState, revision: number): void { send(socket, { type: 'QUEST_STATE', revision, quests: ruinQuests(state) }); }
function send(socket: WebSocket, message: object): void { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
function near(a: { x: number; y: number }, b: { x: number; y: number }, radius: number): boolean { return Math.hypot(a.x - b.x, a.y - b.y) <= radius; }
