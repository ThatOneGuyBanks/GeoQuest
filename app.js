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
let stuckTapTimes = [];
let debugMode = false;
let debugStop = null;
let debugDistance = 100;
let stuckTapTimer = null;
let achievementsExpanded = false;
let featuredExpanded = false;
let nearbyExpanded = false;

const KEY = 'geoquest-progress-v3';
const SAFETY_KEY = 'geoquest-safety-accepted-v1';
const PROFILE_KEY = 'geoquest-profile-v1';
const progress = readProgress();
const profile = readProfile();

function readProgress() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function readProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    return {
      unit: saved.unit === 'mi' ? 'mi' : 'km',
      dailyDates: Array.isArray(saved.dailyDates) ? saved.dailyDates : [],
      achievementDates: saved.achievementDates && typeof saved.achievementDates === 'object' ? saved.achievementDates : {}
    };
  } catch {
    return { unit: 'km', dailyDates: [], achievementDates: {} };
  }
}

function saveProfile() {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
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
      })));
    packs = results.filter(result => result.status === 'fulfilled').map(result => normalise(result.value));
    const comparisonCatalogue = await comparisonRequest;
    distanceComparisons = comparisonCatalogue.comparisons
      .filter(item => Number(item.metres) > 0 && item.singular && item.plural)
      .sort((a, b) => Number(a.metres) - Number(b.metres));
    if (!packs.length) throw Error('No route packs loaded');
    renderAll();
    bind();
    restoreContinue();
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
    author: pack.author || 'GeoQuest',
    recommended_age: pack.recommended_age || 'All ages',
    display_name: pack.display_name || pack.town,
    stops: [...(pack.stops || [])].sort((a, b) => Number(a.Stop_Order) - Number(b.Stop_Order))
  };
}

