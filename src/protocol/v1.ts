export const PROTOCOL_VERSION = 1 as const;

export interface HelloMessage {
  type: 'HELLO';
  protocolVersion: typeof PROTOCOL_VERSION;
  clientBuild: string;
}

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

export interface WelcomeMessage {
  type: 'WELCOME';
  protocolVersion: typeof PROTOCOL_VERSION;
  serverBuild: string;
  connectionId: string;
  worldId: string;
  player: {
    id: string;
    position: Position;
  };
  world: {
    bounds: WorldBounds;
  };
}

export interface RejectMessage {
  type: 'REJECT';
  reason: 'protocol_mismatch' | 'invalid_message';
  supportedProtocolVersion: typeof PROTOCOL_VERSION;
}

export type ServerMessage = WelcomeMessage | RejectMessage;

export function createHello(clientBuild: string): HelloMessage {
  return {
    type: 'HELLO',
    protocolVersion: PROTOCOL_VERSION,
    clientBuild,
  };
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

  if (value.type !== 'WELCOME') {
    throw new Error(`Unknown server message type: ${value.type}`);
  }

  if (
    value.protocolVersion !== PROTOCOL_VERSION ||
    typeof value.serverBuild !== 'string' ||
    typeof value.connectionId !== 'string' ||
    typeof value.worldId !== 'string' ||
    !isRecord(value.player) ||
    typeof value.player.id !== 'string' ||
    !isPosition(value.player.position) ||
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
