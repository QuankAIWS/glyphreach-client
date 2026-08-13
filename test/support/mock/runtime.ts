import { WebSocket } from 'ws';
import { enemy, resource, services, stations, type Player } from './model.js';

export const players = new Map<WebSocket, Player>();
let revision = 0;
let combatRevision = 0;

export function nextWorldRevision(): void { revision += 1; }
export function nextCombatRevision(): void { combatRevision += 1; }
export function snapshot(player: Player) { return { id: player.id, position: { ...player.position } }; }
export function snapshots() { return [...players.values()].map(snapshot).sort((a, b) => a.id.localeCompare(b.id)); }
export function resources() { return [{ ...resource, position: { ...resource.position } }]; }
export function enemies() { return [{ ...enemy, position: { ...enemy.position } }]; }

export function sendPlayerState(socket: WebSocket, player: Player): void {
  player.progressRevision += 1;
  socket.send(JSON.stringify({ type: 'PLAYER_STATE', revision: player.progressRevision, progress: player.progress }));
}
export function sendCombatPlayerState(socket: WebSocket, player: Player): void {
  player.combatProgressRevision += 1;
  socket.send(JSON.stringify({ type: 'COMBAT_PLAYER_STATE', revision: player.combatProgressRevision, combat: player.combat }));
}
export function sendQuestState(socket: WebSocket, player: Player, questSnapshot: (player: Player) => object): void {
  player.questRevision += 1;
  socket.send(JSON.stringify({ type: 'QUEST_STATE', revision: player.questRevision, quests: [questSnapshot(player)] }));
}
export function sendDialogueState(socket: WebSocket, player: Player, dialogue: object | null): void {
  player.dialogueRevision += 1;
  socket.send(JSON.stringify({ type: 'DIALOGUE_STATE', revision: player.dialogueRevision, dialogue }));
}
export function reject(socket: WebSocket, action: string, reason: string): void {
  socket.send(JSON.stringify({ type: 'ACTION_REJECTED', action, reason }));
}
export function broadcast(): void {
  const payload = JSON.stringify({ type: 'WORLD_STATE', revision, players: snapshots(), resources: resources(), stations, services });
  for (const socket of players.keys()) if (socket.readyState === WebSocket.OPEN) socket.send(payload);
}
export function broadcastCombat(): void {
  const payload = JSON.stringify({ type: 'COMBAT_WORLD_STATE', revision: combatRevision, enemies: enemies() });
  for (const socket of players.keys()) if (socket.readyState === WebSocket.OPEN) socket.send(payload);
}
export function actionCategory(type: string): string {
  if (type === 'MOVE_INTENT' || type === 'MOVE_TARGET') return 'movement';
  if (type.includes('GATHERING')) return 'gathering';
  if (type.includes('PROCESSING')) return 'processing';
  if (type === 'EQUIP_ITEM') return 'equipment';
  if (type.startsWith('BANK_')) return 'bank';
  if (type.startsWith('MERCHANT_')) return 'merchant';
  if (type === 'INTERACT_NPC' || type === 'DIALOGUE_CHOICE') return 'quest';
  return 'combat';
}
