import { expect, test, type Page } from '@playwright/test';

/** Host + 3 pelaajaa pelaavat Pikaillan läpi nopeutetuilla ajastimilla. */
test('Pikailta pelataan alusta palkintokorokkeelle', async ({ browser }) => {
  const errors: string[] = [];
  const host = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  host.on('pageerror', (e) => errors.push(e.message));
  await host.goto('/host');
  const code = (await host.getByTestId('room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-HJKMNPR-Z]{4}$/);

  const players: Page[] = [];
  for (const name of ['Aino', 'Eino', 'Iines']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`/play?code=${code}&devPlayer=${name}`);
    await p.getByLabel('Nimimerkki').fill(name);
    await p.getByRole('button', { name: 'Mukaan!' }).click();
    await expect(p.getByText('Olet mukana!')).toBeVisible();
    players.push(p);
  }
  await expect(host.getByText('Pelaajat (3)')).toBeVisible();

  // uudelleenliittyminen: sivun päivitys palauttaa samaan paikkaan
  await players[0].reload();
  await expect(players[0].getByText('Olet mukana!')).toBeVisible();

  await host.getByRole('button', { name: /Pikailta/ }).click();
  await host.getByTestId('speed').selectOption('0.1');
  await host.getByRole('button', { name: 'Aloita peli' }).click();

  const deadline = Date.now() + 360_000;
  let lieN = 0;
  while (Date.now() < deadline) {
    const stage = await host.evaluate(() => (window as any).__halinaHost?.game?.stage as string | undefined);
    if (stage === 'podium') break;
    for (const p of players) {
      const lie = p.getByPlaceholder('Uskottava valhe…');
      if ((await lie.count()) > 0 && (await lie.isEnabled({ timeout: 300 }).catch(() => false)) && !(await lie.inputValue({ timeout: 300 }).catch(() => 'x'))) {
        await lie.fill(`Valhe numero ${++lieN}`).catch(() => {});
        await p.getByRole('button', { name: 'Lähetä' }).click({ timeout: 500 }).catch(() => {});
        continue;
      }
      const btns = p.locator('main button:not([disabled])');
      const n = await btns.count().catch(() => 0);
      if (n > 0) await btns.nth(Math.floor(Math.random() * n)).click({ timeout: 500 }).catch(() => {});
    }
    await host.waitForTimeout(300);
  }
  await expect(host.getByRole('heading', { name: /Lopputulokset/ })).toBeVisible();
  for (const p of players) await expect(p.getByText(/Olet sijalla \d\./)).toBeVisible();
  expect(errors).toEqual([]);
});
