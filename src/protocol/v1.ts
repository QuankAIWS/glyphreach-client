export const PROTOCOL_VERSION = 1 as const;

export interface Position { x: number; y: number; }
export interface WorldBounds { minX: number; minY: number; maxX: number; maxY: number; }
export interface PlayerSnapshot { id: string; position: Position; }
export interface ResourceNodeSnapshot { id: string; kind: 'copper_vein'; position: Position; available: boolean; respawnAt: number | null; }
export type StationKind = 'furnace' | 'anvil';
export interface StationSnapshot { id: string; kind: StationKind; position: Position; }
export interface MerchantOfferSnapshot { itemId: string; buyPrice: number; sellPrice: number; }
export type ServiceSnapshot =
  | { id: string; kind: 'bank'; position: Position }
  | { id: string; kind: 'merchant'; position: Position; offers: MerchantOfferSnapshot[] };
export interface InventorySlotSnapshot { slot: number; itemId: string; quantity: number; }
export interface InventorySnapshot { capacity: number; slots: InventorySlotSnapshot[]; }
export interface BankSnapshot { capacity: number; slots: InventorySlotSnapshot[]; }
export interface SkillSnapshot { xp: number; level: number; }
export type GatheringMode = 'focused' | 'steady';
export interface GatheringSnapshot { nodeId: string; mode: GatheringMode; startedAt: number; completesAt: number; }
export interface ProcessingSnapshot { stationId: string; recipeId: string; startedAt: number; completesAt: number; }
export interface PlayerProgressSnapshot {
  inventory: InventorySnapshot;
  bank: BankSnapshot;
  wallet: { coins: number };
  equipment: { toolItemId: string | null };
  skills: { mining: SkillSnapshot; smithing: SkillSnapshot };
  gathering: GatheringSnapshot | null;
  processing: ProcessingSnapshot | null;
}

export interface HelloMessage { type: 'HELLO'; protocolVersion: typeof PROTOCOL_VERSION; clientBuild: string; resumeToken?: string; }
export interface MoveIntentMessage { type: 'MOVE_INTENT'; sequence: number; dx: -1 | 0 | 1; dy: -1 | 0 | 1; }
export interface MoveTargetMessage { type: 'MOVE_TARGET'; sequence: number; target: Position; }
export interface StartGatheringMessage { type: 'START_GATHERING'; sequence: number; nodeId: string; mode: GatheringMode; }
export interface CancelGatheringMessage { type: 'CANCEL_GATHERING'; sequence: number; }
export interface StartProcessingMessage { type: 'START_PROCESSING'; sequence: number; stationId: string; recipeId: string; }
export interface CancelProcessingMessage { type: 'CANCEL_PROCESSING'; sequence: number; }
export interface EquipItemMessage { type: 'EQUIP_ITEM'; sequence: number; itemId: string; }
export interface BankDepositMessage { type: 'BANK_DEPOSIT'; sequence: number; serviceId: string; itemId: string; quantity: number; }
export interface BankWithdrawMessage { type: 'BANK_WITHDRAW'; sequence: number; serviceId: string; itemId: string; quantity: number; }
export interface MerchantBuyMessage { type: 'MERCHANT_BUY'; sequence: number; serviceId: string; itemId: string; quantity: number; }
export interface MerchantSellMessage { type: 'MERCHANT_SELL'; sequence: number; serviceId: string; itemId: string; quantity: number; }

export interface WelcomeMessage {
  type: 'WELCOME';
  protocolVersion: typeof PROTOCOL_VERSION;
  serverBuild: string;
  connectionId: string;
  resumeToken: string;
  worldId: string;
  player: PlayerSnapshot;
  players: PlayerSnapshot[];
  resources: ResourceNodeSnapshot[];
  stations: StationSnapshot[];
  services: ServiceSnapshot[];
  progress: PlayerProgressSnapshot;
  world: { bounds: WorldBounds };
}
export interface WorldStateMessage { type: 'WORLD_STATE'; revision: number; players: PlayerSnapshot[]; resources: ResourceNodeSnapshot[]; stations: StationSnapshot[]; services: ServiceSnapshot[]; }
export interface PlayerStateMessage { type: 'PLAYER_STATE'; revision: number; progress: PlayerProgressSnapshot; }
export interface ActionRejectedMessage {
  type: 'ACTION_REJECTED';
  action: 'movement' | 'gathering' | 'processing' | 'equipment' | 'bank' | 'merchant';
  reason: 'invalid_target' | 'too_far' | 'node_unavailable' | 'inventory_full' | 'already_busy' | 'not_gathering' | 'not_processing' | 'invalid_recipe' | 'wrong_station' | 'missing_items' | 'item_not_owned' | 'invalid_equipment' | 'invalid_service' | 'invalid_quantity' | 'bank_full' | 'bank_missing_item' | 'insufficient_coins' | 'item_not_traded' | 'transaction_failed';
}
export interface RejectMessage { type: 'REJECT'; reason: 'protocol_mismatch' | 'invalid_message'; supportedProtocolVersion: typeof PROTOCOL_VERSION; }
export type ServerMessage = WelcomeMessage | WorldStateMessage | PlayerStateMessage | ActionRejectedMessage | RejectMessage;

