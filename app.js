const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

let packs = [];
let distanceComparisons = [];
let userPos = null;
let map = null;
let mapReady = false;
let detailMap = null;
let currentPack = null;
let currentStop = 0;
let currentHints = 0;
let watchId = null;
let pendingArrival = null;
let deviceHeading = null;
let orientationHandler = null;
let latestGuideReading = null;
let lastScanReading = null;
let selectedAsDaily = false;
let selectedAsSurprise = false;
let selectedDailyDate = null;
let stuckTapTimes = [];
let debugMode = false;
let debugStop = null;
let debugDistance = 100;
let stuckTapTimer = null;
let achievementsExpanded = false;
let featuredExpanded = false;
let nearbyExpanded = false;
let venueDisclosurePackId = null;
let venueHoursExpanded = false;
let venueDetailsRevealed = false;
let navigationTransitionsReady = false;
let pageTransitionCycle = 0;
let pageTransitionTimers = [];
let tutorialStep = 0;
let resetProgressTimer = null;
let guideSession = 0;
let currentCollection = null;
let pendingDiscovery = null;
let postcardEditorState = null;
let adventurePhotos = [];
let adventureNotes = [];
let navigationHistoryMode = 'push';
const POSTCARD_WIDTH = 1080;
const POSTCARD_HEIGHT = 1350;
const POSTCARD_PREVIEW_WIDTH = 540;
const POSTCARD_PREVIEW_HEIGHT = 675;

const KEY = 'day-tripping-quiz-progress-v1';
const SAFETY_KEY = 'day-tripping-quiz-safety-accepted-v1';
const PROFILE_KEY = 'day-tripping-quiz-profile-v1';
const LEGACY_KEY = 'geoquest-progress-v3';
const LEGACY_SAFETY_KEY = 'geoquest-safety-accepted-v1';
const LEGACY_PROFILE_KEY = 'geoquest-profile-v1';
const VIEW_KEY = 'day-tripping-quiz-view-v1';
const BACKUP_FORMAT = 'day-tripping-quiz-backup';
const BACKUP_VERSION = 1;
const SCORE_VERSION = 2;
const SCORING = Object.freeze({
  discovery: 1000,
  noHint: 250,
  curiosity: 250,
  completion: 1000,
  noSkip: 500,
  noHintRoute: 750,
  firstCompletion: 500,
  surpriseRate: 0.2,
  dailyRate: 1
});
const CURIOSITY_PROMPTS = [
  'Look above eye level. Find one detail most people would walk straight past.',
  'Find a date, name or symbol nearby that helps tell this place\'s story.',
  'Step back somewhere safe and spot one feature that reveals what this place was built for.',
  'Study the materials and decoration. Find one detail that could not have come from a modern building.',
  'Look for an animal, face, crest, pattern or maker\'s mark hidden in the scene.',
  'Turn away from the screen and notice one connection between this landmark and the street around it.'
];
const progress = readProgress();
const profile = readProfile();
const TUTORIAL_STEPS = [
  { icon: '◇', eyebrow: 'STEP 1 · SOLVE', title: 'Follow the cryptic clue', text: 'Each stop begins with a clue. Look around the real world, reveal hints only when you need them, and keep your eyes off the screen while walking.' },
  { icon: '⌖', eyebrow: 'STEP 2 · SCAN', title: 'Check your distance', text: 'Use the location scanner when you think you are close. It shows kilometres or miles and turns the distance into memorable comparisons.' },
  { icon: '✦', eyebrow: 'STEP 3 · DISCOVER', title: 'Unlock the story', text: 'Confirm the landmark when you can genuinely see it. You will earn points, reveal its story and move on to the next mystery.' }
];

function readStoredValue(key, legacyKey) {
  const current = localStorage.getItem(key);
  if (current !== null) return current;
  const legacy = localStorage.getItem(legacyKey);
  if (legacy !== null) localStorage.setItem(key, legacy);
  return legacy;
}

function readProgress() {
  try {
    return JSON.parse(readStoredValue(KEY, LEGACY_KEY) || '{}');
  } catch {
    return {};
  }
}

function readProfile() {
  try {
    const saved = JSON.parse(readStoredValue(PROFILE_KEY, LEGACY_PROFILE_KEY) || '{}');
    return normalizeProfile(saved);
  } catch {
    return normalizeProfile();
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeProfile(saved = {}) {
  const achievementDates = isRecord(saved.achievementDates)
    ? Object.fromEntries(Object.entries(saved.achievementDates).filter(([key, value]) => !['__proto__', 'constructor', 'prototype'].includes(key) && typeof value === 'string'))
    : {};
  return {
    unit: saved.unit === 'mi' ? 'mi' : 'km',
    dailyDates: Array.isArray(saved.dailyDates) ? saved.dailyDates.filter(value => typeof value === 'string') : [],
    achievementDates,
    sound: saved.sound !== false,
    vibration: saved.vibration !== false,
    tutorialSeen: saved.tutorialSeen === true,
    surpriseCompletions: Math.max(0, Number(saved.surpriseCompletions) || 0)
  };
}

function saveProfile() {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function readViewState() {
  try {
    const state = JSON.parse(sessionStorage.getItem(VIEW_KEY) || '{}');
    return state && typeof state === 'object' ? state : {};
  } catch {
    return {};
  }
}

function viewState(view) {
  const state = { view, savedAt: Date.now() };
  if (currentPack) {
    state.packId = currentPack.pack_id;
    state.isDaily = selectedAsDaily;
    state.isSurprise = selectedAsSurprise;
    if (selectedDailyDate) state.dailyDate = selectedDailyDate;
  }
  if (view === 'collectionView' && currentCollection) state.collection = currentCollection;
  if (view === 'gameView') {
    state.stopIndex = currentStop;
    state.hints = currentHints;
    if (pendingDiscovery) state.discovery = pendingDiscovery;
  }
  return state;
}

function historyTarget(state = {}) {
  return [state.view || 'homeView', state.packId || '', state.collection || ''].join('|');
}

function navigationState(state) {
  return { ...state, dayTrippingHistory: true };
}

function rememberView(view, syncHistory = true) {
  try {
    const state = viewState(view);
    sessionStorage.setItem(VIEW_KEY, JSON.stringify(state));
    if (syncHistory && history.state?.dayTrippingHistory && historyTarget(history.state) === historyTarget(state)) {
      history.replaceState(navigationState(state), '');
    }
    return state;
  } catch {}
  return viewState(view);
}

function seedNavigationHistory() {
  if (!history.state?.dayTrippingHistory) {
    history.replaceState(navigationState({ view: 'homeView', savedAt: Date.now() }), '');
  }
}

function closeNavigationOverlays() {
  closePostcardEditor();
  closeSettings();
  closeSearch();
  closeTutorial(false);
  closeArrival();
}

function handleHistoryNavigation(event) {
  if (!event.state?.dayTrippingHistory) return;
  closeNavigationOverlays();
  navigationHistoryMode = 'none';
  try {
    restoreView(event.state);
  } finally {
    navigationHistoryMode = 'push';
  }
}

function navigateBack() {
  if (history.state?.dayTrippingHistory && history.state.view !== 'homeView') {
    history.back();
    return;
  }
  navigationHistoryMode = 'replace';
  try {
    showHome();
  } finally {
    navigationHistoryMode = 'push';
  }
}

function bindNavigationButtons() {
  $$('[data-home]').forEach(button => button.onclick = showHome);
  $$('[data-back]').forEach(button => button.onclick = navigateBack);
}

function restoreView(state = readViewState()) {
  if (state.view === 'passportView') {
    showPassport();
    return;
  }
  if (state.view === 'mapView') {
    showMap();
    return;
  }
  if (state.view === 'collectionView' && state.collection) {
    openCollection(state.collection);
    return;
  }
  const pack = state.packId ? packs.find(item => item.pack_id === state.packId) : null;
  if (state.view === 'detailView' && pack) {
    openDetail(pack, Boolean(state.isDaily && state.dailyDate === todayKey()), Boolean(state.isSurprise));
    return;
  }
  if (state.view === 'gameView' && pack) {
    currentPack = pack;
    const routeState = packProgress(pack);
    if (!routeState.completed && !Number(routeState.startedAt)) {
      routeState.startedAt = Date.now();
      progress[pack.pack_id] = routeState;
      save();
    }
    selectedAsDaily = Boolean(state.isDaily) || Boolean(routeState.dailyRunDate);
    selectedAsSurprise = Boolean(state.isSurprise) || routeState.runMode === 'surprise';
    selectedDailyDate = routeState.dailyRunDate || (state.dailyDate === todayKey() ? state.dailyDate : null);
    currentStop = Math.max(0, Math.min(pack.stops.length, Number(routeState.stop) || 0));
    const discovery = state.discovery;
    if (discovery && Number(discovery.stopIndex) === currentStop && pack.stops[currentStop]) {
      currentHints = Math.max(0, Math.min(2, Number(discovery.hints) || 0));
      applyRouteTheme(pack);
      showOnly('gameView');
      renderDiscoveryScreen(pack.stops[currentStop], Boolean(discovery.skip), Boolean(discovery.debug), true, Boolean(discovery.curiosityClaimed), String(discovery.fieldworkType || ''));
    } else {
      renderGame({ hints: Math.max(0, Math.min(2, Number(state.hints) || 0)) });
    }
    return;
  }
  showHome();
}

function dateFromKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12) : null;
}

function dailyStreak() {
  const dates = [...new Set(profile.dailyDates)].map(dateFromKey).filter(Boolean).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let previous = null;
  dates.forEach(date => {
    const gap = previous ? Math.round((date - previous) / 86400000) : null;
    run = gap === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  });
  if (!dates.length) return { current: 0, best: 0 };
  const last = dates[dates.length - 1];
  const today = dateFromKey(todayKey());
  const age = Math.round((today - last) / 86400000);
  return { current: age <= 1 ? run : 0, best };
}

function maybeShowTutorial() {
  if (!profile.tutorialSeen) openTutorial(0);
}

function openTutorial(step = 0) {
  tutorialStep = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, Number(step) || 0));
  const item = TUTORIAL_STEPS[tutorialStep];
  $('#tutorialVisual').textContent = item.icon;
  $('#tutorialEyebrow').textContent = item.eyebrow;
  $('#tutorialTitle').textContent = item.title;
  $('#tutorialText').textContent = item.text;
  $('#tutorialDots').innerHTML = TUTORIAL_STEPS.map((_, index) => `<i class="${index === tutorialStep ? 'active' : ''}"></i>`).join('');
  $('#tutorialBack').disabled = tutorialStep === 0;
  $('#tutorialNext').textContent = tutorialStep === TUTORIAL_STEPS.length - 1 ? 'Start exploring' : 'Next';
  $('#tutorialModal').classList.remove('hidden');
}

function closeTutorial(markSeen = false) {
  if (markSeen) {
    profile.tutorialSeen = true;
    saveProfile();
  }
  $('#tutorialModal').classList.add('hidden');
}

function openSettings() {
  renderSettings();
  $('#settingsBackdrop').classList.remove('hidden');
}

function closeSettings() {
  $('#settingsBackdrop').classList.add('hidden');
}

