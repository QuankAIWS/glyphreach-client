import { expect, test } from '@playwright/test';

test('three browser clients share presence and movement projection', async ({ browser }) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);

  try {
    const pages = await Promise.all(contexts.map(async (context) => {
      const page = await context.newPage();
      await page.goto('/');
      await expect(page.getByTestId('connection-status')).toHaveText('Connected');
      await expect(page.locator('canvas[aria-label="GlyphReach world"]')).toBeVisible();
      return page;
    }));

    await Promise.all(pages.map((page) => expect(page.getByTestId('player-count')).toHaveText('3')));
    const firstId = await pages[0].getByTestId('player-id').textContent();
    const secondId = await pages[1].getByTestId('player-id').textContent();
    const thirdId = await pages[2].getByTestId('player-id').textContent();
    expect(new Set([firstId, secondId, thirdId]).size).toBe(3);

    const before = Number(await pages[1].getByTestId('world-revision').textContent());
    await pages[0].keyboard.press('ArrowRight');
    await expect.poll(async () => Number(await pages[1].getByTestId('world-revision').textContent())).toBeGreaterThan(before);
    await expect(pages[0].getByTestId('local-position')).not.toHaveText('—');

    await pages[0].screenshot({ path: 'test-results/three-players-walking.png', fullPage: true });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
