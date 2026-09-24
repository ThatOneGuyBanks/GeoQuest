import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const checked = new Set();

function repoPath(path) {
  return resolve(root, normalize(path.replace(/^\.\//, '').split(/[?#]/)[0]));
}

function requireFile(path, reason = '') {
  const absolute = repoPath(path);
  const label = relative(root, absolute).replaceAll('\\', '/');
  checked.add(label);
  if (!absolute.startsWith(`${root}${sep}`) && absolute !== root) failures.push(`Unsafe path: ${path}`);
  else if (!existsSync(absolute)) failures.push(`Missing ${label}${reason ? ` (${reason})` : ''}`);
  return absolute;
}

function readJson(path) {
  const absolute = requireFile(path, 'required JSON');
  try {
    return JSON.parse(readFileSync(absolute, 'utf8'));
  } catch (error) {
    failures.push(`Invalid JSON in ${path}: ${error.message}`);
    return null;
  }
}

for (const path of [
  'index.html', 'privacy.html', 'app.js', 'styles.css', 'service-worker.js',
  'manifest.webmanifest', 'package.json', 'package-lock.json', '.nojekyll',
  'data/distance-comparisons.json', 'packs/index.json'
]) requireFile(path, 'required project file');

readJson('package.json');
readJson('package-lock.json');
readJson('data/distance-comparisons.json');
const manifest = readJson('manifest.webmanifest');
const packIndex = readJson('packs/index.json');

if (manifest) {
  for (const icon of manifest.icons ?? []) requireFile(icon.src, 'web manifest icon');
}

const indexedFiles = new Set();
const packIds = new Set();
const stopIds = new Set();
if (!Array.isArray(packIndex?.packs) || packIndex.packs.length === 0) {
  failures.push('packs/index.json has no packs');
} else {
  for (const entry of packIndex.packs) {
    if (!entry?.file || typeof entry.file !== 'string') {
      failures.push('Pack index entry is missing a filename');
      continue;
    }
    if (indexedFiles.has(entry.file)) failures.push(`Duplicate pack index entry: ${entry.file}`);
    indexedFiles.add(entry.file);
    const path = `packs/${entry.file}`;
    const pack = readJson(path);
    if (!pack) continue;
    if (!pack.pack_id) failures.push(`${path} has no pack_id`);
    else if (packIds.has(pack.pack_id)) failures.push(`Duplicate pack_id: ${pack.pack_id}`);
    else packIds.add(pack.pack_id);
    if (!pack.town || !pack.route_name) failures.push(`${path} is missing town or route_name`);
    if (!Array.isArray(pack.stops) || pack.stops.length === 0) failures.push(`${path} has no stops`);
    for (const stop of pack.stops ?? []) {
      if (!stop.Stop_ID) failures.push(`${path} contains a stop without Stop_ID`);
      else if (stopIds.has(stop.Stop_ID)) failures.push(`Duplicate Stop_ID: ${stop.Stop_ID}`);
      else stopIds.add(stop.Stop_ID);
      for (const field of ['Image', 'Audio']) {
        const value = stop[field];
        if (typeof value === 'string' && value && !/^(?:https?:|data:|blob:)/i.test(value)) {
          requireFile(value, `${field} referenced by ${entry.file}`);
        }
      }
    }
  }
}

const authoredPacks = readdirSync(join(root, 'packs'))
  .filter(file => extname(file) === '.json' && !['index.json', 'PACK_TEMPLATE.json'].includes(file));
for (const file of authoredPacks) {
  if (!indexedFiles.has(file)) failures.push(`Authored pack is not listed in packs/index.json: ${file}`);
}

for (const htmlFile of ['index.html', 'privacy.html']) {
  const html = readFileSync(join(root, htmlFile), 'utf8');
  for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|tel:|#|data:|blob:)/i.test(target) || target === './') continue;
    requireFile(join(dirname(htmlFile), target), `referenced by ${htmlFile}`);
  }
}

const serviceWorker = readFileSync(join(root, 'service-worker.js'), 'utf8');
const coreList = serviceWorker.match(/const CORE_URLS = \[([\s\S]*?)\];/)?.[1] ?? '';
for (const match of coreList.matchAll(/["'](\.\/[^"']+)["']/g)) {
  if (match[1] === './') continue;
  requireFile(match[1], 'service-worker core asset');
}

if (failures.length) {
  console.error(`Backup validation failed with ${failures.length} problem(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Backup validation passed: ${indexedFiles.size} route packs, ${stopIds.size} stops, ${checked.size} required/referenced files.`);
