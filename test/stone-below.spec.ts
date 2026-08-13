import { expect, test } from '@playwright/test';
import { startRuinMockServer } from './support/ruin-mock-server';

test('The Stone Below turns the waystone lead into a prepared ruin clear', async ({ page }) => {
  test.setTimeout(45_000);
  const mock = await startRuinMockServer();
  try {
    await page.addInitScript(() => {
      const NativeWebSocket = window.WebSocket;
      const RedirectWebSocket = new Proxy(NativeWebSocket, {
        construct(Target, args) {
          const next = [...args];
          const url = String(next[0]);
          if (url.includes('127.0.0.1:8787')) next[0] = url.replace(':8787', ':8790');
          return Reflect.construct(Target, next);
        },
      });
      window.WebSocket = RedirectWebSocket;
    });

    await page.goto('/');
    await expect(page.getByTestId('connection-status')).toHaveText('Connected');
    await expect(page.getByTestId('stone-quest-title')).toHaveText('The Stone Below');
    await expect(page.getByTestId('stone-quest-status')).toHaveText('Available');
    await expect(page.getByTestId('warden-health')).toHaveText('28 / 28');
    await expect(page.getByTestId('waystone-fragment-count')).toHaveText('1');

    await page.getByTestId('interact-surveyor').click();
    await expect(page.getByTestId('dialogue-text')).toContainText('buried Northreach vault');
    await page.getByTestId('dialogue-choice-accept_stone_below_dry').click();
    await expect(page.getByTestId('stone-quest-status')).toHaveText('Active');

    const canvas = page.locator('canvas[aria-label="GlyphReach world"]');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const move = async (x: number, y: number) => {
      await canvas.click({ position: { x: box!.width * x, y: box!.height * y } });
      await page.waitForTimeout(120);
    };

    await move(0.90, 0.45);
    await expect(page.getByTestId('stone-quest-vault-status')).toHaveText('Done');
    await move(0.944, 0.53);
    await expect(page.getByTestId('stone-quest-marks-status')).toHaveText('Done');

    const attack = async (health: string) => {
      await page.getByTestId('attack-waystone-warden').click();
      await expect(page.getByTestId('warden-health')).toHaveText(health);
    };
    await attack('24 / 28');
    await attack('20 / 28');
    await attack('16 / 28');
    await expect(page.getByTestId('combat-health')).toHaveText('5 / 20');
    await page.getByTestId('eat-riverfish').click();
    await expect(page.getByTestId('combat-health')).toHaveText('12 / 20');
    await attack('12 / 28');
    await attack('8 / 28');
    await page.getByTestId('eat-riverfish').click();
    await expect(page.getByTestId('combat-health')).toHaveText('9 / 20');
    await attack('4 / 28');
    await attack('Defeated');
    await expect(page.getByTestId('warden-core-count')).toHaveText('1');
    await expect(page.getByTestId('wallet-coins')).toHaveText('56');
    await expect(page.getByTestId('stone-quest-status')).toHaveText('Return to Surveyor');

    await move(0.972, 0.79);
    await expect(page.getByTestId('old-route-token-count')).toHaveText('1');
    await move(0.477, 0.565);
    await page.getByTestId('interact-surveyor').click();
    await expect(page.getByTestId('dialogue-choice-turn_in_stone_below')).toBeVisible();
    await page.getByTestId('dialogue-choice-turn_in_stone_below').click();
    await expect(page.getByTestId('stone-quest-status')).toHaveText('Completed');
    await expect(page.getByTestId('wallet-coins')).toHaveText('92');
    await expect(page.getByTestId('warden-core-count')).toHaveText('0');
    await expect(page.getByTestId('old-route-token-count')).toHaveText('1');
    await page.screenshot({ path: 'test-results/stone-below-ruin.png', fullPage: true });
  } finally {
    await mock.close();
  }
});
