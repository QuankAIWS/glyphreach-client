import './legacy-test-layout.css';

const PROTOTYPE_QUERY = 'prototype';
const DEV_QUERY = 'dev';

export function applyWorldFirstPresentation(root: HTMLElement): void {
  const shell = root.querySelector<HTMLElement>('.shell');
  const worldShell = root.querySelector<HTMLElement>('.world-shell');
  const panel = root.querySelector<HTMLElement>('.connection-card');
  if (!shell || !worldShell || !panel) return;

  shell.classList.add('world-first-shell');
  worldShell.classList.add('world-first-stage');
  panel.classList.add('prototype-drawer');
  panel.setAttribute('aria-label', 'Development actions and diagnostics');
  panel.id = 'glyphreach-prototype-drawer';

  const query = new URLSearchParams(window.location.search);
  const prototypeValue = query.get(PROTOTYPE_QUERY);
  const localAutomationHost = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
  const automationLayout = localAutomationHost && prototypeValue !== '0';
  const explicitDev = query.get(DEV_QUERY) === '1';
  const devActionsEnabled = automationLayout || explicitDev;

  if (automationLayout) worldShell.classList.add('legacy-test-layout');
  if (devActionsEnabled) worldShell.classList.add('dev-actions-enabled');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'prototype-drawer-toggle';
  toggle.dataset.testid = 'prototype-controls-toggle';
  toggle.setAttribute('aria-controls', panel.id);

  const initiallyOpen = automationLayout || (explicitDev && prototypeValue === '1');
  const setOpen = (open: boolean) => {
    const allowedOpen = devActionsEnabled && open;
    panel.dataset.open = String(allowedOpen);
    panel.setAttribute('aria-hidden', String(!allowedOpen));
    toggle.setAttribute('aria-expanded', String(allowedOpen));
    toggle.textContent = allowedOpen ? 'Close dev' : 'Dev';
  };
  toggle.addEventListener('click', () => setOpen(panel.dataset.open !== 'true'));
  setOpen(initiallyOpen);
  if (devActionsEnabled) worldShell.append(toggle);

  const hud = document.createElement('div');
  hud.className = 'world-hud';
  hud.setAttribute('aria-label', 'Player HUD');
  hud.innerHTML = `
    <div class="hud-card hud-place">
      <span class="hud-kicker">THE REACH</span>
      <strong data-testid="hud-location">Starter survey camp</strong>
      <span class="hud-subtle">Left-click the world · right-click for options</span>
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