import { expect, test } from '@playwright/test';

test('The Silent Bell plays from danger through preparation and return', async ({ page }) => {
  test.setTimeout(60_000);
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

  await expect(page.getByTestId('quest-title')).toHaveText('The Silent Bell');
  await expect(page.getByTestId('north-road-status')).toHaveText('Closed');
  await page.getByTestId('interact-surveyor').click();
  await expect(page.getByTestId('action-status')).toHaveText('Move closer to the required world object first.');

  await clickWorld(0.477, 0.565);
  await page.getByTestId('interact-surveyor').click();
  await expect(page.getByTestId('dialogue-speaker')).toHaveText('Surveyor Rhea');
  await expect(page.getByTestId('dialogue-text')).toContainText('waybell');
  await page.getByTestId('dialogue-choice-accept_first_fieldwork_dry').click();
  await expect(page.getByTestId('quest-status')).toHaveText('Active');

  await test.step('charging the bell route unprepared ends badly', async () => {
    await moveNearRat();
    for (const ratHealth of ['12 / 14', '10 / 14', '8 / 14']) {
      await page.getByTestId('attack-reach-rat').click();
      await expect(page.getByTestId('rat-health')).toHaveText(ratHealth);
      await page.waitForTimeout(100);
    }
    await page.getByTestId('attack-reach-rat').click();
    await expect(page.getByTestId('rat-health')).toHaveText('6 / 14');
    await expect(page.getByTestId('action-status')).toHaveText('You were defeated. Respawning at the safe point…');
    await expect(page.getByTestId('combat-health')).toHaveText('20 / 20');
  });

  await test.step('Rhea points the player toward preparation', async () => {
    await clickWorld(0.477, 0.565);
    await page.getByTestId('interact-surveyor').click();
    await expect(page.getByTestId('dialogue-text')).toContainText('copper vein');
  });

  await test.step('mine, smelt, forge, and equip the blade', async () => {
    await clickWorld(0.74, 0.50);
    await page.getByTestId('mine-focused').click();
    await expect(page.getByTestId('copper-ore-count')).toHaveText('1');
    await page.waitForTimeout(300);
    await page.getByTestId('mine-focused').click();
    await expect(page.getByTestId('copper-ore-count')).toHaveText('2');
    await expect(page.getByTestId('quest-mine-status')).toHaveText('Done');

    await clickWorld(0.56, 0.32);
    await page.getByTestId('smelt-copper').click();
    await expect(page.getByTestId('copper-bar-count')).toHaveText('1');
    await page.getByTestId('smelt-copper').click();
    await expect(page.getByTestId('copper-bar-count')).toHaveText('2');

    await clickWorld(0.56, 0.71);
    await page.getByTestId('smith-sword').click();
    await expect(page.getByTestId('copper-sword-count')).toHaveText('1');
    await page.getByTestId('equip-sword').click();
    await expect(page.getByTestId('equipped-weapon')).toHaveText('Copper sword');
    await expect(page.getByTestId('quest-forge-status')).toHaveText('Done');
  });

  await test.step('return with preparation and reopen the northern road', async () => {
    await moveNearRat();
    await page.getByTestId('attack-reach-rat').click();
    await expect(page.getByTestId('rat-health')).toHaveText('2 / 14');
    await page.waitForTimeout(100);
    await page.getByTestId('attack-reach-rat').click();
    await expect(page.getByTestId('rat-health')).toHaveText('Defeated');
    await expect(page.getByTestId('rat-tail-count')).toHaveText('1');
    await expect(page.getByTestId('quest-status')).toHaveText('Return to Surveyor');

    await clickWorld(0.477, 0.565);
    await page.getByTestId('interact-surveyor').click();
    await expect(page.getByTestId('dialogue-choice-turn_in_first_fieldwork')).toBeVisible();
    await page.getByTestId('dialogue-choice-turn_in_first_fieldwork').click();
    await expect(page.getByTestId('quest-status')).toHaveText('Completed');
    await expect(page.getByTestId('wallet-coins')).toHaveText('21');
    await expect(page.getByTestId('rat-tail-count')).toHaveText('0');
    await expect(page.getByTestId('equipped-weapon')).toHaveText('Copper sword');
    await expect(page.getByTestId('north-road-status')).toHaveText('Open');
  });

  await page.screenshot({ path: 'test-results/silent-bell-story.png', fullPage: true });
});
