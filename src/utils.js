const METHOD_FIELDS = [
  { key: 'dose', label: 'In (g)', stat: 'in' },
  { key: 'out', label: 'Out (g)', stat: 'out' },
  { key: 'ratio', label: 'Ratio', stat: 'ratio' },
  { key: 'grind', label: 'Grind' },
  { key: 'time', label: 'Time (s)', stat: 'time' },
  { key: 'temp', label: 'Temp', stat: 'temp' },
  { key: 'gear', label: 'Grinder', stat: 'gear' },
  { key: 'drink', label: 'Drink', stat: 'drink' },
  { key: 'notes', label: 'Notes', block: 'notes' },
  { key: 'improve', label: 'Improve', block: 'improve' },
  { key: 'rating', label: 'Rating', type: 'number' },
];

/** Blend value, with legacy fallbacks (old "Blend / farmer" or coffee name). */
export function recipeBlend(recipe) {
  if (recipe?.blend?.trim()) return recipe.blend.trim();
  if (recipe?.farmer?.trim()) return recipe.farmer.trim();
  const name = recipe?.name?.trim() || '';
  if (!name) return '';
  if (name.includes(' - ')) return name.split(' - ')[0].trim();
  return name;
}

/** Farmer value — only when `blend` is stored separately (new model). */
export function recipeFarmer(recipe) {
  if (recipe?.blend?.trim()) return recipe?.farmer?.trim() || '';
  return '';
}

export function generateCoffeeName(data) {
  const blend = recipeBlend(data);
  const roaster = data?.roaster?.trim() || '';
  if (blend && roaster) return `${blend} - ${roaster}`;
  if (blend) return blend;
  if (roaster) return roaster;
  return '';
}

export function displayName(recipe) {
  return (
    recipeBlend(recipe) ||
    recipe.name?.trim() ||
    recipe.variety?.trim() ||
    'Untitled'
  );
}

export function displaySubtitle(recipe) {
  const roaster = recipe.roaster?.trim();
  if (roaster && roaster !== displayName(recipe)) return roaster;
  const farmer = recipeFarmer(recipe);
  if (farmer) return farmer;
  return recipe.origin?.trim() || '';
}

const COFFEE_INFO_FIELDS = ['name', 'blend', 'roaster', 'farmer', 'origin', 'variety', 'processing', 'roastType'];

export function isDecafCoffee(recipe) {
  return COFFEE_INFO_FIELDS.some((field) => String(recipe?.[field] ?? '').toLowerCase().includes('decaf'));
}

