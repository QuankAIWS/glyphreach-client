import {
  parseServerMessage,
  type ActionRejectedMessage as BaseActionRejectedMessage,
  type ServerMessage as BaseServerMessage,
  type WelcomeMessage as BaseWelcomeMessage,
} from './v1';

export interface NpcSnapshot { id: string; displayName: string; position: { x: number; y: number }; }
export type QuestStatus = 'not_started' | 'active' | 'completed';
export type QuestStage = 'available' | 'fieldwork' | 'return' | 'completed';
export interface QuestObjectiveSnapshot { id: string; label: string; complete: boolean; }
export interface QuestJournalSnapshot { questId: string; title: string; status: QuestStatus; stage: QuestStage; objectives: QuestObjectiveSnapshot[]; }
export interface DialogueChoiceSnapshot { id: string; label: string; }
export interface DialogueSnapshot { npcId: string; speaker: string; text: string; choices: DialogueChoiceSnapshot[]; }
export interface QuestStateMessage { type: 'QUEST_STATE'; revision: number; quests: QuestJournalSnapshot[]; }
export interface DialogueStateMessage { type: 'DIALOGUE_STATE'; revision: number; dialogue: DialogueSnapshot | null; }
export interface QuestActionRejectedMessage {
  type: 'ACTION_REJECTED';
  action: 'quest';
  reason: 'invalid_npc' | 'conversation_not_open' | 'invalid_choice' | 'quest_not_ready' | 'quest_already_completed' | 'too_far' | 'already_busy' | 'player_dead' | 'missing_items' | 'transaction_failed';
}
export type ActionRejectedMessage = BaseActionRejectedMessage | QuestActionRejectedMessage;
export interface WelcomeMessage extends BaseWelcomeMessage { npcs: NpcSnapshot[]; quests: QuestJournalSnapshot[]; }
export type ServerMessage = Exclude<BaseServerMessage, BaseWelcomeMessage | BaseActionRejectedMessage> | WelcomeMessage | ActionRejectedMessage | QuestStateMessage | DialogueStateMessage;

export function createInteractNpc(sequence: number, targetId: string) { return { type: 'INTERACT_NPC' as const, sequence, targetId }; }
export function createDialogueChoice(sequence: number, npcId: string, choiceId: string) { return { type: 'DIALOGUE_CHOICE' as const, sequence, npcId, choiceId }; }

export function parseGlyphReachServerMessage(raw: string): ServerMessage {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Server sent invalid JSON'); }
  if (!isRecord(value) || typeof value.type !== 'string') throw new Error('Server message is missing a type');

  if (value.type === 'QUEST_STATE') {
    if (!Number.isSafeInteger(value.revision) || !isQuests(value.quests)) throw new Error('Malformed QUEST_STATE message');
    return value as unknown as QuestStateMessage;
  }
  if (value.type === 'DIALOGUE_STATE') {
    if (!Number.isSafeInteger(value.revision) || !(value.dialogue === null || isDialogue(value.dialogue))) throw new Error('Malformed DIALOGUE_STATE message');
    return value as unknown as DialogueStateMessage;
  }
  if (value.type === 'ACTION_REJECTED' && value.action === 'quest') {
    const reasons = ['invalid_npc', 'conversation_not_open', 'invalid_choice', 'quest_not_ready', 'quest_already_completed', 'too_far', 'already_busy', 'player_dead', 'missing_items', 'transaction_failed'];
    if (!reasons.includes(String(value.reason))) throw new Error('Malformed ACTION_REJECTED message');
    return value as unknown as QuestActionRejectedMessage;
  }

  const base = parseServerMessage(raw);
  if (base.type !== 'WELCOME') return base as ServerMessage;
  if (!isNpcs(value.npcs) || !isQuests(value.quests)) throw new Error('Malformed WELCOME quest projection');
  return base as WelcomeMessage;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function isPosition(value: unknown): boolean { return isRecord(value) && typeof value.x === 'number' && Number.isFinite(value.x) && typeof value.y === 'number' && Number.isFinite(value.y); }
function isNpc(value: unknown): value is NpcSnapshot { return isRecord(value) && typeof value.id === 'string' && typeof value.displayName === 'string' && isPosition(value.position); }
function isNpcs(value: unknown): value is NpcSnapshot[] { return Array.isArray(value) && value.every(isNpc); }
function isObjective(value: unknown): value is QuestObjectiveSnapshot { return isRecord(value) && typeof value.id === 'string' && typeof value.label === 'string' && typeof value.complete === 'boolean'; }
function isQuest(value: unknown): value is QuestJournalSnapshot {
  return isRecord(value) && typeof value.questId === 'string' && typeof value.title === 'string' &&
    (value.status === 'not_started' || value.status === 'active' || value.status === 'completed') &&
    (value.stage === 'available' || value.stage === 'fieldwork' || value.stage === 'return' || value.stage === 'completed') &&
    Array.isArray(value.objectives) && value.objectives.every(isObjective);
}
function isQuests(value: unknown): value is QuestJournalSnapshot[] { return Array.isArray(value) && value.every(isQuest); }
function isChoice(value: unknown): value is DialogueChoiceSnapshot { return isRecord(value) && typeof value.id === 'string' && typeof value.label === 'string'; }
function isDialogue(value: unknown): value is DialogueSnapshot { return isRecord(value) && typeof value.npcId === 'string' && typeof value.speaker === 'string' && typeof value.text === 'string' && Array.isArray(value.choices) && value.choices.every(isChoice); }
