import {
  normalizeMethods,
  drinkNames,
  orderedDrinkNames,
  displayMethodName,
  hasActivePin,
} from './utils.js';

function caseKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

const ESPRESSO_METHOD_KEYS = new Set(['espresso', 'manual espresso']);

export function isEspressoMethod(methodName) {
  return ESPRESSO_METHOD_KEYS.has(caseKey(methodName));
}

/** Storage keys use `Flat White`, `Flat White 2`, … (never `… 1`). */
export function drinkFamilyBaseName(drinkKey) {
  const trimmed = String(drinkKey ?? '').trim();
  const match = trimmed.match(/^(.+?) (\d+)$/);
  if (match && Number(match[2]) >= 2) return match[1];
  return trimmed;
}

export function drinksInSameFamily(recipe, methodName, drinkKey) {
  const base = caseKey(drinkFamilyBaseName(drinkKey));
  return orderedDrinkNames(recipe, methodName).filter(
    (key) => caseKey(drinkFamilyBaseName(key)) === base
  );
}

export function pinnedDrinksInFamily(recipe, methodName, drinkKey) {
  const family = drinksInSameFamily(recipe, methodName, drinkKey);
  const pinned = recipe?.pin?.methods?.[methodName];
  if (!Array.isArray(pinned)) return [];
  return family.filter((key) => pinned.includes(key));
}

export function espressoSetupKey(params) {
  return `${caseKey(params?.gear || '')}\0${caseKey(params?.basket || '')}`;
}

function isDrinkFamilyMember(drinkKey, familyBase) {
  return caseKey(drinkFamilyBaseName(drinkKey)) === caseKey(familyBase);
}

export function findDrinkKeyBySetupInFamily(methods, methodName, familyBase, params) {
  const target = espressoSetupKey(params);
  const normalized = normalizeMethods(methods);
  for (const [key, drink] of Object.entries(normalized[methodName] || {})) {
    if (!isDrinkFamilyMember(key, familyBase)) continue;
    if (espressoSetupKey(drink) === target) return key;
  }
  return null;
}

export function allocateDrinkKeyInFamily(methods, methodName, familyBase) {
  const names = drinkNames(methods, methodName);
  const base = String(familyBase ?? '').trim();
  if (!base) return base;
  const familyKeys = names.filter((key) => isDrinkFamilyMember(key, base));
  if (!familyKeys.length) return base;
  if (!familyKeys.some((key) => caseKey(key) === caseKey(base))) return base;
  let index = 2;
  while (names.includes(index === 2 ? `${base} 2` : `${base} ${index}`)) {
    index += 1;
  }
  return index === 2 ? `${base} 2` : `${base} ${index}`;
}

export function resolveEspressoTargetDrinkKey(
  methods,
  methodName,
  drinkName,
  drinkParams,
  { prevDrink = null, addMode = false } = {}
) {
  const normalized = normalizeMethods(methods);
  const familyBase = drinkFamilyBaseName(drinkName);
  const existingKey = findDrinkKeyBySetupInFamily(normalized, methodName, familyBase, drinkParams);
  if (existingKey) return existingKey;
  if (addMode) return allocateDrinkKeyInFamily(normalized, methodName, familyBase);

  if (
    prevDrink &&
    isDrinkFamilyMember(prevDrink, familyBase) &&
    normalized[methodName]?.[prevDrink]
  ) {
    const prevSetup = espressoSetupKey(normalized[methodName][prevDrink]);
    const newSetup = espressoSetupKey(drinkParams);
    if (prevSetup === newSetup) return prevDrink;
  }

  return allocateDrinkKeyInFamily(normalized, methodName, familyBase);
}

export const ESPRESSO_SETUP_FIELD_KEYS = [
  'gear',
  'basket',
  'grind',
  'temp',
  'dose',
  'out',
  'ratio',
  'time',
];

export function describeEspressoSetup(params) {
  const gear = String(params?.gear ?? '').trim();
  const basket = String(params?.basket ?? '').trim();
  if (gear && basket) return `${gear} / ${basket}`;
  if (gear) return gear;
  if (basket) return basket;
  return 'this grinder setup';
}