export function recipeSearchText(recipe) {
  const methods = methodNames(recipe?.methods);
  const drinks = methods.flatMap((method) => drinkNames(recipe?.methods, method));
  return [
    displayName(recipe),
    displaySubtitle(recipe),
    recipe?.name,
    recipe?.blend,
    recipe?.roaster,
    recipe?.farmer,
    recipe?.origin,
    recipe?.variety,
    recipe?.processing,
    recipe?.roastType,
    ...methods,
    ...drinks,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export const ROAST_TYPES = ['Light', 'Medium', 'Medium-Dark', 'Dark'];

export const BREWING_METHODS = [
  'Espresso',
  'V60',
  'Hario Switch',
  'Clever Dripper',
  'Aeropress',
  'OXO',
  'French Press',
  'Chemex',
  'Other',
];

const METHOD_DISPLAY_NAMES = {
  'Hario Switch': 'Switch',
  'Clever Dripper': 'Dripper',
  'French Press': 'Press',
};

export function displayMethodName(name) {
  const value = String(name ?? '').trim();
  return METHOD_DISPLAY_NAMES[value] || value;
}

export const DRINKS = [
  'Espresso',
  'Lungo',
  'Americano',
  'Cappuccino',
  'Flat White',
  'Macchiato',
  'Latte Macchiato',
  'Filter Coffee',
  'Soup',
  'Soup americano',
  'Soup lungo',
  'Soup flat white',
  'Other',
];

export function presetSelection(value, options) {
  const v = String(value ?? '').trim();
  if (!v) return { preset: '', custom: '' };
  if (options.includes(v)) return { preset: v, custom: '' };
  return { preset: 'Other', custom: v };
}

export function resolvePresetValue(preset, custom) {
  const p = String(preset ?? '').trim();
  if (!p) return '';
  if (p === 'Other') return String(custom ?? '').trim();
  return p;
}

export function beanFieldsFromRecipe(recipe) {
  return {
    blend: recipeBlend(recipe),
    roaster: recipe.roaster || '',
    farmer: recipeFarmer(recipe),
    origin: recipe.origin || '',
    variety: recipe.variety || '',
    processing: recipe.processing || '',
    roastType: recipe.roastType || '',
    roasterUrl: recipe.roasterUrl || '',
  };
}

/** Normalize a pasted URL for storage / opening (adds https:// when missing). */
export function normalizeRoasterUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

const DRINK_PARAM_KEYS = ['dose', 'out', 'grind', 'time', 'temp', 'gear', 'ratio', 'notes', 'improve', 'rating'];

export function isDrinkParams(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return DRINK_PARAM_KEYS.some((k) => k in obj) || 'drink' in obj;
}

export function isDrinksMap(obj) {
  if (!obj || typeof obj !== 'object' || isDrinkParams(obj)) return false;
  const values = Object.values(obj);
  if (!values.length) return false;
  return values.every((v) => v && typeof v === 'object' && isDrinkParams(v));
}

/** Old: methods[method] = { dose, drink, ... } → New: methods[method][drink] = { dose, ... } */
export function normalizeMethods(methods) {
  if (!methods || typeof methods !== 'object') return {};
  const result = {};
  for (const [methodName, methodData] of Object.entries(methods)) {
    if (isDrinkParams(methodData)) {
      const drinkName = String(methodData.drink || '').trim() || 'Default';
      const { drink, ...params } = methodData;
      result[methodName] = { [drinkName]: params };
    } else if (isDrinksMap(methodData)) {
      const drinks = {};
      for (const [drinkName, params] of Object.entries(methodData)) {
        const { drink, ...clean } = params;
        drinks[drinkName] = clean;
      }
      result[methodName] = drinks;
    }
  }
  return result;
}

export function normalizeRecipe(recipe) {
  if (!recipe) return recipe;
  return { ...recipe, methods: normalizeMethods(recipe.methods) };
}

export function methodNames(methods) {
  if (!methods || typeof methods !== 'object') return [];
  return Object.keys(normalizeMethods(methods)).sort((a, b) => a.localeCompare(b));
}

export function drinkNames(methods, methodName) {
  const normalized = normalizeMethods(methods);
  const drinks = normalized[methodName];
  if (!drinks || typeof drinks !== 'object') return [];
  return Object.keys(drinks).sort((a, b) => a.localeCompare(b));
}

export function applyNameOrder(names, order) {
  const unique = [...new Set(names)];
  if (!Array.isArray(order) || !order.length) {
    return unique.sort((a, b) => a.localeCompare(b));
  }
  const nameSet = new Set(unique);
  const sorted = order.filter((name) => nameSet.has(name));
  const rest = unique.filter((name) => !order.includes(name)).sort((a, b) => a.localeCompare(b));
  return [...sorted, ...rest];
}

export function orderedMethodNames(recipe) {
  return applyNameOrder(Object.keys(normalizeMethods(recipe?.methods)), recipe?.methodOrder);
}

export function orderedDrinkNames(recipe, methodName) {
  const normalized = normalizeMethods(recipe?.methods);
  const names = Object.keys(normalized[methodName] || {});
  return applyNameOrder(names, recipe?.drinkOrder?.[methodName]);
}

export function mergeVisibleOrder(allNames, savedOrder, newVisibleOrder, visibleNames) {
  const visibleSet = new Set(visibleNames);
  const baseOrder = applyNameOrder(allNames, savedOrder);
  const result = [];
  let vi = 0;
  for (const name of baseOrder) {
    if (visibleSet.has(name)) {
      if (vi < newVisibleOrder.length) result.push(newVisibleOrder[vi++]);
    } else {
      result.push(name);
    }
  }
  while (vi < newVisibleOrder.length) {
    const name = newVisibleOrder[vi++];
    if (!result.includes(name)) result.push(name);
  }
  for (const name of allNames) {
    if (!result.includes(name)) result.push(name);
  }
  return result;
}

export function appendToNameOrder(order, name) {
  const next = Array.isArray(order) ? order.filter((n) => n !== name) : [];
  next.push(name);
  return next;
}

export function renameInNameOrder(order, oldName, newName) {
  if (!Array.isArray(order)) return [newName];
  return order.map((n) => (n === oldName ? newName : n));
}

export function removeFromNameOrder(order, name) {
  if (!Array.isArray(order)) return [];
  return order.filter((n) => n !== name);
}

export function renameMethodInDrinkOrder(drinkOrder, oldMethod, newMethod) {
  if (!drinkOrder || !drinkOrder[oldMethod]) return drinkOrder;
  const next = { ...drinkOrder };
  next[newMethod] = next[oldMethod];
  delete next[oldMethod];
  return next;
}

export function removeMethodFromDrinkOrder(drinkOrder, methodName) {
  if (!drinkOrder?.[methodName]) return drinkOrder;
  const next = { ...drinkOrder };
  delete next[methodName];
  return next;
}

export function beanFingerprint(data) {
  const blend = data.blend?.trim() || recipeBlend(data);
  const farmer = data.blend?.trim() ? data.farmer?.trim() || '' : recipeFarmer(data);
  return [blend, data.roaster, farmer, data.origin, data.variety, data.processing, data.roastType]
    .map((s) => String(s || '').trim().toLowerCase())
    .join('|');
}

export function findMatchingRecipe(recipes, beanData) {
  const target = beanFingerprint(beanData);
  if (!target.replace(/\|/g, '')) return null;
  return recipes.find((r) => beanFingerprint(r) === target) || null;
}

export function mergeDrinkIntoMethods(methods, methodName, drinkName, drinkParams) {
  const normalized = normalizeMethods(methods);
  if (!methodName || !drinkName) return normalized;
  if (!normalized[methodName]) normalized[methodName] = {};
  normalized[methodName][drinkName] = drinkParams;
  return normalized;
}

export function renameMethodInMethods(methods, oldName, newName) {
  const normalized = normalizeMethods(methods);
  if (!oldName || !newName || oldName === newName) return normalized;
  const oldDrinks = normalized[oldName];
  if (!oldDrinks) return normalized;
  if (!normalized[newName]) normalized[newName] = {};
  Object.assign(normalized[newName], oldDrinks);
  delete normalized[oldName];
  return normalized;
}

export function renameMethodInPin(pin, oldName, newName) {
  if (!pin?.methods || !oldName || !newName || oldName === newName) return pin;
  const methods = { ...pin.methods };
  if (!methods[oldName]) return pin;
  methods[newName] = methods[oldName];
  delete methods[oldName];
  return { ...pin, methods };
}

export function appendToPin(pin, methodName, drinkName) {
  if (!methodName || !drinkName) return pin;
  const methods = { ...(pin?.methods || {}) };
  const drinks = Array.isArray(methods[methodName]) ? [...methods[methodName]] : [];
  if (!drinks.includes(drinkName)) drinks.push(drinkName);
  drinks.sort((a, b) => a.localeCompare(b));
  methods[methodName] = drinks;
  return { methods };
}

export function deleteDrinkFromMethods(methods, methodName, drinkName) {
  const normalized = normalizeMethods(methods);
  if (!normalized[methodName]?.[drinkName]) return normalized;
  delete normalized[methodName][drinkName];
  if (!Object.keys(normalized[methodName]).length) delete normalized[methodName];
  return normalized;
}

export function removeDrinkFromPinMethods(pinMethods, methodName, drinkName) {
  const result = { ...(pinMethods || {}) };
  if (!Array.isArray(result[methodName])) return result;
  result[methodName] = result[methodName].filter((d) => d !== drinkName);
  if (!result[methodName].length) delete result[methodName];
  return result;
}

/** Apply saved drink params to one drink or every drink under a method. */
export function applyDrinkSave(methods, methodName, drinkName, drinkParams, scope, prevDrink = null) {
  const normalized = normalizeMethods(methods);
  if (!methodName || !drinkName) return normalized;
  if (!normalized[methodName]) normalized[methodName] = {};

  if (scope === 'all') {
    const drinks = drinkNames(normalized, methodName);
    for (const d of drinks) {
      normalized[methodName][d] = { ...drinkParams };
    }
    return normalized;
  }

  if (prevDrink && prevDrink !== drinkName && normalized[methodName][prevDrink]) {
    delete normalized[methodName][prevDrink];
  }
  normalized[methodName][drinkName] = drinkParams;
  return normalized;
}

export function getDrinkParams(recipe, methodName, drinkName) {
  const methods = normalizeMethods(recipe?.methods);
  return methods[methodName]?.[drinkName] || null;
}

export function hasActivePin(recipe) {
  const methods = recipe?.pin?.methods;
  if (!methods || typeof methods !== 'object') return false;
  return Object.values(methods).some((drinks) => Array.isArray(drinks) && drinks.length > 0);
}

export function isOnHomeScreen(recipe) {
  return hasActivePin(recipe) || recipe.isOpen !== false;
}

export function applyHomeOrder(recipes, order) {
  if (!Array.isArray(order) || !order.length) return recipes;
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const sorted = [];
  for (const id of order) {
    const recipe = byId.get(id);
    if (recipe) {
      sorted.push(recipe);
      byId.delete(id);
    }
  }
  const rest = [...byId.values()].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return [...sorted, ...rest];
}

export function getPinnedPairs(recipe) {
  const pairs = [];
  const pinned = recipe?.pin?.methods;
  if (!pinned) return pairs;
  const normalized = normalizeMethods(recipe.methods);
  for (const [method, drinks] of Object.entries(pinned)) {
    if (!Array.isArray(drinks)) continue;
    for (const drink of drinks) {
      if (normalized[method]?.[drink]) pairs.push({ method, drink });
    }
  }
  return pairs.sort((a, b) =>
    a.method.localeCompare(b.method) || a.drink.localeCompare(b.drink)
  );
}

export function visibleMethodNames(recipe) {
  const ordered = orderedMethodNames(recipe);
  if (hasActivePin(recipe)) {
    const pinned = new Set(getPinnedPairs(recipe).map((p) => p.method));
    return ordered.filter((method) => pinned.has(method));
  }
  return ordered;
}

export function visibleDrinkNames(recipe, methodName) {
  const ordered = orderedDrinkNames(recipe, methodName);
  if (hasActivePin(recipe)) {
    const drinks = recipe?.pin?.methods?.[methodName];
    if (!Array.isArray(drinks)) return [];
    const pinned = new Set(drinks);
    const normalized = normalizeMethods(recipe?.methods);
    return ordered.filter((drink) => pinned.has(drink) && normalized[methodName]?.[drink]);
  }
  return ordered;
}

export function resolveVisibleSelection(recipe, methodName = null, drinkName = null) {
  const methods = visibleMethodNames(recipe);
  const activeMethod =
    methodName && methods.includes(methodName) ? methodName : methods[0] || null;
  const drinks = activeMethod ? visibleDrinkNames(recipe, activeMethod) : [];
  const activeDrink =
    drinkName && drinks.includes(drinkName) ? drinkName : drinks[0] || null;
  return { activeMethod, activeDrink };
}

export function buildPinMethodsFromForm(form) {
  const pinMethods = {};
  form.querySelectorAll('input[data-pin-method]:checked').forEach((input) => {
    const method = input.dataset.pinMethod;
    const drink = input.dataset.pinDrink;
    if (!pinMethods[method]) pinMethods[method] = [];
    pinMethods[method].push(drink);
  });
  for (const method of Object.keys(pinMethods)) {
    pinMethods[method].sort((a, b) => a.localeCompare(b));
  }
  return pinMethods;
}

export function buildFullPinMethods(recipe) {
  const normalized = normalizeMethods(recipe?.methods);
  const pinMethods = {};
  for (const method of orderedMethodNames(recipe)) {
    const drinks = orderedDrinkNames(recipe, method);
    if (drinks.length) pinMethods[method] = drinks;
  }
  return pinMethods;
}

export function isPinChecked(recipe, method, drink) {
  const normalized = normalizeMethods(recipe?.methods);
  if (!normalized[method]?.[drink]) return false;

  if (hasActivePin(recipe)) {
    const drinks = recipe?.pin?.methods?.[method];
    return Array.isArray(drinks) && drinks.includes(drink);
  }

  // Open on home without a pin filter: all saved methods/drinks are visible
  return recipe.isOpen !== false;
}

export function emptyDrinkParams() {
  return {
    dose: '',
    out: '',
    grind: '',
    time: '',
    temp: '',
    gear: '',
    ratio: '',
    notes: '',
    improve: '',
    rating: '',
  };
}

export function buildDrinkParamsFromForm(fd) {
  const dose = String(fd.get('dose') ?? '').trim();
  const out = String(fd.get('out') ?? '').trim();
  const ratio = computeRatio(dose, out);
  const params = {};
  for (const key of ['dose', 'out', 'grind', 'time', 'temp', 'gear']) {
    const val = String(fd.get(key) ?? '').trim();
    if (val) params[key] = val;
  }
  if (ratio) params.ratio = ratio;
  const rating = String(fd.get('rating') ?? '').trim();
  if (rating) params.rating = Number(rating);
  const notes = String(fd.get('notes') ?? '').trim();
  const improve = String(fd.get('improve') ?? '').trim();
  if (notes) params.notes = notes;
  if (improve) params.improve = improve;
  return params;
}

/** @deprecated use emptyDrinkParams */
export function emptyMethod() {
  return emptyDrinkParams();
}

export function formatRatioNumber(value) {
  const n = parseFloat(String(value).replace(',', '.'));
  if (Number.isNaN(n)) return '';
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function computeRatio(dose, out) {
  const d = parseFloat(String(dose).replace(',', '.'));
  const o = parseFloat(String(out).replace(',', '.'));
  if (d > 0 && o > 0) {
    return formatRatioNumber(o / d);
  }
  return '';
}

export function formatRatioDisplay(dose, out, storedRatio) {
  const computed = computeRatio(dose, out);
  if (computed) return `1 : ${computed}`;
  if (storedRatio) return formatRatio({ ratio: storedRatio });
  return '1 : —';
}

export function formatRatio(method) {
  const computed = computeRatio(method.dose, method.out);
  if (computed) return `1:${computed}`;
  if (method.ratio) {
    const r = String(method.ratio).trim();
    if (r.includes(':')) {
      const numPart = r.split(':').pop();
      const formatted = formatRatioNumber(numPart);
      if (formatted) return `1:${formatted}`;
      return r.startsWith('1:') ? r : `1:${r}`;
    }
    const n = parseFloat(r);
    if (!Number.isNaN(n)) return `1:${formatRatioNumber(n)}`;
    return r;
  }
  return '—';
}

export function renderStarPicker(rating, inputName = 'rating') {
  const current = Math.min(5, Math.max(0, Math.round(Number(rating) || 0)));
  const stars = Array.from({ length: 5 }, (_, i) => {
    const val = i + 1;
    const filled = val <= current;
    return `<button type="button" class="star-picker-btn ${filled ? 'active' : ''}" data-rating="${val}" aria-label="${val} stars">
      <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
    </button>`;
  }).join('');
  return `<div class="star-picker" data-rating-input="${inputName}">${stars}<input type="hidden" name="${inputName}" value="${current || ''}" /></div>`;
}

export function renderStars(rating) {
  const n = Math.min(5, Math.max(0, Math.round(Number(rating) || 0)));
  return Array.from({ length: 5 }, (_, i) =>
    i < n
      ? '<svg class="star star-filled" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
      : '<svg class="star" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
  ).join('');
}

export function formatStatValue(key, value) {
  if (value === undefined || value === null || value === '') return '—';
  const s = String(value);
  if (key === 'dose' || key === 'out') return `${s}g`;
  if (key === 'time') return formatTimeDisplay(value);
  return s;
}

export function formatTimeDisplay(value) {
  if (value === undefined || value === null || value === '') return '—';
  const s = String(value).trim();
  if (/m\s/.test(s) || /:\d/.test(s)) return s;
  const sec = parseFloat(s.replace(',', '.'));
  if (Number.isNaN(sec)) return s.endsWith('s') ? s : `${s}s`;
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const rem = Math.round(sec % 60);
    return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  }
  return `${Math.round(sec)}s`;
}

export function formatTempDisplay(value) {
  if (value === undefined || value === null || value === '') return '—';
  const s = String(value).trim();
  const n = parseFloat(s);
  if (!Number.isNaN(n) && /^\d+(\.\d+)?$/.test(s)) return `${n}°C`;
  return s;
}

export { METHOD_FIELDS };

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

export function initials(name) {
  return (name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
