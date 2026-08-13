import { expect, test } from '@playwright/test';

test('The Silent Bell plays from danger through preparation and return', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  const canvas = page.locator('canvas[aria-label="GlyphReach world"]');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const clickWorld = async (x: number, y: number) => { await canvas.click({ position: { x: box!.width * x, y: box!.height * y } }); await page.waitForTimeout(100); };
  const moveNearRat = async () => { await clickWorld(0.76, 0.75); await expect.poll(async () => { const value = await page.getByTestId('local-position').textContent(); if (!value) return false; const [x,y] = value.split(',').map((part) => Number(part.trim())); return x > 730 && y > 430; }).toBe(true); };
  const attack = async (rat: string, health?: string) => { await page.getByTestId('attack-reach-rat').click(); await expect(page.getByTestId('rat-health')).toHaveText(rat); if (health) await expect(page.getByTestId('combat-health')).toHaveText(health); await page.waitForTimeout(110); };

  await expect(page.getByTestId('quest-title')).toHaveText('The Silent Bell');
  await expect(page.getByTestId('quest-premise')).toContainText('eastern waybell is silent');
  await page.getByTestId('interact-surveyor').click();
  await expect(page.getByTestId('action-status')).toHaveText('Move closer to the required world object first.');
  await clickWorld(0.477, 0.565);
  await page.getByTestId('interact-surveyor').click();
  await expect(page.getByTestId('dialogue-text')).toContainText('waybell east of camp has gone silent');
  await page.getByTestId('dialogue-choice-accept_first_fieldwork_dry').click();
  await expect(page.getByTestId('quest-status')).toHaveText('Active');

  await moveNearRat();
  await attack('12 / 14', '15 / 20'); await attack('10 / 14', '10 / 20'); await attack('8 / 14', '5 / 20');
  await page.getByTestId('attack-reach-rat').click();
  await expect(page.getByTestId('rat-health')).toHaveText('6 / 14');
  await expect(page.getByTestId('action-status')).toHaveText('You were defeated. Respawning at the safe point…');
  await expect(page.getByTestId('combat-health')).toHaveText('20 / 20');
  await expect(page.getByTestId('local-position')).toHaveText('440, 300');

  await clickWorld(0.74, 0.50);
  await page.getByTestId('mine-focused').click(); await expect(page.getByTestId('copper-ore-count')).toHaveText('1');
  await page.waitForTimeout(300);
  await page.getByTestId('mine-focused').click(); await expect(page.getByTestId('copper-ore-count')).toHaveText('2');
  await expect(page.getByTestId('quest-mine-status')).toHaveText('Done');
  await clickWorld(0.56, 0.32);
  await page.getByTestId('smelt-copper').click(); await expect(page.getByTestId('copper-bar-count')).toHaveText('1');
  await page.getByTestId('smelt-copper').click(); await expect(page.getByTestId('copper-bar-count')).toHaveText('2');
  await clickWorld(0.56, 0.71);
  await page.getByTestId('smith-sword').click(); await expect(page.getByTestId('copper-sword-count')).toHaveText('1');
  await page.getByTestId('equip-sword').click();
  await expect(page.getByTestId('equipped-weapon')).toHaveText('Copper sword');
  await expect(page.getByTestId('quest-forge-status')).toHaveText('Done');

  await moveNearRat();
  await attack('2 / 14', '15 / 20');
  await page.getByTestId('attack-reach-rat').click();
  await expect(page.getByTestId('rat-health')).toHaveText('Defeated');
  await expect(page.getByTestId('rat-tail-count')).toHaveText('1');
  await expect(page.getByTestId('wallet-coins')).toHaveText('3');
  await expect(page.getByTestId('quest-status')).toHaveText('Return to Surveyor');
  await clickWorld(0.477, 0.565);
  await page.getByTestId('interact-surveyor').click();
  await expect(page.getByTestId('dialogue-text')).toContainText('tail matches the bite marks');
  await page.getByTestId('dialogue-choice-turn_in_first_fieldwork').click();
  await expect(page.getByTestId('quest-status')).toHaveText('Completed');
  await expect(page.getByTestId('wallet-coins')).toHaveText('21');
  await expect(page.getByTestId('rat-tail-count')).toHaveText('0');
  await expect(page.getByTestId('equipped-weapon')).toHaveText('Copper sword');
  await page.screenshot({ path: 'test-results/the-silent-bell.png', fullPage: true });
});
