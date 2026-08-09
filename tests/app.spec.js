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

async function unlockCurrentClue(page) {
  const challenge = page.locator('.treasure-challenge');
  if (!await challenge.isVisible()) return;
  const correctChoice = challenge.locator('[data-challenge-correct="true"]');
  if (await correctChoice.count() === 1) {
    await correctChoice.click();
    await expect(page.getByText('CRYPTIC CLUE')).toBeVisible();
    return;
  }
  throw new Error('The test route did not expose its authored quiz answer.');
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
  const tutorial = page.getByRole('dialog', { name: 'Open the clue lock' });
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

test('GPS filtering damps stationary jitter and rejects a poor outlier without lagging behind walking', async ({ page }) => {
  await openHome(page);
  const result = await page.evaluate(() => {
    const latitude = 52.57;
    const longitude = -0.24;
    const longitudeDegrees = metres => metres / (111320 * Math.cos(latitude * Math.PI / 180));
    const reading = (metres, accuracy, speed, timestamp) => ({
      coords: { latitude, longitude: longitude + longitudeDegrees(metres), accuracy, altitude: null, altitudeAccuracy: null, heading: 90, speed },
      timestamp
    });
    const offset = position => distance([latitude, longitude], [position.coords.latitude, position.coords.longitude]) * 1000
      * Math.sign(position.coords.longitude - longitude || 1);

    const stationaryRaw = [-12, 11, -10, 14, -13, 9];
    const stationaryFilter = createGpsPositionFilter();
    const stationarySmoothed = stationaryRaw.map((metres, index) => offset(smoothGpsPosition(reading(metres, 22, 0, 1000 + index * 1000), stationaryFilter)));
    const beforeOutlier = stationaryFilter.position;
    const afterOutlier = smoothGpsPosition(reading(220, 120, 0, 8000), stationaryFilter);

    const walkingFilter = createGpsPositionFilter();
    const walking = [0, 8, 16, 24, 32].map((metres, index) => smoothGpsPosition(reading(metres, 6, 1.3, 1000 + index * 1000), walkingFilter));
    const finalWalkingOffset = offset(walking[walking.length - 1]);
    return {
      rawSpan: Math.max(...stationaryRaw) - Math.min(...stationaryRaw),
      smoothedSpan: Math.max(...stationarySmoothed) - Math.min(...stationarySmoothed),
      outlierMovement: distance([beforeOutlier.coords.latitude, beforeOutlier.coords.longitude], [afterOutlier.coords.latitude, afterOutlier.coords.longitude]) * 1000,
      rejectedFixes: stationaryFilter.rejectedFixes,
      finalWalkingOffset,
      walkingLag: 32 - finalWalkingOffset,
      wrappedHeading: smoothCompassHeading(358, 2)
    };
  });
  expect(result.smoothedSpan).toBeLessThan(result.rawSpan * 0.45);
  expect(result.outlierMovement).toBeLessThan(1);
  expect(result.rejectedFixes).toBe(1);
  expect(result.finalWalkingOffset).toBeGreaterThan(23);
  expect(result.walkingLag).toBeLessThan(10);
  expect(result.wrappedHeading).toBeGreaterThan(358);
  expect(result.wrappedHeading).toBeLessThan(360);
});

test('a strong GPS fix reaches the landmark check promptly', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:4173' });
  await openHome(page);
  const target = await page.evaluate(async () => {
    const index = await fetch('packs/index.json').then(response => response.json());
    const entry = index.packs.find(item => item.enabled);
    const pack = await fetch(`packs/${entry.file}`).then(response => response.json());
    const stop = [...pack.stops].sort((a, b) => Number(a.Stop_Order) - Number(b.Stop_Order))[0];
    return { latitude: Number(stop.Target_Lat), longitude: Number(stop.Target_Long) };
  });
  await context.setGeolocation({ ...target, accuracy: 5 });
  await page.locator('.route-card-open').first().click();
  await page.getByRole('button', { name: 'Start adventure' }).click();
  await unlockCurrentClue(page);
  await page.getByRole('button', { name: 'Scan my location' }).click();
  await expect(page.getByRole('dialog', { name: 'Are you at the landmark?' })).toBeVisible();
  await expect(page.locator('#arrivalReading')).toContainText('±5 m');
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
  await expect(page.getByText(/CLUE SEALED/)).toBeVisible();
  await unlockCurrentClue(page);
  await expect(page.getByText('CRYPTIC CLUE')).toBeVisible();
  await page.reload();
  await expect(page.getByText('CRYPTIC CLUE')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Your mission' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Where will your next clue lead?' })).toBeVisible();
});

test('the phone game keeps the mission, progress and primary scan action clear', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  await page.locator('.route-card-open').first().click();
  await page.getByRole('button', { name: 'Start adventure' }).click();

  await expect(page.locator('.game-hud-route')).toBeVisible();
  await expect(page.getByLabel('Adventure progress')).toContainText('STOP 1 OF');
  await expect(page.getByText(/CLUE SEALED/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scan my location' })).toBeHidden();

  const wrongChoice = page.locator('.treasure-choices button:not([data-challenge-correct="true"])').first();
  await wrongChoice.click();
  await expect(page.getByText(/does not fit/)).toBeVisible();
  await unlockCurrentClue(page);
  await expect(page.getByText('CRYPTIC CLUE')).toBeVisible();

  const scan = page.getByRole('button', { name: 'Scan my location' });
  await expect(scan).toBeVisible();
  const layout = await page.evaluate(() => {
    const scanRect = document.querySelector('#checkBtn').getBoundingClientRect();
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scanTop: scanRect.top,
      scanBottom: scanRect.bottom,
      scanHeight: scanRect.height
    };
  });
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth);
  expect(layout.scanTop).toBeGreaterThanOrEqual(0);
  expect(layout.scanBottom).toBeLessThanOrEqual(layout.innerHeight);
  expect(layout.scanHeight).toBeGreaterThanOrEqual(56);

  await page.getByRole('button', { name: /Reveal a hint/ }).click();
  await expect(page.locator('.game-hint')).toHaveCount(1);
  await expect(page.locator('.game-hint')).toContainText('HINT 1');
});

