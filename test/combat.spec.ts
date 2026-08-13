import { expect, test } from '@playwright/test';

test('browser combat journey takes damage, dies, respawns, kills, and receives authoritative rewards', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  const canvas = page.locator('canvas[aria-label="GlyphReach world"]');
  await expect(canvas).toBeVisible();

  await expect(page.getByTestId('combat-health')).toHaveText('20 / 20');
  await expect(page.getByTestId('rat-health')).toHaveText('14 / 14');
  await expect(page.getByTestId('combat-xp')).toHaveText('0');
  await expect(page.getByTestId('wallet-coins')).toHaveText('0');
  await expect(page.getByTestId('rat-tail-count')).toHaveText('0');

  await test.step('server rejects attacking the rat from across the field', async () => {
    await page.getByTestId('attack-reach-rat').click();
    await expect(page.getByTestId('action-status')).toHaveText('Move closer to the required world object first.');
  });

  const moveNearRat = async () => {
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await canvas.click({ position: { x: box!.width * 0.76, y: box!.height * 0.75 } });
    await expect.poll(async () => {
      const value = await page.getByTestId('local-position').textContent();
      if (!value) return false;
      const [x, y] = value.split(',').map((part) => Number(part.trim()));
      return Number.isFinite(x) && Number.isFinite(y) && x > 730 && y > 430;
    }).toBe(true);
  };

  const attackAndExpect = async (ratHealth: string, playerHealth: string) => {
    await page.getByTestId('attack-reach-rat').click();
    await expect(page.getByTestId('rat-health')).toHaveText(ratHealth);
    await expect(page.getByTestId('combat-health')).toHaveText(playerHealth);
    await page.waitForTimeout(100);
  };

  await test.step('exchange damage until the player dies', async () => {
    await moveNearRat();
    await attackAndExpect('12 / 14', '15 / 20');
    await attackAndExpect('10 / 14', '10 / 20');
    await attackAndExpect('8 / 14', '5 / 20');
    await page.getByTestId('attack-reach-rat').click();
    await expect(page.getByTestId('rat-health')).toHaveText('6 / 14');
    await expect(page.getByTestId('combat-health')).toHaveText('0 / 20');
    await expect(page.getByTestId('action-status')).toHaveText('You were defeated. Respawning at the safe point…');
  });

  await test.step('respawn safely and finish the wounded enemy', async () => {
    await expect(page.getByTestId('combat-health')).toHaveText('20 / 20');
    await expect(page.getByTestId('local-position')).toHaveText('440, 300');
    await moveNearRat();
    await attackAndExpect('4 / 14', '15 / 20');
    await attackAndExpect('2 / 14', '10 / 20');
    await page.getByTestId('attack-reach-rat').click();
    await expect(page.getByTestId('rat-health')).toHaveText('Defeated');
    await expect(page.getByTestId('combat-health')).toHaveText('10 / 20');
    await expect(page.getByTestId('combat-xp')).toHaveText('12');
    await expect(page.getByTestId('wallet-coins')).toHaveText('3');
    await expect(page.getByTestId('rat-tail-count')).toHaveText('1');
    await expect(page.getByTestId('action-status')).toHaveText('Reach rat defeated · authoritative drop granted. It will respawn.');
  });

  await page.screenshot({ path: 'test-results/first-combat-loop.png', fullPage: true });
});
