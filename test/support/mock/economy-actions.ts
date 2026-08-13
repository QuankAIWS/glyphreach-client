import type { WebSocket } from 'ws';
import { addItem, consume, distance, services, stackLimitFor, type Player } from './model.js';
import { reject, sendPlayerState } from './runtime.js';

export function handleEconomyAction(socket: WebSocket, player: Player, message: Record<string, unknown>): boolean {
  if (message.type === 'BANK_DEPOSIT' || message.type === 'BANK_WITHDRAW') {
    const bank = services.find((service) => service.kind === 'bank' && service.id === message.serviceId);
    if (!bank) { reject(socket, 'bank', 'invalid_service'); return true; }
    if (distance(player.position, bank.position) > 86) { reject(socket, 'bank', 'too_far'); return true; }

    const itemId = String(message.itemId);
    const quantity = Number(message.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
      reject(socket, 'bank', 'invalid_quantity');
      return true;
    }

    const source = message.type === 'BANK_DEPOSIT' ? player.progress.inventory.slots : player.progress.bank.slots;
    const destination = message.type === 'BANK_DEPOSIT' ? player.progress.bank.slots : player.progress.inventory.slots;
    if (!consume(source, itemId, quantity)) {
      reject(socket, 'bank', message.type === 'BANK_DEPOSIT' ? 'item_not_owned' : 'bank_missing_item');
      return true;
    }
    addItem(destination, itemId, quantity, stackLimitFor(itemId));
    sendPlayerState(socket, player);
    return true;
  }

  if (message.type !== 'MERCHANT_BUY' && message.type !== 'MERCHANT_SELL') return false;

  const merchant = services.find((service) => service.kind === 'merchant' && service.id === message.serviceId);
  if (!merchant || merchant.kind !== 'merchant') { reject(socket, 'merchant', 'invalid_service'); return true; }
  if (distance(player.position, merchant.position) > 86) { reject(socket, 'merchant', 'too_far'); return true; }

  const itemId = String(message.itemId);
  const quantity = Number(message.quantity);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
    reject(socket, 'merchant', 'invalid_quantity');
    return true;
  }
  const offer = merchant.offers.find((candidate) => candidate.itemId === itemId);
  if (!offer) { reject(socket, 'merchant', 'item_not_traded'); return true; }

  if (message.type === 'MERCHANT_BUY') {
    const total = offer.buyPrice * quantity;
    if (player.progress.wallet.coins < total) { reject(socket, 'merchant', 'insufficient_coins'); return true; }
    player.progress.wallet.coins -= total;
    addItem(player.progress.inventory.slots, itemId, quantity, stackLimitFor(itemId));
  } else {
    if (!consume(player.progress.inventory.slots, itemId, quantity)) { reject(socket, 'merchant', 'item_not_owned'); return true; }
    player.progress.wallet.coins += offer.sellPrice * quantity;
  }

  sendPlayerState(socket, player);
  return true;
}
