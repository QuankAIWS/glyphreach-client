import { expect, test } from '@playwright/test';

test('boots Pixi and renders the server-authored initial player snapshot', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  await expect(page.getByTestId('world-id')).toHaveText('alpha-1');
  await expect(page.getByTestId('player-id')).toHaveText('test-player');
  await expect(page.getByTestId('server-build')).toHaveText('mock-server');
  await expect(page.locator('canvas[aria-label="GlyphReach world"]')).toBeVisible();

  await page.screenshot({ path: 'test-results/connected-world.png', fullPage: true });
});
