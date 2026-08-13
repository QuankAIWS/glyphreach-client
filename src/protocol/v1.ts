export const PROTOCOL_VERSION = 1 as const;

export interface Position {
  x: number;
  y: number;
}

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PlayerSnapshot {
  id: string;
  position: Position;
}

export interface ResourceNodeSnapshot {
  id: string;
  kind: 'copper_vein';
  position: Position;
  available: boolean;
  respawnAt: number | null;
}

export interface InventorySlotSnapshot {
  slot: number;
  itemId: string;
  quantity: number;
}

export interface InventorySnapshot {
  capacity: number;
  slots: InventorySlotSnapshot[];
}

export interface SkillSnapshot {
  xp: number;
  level: number;
}

export type GatheringMode = 'focused' | 'steady';

export interface GatheringSnapshot {
  nodeId: string;
  mode: GatheringMode;
  startedAt: number;
  completesAt: number;
}

export interface PlayerProgressSnapshot {
  inventory: InventorySnapshot;
  skills: {
    mining: SkillSnapshot;
  };
  gathering: GatheringSnapshot | null;
}

export interface HelloMessage {
  type: 'HELLO';
  protocolVersion: typeof PROTOCOL_VERSION;
  clientBuild: string;
  resumeToken?: string;
}

export interface MoveIntentMessage {
  type: 'MOVE_INTENT';
  sequence: number;
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}

export interface MoveTargetMessage {
  type: 'MOVE_TARGET';
  sequence: number;
  target: Position;
}

export interface StartGatheringMessage {
  type: 'START_GATHERING';
  sequence: number;
  nodeId: string;
  mode: GatheringMode;
}

export interface CancelGatheringMessage {
  type: 'CANCEL_GATHERING';
  sequence: number;
}

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
  progress: PlayerProgressSnapshot;
  world: {
    bounds: WorldBounds;
  };
}

export interface WorldStateMessage {
  type: 'WORLD_STATE';
  revision: number;
  players: PlayerSnapshot[];
  resources: ResourceNodeSnapshot[];
}

export interface PlayerStateMessage {
  type: 'PLAYER_STATE';
  revision: number;
  progress: PlayerProgressSnapshot;
}

export interface ActionRejectedMessage {
  type: 'ACTION_REJECTED';
  action: 'movement' | 'gathering';
  reason:
    | 'invalid_target'
    | 'too_far'
    | 'node_unavailable'
    | 'inventory_full'
    | 'already_gathering'
    | 'not_gathering';
}

export interface RejectMessage {
  type: 'REJECT';
  reason: 'protocol_mismatch' | 'invalid_message';
  supportedProtocolVersion: typeof PROTOCOL_VERSION;
}

export type ServerMessage =
  | WelcomeMessage
  | WorldStateMessage
  | PlayerStateMessage
  | ActionRejectedMessage
  | RejectMessage;

export function createHello(clientBuild: string, resumeToken?: string): HelloMessage {
  return {
    type: 'HELLO',
    protocolVersion: PROTOCOL_VERSION,
    clientBuild,
    ...(resumeToken ? { resumeToken } : {}),
  };
}

export function createMoveIntent(
  sequence: number,
  dx: -1 | 0 | 1,
  dy: -1 | 0 | 1,
): MoveIntentMessage {
  return { type: 'MOVE_INTENT', sequence, dx, dy };
}

export function createMoveTarget(sequence: number, target: Position): MoveTargetMessage {
  return { type: 'MOVE_TARGET', sequence, target };
}

export function createStartGathering(
  sequence: number,
  nodeId: string,
  mode: GatheringMode,
): StartGatheringMessage {
  return { type: 'START_GATHERING', sequence, nodeId, mode };
}

export function createCancelGathering(sequence: number): CancelGatheringMessage {
  return { type: 'CANCEL_GATHERING', sequence };
}

