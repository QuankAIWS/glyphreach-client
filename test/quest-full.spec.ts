import { expect, test } from '@playwright/test';

test('browser quest journey accepts fieldwork, advances from real play, and turns in', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/');
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  const canvas = page.locator('canvas[aria-label="GlyphReach world"]');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const clickWorld = async (xRatio: number, yRatio: number) => {
    await canvas.click({ position: { x: box!.width * xRatio, y: box!.height * yRatio } });
    await page.waitForTimeout(80);
  };
  const moveNearRat = async () => {
    await clickWorld(0.76, 0.75);
    await expect.poll(async () => {
      const value = await page.getByTestId('local-position').textContent();
      if (!value) return false;
      const [x, y] = value.split(',').map((part) => Number(part.trim()));
      return Number.isFinite(x) && Number.isFinite(y) && x > 730 && y > 430;
    }).toBe(true);
  };
  const attack = async (ratHealth: string) => {
    await page.getByTestId('attack-reach-rat').click();
    await expect(page.getByTestId('rat-health')).toHaveText(ratHealth);
    await page.waitForTimeout(100);
  };

  await expect(page.getByTestId('quest-status')).toHaveText('Available');
  await page.getByTestId('interact-surveyor').click();
  await expect(page.getByTestId('action-status')).toHaveText('Move closer to the required world object first.');

  await clickWorld(0.477, 0.565);
  await page.getByTestId('interact-surveyor').click();
  await expect(page.getByTestId('dialogue-speaker')).toHaveText('Surveyor Rhea');
  await page.getByTestId('dialogue-choice-accept_first_fieldwork').click();
  await expect(page.getByTestId('quest-status')).toHaveText('Active');

  await clickWorld(0.74, 0.50);
  await page.getByTestId('mine-focused').click();
  await expect(page.getByTestId('copper-ore-count')).toHaveText('1');
  await expect(page.getByTestId('quest-mine-status')).toHaveText('Done');

  await moveNearRat();
  await attack('12 / 14');
  await attack('10 / 14');
  await attack('8 / 14');
  await page.getByTestId('attack-reach-rat').click();
  await expect(page.getByTestId('rat-health')).toHaveText('6 / 14');
  await expect(page.getByTestId('combat-health')).toHaveText('20 / 20');

  await moveNearRat();
  await attack('4 / 14');
  await attack('2 / 14');
  await page.getByTestId('attack-reach-rat').click();
  await expect(page.getByTestId('rat-health')).toHaveText('Defeated');
  await expect(page.getByTestId('rat-tail-count')).toHaveText('1');
  await expect(page.getByTestId('wallet-coins')).toHaveText('3');
  await expect(page.getByTestId('quest-rat-status')).toHaveText('Done');
  await expect(page.getByTestId('quest-proof-status')).toHaveText('Ready');
  await expect(page.getByTestId('quest-status')).toHaveText('Return to Surveyor');

  await clickWorld(0.477, 0.565);
  await page.getByTestId('interact-surveyor').click();
  await page.getByTestId('dialogue-choice-turn_in_first_fieldwork').click();
  await expect(page.getByTestId('quest-status')).toHaveText('Completed');
  await expect(page.getByTestId('wallet-coins')).toHaveText('15');
  await expect(page.getByTestId('copper-ore-count')).toHaveText('0');
  await expect(page.getByTestId('rat-tail-count')).toHaveText('0');
  await page.screenshot({ path: 'test-results/first-quest-loop.png', fullPage: true });
});