function bind() {
  $$('[data-home]').forEach(button => button.onclick = showHome);
  $('#acceptSafety').onclick = () => {
    localStorage.setItem(SAFETY_KEY, 'yes');
    $('#safetyModal').classList.add('hidden');
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
  $('#surpriseHero').onclick = surprise;
  $('#locateBtn').onclick = getNearby;
  $('#searchToggle').onclick = () => {
    $('#searchWrap').classList.toggle('hidden');
    $('#searchInput').focus();
  };
  $('#searchClose').onclick = () => $('#searchWrap').classList.add('hidden');
  $('#searchInput').oninput = event => renderBrowse(event.target.value);
  if (!localStorage.getItem(SAFETY_KEY)) $('#safetyModal').classList.remove('hidden');
}

function showOnly(id) {
  ['homeView', 'mapView', 'collectionView', 'detailView', 'gameView']
    .forEach(view => $(`#${view}`).classList.toggle('hidden', view !== id));
  scrollTo(0, 0);
}

function showHome() {
  stopWatch();
  destroyCompletionMap();
  debugMode = false;
  debugStop = null;
  stuckTapTimes = [];
  if (stuckTapTimer) clearTimeout(stuckTapTimer);
  stuckTapTimer = null;
  closeArrival();
  renderExplorerRecord();
  restoreContinue();
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
    <span class="eyebrow">${esc(extra ? `${extra} · ${pack.display_name}` : pack.display_name)}</span>
    <h3>${esc(pack.route_name)}</h3>
    <p>${esc(pack.short_description || pack.description)}</p>
    <div class="card-bottom">
      <div class="meta-row"><span class="meta">${icon} ${label}</span><span class="meta">${esc(nearby)}</span><span class="meta">${esc(pack.difficulty_label)}</span>${score ? `<span class="meta score-chip">✦ ${score} pts</span>` : ''}</div>
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
  const pool = eligible.length ? eligible : packs;
  const date = new Date();
  const seed = Number(`${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}`);
  return pool[seed % pool.length];
}

function renderAll() {
  const pick = daily();
  $('#mapPackCount').textContent = `${packs.length} adventures mapped`;
  $('#dailyDate').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  $('#dailyCard').innerHTML = `<div class="daily-card" data-pack="${esc(pick.pack_id)}" data-daily="true"><div><span class="eyebrow">DAILY PICK</span><h3>${esc(pick.display_name)}<br>${esc(pick.route_name)}</h3><p>${esc(pick.short_description)}</p><div class="meta-row"><span class="meta">${pick.route_distance_km} km</span><span class="meta">${pick.estimated_minutes} mins</span><span class="meta">${esc(pick.difficulty_label)}</span></div></div><span class="daily-badge">Play today →</span></div>`;
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
  const discoveries = packs.reduce((total, pack) => total + discoveryCount(pack), 0);
  const completedRoutes = packs.filter(hasCompleted).length;
  const routeCompletions = packs.reduce((total, pack) => total + (Number(packProgress(pack).completions) || 0), 0);
  const perfectStops = packs.reduce((total, pack) => total + (Number(packProgress(pack).perfectStops) || 0), 0);
  const perfectRoutes = packs.reduce((total, pack) => total + (Number(packProgress(pack).perfectCompletions) || 0), 0);
  const dailyCompletions = profile.dailyDates.length;
  return [
    { id: 'first-find', icon: '✦', name: 'First Discovery', description: 'Find your first landmark.', unlocked: discoveries >= 1 },
    { id: 'sharp-eyes', icon: '◇', name: 'Sharp Eyes', description: 'Find a stop without using a hint.', unlocked: perfectStops >= 1 },
    { id: 'trailblazer', icon: '⚑', name: 'Trailblazer', description: 'Complete your first route.', unlocked: completedRoutes >= 1 },
    { id: 'daily-detective', icon: '☀', name: 'Daily Detective', description: 'Complete a daily adventure.', unlocked: dailyCompletions >= 1 },
    { id: 'daily-regular', icon: '▦', name: 'Daily Regular', description: 'Complete three daily adventures.', unlocked: dailyCompletions >= 3 },
    { id: 'route-regular', icon: '⌖', name: 'Route Regular', description: 'Complete three routes, including replays.', unlocked: routeCompletions >= 3 },
    { id: 'seasoned-explorer', icon: '♜', name: 'Seasoned Explorer', description: 'Complete ten routes, including replays.', unlocked: routeCompletions >= 10 },
    { id: 'flawless-route', icon: '★', name: 'Flawless Route', description: 'Finish a route with no hints or skips.', unlocked: perfectRoutes >= 1 }
  ];
}

function renderExplorerRecord() {
  if (!packs.length || !$('#explorerStats')) return;
  const discoveries = packs.reduce((total, pack) => total + discoveryCount(pack), 0);
  const completedRoutes = packs.filter(hasCompleted).length;
  const points = packs.reduce((total, pack) => total + displayScore(pack), 0);
  const badges = achievements();
  $('#explorerStats').innerHTML = `
    <div><span>Points</span><b>${points}</b></div>
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
}

function achievementCard(badge) {
  return `<div class="achievement ${badge.unlocked ? 'unlocked' : 'locked'}"><span class="achievement-icon">${badge.icon}</span><div><b>${esc(badge.name)}</b><small>${esc(badge.description)}</small></div></div>`;
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
  showOnly('collectionView');
  $('#collectionTitle').textContent = name;
  $('#collectionRoutes').innerHTML = packs.filter(pack => pack.collections.includes(name)).map(pack => routeCard(pack)).join('');
  wireCards();
}

function surprise() {
  const pool = userPos
    ? [...packs].sort((a, b) => distance(userPos, [a.centre.lat, a.centre.long]) - distance(userPos, [b.centre.lat, b.centre.long])).slice(0, Math.min(5, packs.length))
    : packs;
  openDetail(pool[Math.floor(Math.random() * pool.length)]);
}

function getNearby() {
  if (!navigator.geolocation) return toast('Location is not available');
  $('#nearbyStatus').textContent = 'Finding nearby adventures…';
  navigator.geolocation.getCurrentPosition(position => {
    userPos = [position.coords.latitude, position.coords.longitude];
    $('#nearbyStatus').textContent = 'Sorted by distance from your current location.';
    renderNearby();
    renderFilters();
    renderBrowse($('#searchInput').value);
  }, () => {
    $('#nearbyStatus').textContent = 'Location was not available. Check browser permission.';
  }, { enableHighAccuracy: true, timeout: 12000 });
}

function numberedIcon(number, className = '') {
  return L.divIcon({
    className: '',
    html: `<div class="stop-pin ${className}"><span>${number}</span></div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19]
  });
}

