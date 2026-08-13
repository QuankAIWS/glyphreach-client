export function addNorthreachJournal(root: HTMLElement): void {
  const anchor = root.querySelector<HTMLElement>('[data-testid="dialogue-panel"]');
  if (!anchor) return;
  const section = document.createElement('section');
  section.className = 'm9-journal';
  section.dataset.testid = 'stone-quest-panel';
  section.append(row('The Stone Below', 'stone-quest-status', 'stone-quest-title'));
  section.append(row('Find the survey vault', 'stone-quest-vault-status'));
  section.append(row('Decipher the resonant mark', 'stone-quest-marks-status'));
  section.append(row('Defeat the Waystone Warden', 'stone-quest-warden-status'));
  section.append(row('Bring Rhea the core', 'stone-quest-proof-status'));
  anchor.before(section);
}

function row(label: string, statusId: string, labelId?: string): HTMLElement {
  const line = document.createElement('div'); line.className = 'skill-line';
  const name = document.createElement('span'); name.textContent = label; if (labelId) name.dataset.testid = labelId;
  const status = document.createElement('strong'); status.dataset.testid = statusId; status.textContent = statusId === 'stone-quest-status' ? 'Locked' : '—';
  line.append(name, status); return line;
}
