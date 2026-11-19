const MAP_DEFAULT_FILL = 'rgba(255, 255, 255, 0.06)';
const MAP_STROKE = 'rgba(255, 255, 255, 0.14)';
const MAP_ACCENT = { r: 176, g: 137, b: 104 };

const COUNTRY_NAME_TO_ISO = {
  afghanistan: 'af',
  albania: 'al',
  algeria: 'dz',
  angola: 'ao',
  argentina: 'ar',
  australia: 'au',
  austria: 'at',
  bangladesh: 'bd',
  belgium: 'be',
  bolivia: 'bo',
  brazil: 'br',
  brasil: 'br',
  burundi: 'bi',
  cambodia: 'kh',
  cameroon: 'cm',
  canada: 'ca',
  'central african republic': 'cf',
  chad: 'td',
  china: 'cn',
  colombia: 'co',
  congo: 'cg',
  'costa rica': 'cr',
  "cote d'ivoire": 'ci',
  "côte d'ivoire": 'ci',
  'ivory coast': 'ci',
  cuba: 'cu',
  'democratic republic of the congo': 'cd',
  'dr congo': 'cd',
  drc: 'cd',
  'dominican republic': 'do',
  ecuador: 'ec',
  egypt: 'eg',
  'el salvador': 'sv',
  ethiopia: 'et',
  france: 'fr',
  germany: 'de',
  ghana: 'gh',
  guatemala: 'gt',
  guinea: 'gn',
  haiti: 'ht',
  honduras: 'hn',
  india: 'in',
  indonesia: 'id',
  iran: 'ir',
  iraq: 'iq',
  israel: 'il',
  italy: 'it',
  jamaica: 'jm',
  japan: 'jp',
  kenya: 'ke',
  laos: 'la',
  madagascar: 'mg',
  malawi: 'mw',
  malaysia: 'my',
  mexico: 'mx',
  morocco: 'ma',
  mozambique: 'mz',
  myanmar: 'mm',
  burma: 'mm',
  nepal: 'np',
  nicaragua: 'ni',
  nigeria: 'ng',
  'north korea': 'kp',
  pakistan: 'pk',
  panama: 'pa',
  'papua new guinea': 'pg',
  png: 'pg',
  paraguay: 'py',
  peru: 'pe',
  philippines: 'ph',
  'puerto rico': 'pr',
  rwanda: 'rw',
  'saudi arabia': 'sa',
  senegal: 'sn',
  'sierra leone': 'sl',
  'south africa': 'za',
  'south korea': 'kr',
  korea: 'kr',
  spain: 'es',
  'sri lanka': 'lk',
  sudan: 'sd',
  'south sudan': 'ss',
  suriname: 'sr',
  taiwan: 'tw',
  tanzania: 'tz',
  thailand: 'th',
  'timor-leste': 'tl',
  'east timor': 'tl',
  togo: 'tg',
  'trinidad and tobago': 'tt',
  turkey: 'tr',
  uganda: 'ug',
  ukraine: 'ua',
  'united arab emirates': 'ae',
  uae: 'ae',
  'united kingdom': 'gb',
  uk: 'gb',
  'united states': 'us',
  usa: 'us',
  'u.s.a.': 'us',
  america: 'us',
  uruguay: 'uy',
  venezuela: 've',
  vietnam: 'vn',
  'viet nam': 'vn',
  yemen: 'ye',
  zambia: 'zm',
  zimbabwe: 'zw',
  hawaii: 'us',
  kona: 'us',
};

const REGION_ALIASES = {
  yirgacheffe: 'et',
  yergacheffe: 'et',
  sidamo: 'et',
  guji: 'et',
  harrar: 'et',
  harar: 'et',
  limu: 'et',
  kaffa: 'et',
  huila: 'co',
  narino: 'co',
  nariño: 'co',
  cauca: 'co',
  antioquia: 'co',
  tolima: 'co',
  'minas gerais': 'br',
  cerrado: 'br',
  mogiana: 'br',
  'sul de minas': 'br',
  antigua: 'gt',
  huehuetenango: 'gt',
  tarrazu: 'cr',
  tarrazú: 'cr',
  boquete: 'pa',
  gesha: 'pa',
  geisha: 'et',
  nyeri: 'ke',
  kirinyaga: 'ke',
  sumatra: 'id',
  java: 'id',
  sulawesi: 'id',
  bali: 'id',
  flores: 'id',
  aceh: 'id',
  toraja: 'id',
  malabar: 'in',
  yunnan: 'cn',
  'blue mountain': 'jm',
  kivu: 'cd',
  gitega: 'bi',
  kilimanjaro: 'tz',
  mbeya: 'tz',
};

