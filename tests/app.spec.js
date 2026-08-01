import { expect, test } from '@playwright/test';

async function skipFirstRun(page) {
  await page.addInitScript(() => {
    localStorage.setItem('day-tripping-quiz-safety-accepted-v1', 'yes');
    localStorage.setItem('day-tripping-quiz-profile-v1', JSON.stringify({ tutorialSeen: true }));
  });
}

async function openHome(page) {
  await skipFirstRun(page);
  await page.goto('/');
  await expect(page.locator('.route-card-open').first()).toBeVisible();
}

test('first-run safety is keyboard safe and hands off to the tutorial', async ({ page }) => {
  await page.goto('/');
  const safety = page.getByRole('dialog', { name: 'Adventure responsibly.' });
  await expect(safety).toBeVisible();
  const accept = page.getByRole('button', { name: 'I understand — let’s explore' });
  await expect(accept).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(safety).toBeVisible();
  await accept.click();
  const tutorial = page.getByRole('dialog', { name: 'Follow the cryptic clue' });
  await expect(tutorial).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close tutorial' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(tutorial).toBeHidden();
});

test('adventure cards are real keyboard controls', async ({ page }) => {
  await openHome(page);
  const cards = page.locator('.route-card');
  await expect(cards).not.toHaveCount(0);
  await expect(page.locator('.route-card:not(:has(.route-card-open))')).toHaveCount(0);
  await expect(page.locator('[data-pack]:not(button)')).toHaveCount(0);

  const firstCard = page.locator('.route-card-open').first();
  await firstCard.focus();
  await expect(firstCard).toBeFocused();
  await firstCard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Your mission' })).toBeVisible();
});

test('Surprise Me only chooses adventures inside the selected distance', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:4173' });
  await context.setGeolocation({ latitude: 52.570046, longitude: -0.240769 });
  await openHome(page);
  const slider = page.getByRole('slider', { name: 'Maximum distance from my location' });
  await slider.evaluate(element => {
    element.value = '5';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#surpriseDistanceValue')).toHaveText('5 km');
  await page.getByRole('button', { name: /Surprise me/ }).click();
  await expect(page.locator('.detail-location')).toHaveText('PETERBOROUGH');
  await expect(page.getByText(/Surprise Me bonus/)).toBeVisible();
});

test('Surprise Me never falls back to a route outside the selected distance', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:4173' });
  await context.setGeolocation({ latitude: 60.35, longitude: -1.2 });
  await openHome(page);
  const slider = page.getByRole('slider', { name: 'Maximum distance from my location' });
  await slider.evaluate(element => {
    element.value = '5';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.getByRole('button', { name: /Surprise me/ }).click();
  await expect(page.getByText('No adventures within 5 km. Widen the range and try again.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Where will your next clue lead?' })).toBeVisible();
});

test('accessibility summary is collapsed and reveals the full practical guidance', async ({ page }) => {
  await openHome(page);
  await page.locator('.route-card-open').first().click();
  const practical = page.locator('.before-you-go');
  await expect(practical).not.toHaveAttribute('open', '');
  await expect(practical.getByText('Accessibility score')).toBeVisible();
  await expect(practical.getByText(/out of 3/)).toBeVisible();
  await expect(practical.getByText('Terrain', { exact: true })).toBeHidden();
  await practical.locator('summary').click();
  await expect(practical).toHaveAttribute('open', '');
  await expect(practical.getByText('Terrain', { exact: true })).toBeVisible();
  await expect(practical.getByText('Dogs', { exact: true })).toBeVisible();
});

test('route age guidance is presented separately from the key statistics', async ({ page }) => {
  await openHome(page);
  await page.locator('.route-card-open').first().click();
  await expect(page.locator('.detail-stats .stat')).toHaveCount(4);
  const ageGuidance = page.locator('.age-guidance');
  await expect(ageGuidance).toBeVisible();
  await expect(ageGuidance.getByText('AGE GUIDANCE')).toBeVisible();
  await expect(ageGuidance).toContainText(/Recommended for explorers aged \d+\+/);
  await expect(ageGuidance).toContainText('Final venue entry policies may vary.');
});

test('practical guidance has valid scores and does not name route stops', async ({ page }) => {
  await openHome(page);
  const audit = await page.evaluate(async () => {
    const normalise = value => String(value || '')
      .normalize('NFKD')
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9]+/gi, ' ')
      .trim()
      .toLowerCase();
    const index = await fetch('packs/index.json').then(response => response.json());
    const packs = await Promise.all(index.packs.map(entry => fetch(`packs/${entry.file}`).then(response => response.json())));
    return packs.flatMap(pack => {
      const practical = normalise(`${Object.values(pack.before_you_go || {}).join(' ')} ${pack.transport_note || ''}`);
      const spoilers = pack.stops
        .map(stop => stop.Stop_Name)
        .filter(name => practical.includes(normalise(name)));
      const score = Number(pack.before_you_go?.accessibility_score);
      return spoilers.length || ![1, 2, 3].includes(score)
        ? [{ pack: pack.pack_id, score, spoilers }]
        : [];
    });
  });
  expect(audit).toEqual([]);
});

test('settings traps focus, closes with Escape and returns focus', async ({ page }) => {
  await openHome(page);
  const opener = page.getByRole('button', { name: 'Help and settings' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Help & settings' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close settings' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('#settingsBackdrop')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('an active adventure survives refresh and browser Back', async ({ page }) => {
  await openHome(page);
  await page.locator('.route-card-open').first().click();
  await page.getByRole('button', { name: 'Start adventure' }).click();
  await expect(page.getByText('CRYPTIC CLUE')).toBeVisible();
  await page.reload();
  await expect(page.getByText('CRYPTIC CLUE')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Your mission' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Where will your next clue lead?' })).toBeVisible();
});

test('the phone layout has no horizontal overflow and keeps 44px header targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    controls: [...document.querySelectorAll('.top-actions button')].map(button => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    })
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  expect(metrics.controls.every(control => control.width >= 44 && control.height >= 44)).toBe(true);
  await expect(page.getByRole('slider', { name: 'Maximum distance from my location' })).toBeVisible();
});

test('a saved adventure reloads and starts while offline', async ({ page, context }) => {
  await openHome(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.locator('.route-card-open').first()).toBeVisible();
  await page.locator('.route-card-open').first().click();
  const saveButton = page.getByRole('button', { name: 'Save offline' });
  await expect(saveButton).toBeVisible();
  await saveButton.click();
  await expect(page.getByText(/Route saved/)).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start adventure' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByText(/You are offline/)).toBeVisible();
  await page.getByRole('button', { name: 'Start adventure' }).click();
  await expect(page.getByText('CRYPTIC CLUE')).toBeVisible();
  await context.setOffline(false);
});

test('privacy and support information is reachable', async ({ page }) => {
  await openHome(page);
  await expect(page.getByRole('link', { name: 'Privacy & offline use' })).toHaveAttribute('href', 'privacy.html');
  await expect(page.getByRole('link', { name: 'Report a problem' }).first()).toHaveAttribute('href', /github\.com\/ThatOneGuyBanks\/GeoQuest\/issues\/new/);
  await page.goto('/privacy.html');
  await expect(page.getByRole('heading', { name: 'Your adventure stays yours.' })).toBeVisible();
});
