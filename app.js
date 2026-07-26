const $ = (id) => document.getElementById(id);
const state = {
  data: null, town: null, stops: [], index: 0,
  hintsThisStop: 0, hintsTotal: 0, starsTotal: 0,
  skippedTotal: 0, demoMode: false, guideWatchId: null
};
const screens = ["homeScreen", "gameScreen", "successScreen", "completeScreen"];

function showScreen(id) {
  screens.forEach(s => $(s).classList.toggle("active", s === id));
  $("backButton").classList.toggle("hidden", id === "homeScreen");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2200);
}
function cleanText(value) { return String(value ?? "").trim(); }
function saveProgress() {
  localStorage.setItem("geoquest-progress", JSON.stringify({
    town: state.town?.Town, index: state.index, hintsTotal: state.hintsTotal,
    starsTotal: state.starsTotal, skippedTotal: state.skippedTotal
  }));
  refreshResume();
}
function clearProgress() { localStorage.removeItem("geoquest-progress"); refreshResume(); }
function refreshResume() {
  const progress = JSON.parse(localStorage.getItem("geoquest-progress") || "null");
  $("resumeButton").classList.toggle("hidden", !progress);
  if (progress) $("resumeButton").textContent = `Resume ${progress.town} · Stop ${progress.index + 1}`;
}