function showMap() {
  showOnly('mapView');
  setTimeout(() => {
    if (!mapReady) {
      map = L.map('map', { zoomControl: false }).setView([52.45, -0.18], 7);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      packs.forEach(pack => {
        const icon = L.divIcon({ className: '', html: `<div class="giant-pin" style="--pin:${colour(pack)}"><span>${pack.stops.length}</span></div>`, iconSize: [60, 60] });
        L.marker([pack.centre.lat, pack.centre.long], { icon }).addTo(map)
          .bindPopup(`<b>${esc(pack.display_name)}</b><br>${esc(pack.route_name)}<br>${pack.route_distance_km} km · ${pack.stops.length} stops<br><button onclick="window.openPack('${esc(pack.pack_id)}')">View adventure</button>`);
      });
      if (packs.length > 1) map.fitBounds(packs.map(pack => [pack.centre.lat, pack.centre.long]), { padding: [45, 45], maxZoom: 9 });
      mapReady = true;
    } else {
      map.invalidateSize();
    }
  }, 50);
}

window.openPack = id => openDetail(packs.find(pack => pack.pack_id === id), false);

function openDetail(pack, isDaily = false) {
  if (!pack) return;
  stopWatch();
  destroyCompletionMap();
  selectedAsDaily = isDaily;
  currentPack = pack;
  showOnly('detailView');
  const state = packProgress(pack);
  const chips = [...pack.collections, ...pack.tags].map(item => `<span class="meta">${esc(item)}</span>`).join('');
  const score = displayScore(pack);
  $('#detailContent').innerHTML = `<div class="detail-hero" style="--detail-accent:${colour(pack)}"><button class="back-btn" data-home>←</button><span class="eyebrow">${esc(pack.display_name.toUpperCase())}</span><h1>${esc(pack.route_name)}</h1><p>${esc(pack.short_description)}</p></div>
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
      ${score ? `<div class="personal-best"><span>Personal best</span><b>✦ ${score} points</b></div>` : ''}
      ${isDaily ? '<div class="daily-mission"><span>✦ Daily adventure</span><b>Finish this route to earn a daily achievement.</b></div>' : ''}
      <button id="startRoute" class="primary">${state.stop > 0 && !state.completed ? 'Continue adventure' : hasCompleted(pack) ? 'Play again' : 'Start adventure'}</button>
    </div>`;
  $$('[data-home]').forEach(button => button.onclick = showHome);
  $('#startRoute').onclick = () => startGame(pack);
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

function startGame(pack) {
  destroyCompletionMap();
  debugMode = false;
  debugStop = null;
  stuckTapTimes = [];
  if (stuckTapTimer) clearTimeout(stuckTapTimer);
  stuckTapTimer = null;
  currentPack = pack;
  const existing = packProgress(pack);
  if (existing.completed) {
    progress[pack.pack_id] = {
      stop: 0,
      completed: false,
      everCompleted: true,
      score: 0,
      bestScore: Math.max(Number(existing.bestScore) || 0, Number(existing.score) || 0),
      perfectStops: Number(existing.perfectStops) || 0,
      perfectCompletions: Number(existing.perfectCompletions) || 0,
      skipped: 0,
      hintsUsed: 0,
      completions: Number(existing.completions) || 1
    };
    save();
  }
  const state = packProgress(pack);
  if (selectedAsDaily && daily().pack_id === pack.pack_id) {
    state.dailyRunDate = todayKey();
    progress[pack.pack_id] = state;
    save();
  }
  currentStop = Number(packProgress(pack).stop) || 0;
  renderGame();
}

function renderGame() {
  showOnly('gameView');
  const pack = currentPack;
  const stop = pack.stops[currentStop];
  const state = packProgress(pack);
  if (!stop) {
    const score = Number(state.score) || 0;
    const unlocked = achievements().filter(achievement => achievement.unlocked);
    $('#gameContent').innerHTML = `<div class="game-shell completion-screen">
      <span class="eyebrow">ROUTE COMPLETE</span><h1>${esc(pack.display_name)} conquered!</h1><p>You uncovered ${pack.stops.length} landmarks and their stories.</p>
      ${state.lastDailyDate ? '<div class="daily-complete"><span>☀</span><div><b>Daily adventure complete</b><small>Another daily discovery added to your record.</small></div></div>' : ''}
      <div class="finish-score"><span>Route score</span><b>✦ ${score}</b><small>Best: ${displayScore(pack)} points</small></div>
      <div class="route-map-head"><div><span class="eyebrow">YOUR ROUTE</span><h2>Stops at a glance</h2></div><span class="pill">Unlocked</span></div>
      <div id="completionMap" aria-label="Completed route map"></div>
      <ol class="route-recap-list">${pack.stops.map((item, index) => `<li><span>${index + 1}</span><b>${esc(item.Stop_Name)}</b></li>`).join('')}</ol>
      <h2>Your achievements</h2><div class="achievement-grid">${unlocked.map(badge => `<div class="achievement unlocked"><span class="achievement-icon">${badge.icon}</span><div><b>${esc(badge.name)}</b><small>${esc(badge.description)}</small></div></div>`).join('')}</div>
      <button class="primary" data-home>Back to adventures</button>
    </div>`;
    $$('[data-home]').forEach(button => button.onclick = showHome);
    renderCompletionMap(pack);
    return;
  }
  currentHints = 0;
  $('#gameContent').innerHTML = `<div class="game-shell"><div class="game-top"><button class="back-btn" data-home>×</button><span>Stop ${currentStop + 1} of ${pack.stops.length}</span><b class="live-score">✦ ${Number(state.score) || 0}</b></div><div class="progress"><i style="width:${(currentStop / pack.stops.length) * 100}%"></i></div><div class="game-meta-row">${state.dailyRunDate ? '<span class="daily-run-badge">☀ Daily adventure</span>' : '<span></span>'}${unitToggle()}</div><span class="eyebrow">CRYPTIC CLUE</span><div class="clue-card"><h1>${esc(stop.Cryptic_Clue)}</h1><div id="hints"></div></div><div id="guide">${scannerPanel()}</div><div class="game-actions"><button id="hintBtn" class="secondary">Reveal a hint <small>−25 points</small></button><button id="checkBtn" class="primary scan-button"><span>⌖</span> Scan my location</button><button id="stuckBtn" class="secondary">I’m stuck</button></div></div>`;
  $$('[data-home]').forEach(button => button.onclick = showHome);
  wireUnitToggle();
  if (debugMode) renderDebugPanel(stop, debugDistance);
  $('#hintBtn').onclick = () => {
    currentHints += 1;
    $('#hints').innerHTML = [stop.Hint_1, stop.Hint_2].slice(0, currentHints).map(hint => `<div class="hint">${esc(hint)}</div>`).join('');
    if (currentHints >= 2) $('#hintBtn').classList.add('hidden');
  };
  $('#checkBtn').onclick = () => checkLocation(stop);
  $('#stuckBtn').onclick = () => handleStuckTap(stop);
}

function checkLocation(stop) {
  if (!isSecureContext) return toast('Location needs HTTPS. Open the GitHub Pages address.');
  if (!navigator.geolocation) return toast('Location is not available on this device.');
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

function unitToggle() {
  return `<div class="unit-toggle" role="group" aria-label="Distance units">
    <button type="button" data-unit="km" class="${profile.unit === 'km' ? 'active' : ''}" aria-label="Kilometres" aria-pressed="${profile.unit === 'km'}">KM</button>
    <button type="button" data-unit="mi" class="${profile.unit === 'mi' ? 'active' : ''}" aria-label="Miles" aria-pressed="${profile.unit === 'mi'}">MI</button>
  </div>`;
}

function wireUnitToggle() {
  $$('[data-unit]').forEach(button => {
    button.onclick = () => setUnit(button.dataset.unit);
  });
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

function scannerPanel(state = 'idle') {
  const copy = state === 'scanning'
    ? ['LOCKING ON', 'Finding your best GPS signal…']
    : ['READY TO SCAN', 'Step outside, look around, then scan when you think you have solved the clue.'];
  return `<section class="gps-scanner ${state}">
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
    : 'Your GPS reading is less precise, so GeoQuest is allowing a little extra room. <strong>Only submit if you can genuinely see the building or landmark in question.</strong>';
  $('#arrivalModal').classList.remove('hidden');
}

function closeArrival() {
  pendingArrival = null;
  $('#arrivalModal').classList.add('hidden');
}

function handleStuckTap(stop) {
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
  $('#guide').innerHTML = '<div class="guide-panel"><h3>Need a hand?</h3><div class="game-actions"><button id="guideBtn" class="primary">Guide me in</button><button id="skipBtn" class="secondary">Skip this stop · 0 points</button></div></div>';
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
  await startCompass();
  $('#guide').innerHTML = scannerPanel('scanning');
  watchId = navigator.geolocation.watchPosition(position => {
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
    <div class="scanner-result-top"><span class="gps-quality ${qualityClass}">${qualityLabel} GPS · ±${formatDistance(accuracy)}</span><span>Live guidance</span></div>
    <div class="guidance-orbit"><i></i><i></i><div class="guide-arrow" style="transform:rotate(${arrow}deg)">↑</div></div>
    <div class="distance-display"><b>${formatDistance(metres)}</b><span>to the discovery zone</span></div>
    <p class="direction-note">${heading === null ? 'Compass unavailable — the arrow is relative to north.' : 'Hold your phone flat. The arrow turns relative to its top edge.'}</p>
    <div class="distance-facts">${comparisonFact(metres)}</div>
  </section>`;
  const base = Number(stop.Win_Radius_m) || 35;
  if (metres <= effectiveRadius(base, accuracy)) {
    stopWatch();
    showArrivalConfirm(stop, metres, accuracy, base);
  }
}

function completeStop(stop, skip = false, debug = false) {
  stopWatch();
  const points = skip ? 0 : Math.max(0, 100 - currentHints * 25);
  $('#gameContent').innerHTML = `<div class="game-shell discovery-screen"><span class="eyebrow">${skip ? 'STOP SKIPPED' : debug ? 'TEST LOCATION FOUND' : 'LOCATION FOUND'}</span><h1>${esc(stop.Stop_Name)}</h1><div class="points-earned ${skip ? 'skipped' : ''}">${skip ? 'No points for this stop' : `+${points} points`}</div><div class="clue-card"><p>${esc(stop.Unlock_Fact)}</p></div><button id="nextStop" class="primary">${currentStop + 1 >= currentPack.stops.length ? 'Finish route' : 'Next stop'}</button></div>`;
  $('#nextStop').onclick = () => {
    const before = new Set(achievements().filter(item => item.unlocked).map(item => item.id));
    const state = packProgress(currentPack);
    state.score = (Number(state.score) || 0) + points;
    state.hintsUsed = (Number(state.hintsUsed) || 0) + currentHints;
    state.skipped = (Number(state.skipped) || 0) + (skip ? 1 : 0);
    state.perfectStops = (Number(state.perfectStops) || 0) + (!skip && currentHints === 0 ? 1 : 0);
    currentStop += 1;
    state.stop = currentStop;
    if (currentStop >= currentPack.stops.length) {
      state.completed = true;
      state.everCompleted = true;
      state.completions = (Number(state.completions) || 0) + 1;
      state.bestScore = Math.max(Number(state.bestScore) || 0, Number(state.score) || 0);
      if ((Number(state.hintsUsed) || 0) === 0 && (Number(state.skipped) || 0) === 0) {
        state.perfectCompletions = (Number(state.perfectCompletions) || 0) + 1;
      }
      if (state.dailyRunDate) {
        const dailyDate = state.dailyRunDate;
        const isNewDaily = !profile.dailyDates.includes(dailyDate);
        if (isNewDaily) profile.dailyDates.push(dailyDate);
        state.lastDailyDate = isNewDaily ? dailyDate : null;
        delete state.dailyRunDate;
        saveProfile();
      } else {
        state.lastDailyDate = null;
      }
    }
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
    if (newlyUnlocked.length) toast(`Achievement unlocked: ${newlyUnlocked[0].name}`);
  };
}

function restoreContinue() {
  if (!packs.length || !$('#continueSection')) return;
  const pack = packs.find(item => {
    const state = packProgress(item);
    return !state.completed && Number(state.stop) > 0;
  });
  $('#continueSection').classList.toggle('hidden', !pack);
  if (pack) {
    $('#continueCard').innerHTML = routeCard(pack, 'IN PROGRESS');
    wireCards();
  }
}

function stopWatch() {
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
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}
