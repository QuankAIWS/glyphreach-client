export function applyStoryPolish(root: HTMLElement): void {
  const eyebrow = root.querySelector<HTMLElement>('.eyebrow');
  if (eyebrow) eyebrow.textContent = 'THE SILENT BELL';
  for (const label of root.querySelectorAll<HTMLElement>('.label')) if (label.textContent?.trim() === 'Fieldwork') label.textContent = 'Journal';
  relabel(root, 'quest-mine-status', 'Cut fresh copper');
  relabel(root, 'quest-rat-status', 'Clear the bell route');
  relabel(root, 'quest-proof-status', 'Bring Rhea proof');
  const title = root.querySelector<HTMLElement>('[data-testid="quest-title"]');
  const titleRow = title?.closest('.skill-line');
  if (titleRow && !root.querySelector('[data-testid="quest-premise"]')) {
    const premise = document.createElement('div'); premise.className = 'control-note'; premise.dataset.testid = 'quest-premise'; premise.textContent = 'The eastern waybell is silent. Survey crews will not take the road.'; titleRow.before(premise);
  }
  const ratStatus = root.querySelector<HTMLElement>('[data-testid="quest-rat-status"]');
  const ratRow = ratStatus?.closest('.skill-line');
  if (ratRow && !root.querySelector('[data-testid="quest-forge-status"]')) {
    const row = document.createElement('div'); row.className = 'skill-line'; row.innerHTML = '<span>Forge & equip copper sword</span><strong data-testid="quest-forge-status">Pending</strong>'; ratRow.before(row);
  }
  const forgeStatus = root.querySelector<HTMLElement>('[data-testid="quest-forge-status"]');
  const weapon = root.querySelector<HTMLElement>('[data-testid="equipped-weapon"]');
  const questStatus = root.querySelector<HTMLElement>('[data-testid="quest-status"]');
  const sync = () => { if (forgeStatus) forgeStatus.textContent = weapon?.textContent === 'Copper sword' || questStatus?.textContent === 'Completed' ? 'Done' : 'Pending'; };
  sync();
  if (weapon) new MutationObserver(sync).observe(weapon, { childList: true, subtree: true, characterData: true });
  if (questStatus) new MutationObserver(sync).observe(questStatus, { childList: true, subtree: true, characterData: true });
  const action = root.querySelector<HTMLElement>('[data-testid="action-status"]');
  if (action) action.textContent = 'Surveyor Rhea is studying the eastern road. The waybell beyond camp is silent.';
}
function relabel(root: HTMLElement, testId: string, label: string): void { const status = root.querySelector<HTMLElement>(`[data-testid="${testId}"]`); const row = status?.closest('.skill-line'); const span = row?.querySelector('span'); if (span) span.textContent = label; }
