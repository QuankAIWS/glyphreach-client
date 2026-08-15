import { expect, test, type Locator, type Page } from '@playwright/test';

test('player can click world objects instead of using the global action harness', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 750 });
  await page.goto('/?prototype=0');
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  await expect(page.getByTestId('prototype-controls-toggle')).toHaveCount(0);

  const canvas = page.locator('canvas[aria-label="GlyphReach world"]');
  await expect(canvas).toBeVisible();

  await clickWorld(page, canvas, page.getByTestId('local-position'), { x: 515, y: 345 });
  await expect(page.getByTestId('player-context-panel')).toContainText('Surveyor Rhea');
  await expect(page.getByTestId('player-dialogue')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId('player-dialogue')).toContainText('Surveyor Rhea');

  const closeChoice = page.getByTestId('player-dialogue').getByRole('button').last();
  await closeChoice.click();
  await expect(page.getByTestId('player-dialogue')).toBeHidden();

  await clickWorld(page, canvas, page.getByTestId('local-position'), { x: 300, y: 180 });
  await expect(page.getByTestId('player-context-panel')).toContainText('Bank', { timeout: 5_000 });
  await expect(page.getByTestId('player-context-panel')).toContainText('Carried');
  await expect(page.getByTestId('player-context-panel')).toContainText('Stored');

  await page.getByTestId('open-pack').click();
  await expect(page.getByTestId('player-context-panel')).toContainText('Field pack');
  await page.getByTestId('open-journal').click();
  await expect(page.getByTestId('player-context-panel')).toContainText('Field notes');
  await page.getByTestId('open-skills').click();
  await expect(page.getByTestId('player-context-panel')).toContainText('Skills');
});

test('right click exposes only actions relevant to the selected world object', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 750 });
  await page.goto('/?prototype=0');
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  const canvas = page.locator('canvas[aria-label="GlyphReach world"]');

  await clickWorld(page, canvas, page.getByTestId('local-position'), { x: 760, y: 300 }, 'right');
  const menu = page.getByTestId('world-context-menu');
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('Copper vein');
  await expect(menu).toContainText('Mine · focused');
  await expect(menu).toContainText('Mine · steady / AFK');
  await expect(menu).not.toContainText('Buy');
  await expect(menu).not.toContainText('Deposit');
});

async function clickWorld(
  page: Page,
  canvas: Locator,
  positionLabel: Locator,
  world: { x: number; y: number },
  button: 'left' | 'right' = 'left',
): Promise<void> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('World canvas has no bounding box');
  const text = await positionLabel.textContent();
  const [localX, localY] = (text ?? '').split(',').map((part) => Number(part.trim()));
  if (!Number.isFinite(localX) || !Number.isFinite(localY)) throw new Error(`Invalid local position: ${text}`);

  const cameraX = clamp(box.width / 2 - localX * 2, box.width - 2000, 0);
  const cameraY = clamp(box.height / 2 - localY * 2, box.height - 1200, 0);
  await page.mouse.click(box.x + cameraX + world.x * 2, box.y + cameraY + world.y * 2, { button });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
