import {
  recipeBlend,
  recipeFarmer,
  displayName,
  methodNames,
  drinkNames,
  getDrinkParams,
} from './utils.js';

export const PIN_FILTER_DIMENSIONS = [
  { id: 'blend', label: 'Blend' },
  { id: 'roaster', label: 'Roaster' },
  { id: 'farmer', label: 'Farmer' },
  { id: 'origin', label: 'Origin' },
  { id: 'variety', label: 'Variety' },
  { id: 'processing', label: 'Processing' },
  { id: 'roastType', label: 'Roast type' },
  { id: 'method', label: 'Brewing method' },
  { id: 'drink', label: 'Drink' },
  { id: 'gear', label: 'Gear' },
];

function normalizeValue(value) {
  return String(value ?? '').trim();
}

function recipeFieldValues(recipe, dimension) {
  switch (dimension) {
    case 'blend': {
      const blend = normalizeValue(recipeBlend(recipe));
      return blend ? [blend] : [];
    }
    case 'roaster': {
      const roaster = normalizeValue(recipe.roaster);
      return roaster ? [roaster] : [];
    }
    case 'farmer': {
      const farmer = normalizeValue(recipeFarmer(recipe));
      return farmer ? [farmer] : [];
    }
    case 'origin': {
      const origin = normalizeValue(recipe.origin);
      return origin ? [origin] : [];
    }
    case 'variety': {
      const variety = normalizeValue(recipe.variety);
      return variety ? [variety] : [];
    }
    case 'processing': {
      const processing = normalizeValue(recipe.processing);
      return processing ? [processing] : [];
    }
    case 'roastType': {
      const roastType = normalizeValue(recipe.roastType);
      return roastType ? [roastType] : [];
    }
    case 'method':
      return methodNames(recipe?.methods).map(normalizeValue).filter(Boolean);
    case 'drink':
      return methodNames(recipe?.methods)
        .flatMap((method) => drinkNames(recipe?.methods, method))
        .map(normalizeValue)
        .filter(Boolean);
    case 'gear':
      return methodNames(recipe?.methods)
        .flatMap((method) =>
          drinkNames(recipe?.methods, method).map((drink) => {
            const params = getDrinkParams(recipe, method, drink);
            return normalizeValue(params?.gear);
          })
        )
        .filter(Boolean);
    default:
      return [];
  }
}

export function filterKey(dimension, value) {
  return `${dimension}::${value}`;
}

export function parseFilterKey(key) {
  const [dimension, ...rest] = String(key).split('::');
  return { dimension, value: rest.join('::') };
}

export function normalizeAttrFilters(filters) {
  if (!Array.isArray(filters)) return [];
  const seen = new Set();
  const normalized = [];
  for (const entry of filters) {
    const dimension = String(entry?.dimension ?? '').trim();
    const value = normalizeValue(entry?.value);
    if (!dimension || !value) continue;
    const key = filterKey(dimension, value);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ dimension, value });
  }
  return normalized;
}

export function dimensionLabel(dimensionId) {
  return PIN_FILTER_DIMENSIONS.find((item) => item.id === dimensionId)?.label || dimensionId;
}

export function buildPinFilterOptions(recipes) {
  const options = Object.fromEntries(PIN_FILTER_DIMENSIONS.map(({ id }) => [id, new Set()]));
  for (const recipe of recipes || []) {
    for (const { id } of PIN_FILTER_DIMENSIONS) {
      for (const value of recipeFieldValues(recipe, id)) {
        options[id].add(value);
      }
    }
  }
  return Object.fromEntries(
    PIN_FILTER_DIMENSIONS.map(({ id }) => [
      id,
      [...options[id]].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    ])
  );
}

export function recipeMatchesAttrFilters(recipe, filters) {
  const active = normalizeAttrFilters(filters);
  if (!active.length) return true;

  const byDimension = new Map();
  for (const { dimension, value } of active) {
    if (!byDimension.has(dimension)) byDimension.set(dimension, new Set());
    byDimension.get(dimension).add(value);
  }

  for (const [dimension, values] of byDimension) {
    const recipeValues = new Set(recipeFieldValues(recipe, dimension));
    const matchesAny = [...values].some((value) => recipeValues.has(value));
    if (!matchesAny) return false;
  }

  return true;
}

export function toggleAttrFilter(filters, dimension, value) {
  const active = normalizeAttrFilters(filters);
  const key = filterKey(dimension, value);
  const idx = active.findIndex((entry) => filterKey(entry.dimension, entry.value) === key);
  if (idx >= 0) {
    active.splice(idx, 1);
    return active;
  }
  return [...active, { dimension, value: normalizeValue(value) }];
}

export function removeAttrFilter(filters, key) {
  const { dimension, value } = parseFilterKey(key);
  return normalizeAttrFilters(filters).filter(
    (entry) => filterKey(entry.dimension, entry.value) !== filterKey(dimension, value)
  );
}