test('all stops receive a stable mix of treasure challenge types', async ({ page }) => {
  await openHome(page);
  const audit = await page.evaluate(async () => {
    const index = await fetch('packs/index.json').then(response => response.json());
    const routePacks = await Promise.all(index.packs.filter(entry => entry.enabled).map(entry => fetch(`packs/${entry.file}`).then(response => response.json())));
    const challenges = routePacks.flatMap(pack => [...pack.stops]
      .sort((a, b) => Number(a.Stop_Order) - Number(b.Stop_Order))
      .map((stop, stopIndex) => ({ pack: pack.pack_id, stop: stop.Stop_ID, challenge: treasureChallengeFor(pack, stop, stopIndex) })));
    return {
      stops: challenges.length,
      types: [...new Set(challenges.map(item => item.challenge.type))].sort(),
      invalid: challenges.filter(item => !item.challenge.id || !item.challenge.title || !item.challenge.prompt).map(item => `${item.pack}:${item.stop}`),
      first: challenges[0].challenge
    };
  });
  expect(audit.stops).toBe(203);
  expect(audit.types).toEqual(['cipher', 'clue_shards', 'compass', 'memory', 'odd_one_out', 'pairs', 'pattern', 'quiz', 'word_lock', 'word_search']);
  expect(audit.invalid).toEqual([]);
  expect(audit.first.type).toBe('quiz');
  expect(audit.first.answer).toBe('Butter');
});

test('the five expanded mini-games render complete controls and can be solved', async ({ page }) => {
  await openHome(page);
  const samples = await page.evaluate(async () => {
    const wanted = ['odd_one_out', 'pattern', 'compass', 'word_search', 'pairs'];
    const index = await fetch('packs/index.json').then(response => response.json());
    const routePacks = await Promise.all(index.packs.filter(entry => entry.enabled).map(entry => fetch(`packs/${entry.file}`).then(response => response.json())));
    const found = {};
    routePacks.forEach(pack => [...pack.stops]
      .sort((a, b) => Number(a.Stop_Order) - Number(b.Stop_Order))
      .forEach((stop, stopIndex) => {
        const challenge = treasureChallengeFor(pack, stop, stopIndex);
        if (wanted.includes(challenge.type) && !found[challenge.type]) found[challenge.type] = { stop, challenge };
      }));
    return found;
  });

  expect(Object.keys(samples).sort()).toEqual(['compass', 'odd_one_out', 'pairs', 'pattern', 'word_search']);
  expect(samples.compass.challenge.directions).toHaveLength(8);
  expect(samples.word_search.challenge.cells).toHaveLength(36);
  expect(samples.pairs.challenge.tiles).toHaveLength(6);

  for (const type of ['odd_one_out', 'pattern', 'compass', 'word_search', 'pairs']) {
    await page.evaluate(({ stop, challenge }) => {
      window.__treasureSolved = false;
      unlockTreasureClue = () => { window.__treasureSolved = true; };
      const host = document.querySelector('#gameView');
      host.classList.remove('hidden');
      host.innerHTML = treasureChallengeMarkup(challenge);
      wireTreasureChallenge(stop, challenge);
    }, samples[type]);

    if (['odd_one_out', 'pattern', 'compass'].includes(type)) {
      await page.locator('[data-challenge-correct="true"]').click();
    } else if (type === 'word_search') {
      await page.evaluate(() => [...document.querySelectorAll('[data-word-order]:not([data-word-order=""])')]
        .sort((a, b) => Number(a.dataset.wordOrder) - Number(b.dataset.wordOrder))
        .forEach(button => button.click()));
    } else {
      await page.evaluate(() => {
        const groups = {};
        document.querySelectorAll('[data-pair-symbol]').forEach(button => {
          groups[button.dataset.pairSymbol] ||= [];
          groups[button.dataset.pairSymbol].push(button);
        });
        Object.values(groups).forEach(pair => pair.forEach(button => button.click()));
      });
    }
    await expect.poll(() => page.evaluate(() => window.__treasureSolved)).toBe(true);
  }
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

test('notifications fully disappear after their exit animation on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openHome(page);
  const toast = page.locator('#toast');
  await page.evaluate(() => toast('This is a deliberately long notification that wraps onto several lines on a small phone.'));
  await expect(toast).toBeVisible();
  const shownBox = await toast.boundingBox();
  expect(shownBox).not.toBeNull();
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  expect(shownBox.y).toBeGreaterThanOrEqual(0);
  expect(shownBox.y + shownBox.height).toBeLessThanOrEqual(viewportHeight);
  await expect(toast).toBeHidden({ timeout: 4000 });
  await expect(toast).toHaveAttribute('hidden', '');
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
  await unlockCurrentClue(page);
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
