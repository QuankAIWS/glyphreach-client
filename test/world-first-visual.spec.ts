import { expect, test } from '@playwright/test';

test('captures the player-facing world-first shell without the developer command drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 750 });
  await page.goto('/?prototype=0');
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  await expect(page.locator('canvas[aria-label="GlyphReach world"]')).toBeVisible();
  await expect(page.getByTestId('player-interface')).toBeVisible();
  await expect(page.getByTestId('prototype-controls-toggle')).toHaveCount(0);
  await expect(page.getByTestId('open-pack')).toBeVisible();
  await expect(page.getByTestId('open-journal')).toBeVisible();
  await expect(page.getByTestId('open-skills')).toBeVisible();
  await expect(page.getByTestId('hud-location')).toBeVisible();
  await page.screenshot({ path: 'test-results/world-first-home.jpg', type: 'jpeg', quality: 42, fullPage: false });
});