const REGION_MATCHES = Object.entries(REGION_ALIASES).sort((a, b) => b[0].length - a[0].length);
const COUNTRY_MATCHES = Object.entries(COUNTRY_NAME_TO_ISO).sort((a, b) => b[0].length - a[0].length);

function caseKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function resolveOriginToIso(label) {
  const key = caseKey(label);
  if (!key) return null;
  if (COUNTRY_NAME_TO_ISO[key]) return COUNTRY_NAME_TO_ISO[key];
  if (REGION_ALIASES[key]) return REGION_ALIASES[key];

  for (const [alias, iso] of REGION_MATCHES) {
    if (key.includes(alias)) return iso;
  }

  for (const [name, iso] of COUNTRY_MATCHES) {
    if (key.includes(name)) return iso;
  }

  return null;
}

export function buildCountryCounts(origins) {
  const counts = new Map();
  const unmapped = [];

  for (const entry of origins) {
    const iso = resolveOriginToIso(entry.label);
    if (!iso) {
      unmapped.push(entry);
      continue;
    }
    counts.set(iso, (counts.get(iso) || 0) + entry.value);
  }

  return { counts, unmapped };
}

function originsSignature(origins) {
  return origins.map((entry) => `${entry.label}:${entry.value}`).join('|');
}

function fillForCount(count, maxCount) {
  if (!count) return MAP_DEFAULT_FILL;
  const t = maxCount ? count / maxCount : 1;
  const r = Math.round(42 + (MAP_ACCENT.r - 42) * t);
  const g = Math.round(37 + (MAP_ACCENT.g - 37) * t);
  const b = Math.round(32 + (MAP_ACCENT.b - 32) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function isoFromPath(path) {
  const id = path.getAttribute('id');
  if (id) return id.toLowerCase();

  const label = caseKey(path.getAttribute('aria-label'));
  if (!label) return null;
  if (COUNTRY_NAME_TO_ISO[label]) return COUNTRY_NAME_TO_ISO[label];

  for (const [name, iso] of COUNTRY_MATCHES) {
    if (label.includes(name)) return iso;
  }

  return null;
}

function applyColors(svg, countryCounts) {
  const maxCount = Math.max(0, ...countryCounts.values());
  svg.querySelectorAll('path').forEach((path) => {
    const iso = isoFromPath(path);
    const count = iso ? countryCounts.get(iso) || 0 : 0;
    path.setAttribute('fill', fillForCount(count, maxCount));
    path.setAttribute('stroke', MAP_STROKE);
    path.setAttribute('stroke-width', '0.5');
  });
}

let worldMapSvgRaw = null;
let worldMapLoadPromise = null;
let worldMapLoadFailed = false;
let mapTemplate = null;
let mapMountToken = 0;
let mapMountInFlight = false;

export function renderOriginMapPlaceholder() {
  return '<div id="stats-origin-map-host" class="stats-origin-map stats-origin-map-loading">Loading map…</div>';
}

function ensureMapTemplate() {
  if (mapTemplate) return mapTemplate;
  const doc = new DOMParser().parseFromString(worldMapSvgRaw, 'image/svg+xml');
  mapTemplate = doc.documentElement;
  mapTemplate.classList.add('stats-origin-map-svg');
  mapTemplate.removeAttribute('aria-label');
  applyColors(mapTemplate, new Map());
  return mapTemplate;
}

const MAP_ZOOM_MIN = 1;
const MAP_ZOOM_MAX = 4;

function clampMapScale(scale) {
  return Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, scale));
}

function clientPointInViewport(viewport, clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top, vw: rect.width, vh: rect.height };
}

function readBaseViewBox(svg) {
  const raw = svg.dataset.mapBaseViewBox || svg.getAttribute('viewBox') || '0 0 1010 666';
  const [x, y, w, h] = raw.split(/\s+/).map(Number);
  return { x, y, w, h };
}

function clampPan(panX, panY, base, scale) {
  const vbW = base.w / scale;
  const vbH = base.h / scale;
  return {
    panX: Math.min(Math.max(panX, 0), Math.max(0, base.w - vbW)),
    panY: Math.min(Math.max(panY, 0), Math.max(0, base.h - vbH)),
  };
}

