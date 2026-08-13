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

export interface WelcomeMessage {
  type: 'WELCOME';
  protocolVersion: typeof PROTOCOL_VERSION;
  serverBuild: string;
  connectionId: string;
  resumeToken: string;
  worldId: string;
  player: PlayerSnapshot;
  players: PlayerSnapshot[];
  world: {
    bounds: WorldBounds;
  };
}

export interface WorldStateMessage {
  type: 'WORLD_STATE';
  revision: number;
  players: PlayerSnapshot[];
}

export interface RejectMessage {
  type: 'REJECT';
  reason: 'protocol_mismatch' | 'invalid_message';
  supportedProtocolVersion: typeof PROTOCOL_VERSION;
}

export type ServerMessage = WelcomeMessage | WorldStateMessage | RejectMessage;

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

  if (value.type === 'WORLD_STATE') {
    if (!Number.isSafeInteger(value.revision) || !isPlayers(value.players)) {
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
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  );
}

function isPlayer(value: unknown): value is PlayerSnapshot {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0 && isPosition(value.position);
}

function isPlayers(value: unknown): value is PlayerSnapshot[] {
  return Array.isArray(value) && value.every(isPlayer);
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