export function parseServerMessage(raw: string): ServerMessage {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Server sent invalid JSON');
  }

  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error('Server message is missing a type');
  }

  if (value.type === 'REJECT') {
    if (
      (value.reason !== 'protocol_mismatch' && value.reason !== 'invalid_message') ||
      value.supportedProtocolVersion !== PROTOCOL_VERSION
    ) {
      throw new Error('Malformed REJECT message');
    }
    return value as unknown as RejectMessage;
  }

  if (value.type === 'ACTION_REJECTED') {
    const actions = ['movement', 'gathering'];
    const reasons = ['invalid_target', 'too_far', 'node_unavailable', 'inventory_full', 'already_gathering', 'not_gathering'];
    if (!actions.includes(String(value.action)) || !reasons.includes(String(value.reason))) {
      throw new Error('Malformed ACTION_REJECTED message');
    }
    return value as unknown as ActionRejectedMessage;
  }

  if (value.type === 'PLAYER_STATE') {
    if (!Number.isSafeInteger(value.revision) || !isProgress(value.progress)) {
      throw new Error('Malformed PLAYER_STATE message');
    }
    return value as unknown as PlayerStateMessage;
  }

  if (value.type === 'WORLD_STATE') {
    if (
      !Number.isSafeInteger(value.revision) ||
      !isPlayers(value.players) ||
      !isResources(value.resources)
    ) {
      throw new Error('Malformed WORLD_STATE message');
    }
    return value as unknown as WorldStateMessage;
  }

  if (value.type !== 'WELCOME') {
    throw new Error(`Unknown server message type: ${value.type}`);
  }

  if (
    value.protocolVersion !== PROTOCOL_VERSION ||
    typeof value.serverBuild !== 'string' ||
    typeof value.connectionId !== 'string' ||
    typeof value.resumeToken !== 'string' ||
    typeof value.worldId !== 'string' ||
    !isPlayer(value.player) ||
    !isPlayers(value.players) ||
    !isResources(value.resources) ||
    !isProgress(value.progress) ||
    !isRecord(value.world) ||
    !isBounds(value.world.bounds)
  ) {
    throw new Error('Malformed WELCOME message');
  }

  return value as unknown as WelcomeMessage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPosition(value: unknown): value is Position {
  return (
    isRecord(value) &&
    typeof value.x === 'number' && Number.isFinite(value.x) &&
    typeof value.y === 'number' && Number.isFinite(value.y)
  );
}

function isPlayer(value: unknown): value is PlayerSnapshot {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0 && isPosition(value.position);
}

function isPlayers(value: unknown): value is PlayerSnapshot[] {
  return Array.isArray(value) && value.every(isPlayer);
}

function isResource(value: unknown): value is ResourceNodeSnapshot {
  return (
    isRecord(value) &&
    typeof value.id === 'string' && value.id.length > 0 &&
    value.kind === 'copper_vein' &&
    isPosition(value.position) &&
    typeof value.available === 'boolean' &&
    (value.respawnAt === null || (typeof value.respawnAt === 'number' && Number.isFinite(value.respawnAt)))
  );
}

function isResources(value: unknown): value is ResourceNodeSnapshot[] {
  return Array.isArray(value) && value.every(isResource);
}

function isProgress(value: unknown): value is PlayerProgressSnapshot {
  if (!isRecord(value) || !isRecord(value.inventory) || !isRecord(value.skills)) return false;
  if (!Number.isSafeInteger(value.inventory.capacity) || (value.inventory.capacity as number) <= 0) return false;
  if (!Array.isArray(value.inventory.slots) || !value.inventory.slots.every(isInventorySlot)) return false;
  if (!isSkill(value.skills.mining)) return false;
  return value.gathering === null || isGathering(value.gathering);
}

function isInventorySlot(value: unknown): value is InventorySlotSnapshot {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.slot) && (value.slot as number) >= 0 &&
    typeof value.itemId === 'string' && value.itemId.length > 0 &&
    Number.isSafeInteger(value.quantity) && (value.quantity as number) > 0
  );
}

function isSkill(value: unknown): value is SkillSnapshot {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.xp) && (value.xp as number) >= 0 &&
    Number.isSafeInteger(value.level) && (value.level as number) >= 1
  );
}

function isGathering(value: unknown): value is GatheringSnapshot {
  return (
    isRecord(value) &&
    typeof value.nodeId === 'string' && value.nodeId.length > 0 &&
    (value.mode === 'focused' || value.mode === 'steady') &&
    typeof value.startedAt === 'number' && Number.isFinite(value.startedAt) &&
    typeof value.completesAt === 'number' && Number.isFinite(value.completesAt)
  );
}

function isBounds(value: unknown): value is WorldBounds {
  return (
    isRecord(value) &&
    typeof value.minX === 'number' &&
    typeof value.minY === 'number' &&
    typeof value.maxX === 'number' &&
    typeof value.maxY === 'number' &&
    value.maxX > value.minX &&
    value.maxY > value.minY
  );
}
