import assert from 'node:assert/strict';
import test from 'node:test';
import { PROTOCOL_VERSION, createHello, parseServerMessage } from '../src/protocol/v1';

test('HELLO is pinned to the public protocol version', () => {
  assert.deepEqual(createHello('client-sha'), {
    type: 'HELLO',
    protocolVersion: PROTOCOL_VERSION,
    clientBuild: 'client-sha',
  });
});

test('WELCOME parsing accepts a valid authoritative snapshot', () => {
  const message = parseServerMessage(JSON.stringify({
    type: 'WELCOME',
    protocolVersion: 1,
    serverBuild: 'server-sha',
    connectionId: 'connection-1',
    worldId: 'alpha-1',
    player: { id: 'player-1', position: { x: 500, y: 300 } },
    world: { bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 600 } },
  }));
  assert.equal(message.type, 'WELCOME');
  if (message.type === 'WELCOME') assert.equal(message.player.id, 'player-1');
});

test('malformed server messages are rejected', () => {
  assert.throws(() => parseServerMessage('{"type":"WELCOME"}'), /Malformed WELCOME/);
});
