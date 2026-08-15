import { expect, test } from '@playwright/test';

test('captures the player-facing world-first shell with prototype controls closed', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?prototype=0');
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  await expect(page.locator('canvas[aria-label="GlyphReach world"]')).toBeVisible();
  await expect(page.getByTestId('prototype-controls-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('hud-location')).toBeVisible();
  await page.screenshot({ path: 'test-results/world-first-home.png', fullPage: false });
});
