import { expect, test } from '@playwright/test';

test('three browser clients share click movement, production, banking, and NPC economy projection', async ({ browser }) => {
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

    await test.step('click-move to the copper vein and mine four ore', async () => {
      await clickWorld(0.74, 0.50);
      for (let quantity = 1; quantity <= 4; quantity += 1) {
        await first.getByTestId('mine-focused').click();
        await expect(first.getByTestId('copper-ore-count')).toHaveText(String(quantity));
        if (quantity < 4) await first.waitForTimeout(300);
      }
    });

    await test.step('bank and withdraw one ore', async () => {
      await clickWorld(0.30, 0.30);
      await first.getByTestId('bank-deposit-ore').click();
      await expect(first.getByTestId('bank-copper-ore-count')).toHaveText('1');
      await expect(first.getByTestId('copper-ore-count')).toHaveText('3');
      await first.getByTestId('bank-withdraw-ore').click();
      await expect(first.getByTestId('bank-copper-ore-count')).toHaveText('0');
      await expect(first.getByTestId('copper-ore-count')).toHaveText('4');
    });

    await test.step('sell gathered value, buy one ore, and reject unaffordable repeat purchase', async () => {
      await clickWorld(0.30, 0.70);
      await expect(first.getByTestId('ore-buy-price')).toHaveText('4');
      await expect(first.getByTestId('ore-sell-price')).toHaveText('2');
      await first.getByTestId('merchant-sell-ore').click();
      await expect(first.getByTestId('wallet-coins')).toHaveText('2');
      await first.getByTestId('merchant-sell-ore').click();
      await expect(first.getByTestId('wallet-coins')).toHaveText('4');
      await expect(first.getByTestId('copper-ore-count')).toHaveText('2');
      await first.getByTestId('merchant-buy-ore').click();
      await expect(first.getByTestId('wallet-coins')).toHaveText('0');
      await expect(first.getByTestId('copper-ore-count')).toHaveText('3');
      await first.getByTestId('merchant-buy-ore').click();
      await expect(first.getByTestId('action-status')).toHaveText('You do not have enough coins.');
    });

    await test.step('bank one ore and finish the original copper production chain', async () => {
      await clickWorld(0.30, 0.30);
      await first.getByTestId('bank-deposit-ore').click();
      await expect(first.getByTestId('bank-copper-ore-count')).toHaveText('1');
      await expect(first.getByTestId('copper-ore-count')).toHaveText('2');

      await clickWorld(0.56, 0.32);
      await first.getByTestId('smelt-copper').click();
      await expect(first.getByTestId('copper-bar-count')).toHaveText('1');
      await first.getByTestId('smelt-copper').click();
      await expect(first.getByTestId('copper-bar-count')).toHaveText('2');

      await clickWorld(0.56, 0.71);
      await first.getByTestId('smith-pickaxe').click();
      await expect(first.getByTestId('copper-pickaxe-count')).toHaveText('1');
      await first.getByTestId('equip-pickaxe').click();
      await expect(first.getByTestId('equipped-tool')).toHaveText('Copper pickaxe');
      await expect(first.getByTestId('smithing-xp')).toHaveText('28');
      await expect(first.getByTestId('bank-copper-ore-count')).toHaveText('1');
    });

    await first.screenshot({ path: 'test-results/first-economy-loop.png', fullPage: true });
  } finally {
    await Promise.all(contexts.map(async (context) => {
      try { await context.close(); } catch { /* browser may already be closing after a timeout */ }
    }));
  }
});