function applyMapViewBox(svg, base, scale, panX, panY) {
  const vbW = base.w / scale;
  const vbH = base.h / scale;
  const pan = clampPan(panX, panY, base, scale);
  svg.setAttribute('viewBox', `${pan.panX} ${pan.panY} ${vbW} ${vbH}`);
  return pan;
}

function svgPointAtClient(viewport, base, scale, panX, panY, clientX, clientY) {
  const point = clientPointInViewport(viewport, clientX, clientY);
  const vbW = base.w / scale;
  const vbH = base.h / scale;
  return {
    svgX: panX + (point.x / point.vw) * vbW,
    svgY: panY + (point.y / point.vh) * vbH,
    ...point,
  };
}

function zoomMapAtClient(svg, base, state, clientX, clientY, nextScale) {
  const scale = clampMapScale(nextScale);
  if (scale <= MAP_ZOOM_MIN) {
    state.scale = MAP_ZOOM_MIN;
    state.panX = 0;
    state.panY = 0;
    applyMapViewBox(svg, base, state.scale, 0, 0);
    return;
  }

  const anchor = svgPointAtClient(viewportFromSvg(svg), base, state.scale, state.panX, state.panY, clientX, clientY);
  const vbW = base.w / scale;
  const vbH = base.h / scale;
  const panX = anchor.svgX - (anchor.x / anchor.vw) * vbW;
  const panY = anchor.svgY - (anchor.y / anchor.vh) * vbH;
  const pan = applyMapViewBox(svg, base, scale, panX, panY);
  state.scale = scale;
  state.panX = pan.panX;
  state.panY = pan.panY;
}

function viewportFromSvg(svg) {
  return svg.closest('.stats-origin-map-viewport');
}

function panMapByPixels(svg, base, state, deltaX, deltaY) {
  const viewport = viewportFromSvg(svg);
  if (!viewport || state.scale <= MAP_ZOOM_MIN) return;
  const { vw, vh } = clientPointInViewport(viewport, 0, 0);
  const vbW = base.w / state.scale;
  const vbH = base.h / state.scale;
  const pan = applyMapViewBox(
    svg,
    base,
    state.scale,
    state.panX - (deltaX / vw) * vbW,
    state.panY - (deltaY / vh) * vbH
  );
  state.panX = pan.panX;
  state.panY = pan.panY;
}

function setupOriginMapZoom(viewport, svg) {
  const base = readBaseViewBox(svg);
  if (!svg.dataset.mapBaseViewBox) {
    svg.dataset.mapBaseViewBox = `${base.x} ${base.y} ${base.w} ${base.h}`;
  }

  const state = {
    scale: MAP_ZOOM_MIN,
    panX: 0,
    panY: 0,
    pinchStartDistance: 0,
    pinchStartScale: MAP_ZOOM_MIN,
    pinchClientX: 0,
    pinchClientY: 0,
    panActive: false,
    panStartX: 0,
    panStartY: 0,
  };

  const reset = () => {
    state.scale = MAP_ZOOM_MIN;
    state.panX = 0;
    state.panY = 0;
    applyMapViewBox(svg, base, MAP_ZOOM_MIN, 0, 0);
  };

  viewport.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.002);
      zoomMapAtClient(svg, base, state, event.clientX, event.clientY, state.scale * factor);
    },
    { passive: false }
  );

  viewport.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length === 2) {
        const [a, b] = event.touches;
        state.pinchStartDistance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        state.pinchStartScale = state.scale;
        state.pinchClientX = (a.clientX + b.clientX) / 2;
        state.pinchClientY = (a.clientY + b.clientY) / 2;
        state.panActive = false;
      } else if (event.touches.length === 1 && state.scale > MAP_ZOOM_MIN) {
        const touch = event.touches[0];
        state.panActive = true;
        state.panStartX = touch.clientX;
        state.panStartY = touch.clientY;
      }
    },
    { passive: true }
  );

  viewport.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length === 2 && state.pinchStartDistance > 0) {
        event.preventDefault();
        const [a, b] = event.touches;
        const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const nextScale = state.pinchStartScale * (distance / state.pinchStartDistance);
        zoomMapAtClient(svg, base, state, state.pinchClientX, state.pinchClientY, nextScale);
        return;
      }
      if (event.touches.length === 1 && state.panActive && state.scale > MAP_ZOOM_MIN) {
        event.preventDefault();
        const touch = event.touches[0];
        panMapByPixels(svg, base, state, touch.clientX - state.panStartX, touch.clientY - state.panStartY);
        state.panStartX = touch.clientX;
        state.panStartY = touch.clientY;
      }
    },
    { passive: false }
  );

  viewport.addEventListener('touchend', (event) => {
    if (event.touches.length < 2) {
      state.pinchStartDistance = 0;
    }
    if (event.touches.length === 0) {
      state.panActive = false;
    }
    if (state.scale <= MAP_ZOOM_MIN) {
      reset();
    }
  });

  viewport.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') return;
    if (state.scale <= MAP_ZOOM_MIN || event.button !== 0) return;
    state.panActive = true;
    state.panStartX = event.clientX;
    state.panStartY = event.clientY;
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('is-panning');
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!state.panActive || state.scale <= MAP_ZOOM_MIN) return;
    panMapByPixels(svg, base, state, event.clientX - state.panStartX, event.clientY - state.panStartY);
    state.panStartX = event.clientX;
    state.panStartY = event.clientY;
  });

  const endPan = (event) => {
    if (!state.panActive) return;
    state.panActive = false;
    viewport.classList.remove('is-panning');
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
  };

  viewport.addEventListener('pointerup', endPan);
  viewport.addEventListener('pointercancel', endPan);

  viewport.addEventListener('dblclick', reset);

  reset();
}

