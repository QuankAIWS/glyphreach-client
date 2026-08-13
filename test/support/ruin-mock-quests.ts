import type { RuinState } from './ruin-mock-data';

export function ruinQuests(state: RuinState) {
  return [completedSilentBell(), completedColdSupper(), {
    questId: 'stone-below-alpha', title: 'The Stone Below', status: state.questStatus, stage: state.questStage,
    objectives: [
      { id: 'find_vault', label: 'Find the buried Northreach survey vault', complete: state.vaultFound || state.questStatus === 'completed' },
      { id: 'read_marks', label: 'Use the fragment to decipher the resonant survey mark', complete: state.marksRead || state.questStatus === 'completed' },
      { id: 'defeat_warden', label: 'Defeat the Waystone Warden', complete: state.wardenDefeated || state.questStatus === 'completed' },
      { id: 'bring_core', label: 'Bring Surveyor Rhea the Warden core', complete: state.hasCore || state.questStatus === 'completed' },
    ],
  }];
}
function completedSilentBell() { return { questId: 'first-fieldwork-alpha', title: 'The Silent Bell', status: 'completed', stage: 'completed', objectives: [{ id: 'mine_copper', label: 'Cut fresh copper', complete: true }, { id: 'forge_blade', label: 'Forge a blade', complete: true }, { id: 'defeat_rat', label: 'Clear bell route', complete: true }, { id: 'bring_proof', label: 'Bring proof', complete: true }] }; }
function completedColdSupper() { return { questId: 'north-road-provisions-alpha', title: 'A Cold Supper', status: 'completed', stage: 'completed', objectives: [{ id: 'catch_supper', label: 'Catch supper', complete: true }, { id: 'cook_supper', label: 'Cook supper', complete: true }, { id: 'clear_ford', label: 'Clear ford', complete: true }, { id: 'bring_supper', label: 'Bring supper', complete: true }] }; }
