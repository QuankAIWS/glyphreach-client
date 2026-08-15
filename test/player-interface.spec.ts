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
  await page.setViewportSize({ width: 1440, height: 900 });
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

test('right clicking empty ground uses the game menu instead of the browser menu', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?prototype=0');
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  const canvas = page.locator('canvas[aria-label="GlyphReach world"]');

  await clickWorld(page, canvas, page.getByTestId('local-position'), { x: 440, y: 400 }, 'right');
  const menu = page.getByTestId('world-context-menu');
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('Ground');
  await expect(menu.getByRole('button', { name: 'Walk here' })).toBeVisible();
});

test('left clicking copper walks into range and completes the default mining action', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?prototype=0');
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  await expect(page.getByTestId('copper-ore-count')).toHaveText('0');
  const canvas = page.locator('canvas[aria-label="GlyphReach world"]');

  await clickWorld(page, canvas, page.getByTestId('local-position'), { x: 760, y: 300 });
  await expect(page.getByTestId('player-context-panel')).toContainText('Copper vein');
  // Focused mining is intentionally short; assert the authoritative result rather
  // than racing a transient activity pill that can disappear on completion.
  await expect(page.getByTestId('copper-ore-count')).toHaveText('1', { timeout: 8_000 });
  await expect(page.getByTestId('mining-xp')).not.toHaveText('0');
});

test('banking exists only at the physical bank and transfers authoritative inventory', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?prototype=0');
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  const canvas = page.locator('canvas[aria-label="GlyphReach world"]');
  const position = page.getByTestId('local-position');

  await clickWorld(page, canvas, position, { x: 760, y: 300 });
  await expect(page.getByTestId('copper-ore-count')).toHaveText('1', { timeout: 8_000 });

  await clickWorld(page, canvas, position, { x: 300, y: 180 });
  const bank = page.getByTestId('player-context-panel');
  await expect(bank).toContainText('Bank', { timeout: 6_000 });
  const oreRow = bank.locator('.item-row').filter({ hasText: 'Copper ore' });
  await expect(oreRow).toBeVisible();
  await oreRow.getByRole('button', { name: 'All' }).click();
  await expect(page.getByTestId('bank-copper-ore-count')).toHaveText('1');
  await expect(page.getByTestId('copper-ore-count')).toHaveText('0');
  await expect(bank).toContainText('Stored');
  await expect(bank).not.toContainText('Buy 1');
});

test('trading exists only at the physical merchant and does not expose bank storage', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?prototype=0');
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  const canvas = page.locator('canvas[aria-label="GlyphReach world"]');

  await clickWorld(page, canvas, page.getByTestId('local-position'), { x: 300, y: 420 });
  const merchant = page.getByTestId('player-context-panel');
  await expect(merchant).toContainText('Merchant', { timeout: 6_000 });
  await expect(merchant).toContainText('Copper ore');
  await expect(merchant.getByRole('button', { name: 'Buy 1' }).first()).toBeVisible();
  await expect(merchant).not.toContainText('Stored');
  await expect(merchant).not.toContainText('Deposit');
});

test('workstations expose only recipes for the world station being used', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?prototype=0');
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  const canvas = page.locator('canvas[aria-label="GlyphReach world"]');

  await clickWorld(page, canvas, page.getByTestId('local-position'), { x: 570, y: 155 });
  const station = page.getByTestId('player-context-panel');
  await expect(station).toContainText('Field furnace', { timeout: 6_000 });
  await expect(station).toContainText('Smelt copper bar');
  await expect(station).not.toContainText('Buy 1');
  await expect(station).not.toContainText('Stored');
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