export function drinksWithSameSetup(methods, methodName, params, { exceptKey = null } = {}) {
  const target = espressoSetupKey(params);
  const normalized = normalizeMethods(methods);
  const keys = [];
  for (const [key, drink] of Object.entries(normalized[methodName] || {})) {
    if (exceptKey && key === exceptKey) continue;
    if (espressoSetupKey(drink) === target) keys.push(key);
  }
  return keys;
}

export function espressoSetupFieldsChanged(prevDrink, nextParams) {
  for (const key of ESPRESSO_SETUP_FIELD_KEYS) {
    const a = String(prevDrink?.[key] ?? '').trim();
    const b = String(nextParams?.[key] ?? '').trim();
    if (a !== b) return true;
  }
  return false;
}

export function applySetupFieldsToMatchingDrinks(
  methods,
  methodName,
  setupSource,
  { exceptKey = null } = {}
) {
  const normalized = normalizeMethods(methods);
  const target = espressoSetupKey(setupSource);
  for (const [key, drink] of Object.entries(normalized[methodName] || {})) {
    if (exceptKey && key === exceptKey) continue;
    if (espressoSetupKey(drink) !== target) continue;
    const next = { ...drink };
    for (const field of ESPRESSO_SETUP_FIELD_KEYS) {
      const val = String(setupSource?.[field] ?? '').trim();
      if (val) next[field] = val;
      else delete next[field];
    }
    normalized[methodName][key] = next;
  }
  return normalized;
}

export function applyEspressoDrinkSave(
  methods,
  methodName,
  drinkName,
  drinkParams,
  { prevDrink = null, addMode = false } = {}
) {
  const normalized = normalizeMethods(methods);
  if (!normalized[methodName]) normalized[methodName] = {};

  const targetKey = resolveEspressoTargetDrinkKey(normalized, methodName, drinkName, drinkParams, {
    prevDrink,
    addMode,
  });
  const existingKey = findDrinkKeyBySetupInFamily(
    normalized,
    methodName,
    drinkFamilyBaseName(drinkName),
    drinkParams
  );

  const familyBase = drinkFamilyBaseName(drinkName);
  const removeKeys = [];
  if (
    existingKey &&
    prevDrink &&
    prevDrink !== targetKey &&
    normalized[methodName][prevDrink] &&
    isDrinkFamilyMember(prevDrink, familyBase)
  ) {
    removeKeys.push(prevDrink);
  }

  for (const key of removeKeys) {
    delete normalized[methodName][key];
  }

  normalized[methodName][targetKey] = { ...drinkParams };

  if (!Object.keys(normalized[methodName]).length) delete normalized[methodName];

  return {
    methods: normalized,
    targetDrinkKey: targetKey,
    removedDrinkKeys: removeKeys,
  };
}

function displayFamilyTabLabel(recipe, methodName, drinkKey) {
  const base = drinkFamilyBaseName(drinkKey);
  const family = drinksInSameFamily(recipe, methodName, drinkKey);
  if (family.length <= 1) return base;
  const index = family.indexOf(drinkKey);
  return index >= 0 ? `${base} ${index + 1}` : drinkKey;
}

function displayFamilyCardLabel(recipe, methodName, drinkKey) {
  const base = drinkFamilyBaseName(drinkKey);
  const pinnedFamily = pinnedDrinksInFamily(recipe, methodName, drinkKey);
  if (pinnedFamily.length <= 1) return base;
  const index = pinnedFamily.indexOf(drinkKey);
  if (index >= 0) return `${base} ${index + 1}`;
  return displayFamilyTabLabel(recipe, methodName, drinkKey);
}

export function displayEspressoTabLabel(recipe, methodName, drinkKey) {
  if (!isEspressoMethod(methodName)) return drinkKey;
  return displayFamilyTabLabel(recipe, methodName, drinkKey);
}

