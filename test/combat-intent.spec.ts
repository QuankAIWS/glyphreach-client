import { expect, test, type Locator, type Page } from '@playwright/test';

test('one hostile click acquires a target and produces repeated authoritative attacks', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/?prototype=0');
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  await expect(page.getByTestId('rat-health')).toHaveText('14 / 14');

  const canvas = page.locator('canvas[aria-label="GlyphReach world"]');
  await clickWorld(page, canvas, page.getByTestId('local-position'), { x: 820, y: 470 });

  const target = page.getByTestId('combat-target-hud');
  await expect(target).toBeVisible();
  await expect(target).toContainText('Reach rat');
  await expect(target).toContainText('Attacking');

  // A single backend attack would leave the rat at 12 HP. Reaching 10 or lower
  // proves the client preserved combat intent and the server accepted multiple
  // cooldown-governed attacks from that one target selection.
  await expect.poll(async () => parseHealth(await page.getByTestId('rat-health').textContent()), { timeout: 10_000 })
    .toBeLessThanOrEqual(10);
});

test('Escape cancels persistent combat intent', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/?prototype=0');
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  const canvas = page.locator('canvas[aria-label="GlyphReach world"]');

  await clickWorld(page, canvas, page.getByTestId('local-position'), { x: 820, y: 470 });
  await expect(page.getByTestId('combat-target-hud')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('combat-target-hud')).toBeHidden();
});

async function clickWorld(page: Page, canvas: Locator, positionLabel: Locator, world: { x: number; y: number }): Promise<void> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('World canvas has no bounding box');
  const text = await positionLabel.textContent();
  const [localX, localY] = (text ?? '').split(',').map((part) => Number(part.trim()));
  const cameraX = clamp(box.width / 2 - localX * 2, box.width - 2000, 0);
  const cameraY = clamp(box.height / 2 - localY * 2, box.height - 1200, 0);
  const x = box.x + cameraX + world.x * 2;
  const y = box.y + cameraY + world.y * 2;
  if (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) throw new Error('Combat target is outside the visible camera');
  await page.mouse.click(x, y);
}

function parseHealth(text: string | null): number {
  const match = (text ?? '').match(/^(\d+)\s*\//);
  return match ? Number(match[1]) : 0;
}

function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
