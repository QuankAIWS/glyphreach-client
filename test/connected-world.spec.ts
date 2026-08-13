import { expect, test } from '@playwright/test';

test('three browser clients share click movement, Mining, processing, and equipment projection', async ({ browser }) => {
  test.setTimeout(45_000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  try {
    const pages = await test.step('connect three browser clients', async () => Promise.all(contexts.map(async (context) => {
      const page = await context.newPage();
      await page.goto('/');
      await expect(page.getByTestId('connection-status')).toHaveText('Connected');
      await expect(page.locator('canvas[aria-label="GlyphReach world"]')).toBeVisible();
      return page;
    })));
    await Promise.all(pages.map((page) => expect(page.getByTestId('player-count')).toHaveText('3')));

    const first = pages[0];
    const observer = pages[1];
    const canvas = first.locator('canvas[aria-label="GlyphReach world"]');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const clickWorld = async (xRatio: number, yRatio: number) => {
      const beforeText = await observer.getByTestId('world-revision').textContent();
      const before = Number(beforeText);
      expect(Number.isFinite(before)).toBe(true);
      await canvas.click({ position: { x: box!.width * xRatio, y: box!.height * yRatio } });
      await expect.poll(async () => Number(await observer.getByTestId('world-revision').textContent())).toBeGreaterThan(before);
    };

    await test.step('click-move to the copper vein and mine two ore', async () => {
      await clickWorld(0.74, 0.50);
      await first.getByTestId('mine-focused').click();
      await expect(first.getByTestId('copper-ore-count')).toHaveText('1');
      await first.waitForTimeout(300);
      await first.getByTestId('mine-focused').click();
      await expect(first.getByTestId('copper-ore-count')).toHaveText('2');
    });

    await test.step('click-move to the furnace and smelt two bars', async () => {
      await clickWorld(0.56, 0.32);
      await first.getByTestId('smelt-copper').click();
      await expect(first.getByTestId('copper-bar-count')).toHaveText('1');
      await first.getByTestId('smelt-copper').click();
      await expect(first.getByTestId('copper-bar-count')).toHaveText('2');
    });

    await test.step('click-move to the anvil, smith and equip the pickaxe', async () => {
      await clickWorld(0.56, 0.71);
      await first.getByTestId('smith-pickaxe').click();
      await expect(first.getByTestId('copper-pickaxe-count')).toHaveText('1');
      await first.getByTestId('equip-pickaxe').click();
      await expect(first.getByTestId('equipped-tool')).toHaveText('Copper pickaxe');
      await expect(first.getByTestId('copper-pickaxe-count')).toHaveText('0');
      await expect(first.getByTestId('smithing-xp')).toHaveText('28');
    });

    await first.screenshot({ path: 'test-results/first-production-chain.png', fullPage: true });
  } finally {
    await Promise.all(contexts.map(async (context) => {
      try { await context.close(); } catch { /* browser may already be closing after a timeout */ }
    }));
  }
});