function renderSettings() {
  $$('[data-settings-unit]').forEach(button => {
    const active = button.dataset.settingsUnit === profile.unit;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  [['soundSetting', 'sound'], ['vibrationSetting', 'vibration']].forEach(([id, key]) => {
    const button = $(`#${id}`);
    if (!button) return;
    button.classList.toggle('active', Boolean(profile[key]));
    button.setAttribute('aria-checked', String(Boolean(profile[key])));
  });
}

function setFeedbackSetting(key, value) {
  profile[key] = Boolean(value);
  saveProfile();
  renderSettings();
}

function exportProgress() {
  const backup = {
    app: 'Day Tripping Quiz',
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    progress,
    profile
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `day-tripping-quiz-progress-${todayKey()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  toast('Progress backup downloaded.');
}

function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsText(file);
  });
}

function validateBackup(backup) {
  if (!isRecord(backup) || (backup.format !== BACKUP_FORMAT && backup.app !== 'Day Tripping Quiz')) {
    throw new Error('That is not a Day Tripping Quiz backup.');
  }
  if (!isRecord(backup.progress) || !isRecord(backup.profile)) {
    throw new Error('That backup is missing progress or profile data.');
  }
  const importedProgress = {};
  Object.entries(backup.progress).forEach(([packId, state]) => {
    if (['__proto__', 'constructor', 'prototype'].includes(packId) || !isRecord(state)) {
      throw new Error('That backup contains invalid adventure progress.');
    }
    importedProgress[packId] = state;
  });
  return { progress: importedProgress, profile: normalizeProfile(backup.profile) };
}

async function importProgressFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.json')) {
    toast('Please choose a Day Tripping Quiz JSON backup.');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    toast('That file is too large to be a progress backup.');
    return;
  }
  try {
    const imported = validateBackup(JSON.parse(await readBackupFile(file)));
    localStorage.setItem(KEY, JSON.stringify(imported.progress));
    localStorage.setItem(PROFILE_KEY, JSON.stringify(imported.profile));
    Object.keys(progress).forEach(key => delete progress[key]);
    Object.assign(progress, imported.progress);
    Object.keys(profile).forEach(key => delete profile[key]);
    Object.assign(profile, imported.profile);
    sessionStorage.removeItem(VIEW_KEY);
    closeSettings();
    renderAll();
    showHome();
    toast('Progress imported — welcome back.');
  } catch (error) {
    toast(error instanceof SyntaxError ? 'That file is not valid JSON.' : error.message || 'That backup could not be imported.');
  }
}

function resetAllProgress() {
  const button = $('#resetProgress');
  if (button.dataset.confirming !== 'true') {
    button.dataset.confirming = 'true';
    button.classList.add('confirming');
    button.querySelector('b').textContent = 'Press again to reset everything';
    clearTimeout(resetProgressTimer);
    resetProgressTimer = setTimeout(() => {
      button.dataset.confirming = 'false';
      button.classList.remove('confirming');
      button.querySelector('b').textContent = 'Reset all progress';
    }, 10000);
    return;
  }
  Object.keys(progress).forEach(key => delete progress[key]);
  profile.dailyDates = [];
  profile.achievementDates = {};
  profile.surpriseCompletions = 0;
  localStorage.removeItem(KEY);
  localStorage.removeItem(LEGACY_KEY);
  saveProfile();
  clearTimeout(resetProgressTimer);
  closeSettings();
  renderAll();
  showHome();
  toast('Progress reset. Your preferences were kept.');
}

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function formatPoints(value) {
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-GB');
}

function emptyScoreBreakdown() {
  return {
    landmarks: 0,
    hintPenalty: 0,
    sharpEyes: 0,
    curiosity: 0,
    completion: 0,
    noSkip: 0,
    noHintRoute: 0,
    firstCompletion: 0,
    modeBonus: 0
  };
}

function scoreForStop(hints = 0, skip = false, curiosityClaimed = false) {
  if (skip) return { total: 0, landmarks: 0, hintPenalty: 0, sharpEyes: 0, curiosity: 0 };
  const safeHints = Math.max(0, Math.min(2, Number(hints) || 0));
  const hintPenalty = safeHints === 0 ? 0 : safeHints === 1 ? 100 : 250;
  const sharpEyes = safeHints === 0 ? SCORING.noHint : 0;
  const curiosity = curiosityClaimed ? SCORING.curiosity : 0;
  return {
    total: SCORING.discovery - hintPenalty + sharpEyes + curiosity,
    landmarks: SCORING.discovery,
    hintPenalty,
    sharpEyes,
    curiosity
  };
}

function curiosityPrompt(stop) {
  if (stop?.Explorer_Prompt) return String(stop.Explorer_Prompt);
  const seed = [...String(stop?.Stop_ID || stop?.Stop_Name || currentStop)]
    .reduce((total, character) => total + character.charCodeAt(0), 0);
  return CURIOSITY_PROMPTS[seed % CURIOSITY_PROMPTS.length];
}

function modeName(mode) {
  if (mode === 'daily') return 'Daily Double';
  if (mode === 'surprise') return 'Surprise Me';
  return 'Standard adventure';
}

function migrateProgressScoring() {
  let changed = false;
  Object.values(progress).forEach(state => {
    if (!state || typeof state !== 'object' || Number(state.scoreVersion) >= SCORE_VERSION) return;
    const currentScore = Math.max(0, Number(state.score) || 0);
    const bestScore = Math.max(currentScore, Number(state.bestScore) || 0);
    const currentCompletionBonus = state.completed && currentScore > 0
      ? SCORING.completion
        + (Number(state.skipped) === 0 ? SCORING.noSkip : 0)
        + (Number(state.hintsUsed) === 0 ? SCORING.noHintRoute : 0)
        + (Number(state.completions) <= 1 ? SCORING.firstCompletion : 0)
      : 0;
    const bestCompletionBonus = bestScore > 0 && (state.completed || state.everCompleted)
      ? SCORING.completion + SCORING.noSkip
      : 0;
    state.score = Math.round(currentScore * 10 + currentCompletionBonus);
    state.bestScore = Math.max(state.score, Math.round(bestScore * 10 + bestCompletionBonus));
    state.baseScore = state.score;
    state.bestBaseScore = Math.max(Number(state.bestBaseScore) || 0, state.bestScore);
    state.scoreVersion = SCORE_VERSION;
    changed = true;
  });
  if (changed) localStorage.setItem(KEY, JSON.stringify(progress));
}

async function init() {
  try {
    const index = await fetch('packs/index.json', { cache: 'no-store' }).then(response => {
      if (!response.ok) throw Error(`packs/index.json ${response.status}`);
      return response.json();
    });
    const comparisonRequest = fetch('data/distance-comparisons.json', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(Error('Comparison catalogue unavailable')))
      .catch(() => ({ comparisons: [
        { id: 'bus', metres: 11.2, emoji: '🚌', singular: 'double-decker bus', plural: 'double-decker buses', near: 'the length of a double-decker bus', action: 'parked nose to tail', category: 'vehicle' },
        { id: 'pool', metres: 50, emoji: '🏊', singular: 'Olympic swimming pool', plural: 'Olympic swimming pools', near: 'one length of an Olympic swimming pool', action: 'joined end to end', category: 'sport' },
        { id: 'eiffel', metres: 330, emoji: '🗼', singular: 'Eiffel Tower', plural: 'Eiffel Towers', near: 'the height of the Eiffel Tower', action: 'stacked tip to base', category: 'landmark' },
        { id: 'marathon', metres: 42195, emoji: '🏅', singular: 'marathon', plural: 'marathons', near: 'the distance of a marathon', action: 'run back to back', category: 'sport' }
      ] }));
    const results = await Promise.allSettled(index.packs
      .filter(entry => entry.enabled)
      .map(entry => fetch(`packs/${entry.file}`, { cache: 'no-store' }).then(response => {
        if (!response.ok) throw Error(entry.file);
        return response.json();
      }).then(pack => ({ ...pack, source_file: entry.file }))));
    packs = results.filter(result => result.status === 'fulfilled').map(result => normalise(result.value));
    const comparisonCatalogue = await comparisonRequest;
    distanceComparisons = comparisonCatalogue.comparisons
      .filter(item => Number(item.metres) > 0 && item.singular && item.plural)
      .sort((a, b) => Number(a.metres) - Number(b.metres));
    if (!packs.length) throw Error('No route packs loaded');
    migrateProgressScoring();
    renderAll();
    bind();
    restoreContinue();
    seedNavigationHistory();
    window.addEventListener('popstate', handleHistoryNavigation);
    restoreView();
    navigationTransitionsReady = true;
  } catch (error) {
    document.body.innerHTML = `<main class="detail-body"><h1>Could not load game data</h1><p>${esc(error.message)}</p><p>Serve the project through GitHub Pages or the included local server.</p></main>`;
  }
}

function normalise(pack) {
  return {
    ...pack,
    route_distance_km: pack.route_distance_km || 0,
    estimated_minutes: pack.estimated_minutes || 60,
    difficulty_label: pack.difficulty_label || 'Detective',
    collections: pack.collections || [],
    tags: pack.tags || [],
    author: pack.author || 'Day Tripping Quiz',
    recommended_age: pack.recommended_age || 'All ages',
    display_name: pack.display_name || pack.town,
    before_you_go: pack.before_you_go || {},
    stops: [...(pack.stops || [])].sort((a, b) => Number(a.Stop_Order) - Number(b.Stop_Order))
  };
}

const VENUE_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function clockMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59 || (hours === 24 && minutes !== 0)) return null;
  return hours * 60 + minutes;
}

function formatClock(value) {
  const minutes = clockMinutes(value);
  if (minutes === null) return String(value || '');
  const normalised = minutes % 1440;
  const hour = Math.floor(normalised / 60);
  const minute = normalised % 60;
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date(2020, 0, 1, hour, minute));
}

function formatMinutes(minutes) {
  minutes = Math.max(0, Math.round(minutes));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function formatAdventureTime(seconds, compact = false) {
  seconds = Number(seconds) || 0;
  if (seconds <= 0) return '';
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (compact) return `${hours}h${minutes ? ` ${minutes}m` : ''}`;
  return `${hours} hr${hours === 1 ? '' : 's'}${minutes ? ` ${minutes} min` : ''}`;
}

function venueLocalTime(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  const day = parts.weekday.toLowerCase().slice(0, 3);
  return { day, dayIndex: VENUE_DAYS.indexOf(day), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function validIntervals(hours, day) {
  return Array.isArray(hours?.[day])
    ? hours[day].map(interval => ({ start: clockMinutes(interval?.[0]), end: clockMinutes(interval?.[1]) }))
      .filter(interval => interval.start !== null && interval.end !== null && interval.start !== interval.end)
    : [];
}

function openingWindowAt(hours, local) {
  const today = validIntervals(hours, local.day);
  for (const interval of today) {
    if (interval.end > interval.start && local.minutes >= interval.start && local.minutes < interval.end) {
      return { open: true, closesIn: interval.end - local.minutes, closesAt: interval.end };
    }
    if (interval.end < interval.start && local.minutes >= interval.start) {
      return { open: true, closesIn: 1440 - local.minutes + interval.end, closesAt: interval.end };
    }
  }
  const previousDay = VENUE_DAYS[(local.dayIndex + 6) % 7];
  for (const interval of validIntervals(hours, previousDay)) {
    if (interval.end < interval.start && local.minutes < interval.end) {
      return { open: true, closesIn: interval.end - local.minutes, closesAt: interval.end };
    }
  }
  const nextToday = today
    .filter(interval => interval.start > local.minutes)
    .sort((a, b) => a.start - b.start)[0];
  return { open: false, opensAt: nextToday?.start ?? null };
}

const VENUE_DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

function dayHoursLabel(hours, day) {
  const intervals = validIntervals(hours, day);
  if (!intervals.length) return 'Closed';
  return intervals.map(interval => {
    const start = `${Math.floor(interval.start / 60)}:${String(interval.start % 60).padStart(2, '0')}`;
    const end = interval.end === 1440 ? '24:00' : `${Math.floor(interval.end / 60)}:${String(interval.end % 60).padStart(2, '0')}`;
    return `${formatClock(start)}–${interval.end === 1440 ? end : formatClock(end)}${interval.end < interval.start ? ' next day' : ''}`;
  }).join(', ');
}

function weeklyHoursHtml(hours) {
  return ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    .map(day => `<div><span>${VENUE_DAY_NAMES[day]}</span><b>${esc(dayHoursLabel(hours, day))}</b></div>`)
    .join('');
}

function venueTiming(pack, state, now = new Date(), position = userPos) {
  const venue = pack.final_venue;
  const finalStop = pack.stops[pack.stops.length - 1];
  const continuing = Number(state.stop) > 0 && !state.completed;
  const remainingStops = continuing ? Math.max(1, pack.stops.length - Number(state.stop)) : pack.stops.length;
  const journeyMinutes = Math.max(1, Math.ceil(Number(pack.estimated_minutes || 60) * remainingStops / Math.max(1, pack.stops.length)));
  const routePoint = pack.stops[continuing ? Math.min(Number(state.stop), pack.stops.length - 1) : 0];
  const routePointLabel = continuing ? 'next stop' : 'route start';
  const metresFromRoute = position && routePoint
    ? distance(position, [Number(routePoint.Target_Lat), Number(routePoint.Target_Long)]) * 1000
    : null;
  const nearRoute = metresFromRoute !== null && metresFromRoute <= 500;
  const timeZone = venue?.timezone || 'Europe/London';
  const base = { venue, finalStop, journeyMinutes, routePointLabel, metresFromRoute, nearRoute };
  if (!venue?.hours || !Object.keys(venue.hours).length) return { ...base, status: 'unknown', todayHours: 'Not available' };

  const localNow = venueLocalTime(now, timeZone);
  const currentWindow = openingWindowAt(venue.hours, localNow);
  const finishTime = new Date(now.getTime() + journeyMinutes * 60000);
  const finishWindow = openingWindowAt(venue.hours, venueLocalTime(finishTime, timeZone));
  const minimumVisit = Math.max(0, Number(venue.minimum_visit_minutes) || 30);
  const currentOpen = currentWindow.open;
  const todayHours = dayHoursLabel(venue.hours, localNow.day);
  const timing = { ...base, currentOpen, currentWindow, finishWindow, minimumVisit, todayHours };

  if (metresFromRoute === null) return { ...timing, status: currentOpen ? 'location-needed-open' : 'location-needed-closed' };
  if (!nearRoute) return { ...timing, status: 'far-from-route' };
  if (finishWindow.open && finishWindow.closesIn < minimumVisit) return { ...timing, status: 'closing-soon' };
  if (finishWindow.open) return { ...timing, status: currentOpen ? 'open-through-walk' : 'opens-during-walk' };
  return { ...timing, status: currentOpen ? 'closes-during-walk' : 'closed-through-walk' };
}

function venueTimingCard(pack, state) {
  const timing = venueTiming(pack, state);
  const venueName = timing.venue?.name || timing.finalStop?.Stop_Name || 'Final venue';
  const walkLabel = `${formatMinutes(timing.journeyMinutes)} ${Number(state.stop) > 0 && !state.completed ? 'remaining' : 'route'}`;
  let label = 'CHECK BEFORE YOU SET OFF';
  let title = `Check ${venueName} before leaving`;
  let message = 'Published opening hours have not been added for this venue yet.';
  let tone = 'unknown';
  let gentleMessage = 'Opening information is available if you want to check the finish before setting off.';
  let availabilityHint = 'Optional opening-hours check';

  if (timing.status === 'location-needed-open') {
    label = 'OPEN RIGHT NOW';
    title = `${venueName} is currently open`;
    message = `Check your location so Day Tripping Quiz can confirm you are close enough to the route to use its ${walkLabel} safely.`;
    tone = 'good';
    gentleMessage = 'The finishing stop is open right now. Check your location for a more useful walk-time check without revealing its identity.';
  } else if (timing.status === 'location-needed-closed') {
    label = 'CLOSED RIGHT NOW';
    title = `${venueName} is currently closed`;
    message = `Check your location to see whether it is due to open during the ${walkLabel}.`;
    tone = 'warning';
    gentleMessage = 'Your finishing stop is not open right now, although it may open during the walk.';
    availabilityHint = 'Opening hours may affect this route';
  } else if (timing.status === 'far-from-route') {
    label = timing.currentOpen ? 'OPEN RIGHT NOW · TRAVEL TIME UNKNOWN' : 'CLOSED RIGHT NOW · TRAVEL TIME UNKNOWN';
    title = `You are ${formatDistance(timing.metresFromRoute)} from the ${timing.routePointLabel}`;
    message = `Day Tripping Quiz will not guess how long your journey there might take, so it cannot say whether ${venueName} will be open when you finish. Check again when you reach the ${timing.routePointLabel}.`;
    tone = 'warning';
    gentleMessage = `You are not close enough to the ${timing.routePointLabel} for a responsible finish check. Day Tripping Quiz will not guess your travel time.`;
    availabilityHint = 'Travel time prevents a reliable check';
  } else if (timing.status === 'open-through-walk') {
    label = 'OPEN NOW · FINISH LOOKS GOOD';
    title = `${venueName} should still be open after the walk`;
    message = `You are close to the ${timing.routePointLabel}, and its published hours cover the full ${walkLabel}.`;
    tone = 'good';
    gentleMessage = 'The finishing stop should be open after the walk. You can leave the surprise hidden.';
  } else if (timing.status === 'opens-during-walk') {
    label = 'CLOSED NOW · OPEN BY THE FINISH';
    title = `${venueName} is due to open during the walk`;
    message = `You are close to the ${timing.routePointLabel}, and its published hours show it should be open by the end of the ${walkLabel}.`;
    tone = 'good';
    gentleMessage = 'The finishing stop is closed right now, but should open during the walk.';
    availabilityHint = 'Currently closed, but likely open later';
  } else if (timing.status === 'closing-soon') {
    label = 'YOU MAY BE CUTTING IT FINE';
    title = `${venueName} may close soon after the walk`;
    message = `It is listed as open at the end of the ${walkLabel}, but for less than ${formatMinutes(timing.minimumVisit)} afterwards.`;
    tone = 'warning';
    gentleMessage = 'The finishing stop may close shortly after the walk. Consider checking the spoiler details before starting.';
    availabilityHint = 'The finish may be cutting it fine';
  } else if (timing.status === 'closes-during-walk') {
    label = 'OPEN NOW · CLOSED BY THE FINISH';
    title = `${venueName} is due to close during the walk`;
    message = `You are close to the ${timing.routePointLabel}, but its published hours do not cover the full ${walkLabel}.`;
    tone = 'danger';
    gentleMessage = 'Your finishing stop may close before you complete the walk. Exact details are hidden below.';
    availabilityHint = 'The finishing stop may be closed';
  } else if (timing.status === 'closed-through-walk') {
    label = 'CLOSED NOW · NOT OPEN BY THE FINISH';
    title = `${venueName} is not due to open during the walk`;
    message = `You are close to the ${timing.routePointLabel}, but its published hours do not show it open by the end of the ${walkLabel}.`;
    tone = 'danger';
    gentleMessage = 'Your finishing stop is not expected to be open by the end of the walk. Exact details are hidden below.';
    availabilityHint = 'The finishing stop may be closed';
  }

  const verified = timing.venue?.hours_verified
    ? `Hours checked ${new Date(`${timing.venue.hours_verified}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`
    : 'Published hours can change.';
  const source = timing.venue?.hours_url
    ? `<a href="${esc(timing.venue.hours_url)}" target="_blank" rel="noopener">Check the latest hours ↗</a>`
    : '';
  const hours = timing.venue?.hours
    ? `<div class="venue-hours-today"><span>Today's published hours</span><b>${esc(timing.todayHours)}</b></div><details class="venue-hours"><summary>View weekly opening times</summary><div>${weeklyHoursHtml(timing.venue.hours)}</div></details>`
    : '';
  const locationButton = navigator.geolocation
    ? `<button id="checkVenueLocation" class="venue-location-btn secondary">${userPos ? 'Recheck my location' : 'Check my location for a safer result'}</button>`
    : '';
  const exactDetails = `<div id="venueSpoilerDetails" class="venue-spoiler-details ${venueDetailsRevealed ? 'revealed' : 'blurred'} ${tone}" aria-hidden="${venueDetailsRevealed ? 'false' : 'true'}" ${venueDetailsRevealed ? '' : 'inert'}><span class="venue-kicker">${label}</span><h3>${esc(title)}</h3><p>${esc(message)}</p>${hours}<small>${esc(verified)} ${source}</small></div>`;
  const spoilerShield = venueDetailsRevealed ? '' : `<div class="venue-spoiler-shield"><span>⚠ FINAL-STOP SPOILER</span><b>The details below name your finishing venue.</b><p>Only reveal them if the opening-hours warning matters more than keeping the last clue a surprise.</p><button id="revealVenueDetails" class="secondary">Reveal final venue details</button></div>`;
  return `<section id="venueTimingCard" class="venue-disclosure ${venueHoursExpanded ? 'expanded' : ''}"><button id="venueTimingToggle" class="venue-disclosure-toggle" aria-expanded="${venueHoursExpanded}" aria-controls="venueTimingPanel"><span class="venue-disclosure-icon">◷</span><span class="venue-disclosure-label"><b>Finish availability</b><small>${esc(availabilityHint)}</small></span><span class="venue-disclosure-arrow">⌄</span></button><div id="venueTimingPanel" class="venue-disclosure-panel ${venueHoursExpanded ? '' : 'hidden'}"><div class="venue-gentle-warning"><span>WITHOUT SPOILERS</span><p>${esc(gentleMessage)}</p></div>${locationButton}<div class="venue-spoiler-wrap">${exactDetails}${spoilerShield}</div></div></section>`;
}

function bindVenueDisclosure(pack, state, isDaily, isSurprise = false) {
  const toggle = $('#venueTimingToggle');
  const panel = $('#venueTimingPanel');
  const card = $('#venueTimingCard');
  if (toggle && panel && card) {
    toggle.onclick = () => {
      venueHoursExpanded = !venueHoursExpanded;
      toggle.setAttribute('aria-expanded', String(venueHoursExpanded));
      panel.classList.toggle('hidden', !venueHoursExpanded);
      card.classList.toggle('expanded', venueHoursExpanded);
    };
  }
  const reveal = $('#revealVenueDetails');
  if (reveal) {
    let resetReveal = null;
    reveal.onclick = () => {
      if (reveal.dataset.confirming === 'true') {
        if (resetReveal) clearTimeout(resetReveal);
        venueDetailsRevealed = true;
        const currentCard = $('#venueTimingCard');
        if (currentCard) currentCard.outerHTML = venueTimingCard(pack, state);
        bindVenueDisclosure(pack, state, isDaily, isSurprise);
        return;
      }
      reveal.dataset.confirming = 'true';
      reveal.classList.add('confirming');
      reveal.textContent = 'Reveal anyway — show the final venue';
      resetReveal = setTimeout(() => {
        reveal.dataset.confirming = 'false';
        reveal.classList.remove('confirming');
        reveal.textContent = 'Reveal final venue details';
      }, 10000);
    };
  }
  if ($('#checkVenueLocation')) $('#checkVenueLocation').onclick = () => checkVenueLocation(pack, isDaily, isSurprise);
}

function scrollToSearchResults(behavior = 'smooth') {
  const target = $('.browse-results-head') || $('#browseGrid');
  if (!target) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reducedMotion ? 'auto' : behavior, block: 'start' });
}

function closeSearch() {
  $('#searchWrap').classList.add('hidden');
  $('#searchToggle').setAttribute('aria-expanded', 'false');
}

function openSearch() {
  if ($('#homeView').classList.contains('hidden')) showHome();
  $('#searchWrap').classList.remove('hidden');
  $('#searchToggle').setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => {
    try {
      $('#searchInput').focus({ preventScroll: true });
    } catch {
      $('#searchInput').focus();
    }
    scrollToSearchResults();
  });
}

function bind() {
  bindNavigationButtons();
  $('#acceptSafety').onclick = () => {
    localStorage.setItem(SAFETY_KEY, 'yes');
    $('#safetyModal').classList.add('hidden');
    maybeShowTutorial();
  };
  $('#keepSearching').onclick = closeArrival;
  $('#confirmArrival').onclick = () => {
    if (!pendingArrival) return;
    const { stop, debug } = pendingArrival;
    closeArrival();
    completeStop(stop, false, debug);
  };
  $('#mapOpen').onclick = showMap;
  $('#mapFeature').onclick = showMap;
  $('#passportOpen').onclick = showPassport;
  $('#sharePassport').onclick = openPassportPoster;
  $('#surpriseHero').onclick = surprise;
  $('#settingsOpen').onclick = openSettings;
  $('#settingsClose').onclick = closeSettings;
  $('#settingsBackdrop').onclick = event => { if (event.target.id === 'settingsBackdrop') closeSettings(); };
  $('#soundSetting').onclick = () => setFeedbackSetting('sound', !profile.sound);
  $('#vibrationSetting').onclick = () => setFeedbackSetting('vibration', !profile.vibration);
  $('#replayTutorial').onclick = () => { closeSettings(); openTutorial(0); };
  $('#exportProgress').onclick = exportProgress;
  $('#importProgress').onchange = async event => {
    const input = event.currentTarget;
    await importProgressFile(input.files?.[0]);
    input.value = '';
  };
  $('#resetProgress').onclick = resetAllProgress;
  $$('[data-settings-unit]').forEach(button => button.onclick = () => setUnit(button.dataset.settingsUnit));
  $('#tutorialClose').onclick = () => closeTutorial(true);
  $('#tutorialBack').onclick = () => openTutorial(Math.max(0, tutorialStep - 1));
  $('#tutorialNext').onclick = () => tutorialStep >= TUTORIAL_STEPS.length - 1 ? closeTutorial(true) : openTutorial(tutorialStep + 1);
  $('#locateBtn').onclick = getNearby;
  $('#searchToggle').onclick = () => $('#searchWrap').classList.contains('hidden') ? openSearch() : closeSearch();
  $('#searchClose').onclick = closeSearch;
  $('#searchInput').oninput = event => renderBrowse(event.target.value);
  $('#searchInput').onkeydown = event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.currentTarget.blur();
    scrollToSearchResults();
  };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('#postcardModal').classList.contains('hidden')) closePostcardEditor();
  });
  if (!readStoredValue(SAFETY_KEY, LEGACY_SAFETY_KEY)) $('#safetyModal').classList.remove('hidden');
  else maybeShowTutorial();
  renderSettings();
}

function playPageTransition() {
  const overlay = $('#brandTransition');
  if (!overlay || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  overlay.style.setProperty('--transition-accent', currentPack ? colour(currentPack) : '#ffb21f');
  const cycle = ++pageTransitionCycle;
  pageTransitionTimers.forEach(timer => clearTimeout(timer));
  pageTransitionTimers = [];
  overlay.classList.remove('hidden', 'active', 'leaving');
  void overlay.offsetWidth;
  overlay.classList.add('active');
  pageTransitionTimers.push(setTimeout(() => {
    if (cycle === pageTransitionCycle) overlay.classList.add('leaving');
  }, 800));
  pageTransitionTimers.push(setTimeout(() => {
    if (cycle !== pageTransitionCycle) return;
    overlay.classList.add('hidden');
    overlay.classList.remove('active', 'leaving');
  }, 1000));
}

function showOnly(id) {
  const views = ['homeView', 'passportView', 'mapView', 'collectionView', 'detailView', 'gameView'];
  const currentView = views.find(view => !$(`#${view}`).classList.contains('hidden'));
  if (navigationTransitionsReady && currentView && currentView !== id) playPageTransition();
  views.forEach(view => $(`#${view}`).classList.toggle('hidden', view !== id));
  scrollTo(0, 0);
  const state = rememberView(id, false);
  if (navigationHistoryMode === 'none') return;
  const nextState = navigationState(state);
  const shouldReplace = navigationHistoryMode === 'replace'
    || !history.state?.dayTrippingHistory
    || historyTarget(history.state) === historyTarget(nextState);
  if (shouldReplace) history.replaceState(nextState, '');
  else history.pushState(nextState, '');
}

function showPassport() {
  stopWatch();
  destroyCompletionMap();
  closeArrival();
  currentCollection = null;
  pendingDiscovery = null;
  currentPack = null;
  applyRouteTheme(null);
  renderExplorerRecord();
  showOnly('passportView');
}

function showHome() {
  stopWatch();
  closePostcardEditor();
  clearAdventurePhotos();
  destroyCompletionMap();
  debugMode = false;
  debugStop = null;
  stuckTapTimes = [];
  if (stuckTapTimer) clearTimeout(stuckTapTimer);
  stuckTapTimer = null;
  closeArrival();
  renderExplorerRecord();
  restoreContinue();
  currentCollection = null;
  pendingDiscovery = null;
  currentPack = null;
  selectedAsDaily = false;
  selectedAsSurprise = false;
  selectedDailyDate = null;
  applyRouteTheme(null);
  showOnly('homeView');
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(progress));
  restoreContinue();
  renderExplorerRecord();
}

function packProgress(pack) {
  return progress[pack.pack_id] || {};
}

function isActiveAdventure(pack) {
  const state = packProgress(pack);
  return !state.completed && (state.active === true || Number(state.stop) > 0);
}

