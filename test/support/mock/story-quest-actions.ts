import type { WebSocket } from 'ws';
import { consume, distance, itemCount, npcs, type Player } from './model.js';
import { storyDialogueFor, storyQuestSnapshot, syncStoryQuest } from './story-quest.js';
import { reject, sendDialogueState, sendPlayerState, sendQuestState } from './runtime.js';
export function handleStoryQuestAction(socket: WebSocket, player: Player, message: Record<string, unknown>): boolean {
  if (message.type === 'INTERACT_NPC') { const npc = npcs.find((candidate) => candidate.id === message.targetId); if (!npc) { reject(socket, 'quest', 'invalid_npc'); return true; } if (distance(player.position, npc.position) > 82) { reject(socket, 'quest', 'too_far'); return true; } player.activeNpcId = npc.id; sendQuestState(socket, player, storyQuestSnapshot); sendDialogueState(socket, player, storyDialogueFor(player)); return true; }
  if (message.type !== 'DIALOGUE_CHOICE') return false;
  if (message.npcId !== player.activeNpcId) { reject(socket, 'quest', 'conversation_not_open'); return true; }
  const npc = npcs.find((candidate) => candidate.id === message.npcId); if (!npc) { reject(socket, 'quest', 'invalid_npc'); return true; } if (distance(player.position, npc.position) > 82) { reject(socket, 'quest', 'too_far'); return true; }
  if (message.choiceId === 'close') { player.activeNpcId = null; sendDialogueState(socket, player, null); return true; }
  if (message.choiceId === 'accept_first_fieldwork' || message.choiceId === 'accept_first_fieldwork_dry') { if (player.quest.status !== 'not_started') { reject(socket, 'quest', player.quest.status === 'completed' ? 'quest_already_completed' : 'invalid_choice'); return true; } player.quest.status = 'active'; player.quest.stage = 'fieldwork'; sendQuestState(socket, player, storyQuestSnapshot); sendDialogueState(socket, player, storyDialogueFor(player)); return true; }
  if (message.choiceId === 'turn_in_first_fieldwork') { syncStoryQuest(player); if (player.quest.status === 'completed') { reject(socket, 'quest', 'quest_already_completed'); return true; } if (player.quest.stage !== 'return' || player.combat.equipment.weaponItemId !== 'copper_sword') { reject(socket, 'quest', 'quest_not_ready'); return true; } if (itemCount(player.progress.inventory.slots, 'reach_rat_tail') < 1) { reject(socket, 'quest', 'missing_items'); return true; } consume(player.progress.inventory.slots, 'reach_rat_tail', 1); player.progress.wallet.coins += 18; player.quest.status = 'completed'; player.quest.stage = 'completed'; player.quest.rewardClaimed = true; sendQuestState(socket, player, storyQuestSnapshot); sendPlayerState(socket, player); sendDialogueState(socket, player, storyDialogueFor(player)); return true; }
  reject(socket, 'quest', 'invalid_choice'); return true;
}