async function init() {
  const response = await fetch("data.json");
  if (!response.ok) throw new Error(`Could not load data.json (${response.status})`);
  state.data = await response.json();
  renderTowns(); refreshResume();
  $("townCount").textContent = `${state.data.towns.length} available`;
  $("notesArea").value = localStorage.getItem("geoquest-notes") || "";
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}
function renderTowns() {
  $("townGrid").innerHTML = state.data.towns.map(t => `
    <button class="town-card" data-town="${t.Town}">
      <div><strong>${t.Display_Name}</strong><span>${t.Number_of_Stops} stops · Main Route</span></div>
      <div class="town-arrow">→</div>
    </button>`).join("");
  document.querySelectorAll(".town-card").forEach(card => card.addEventListener("click", () => startTown(card.dataset.town)));
}
function startTown(townName, resume = false) {
  stopGuide();
  state.town = state.data.towns.find(t => t.Town === townName);
  state.stops = state.data.stops.filter(s => s.Town === townName).sort((a,b) => a.Stop_Order - b.Stop_Order);
  state.index = 0; state.hintsTotal = 0; state.starsTotal = 0; state.skippedTotal = 0;
  if (resume) {
    const p = JSON.parse(localStorage.getItem("geoquest-progress") || "null");
    if (p) {
      state.index = Math.min(p.index, state.stops.length - 1);
      state.hintsTotal = p.hintsTotal || 0;
      state.starsTotal = p.starsTotal || 0;
      state.skippedTotal = p.skippedTotal || 0;
    }
  }
  loadStop();
}
function loadStop() {
  stopGuide();
  const stop = state.stops[state.index];
  state.hintsThisStop = 0;
  $("townName").textContent = state.town.Display_Name;
  $("progressText").textContent = `${state.index + 1} / ${state.stops.length}`;
  $("progressBar").style.width = `${(state.index / state.stops.length) * 100}%`;
  $("stopNumber").textContent = String(stop.Stop_Order).padStart(2,"0");
  $("crypticClue").textContent = cleanText(stop.Cryptic_Clue);
  $("hint1Panel").textContent = cleanText(stop.Hint_1);
  $("hint2Panel").textContent = cleanText(stop.Hint_2);
  ["hint1Panel","hint2Panel"].forEach(id => $(id).classList.add("hidden"));
  ["hint1Button","hint2Button"].forEach(id => $(id).classList.remove("hidden"));
  $("hint2Button").classList.add("locked");
  $("locationStatus").textContent = "Ready when you are";
  $("distanceDisplay").textContent = "—";
  $("distanceCaption").textContent = location.protocol === "https:" || location.hostname === "localhost"
    ? "Your distance will appear here."
    : "GPS requires HTTPS. Publish with GitHub Pages or use test mode.";
  $("accuracyBadge").textContent = "GPS";
  showScreen("gameScreen"); saveProgress();
}
function revealHint(number) {
  if (number === 2 && state.hintsThisStop < 1) { toast("Reveal hint 1 first"); return false; }
  const panel = $(number === 1 ? "hint1Panel" : "hint2Panel");
  if (!panel.classList.contains("hidden")) return false;
  panel.classList.remove("hidden");
  $(number === 1 ? "hint1Button" : "hint2Button").classList.add("hidden");
  state.hintsThisStop++; state.hintsTotal++;
  if (number === 1) $("hint2Button").classList.remove("locked");
  saveProgress(); return true;
}
function revealNextHint() {
  if ($("hint1Panel").classList.contains("hidden")) revealHint(1);
  else if ($("hint2Panel").classList.contains("hidden")) revealHint(2);
  else toast("You have already revealed both hints");
}
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function bearing(lat1, lon1, lat2, lon2) {
  const toRad = x => x * Math.PI / 180, toDeg = x => x * 180 / Math.PI;
  const y = Math.sin(toRad(lon2-lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1))*Math.sin(toRad(lat2)) - Math.sin(toRad(lat1))*Math.cos(toRad(lat2))*Math.cos(toRad(lon2-lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function compassName(deg) {
  const names = ["north","north-east","east","south-east","south","south-west","west","north-west"];
  return names[Math.round(deg / 45) % 8];
}
function formatDistance(m) { return m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(1)} km`; }
function evaluateDistance(distance, accuracy = null) {
  const stop = state.stops[state.index];
  const radius = Number(stop.Win_Radius_m) || 35;
  $("distanceDisplay").textContent = formatDistance(distance);
  $("accuracyBadge").textContent = accuracy ? `±${Math.round(accuracy)}m` : "TEST";
  if (distance <= radius) { completeStop(false); return; }
  $("locationStatus").textContent = distance < 150 ? "Very close" : distance < 500 ? "Getting warmer" : "Keep exploring";
  $("distanceCaption").textContent = distance < 150 ? "You are nearly there. Look carefully around you." : `Reach within ${radius} metres to unlock the stop.`;
}
function geolocationError(err) {
  $("locationStatus").textContent = "Location unavailable";
  $("distanceDisplay").textContent = "—";
  const insecure = !window.isSecureContext && location.hostname !== "localhost";
  $("distanceCaption").textContent = insecure
    ? "This page is not secure. Open the HTTPS GitHub Pages address, not a local network HTTP address."
    : (err?.code === 1 ? "Location permission was denied. Allow it in your browser settings and try again." : (err?.message || "Move outdoors and try again."));
}
function checkRealLocation() {
  if (!window.isSecureContext && location.hostname !== "localhost") { geolocationError(); return; }
  if (!navigator.geolocation) { toast("Location is not supported in this browser"); return; }
  $("locationStatus").textContent = "Finding your position…";
  $("distanceDisplay").textContent = "···";
  navigator.geolocation.getCurrentPosition(pos => {
    const stop = state.stops[state.index];
    const distance = haversine(pos.coords.latitude, pos.coords.longitude, Number(stop.Target_Lat), Number(stop.Target_Long));
    evaluateDistance(distance, pos.coords.accuracy);
    if (pos.coords.accuracy > 100 && distance > (Number(stop.Win_Radius_m) || 35)) {
      $("locationStatus").textContent = "Weak GPS signal";
      $("distanceCaption").textContent = "Try moving outdoors and checking again.";
    }
  }, geolocationError, { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 });
}
function startGuide() {
  $("stuckDialog").close();
  if (!window.isSecureContext && location.hostname !== "localhost") { geolocationError(); return; }
  if (!navigator.geolocation) { toast("Location is not supported in this browser"); return; }
  stopGuide();
  $("guidePanel").classList.remove("hidden");
  $("locationStatus").textContent = "Guide mode active";
  state.guideWatchId = navigator.geolocation.watchPosition(pos => {
    const stop = state.stops[state.index];
    const targetLat = Number(stop.Target_Lat), targetLon = Number(stop.Target_Long);
    const distance = haversine(pos.coords.latitude, pos.coords.longitude, targetLat, targetLon);
    const heading = bearing(pos.coords.latitude, pos.coords.longitude, targetLat, targetLon);
    $("guideDirection").textContent = compassName(heading);
    $("guideArrow").style.transform = `rotate(${heading}deg)`;
    $("guideDistance").textContent = `${formatDistance(distance)} away`;
    $("guideAccuracy").textContent = `GPS accuracy approximately ±${Math.round(pos.coords.accuracy)} m. Arrow points relative to north.`;
    evaluateDistance(distance, pos.coords.accuracy);
  }, err => { geolocationError(err); stopGuide(); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 });
}
function stopGuide() {
  if (state.guideWatchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(state.guideWatchId);
  state.guideWatchId = null;
  $("guidePanel")?.classList.add("hidden");
}
function completeStop(skipped) {
  stopGuide();
  const stop = state.stops[state.index];
  const stars = skipped ? 0 : Math.max(1, 3 - state.hintsThisStop);
  state.starsTotal += stars;
  if (skipped) state.skippedTotal++;
  $("foundName").textContent = stop.Stop_Name;
  $("unlockFact").textContent = cleanText(stop.Unlock_Fact);
  $("starsEarned").textContent = skipped ? "Skipped · no stars" : "★".repeat(stars) + "☆".repeat(3-stars);
  $("successEyebrow").textContent = skipped ? "STOP SKIPPED" : "LOCATION CONFIRMED";
  $("successBurst").textContent = skipped ? "→" : "✓";
  $("successBurst").classList.toggle("skipped", skipped);
  $("nextStopButton").textContent = state.index === state.stops.length - 1 ? "Finish trail" : "Continue to next stop";
  if (!skipped && navigator.vibrate) navigator.vibrate([80,50,140]);
  showScreen("successScreen"); saveProgress();
}
function nextStop() { state.index >= state.stops.length - 1 ? finishTown() : (state.index++, loadStop()); }
function finishTown() {
  $("completeTitle").textContent = `${state.town.Display_Name} complete!`;
  $("summaryStops").textContent = state.stops.length - state.skippedTotal;
  $("summaryStars").textContent = `${state.starsTotal}/${state.stops.length*3}`;
  $("summarySkipped").textContent = state.skippedTotal;
  clearProgress(); showScreen("completeScreen");
}

$("hint1Button").addEventListener("click", () => revealHint(1));
$("hint2Button").addEventListener("click", () => revealHint(2));
$("checkLocationButton").addEventListener("click", checkRealLocation);
$("stuckButton").addEventListener("click", () => $("stuckDialog").showModal());
$("closeStuckButton").addEventListener("click", () => $("stuckDialog").close());
$("stuckHintButton").addEventListener("click", () => { revealNextHint(); $("stuckDialog").close(); });
$("guideButton").addEventListener("click", startGuide);
$("skipButton").addEventListener("click", () => { $("stuckDialog").close(); completeStop(true); });
$("stopGuideButton").addEventListener("click", stopGuide);
$("nextStopButton").addEventListener("click", nextStop);
$("toggleDemoButton").addEventListener("click", () => {
  state.demoMode = !state.demoMode;
  $("demoPanel").classList.toggle("hidden", !state.demoMode);
  $("toggleDemoButton").textContent = state.demoMode ? "Hide desktop test mode" : "Use desktop test mode";
});
$("demoDistance").addEventListener("input", e => $("demoDistanceLabel").textContent = `${e.target.value} m away`);
$("demoCheckButton").addEventListener("click", () => evaluateDistance(Number($("demoDistance").value)));
$("restartButton").addEventListener("click", () => startTown(state.town.Town));
$("chooseTownButton").addEventListener("click", () => { stopGuide(); showScreen("homeScreen"); });
$("backButton").addEventListener("click", () => { stopGuide(); showScreen("homeScreen"); });
$("resumeButton").addEventListener("click", () => { const p = JSON.parse(localStorage.getItem("geoquest-progress") || "null"); if (p) startTown(p.town, true); });
$("notesButton").addEventListener("click", () => $("notesDialog").showModal());
$("notesArea").addEventListener("input", e => localStorage.setItem("geoquest-notes", e.target.value));
$("copyNotesButton").addEventListener("click", async () => { await navigator.clipboard.writeText($("notesArea").value); toast("Notes copied"); });
window.addEventListener("beforeunload", stopGuide);

init().catch(err => { document.body.innerHTML = `<main style="padding:30px;color:white;font-family:sans-serif"><h1>Could not load game data</h1><p>${err.message}</p><p>Use the included local server, or host these files with GitHub Pages.</p></main>`; });
