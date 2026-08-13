import { expect, test } from '@playwright/test';

test('three browser clients share click movement and the first Mining loop', async ({ browser }) => {
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

    const beforePosition = await pages[0].getByTestId('local-position').textContent();
    const beforeRevision = Number(await pages[1].getByTestId('world-revision').textContent());
    const canvas = pages[0].locator('canvas[aria-label="GlyphReach world"]');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await canvas.click({ position: { x: box!.width * 0.74, y: box!.height * 0.5 } });
    await expect(pages[0].getByTestId('local-position')).not.toHaveText(beforePosition ?? '');
    await expect.poll(async () => Number(await pages[1].getByTestId('world-revision').textContent())).toBeGreaterThan(beforeRevision);

    await pages[0].getByTestId('mine-focused').click();
    await expect(pages[0].getByTestId('copper-ore-count')).toHaveText('1');
    await expect(pages[0].getByTestId('mining-xp')).toHaveText('12');
    await expect(pages[0].getByTestId('inventory-slots')).toHaveText('1 / 24');

    await pages[0].screenshot({ path: 'test-results/click-move-first-mining.png', fullPage: true });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
