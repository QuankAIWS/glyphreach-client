export function addNorthreachMap(root: HTMLElement): void {
  const world = root.querySelector<HTMLElement>('[data-testid="world-canvas"]');
  if (!world) return;
  const overlay = document.createElement('div'); overlay.className = 'm9-world-overlay'; overlay.dataset.testid = 'northreach-overlay';
  overlay.append(marker('Northreach Vault', 'm9-vault'), marker('Resonant mark', 'm9-mark'), marker('Collapsed cache', 'm9-cache'));
  world.append(overlay);
}
function marker(label: string, css: string): HTMLElement {
  const item = document.createElement('div'); item.className = `m9-map-label ${css}`; item.textContent = label; return item;
}