function paintOriginMap(host, origins) {
  const { counts, unmapped } = buildCountryCounts(origins);
  if (!counts.size) {
    host.className = 'stats-origin-map';
    host.textContent = 'No mappable country origins yet.';
    host.dataset.originMapSig = originsSignature(origins);
    return;
  }

  const svg = ensureMapTemplate().cloneNode(true);
  applyColors(svg, counts);

  const viewport = document.createElement('div');
  viewport.className = 'stats-origin-map-viewport';
  viewport.setAttribute('role', 'img');
  viewport.setAttribute('aria-label', 'World origins map. Pinch or Ctrl+scroll to zoom. Double-click to reset.');

  viewport.appendChild(svg);

  host.className = 'stats-origin-map';
  host.replaceChildren(viewport);

  if (unmapped.length) {
    const note = document.createElement('p');
    note.className = 'stats-origin-unmapped';
    note.textContent = `${unmapped.length} origin${unmapped.length === 1 ? '' : 's'} not shown on map`;
    host.appendChild(note);
  }

  setupOriginMapZoom(viewport, svg);
  host.dataset.originMapSig = originsSignature(origins);
}

export function ensureWorldMapSvg() {
  if (worldMapSvgRaw) return Promise.resolve(worldMapSvgRaw);
  if (worldMapLoadFailed) return Promise.reject(new Error('World map unavailable'));
  if (!worldMapLoadPromise) {
    worldMapLoadPromise = fetch(`${import.meta.env.BASE_URL}world-map.svg`)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load world map');
        return response.text();
      })
      .then((text) => {
        worldMapSvgRaw = text;
        return text;
      })
      .catch((error) => {
        worldMapLoadFailed = true;
        throw error;
      });
  }
  return worldMapLoadPromise;
}

export function mountOriginMap(host, origins) {
  if (!host || !Array.isArray(origins)) return;

  const signature = originsSignature(origins);
  if (host.dataset.originMapSig === signature && !host.classList.contains('stats-origin-map-loading')) {
    return;
  }

  if (worldMapLoadFailed) {
    host.className = 'stats-origin-map';
    host.textContent = 'Map unavailable.';
    return;
  }

  if (!worldMapSvgRaw) {
    host.className = 'stats-origin-map stats-origin-map-loading';
    host.textContent = 'Loading map…';
    host.dataset.originMapSig = '';
    return;
  }

  if (mapMountInFlight) return;

  const token = ++mapMountToken;
  mapMountInFlight = true;

  requestAnimationFrame(() => {
    if (token !== mapMountToken) {
      mapMountInFlight = false;
      return;
    }

    try {
      paintOriginMap(host, origins);
    } finally {
      mapMountInFlight = false;
    }
  });
}

export function scheduleOriginMapMount(origins) {
  const host = document.getElementById('stats-origin-map-host');
  if (!host) return;

  if (worldMapSvgRaw) {
    mountOriginMap(host, origins);
    return;
  }

  if (worldMapLoadFailed) {
    mountOriginMap(host, origins);
    return;
  }

  mountOriginMap(host, origins);

  ensureWorldMapSvg()
    .then(() => {
      const nextHost = document.getElementById('stats-origin-map-host');
      if (nextHost) mountOriginMap(nextHost, origins);
    })
    .catch(() => {
      const nextHost = document.getElementById('stats-origin-map-host');
      if (nextHost) mountOriginMap(nextHost, origins);
    });
}
