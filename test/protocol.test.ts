import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROTOCOL_VERSION,
  createHello,
  createMoveIntent,
  parseServerMessage,
} from '../src/protocol/v1';

test('HELLO can carry the development resume token without changing protocol version', () => {
  const resumeToken = '123e4567-e89b-42d3-a456-426614174000';
  assert.deepEqual(createHello('client-sha', resumeToken), {
    type: 'HELLO',
    protocolVersion: PROTOCOL_VERSION,
    clientBuild: 'client-sha',
    resumeToken,
  });
});

test('MOVE_INTENT expresses direction rather than authoritative coordinates', () => {
  assert.deepEqual(createMoveIntent(4, 1, 0), {
    type: 'MOVE_INTENT',
    sequence: 4,
    dx: 1,
    dy: 0,
  });
});

test('WELCOME and WORLD_STATE parsing accept authoritative multiplayer snapshots', () => {
  const player = { id: 'player-1', position: { x: 500, y: 300 } };
  const welcome = parseServerMessage(JSON.stringify({
    type: 'WELCOME',
    protocolVersion: 1,
    serverBuild: 'server-sha',
    connectionId: 'connection-1',
    resumeToken: '123e4567-e89b-42d3-a456-426614174000',
    worldId: 'alpha-1',
    player,
    players: [player],
    world: { bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 600 } },
  }));
  assert.equal(welcome.type, 'WELCOME');

  const state = parseServerMessage(JSON.stringify({
    type: 'WORLD_STATE',
    revision: 7,
    players: [player, { id: 'player-2', position: { x: 600, y: 300 } }],
  }));
  assert.equal(state.type, 'WORLD_STATE');
  if (state.type === 'WORLD_STATE') assert.equal(state.players.length, 2);
});

test('malformed server messages are rejected', () => {
  assert.throws(() => parseServerMessage('{"type":"WORLD_STATE","revision":1}'), /Malformed WORLD_STATE/);
});
