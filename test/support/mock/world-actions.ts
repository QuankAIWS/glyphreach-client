import type { WebSocket } from 'ws';
import { addItem, bounds, clamp, consume, distance, questSnapshot, resource, stations, syncQuest, type Player } from './model.js';
import { broadcast, nextWorldRevision, players, reject, sendPlayerState, sendQuestState } from './runtime.js';

export function handleWorldAction(socket: WebSocket, player: Player, message: Record<string, unknown>): boolean {
  if (message.type === 'MOVE_INTENT') {
    const dx = Number(message.dx);
    const dy = Number(message.dy);
    if (![-1, 0, 1].includes(dx) || ![-1, 0, 1].includes(dy) || (dx === 0 && dy === 0)) return true;
    const magnitude = Math.hypot(dx, dy);
    player.position.x = clamp(player.position.x + (dx / magnitude) * 28, bounds.minX, bounds.maxX);
    player.position.y = clamp(player.position.y + (dy / magnitude) * 28, bounds.minY, bounds.maxY);
    nextWorldRevision();
    broadcast();
    return true;
  }

  if (message.type === 'MOVE_TARGET') {
    const target = message.target as { x?: unknown; y?: unknown } | undefined;
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') return true;
    if (target.x < bounds.minX || target.x > bounds.maxX || target.y < bounds.minY || target.y > bounds.maxY) {
      reject(socket, 'movement', 'invalid_target');
      return true;
    }
    player.position = { x: target.x, y: target.y };
    nextWorldRevision();
    broadcast();
    return true;
  }

  if (message.type === 'START_GATHERING') {
    if (distance(player.position, resource.position) > 86) { reject(socket, 'gathering', 'too_far'); return true; }
    if (!resource.available) { reject(socket, 'gathering', 'node_unavailable'); return true; }
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
        sendQuestState(socket, player, questSnapshot);
      }
      sendPlayerState(socket, player);
      nextWorldRevision();
      broadcast();
      setTimeout(() => {
        resource.available = true;
        resource.respawnAt = null;
        nextWorldRevision();
        broadcast();
      }, 120);
    }, 100);
    return true;
  }

  if (message.type === 'CANCEL_GATHERING') {
    player.progress.gathering = null;
    sendPlayerState(socket, player);
    return true;
  }

  if (message.type === 'START_PROCESSING') {
    const station = stations.find((candidate) => candidate.id === message.stationId);
    if (!station) return true;
    if (distance(player.position, station.position) > 86) { reject(socket, 'processing', 'too_far'); return true; }
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
    return true;
  }

  if (message.type === 'CANCEL_PROCESSING') {
    player.progress.processing = null;
    sendPlayerState(socket, player);
    return true;
  }

  if (message.type === 'EQUIP_ITEM' && message.itemId !== 'copper_sword') {
    const itemId = String(message.itemId);
    if (!consume(player.progress.inventory.slots, itemId, 1)) { reject(socket, 'equipment', 'item_not_owned'); return true; }
    player.progress.equipment.toolItemId = itemId;
    sendPlayerState(socket, player);
    return true;
  }

  return false;
}
