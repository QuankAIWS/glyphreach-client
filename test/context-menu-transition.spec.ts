import { expect, test, type Locator, type Page } from '@playwright/test';

test('right-click menu always reflects the current world target', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?prototype=0');
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');

  const canvas = page.locator('canvas[aria-label="GlyphReach world"]');
  const position = page.getByTestId('local-position');
  const menu = page.getByTestId('world-context-menu');

  await clickWorld(page, canvas, position, { x: 760, y: 300 }, 'right');
  await expect(menu).toContainText('Copper vein');
  await expect(menu).toContainText('Mine · focused');

  await clickWorld(page, canvas, position, { x: 440, y: 400 }, 'right');
  await expect(menu).toContainText('Ground');
  await expect(menu.getByRole('button', { name: 'Walk here' })).toBeVisible();
  await expect(menu).not.toContainText('Copper vein');
  await expect(menu).not.toContainText('Mine · focused');
});

async function clickWorld(
  page: Page,
  canvas: Locator,
  positionLabel: Locator,
  world: { x: number; y: number },
  button: 'left' | 'right',
): Promise<void> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('World canvas has no bounding box');
  const text = await positionLabel.textContent();
  const [localX, localY] = (text ?? '').split(',').map((part) => Number(part.trim()));
  if (!Number.isFinite(localX) || !Number.isFinite(localY)) throw new Error(`Invalid local position: ${text}`);

  const cameraX = clamp(box.width / 2 - localX * 2, box.width - 2000, 0);
  const cameraY = clamp(box.height / 2 - localY * 2, box.height - 1200, 0);
  const x = box.x + cameraX + world.x * 2;
  const y = box.y + cameraY + world.y * 2;
  if (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) {
    throw new Error(`World target ${world.x},${world.y} is outside the visible camera at ${x},${y}`);
  }
  await page.mouse.click(x, y, { button });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
