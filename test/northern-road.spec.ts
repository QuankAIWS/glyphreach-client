import { expect, test } from '@playwright/test';

const RESUME_TOKEN_KEY = 'glyphreach.devResumeToken.v1';

test('A Cold Supper opens Northwatch, teaches fishing and food, clears the ford, and rewards exploration', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(([key, token]) => window.localStorage.setItem(key, token), [RESUME_TOKEN_KEY, 'm8-north-test']);
  await page.goto('/');
  await expect(page.getByTestId('connection-status')).toHaveText('Connected');
  await expect(page.getByTestId('north-road-status')).toHaveText('Open');
  await expect(page.getByTestId('quest-status')).toHaveText('Completed');
  await expect(page.getByTestId('north-quest-title')).toHaveText('A Cold Supper');
  await expect(page.getByTestId('north-quest-status')).toHaveText('Available');
  await expect(page.getByTestId('equipped-weapon')).toHaveText('Copper sword');
  await expect(page.getByTestId('wallet-coins')).toHaveText('18');
  await expect(page.getByTestId('wolf-health')).toHaveText('24 / 24');

  const canvas = page.locator('canvas[aria-label="GlyphReach world"]');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const clickWorld = async (x: number, y: number) => {
    await canvas.click({ position: { x: box!.width * x, y: box!.height * y } });
    await page.waitForTimeout(80);
  };

  await test.step('take Cook Sella’s provision job', async () => {
    await clickWorld(0.64, 0.22);
    await page.getByTestId('interact-sella').click();
    await expect(page.getByTestId('dialogue-speaker')).toHaveText('Cook Sella');
    await expect(page.getByTestId('dialogue-text')).toContainText('road is open on paper');
    await page.getByTestId('dialogue-choice-accept_north_road_dry').click();
    await expect(page.getByTestId('north-quest-status')).toHaveText('Active');
  });

  await test.step('fish four Northwater fish with both attention profiles', async () => {
    await clickWorld(0.76, 0.22);
    for (let quantity = 1; quantity <= 3; quantity += 1) {
      await page.getByTestId('fish-focused').click();
      await expect(page.getByTestId('raw-fish-count')).toHaveText(String(quantity));
      await page.waitForTimeout(160);
    }
    await page.getByTestId('fish-steady').click();
    await expect(page.getByTestId('raw-fish-count')).toHaveText('4');
    await expect(page.getByTestId('fishing-xp')).toHaveText('35');
    await expect(page.getByTestId('north-quest-fish-status')).toHaveText('Done');
  });

  await test.step('cook provisions at the Northwatch fire', async () => {
    await clickWorld(0.68, 0.22);
    for (let quantity = 1; quantity <= 4; quantity += 1) {
      await page.getByTestId('cook-riverfish').click();
      await expect(page.getByTestId('cooked-fish-count')).toHaveText(String(quantity));
    }
    await expect(page.getByTestId('raw-fish-count')).toHaveText('0');
    await expect(page.getByTestId('cooking-xp')).toHaveText('32');
    await expect(page.getByTestId('north-quest-cook-status')).toHaveText('Done');
  });

  await test.step('use cooked food to survive the harder road wolf', async () => {
    await clickWorld(0.83, 0.26);
    const attack = async (health: string) => {
      await page.getByTestId('attack-road-wolf').click();
      await expect(page.getByTestId('wolf-health')).toHaveText(health);
      await page.waitForTimeout(110);
    };
    await attack('20 / 24');
    await expect(page.getByTestId('combat-health')).toHaveText('13 / 20');
    await attack('16 / 24');
    await expect(page.getByTestId('combat-health')).toHaveText('6 / 20');
    await page.getByTestId('eat-riverfish').click();
    await expect(page.getByTestId('combat-health')).toHaveText('13 / 20');
    await attack('12 / 24');
    await page.getByTestId('eat-riverfish').click();
    await expect(page.getByTestId('combat-health')).toHaveText('13 / 20');
    await attack('8 / 24');
    await page.getByTestId('eat-riverfish').click();
    await expect(page.getByTestId('combat-health')).toHaveText('13 / 20');
    await attack('4 / 24');
    await page.getByTestId('attack-road-wolf').click();
    await expect(page.getByTestId('wolf-health')).toHaveText('Defeated');
    await expect(page.getByTestId('wolf-pelt-count')).toHaveText('1');
    await expect(page.getByTestId('cooked-fish-count')).toHaveText('1');
    await expect(page.getByTestId('fish-bones-count')).toHaveText('3');
    await expect(page.getByTestId('wallet-coins')).toHaveText('24');
    await expect(page.getByTestId('north-quest-wolf-status')).toHaveText('Done');
    await expect(page.getByTestId('north-quest-status')).toHaveText('Return to Cook Sella');
  });

  await test.step('turn in exactly once and follow the optional waystone lead', async () => {
    await clickWorld(0.64, 0.22);
    await page.getByTestId('interact-sella').click();
    await expect(page.getByTestId('dialogue-choice-turn_in_north_road')).toBeVisible();
    await page.getByTestId('dialogue-choice-turn_in_north_road').click();
    await expect(page.getByTestId('north-quest-status')).toHaveText('Completed');
    await expect(page.getByTestId('wallet-coins')).toHaveText('48');
    await expect(page.getByTestId('cooked-fish-count')).toHaveText('0');
    await expect(page.getByTestId('wolf-pelt-count')).toHaveText('0');

    await clickWorld(0.90, 0.15);
    await expect(page.getByTestId('waystone-status')).toHaveText('Found');
    await expect(page.getByTestId('waystone-fragment-count')).toHaveText('1');
  });

  await page.screenshot({ path: 'test-results/northern-road-chapter.png', fullPage: true });
});
