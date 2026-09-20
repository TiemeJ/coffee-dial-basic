import {
  recipeBlend,
  methodNames,
  drinkNames,
  getDrinkParams,
  isOnHomeScreen,
} from './utils.js';

const CHART_COLORS = [
  '#b08968',
  '#c4956a',
  '#8f6b4f',
  '#d4a574',
  '#7a5c44',
  '#e0b896',
  '#6b5344',
  '#a07858',
  '#5c4636',
  '#cdb49a',
];

function normalizeField(value) {
  const text = String(value ?? '').trim();
  return text || 'Unknown';
}

function caseKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function formatStatLabel(value) {
  const text = String(value ?? '').trim();
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function splitListField(value) {
  const text = String(value ?? '').trim();
  if (!text) return [];
  const parts = text
    .split(/[,&]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const seen = new Set();
  const unique = [];
  for (const part of parts) {
    const key = caseKey(part);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(part);
  }
  return unique;
}

function incrementCountEntry(counts, label) {
  const key = caseKey(label);
  const current = counts.get(key);
  if (current) {
    current.value += 1;
    return;
  }
  counts.set(key, { label: formatStatLabel(label), value: 1 });
}

function sortedCountEntries(counts) {
  return [...counts.values()].sort(
    (a, b) => b.value - a.value || a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
  );
}

function countByField(recipes, getter) {
  const counts = new Map();
  for (const recipe of recipes) {
    incrementCountEntry(counts, normalizeField(getter(recipe)));
  }
  return sortedCountEntries(counts);
}

function countBySplitField(recipes, getter) {
  const counts = new Map();
  for (const recipe of recipes) {
    for (const label of splitListField(getter(recipe))) {
      incrementCountEntry(counts, label);
    }
  }
  return sortedCountEntries(counts);
}

const MAX_CHART_SLICES = 8;

function groupSmallSlices(slices, maxSlices = MAX_CHART_SLICES) {
  if (slices.length <= maxSlices) return slices;
  const head = slices.slice(0, maxSlices - 1);
  const tail = slices.slice(maxSlices - 1);
  const otherValue = tail.reduce((sum, slice) => sum + slice.value, 0);
  return [...head, { label: 'Other', value: otherValue, otherEntries: tail }];
}

export function buildChartSlices(entries) {
  const grouped = groupSmallSlices(entries);
  const total = grouped.reduce((sum, slice) => sum + slice.value, 0) || 1;
  let cursor = 0;
  return grouped.map((slice, index) => {
    const start = (cursor / total) * 100;
    cursor += slice.value;
    const end = (cursor / total) * 100;
    const result = {
      ...slice,
      color: CHART_COLORS[index % CHART_COLORS.length],
      start,
      end,
      percent: Math.round((slice.value / total) * 100),
    };
    if (slice.label === 'Other' && slice.otherEntries) {
      result.otherEntries = slice.otherEntries;
    }
    return result;
  });
}

export function donutGradient(slices) {
  if (!slices.length) return 'conic-gradient(rgba(255,255,255,0.08) 0deg 360deg)';
  const parts = slices.map((slice) => `${slice.color} ${slice.start}% ${slice.end}%`);
  return `conic-gradient(${parts.join(', ')})`;
}

function countDrinks(recipes) {
  let total = 0;
  let rated = 0;
  for (const recipe of recipes) {
    for (const method of methodNames(recipe?.methods)) {
      for (const drink of drinkNames(recipe?.methods, method)) {
        total += 1;
        const params = getDrinkParams(recipe, method, drink);
        if (params?.rating != null && params.rating !== '') rated += 1;
      }
    }
  }
  return { total, rated };
}

export function collectFiveStarDrinks(recipes) {
  const rows = [];
  for (const recipe of recipes) {
    for (const method of methodNames(recipe?.methods)) {
      for (const drink of drinkNames(recipe?.methods, method)) {
        const params = getDrinkParams(recipe, method, drink);
        const rating = Math.min(5, Math.max(0, Math.round(Number(params?.rating) || 0)));
        if (rating !== 5) continue;
        rows.push({
          recipeId: recipe.id,
          methodName: method,
          drinkName: drink,
          blend: recipeBlend(recipe),
          roaster: normalizeField(recipe.roaster),
          drink,
        });
      }
    }
  }
  return rows.sort(
    (a, b) =>
      a.blend.localeCompare(b.blend, undefined, { sensitivity: 'base' }) ||
      a.roaster.localeCompare(b.roaster, undefined, { sensitivity: 'base' }) ||
      a.drink.localeCompare(b.drink, undefined, { sensitivity: 'base' })
  );
}

function buildChartData(entries) {
  const items = entries.filter((entry) => entry.label !== 'Unknown');
  return {
    uniqueCount: items.length,
    slices: buildChartSlices(items),
    entries: items,
  };
}

export function computeLibraryStats(recipes) {
  const list = Array.isArray(recipes) ? recipes : [];
  const drinkCounts = countDrinks(list);
  const origins = countBySplitField(list, (recipe) => recipe.origin);

  return {
    totalCoffees: list.length,
    onHomeCount: list.filter(isOnHomeScreen).length,
    totalDrinks: drinkCounts.total,
    ratedDrinks: drinkCounts.rated,
    fiveStarDrinks: collectFiveStarDrinks(list),
    charts: {
      roaster: buildChartData(countBySplitField(list, (recipe) => recipe.roaster)),
      variety: buildChartData(countBySplitField(list, (recipe) => recipe.variety)),
      processing: buildChartData(countBySplitField(list, (recipe) => recipe.processing)),
      roastType: buildChartData(countBySplitField(list, (recipe) => recipe.roastType)),
    },
    origins,
  };
}
