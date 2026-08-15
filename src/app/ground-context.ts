export function installGroundContextMenu(root: HTMLElement): void {
  const worldShell = root.querySelector<HTMLElement>('[data-testid="world-shell"]');
  const menu = root.querySelector<HTMLElement>('[data-testid="world-context-menu"]');
  if (!worldShell || !menu) return;

  let boundCanvas: HTMLCanvasElement | null = null;

  const prepareContextMenu = () => {
    // Clear any menu left from the previous right-click before the object
    // interaction handler evaluates the current pointer location. If the
    // current click is over an object that handler will immediately replace
    // and reopen the menu; otherwise the ground handler below can safely
    // provide Walk here instead of preserving stale object actions.
    menu.hidden = true;
  };

  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    // The object interaction listener runs before this bubble listener. If it
    // opened a target menu for the current right-click, leave that richer,
    // object-specific menu alone.
    if (!menu.hidden) return;

    const shellRect = worldShell.getBoundingClientRect();
    const canvas = boundCanvas;
    if (!canvas) return;

    menu.replaceChildren();
    const title = document.createElement('div');
    title.className = 'context-menu-title';
    title.textContent = 'Ground';
    const walk = document.createElement('button');
    walk.type = 'button';
    walk.textContent = 'Walk here';
    walk.addEventListener('click', () => {
      menu.hidden = true;
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: event.clientX,
        clientY: event.clientY,
      }));
    });
    menu.append(title, walk);
    menu.style.left = `${Math.round(clamp(event.clientX - shellRect.left, 8, Math.max(8, shellRect.width - 224)))}px`;
    menu.style.top = `${Math.round(clamp(event.clientY - shellRect.top, 8, Math.max(8, shellRect.height - 120)))}px`;
    menu.hidden = false;
  };

  const bind = () => {
    const canvas = root.querySelector<HTMLCanvasElement>('canvas[data-camera-mode="player"]');
    if (!canvas || canvas === boundCanvas) return;
    if (boundCanvas) {
      boundCanvas.removeEventListener('contextmenu', prepareContextMenu, true);
      boundCanvas.removeEventListener('contextmenu', onContextMenu);
    }
    boundCanvas = canvas;
    canvas.addEventListener('contextmenu', prepareContextMenu, true);
    canvas.addEventListener('contextmenu', onContextMenu);
  };

  bind();
  const observer = new MutationObserver(bind);
  observer.observe(worldShell, { childList: true, subtree: true });
  window.addEventListener('beforeunload', () => {
    observer.disconnect();
    if (boundCanvas) {
      boundCanvas.removeEventListener('contextmenu', prepareContextMenu, true);
      boundCanvas.removeEventListener('contextmenu', onContextMenu);
    }
  }, { once: true });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
