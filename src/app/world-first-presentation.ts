const PROTOTYPE_QUERY = 'prototype';

export function applyWorldFirstPresentation(root: HTMLElement): void {
  const shell = root.querySelector<HTMLElement>('.shell');
  const worldShell = root.querySelector<HTMLElement>('.world-shell');
  const panel = root.querySelector<HTMLElement>('.connection-card');
  if (!shell || !worldShell || !panel) return;

  shell.classList.add('world-first-shell');
  worldShell.classList.add('world-first-stage');
  panel.classList.add('prototype-drawer');
  panel.setAttribute('aria-label', 'Prototype actions and diagnostics');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'prototype-drawer-toggle';
  toggle.dataset.testid = 'prototype-controls-toggle';
  toggle.setAttribute('aria-controls', 'glyphreach-prototype-drawer');
  panel.id = 'glyphreach-prototype-drawer';

  const initiallyOpen = new URLSearchParams(window.location.search).get(PROTOTYPE_QUERY) === '1';
  const setOpen = (open: boolean) => {
    panel.dataset.open = String(open);
    panel.setAttribute('aria-hidden', String(!open));
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Close actions' : 'Actions';
  };
  toggle.addEventListener('click', () => setOpen(panel.dataset.open !== 'true'));
  setOpen(initiallyOpen);
  worldShell.append(toggle);

  const hud = document.createElement('div');
  hud.className = 'world-hud';
  hud.setAttribute('aria-label', 'Player HUD');
  hud.innerHTML = `
    <div class="hud-card hud-place">
      <span class="hud-kicker">THE REACH</span>
      <strong data-testid="hud-location">Starter survey camp</strong>
      <span class="hud-subtle">Click the ground to move</span>
    </div>
    <div class="hud-card hud-online">
      <span><i class="hud-dot"></i><strong data-testid="hud-connection">Connecting…</strong></span>
      <span class="hud-subtle"><strong data-testid="hud-player-count">0</strong> online</span>
    </div>
    <div class="hud-card hud-status">
      <span class="hud-kicker">FIELD NOTE</span>
      <strong data-testid="hud-action">Entering the Reach…</strong>
    </div>
    <div class="hud-card hud-vitals">
      <span><small>HP</small><strong data-testid="hud-health">— / —</strong></span>
      <span><small>COIN</small><strong data-testid="hud-coins">0</strong></span>
      <span><small>PACK</small><strong data-testid="hud-inventory">0 / —</strong></span>
    </div>`;
  worldShell.append(hud);

  mirrorText(root, 'connection-status', 'hud-connection');
  mirrorText(root, 'player-count', 'hud-player-count');
  mirrorText(root, 'action-status', 'hud-action');
  mirrorText(root, 'combat-health', 'hud-health');
  mirrorText(root, 'wallet-coins', 'hud-coins');
  mirrorText(root, 'inventory-slots', 'hud-inventory');

  const position = root.querySelector<HTMLElement>('[data-testid="local-position"]');
  const location = root.querySelector<HTMLElement>('[data-testid="hud-location"]');
  if (position && location) {
    const syncLocation = () => {
      const [xRaw, yRaw] = (position.textContent ?? '').split(',').map((value) => Number(value.trim()));
      if (!Number.isFinite(xRaw) || !Number.isFinite(yRaw)) return;
      location.textContent = locationFor(xRaw, yRaw);
    };
    syncLocation();
    new MutationObserver(syncLocation).observe(position, { childList: true, subtree: true, characterData: true });
  }

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel.dataset.open === 'true') setOpen(false);
  });
}

function mirrorText(root: HTMLElement, sourceTestId: string, targetTestId: string): void {
  const source = root.querySelector<HTMLElement>(`[data-testid="${sourceTestId}"]`);
  const target = root.querySelector<HTMLElement>(`[data-testid="${targetTestId}"]`);
  if (!source || !target) return;
  const sync = () => { target.textContent = source.textContent; };
  sync();
  new MutationObserver(sync).observe(source, { childList: true, subtree: true, characterData: true });
}

function locationFor(x: number, y: number): string {
  if (x >= 850) return 'Northreach survey ruins';
  if (x >= 680 && y <= 220) return 'Northwatch';
  if (x >= 610) return 'Northern road';
  return 'Starter survey camp';
}
