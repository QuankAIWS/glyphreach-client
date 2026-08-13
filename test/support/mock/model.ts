export const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 600 };
export const resource = { id: 'copper-vein-alpha-1', kind: 'copper_vein' as const, position: { x: 760, y: 300 }, available: true, respawnAt: null as number | null };
export const stations = [
  { id: 'furnace-alpha-1', kind: 'furnace' as const, position: { x: 570, y: 155 } },
  { id: 'anvil-alpha-1', kind: 'anvil' as const, position: { x: 570, y: 445 } },
];
export const services = [
  { id: 'bank-alpha-1', kind: 'bank' as const, position: { x: 300, y: 180 } },
  { id: 'merchant-alpha-1', kind: 'merchant' as const, position: { x: 300, y: 420 }, offers: [
    { itemId: 'copper_ore', buyPrice: 4, sellPrice: 2 },
    { itemId: 'copper_bar', buyPrice: 9, sellPrice: 3 },
    { itemId: 'copper_pickaxe', buyPrice: 22, sellPrice: 7 },
    { itemId: 'copper_sword', buyPrice: 24, sellPrice: 8 },
  ] },
];
export const npcs = [{ id: 'surveyor-alpha-1', displayName: 'Surveyor Rhea', position: { x: 515, y: 345 } }];
export const enemy = { id: 'reach-rat-alpha-1', kind: 'reach_rat' as const, position: { x: 820, y: 470 }, health: 14, maxHealth: 14, alive: true, respawnAt: null as number | null };

export interface Slot { slot: number; itemId: string; quantity: number; }
export interface Progress {
  inventory: { capacity: number; slots: Slot[] };
  bank: { capacity: number; slots: Slot[] };
  wallet: { coins: number };
  equipment: { toolItemId: string | null };
  skills: { mining: { xp: number; level: number }; smithing: { xp: number; level: number } };
  gathering: null | { nodeId: string; mode: 'focused' | 'steady'; startedAt: number; completesAt: number };
  processing: null | { stationId: string; recipeId: string; startedAt: number; completesAt: number };
}
export interface Combat {
  health: { current: number; max: number; dead: boolean; respawnAt: number | null };
  skill: { xp: number; level: number };
  equipment: { weaponItemId: string | null };
}
export interface QuestState {
  status: 'not_started' | 'active' | 'completed';
  stage: 'available' | 'fieldwork' | 'return' | 'completed';
  minedCopper: boolean;
  killedRat: boolean;
  rewardClaimed: boolean;
}
export interface Player {
  id: string;
  resumeToken: string;
  position: { x: number; y: number };
  progressRevision: number;
  combatProgressRevision: number;
  questRevision: number;
  dialogueRevision: number;
  progress: Progress;
  combat: Combat;
  quest: QuestState;
  activeNpcId: string | null;
  lastAttackAt: number;
}

export function emptyProgress(): Progress {
  return {
    inventory: { capacity: 24, slots: [] }, bank: { capacity: 60, slots: [] }, wallet: { coins: 0 }, equipment: { toolItemId: null },
    skills: { mining: { xp: 0, level: 1 }, smithing: { xp: 0, level: 1 } }, gathering: null, processing: null,
  };
}
export function emptyCombat(): Combat {
  return { health: { current: 20, max: 20, dead: false, respawnAt: null }, skill: { xp: 0, level: 1 }, equipment: { weaponItemId: null } };
}
export function emptyQuest(): QuestState { return { status: 'not_started', stage: 'available', minedCopper: false, killedRat: false, rewardClaimed: false }; }
export function syncQuest(player: Player): void {
  if (player.quest.status === 'active') player.quest.stage = player.quest.minedCopper && player.quest.killedRat ? 'return' : 'fieldwork';
}
export function questSnapshot(player: Player) {
  syncQuest(player);
  const completed = player.quest.status === 'completed';
  return {
    questId: 'first-fieldwork-alpha', title: 'First Fieldwork', status: player.quest.status, stage: player.quest.stage,
    objectives: [
      { id: 'mine_copper', label: 'Mine a copper sample after accepting the job', complete: completed || player.quest.minedCopper },
      { id: 'defeat_rat', label: 'Defeat the Reach rat after accepting the job', complete: completed || player.quest.killedRat },
      { id: 'bring_proof', label: 'Return with 1 copper ore and 1 Reach rat tail', complete: completed || (itemCount(player.progress.inventory.slots, 'copper_ore') > 0 && itemCount(player.progress.inventory.slots, 'reach_rat_tail') > 0) },
    ],
  };
}
export function dialogueFor(player: Player) {
  if (player.quest.status === 'not_started') return { npcId: 'surveyor-alpha-1', speaker: 'Surveyor Rhea', text: 'Bring me a fresh copper sample and proof you handled the rat east of camp.', choices: [{ id: 'accept_first_fieldwork', label: 'I will take a look.' }, { id: 'close', label: 'Not right now.' }] };
  if (player.quest.status === 'completed') return { npcId: 'surveyor-alpha-1', speaker: 'Surveyor Rhea', text: 'The first survey is closed. Good work.', choices: [{ id: 'close', label: 'Leave.' }] };
  syncQuest(player);
  if (player.quest.stage === 'fieldwork') return { npcId: 'surveyor-alpha-1', speaker: 'Surveyor Rhea', text: 'Finish the fieldwork I assigned after we spoke.', choices: [{ id: 'close', label: 'Back to it.' }] };
  return { npcId: 'surveyor-alpha-1', speaker: 'Surveyor Rhea', text: 'If you have the copper sample and rat tail, I can close the survey.', choices: [{ id: 'turn_in_first_fieldwork', label: 'Turn in the fieldwork.' }, { id: 'close', label: 'Not yet.' }] };
}
export function addItem(slots: Slot[], itemId: string, quantity: number, stackLimit: number): void {
  let remaining = quantity;
  for (const slot of slots) {
    if (remaining <= 0) break;
    if (slot.itemId !== itemId || slot.quantity >= stackLimit) continue;
    const added = Math.min(remaining, stackLimit - slot.quantity);
    slot.quantity += added;
    remaining -= added;
  }
  const occupied = new Set(slots.map((slot) => slot.slot));
  let slotNumber = 0;
  while (remaining > 0) {
    while (occupied.has(slotNumber)) slotNumber += 1;
    const added = Math.min(remaining, stackLimit);
    slots.push({ slot: slotNumber, itemId, quantity: added });
    occupied.add(slotNumber);
    remaining -= added;
  }
  slots.sort((a, b) => a.slot - b.slot);
}
export function consume(slots: Slot[], itemId: string, quantity: number): boolean {
  if (itemCount(slots, itemId) < quantity) return false;
  let remaining = quantity;
  for (const slot of slots) {
    if (remaining <= 0 || slot.itemId !== itemId) continue;
    const used = Math.min(remaining, slot.quantity);
    slot.quantity -= used;
    remaining -= used;
  }
  for (let index = slots.length - 1; index >= 0; index -= 1) if (slots[index]!.quantity <= 0) slots.splice(index, 1);
  return true;
}
export function itemCount(slots: Slot[], itemId: string): number { return slots.filter((slot) => slot.itemId === itemId).reduce((sum, slot) => sum + slot.quantity, 0); }
export function stackLimitFor(itemId: string): number { return itemId === 'reach_rat_tail' ? 10 : 1; }
export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number { return Math.hypot(a.x - b.x, a.y - b.y); }
export function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