function endAdventure(pack, isDaily) {
  const state = packProgress(pack);
  const keepHistory = state.everCompleted || Number(state.completions) > 0;
  if (keepHistory) {
    progress[pack.pack_id] = {
      active: false,
      stop: pack.stops.length,
      completed: true,
      everCompleted: true,
      score: 0,
      baseScore: 0,
      bestScore: Math.max(Number(state.bestScore) || 0, Number(state.score) || 0),
      bestBaseScore: Math.max(Number(state.bestBaseScore) || 0, Number(state.baseScore) || 0),
      perfectStops: Number(state.perfectStops) || 0,
      perfectCompletions: Number(state.perfectCompletions) || 0,
      curiosityFinds: Number(state.curiosityFinds) || 0,
      photoFinds: Number(state.photoFinds) || 0,
      noteFinds: Number(state.noteFinds) || 0,
      elapsedSeconds: Number(state.lastElapsedSeconds) || Number(state.elapsedSeconds) || 0,
      lastElapsedSeconds: Number(state.lastElapsedSeconds) || Number(state.elapsedSeconds) || 0,
      bestElapsedSeconds: Number(state.bestElapsedSeconds) || Number(state.elapsedSeconds) || 0,
      skipped: 0,
      hintsUsed: 0,
      completions: Number(state.completions) || 1,
      scoreVersion: SCORE_VERSION
    };
  } else {
    delete progress[pack.pack_id];
  }
  save();
  openDetail(pack, isDaily);
  toast('Adventure ended. Current progress deleted.');
}

function bindEndAdventure(pack, isDaily) {
  const button = $('#endRoute');
  if (!button) return;
  let resetConfirmation = null;
  button.onclick = () => {
    if (button.dataset.confirming === 'true') {
      if (resetConfirmation) clearTimeout(resetConfirmation);
      endAdventure(pack, isDaily);
      return;
    }
    button.dataset.confirming = 'true';
    button.classList.add('confirming');
    button.textContent = 'Tap again to delete progress';
    resetConfirmation = setTimeout(() => {
      button.dataset.confirming = 'false';
      button.classList.remove('confirming');
      button.textContent = 'End adventure';
    }, 10000);
  };
}

function hasCompleted(pack) {
  const state = packProgress(pack);
  return Boolean(state.completed || state.everCompleted);
}

function displayScore(pack) {
  const state = packProgress(pack);
  return Math.max(Number(state.score) || 0, Number(state.bestScore) || 0);
}

function discoveryCount(pack) {
  return hasCompleted(pack) ? pack.stops.length : Math.min(Number(packProgress(pack).stop) || 0, pack.stops.length);
}

function timeCategory(minutes) {
  if (minutes <= 45) return ['☕', 'Quick escape'];
  if (minutes <= 100) return ['🥾', 'One-hour adventure'];
  if (minutes <= 210) return ['🌤', 'Half day'];
  return ['🌄', 'Full day'];
}

function colour(pack) {
  return ({ cathedral: '#a993ff', fenland: '#61e7ff', river: '#5bd7bb', bridge: '#ffb454', meadow: '#c8ff5a' })[pack.cover_theme] || '#a993ff';
}

function completed(pack) {
  if (hasCompleted(pack)) return 100;
  return Math.round(((Number(packProgress(pack).stop) || 0) / pack.stops.length) * 100);
}

function routeCard(pack, extra = '') {
  const [icon, label] = timeCategory(pack.estimated_minutes);
  const nearby = userPos
    ? `${distance(userPos, [pack.centre.lat, pack.centre.long]).toFixed(1)} km away`
    : `${pack.route_distance_km} km walk`;
  const score = displayScore(pack);
  return `<article class="route-card" style="--accent:${colour(pack)}" data-pack="${esc(pack.pack_id)}">
    <span class="eyebrow route-location">${esc(extra ? `${extra} · ${pack.display_name}` : pack.display_name)}</span>
    <h3>${esc(pack.route_name)}</h3>
    <p>${esc(pack.short_description || pack.description)}</p>
    <div class="card-bottom">
      <div class="meta-row"><span class="meta">${icon} ${label}</span><span class="meta">${esc(nearby)}</span><span class="meta">${esc(pack.difficulty_label)}</span>${score ? `<span class="meta score-chip">✦ ${formatPoints(score)} pts</span>` : ''}</div>
      ${completed(pack) ? `<div class="completion-bar" aria-label="${completed(pack)}% complete"><i style="width:${completed(pack)}%"></i></div>` : ''}
    </div>
  </article>`;
}

function wireCards() {
  $$('[data-pack]').forEach(element => {
    element.onclick = () => openDetail(
      packs.find(pack => pack.pack_id === element.dataset.pack),
      element.dataset.daily === 'true'
    );
  });
}

function daily() {
  const eligible = packs.filter(pack => pack.daily_eligible !== false);
  const available = eligible.length ? eligible : packs;
  const pool = userPos
    ? [...available]
      .sort((a, b) => distance(userPos, [a.centre.lat, a.centre.long]) - distance(userPos, [b.centre.lat, b.centre.long]))
      .slice(0, Math.min(6, available.length))
    : available;
  const date = new Date();
  const seed = Number(`${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}`);
  return pool[seed % pool.length];
}

function renderDaily() {
  const pick = daily();
  const streak = dailyStreak();
  const streakLabel = streak.current
    ? `🔥 ${streak.current}-day streak${streak.best > streak.current ? ` · Best ${streak.best}` : ''}`
    : streak.best ? `🔥 Best streak: ${streak.best} days · Play today to begin again` : '🔥 Complete today’s pick to start a streak';
  $('#mapPackCount').textContent = `${packs.length} adventures mapped`;
  $('#dailyDate').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  $('#dailyCard').innerHTML = `<div class="daily-card" data-pack="${esc(pick.pack_id)}" data-daily="true"><div><span class="eyebrow">DAILY DOUBLE · ×2 POINTS</span><h3>${esc(pick.display_name)}<br>${esc(pick.route_name)}</h3><p>${esc(pick.short_description)}</p><div class="meta-row"><span class="meta">${pick.route_distance_km} km</span><span class="meta">${pick.estimated_minutes} mins</span><span class="meta">${esc(pick.difficulty_label)}</span></div><span class="daily-streak">${esc(streakLabel)}</span></div><span class="daily-badge">Double it →</span></div>`;
  wireCards();
}

function renderAll() {
  renderDaily();
  renderExplorerRecord();
  renderFeatured();
  renderNearby();
  renderCollections();
  renderFilters();
  renderBrowse();
  wireCards();
}

function renderFeatured() {
  const featured = packs.filter(pack => pack.featured);
  $('#featuredSection').classList.toggle('hidden', !featured.length);
  $('#featuredGrid').innerHTML = featured.slice(0, 2).map(pack => routeCard(pack, 'FEATURED')).join('');
  $('#featuredMoreGrid').innerHTML = featured.slice(2).map(pack => routeCard(pack, 'FEATURED')).join('');
  configureDisclosure('featuredToggle', 'featuredMore', featuredExpanded, Math.max(0, featured.length - 2), 'adventures', () => {
    featuredExpanded = !featuredExpanded;
    renderFeatured();
  });
  wireCards();
}

function configureDisclosure(toggleId, panelId, expanded, hiddenCount, noun, action) {
  const toggle = $(`#${toggleId}`);
  const panel = $(`#${panelId}`);
  if (!toggle || !panel) return;
  panel.classList.toggle('hidden', !expanded || hiddenCount === 0);
  toggle.classList.toggle('hidden', hiddenCount === 0);
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.innerHTML = expanded
    ? `<span>Show less</span><b>↑</b>`
    : `<span>View more <small>${hiddenCount} ${esc(noun)}</small></span><b>↓</b>`;
  toggle.onclick = action;
}

function achievements() {
  const routePoints = packs.reduce((total, pack) => total + displayScore(pack), 0);
  const completedRoutes = packs.filter(hasCompleted).length;
  const routeCompletions = packs.reduce((total, pack) => total + (Number(packProgress(pack).completions) || 0), 0);
  const perfectStops = packs.reduce((total, pack) => total + (Number(packProgress(pack).perfectStops) || 0), 0);
  const perfectRoutes = packs.reduce((total, pack) => total + (Number(packProgress(pack).perfectCompletions) || 0), 0);
  const curiosityFinds = packs.reduce((total, pack) => total + (Number(packProgress(pack).curiosityFinds) || 0), 0);
  const dailyCompletions = profile.dailyDates.length;
  const completedPacks = packs.filter(hasCompleted);
  const towns = new Set(completedPacks.map(pack => pack.town));
  const collections = new Set(completedPacks.flatMap(pack => pack.collections));
  return [
    { id: 'first-find', icon: '✦', name: 'First Points', description: 'Earn points from your first landmark.', points: 500, tier: 'bronze', unlocked: routePoints > 0 },
    { id: 'sharp-eyes', icon: '◇', name: 'Sharp Eyes', description: 'Find a stop without using a hint.', points: 500, tier: 'bronze', unlocked: perfectStops >= 1 },
    { id: 'trailblazer', icon: '⚑', name: 'Trailblazer', description: 'Complete your first route.', points: 1500, tier: 'silver', unlocked: completedRoutes >= 1 },
    { id: 'curious-mind', icon: '◎', name: 'Curious Mind', description: 'Complete ten photo or field-note discoveries.', points: 1500, tier: 'silver', unlocked: curiosityFinds >= 10 },
    { id: 'daily-detective', icon: '☀', name: 'Daily Detective', description: 'Complete a Daily Double adventure.', points: 1500, tier: 'silver', unlocked: dailyCompletions >= 1 },
    { id: 'daily-regular', icon: '▦', name: 'Daily Regular', description: 'Complete three Daily Double adventures.', points: 3000, tier: 'gold', unlocked: dailyCompletions >= 3 },
    { id: 'daily-legend', icon: '✺', name: 'Daily Legend', description: 'Complete seven Daily Double adventures.', points: 5000, tier: 'legendary', unlocked: dailyCompletions >= 7 },
    { id: 'lucky-dip', icon: '⚄', name: 'Lucky Dip', description: 'Complete an adventure chosen by Surprise Me.', points: 1500, tier: 'silver', unlocked: profile.surpriseCompletions >= 1 },
    { id: 'route-regular', icon: '⌖', name: 'Route Regular', description: 'Complete three routes, including replays.', points: 1500, tier: 'silver', unlocked: routeCompletions >= 3 },
    { id: 'seasoned-explorer', icon: '♜', name: 'Seasoned Explorer', description: 'Complete ten routes, including replays.', points: 5000, tier: 'legendary', unlocked: routeCompletions >= 10 },
    { id: 'town-collector', icon: '▣', name: 'Town Collector', description: 'Complete adventures in five different towns.', points: 3000, tier: 'gold', unlocked: towns.size >= 5 },
    { id: 'grand-tourer', icon: '✥', name: 'Grand Tourer', description: 'Complete adventures in ten different towns.', points: 5000, tier: 'legendary', unlocked: towns.size >= 10 },
    { id: 'theme-hunter', icon: '◈', name: 'Theme Hunter', description: 'Complete an adventure from every collection.', points: 3000, tier: 'gold', unlocked: collections.size >= 5 },
    { id: 'long-way-round', icon: '↗', name: 'The Long Way Round', description: 'Complete an adventure lasting 100 minutes or more.', points: 1500, tier: 'silver', unlocked: completedPacks.some(pack => Number(pack.estimated_minutes) >= 100) },
    { id: 'flawless-route', icon: '★', name: 'Flawless Route', description: 'Finish a route with no hints or skips.', points: 3000, tier: 'gold', unlocked: perfectRoutes >= 1 }
  ];
}

function achievementPointsTotal(badges = achievements()) {
  return badges.filter(badge => badge.unlocked).reduce((total, badge) => total + Number(badge.points || 0), 0);
}

function explorerPointsTotal(badges = achievements()) {
  return packs.reduce((total, pack) => total + displayScore(pack), 0) + achievementPointsTotal(badges);
}

function renderExplorerRecord() {
  if (!packs.length || !$('#explorerStats')) return;
  const discoveries = packs.reduce((total, pack) => total + discoveryCount(pack), 0);
  const completedRoutes = packs.filter(hasCompleted).length;
  const badges = achievements();
  const points = explorerPointsTotal(badges);
  $('#explorerStats').innerHTML = `
    <div><span>Explorer points</span><b>${formatPoints(points)}</b></div>
    <div><span>Discoveries</span><b>${discoveries}</b></div>
    <div><span>Routes completed</span><b>${completedRoutes}</b></div>
    <div><span>Achievements earned</span><b>${badges.filter(badge => badge.unlocked).length}</b></div>`;
  const unlocked = badges.filter(badge => badge.unlocked);
  const datedScore = badge => {
    const savedDate = Date.parse(profile.achievementDates[badge.id] || '');
    return Number.isFinite(savedDate) ? savedDate : badges.indexOf(badge) + 1;
  };
  const spotlight = unlocked.length
    ? [...unlocked].sort((a, b) => datedScore(b) - datedScore(a))[0]
    : badges[0];
  const rest = badges.filter(badge => badge.id !== spotlight.id);
  $('#achievementSpotlight').innerHTML = `<div class="achievement-spotlight ${spotlight.unlocked ? 'earned' : 'next'}"><span class="eyebrow">${spotlight.unlocked ? 'MOST RECENT ACHIEVEMENT' : 'NEXT ACHIEVEMENT'}</span>${achievementCard(spotlight)}</div>`;
  $('#achievementGrid').innerHTML = rest.map(achievementCard).join('');
  configureDisclosure('achievementToggle', 'achievementMore', achievementsExpanded, rest.length, 'achievements', () => {
    achievementsExpanded = !achievementsExpanded;
    renderExplorerRecord();
  });
  renderPassport();
}

function achievementCard(badge) {
  return `<div class="achievement ${badge.unlocked ? 'unlocked' : 'locked'} ${esc(badge.tier || 'bronze')}"><span class="achievement-icon">${badge.icon}</span><div><b>${esc(badge.name)}</b><small>${esc(badge.description)}</small><em>+${formatPoints(badge.points)} Explorer Points</em></div></div>`;
}