export function displayEspressoCardLabel(recipe, methodName, drinkKey) {
  if (!isEspressoMethod(methodName)) return drinkKey;
  return displayFamilyCardLabel(recipe, methodName, drinkKey);
}

export function displayDrinkLabel(recipe, methodName, drinkKey, context = 'tab') {
  if (context === 'card') return displayEspressoCardLabel(recipe, methodName, drinkKey);
  return displayEspressoTabLabel(recipe, methodName, drinkKey);
}

export function displayPinnedAwareDrinkLabel(recipe, methodName, drinkKey) {
  const context = hasActivePin(recipe) ? 'card' : 'tab';
  return displayDrinkLabel(recipe, methodName, drinkKey, context);
}

export function deleteDrinkConfirmLabel(methodName, drinkKey) {
  if (isEspressoMethod(methodName)) return drinkFamilyBaseName(drinkKey);
  return drinkKey;
}

export function formatEspressoGrinderStat(drink) {
  const gear = String(drink?.gear ?? '').trim();
  const basket = String(drink?.basket ?? '').trim();
  const grind = String(drink?.grind ?? '').trim() || '—';

  if (!basket) {
    return {
      label: gear || 'Grinder',
      value: grind,
    };
  }

  const gearPart = gear || '—';
  return {
    label: `${gearPart}/${basket}`,
    value: grind,
  };
}

export function buildCoffeeCardPinFromForm(form) {
  const pinMethods = {};
  form.querySelectorAll('input[data-coffee-card-pin]:checked').forEach((input) => {
    const method = input.dataset.pinMethod;
    const drink = input.dataset.pinDrink;
    if (!method || !drink) return;
    if (!pinMethods[method]) pinMethods[method] = [];
    pinMethods[method].push(drink);
  });
  for (const method of Object.keys(pinMethods)) {
    pinMethods[method].sort((a, b) => a.localeCompare(b));
  }
  return Object.keys(pinMethods).length ? { methods: pinMethods } : undefined;
}

export function updatePinForDrinkChanges(pin, methodName, { removedDrinkKeys = [], prevDrink = null, nextDrink = null } = {}) {
  if (!pin?.methods?.[methodName]) return pin;
  const methods = { ...pin.methods };
  let drinks = [...methods[methodName]];

  for (const removed of removedDrinkKeys) {
    drinks = drinks.filter((drink) => drink !== removed);
  }

  if (prevDrink && nextDrink && prevDrink !== nextDrink) {
    drinks = drinks.map((drink) => (drink === prevDrink ? nextDrink : drink));
    drinks = [...new Set(drinks)];
  }

  if (drinks.length) {
    methods[methodName] = drinks.sort((a, b) => a.localeCompare(b));
  } else {
    delete methods[methodName];
  }

  return Object.keys(methods).length ? { ...pin, methods } : undefined;
}

export function renderCoffeeCardSection(recipe, escapeHtml) {
  const methods = orderedDrinkNames(recipe);
  if (!methods.length) return '';

  const rows = methods
    .flatMap((methodName) => {
      const drinks = orderedDrinkNames(recipe, methodName);
      return drinks.map((drinkKey) => {
        const label = displayDrinkLabel(recipe, methodName, drinkKey, 'card');
        const checked = recipe?.pin?.methods?.[methodName]?.includes(drinkKey);
        return `
        <label class="coffee-card-row">
          <input
            type="checkbox"
            data-coffee-card-pin
            data-pin-method="${escapeHtml(methodName)}"
            data-pin-drink="${escapeHtml(drinkKey)}"
            ${checked ? 'checked' : ''}
          />
          <span class="coffee-card-method">${escapeHtml(displayMethodName(methodName))}</span>
          <span class="coffee-card-drink">${escapeHtml(label)}</span>
        </label>`;
      });
    })
    .join('');

  return `
    <div class="coffee-card-section">
      <h3 class="coffee-card-title">Coffee card</h3>
      <p class="field-hint">Choose which drinks appear on the home coffee card.</p>
      <div class="coffee-card-list">${rows}</div>
    </div>`;
}
