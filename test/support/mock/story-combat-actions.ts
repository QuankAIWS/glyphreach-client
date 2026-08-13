import type { WebSocket } from 'ws';
import { addItem, consume, distance, enemy, type Player } from './model.js';
import { storyQuestSnapshot, syncStoryQuest } from './story-quest.js';
import { broadcast, broadcastCombat, nextCombatRevision, nextWorldRevision, players, reject, sendCombatPlayerState, sendPlayerState, sendQuestState } from './runtime.js';

export function handleStoryCombatAction(socket: WebSocket, player: Player, message: Record<string, unknown>): boolean {
  if (message.type === 'EQUIP_ITEM' && message.itemId === 'copper_sword') {
    if (!consume(player.progress.inventory.slots, 'copper_sword', 1)) { reject(socket, 'equipment', 'item_not_owned'); return true; }
    player.combat.equipment.weaponItemId = 'copper_sword';
    syncStoryQuest(player); sendPlayerState(socket, player); sendCombatPlayerState(socket, player); sendQuestState(socket, player, storyQuestSnapshot); return true;
  }
  if (message.type !== 'ATTACK_TARGET') return false;
  if (message.targetId !== enemy.id) { reject(socket, 'combat', 'invalid_target'); return true; }
  if (!enemy.alive) { reject(socket, 'combat', 'target_dead'); return true; }
  if (distance(player.position, enemy.position) > 82) { reject(socket, 'combat', 'too_far'); return true; }
  const now = Date.now(); if (now - player.lastAttackAt < 80) { reject(socket, 'combat', 'cooldown'); return true; } player.lastAttackAt = now;
  const damage = player.combat.equipment.weaponItemId === 'copper_sword' ? 4 : 2;
  enemy.health = Math.max(0, enemy.health - damage);
  if (enemy.health === 0) {
    enemy.alive = false; enemy.respawnAt = now + 400; player.progress.wallet.coins += 3; addItem(player.progress.inventory.slots, 'reach_rat_tail', 1, 10); player.combat.skill.xp += 12;
    if (player.quest.status === 'active') { player.quest.killedRat = true; syncStoryQuest(player); sendQuestState(socket, player, storyQuestSnapshot); }
    sendPlayerState(socket, player); sendCombatPlayerState(socket, player); nextCombatRevision(); broadcastCombat();
    setTimeout(() => { enemy.health = enemy.maxHealth; enemy.alive = true; enemy.respawnAt = null; nextCombatRevision(); broadcastCombat(); }, 400);
    return true;
  }
  player.combat.health.current = Math.max(0, player.combat.health.current - 5);
  if (player.combat.health.current === 0) {
    player.combat.health.dead = true; player.combat.health.respawnAt = now + 180; sendCombatPlayerState(socket, player); nextCombatRevision(); broadcastCombat();
    setTimeout(() => { if (!players.has(socket)) return; player.position = { x: 440, y: 300 }; player.combat.health.current = player.combat.health.max; player.combat.health.dead = false; player.combat.health.respawnAt = null; sendCombatPlayerState(socket, player); nextWorldRevision(); broadcast(); }, 180);
    return true;
  }
  sendCombatPlayerState(socket, player); nextCombatRevision(); broadcastCombat(); return true;
}
