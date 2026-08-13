export interface RuinState {
  position: { x: number; y: number };
  playerHealth: number;
  wardenHealth: number;
  coins: number;
  cookedFish: number;
  hasCore: boolean;
  hasToken: boolean;
  questStatus: 'not_started' | 'active' | 'completed';
  questStage: 'available' | 'fieldwork' | 'return' | 'completed';
  vaultFound: boolean;
  marksRead: boolean;
  wardenDefeated: boolean;
}
export function createRuinState(): RuinState {
  return { position: { x: 475, y: 345 }, playerHealth: 20, wardenHealth: 28, coins: 48, cookedFish: 3, hasCore: false, hasToken: false, questStatus: 'not_started', questStage: 'available', vaultFound: false, marksRead: false, wardenDefeated: false };
}
export function ruinProgress(state: RuinState) {
  const slots: Array<{ slot: number; itemId: string; quantity: number }> = [{ slot: 0, itemId: 'waystone_fragment', quantity: 1 }];
  if (state.cookedFish > 0) slots.push({ slot: 1, itemId: 'cooked_riverfish', quantity: state.cookedFish });
  if (state.hasCore) slots.push({ slot: 2, itemId: 'warden_core', quantity: 1 });
  if (state.hasToken) slots.push({ slot: 3, itemId: 'old_route_token', quantity: 1 });
  return { inventory: { capacity: 24, slots }, bank: { capacity: 64, slots: [] }, wallet: { coins: state.coins }, equipment: { toolItemId: null }, skills: { mining: { xp: 20, level: 1 }, smithing: { xp: 20, level: 1 }, fishing: { xp: 35, level: 2 }, cooking: { xp: 32, level: 2 } }, gathering: null, processing: null, worldFlags: { northernRoadOpen: true }, discoveries: ['weathered-waystone-alpha-1'] };
}
export function ruinEnemies(state: RuinState) {
  return [
    { id: 'reach-rat-alpha-1', kind: 'reach_rat', position: { x: 820, y: 470 }, health: 14, maxHealth: 14, alive: true, respawnAt: null },
    { id: 'road-wolf-alpha-1', kind: 'road_wolf', position: { x: 900, y: 135 }, health: 24, maxHealth: 24, alive: true, respawnAt: null },
    { id: 'waystone-warden-alpha-1', kind: 'road_wolf', position: { x: 924, y: 392 }, health: state.wardenHealth, maxHealth: 28, alive: state.wardenHealth > 0, respawnAt: state.wardenHealth > 0 ? null : Date.now() + 60_000 },
  ];
}
