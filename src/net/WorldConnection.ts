import {
  createAttackTarget,
  createBankDeposit,
  createBankWithdraw,
  createCancelGathering,
  createCancelProcessing,
  createEquipItem,
  createHello,
  createMerchantBuy,
  createMerchantSell,
  createMoveIntent,
  createMoveTarget,
  createStartGathering,
  createStartProcessing,
  type CombatPlayerStateMessage,
  type CombatWorldStateMessage,
  type GatheringMode,
  type PlayerStateMessage,
  type Position,
  type WorldStateMessage,
} from '../protocol/v1';
import {
  createDialogueChoice,
  createInteractNpc,
  parseGlyphReachServerMessage,
  type ActionRejectedMessage,
  type DialogueStateMessage,
  type QuestStateMessage,
  type WelcomeMessage,
} from '../protocol/quest-v1';

export type ConnectionState = 'connecting' | 'connected' | 'rejected' | 'disconnected' | 'error';

export class WorldConnection {
  private socket: WebSocket | null = null;
  private sequence = 0;
  constructor(
    private readonly url: string,
    private readonly clientBuild: string,
    private readonly onState: (state: ConnectionState, detail?: string) => void,
    private readonly onWorldState: (state: WorldStateMessage) => void,
    private readonly onPlayerState: (state: PlayerStateMessage) => void,
    private readonly onCombatWorldState: (state: CombatWorldStateMessage) => void,
    private readonly onCombatPlayerState: (state: CombatPlayerStateMessage) => void,
    private readonly onQuestState: (state: QuestStateMessage) => void,
    private readonly onDialogueState: (state: DialogueStateMessage) => void,
    private readonly onActionRejected: (message: ActionRejectedMessage) => void,
  ) {}

  connect(resumeToken?: string, timeoutMs = 5_000): Promise<WelcomeMessage> {
    this.onState('connecting');
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      let settled = false;
      const finishReject = (error: Error, state: ConnectionState = 'error') => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.onState(state, error.message);
        reject(error);
      };
      const timeout = window.setTimeout(() => {
        socket.close(1000, 'handshake timeout');
        finishReject(new Error('World handshake timed out'));
      }, timeoutMs);
      socket.addEventListener('open', () => socket.send(JSON.stringify(createHello(this.clientBuild, resumeToken))));
      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') {
          if (!settled) finishReject(new Error('World server sent a non-text handshake message'));
          return;
        }
        try {
          const message = parseGlyphReachServerMessage(event.data);
          if (message.type === 'REJECT') {
            socket.close(1002, message.reason);
            finishReject(new Error(`World server rejected client: ${message.reason}`), 'rejected');
            return;
          }
          if (message.type === 'WELCOME') {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              this.onState('connected');
              resolve(message);
            }
            return;
          }
          if (!settled) return;
          if (message.type === 'WORLD_STATE') this.onWorldState(message);
          else if (message.type === 'PLAYER_STATE') this.onPlayerState(message);
          else if (message.type === 'COMBAT_WORLD_STATE') this.onCombatWorldState(message);
          else if (message.type === 'COMBAT_PLAYER_STATE') this.onCombatPlayerState(message);
          else if (message.type === 'QUEST_STATE') this.onQuestState(message);
          else if (message.type === 'DIALOGUE_STATE') this.onDialogueState(message);
          else this.onActionRejected(message);
        } catch (error) {
          socket.close(1002, 'invalid server message');
          if (!settled) finishReject(error instanceof Error ? error : new Error('Invalid world handshake'));
          else this.onState('error', error instanceof Error ? error.message : 'Invalid world message');
        }
      });
      socket.addEventListener('error', () => finishReject(new Error('Unable to reach the GlyphReach world server')));
      socket.addEventListener('close', () => {
        if (!settled) finishReject(new Error('World connection closed during handshake'), 'disconnected');
        else this.onState('disconnected');
      });
    });
  }

  move(dx: -1 | 0 | 1, dy: -1 | 0 | 1): boolean { if (dx === 0 && dy === 0) return false; return this.send(createMoveIntent(this.sequence++, dx, dy)); }
  moveTarget(target: Position): boolean { return this.send(createMoveTarget(this.sequence++, target)); }
  startGathering(nodeId: string, mode: GatheringMode): boolean { return this.send(createStartGathering(this.sequence++, nodeId, mode)); }
  cancelGathering(): boolean { return this.send(createCancelGathering(this.sequence++)); }
  startProcessing(stationId: string, recipeId: string): boolean { return this.send(createStartProcessing(this.sequence++, stationId, recipeId)); }
  cancelProcessing(): boolean { return this.send(createCancelProcessing(this.sequence++)); }
  equipItem(itemId: string): boolean { return this.send(createEquipItem(this.sequence++, itemId)); }
  bankDeposit(serviceId: string, itemId: string, quantity = 1): boolean { return this.send(createBankDeposit(this.sequence++, serviceId, itemId, quantity)); }
  bankWithdraw(serviceId: string, itemId: string, quantity = 1): boolean { return this.send(createBankWithdraw(this.sequence++, serviceId, itemId, quantity)); }
  merchantBuy(serviceId: string, itemId: string, quantity = 1): boolean { return this.send(createMerchantBuy(this.sequence++, serviceId, itemId, quantity)); }
  merchantSell(serviceId: string, itemId: string, quantity = 1): boolean { return this.send(createMerchantSell(this.sequence++, serviceId, itemId, quantity)); }
  attackTarget(targetId: string): boolean { return this.send(createAttackTarget(this.sequence++, targetId)); }
  interactNpc(targetId: string): boolean { return this.send(createInteractNpc(this.sequence++, targetId)); }
  dialogueChoice(npcId: string, choiceId: string): boolean { return this.send(createDialogueChoice(this.sequence++, npcId, choiceId)); }
  close(): void { this.socket?.close(1000, 'client shutdown'); this.socket = null; }

  private send(message: object): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }
}
