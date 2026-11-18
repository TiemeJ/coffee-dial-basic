import {
  normalizeMethods,
  orderedMethodNames,
  orderedDrinkNames,
  displayName,
} from './utils.js';

function gearKey(gear) {
  return String(gear ?? '').trim().toLowerCase();
}

export function collectGearNames(recipes) {
  const byKey = new Map();
  for (const recipe of recipes || []) {
    const methods = normalizeMethods(recipe.methods);
    for (const methodName of orderedMethodNames(recipe)) {
      for (const drinkName of orderedDrinkNames(recipe, methodName)) {
        const gear = String(methods[methodName]?.[drinkName]?.gear ?? '').trim();
        if (!gear) continue;
        const key = gearKey(gear);
        if (!byKey.has(key)) byKey.set(key, gear);
      }
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

export function parseGrindNumber(value) {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function formatGrindNumber(n) {
  if (!Number.isFinite(n)) return '';
  const rounded = Math.round(n * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function parseGrindOffsetDelta(value) {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @returns {{ changes: Array, skipped: Array, recipeUpdates: Map<string, object>, delta: number, gearName: string }}
 */
export function buildGrindOffsetPlan(recipes, gearName, delta) {
  const targetKey = gearKey(gearName);
  const changes = [];
  const skipped = [];
  const recipeUpdates = new Map();

  for (const recipe of recipes || []) {
    const methods = normalizeMethods(recipe.methods);
    for (const methodName of orderedMethodNames(recipe)) {
      for (const drinkName of orderedDrinkNames(recipe, methodName)) {
        const params = methods[methodName]?.[drinkName];
        if (!params) continue;
        if (gearKey(params.gear) !== targetKey) continue;

        const oldGrind = String(params.grind ?? '').trim();
        const parsed = parseGrindNumber(oldGrind);
        if (parsed === null) {
          skipped.push({
            recipeId: recipe.id,
            coffeeLabel: displayName(recipe),
            methodName,
            drinkName,
            grind: oldGrind || '—',
            reason: 'grind is not a number',
          });
          continue;
        }

        const next = parsed + delta;
        if (next < 0) {
          skipped.push({
            recipeId: recipe.id,
            coffeeLabel: displayName(recipe),
            methodName,
            drinkName,
            grind: oldGrind,
            reason: 'would be below zero',
          });
          continue;
        }

        const newGrind = formatGrindNumber(next);
        if (newGrind === oldGrind) continue;

        if (!recipeUpdates.has(recipe.id)) {
          recipeUpdates.set(recipe.id, JSON.parse(JSON.stringify(methods)));
        }
        const patched = recipeUpdates.get(recipe.id);
        patched[methodName][drinkName] = { ...patched[methodName][drinkName], grind: newGrind };

        changes.push({
          recipeId: recipe.id,
          coffeeLabel: displayName(recipe),
          methodName,
          drinkName,
          oldGrind,
          newGrind,
        });
      }
    }
  }

  return { changes, skipped, recipeUpdates, delta, gearName: String(gearName ?? '').trim() };
}