export function createHello(clientBuild: string, resumeToken?: string): HelloMessage { return { type: 'HELLO', protocolVersion: PROTOCOL_VERSION, clientBuild, ...(resumeToken ? { resumeToken } : {}) }; }
export function createMoveIntent(sequence: number, dx: -1 | 0 | 1, dy: -1 | 0 | 1): MoveIntentMessage { return { type: 'MOVE_INTENT', sequence, dx, dy }; }
export function createMoveTarget(sequence: number, target: Position): MoveTargetMessage { return { type: 'MOVE_TARGET', sequence, target }; }
export function createStartGathering(sequence: number, nodeId: string, mode: GatheringMode): StartGatheringMessage { return { type: 'START_GATHERING', sequence, nodeId, mode }; }
export function createCancelGathering(sequence: number): CancelGatheringMessage { return { type: 'CANCEL_GATHERING', sequence }; }
export function createStartProcessing(sequence: number, stationId: string, recipeId: string): StartProcessingMessage { return { type: 'START_PROCESSING', sequence, stationId, recipeId }; }
export function createCancelProcessing(sequence: number): CancelProcessingMessage { return { type: 'CANCEL_PROCESSING', sequence }; }
export function createEquipItem(sequence: number, itemId: string): EquipItemMessage { return { type: 'EQUIP_ITEM', sequence, itemId }; }
export function createBankDeposit(sequence: number, serviceId: string, itemId: string, quantity: number): BankDepositMessage { return { type: 'BANK_DEPOSIT', sequence, serviceId, itemId, quantity }; }
export function createBankWithdraw(sequence: number, serviceId: string, itemId: string, quantity: number): BankWithdrawMessage { return { type: 'BANK_WITHDRAW', sequence, serviceId, itemId, quantity }; }
export function createMerchantBuy(sequence: number, serviceId: string, itemId: string, quantity: number): MerchantBuyMessage { return { type: 'MERCHANT_BUY', sequence, serviceId, itemId, quantity }; }
export function createMerchantSell(sequence: number, serviceId: string, itemId: string, quantity: number): MerchantSellMessage { return { type: 'MERCHANT_SELL', sequence, serviceId, itemId, quantity }; }