function passportStamp(pack) {
  const state = packProgress(pack);
  const initials = String(pack.display_name || pack.town || '?')
    .split(/[\s-]+/).map(word => word[0]).join('').slice(0, 3).toUpperCase();
  const completedDate = Number(state.completedAt)
    ? new Date(Number(state.completedAt)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Adventure complete';
  return `<article class="passport-stamp" style="--stamp:${colour(pack)}"><div class="passport-seal"><b>${esc(initials)}</b><span>EXPLORED</span></div><div><span>${esc(pack.display_name)}</span><b>${esc(pack.route_name)}</b><small>${esc(completedDate)} · ${formatPoints(displayScore(pack))} pts</small><em>${esc(pack.collections[0] || 'Local discovery')}</em></div></article>`;
}

function renderPassport() {
  if (!packs.length || !$('#passportGrid')) return;
  const completedPacks = packs.filter(hasCompleted)
    .sort((a, b) => Number(packProgress(b).completedAt) - Number(packProgress(a).completedAt));
  const towns = new Set(completedPacks.map(pack => pack.town));
  const allCollections = [...new Set(packs.flatMap(pack => pack.collections))];
  const badges = achievements();
  const recentPack = completedPacks[0];
  const nextPacks = packs.filter(pack => !hasCompleted(pack)).slice(0, 3);
  if ($('#passportHero')) $('#passportHero').innerHTML = `<div class="passport-title-card"><span>YOUR ADVENTURE HIGHLIGHTS</span><h1>${recentPack ? `${esc(recentPack.display_name)} looks good on you.` : 'Your story starts out there.'}</h1><p>${recentPack ? 'A bright, growing record of the routes you finished, the details you noticed and the places you made your own.' : 'Choose an adventure, follow your curiosity and build a collection worth showing off.'}</p></div><div class="passport-hero-stickers" aria-label="Explorer highlights"><span class="sticker-points">✦ ${formatPoints(explorerPointsTotal(badges))}<small>EXPLORER POINTS</small></span><span class="sticker-towns">${towns.size}<small>TOWNS</small></span><span class="sticker-badges">${badges.filter(badge => badge.unlocked).length}<small>BADGES</small></span></div><div class="passport-scribble" aria-hidden="true">GO SOMEWHERE · NOTICE EVERYTHING · ✦</div>`;
  $('#passportCount').textContent = `${towns.size} ${towns.size === 1 ? 'town' : 'towns'} explored`;
  $('#passportSummary').innerHTML = allCollections.map((collection, index) => {
    const total = packs.filter(pack => pack.collections.includes(collection)).length;
    const found = completedPacks.filter(pack => pack.collections.includes(collection)).length;
    return `<div class="collection-patch ${found ? 'started' : ''} ${found === total ? 'complete' : ''}"><span>${['♜', '≈', '✎', '⚙', '◇'][index % 5]}</span><div><b>${esc(collection)}</b><small>${found}/${total} explored</small></div></div>`;
  }).join('');
  const completedHtml = completedPacks.length
    ? completedPacks.map(passportStamp).join('')
    : '<div class="passport-empty"><span>◎</span><div><b>Your first highlight is waiting.</b><p>Complete an adventure and this space starts becoming unmistakably yours.</p></div></div>';
  const nextHtml = nextPacks.length ? `<div class="passport-next-label"><span>WHAT'S NEXT?</span><b>Your next story starts here</b></div>${nextPacks.map(pack => `<button class="passport-next" data-pack="${esc(pack.pack_id)}" style="--stamp:${colour(pack)}"><span>↗</span><div><b>${esc(pack.display_name)}</b><small>${esc(pack.route_name)} · ${pack.estimated_minutes} min</small></div></button>`).join('')}` : '';
  $('#passportGrid').innerHTML = completedHtml + nextHtml;
  wireCards();
}

function renderNearby() {
  const list = [...packs];
  if (userPos) list.sort((a, b) => distance(userPos, [a.centre.lat, a.centre.long]) - distance(userPos, [b.centre.lat, b.centre.long]));
  const nearby = list.slice(0, Math.min(6, list.length));
  const label = userPos ? 'NEAR YOU' : 'RECOMMENDED';
  $('#nearbyGrid').innerHTML = nearby.slice(0, 2).map(pack => routeCard(pack, label)).join('');
  $('#nearbyMoreGrid').innerHTML = nearby.slice(2).map(pack => routeCard(pack, label)).join('');
  configureDisclosure('nearbyToggle', 'nearbyMore', nearbyExpanded, Math.max(0, nearby.length - 2), 'adventures', () => {
    nearbyExpanded = !nearbyExpanded;
    renderNearby();
  });
  wireCards();
}

function renderCollections() {
  const names = [...new Set(packs.flatMap(pack => pack.collections))];
  const colours = [['#7559d9', '#2d2452'], ['#197f91', '#173a4d'], ['#a0652f', '#422b23'], ['#497d4e', '#1e3b2b']];
  $('#collectionGrid').innerHTML = names.map((name, index) => `<button class="collection-card" data-collection="${esc(name)}" style="--c1:${colours[index % 4][0]};--c2:${colours[index % 4][1]}"><span>${esc(name)}</span><small>${packs.filter(pack => pack.collections.includes(name)).length} adventures →</small></button>`).join('');
  $$('[data-collection]').forEach(button => button.onclick = () => openCollection(button.dataset.collection));
}

let timeFilter = 'all';
let distFilter = 'all';
let difficultyFilter = 'all';
let sortFilter = 'recommended';

function renderFilters() {
  const options = (items, selected) => items.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
  const times = [['all', 'Any duration'], ['quick', 'Up to 45 minutes'], ['hour', '45–100 minutes'], ['half', 'Half day'], ['full', 'Full day']];
  const distances = [['all', 'Any distance'], ['short', 'Under 3 km'], ['medium', '3–6 km'], ['long', '6 km+']];
  const difficulties = [['all', 'Any difficulty'], ['relaxed', 'Relaxed'], ['explorer', 'Explorer'], ['detective', 'Detective'], ['challenging', 'Challenging']];
  const sorts = [['recommended', 'Recommended'], ['az', 'Town A–Z'], ['quickest', 'Quickest first'], ['shortest', 'Shortest walk'], ['longest', 'Longest walk'], ['nearest', 'Nearest to me']];
  $('#filterPanel').innerHTML = `
    <div class="filter-intro"><span class="filter-intro-icon">⌁</span><div><b>Shape your day</b><small>Filter and reorder every adventure.</small></div></div>
    <label class="filter-field"><span>Time available</span><select id="timeFilterSelect">${options(times, timeFilter)}</select></label>
    <label class="filter-field"><span>Walking distance</span><select id="distanceFilterSelect">${options(distances, distFilter)}</select></label>
    <label class="filter-field"><span>Difficulty</span><select id="difficultyFilterSelect">${options(difficulties, difficultyFilter)}</select></label>
    <label class="filter-field"><span>Sort adventures</span><select id="sortFilterSelect">${options(sorts, sortFilter)}</select></label>`;
  $('#timeFilterSelect').onchange = event => { timeFilter = event.target.value; renderBrowse($('#searchInput').value); };
  $('#distanceFilterSelect').onchange = event => { distFilter = event.target.value; renderBrowse($('#searchInput').value); };
  $('#difficultyFilterSelect').onchange = event => { difficultyFilter = event.target.value; renderBrowse($('#searchInput').value); };
  $('#sortFilterSelect').onchange = event => {
    sortFilter = event.target.value;
    if (sortFilter === 'nearest' && !userPos) {
      sortFilter = 'recommended';
      $('#sortFilterSelect').value = sortFilter;
      toast('Use your location in Nearby adventures to sort by distance');
    }
    renderBrowse($('#searchInput').value);
  };
  $('#clearFilters').onclick = () => {
    timeFilter = 'all'; distFilter = 'all'; difficultyFilter = 'all'; sortFilter = 'recommended';
    $('#searchInput').value = '';
    renderFilters();
    renderBrowse();
  };
}

function renderBrowse(query = '') {
  query = query.toLowerCase();
  let list = packs.filter(pack => [pack.town, pack.display_name, pack.route_name, pack.description, pack.author, pack.recommended_age, ...pack.tags, ...pack.collections].join(' ').toLowerCase().includes(query));
  list = list.filter(pack => timeFilter === 'all'
    || (timeFilter === 'quick' && pack.estimated_minutes <= 45)
    || (timeFilter === 'hour' && pack.estimated_minutes > 45 && pack.estimated_minutes <= 100)
    || (timeFilter === 'half' && pack.estimated_minutes > 100 && pack.estimated_minutes <= 210)
    || (timeFilter === 'full' && pack.estimated_minutes > 210));
  list = list.filter(pack => distFilter === 'all'
    || (distFilter === 'short' && pack.route_distance_km < 3)
    || (distFilter === 'medium' && pack.route_distance_km >= 3 && pack.route_distance_km < 6)
    || (distFilter === 'long' && pack.route_distance_km >= 6));
  list = list.filter(pack => difficultyFilter === 'all' || pack.difficulty_label.toLowerCase() === difficultyFilter);
  if (sortFilter === 'az') list.sort((a, b) => a.display_name.localeCompare(b.display_name));
  if (sortFilter === 'quickest') list.sort((a, b) => a.estimated_minutes - b.estimated_minutes);
  if (sortFilter === 'shortest') list.sort((a, b) => a.route_distance_km - b.route_distance_km);
  if (sortFilter === 'longest') list.sort((a, b) => b.route_distance_km - a.route_distance_km);
  if (sortFilter === 'nearest' && userPos) list.sort((a, b) => distance(userPos, [a.centre.lat, a.centre.long]) - distance(userPos, [b.centre.lat, b.centre.long]));
  $('#browseCount').textContent = `${list.length} ${list.length === 1 ? 'adventure' : 'adventures'} found`;
  $('#browseGrid').innerHTML = list.map(pack => routeCard(pack)).join('') || '<p class="muted">No adventures match those filters.</p>';
  wireCards();
}

function openCollection(name) {
  currentCollection = name;
  currentPack = null;
  pendingDiscovery = null;
  showOnly('collectionView');
  $('#collectionTitle').textContent = name;
  $('#collectionRoutes').innerHTML = packs.filter(pack => pack.collections.includes(name)).map(pack => routeCard(pack)).join('');
  wireCards();
}

function surprise() {
  const pool = userPos
    ? [...packs].sort((a, b) => distance(userPos, [a.centre.lat, a.centre.long]) - distance(userPos, [b.centre.lat, b.centre.long])).slice(0, Math.min(5, packs.length))
    : packs;
  openDetail(pool[Math.floor(Math.random() * pool.length)], false, true);
}

function getNearby() {
  if (!navigator.geolocation) return toast('Location is not available');
  $('#nearbyStatus').textContent = 'Finding nearby adventures…';
  navigator.geolocation.getCurrentPosition(position => {
    userPos = [position.coords.latitude, position.coords.longitude];
    $('#nearbyStatus').textContent = 'Sorted by distance from your current location.';
    renderDaily();
    renderNearby();
    renderFilters();
    renderBrowse($('#searchInput').value);
  }, () => {
    $('#nearbyStatus').textContent = 'Location was not available. Check browser permission.';
  }, { enableHighAccuracy: true, timeout: 12000 });
}

function checkVenueLocation(pack, isDaily, isSurprise = false) {
  if (!navigator.geolocation) return toast('Location is not available');
  const button = $('#checkVenueLocation');
  if (button) {
    button.disabled = true;
    button.textContent = 'Checking your location…';
  }
  navigator.geolocation.getCurrentPosition(position => {
    userPos = [position.coords.latitude, position.coords.longitude];
    openDetail(pack, isDaily, isSurprise);
    setTimeout(() => $('#venueTimingCard')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }, () => {
    if (button) {
      button.disabled = false;
      button.textContent = userPos ? 'Recheck my location' : 'Check my location for a safer result';
    }
    toast('Location was not available. Check browser permission.');
  }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 12000 });
}

function numberedIcon(number, className = '') {
  return L.divIcon({
    className: '',
    html: `<div class="stop-pin ${className}"><span>${number}</span></div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19]
  });
}

function mapTownGroups() {
  const grouped = new Map();
  packs.forEach(pack => {
    const townName = String(pack.town || pack.display_name || '').trim() || 'Adventure';
    const key = townName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’']/g, '')
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
    if (!grouped.has(key)) grouped.set(key, { townName, routes: [] });
    grouped.get(key).routes.push(pack);
  });
  return [...grouped.values()].map(group => {
    group.routes.sort((a, b) => String(a.route_name).localeCompare(String(b.route_name)));
    const centres = group.routes
      .map(pack => [Number(pack.centre?.lat), Number(pack.centre?.long)])
      .filter(([lat, long]) => Number.isFinite(lat) && Number.isFinite(long));
    const centre = centres.length
      ? [
          centres.reduce((total, point) => total + point[0], 0) / centres.length,
          centres.reduce((total, point) => total + point[1], 0) / centres.length
        ]
      : [52.45, -0.18];
    return { ...group, centre };
  });
}

function townMapPopup(group) {
  const routeCount = group.routes.length;
  const routeButtons = group.routes.map(pack => {
    const encodedId = encodeURIComponent(pack.pack_id).replace(/'/g, '%27');
    const stopCount = pack.stops.length;
    return `<button class="town-map-route" onclick="window.openPack(decodeURIComponent('${encodedId}'))"><b>${esc(pack.route_name)}</b><span>${pack.route_distance_km} km · ${stopCount} ${stopCount === 1 ? 'stop' : 'stops'} →</span></button>`;
  }).join('');
  return `<div class="town-map-popup"><span class="town-map-kicker">${routeCount} ${routeCount === 1 ? 'ADVENTURE' : 'ADVENTURES'}</span><b class="town-map-name">${esc(group.townName)}</b><div class="town-map-routes">${routeButtons}</div></div>`;
}

function showMap() {
  currentCollection = null;
  currentPack = null;
  pendingDiscovery = null;
  showOnly('mapView');
  setTimeout(() => {
    if (!mapReady) {
      map = L.map('map', { zoomControl: false }).setView([52.45, -0.18], 7);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      const townGroups = mapTownGroups();
      townGroups.forEach(group => {
        const routeCount = group.routes.length;
        const accent = colour(group.routes[0]);
        const extraClass = routeCount > 1 ? ' multi-route-pin' : '';
        const icon = L.divIcon({
          className: '',
          html: `<div class="giant-pin town-pin${extraClass}" style="--pin:${accent}"><span>${routeCount}</span><small>${routeCount === 1 ? 'route' : 'routes'}</small></div>`,
          iconSize: [66, 66],
          iconAnchor: [33, 33]
        });
        L.marker(group.centre, { icon, title: `${group.townName}: ${routeCount} ${routeCount === 1 ? 'route' : 'routes'}` })
          .addTo(map)
          .bindPopup(townMapPopup(group), { maxWidth: 340, minWidth: 245 });
      });
      if (townGroups.length > 1) map.fitBounds(townGroups.map(group => group.centre), { padding: [45, 45], maxZoom: 9 });
      else if (townGroups.length === 1) map.setView(townGroups[0].centre, 13);
      mapReady = true;
    } else {
      map.invalidateSize();
    }
  }, 50);
}

function applyRouteTheme(pack) {
  const accent = pack ? colour(pack) : '#ffb21f';
  document.documentElement.style.setProperty('--route-accent', accent);
  const transition = $('#brandTransition');
  if (transition) transition.style.setProperty('--transition-accent', accent);
}

function directionsUrl(pack) {
  const start = pack.stops[0];
  if (!start) return '';
  const destination = `${Number(start.Target_Lat)},${Number(start.Target_Long)}`;
  const appleDevice = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
  return appleDevice
    ? `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=walking`;
}

function openStartDirections(pack) {
  const url = directionsUrl(pack);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

function beforeYouGoItems(pack) {
  const info = pack.before_you_go || {};
  return [
    ['⌁', 'Terrain', info.terrain || pack.transport_note || 'Town-centre pavements and public paths.'],
    ['↗', 'Hills', info.hills || 'Expect ordinary town-centre gradients.'],
    ['▥', 'Steps', info.steps || 'No required steps are known, but diversions can change.'],
    ['♿', 'Accessibility', info.accessibility || 'Check current path conditions if step-free access is important.'],
    ['WC', 'Toilets', info.toilets || 'Check local public facilities before setting off.'],
    ['◒', 'Footwear', info.footwear || 'Comfortable walking shoes are recommended.'],
    ['♟', 'Dogs', info.dogs || 'Outdoor route; check the final venue’s current dog policy.'],
    ['◫', 'Pushchairs', info.pushchairs || 'Check current path conditions and temporary diversions.']
  ];
}

function beforeYouGoCard(pack) {
  return `<section class="before-you-go"><div class="section-heading"><div><span class="eyebrow">BEFORE YOU GO</span><h2>Know the walk, keep the mystery</h2></div></div><div class="before-grid">${beforeYouGoItems(pack).map(([icon, label, text]) => `<div class="before-item"><span>${esc(icon)}</span><div><b>${esc(label)}</b><small>${esc(text)}</small></div></div>`).join('')}</div></section>`;
}

function offlineAdventureUrl(pack) {
  return pack.source_file ? `packs/${pack.source_file}` : '';
}

async function renderOfflineControls(pack) {
  const status = $('#offlineStatus');
  const button = $('#saveOffline');
  if (!status || !button) return;
  if (!('caches' in window) || !offlineAdventureUrl(pack)) {
    status.innerHTML = '<i></i><span>Offline saving is not supported by this browser</span>';
    button.classList.add('hidden');
    return;
  }
  const cached = await caches.match(offlineAdventureUrl(pack));
  status.classList.toggle('saved', Boolean(cached));
  status.innerHTML = cached
    ? '<i></i><span>Saved on this device for offline play</span>'
    : `<i></i><span>${navigator.onLine ? 'Available now · save this adventure for patchy signal' : 'You are offline · this adventure is not saved yet'}</span>`;
  button.textContent = cached ? 'Saved offline ✓' : 'Save offline';
  button.disabled = Boolean(cached) || !navigator.onLine;
}

async function saveAdventureOffline(pack) {
  const button = $('#saveOffline');
  const url = offlineAdventureUrl(pack);
  if (!url || !('caches' in window)) return;
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const response = await fetch(url, { cache: 'reload' });
    if (!response.ok) throw Error('Pack download failed');
    const cache = await caches.open('day-tripping-quiz-adventures-v1');
    await cache.put(url, response.clone());
    await renderOfflineControls(pack);
    toast('Adventure saved for offline play.');
  } catch {
    button.disabled = false;
    button.textContent = 'Try again';
    toast('Could not save this adventure. Check your connection.');
  }
}

window.openPack = id => openDetail(packs.find(pack => pack.pack_id === id), false);

function openDetail(pack, isDaily = false, isSurprise = false) {
  if (!pack) return;
  stopWatch();
  destroyCompletionMap();
  if (venueDisclosurePackId !== pack.pack_id) {
    venueDisclosurePackId = pack.pack_id;
    venueHoursExpanded = false;
    venueDetailsRevealed = false;
  }
  selectedAsDaily = isDaily;
  selectedAsSurprise = isSurprise;
  selectedDailyDate = isDaily ? todayKey() : null;
  currentCollection = null;
  pendingDiscovery = null;
  currentPack = pack;
  applyRouteTheme(pack);
  showOnly('detailView');
  const state = packProgress(pack);
  const activeAdventure = isActiveAdventure(pack);
  const chips = [...pack.collections, ...pack.tags].map(item => `<span class="meta">${esc(item)}</span>`).join('');
  const score = displayScore(pack);
  const activeMode = activeAdventure ? state.runMode : isDaily ? 'daily' : isSurprise ? 'surprise' : 'standard';
  $('#detailContent').innerHTML = `<div class="detail-hero" style="--detail-accent:${colour(pack)}"><button class="back-btn" data-back aria-label="Go back">←</button><span class="eyebrow detail-location">${esc(pack.display_name.toUpperCase())}</span><h1>${esc(pack.route_name)}</h1><p>${esc(pack.short_description)}</p></div>
    <div class="detail-body">
      <div class="detail-stats">
        <div class="stat"><span>Distance</span><b>${pack.route_distance_km} km</b></div>
        <div class="stat"><span>Time</span><b>${pack.estimated_minutes} mins</b></div>
        <div class="stat"><span>Difficulty</span><b>${esc(pack.difficulty_label)}</b></div>
        <div class="stat"><span>Stops</span><b>${pack.stops.length}</b></div>
        <div class="stat"><span>Age</span><b>${esc(pack.recommended_age)}</b></div>
      </div>
      <h2>Your mission</h2><p>${esc(pack.description)}</p>
      <div class="meta-row detail-tags">${chips}</div>
      <p class="route-credit">By ${esc(pack.author)} · Route pack v${Number(pack.version) || 1}</p>
      <p class="muted">${esc(pack.transport_note || '')}</p>
      ${beforeYouGoCard(pack)}
      <div class="route-practical"><button id="directionsToStart" class="directions-btn"><span>↗</span><div><b>Directions to the start</b><small>Opens walking directions in your maps app</small></div></button><div class="offline-row"><div id="offlineStatus" class="offline-status"><i></i><span>Checking offline availability…</span></div><button id="saveOffline" class="text-btn">Save offline</button></div></div>
      ${score ? `<div class="personal-best"><span>Personal best</span><b>✦ ${formatPoints(score)} points</b></div>` : ''}
      ${activeMode === 'daily' ? '<div class="daily-mission"><span>×2</span><b>Daily Double: complete the route to double your Adventure Score.</b></div>' : ''}
      ${activeMode === 'surprise' ? '<div class="surprise-mission"><span>+20%</span><b>Surprise Me bonus: complete the route for 20% extra.</b></div>' : ''}
      ${venueTimingCard(pack, state)}
      <button id="startRoute" class="primary">${activeAdventure ? 'Continue adventure' : hasCompleted(pack) ? 'Play again' : 'Start adventure'}</button>
      ${activeAdventure ? '<button id="endRoute" class="end-adventure-btn">End adventure</button>' : ''}
    </div>`;
  bindNavigationButtons();
  $('#startRoute').onclick = () => startGame(pack);
  $('#directionsToStart').onclick = () => openStartDirections(pack);
  $('#saveOffline').onclick = () => saveAdventureOffline(pack);
  bindEndAdventure(pack, isDaily);
  bindVenueDisclosure(pack, state, isDaily, isSurprise);
  renderOfflineControls(pack);
}

function recommendationsFor(pack, count = 2) {
  const origin = [pack.centre.lat, pack.centre.long];
  return packs
    .filter(candidate => candidate.pack_id !== pack.pack_id)
    .map(candidate => ({ candidate, kilometres: distance(origin, [candidate.centre.lat, candidate.centre.long]) }))
    .sort((a, b) => a.kilometres - b.kilometres)
    .slice(0, count)
    .map(item => item.candidate);
}

function wrapCanvasText(context, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach(word => {
    const trial = line ? `${line} ${word}` : word;
    if (context.measureText(trial).width <= maxWidth || !line) line = trial;
    else {
      lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((item, index) => context.fillText(item, x, y + index * lineHeight));
  return y + Math.min(lines.length, maxLines) * lineHeight;
}

function loadCanvasImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function clearAdventurePhotos() {
  adventurePhotos.forEach(photo => {
    if (photo?.url) URL.revokeObjectURL(photo.url);
  });
  adventurePhotos = [];
  adventureNotes = [];
}

function closePostcardEditor() {
  if (postcardEditorState?.renderTimer) clearTimeout(postcardEditorState.renderTimer);
  if (postcardEditorState?.dragFrame) cancelAnimationFrame(postcardEditorState.dragFrame);
  if (postcardEditorState?.photoUrl) URL.revokeObjectURL(postcardEditorState.photoUrl);
  postcardEditorState = null;
  $('#postcardModal')?.classList.add('hidden');
}

function postcardEditorAccent(editor = postcardEditorState) {
  return editor?.kind === 'passport' || !editor?.pack ? '#61e7ff' : colour(editor.pack);
}

function postcardEditorNoun(editor = postcardEditorState) {
  return editor?.kind === 'passport' ? 'passport' : 'postcard';
}

function schedulePostcardRender(delay = 160) {
  if (!postcardEditorState) return;
  const editor = postcardEditorState;
  if (editor.renderTimer) clearTimeout(editor.renderTimer);
  editor.rendered = null;
  const token = ++editor.renderToken;
  const shareButton = $('#sharePostcard');
  const downloadButton = $('#downloadPostcard');
  shareButton.disabled = true;
  downloadButton.disabled = true;
  shareButton.textContent = `Preparing ${postcardEditorNoun(editor)}…`;
  editor.renderTimer = setTimeout(async () => {
    try {
      const options = {
        message: editor.message,
        photoUrl: editor.photoUrl,
        photoImage: editor.photoImage,
        photoX: editor.photoX,
        photoY: editor.photoY,
        photoZoom: editor.photoZoom,
        memoryItems: editor.memoryItems.filter(item => item.enabled)
      };
      const rendered = editor.kind === 'passport'
        ? await buildPassportPoster(options)
        : await buildCompletionPostcard(editor.pack, editor.score, options);
      if (postcardEditorState !== editor || editor.renderToken !== token) return;
      editor.rendered = rendered;
      const preview = $('#postcardPreviewCanvas');
      preview.width = POSTCARD_PREVIEW_WIDTH;
      preview.height = POSTCARD_PREVIEW_HEIGHT;
      const previewContext = preview.getContext('2d');
      previewContext.clearRect(0, 0, preview.width, preview.height);
      previewContext.drawImage(rendered.canvas, 0, 0, preview.width, preview.height);
      shareButton.disabled = false;
      downloadButton.disabled = false;
      shareButton.textContent = editor.kind === 'passport' ? 'Share passport' : 'Share postcard';
    } catch {
      if (postcardEditorState !== editor || editor.renderToken !== token) return;
      shareButton.textContent = `Could not prepare ${postcardEditorNoun(editor)}`;
      toast(`Could not prepare that ${postcardEditorNoun(editor)}. Try a different photo.`);
    }
  }, delay);
}

function updatePostcardPreview(renderDelay = 160) {
  if (!postcardEditorState) return;
  const { message, photoUrl, photoX, photoY, photoZoom } = postcardEditorState;
  const selectedExtras = postcardEditorState.memoryItems.filter(item => item.enabled).length;
  const canDrag = Boolean(photoUrl) || selectedExtras > 0;
  $('#postcardMessageCount').textContent = `${message.length}/120`;
  $('#postcardPreviewCanvas').classList.toggle('photo-adjustable', canDrag);
  $('#postcardDragHint').classList.toggle('hidden', !canDrag);
  $('#postcardDragHint').textContent = selectedExtras
    ? 'Drag extras anywhere to arrange them'
    : 'Drag the photo to reposition it';
  $('#postcardExtrasCount').textContent = `${selectedExtras} selected`;
  $('#removePostcardPhoto').classList.toggle('hidden', !photoUrl);
  $('#postcardPhotoAdjustments').classList.toggle('hidden', !photoUrl);
  $('#postcardPhotoLabel').textContent = photoUrl ? 'Choose another' : 'Choose a photo';
  $('#postcardCameraLabel').textContent = photoUrl ? 'Take another' : 'Take a photo';
  $('#postcardPhotoX').value = Math.round(photoX * 100);
  $('#postcardPhotoY').value = Math.round(photoY * 100);
  $('#postcardPhotoZoom').value = Math.round(photoZoom * 100);
  schedulePostcardRender(renderDelay);
}

function selectPostcardPhoto(file, sourceInput) {
  if (!file || !postcardEditorState) return;
  if (!file.type.startsWith('image/')) {
    sourceInput.value = '';
    return toast(`Choose an image file for your ${postcardEditorNoun()}.`);
  }
  if (file.size > 20 * 1024 * 1024) {
    sourceInput.value = '';
    return toast('That photo is over 20 MB. Choose a smaller image.');
  }
  if (postcardEditorState.photoUrl) URL.revokeObjectURL(postcardEditorState.photoUrl);
  postcardEditorState.photoFile = file;
  postcardEditorState.photoUrl = URL.createObjectURL(file);
  postcardEditorState.photoImage = null;
  postcardEditorState.photoX = 0.5;
  postcardEditorState.photoY = 0.5;
  postcardEditorState.photoZoom = 1;
  const otherInput = sourceInput.id === 'postcardPhoto' ? $('#postcardCamera') : $('#postcardPhoto');
  otherInput.value = '';
  updatePostcardPreview(30);
  const editor = postcardEditorState;
  const selectedUrl = editor.photoUrl;
  loadCanvasImage(selectedUrl).then(image => {
    if (postcardEditorState !== editor || editor.photoUrl !== selectedUrl) return;
    editor.photoImage = image;
  }).catch(() => {});
}

function createPostcardMemoryItems(photos, notes) {
  const defaultPositions = [
    [58, 554], [382, 600], [708, 528],
    [72, 776], [405, 748], [726, 797],
    [75, 1005], [390, 986], [706, 1025],
    [62, 342], [392, 360], [720, 350]
  ];
  return adventureMemoryItems(photos, notes).map((item, index) => {
    const [x, y] = defaultPositions[index % defaultPositions.length];
    return {
      ...item,
      id: `${item.type}-${Number(item.stopIndex) || 0}-${index}`,
      enabled: false,
      x,
      y,
      width: item.type === 'photo' ? 326 : 286,
      height: item.type === 'photo' ? 228 : 174,
      colourIndex: index,
      angle: item.type === 'photo'
        ? MEMORY_ANGLES[index % MEMORY_ANGLES.length]
        : -MEMORY_ANGLES[index % MEMORY_ANGLES.length] * 1.12
    };
  });
}

function renderPostcardExtras() {
  if (!postcardEditorState) return;
  const details = $('#postcardExtras');
  const list = $('#postcardExtrasList');
  const items = postcardEditorState.memoryItems;
  details.classList.toggle('hidden', items.length === 0);
  list.innerHTML = items.map(item => {
    const thumbnail = item.type === 'photo'
      ? `<span class="postcard-extra-thumb"><img src="${esc(item.url)}" alt=""></span>`
      : '<span class="postcard-extra-thumb">✎</span>';
    const description = item.type === 'photo' ? 'Discovery photo' : String(item.text || 'Field note');
    return `<label class="postcard-extra-option"><input type="checkbox" data-postcard-extra="${esc(item.id)}" ${item.enabled ? 'checked' : ''}>${thumbnail}<span class="postcard-extra-copy"><b>${esc(item.stopName || (item.type === 'photo' ? 'Discovery photo' : 'Field note'))}</b><small>${esc(description)}</small></span></label>`;
  }).join('');
  $('#postcardExtrasCount').textContent = `${items.filter(item => item.enabled).length} selected`;
}

function pointInsidePostcardMemory(item, canvasX, canvasY) {
  const centreX = item.x + item.width / 2;
  const centreY = item.y + item.height / 2;
  const dx = canvasX - centreX;
  const dy = canvasY - centreY;
  const cosine = Math.cos(item.angle);
  const sine = Math.sin(item.angle);
  const localX = dx * cosine + dy * sine;
  const localY = -dx * sine + dy * cosine;
  return Math.abs(localX) <= item.width / 2 && Math.abs(localY) <= item.height / 2;
}

function postcardMemoryDragLimits(item, canvas) {
  const rotatedWidth = Math.abs(item.width * Math.cos(item.angle)) + Math.abs(item.height * Math.sin(item.angle));
  const rotatedHeight = Math.abs(item.width * Math.sin(item.angle)) + Math.abs(item.height * Math.cos(item.angle));
  const xPadding = Math.max(0, (rotatedWidth - item.width) / 2);
  const yPadding = Math.max(0, (rotatedHeight - item.height) / 2);
  return {
    minX: xPadding,
    maxX: canvas.width - item.width - xPadding,
    minY: yPadding,
    maxY: canvas.height - item.height - yPadding
  };
}

function bindPostcardDragging() {
  const canvas = $('#postcardPreviewCanvas');
  canvas.onpointerdown = event => {
    if (!postcardEditorState) return;
    const rect = canvas.getBoundingClientRect();
    const canvasX = (event.clientX - rect.left) * (POSTCARD_WIDTH / rect.width);
    const canvasY = (event.clientY - rect.top) * (POSTCARD_HEIGHT / rect.height);
    const memory = [...postcardEditorState.memoryItems]
      .reverse()
      .find(item => item.enabled && pointInsidePostcardMemory(item, canvasX, canvasY));
    if (memory) {
      const memoryIndex = postcardEditorState.memoryItems.findIndex(item => item.id === memory.id);
      postcardEditorState.memoryItems.splice(memoryIndex, 1);
      postcardEditorState.memoryItems.push(memory);
      postcardEditorState.drag = {
        type: 'memory',
        memoryId: memory.id,
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        memoryX: memory.x,
        memoryY: memory.y,
        lastRender: 0
      };
    } else if (postcardEditorState.photoUrl && canvasX >= 630 && canvasX <= 1010 && canvasY >= 62 && canvasY <= 337) {
      postcardEditorState.drag = {
        type: 'photo',
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        photoX: postcardEditorState.photoX,
        photoY: postcardEditorState.photoY,
        lastRender: 0
      };
    } else {
      return;
    }
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    canvas.classList.add('dragging');
    $('#sharePostcard').disabled = true;
    $('#downloadPostcard').disabled = true;
    $('#sharePostcard').textContent = `Release to update ${postcardEditorNoun()}`;
    queuePostcardLivePreview();
  };
  canvas.onpointermove = event => {
    const drag = postcardEditorState?.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = canvas.getBoundingClientRect();
    const coalesced = event.getCoalescedEvents?.();
    const point = coalesced?.length ? coalesced[coalesced.length - 1] : event;
    if (drag.type === 'memory') {
      const memory = postcardEditorState.memoryItems.find(item => item.id === drag.memoryId);
      if (!memory) return;
      const deltaX = (point.clientX - drag.clientX) * (POSTCARD_WIDTH / rect.width);
      const deltaY = (point.clientY - drag.clientY) * (POSTCARD_HEIGHT / rect.height);
      const limits = postcardMemoryDragLimits(memory, { width: POSTCARD_WIDTH, height: POSTCARD_HEIGHT });
      memory.x = Math.max(limits.minX, Math.min(limits.maxX, drag.memoryX + deltaX));
      memory.y = Math.max(limits.minY, Math.min(limits.maxY, drag.memoryY + deltaY));
    } else {
      const photoWidth = rect.width * (380 / POSTCARD_WIDTH);
      const photoHeight = rect.height * (275 / POSTCARD_HEIGHT);
      postcardEditorState.photoX = Math.max(0, Math.min(1, drag.photoX - (point.clientX - drag.clientX) / photoWidth));
      postcardEditorState.photoY = Math.max(0, Math.min(1, drag.photoY - (point.clientY - drag.clientY) / photoHeight));
    }
    queuePostcardLivePreview();
  };
  const finishDrag = event => {
    const drag = postcardEditorState?.drag;
    if (!drag || (event.pointerId !== undefined && drag.pointerId !== event.pointerId)) return;
    postcardEditorState.drag = null;
    if (postcardEditorState.dragFrame) cancelAnimationFrame(postcardEditorState.dragFrame);
    postcardEditorState.dragFrame = null;
    canvas.classList.remove('dragging');
    updatePostcardPreview(0);
  };
  canvas.onpointerup = finishDrag;
  canvas.onpointercancel = finishDrag;
}

function openPostcardEditor(pack, score, kind = 'completion') {
  closePostcardEditor();
  const passportMode = kind === 'passport';
  const editorPhotos = passportMode ? [] : adventurePhotos.filter(photo => photo.packId === pack.pack_id).slice(0, 6);
  const editorNotes = passportMode ? [] : adventureNotes.filter(note => note.packId === pack.pack_id).slice(0, 6);
  postcardEditorState = {
    kind,
    pack,
    score,
    message: '',
    photoFile: null,
    photoUrl: null,
    photoImage: null,
    photoX: 0.5,
    photoY: 0.5,
    photoZoom: 1,
    memoryItems: createPostcardMemoryItems(editorPhotos, editorNotes),
    drag: null,
    dragFrame: null,
    rendered: null,
    renderTimer: null,
    renderToken: 0
  };
  $('#postcardMessage').value = '';
  $('#postcardPhoto').value = '';
  $('#postcardCamera').value = '';
  $('#postcardExtras').open = false;
  $('#postcardEyebrow').textContent = passportMode ? 'YOUR PASSPORT POSTER' : 'YOUR POSTCARD';
  $('#postcardTitle').textContent = passportMode ? 'Share your explorer story.' : 'Make it yours.';
  $('#postcardIntro').textContent = passportMode
    ? 'Turn your points, achievements, collections and latest stamps into a poster. Add a photo and message if you like.'
    : 'Choose your extras, drag them into place, add a message, or keep the clean original design.';
  $('#postcardPreviewCanvas').setAttribute('aria-label', passportMode ? 'Preview of your explorer passport poster' : 'Preview of your finished postcard');
  $('#postcardMessage').placeholder = passportMode
    ? 'Your explorer motto, favourite moment, or where you are heading next…'
    : 'A brilliant day out, a favourite moment, or an inside joke…';
  $('#postcardPrivacy').textContent = passportMode
    ? 'Your photo and message stay on this device and are only used to make the passport poster you share or download.'
    : 'Your photos, field notes and message stay on this device and are only used to make the postcard you share or download.';
  $('#sharePostcard').textContent = passportMode ? 'Share passport' : 'Share postcard';
  $('#downloadPostcard').textContent = passportMode ? 'Download poster' : 'Download image';
  const photoCount = editorPhotos.length;
  const noteCount = editorNotes.length;
  const collageCount = photoCount + noteCount;
  $('#adventurePhotoNotice').classList.toggle('hidden', collageCount === 0);
  $('#adventurePhotoNotice').innerHTML = collageCount
    ? `<span>▣</span><div><b>${collageCount} fieldwork ${collageCount === 1 ? 'extra is' : 'extras are'} ready</b><small>Open Postcard extras to choose what appears, then drag each one into place.</small></div>`
    : '';
  renderPostcardExtras();
  $('#postcardModal').classList.remove('hidden');
  updatePostcardPreview();
  bindPostcardDragging();
  $('#postcardClose').onclick = closePostcardEditor;
  $('#postcardModal').onclick = event => {
    if (event.target === $('#postcardModal')) closePostcardEditor();
  };
  $('#postcardMessage').oninput = event => {
    postcardEditorState.message = event.target.value.slice(0, 120);
    updatePostcardPreview();
  };
  $('#postcardExtrasList').onchange = event => {
    const checkbox = event.target.closest('[data-postcard-extra]');
    if (!checkbox || !postcardEditorState) return;
    const item = postcardEditorState.memoryItems.find(memory => memory.id === checkbox.dataset.postcardExtra);
    if (!item) return;
    item.enabled = checkbox.checked;
    updatePostcardPreview(30);
  };
  $('#postcardPhoto').onchange = event => selectPostcardPhoto(event.target.files?.[0], event.target);
  $('#postcardCamera').onchange = event => selectPostcardPhoto(event.target.files?.[0], event.target);
  $('#postcardPhotoX').oninput = event => {
    postcardEditorState.photoX = Number(event.target.value) / 100;
    updatePostcardPreview(45);
  };
  $('#postcardPhotoY').oninput = event => {
    postcardEditorState.photoY = Number(event.target.value) / 100;
    updatePostcardPreview(45);
  };
  $('#postcardPhotoZoom').oninput = event => {
    postcardEditorState.photoZoom = Number(event.target.value) / 100;
    updatePostcardPreview(45);
  };
  $('#resetPostcardPhoto').onclick = () => {
    postcardEditorState.photoX = 0.5;
    postcardEditorState.photoY = 0.5;
    postcardEditorState.photoZoom = 1;
    updatePostcardPreview(30);
  };
  $('#removePostcardPhoto').onclick = () => {
    if (postcardEditorState.photoUrl) URL.revokeObjectURL(postcardEditorState.photoUrl);
    postcardEditorState.photoFile = null;
    postcardEditorState.photoUrl = null;
    postcardEditorState.photoImage = null;
    postcardEditorState.photoX = 0.5;
    postcardEditorState.photoY = 0.5;
    postcardEditorState.photoZoom = 1;
    $('#postcardPhoto').value = '';
    $('#postcardCamera').value = '';
    updatePostcardPreview(30);
  };
  $('#sharePostcard').onclick = () => exportCompletionPostcard('share');
  $('#downloadPostcard').onclick = () => exportCompletionPostcard('download');
}

function openPassportPoster() {
  openPostcardEditor(null, 0, 'passport');
}

function drawCanvasCover(context, image, x, y, width, height, accent, options = {}, radius = 28) {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const requestedX = Number(options.x);
  const requestedY = Number(options.y);
  const zoom = Math.max(1, Math.min(2.5, Number(options.zoom) || 1));
  const focusX = Math.max(0, Math.min(1, Number.isFinite(requestedX) ? requestedX : 0.5));
  const focusY = Math.max(0, Math.min(1, Number.isFinite(requestedY) ? requestedY : 0.5));
  const scale = Math.max(width / imageWidth, height / imageHeight) * zoom;
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const drawX = x - (drawWidth - width) * focusX;
  const drawY = y - (drawHeight - height) * focusY;
  context.save();
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.clip();
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  const shade = context.createLinearGradient(x, y, x, y + height);
  shade.addColorStop(0, '#00000000');
  shade.addColorStop(1, '#06101888');
  context.fillStyle = shade;
  context.fillRect(x, y, width, height);
  context.restore();
  context.strokeStyle = `${accent}aa`;
  context.lineWidth = 4;
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.stroke();
}

const MEMORY_ANGLES = [-0.052, 0.038, -0.026, 0.042, -0.036, 0.024, -0.018, 0.047, -0.041, 0.029, -0.032, 0.021];

function adventureMemoryItems(photos, notes) {
  return [
    ...photos.slice(0, 6).map((item, order) => ({ ...item, type: 'photo', order })),
    ...notes.slice(0, 6).map((item, order) => ({ ...item, type: 'note', order }))
  ].sort((a, b) => (Number(a.stopIndex) || a.order) - (Number(b.stopIndex) || b.order) || (a.type === 'photo' ? -1 : 1));
}

function drawMemoryMount(context, x, y, width, accent, angle = 0) {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.globalAlpha = 0.88;
  context.fillStyle = accent;
  context.beginPath();
  context.roundRect(-width / 2, -8, width, 16, 8);
  context.fill();
  context.restore();
}

function drawAdventureMemories(context, items, accent) {
  const noteColours = ['#c8ff5a', '#61e7ff', '#ffb21f', '#f4a8d4', '#a9a4ff', '#79efc1'];
  items.forEach((item, index) => {
    const width = item.width;
    const height = item.height;
    const angle = item.angle;
    if (item.type === 'photo' && item.image) {
      context.save();
      context.translate(item.x + width / 2, item.y + height / 2);
      context.rotate(angle);
      context.shadowColor = '#00000077';
      context.shadowBlur = 18;
      context.shadowOffsetY = 9;
      context.fillStyle = '#f8fafb';
      context.beginPath();
      context.roundRect(-width / 2, -height / 2, width, height, 12);
      context.fill();
      context.shadowColor = 'transparent';
      drawCanvasCover(context, item.image, -width / 2 + 11, -height / 2 + 11, width - 22, 169, accent, {}, 7);
      context.fillStyle = '#14212b';
      context.font = '850 14px system-ui, sans-serif';
      context.fillText(String(item.stopName || 'A brilliant find').slice(0, 34), -width / 2 + 17, height / 2 - 18);
      drawMemoryMount(context, width / 2 - 33, -height / 2 + 8, 62, accent, 0.12);
      context.restore();
      return;
    }
    const cardColour = noteColours[item.colourIndex % noteColours.length];
    context.save();
    context.translate(item.x + width / 2, item.y + height / 2);
    context.rotate(angle);
    context.shadowColor = '#00000066';
    context.shadowBlur = 16;
    context.shadowOffsetY = 8;
    context.fillStyle = cardColour;
    context.beginPath();
    context.roundRect(-width / 2, -height / 2, width, height, 24);
    context.fill();
    context.shadowColor = 'transparent';
    context.globalAlpha = 0.18;
    context.fillStyle = '#0b151d';
    context.beginPath();
    context.arc(width / 2 - 20, -height / 2 + 18, 54, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
    context.fillStyle = '#14212b';
    context.font = '950 11px system-ui, sans-serif';
    context.fillText(String(item.stopName || 'FIELD NOTE').toUpperCase().slice(0, 32), -width / 2 + 17, -height / 2 + 28);
    context.font = '750 16px "Segoe Print", "Comic Sans MS", cursive';
    wrapCanvasText(context, String(item.text || ''), -width / 2 + 17, -height / 2 + 57, width - 34, 23, 4);
    drawMemoryMount(context, -width / 2 + 35, -height / 2 + 5, 54, '#ffffff', -0.08);
    context.restore();
  });
}

function drawPostcardLivePreview() {
  const editor = postcardEditorState;
  const staticCanvas = editor?.rendered?.staticCanvas;
  if (!editor || !staticCanvas) return;
  const preview = $('#postcardPreviewCanvas');
  const context = preview.getContext('2d');
  context.clearRect(0, 0, preview.width, preview.height);
  context.drawImage(staticCanvas, 0, 0, preview.width, preview.height);
  context.save();
  context.scale(preview.width / POSTCARD_WIDTH, preview.height / POSTCARD_HEIGHT);
  const chosenPhoto = editor.photoImage || editor.rendered.photoImage;
  if (editor.photoUrl && chosenPhoto) {
    drawCanvasCover(context, chosenPhoto, 630, 62, 380, 275, postcardEditorAccent(editor), {
      x: editor.photoX,
      y: editor.photoY,
      zoom: editor.photoZoom
    });
  }
  const selectedExtras = editor.memoryItems.filter(item => item.enabled);
  if (selectedExtras.length) drawAdventureMemories(context, selectedExtras, postcardEditorAccent(editor));
  context.restore();
}

function queuePostcardLivePreview() {
  const editor = postcardEditorState;
  if (!editor || editor.dragFrame) return;
  editor.dragFrame = requestAnimationFrame(() => {
    if (postcardEditorState !== editor) return;
    editor.dragFrame = null;
    drawPostcardLivePreview();
  });
}

function copyPostcardCanvas(source) {
  const copy = document.createElement('canvas');
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext('2d').drawImage(source, 0, 0);
  return copy;
}

async function buildCompletionPostcard(pack, score, options = {}) {
  const state = packProgress(pack);
  const mode = state.lastRunMode || state.runMode || 'standard';
  const memoryItems = Array.isArray(options.memoryItems) ? options.memoryItems.slice(0, 12) : [];
  const message = String(options.message || '').trim();
  const canvas = document.createElement('canvas');
  canvas.width = POSTCARD_WIDTH;
  canvas.height = POSTCARD_HEIGHT;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#162938');
  gradient.addColorStop(0.58, '#0c161f');
  gradient.addColorStop(1, '#080e13');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = colour(pack);
  context.fillRect(0, 0, POSTCARD_WIDTH, 24);
  context.globalAlpha = 0.12;
  context.beginPath();
  context.arc(950, 140, 380, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
  try {
    const logo = await loadCanvasImage('assets/day-tripping-quiz-icon-512.png');
    context.drawImage(logo, 70, 60, 250, 250);
  } catch {}
  context.fillStyle = mode === 'daily' ? '#ffb21f' : mode === 'surprise' ? '#c8ff5a' : colour(pack);
  context.beginPath();
  context.roundRect(350, 82, 235, 58, 29);
  context.fill();
  context.fillStyle = '#101820';
  context.font = '950 20px system-ui, sans-serif';
  context.fillText(mode === 'daily' ? '×2 DAILY DOUBLE' : mode === 'surprise' ? '+20% SURPRISE' : 'PASSPORT STAMP', 375, 119);
  context.fillStyle = colour(pack);
  context.font = '900 30px system-ui, sans-serif';
  context.letterSpacing = '4px';
  context.fillText(adventureTitle(state), 76, 390);
  context.fillStyle = '#fffaf0';
  context.font = '950 76px system-ui, sans-serif';
  const titleBottom = wrapCanvasText(context, pack.route_name, 72, 475, 930, 82, 3);
  context.fillStyle = '#b7c1c9';
  context.font = '800 36px system-ui, sans-serif';
  context.fillText(pack.display_name.toUpperCase(), 76, titleBottom + 38);
  const statsY = Math.max(820, titleBottom + 95);
  context.fillStyle = '#131f28';
  context.strokeStyle = `${colour(pack)}99`;
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(65, statsY, 950, 220, 35);
  context.fill();
  context.stroke();
  const elapsed = formatAdventureTime(state.elapsedSeconds, true) || '—';
  const stats = [
    ['ADVENTURE', formatPoints(score)],
    ['STOPS', String(pack.stops.length)],
    ['WALK', `${pack.route_distance_km} KM`],
    ['TIME', elapsed.toUpperCase()]
  ];
  stats.forEach((item, index) => {
    const x = 100 + index * 232;
    context.fillStyle = '#91a0ab';
    context.font = '800 20px system-ui, sans-serif';
    context.fillText(item[0], x, statsY + 68);
    context.fillStyle = '#fffaf0';
    context.font = `950 ${item[1].length > 8 ? 32 : 44}px system-ui, sans-serif`;
    context.fillText(item[1], x, statsY + 145);
  });
  if (message) {
    context.fillStyle = '#fffaf0';
    context.font = '700 28px system-ui, sans-serif';
    wrapCanvasText(context, `“${message}”`, 72, statsY + 275, 930, 36, 3);
  }
  const footerTitleY = canvas.height - 78;
  const footerTotalY = canvas.height - 40;
  context.fillStyle = '#ffb21f';
  context.font = '900 28px system-ui, sans-serif';
  context.fillText('DAY TRIPPING QUIZ', 72, footerTitleY);
  context.fillStyle = '#9daab4';
  context.font = '700 22px system-ui, sans-serif';
  context.fillText(`EXPLORER TOTAL · ${formatPoints(explorerPointsTotal())} POINTS`, 72, footerTotalY);
  const staticCanvas = copyPostcardCanvas(canvas);
  let photoImage = options.photoImage || null;
  if (options.photoUrl) {
    photoImage ||= await loadCanvasImage(options.photoUrl);
    drawCanvasCover(context, photoImage, 630, 62, 380, 275, colour(pack), {
      x: options.photoX,
      y: options.photoY,
      zoom: options.photoZoom
    });
  }
  if (memoryItems.length) drawAdventureMemories(context, memoryItems, colour(pack));
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw Error('Postcard could not be created');
  const fileName = `day-tripping-${pack.pack_id}.png`;
  const file = typeof File === 'function' ? new File([blob], fileName, { type: 'image/png' }) : null;
  return { canvas, staticCanvas, photoImage, blob, file, fileName };
}

function setFittedCanvasFont(context, text, maxWidth, startSize, minSize, weight = 950) {
  let size = startSize;
  do {
    context.font = `${weight} ${size}px system-ui, sans-serif`;
    if (context.measureText(String(text)).width <= maxWidth) break;
    size -= 2;
  } while (size > minSize);
  return size;
}

function truncateCanvasText(context, text, maxWidth) {
  const value = String(text || '');
  if (context.measureText(value).width <= maxWidth) return value;
  let shortened = value;
  while (shortened.length > 1 && context.measureText(`${shortened}…`).width > maxWidth) shortened = shortened.slice(0, -1);
  return `${shortened}…`;
}

function drawPassportPhotoGuide(context) {
  context.save();
  context.fillStyle = '#132632';
  context.strokeStyle = '#61e7ff88';
  context.lineWidth = 4;
  context.setLineDash([14, 12]);
  context.beginPath();
  context.roundRect(630, 62, 380, 275, 30);
  context.fill();
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = '#61e7ff1f';
  context.beginPath();
  context.arc(910, 120, 130, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#91a4af';
  context.font = '850 17px system-ui, sans-serif';
  context.fillText('OPTIONAL PHOTO · PREVIEW ONLY', 676, 284);
  context.restore();
}

function completionTimestamp(pack) {
  const value = packProgress(pack).completedAt;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function buildPassportPoster(options = {}) {
  const badges = achievements();
  const unlockedBadges = badges.filter(badge => badge.unlocked);
  const completedPacks = packs.filter(hasCompleted).sort((a, b) => completionTimestamp(b) - completionTimestamp(a));
  const towns = new Set(completedPacks.map(pack => pack.town));
  const discoveries = packs.reduce((total, pack) => total + discoveryCount(pack), 0);
  const collections = [...new Set(packs.flatMap(pack => pack.collections))].slice(0, 5);
  const points = explorerPointsTotal(badges);
  const message = String(options.message || '').trim();
  const datedBadge = badge => {
    const savedDate = Date.parse(profile.achievementDates[badge.id] || '');
    return Number.isFinite(savedDate) ? savedDate : badges.indexOf(badge) + 1;
  };
  const featuredBadge = unlockedBadges.length
    ? [...unlockedBadges].sort((a, b) => datedBadge(b) - datedBadge(a))[0]
    : badges[0];
  const canvas = document.createElement('canvas');
  canvas.width = POSTCARD_WIDTH;
  canvas.height = POSTCARD_HEIGHT;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#162c3c');
  gradient.addColorStop(0.52, '#0b1821');
  gradient.addColorStop(1, '#071016');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const topStripe = context.createLinearGradient(0, 0, canvas.width, 0);
  topStripe.addColorStop(0, '#61e7ff');
  topStripe.addColorStop(0.52, '#c8ff5a');
  topStripe.addColorStop(1, '#ffb21f');
  context.fillStyle = topStripe;
  context.fillRect(0, 0, canvas.width, 24);
  context.globalAlpha = 0.09;
  context.fillStyle = '#61e7ff';
  context.beginPath();
  context.arc(960, 510, 380, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#c8ff5a';
  context.beginPath();
  context.arc(100, 1140, 320, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
  try {
    const logo = await loadCanvasImage('assets/day-tripping-quiz-icon-512.png');
    context.drawImage(logo, 64, 54, 248, 248);
  } catch {}
  context.fillStyle = '#c8ff5a';
  context.beginPath();
  context.roundRect(348, 84, 240, 60, 30);
  context.fill();
  context.fillStyle = '#101820';
  context.font = '950 19px system-ui, sans-serif';
  context.fillText('EXPLORER PASSPORT', 372, 122);
  context.fillStyle = '#61e7ff';
  context.font = '950 22px system-ui, sans-serif';
  context.fillText('MY DAY TRIPPING RECORD', 72, 398);
  context.fillStyle = '#fffaf0';
  context.font = '950 67px system-ui, sans-serif';
  context.fillText('ADVENTURE PASSPORT', 68, 475);
  context.fillStyle = '#91a0ab';
  context.font = '850 19px system-ui, sans-serif';
  context.fillText('EXPLORER POINTS', 72, 526);
  context.fillStyle = '#c8ff5a';
  const pointsText = formatPoints(points);
  setFittedCanvasFont(context, pointsText, 510, 76, 44);
  context.fillText(pointsText, 68, 608);
  context.save();
  context.translate(828, 557);
  context.rotate(0.025);
  context.fillStyle = featuredBadge?.unlocked ? '#ffb21f' : '#61e7ff';
  context.beginPath();
  context.roundRect(-178, -56, 356, 112, 29);
  context.fill();
  context.fillStyle = '#111820';
  context.font = '950 34px system-ui, sans-serif';
  context.fillText(featuredBadge?.icon || '◇', -150, 10);
  context.font = '950 12px system-ui, sans-serif';
  context.fillText(featuredBadge?.unlocked ? 'LATEST ACHIEVEMENT' : 'NEXT ACHIEVEMENT', -100, -16);
  context.font = '950 22px system-ui, sans-serif';
  context.fillText(truncateCanvasText(context, featuredBadge?.name || 'First Points', 238), -100, 18);
  context.restore();
  context.fillStyle = '#111f29';
  context.strokeStyle = '#ffffff22';
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(64, 654, 952, 174, 36);
  context.fill();
  context.stroke();
  const stats = [
    ['DISCOVERIES', discoveries, '#61e7ff'],
    ['ROUTES', completedPacks.length, '#c8ff5a'],
    ['TOWNS', towns.size, '#ffb21f'],
    ['BADGES', unlockedBadges.length, '#f4a8d4']
  ];
  stats.forEach(([label, value, accent], index) => {
    const x = 98 + index * 232;
    context.fillStyle = accent;
    context.font = '900 17px system-ui, sans-serif';
    context.fillText(label, x, 710);
    context.fillStyle = '#fffaf0';
    setFittedCanvasFont(context, formatPoints(value), 175, 52, 34);
    context.fillText(formatPoints(value), x, 784);
  });
  context.fillStyle = '#61e7ff';
  context.font = '950 18px system-ui, sans-serif';
  context.fillText('COLLECTION PROGRESS', 72, 875);
  const collectionGap = 12;
  const collectionWidth = (936 - collectionGap * Math.max(0, collections.length - 1)) / Math.max(1, collections.length);
  collections.forEach((collection, index) => {
    const total = packs.filter(pack => pack.collections.includes(collection)).length;
    const found = completedPacks.filter(pack => pack.collections.includes(collection)).length;
    const x = 72 + index * (collectionWidth + collectionGap);
    context.fillStyle = found === total && total ? '#294326' : found ? '#173846' : '#13202a';
    context.strokeStyle = found === total && total ? '#c8ff5a88' : found ? '#61e7ff66' : '#ffffff18';
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(x, 898, collectionWidth, 82, 22);
    context.fill();
    context.stroke();
    context.fillStyle = '#fffaf0';
    setFittedCanvasFont(context, collection, collectionWidth - 24, 16, 11, 850);
    context.fillText(truncateCanvasText(context, collection, collectionWidth - 24), x + 12, 932);
    context.fillStyle = found === total && total ? '#c8ff5a' : '#91a0ab';
    context.font = '900 17px system-ui, sans-serif';
    context.fillText(`${found}/${total}`, x + 12, 963);
  });
  context.fillStyle = '#ffb21f';
  context.font = '950 18px system-ui, sans-serif';
  context.fillText('RECENT PASSPORT STAMPS', 72, 1030);
  const recentPacks = completedPacks.slice(0, 3);
  if (recentPacks.length) {
    recentPacks.forEach((pack, index) => {
      const x = 70 + index * 320;
      const accent = colour(pack);
      const state = packProgress(pack);
      const initials = String(pack.display_name || pack.town || '?').split(/[\s-]+/).map(word => word[0]).join('').slice(0, 3).toUpperCase();
      context.fillStyle = '#111e27';
      context.strokeStyle = `${accent}88`;
      context.lineWidth = 3;
      context.beginPath();
      context.roundRect(x, 1052, 300, 118, 28);
      context.fill();
      context.stroke();
      context.fillStyle = `${accent}22`;
      context.strokeStyle = accent;
      context.beginPath();
      context.roundRect(x + 16, 1069, 78, 82, 24);
      context.fill();
      context.stroke();
      context.fillStyle = accent;
      context.font = '950 28px system-ui, sans-serif';
      context.fillText(initials, x + 31, 1119);
      context.fillStyle = '#fffaf0';
      context.font = '950 19px system-ui, sans-serif';
      context.fillText(truncateCanvasText(context, pack.display_name, 177), x + 108, 1093);
      context.fillStyle = '#91a0ab';
      context.font = '750 13px system-ui, sans-serif';
      context.fillText(truncateCanvasText(context, pack.route_name, 177), x + 108, 1120);
      context.fillStyle = accent;
      context.font = '900 14px system-ui, sans-serif';
      context.fillText(`${formatPoints(Math.max(Number(state.bestScore) || 0, displayScore(pack)))} PTS`, x + 108, 1147);
    });
  } else {
    context.fillStyle = '#111e27';
    context.strokeStyle = '#ffffff22';
    context.beginPath();
    context.roundRect(70, 1052, 940, 118, 28);
    context.fill();
    context.stroke();
    context.fillStyle = '#61e7ff';
    context.font = '950 28px system-ui, sans-serif';
    context.fillText('◇ YOUR FIRST STAMP IS WAITING', 105, 1125);
  }
  if (message) {
    context.fillStyle = '#fffaf0';
    context.font = '750 25px system-ui, sans-serif';
    wrapCanvasText(context, `“${message}”`, 72, 1222, 930, 31, 2);
  } else {
    context.fillStyle = '#a8b6bf';
    context.font = '900 20px system-ui, sans-serif';
    context.fillText('GO SOMEWHERE · NOTICE EVERYTHING · ✦', 72, 1235);
  }
  context.fillStyle = '#ffb21f';
  context.font = '950 27px system-ui, sans-serif';
  context.fillText('DAY TRIPPING QUIZ', 72, 1310);
  context.fillStyle = '#91a0ab';
  context.font = '800 18px system-ui, sans-serif';
  context.fillText(`${towns.size} TOWNS · ${completedPacks.length} ROUTES · ${unlockedBadges.length} BADGES`, 744, 1310);
  const cleanCanvas = copyPostcardCanvas(canvas);
  const staticCanvas = copyPostcardCanvas(canvas);
  let photoImage = options.photoImage || null;
  if (options.photoUrl) {
    photoImage ||= await loadCanvasImage(options.photoUrl);
    drawCanvasCover(context, photoImage, 630, 62, 380, 275, '#61e7ff', {
      x: options.photoX,
      y: options.photoY,
      zoom: options.photoZoom
    });
  } else {
    // This guide helps in the editor, but never becomes part of the exported image.
    drawPassportPhotoGuide(context);
  }
  const exportCanvas = options.photoUrl ? canvas : cleanCanvas;
  const blob = await new Promise(resolve => exportCanvas.toBlob(resolve, 'image/png'));
  if (!blob) throw Error('Passport poster could not be created');
  const fileName = 'day-tripping-explorer-passport.png';
  const file = typeof File === 'function' ? new File([blob], fileName, { type: 'image/png' }) : null;
  return {
    canvas,
    staticCanvas,
    photoImage,
    blob,
    file,
    fileName,
    shareTitle: 'My Day Tripping Quiz passport',
    shareText: message || `My explorer passport: ${formatPoints(points)} points across ${towns.size} ${towns.size === 1 ? 'town' : 'towns'}.`
  };
}

function downloadCompletionPostcard(blob, fileName) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function exportCompletionPostcard(mode) {
  if (!postcardEditorState) return;
  const { pack, message, rendered, kind } = postcardEditorState;
  const noun = kind === 'passport' ? 'passport' : 'postcard';
  if (!rendered) return toast(`Your ${noun} is still being prepared.`);
  const shareButton = $('#sharePostcard');
  const downloadButton = $('#downloadPostcard');
  shareButton.disabled = true;
  downloadButton.disabled = true;
  const originalShareText = shareButton.textContent;
  const originalDownloadText = downloadButton.textContent;
  if (mode === 'share') shareButton.textContent = `Making ${noun}…`;
  else downloadButton.textContent = `Making ${kind === 'passport' ? 'poster' : 'postcard'}…`;
  try {
    if (mode === 'share' && navigator.share) {
      const shareData = {
        title: rendered.shareTitle || `I completed ${pack.route_name}`,
        text: rendered.shareText || message.trim() || 'My Day Tripping Quiz adventure is complete!'
      };
      const canShareFile = Boolean(rendered.file) && (
        typeof navigator.canShare !== 'function' || navigator.canShare({ files: [rendered.file] })
      );
      if (canShareFile) shareData.files = [rendered.file];
      await navigator.share(shareData);
      if (rendered.file && !canShareFile) {
        downloadCompletionPostcard(rendered.blob, rendered.fileName);
        toast(`This browser opened sharing without image support, so the ${noun} was downloaded for you to attach.`);
      }
      closePostcardEditor();
    } else {
      downloadCompletionPostcard(rendered.blob, rendered.fileName);
      toast(mode === 'share'
        ? `Sharing is not available here, so your ${noun} was downloaded.`
        : kind === 'passport' ? 'Passport poster downloaded.' : 'Completion postcard downloaded.');
    }
  } catch (error) {
    if (error?.name !== 'AbortError') toast(`Could not make the ${noun} on this browser.`);
  } finally {
    shareButton.disabled = false;
    downloadButton.disabled = false;
    shareButton.textContent = originalShareText;
    downloadButton.textContent = originalDownloadText;
  }
}

function playDiscoveryFeedback(skip) {
  if (skip) return;
  if (profile.vibration && navigator.vibrate) navigator.vibrate([35, 35, 75]);
  if (!profile.sound) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const audio = new AudioContextClass();
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const start = audio.currentTime + index * 0.1;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.3);
    });
    setTimeout(() => audio.close(), 800);
  } catch {}
}

function renderCompletionMap(pack) {
  setTimeout(() => {
    destroyCompletionMap();
    const coordinates = pack.stops.map(stop => [stop.Target_Lat, stop.Target_Long]);
    detailMap = L.map('completionMap', { zoomControl: true, scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(detailMap);
    L.polyline(coordinates, { color: colour(pack), weight: 5, opacity: 0.8, dashArray: '10 8' }).addTo(detailMap);
    coordinates.forEach((coordinate, index) => {
      L.marker(coordinate, { icon: numberedIcon(index + 1) }).addTo(detailMap).bindPopup(`<b>Stop ${index + 1}</b><br>${esc(pack.stops[index].Stop_Name)}`);
    });
    detailMap.fitBounds(L.latLngBounds(coordinates).pad(0.18));
  }, 50);
}

function destroyCompletionMap() {
  if (!detailMap) return;
  detailMap.remove();
  detailMap = null;
}

function adventureTitle(state) {
  const mode = state.lastRunMode || state.runMode;
  if (mode === 'daily') return 'DAILY LEGEND';
  if (mode === 'surprise') return 'FORTUNE FAVOURS THE CURIOUS';
  if (Number(state.curiosityBonuses) > 0 && Number(state.curiosityBonuses) >= currentPack?.stops?.length) return 'DETAIL HUNTER';
  if (Number(state.hintsUsed) === 0 && Number(state.skipped) === 0) return 'EAGLE-EYED EXPLORER';
  if (Number(state.skipped) === 0) return 'STORY SEEKER';
  return 'ADVENTURE FINISHER';
}

function scoreBreakdownRows(state) {
  const breakdown = { ...emptyScoreBreakdown(), ...(state.scoreBreakdown || {}) };
  const rows = [
    ['Landmark discoveries', breakdown.landmarks],
    ['Hint deductions', -breakdown.hintPenalty],
    ['Sharp Eyes bonuses', breakdown.sharpEyes],
    ['Photo and field-note discoveries', breakdown.curiosity],
    ['Route complete', breakdown.completion],
    ['No stops skipped', breakdown.noSkip],
    ['Hint-free route', breakdown.noHintRoute],
    ['First completion', breakdown.firstCompletion],
    [state.lastRunMode === 'daily' || state.runMode === 'daily' ? 'Daily Double' : 'Surprise Me bonus', breakdown.modeBonus]
  ].filter(([, value]) => Number(value) !== 0);
  const accounted = rows.reduce((total, [, value]) => total + Number(value), 0);
  const unaccounted = Math.round((Number(state.score) || 0) - accounted);
  if (unaccounted > 0) rows.unshift(['Earlier discoveries', unaccounted]);
  return rows;
}

function scoreBreakdownHtml(state) {
  return `<section class="score-receipt"><div class="section-heading"><div><span class="eyebrow">HOW YOU EARNED IT</span><h2>Adventure score</h2></div></div><div>${scoreBreakdownRows(state).map(([label, points]) => `<p><span>${esc(label)}</span><b class="${points < 0 ? 'deduction' : ''}">${points > 0 ? '+' : '−'}${formatPoints(Math.abs(points))}</b></p>`).join('')}</div></section>`;
}

function startGame(pack) {
  destroyCompletionMap();
  debugMode = false;
  debugStop = null;
  stuckTapTimes = [];
  if (stuckTapTimer) clearTimeout(stuckTapTimer);
  stuckTapTimer = null;
  currentPack = pack;
  applyRouteTheme(pack);
  const existing = packProgress(pack);
  const continuingAdventure = isActiveAdventure(pack);
  if (!continuingAdventure) clearAdventurePhotos();
  if (existing.completed) {
    progress[pack.pack_id] = {
      active: true,
      stop: 0,
      completed: false,
      everCompleted: true,
      score: 0,
      baseScore: 0,
      bestScore: Math.max(Number(existing.bestScore) || 0, Number(existing.score) || 0),
      bestBaseScore: Math.max(Number(existing.bestBaseScore) || 0, Number(existing.baseScore) || 0),
      perfectStops: Number(existing.perfectStops) || 0,
      perfectCompletions: Number(existing.perfectCompletions) || 0,
      curiosityFinds: Number(existing.curiosityFinds) || 0,
      photoFinds: Number(existing.photoFinds) || 0,
      noteFinds: Number(existing.noteFinds) || 0,
      lastElapsedSeconds: Number(existing.lastElapsedSeconds) || Number(existing.elapsedSeconds) || 0,
      bestElapsedSeconds: Number(existing.bestElapsedSeconds) || Number(existing.elapsedSeconds) || 0,
      skipped: 0,
      hintsUsed: 0,
      completions: Number(existing.completions) || 1,
      scoreVersion: SCORE_VERSION,
      scoreBreakdown: emptyScoreBreakdown()
    };
  }
  const state = packProgress(pack);
  if (!continuingAdventure || !Number(state.startedAt)) {
    state.startedAt = Date.now();
    delete state.completedAt;
    delete state.elapsedSeconds;
  }
  if (!continuingAdventure) {
    state.score = 0;
    state.baseScore = 0;
    state.skipped = 0;
    state.hintsUsed = 0;
    state.curiosityBonuses = 0;
    state.scoreVersion = SCORE_VERSION;
    state.scoreBreakdown = emptyScoreBreakdown();
    const today = todayKey();
    const canClaimDaily = selectedAsDaily
      && selectedDailyDate === today
      && !profile.dailyDates.includes(today);
    state.runMode = canClaimDaily ? 'daily' : selectedAsSurprise ? 'surprise' : 'standard';
    if (canClaimDaily) state.dailyRunDate = today;
    else delete state.dailyRunDate;
    if (selectedAsDaily && !canClaimDaily && profile.dailyDates.includes(today)) {
      toast('Today\'s Daily Double is already in your passport. This run uses standard scoring.');
    }
  }
  state.active = true;
  selectedAsDaily = state.runMode === 'daily';
  selectedAsSurprise = state.runMode === 'surprise';
  progress[pack.pack_id] = state;
  save();
  currentStop = Number(packProgress(pack).stop) || 0;
  renderGame();
}

function renderGame(options = {}) {
  pendingDiscovery = null;
  currentCollection = null;
  currentHints = Math.max(0, Math.min(2, Number(options.hints) || 0));
  showOnly('gameView');
  const pack = currentPack;
  applyRouteTheme(pack);
  const stop = pack.stops[currentStop];
  const state = packProgress(pack);
  if (!stop) {
    const score = Number(state.score) || 0;
    const elapsedTime = formatAdventureTime(state.elapsedSeconds);
    const badges = achievements();
    const unlocked = badges.filter(achievement => achievement.unlocked);
    const explorerTotal = explorerPointsTotal(badges);
    const recommendations = recommendationsFor(pack);
    const streak = dailyStreak();
    $('#gameContent').innerHTML = `<div class="game-shell completion-screen">
      <span class="eyebrow">${esc(adventureTitle(state))}</span><h1>${esc(pack.display_name)} conquered!</h1><p>You uncovered ${pack.stops.length} landmarks and their stories.</p>
      ${state.lastDailyDate ? `<div class="daily-complete"><span>☀</span><div><b>Daily adventure complete</b><small>${streak.current > 1 ? `${streak.current}-day streak — keep it going tomorrow.` : 'Your daily streak has begun.'}</small></div></div>` : ''}
      ${(state.lastRunMode || state.runMode) === 'surprise' ? '<div class="surprise-complete"><span>⚄</span><div><b>Surprise accepted</b><small>Your completed score includes the 20% Lucky Dip bonus.</small></div></div>' : ''}
      <div class="finish-score"><span>Adventure score</span><b>✦ ${formatPoints(score)}</b><small>Best: ${formatPoints(displayScore(pack))} points · Explorer total: ${formatPoints(explorerTotal)}</small>${elapsedTime ? `<div class="finish-quiet-stats"><span>${pack.stops.length} stops</span><span>${pack.route_distance_km} km</span><span>Time · ${esc(elapsedTime)}</span></div>` : ''}</div>
      ${scoreBreakdownHtml(state)}
      <div class="route-map-head"><div><span class="eyebrow">YOUR ROUTE</span><h2>Stops at a glance</h2></div><span class="pill">Unlocked</span></div>
      <div id="completionMap" aria-label="Completed route map"></div>
      <ol class="route-recap-list">${pack.stops.map((item, index) => `<li><span>${index + 1}</span><b>${esc(item.Stop_Name)}</b></li>`).join('')}</ol>
      <h2>Your achievements</h2><p class="muted">One-time achievement awards contribute ${formatPoints(achievementPointsTotal(badges))} points to your Explorer total.</p><div class="achievement-grid">${unlocked.map(achievementCard).join('')}</div>
      <button id="shareCompletion" class="postcard-btn"><span>▣</span><div><b>Personalise my completion postcard</b><small>Add an optional photo and message before sharing</small></div></button>
      ${recommendations.length ? `<section class="completion-next"><span class="eyebrow">KEEP EXPLORING</span><h2>Two adventures nearby</h2><p>Carry the momentum into another town when you are ready.</p><div class="route-grid preview-grid">${recommendations.map(candidate => routeCard(candidate)).join('')}</div></section>` : ''}
      <button class="primary" data-home>Back to adventures</button>
    </div>`;
    bindNavigationButtons();
    $('#shareCompletion').onclick = () => openPostcardEditor(pack, score);
    wireCards();
    renderCompletionMap(pack);
    return;
  }
  const modeBadge = state.runMode === 'daily'
    ? '<span class="daily-run-badge">×2 Daily Double</span>'
    : state.runMode === 'surprise'
      ? '<span class="surprise-run-badge">+20% Surprise Me</span>'
      : '';
  $('#gameContent').innerHTML = `<div class="game-shell"><div class="game-top"><button class="back-btn" data-home>×</button><span>Stop ${currentStop + 1} of ${pack.stops.length}</span><b class="live-score">✦ ${formatPoints(state.score)}</b></div><div class="progress"><i style="width:${(currentStop / pack.stops.length) * 100}%"></i></div>${modeBadge ? `<div class="game-meta-row">${modeBadge}</div>` : ''}<span class="eyebrow">CRYPTIC CLUE</span><div class="clue-card"><h1>${esc(stop.Cryptic_Clue)}</h1><div id="hints"></div></div><div id="guide">${scannerPanel()}</div><div class="game-actions"><button id="hintBtn" class="secondary">Reveal a hint <small>−100 points</small></button><button id="checkBtn" class="primary scan-button"><span>⌖</span> Scan my location</button><button id="stuckBtn" class="secondary stuck-button">I’m stuck</button></div></div>`;
  bindNavigationButtons();
  if (debugMode) renderDebugPanel(stop, debugDistance);
  if (currentHints > 0) {
    $('#hints').innerHTML = [stop.Hint_1, stop.Hint_2].slice(0, currentHints).map(hint => `<div class="hint">${esc(hint)}</div>`).join('');
    if (currentHints === 1) $('#hintBtn').innerHTML = 'Reveal the second hint <small>−150 points</small>';
    if (currentHints >= 2) $('#hintBtn').classList.add('hidden');
  }
  $('#hintBtn').onclick = () => {
    currentHints = Math.min(2, currentHints + 1);
    $('#hints').innerHTML = [stop.Hint_1, stop.Hint_2].slice(0, currentHints).map(hint => `<div class="hint">${esc(hint)}</div>`).join('');
    if (currentHints === 1) $('#hintBtn').innerHTML = 'Reveal the second hint <small>−150 points</small>';
    if (currentHints >= 2) $('#hintBtn').classList.add('hidden');
    rememberView('gameView');
  };
  $('#checkBtn').onclick = () => checkLocation(stop);
  $('#stuckBtn').onclick = () => handleStuckTap(stop);
}

function checkLocation(stop) {
  if (!isSecureContext) return toast('Location needs HTTPS. Open the GitHub Pages address.');
  if (!navigator.geolocation) return toast('Location is not available on this device.');
  stopWatch();
  debugMode = false;
  debugStop = null;
  lastScanReading = null;
  $('#guide').innerHTML = scannerPanel('scanning');
  navigator.geolocation.getCurrentPosition(position => evaluateArrival(stop, position), () => {
    $('#guide').innerHTML = `<section class="gps-scanner error"><div class="scanner-copy"><span class="eyebrow">SIGNAL LOST</span><b>We could not read your location. Check browser permission and try another scan.</b></div></section>`;
    toast('Could not get location. Check permission.');
  }, { enableHighAccuracy: true, timeout: 18000, maximumAge: 0 });
}

function effectiveRadius(base, accuracy) {
  return base + Math.min(Math.max(accuracy - 10, 0) * 0.75, 45);
}

function qualityFor(accuracy) {
  if (accuracy <= 20) return ['good', 'Good'];
  if (accuracy <= 45) return ['fair', 'Fair'];
  return ['poor', 'Uncertain'];
}

function setUnit(unit) {
  profile.unit = unit === 'mi' ? 'mi' : 'km';
  saveProfile();
  $$('[data-unit]').forEach(button => {
    const active = button.dataset.unit === profile.unit;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  });
  if (debugMode && debugStop) renderDebugPanel(debugStop, debugDistance);
  else if (latestGuideReading) renderGuideReading(latestGuideReading.stop, latestGuideReading.position);
  else if (lastScanReading) renderScanResult(lastScanReading.stop, lastScanReading.position);
  if (pendingArrival) showArrivalConfirm(pendingArrival.stop, pendingArrival.distance, pendingArrival.accuracy, pendingArrival.base, pendingArrival.debug);
  renderSettings();
}

function formatDistance(metres) {
  metres = Math.max(0, Number(metres) || 0);
  if (profile.unit === 'mi') {
    const feet = metres * 3.28084;
    if (feet < 1000) return `${Math.round(feet)} ft`;
    const miles = metres / 1609.344;
    return `${miles.toFixed(miles < 10 ? 2 : 1)} mi`;
  }
  if (metres < 1000) return `${Math.round(metres)} m`;
  const kilometres = metres / 1000;
  return `${kilometres.toFixed(kilometres < 10 ? 1 : 0)} km`;
}

function comparisonFact(metres) {
  metres = Math.max(0, Number(metres) || 0);
  if (metres < 0.02) {
    return '<p><span>Right on target</span>You are closer than the width of a coin. The landmark should be right in front of you.</p><p><span>Explorer translation</span>Zero buses, zero whales, zero excuses — look up and claim the discovery.</p>';
  }
  const catalogue = distanceComparisons.length ? distanceComparisons : [];
  const closenessLimit = Math.log(1.22);
  const closest = catalogue
    .map(item => ({ item, score: Math.abs(Math.log(metres / Number(item.metres))) }))
    .sort((a, b) => a.score - b.score)[0];
  const closeItem = closest && closest.score <= closenessLimit ? closest.item : null;
  const scaled = catalogue.filter(item => {
    const count = metres / Number(item.metres);
    return item.id !== closeItem?.id && count >= 1.6 && count <= 5000;
  });
  const seed = comparisonSeed(metres);
  const firstPool = scaled.filter(item => {
    const count = metres / Number(item.metres);
    return count >= 2 && count <= 40;
  });
  const first = pickComparison(firstPool.length ? firstPool : scaled, seed);
  const secondPool = scaled.filter(item => item.id !== first?.id && item.category !== first?.category);
  const second = pickComparison(secondPool.length ? secondPool : scaled.filter(item => item.id !== first?.id), seed + 7919);
  const choices = closeItem ? [closeItem, first || second] : [first, second].filter(Boolean);
  const cards = choices.slice(0, 2).map((item, index) => {
    if (item.id === closeItem?.id) {
      const nearTemplates = [
        `That’s about ${item.near}.`,
        `Your distance is almost exactly ${item.near}.`,
        `That gap is a close match for ${item.near}.`
      ];
      return `<p><span>${item.emoji || '✦'} Almost an exact match</span>${esc(nearTemplates[(seed + index) % nearTemplates.length])}</p>`;
    }
    const count = metres / Number(item.metres);
    const amount = `${formatComparisonCount(count)} ${count < 1.5 ? item.singular : item.plural}`;
    const scaledTemplates = [
      `Picture ${amount} ${item.action}.`,
      `That is ${amount} ${item.action}.`,
      `Explorer maths: ${amount}, ${item.action}.`,
      `You could measure it as ${amount} ${item.action}.`
    ];
    return `<p><span>${item.emoji || '✦'} Another way to picture it</span>${esc(scaledTemplates[(seed + index * 13) % scaledTemplates.length])}</p>`;
  }).join('');
  const lightSeconds = metres / 299792458;
  const lightMicroseconds = Math.max(1, Math.round(lightSeconds * 1000000));
  const lightMilliseconds = Math.max(1, Math.round(lightSeconds * 1000));
  const lightTime = lightSeconds < 0.001
    ? `${lightMicroseconds} microsecond${lightMicroseconds === 1 ? '' : 's'}`
    : lightSeconds < 1
      ? `${lightMilliseconds} millisecond${lightMilliseconds === 1 ? '' : 's'}`
      : `${lightSeconds.toFixed(1)} seconds`;
  return `${cards || '<p><span>Wild distance</span>This one is beyond anything in the comparison cabinet.</p>'}<small class="light-fact">⚡ Light would cover this distance in about ${lightTime}.</small>`;
}

function comparisonSeed(metres) {
  const text = `${Math.round(metres / 5)}-${currentPack?.pack_id || 'route'}-${currentStop}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function pickComparison(items, seed) {
  return items.length ? items[seed % items.length] : null;
}

function formatComparisonCount(count) {
  if (count < 10) return Number(count.toFixed(1)).toLocaleString('en-GB');
  if (count < 1000) return Math.round(count).toLocaleString('en-GB');
  if (count < 1000000) return `${Number((count / 1000).toFixed(1)).toLocaleString('en-GB')} thousand`;
  return `${Number((count / 1000000).toFixed(1)).toLocaleString('en-GB')} million`;
}

function scannerPanel(state = 'idle', closeable = false) {
  const copy = state === 'scanning'
    ? ['LOCKING ON', 'Finding your best GPS signal…']
    : ['READY TO SCAN', 'Step outside, look around, then scan when you think you have solved the clue.'];
  return `<section class="gps-scanner ${state} ${closeable ? 'guidance' : ''}">
    ${closeable ? '<button id="closeGuidePanel" class="guide-close" aria-label="Close live guidance">×</button>' : ''}
    <div class="scanner-visual"><i></i><i></i><i></i><span>⌖</span></div>
    <div class="scanner-copy"><span class="eyebrow">${copy[0]}</span><b>${copy[1]}</b></div>
  </section>`;
}

function renderScanResult(stop, position) {
  lastScanReading = { stop, position };
  const accuracy = Math.max(0, Number(position.coords.accuracy) || 0);
  const metres = distance([position.coords.latitude, position.coords.longitude], [stop.Target_Lat, stop.Target_Long]) * 1000;
  const base = Number(stop.Win_Radius_m) || 35;
  const [qualityClass, qualityLabel] = qualityFor(accuracy);
  const proximity = Math.max(4, Math.min(100, (effectiveRadius(base, accuracy) / Math.max(metres, 1)) * 100));
  $('#guide').innerHTML = `<section class="gps-scanner result">
    <div class="scanner-result-top"><span class="gps-quality ${qualityClass}">${qualityLabel} GPS · ±${formatDistance(accuracy)}</span><span>Target scan</span></div>
    <div class="distance-display"><b>${formatDistance(metres)}</b><span>from the discovery zone</span></div>
    <div class="proximity-track"><i style="width:${proximity}%"></i></div>
    <div class="distance-facts">${comparisonFact(metres)}</div>
    <p class="scanner-prompt">Keep exploring and scan again when the clue matches what you can see.</p>
  </section>`;
}

function evaluateArrival(stop, position) {
  const accuracy = Math.max(0, Number(position.coords.accuracy) || 0);
  const metres = distance([position.coords.latitude, position.coords.longitude], [stop.Target_Lat, stop.Target_Long]) * 1000;
  const base = Number(stop.Win_Radius_m) || 35;
  const effective = effectiveRadius(base, accuracy);
  if (metres <= effective) {
    showArrivalConfirm(stop, metres, accuracy, base);
    return true;
  }
  renderScanResult(stop, position);
  return false;
}

function showArrivalConfirm(stop, metres, accuracy, base, debug = false) {
  pendingArrival = { stop, distance: metres, accuracy, base, debug };
  $('#arrivalEyebrow').textContent = debug ? 'SIMULATED ARRIVAL' : metres <= base ? 'YOU LOOK CLOSE' : 'GPS IS UNCERTAIN';
  $('#arrivalReading').innerHTML = `<div><span>${debug ? 'Test distance' : 'Measured distance'}</span><b>${formatDistance(metres)}</b></div><div><span>${debug ? 'Test accuracy' : 'Phone accuracy'}</span><b>±${formatDistance(accuracy)}</b></div>`;
  $('#arrivalMessage').innerHTML = metres <= base
    ? `Your phone places you inside the normal ${formatDistance(base)} discovery area. <strong>Can you actually see the building or landmark described by the clue?</strong>`
    : 'Your GPS reading is less precise, so Day Tripping Quiz is allowing a little extra room. <strong>Only submit if you can genuinely see the building or landmark in question.</strong>';
  $('#arrivalModal').classList.remove('hidden');
}

function closeArrival() {
  pendingArrival = null;
  $('#arrivalModal').classList.add('hidden');
}

function handleStuckTap(stop) {
  animateStuckButton();
  if ($('#guide .guide-panel, #guide .gps-scanner.guidance, #guide .debug-panel')) {
    closeGuidePanel();
    return;
  }
  const now = Date.now();
  stuckTapTimes = stuckTapTimes.filter(time => now - time <= 2200);
  stuckTapTimes.push(now);
  if (stuckTapTimer) clearTimeout(stuckTapTimer);
  if (stuckTapTimes.length >= 5) {
    stuckTapTimes = [];
    stuckTapTimer = null;
    debugMode = true;
    debugStop = stop;
    debugDistance = 100;
    stopWatch();
    renderDebugPanel(stop, debugDistance);
    toast('Test mode unlocked');
    return;
  }
  stuckTapTimer = setTimeout(() => {
    stuckTapTimes = [];
    stuckTapTimer = null;
    stuck(stop);
  }, 850);
}

function animateStuckButton() {
  const button = $('#stuckBtn');
  if (!button) return;
  button.classList.remove('tap-feedback');
  void button.offsetWidth;
  button.classList.add('tap-feedback');
  setTimeout(() => button.classList.remove('tap-feedback'), 260);
}

function closeGuidePanel() {
  stopWatch();
  debugMode = false;
  debugStop = null;
  stuckTapTimes = [];
  if (stuckTapTimer) clearTimeout(stuckTapTimer);
  stuckTapTimer = null;
  const panel = $('#guide');
  if (panel) panel.innerHTML = scannerPanel();
}

function bindGuideClose() {
  const button = $('#closeGuidePanel');
  if (button) button.onclick = closeGuidePanel;
}

function sliderToMetres(value) {
  value = Math.max(0, Math.min(1000, Number(value) || 0));
  if (value === 0) return 0;
  return Math.exp((value / 1000) * Math.log(5000000));
}

function metresToSlider(metres) {
  metres = Math.max(0, Math.min(5000000, Number(metres) || 0));
  if (metres === 0) return 0;
  return Math.round((Math.log(metres) / Math.log(5000000)) * 1000);
}

function renderDebugPanel(stop, metres = debugDistance, scanned = false) {
  debugMode = true;
  debugStop = stop;
  debugDistance = Math.max(0, Math.min(5000000, Number(metres) || 0));
  $('#guide').innerHTML = `<section class="debug-panel">
    <button id="closeGuidePanel" class="guide-close" aria-label="Close test panel">×</button>
    <div class="debug-head"><span class="debug-badge">TEST MODE</span><span>Hidden location simulator</span></div>
    <h3>Fake your distance</h3>
    <p>Drag from directly on the landmark to 5,000 km away, then run a simulated GPS scan.</p>
    ${scanned ? `<div class="debug-scan-status">Simulated reading: <b>${formatDistance(debugDistance)}</b> away. Move closer to trigger the arrival check.</div>` : ''}
    <output id="debugDistanceValue">${formatDistance(debugDistance)}</output>
    <input id="debugDistanceSlider" type="range" min="0" max="1000" step="1" value="${metresToSlider(debugDistance)}" aria-label="Simulated distance">
    <div class="debug-scale"><span>At target</span><span>5,000 km</span></div>
    <div class="debug-presets">
      <button type="button" data-debug-metres="0">At target</button>
      <button type="button" data-debug-metres="35">35 m</button>
      <button type="button" data-debug-metres="262">London Bridge</button>
      <button type="button" data-debug-metres="1000">1 km</button>
      <button type="button" data-debug-metres="35000">35 km</button>
      <button type="button" data-debug-metres="3862400">Route 66</button>
    </div>
    <div id="debugFacts" class="distance-facts">${comparisonFact(debugDistance)}</div>
    <button id="runDebugScan" class="primary debug-run">Run simulated scan</button>
    <small class="debug-warning">Testing advances local progress exactly like a real location check.</small>
  </section>`;
  const slider = $('#debugDistanceSlider');
  bindGuideClose();
  slider.oninput = () => {
    debugDistance = sliderToMetres(slider.value);
    $('#debugDistanceValue').textContent = formatDistance(debugDistance);
    $('#debugFacts').innerHTML = comparisonFact(debugDistance);
  };
  $$('[data-debug-metres]').forEach(button => {
    button.onclick = () => {
      debugDistance = Number(button.dataset.debugMetres);
      slider.value = metresToSlider(debugDistance);
      $('#debugDistanceValue').textContent = formatDistance(debugDistance);
      $('#debugFacts').innerHTML = comparisonFact(debugDistance);
    };
  });
  $('#runDebugScan').onclick = () => {
    const accuracy = 5;
    const base = Number(stop.Win_Radius_m) || 35;
    if (debugDistance <= effectiveRadius(base, accuracy)) {
      showArrivalConfirm(stop, debugDistance, accuracy, base, true);
    } else {
      renderDebugPanel(stop, debugDistance, true);
    }
  };
}

function stuck(stop) {
  $('#guide').innerHTML = '<div class="guide-panel"><button id="closeGuidePanel" class="guide-close" aria-label="Close help panel">×</button><h3>Need a hand?</h3><div class="game-actions"><button id="guideBtn" class="primary">Guide me in</button><button id="skipBtn" class="secondary">Skip this stop · 0 points</button></div></div>';
  bindGuideClose();
  $('#guideBtn').onclick = () => guide(stop);
  $('#skipBtn').onclick = () => completeStop(stop, true);
}

async function startCompass() {
  if (typeof DeviceOrientationEvent === 'undefined') return false;
  try {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') return false;
    }
    orientationHandler = event => {
      let heading = null;
      if (Number.isFinite(event.webkitCompassHeading)) heading = event.webkitCompassHeading;
      else if (event.absolute && Number.isFinite(event.alpha)) heading = (360 - event.alpha) % 360;
      if (heading === null) return;
      deviceHeading = heading;
      if (latestGuideReading) renderGuideReading(latestGuideReading.stop, latestGuideReading.position);
    };
    window.addEventListener('deviceorientationabsolute', orientationHandler, true);
    window.addEventListener('deviceorientation', orientationHandler, true);
    return true;
  } catch {
    return false;
  }
}

async function guide(stop) {
  if (!navigator.geolocation) return toast('Guidance is not available on this device.');
  stopWatch();
  const session = guideSession;
  await startCompass();
  if (session !== guideSession) return;
  $('#guide').innerHTML = scannerPanel('scanning', true);
  bindGuideClose();
  watchId = navigator.geolocation.watchPosition(position => {
    if (session !== guideSession) return;
    latestGuideReading = { stop, position };
    renderGuideReading(stop, position);
  }, () => toast('Guidance needs location permission.'), { enableHighAccuracy: true, maximumAge: 1000, timeout: 18000 });
}

function renderGuideReading(stop, position) {
  const here = [position.coords.latitude, position.coords.longitude];
  const target = [stop.Target_Lat, stop.Target_Long];
  const metres = distance(here, target) * 1000;
  const targetBearing = bearing(here, target);
  const movementHeading = Number.isFinite(position.coords.heading) ? position.coords.heading : null;
  const heading = deviceHeading ?? movementHeading;
  const arrow = heading === null ? targetBearing : (targetBearing - heading + 360) % 360;
  const accuracy = Math.max(0, Number(position.coords.accuracy) || 0);
  const [qualityClass, qualityLabel] = qualityFor(accuracy);
  $('#guide').innerHTML = `<section class="gps-scanner guidance">
    <button id="closeGuidePanel" class="guide-close" aria-label="Close live guidance">×</button>
    <div class="scanner-result-top"><span class="gps-quality ${qualityClass}">${qualityLabel} GPS · ±${formatDistance(accuracy)}</span><span>Live guidance</span></div>
    <div class="guidance-orbit"><i></i><i></i><div class="guide-arrow" style="transform:rotate(${arrow}deg)">↑</div></div>
    <div class="distance-display"><b>${formatDistance(metres)}</b><span>to the discovery zone</span></div>
    <p class="direction-note">${heading === null ? 'Compass unavailable — the arrow is relative to north.' : 'Hold your phone flat. The arrow turns relative to its top edge.'}</p>
    <div class="distance-facts">${comparisonFact(metres)}</div>
  </section>`;
  bindGuideClose();
  const base = Number(stop.Win_Radius_m) || 35;
  if (metres <= effectiveRadius(base, accuracy)) {
    stopWatch();
    showArrivalConfirm(stop, metres, accuracy, base);
  }
}

function completeStop(stop, skip = false, debug = false) {
  renderDiscoveryScreen(stop, skip, debug);
}

function renderDiscoveryScreen(stop, skip = false, debug = false, restored = false, restoredCuriosity = false, restoredFieldworkType = '') {
  stopWatch();
  let fieldworkType = !skip ? String(restoredFieldworkType || (restoredCuriosity ? 'note' : '')) : '';
  let fieldworkClaimed = Boolean(fieldworkType);
  let award = scoreForStop(currentHints, skip, fieldworkClaimed);
  pendingDiscovery = { stopIndex: currentStop, skip, debug, hints: currentHints, curiosityClaimed: fieldworkClaimed, fieldworkType };
  const sharpEyes = !skip && currentHints === 0
    ? `<span>Sharp Eyes +${formatPoints(SCORING.noHint)}</span>`
    : !skip && currentHints > 0
      ? `<span>Hints −${formatPoints(award.hintPenalty)}</span>`
      : '';
  const fieldworkCard = skip ? '' : `<section id="curiosityCard" class="curiosity-card fieldwork-card ${fieldworkClaimed ? 'claimed' : ''}"><span class="eyebrow">FIELDWORK BONUS · +${formatPoints(SCORING.curiosity)}</span><h2>Bring back one detail</h2><p>${esc(curiosityPrompt(stop))}</p><div id="fieldworkChoices" class="fieldwork-choices ${fieldworkClaimed ? 'hidden' : ''}"><label class="secondary fieldwork-camera"><span>▣ Take a discovery photo</span><input id="fieldworkPhoto" type="file" accept="image/*" capture="environment"></label><button id="openFieldNote" class="secondary">✎ Write a field note</button></div><div id="fieldNotePanel" class="field-note-panel hidden"><label for="fieldNoteText">What did you notice?</label><textarea id="fieldNoteText" maxlength="160" rows="3" placeholder="A date, carving, old sign, material, symbol or tiny detail…"></textarea><div><small id="fieldNoteCount">0/160 · at least 12 characters</small><button id="saveFieldNote" class="secondary" disabled>Save note · +${formatPoints(SCORING.curiosity)}</button></div></div><div id="fieldworkConfirmation" class="fieldwork-confirmation ${fieldworkClaimed ? '' : 'hidden'}"><span>${fieldworkType === 'photo' ? '▣' : '✎'}</span><div><b>${fieldworkType === 'photo' ? 'Discovery photo captured' : 'Field note complete'}</b><small>Well done — you looked beyond the clue. +${formatPoints(SCORING.curiosity)} points</small></div></div><small class="fieldwork-privacy">Photos and note text are never uploaded or saved. Both stay in memory only for this adventure and can join your downloadable adventure postcard.</small></section>`;
  $('#gameContent').innerHTML = `<div class="game-shell discovery-screen ${skip ? '' : 'celebrate'}"><div class="discovery-burst" aria-hidden="true">${'<i></i>'.repeat(12)}<b>✦</b></div><span class="eyebrow">${skip ? 'STOP SKIPPED' : debug ? 'TEST LOCATION FOUND' : 'LOCATION FOUND'}</span><h1>${esc(stop.Stop_Name)}</h1><div id="pointsEarned" class="points-earned ${skip ? 'skipped' : ''}">${skip ? 'No points for this stop' : `+${formatPoints(award.total)} points`}</div><div class="stop-score-chips">${skip ? '' : `<span>Discovery +${formatPoints(SCORING.discovery)}</span>${sharpEyes}`}</div><div class="clue-card"><p>${esc(stop.Unlock_Fact)}</p></div>${fieldworkCard}<button id="nextStop" class="primary">${currentStop + 1 >= currentPack.stops.length ? 'Finish route' : 'Next stop'}</button></div>`;
  rememberView('gameView');
  if (!restored) playDiscoveryFeedback(skip);
  const claimFieldwork = type => {
    if (fieldworkClaimed) return;
    fieldworkClaimed = true;
    fieldworkType = type;
    award = scoreForStop(currentHints, skip, true);
    pendingDiscovery.curiosityClaimed = true;
    pendingDiscovery.fieldworkType = type;
    $('#pointsEarned').textContent = `+${formatPoints(award.total)} points`;
    $('#curiosityCard').classList.add('claimed');
    $('#fieldworkChoices').classList.add('hidden');
    $('#fieldNotePanel').classList.add('hidden');
    $('#fieldworkConfirmation').classList.remove('hidden');
    $('#fieldworkConfirmation').innerHTML = `<span>${type === 'photo' ? '▣' : '✎'}</span><div><b>${type === 'photo' ? 'Discovery photo captured' : 'Field note complete'}</b><small>Well done — you looked beyond the clue. +${formatPoints(SCORING.curiosity)} points</small></div>`;
    rememberView('gameView');
    toast(`Fieldwork bonus: +${formatPoints(SCORING.curiosity)} points`);
  };
  if ($('#fieldworkPhoto')) $('#fieldworkPhoto').onchange = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) {
      event.target.value = '';
      return toast('Choose a photo under 20 MB.');
    }
    event.target.disabled = true;
    $('#nextStop').disabled = true;
    const capturedPackId = currentPack.pack_id;
    const capturedStopIndex = currentStop;
    const url = URL.createObjectURL(file);
    loadCanvasImage(url).then(image => {
      if (currentPack?.pack_id !== capturedPackId || currentStop !== capturedStopIndex || !$('#fieldworkConfirmation')) {
        URL.revokeObjectURL(url);
        return;
      }
      if (adventurePhotos.length >= 6) {
        const oldest = adventurePhotos.shift();
        if (oldest?.url) URL.revokeObjectURL(oldest.url);
      }
      adventurePhotos.push({ url, image, stopName: stop.Stop_Name, stopIndex: currentStop, packId: currentPack.pack_id });
      claimFieldwork('photo');
      $('#nextStop').disabled = false;
    }).catch(() => {
      URL.revokeObjectURL(url);
      event.target.disabled = false;
      event.target.value = '';
      if ($('#nextStop')) $('#nextStop').disabled = false;
      toast('That photo could not be read. Try another.');
    });
  };
  if ($('#openFieldNote')) $('#openFieldNote').onclick = () => {
    $('#fieldNotePanel').classList.remove('hidden');
    $('#fieldNoteText').focus();
  };
  if ($('#fieldNoteText')) $('#fieldNoteText').oninput = event => {
    const length = event.target.value.trim().length;
    $('#fieldNoteCount').textContent = `${event.target.value.length}/160 · ${length < 12 ? 'at least 12 characters' : 'ready to save'}`;
    $('#saveFieldNote').disabled = length < 12;
  };
  if ($('#saveFieldNote')) $('#saveFieldNote').onclick = () => {
    if (fieldworkClaimed) return;
    const noteText = $('#fieldNoteText').value.trim();
    if (noteText.length < 12) return;
    if (adventureNotes.length >= 6) adventureNotes.shift();
    adventureNotes.push({ text: noteText, stopName: stop.Stop_Name, stopIndex: currentStop, packId: currentPack.pack_id });
    claimFieldwork('note');
  };
  $('#nextStop').onclick = () => {
    const before = new Set(achievements().filter(item => item.unlocked).map(item => item.id));
    const state = packProgress(currentPack);
    const breakdown = state.scoreBreakdown ||= emptyScoreBreakdown();
    pendingDiscovery = null;
    state.score = (Number(state.score) || 0) + award.total;
    state.baseScore = (Number(state.baseScore) || 0) + award.total;
    breakdown.landmarks += award.landmarks;
    breakdown.hintPenalty += award.hintPenalty;
    breakdown.sharpEyes += award.sharpEyes;
    breakdown.curiosity += award.curiosity;
    state.hintsUsed = (Number(state.hintsUsed) || 0) + currentHints;
    state.skipped = (Number(state.skipped) || 0) + (skip ? 1 : 0);
    state.curiosityBonuses = (Number(state.curiosityBonuses) || 0) + (fieldworkClaimed ? 1 : 0);
    state.curiosityFinds = (Number(state.curiosityFinds) || 0) + (fieldworkClaimed ? 1 : 0);
    state.photoFinds = (Number(state.photoFinds) || 0) + (fieldworkType === 'photo' ? 1 : 0);
    state.noteFinds = (Number(state.noteFinds) || 0) + (fieldworkType === 'note' ? 1 : 0);
    state.perfectStops = (Number(state.perfectStops) || 0) + (!skip && currentHints === 0 ? 1 : 0);
    currentStop += 1;
    state.stop = currentStop;
    state.active = currentStop < currentPack.stops.length;
    if (currentStop >= currentPack.stops.length) {
      const completedAt = Date.now();
      const startedAt = Number(state.startedAt) || completedAt;
      const firstCompletion = !state.everCompleted;
      const completionBonus = SCORING.completion
        + (Number(state.skipped) === 0 ? SCORING.noSkip : 0)
        + (Number(state.hintsUsed) === 0 ? SCORING.noHintRoute : 0)
        + (firstCompletion ? SCORING.firstCompletion : 0);
      breakdown.completion += SCORING.completion;
      if (Number(state.skipped) === 0) breakdown.noSkip += SCORING.noSkip;
      if (Number(state.hintsUsed) === 0) breakdown.noHintRoute += SCORING.noHintRoute;
      if (firstCompletion) breakdown.firstCompletion += SCORING.firstCompletion;
      state.score += completionBonus;
      state.baseScore = state.score;
      const modeRate = state.runMode === 'daily' ? SCORING.dailyRate : state.runMode === 'surprise' ? SCORING.surpriseRate : 0;
      const modeBonus = Math.round(state.score * modeRate);
      state.score += modeBonus;
      breakdown.modeBonus += modeBonus;
      state.completedAt = completedAt;
      state.elapsedSeconds = Math.max(1, Math.round((completedAt - startedAt) / 1000));
      state.lastElapsedSeconds = state.elapsedSeconds;
      state.bestElapsedSeconds = Number(state.bestElapsedSeconds) > 0
        ? Math.min(Number(state.bestElapsedSeconds), state.elapsedSeconds)
        : state.elapsedSeconds;
      state.active = false;
      state.completed = true;
      state.everCompleted = true;
      state.completions = (Number(state.completions) || 0) + 1;
      state.bestScore = Math.max(Number(state.bestScore) || 0, Number(state.score) || 0);
      state.bestBaseScore = Math.max(Number(state.bestBaseScore) || 0, Number(state.baseScore) || 0);
      state.lastRunMode = state.runMode || 'standard';
      if ((Number(state.hintsUsed) || 0) === 0 && (Number(state.skipped) || 0) === 0) {
        state.perfectCompletions = (Number(state.perfectCompletions) || 0) + 1;
      }
      if (state.dailyRunDate) {
        const dailyDate = state.dailyRunDate;
        const isNewDaily = !profile.dailyDates.includes(dailyDate);
        if (isNewDaily) profile.dailyDates.push(dailyDate);
        state.lastDailyDate = isNewDaily ? dailyDate : null;
        delete state.dailyRunDate;
      } else {
        state.lastDailyDate = null;
      }
      if (state.lastRunMode === 'surprise') profile.surpriseCompletions = (Number(profile.surpriseCompletions) || 0) + 1;
      saveProfile();
    }
    state.scoreVersion = SCORE_VERSION;
    progress[currentPack.pack_id] = state;
    save();
    const newlyUnlocked = achievements().filter(item => item.unlocked && !before.has(item.id));
    if (newlyUnlocked.length) {
      profile.achievementDates ||= {};
      const unlockedAt = new Date().toISOString();
      newlyUnlocked.forEach(item => { profile.achievementDates[item.id] = unlockedAt; });
      saveProfile();
    }
    renderGame();
    if (newlyUnlocked.length) toast(`Achievement unlocked: ${newlyUnlocked[0].name} · +${formatPoints(newlyUnlocked[0].points)} Explorer Points`);
  };
}

function restoreContinue() {
  if (!packs.length || !$('#continueSection')) return;
  const pack = packs.find(isActiveAdventure);
  $('#continueSection').classList.toggle('hidden', !pack);
  if (pack) {
    $('#continueCard').innerHTML = routeCard(pack, 'IN PROGRESS');
    wireCards();
  }
}

function stopWatch() {
  guideSession += 1;
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (orientationHandler) {
    window.removeEventListener('deviceorientationabsolute', orientationHandler, true);
    window.removeEventListener('deviceorientation', orientationHandler, true);
    orientationHandler = null;
  }
  deviceHeading = null;
  latestGuideReading = null;
  lastScanReading = null;
}

function distance(a, b) {
  const radius = 6371;
  const radians = value => value * Math.PI / 180;
  const latitude = radians(b[0] - a[0]);
  const longitude = radians(b[1] - a[1]);
  const value = Math.sin(latitude / 2) ** 2 + Math.cos(radians(a[0])) * Math.cos(radians(b[0])) * Math.sin(longitude / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(value));
}

function bearing(a, b) {
  const fromLatitude = a[0] * Math.PI / 180;
  const toLatitude = b[0] * Math.PI / 180;
  const longitude = (b[1] - a[1]) * Math.PI / 180;
  return (Math.atan2(Math.sin(longitude) * Math.cos(toLatitude), Math.cos(fromLatitude) * Math.sin(toLatitude) - Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitude)) * 180 / Math.PI + 360) % 360;
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  setTimeout(() => $('#toast').classList.remove('show'), 3000);
}

init();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', async () => {
    const controlledAtLoad = Boolean(navigator.serviceWorker.controller);
    let reloadingForUpdate = false;
    if (controlledAtLoad) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadingForUpdate) return;
        reloadingForUpdate = true;
        location.reload();
      });
    }
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js?v=23', { updateViaCache: 'none' });
      const checkForUpdate = () => registration.update().catch(() => {});
      checkForUpdate();
      window.addEventListener('focus', checkForUpdate);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
    } catch {}
  });
}