export function parseServerMessage(raw: string): ServerMessage {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Server sent invalid JSON'); }
  if (!isRecord(value) || typeof value.type !== 'string') throw new Error('Server message is missing a type');

  if (value.type === 'REJECT') {
    if ((value.reason !== 'protocol_mismatch' && value.reason !== 'invalid_message') || value.supportedProtocolVersion !== PROTOCOL_VERSION) throw new Error('Malformed REJECT message');
    return value as unknown as RejectMessage;
  }
  if (value.type === 'ACTION_REJECTED') {
    const actions = ['movement', 'gathering', 'processing', 'equipment', 'bank', 'merchant'];
    const reasons = ['invalid_target', 'too_far', 'node_unavailable', 'inventory_full', 'already_busy', 'not_gathering', 'not_processing', 'invalid_recipe', 'wrong_station', 'missing_items', 'item_not_owned', 'invalid_equipment', 'invalid_service', 'invalid_quantity', 'bank_full', 'bank_missing_item', 'insufficient_coins', 'item_not_traded', 'transaction_failed'];
    if (!actions.includes(String(value.action)) || !reasons.includes(String(value.reason))) throw new Error('Malformed ACTION_REJECTED message');
    return value as unknown as ActionRejectedMessage;
  }
  if (value.type === 'PLAYER_STATE') {
    if (!Number.isSafeInteger(value.revision) || !isProgress(value.progress)) throw new Error('Malformed PLAYER_STATE message');
    return value as unknown as PlayerStateMessage;
  }
  if (value.type === 'WORLD_STATE') {
    if (!Number.isSafeInteger(value.revision) || !isPlayers(value.players) || !isResources(value.resources) || !isStations(value.stations) || !isServices(value.services)) throw new Error('Malformed WORLD_STATE message');
    return value as unknown as WorldStateMessage;
  }
  if (value.type !== 'WELCOME') throw new Error(`Unknown server message type: ${value.type}`);
  if (
    value.protocolVersion !== PROTOCOL_VERSION || typeof value.serverBuild !== 'string' ||
    typeof value.connectionId !== 'string' || typeof value.resumeToken !== 'string' || typeof value.worldId !== 'string' ||
    !isPlayer(value.player) || !isPlayers(value.players) || !isResources(value.resources) || !isStations(value.stations) || !isServices(value.services) ||
    !isProgress(value.progress) || !isRecord(value.world) || !isBounds(value.world.bounds)
  ) throw new Error('Malformed WELCOME message');
  return value as unknown as WelcomeMessage;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function isPosition(value: unknown): value is Position { return isRecord(value) && typeof value.x === 'number' && Number.isFinite(value.x) && typeof value.y === 'number' && Number.isFinite(value.y); }
function isPlayer(value: unknown): value is PlayerSnapshot { return isRecord(value) && typeof value.id === 'string' && value.id.length > 0 && isPosition(value.position); }
function isPlayers(value: unknown): value is PlayerSnapshot[] { return Array.isArray(value) && value.every(isPlayer); }
function isResource(value: unknown): value is ResourceNodeSnapshot { return isRecord(value) && typeof value.id === 'string' && value.kind === 'copper_vein' && isPosition(value.position) && typeof value.available === 'boolean' && (value.respawnAt === null || typeof value.respawnAt === 'number'); }
function isResources(value: unknown): value is ResourceNodeSnapshot[] { return Array.isArray(value) && value.every(isResource); }
function isStation(value: unknown): value is StationSnapshot { return isRecord(value) && typeof value.id === 'string' && (value.kind === 'furnace' || value.kind === 'anvil') && isPosition(value.position); }
function isStations(value: unknown): value is StationSnapshot[] { return Array.isArray(value) && value.every(isStation); }
function isMerchantOffer(value: unknown): value is MerchantOfferSnapshot { return isRecord(value) && typeof value.itemId === 'string' && Number.isSafeInteger(value.buyPrice) && (value.buyPrice as number) >= 0 && Number.isSafeInteger(value.sellPrice) && (value.sellPrice as number) >= 0; }
function isService(value: unknown): value is ServiceSnapshot {
  if (!isRecord(value) || typeof value.id !== 'string' || !isPosition(value.position)) return false;
  if (value.kind === 'bank') return true;
  return value.kind === 'merchant' && Array.isArray(value.offers) && value.offers.every(isMerchantOffer);
}
function isServices(value: unknown): value is ServiceSnapshot[] { return Array.isArray(value) && value.every(isService); }
function isProgress(value: unknown): value is PlayerProgressSnapshot {
  if (!isRecord(value) || !isRecord(value.inventory) || !isRecord(value.bank) || !isRecord(value.wallet) || !isRecord(value.equipment) || !isRecord(value.skills)) return false;
  if (!Number.isSafeInteger(value.inventory.capacity) || !Array.isArray(value.inventory.slots) || !value.inventory.slots.every(isInventorySlot)) return false;
  if (!Number.isSafeInteger(value.bank.capacity) || !Array.isArray(value.bank.slots) || !value.bank.slots.every(isInventorySlot)) return false;
  if (!Number.isSafeInteger(value.wallet.coins) || (value.wallet.coins as number) < 0) return false;
  if (!(value.equipment.toolItemId === null || typeof value.equipment.toolItemId === 'string')) return false;
  if (!isSkill(value.skills.mining) || !isSkill(value.skills.smithing)) return false;
  if (!(value.gathering === null || isGathering(value.gathering))) return false;
  return value.processing === null || isProcessing(value.processing);
}
function isInventorySlot(value: unknown): value is InventorySlotSnapshot { return isRecord(value) && Number.isSafeInteger(value.slot) && typeof value.itemId === 'string' && Number.isSafeInteger(value.quantity) && (value.quantity as number) > 0; }
function isSkill(value: unknown): value is SkillSnapshot { return isRecord(value) && Number.isSafeInteger(value.xp) && (value.xp as number) >= 0 && Number.isSafeInteger(value.level) && (value.level as number) >= 1; }
function isGathering(value: unknown): value is GatheringSnapshot { return isRecord(value) && typeof value.nodeId === 'string' && (value.mode === 'focused' || value.mode === 'steady') && typeof value.startedAt === 'number' && typeof value.completesAt === 'number'; }
function isProcessing(value: unknown): value is ProcessingSnapshot { return isRecord(value) && typeof value.stationId === 'string' && typeof value.recipeId === 'string' && typeof value.startedAt === 'number' && typeof value.completesAt === 'number'; }
function isBounds(value: unknown): value is WorldBounds { return isRecord(value) && typeof value.minX === 'number' && typeof value.minY === 'number' && typeof value.maxX === 'number' && typeof value.maxY === 'number' && value.maxX > value.minX && value.maxY > value.minY; }
