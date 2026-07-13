import {
  onAuthChange,
  signInWithGoogle,
  fetchAllRecipes,
  fetchRecipesByIds,
  fetchRecipe,
  createRecipe,
  updateRecipe,
  saveRecipePin,
  deleteRecipe,
  appendDrinkToRecipe,
  ensureUserDoc,
  fetchHomeOrder,
  saveHomeOrder,
} from './api.js';
import {
  displayName,
  displaySubtitle,
  methodNames,
  drinkNames,
  getDrinkParams,
  emptyDrinkParams,
  buildDrinkParamsFromForm,
  normalizeMethods,
  applyDrinkSave,
  renameMethodInMethods,
  renameMethodInPin,
  appendToPin,
  deleteDrinkFromMethods,
  removeDrinkFromPinMethods,
  escapeHtml,
  initials,
  formatRatio,
  renderStars,
  formatStatValue,
  formatRatioDisplay,
  computeRatio,
  renderStarPicker,
  formatTimeDisplay,
  formatTempDisplay,
  generateCoffeeName,
  ROAST_TYPES,
  BREWING_METHODS,
  DRINKS,
  presetSelection,
  resolvePresetValue,
  findMatchingRecipe,
  beanFieldsFromRecipe,
  isDecafCoffee,
  recipeSearchText,
  hasActivePin,
  isOnHomeScreen,
  applyHomeOrder,
  getPinnedPairs,
  visibleMethodNames,
  visibleDrinkNames,
  resolveVisibleSelection,
  buildPinMethodsFromForm,
  buildFullPinMethods,
  isPinChecked,
  normalizeRecipe,
} from './utils.js';
import {
  buildPinListRows,
  createPinVirtualList,
  formatPinListCount,
} from './pinList.js';

const TILE_BG_COUNT = 6;

const app = document.getElementById('app');

let currentUser = null;
let recipes = [];
let allRecipes = [];
let homeOrder = [];
let beanTemplates = [];
let view = { name: 'home', panel: null, pinFlow: null, reorderMode: false };
let pinVirtualList = null;
let recipesFetchToken = 0;
let libraryLoading = false;

onAuthChange(async (user) => {
  currentUser = user;
  if (user) {
    await ensureUserDoc(user.uid, user.displayName);
    await loadRecipesStaged();
  } else {
    recipesFetchToken += 1;
    libraryLoading = false;
    recipes = [];
    allRecipes = [];
    homeOrder = [];
    view = { name: 'home', panel: null, pinFlow: null, reorderMode: false };
    render();
  }
});

async function loadRecipesStaged() {
  if (!currentUser) return;
  const token = ++recipesFetchToken;
  libraryLoading = true;

  homeOrder = await fetchHomeOrder(currentUser.uid);
  const homeRecipes = homeOrder.length
    ? await fetchRecipesByIds(currentUser.uid, homeOrder)
    : [];

  if (token !== recipesFetchToken) return;

  allRecipes = homeRecipes;
  refreshHomeRecipes();
  render();

  try {
    const all = await fetchAllRecipes(currentUser.uid);
    if (token !== recipesFetchToken) return;

    allRecipes = all;
    refreshHomeRecipes();
    libraryLoading = false;

    if (view.pinFlow?.step === 'list') {
      syncPinListCount();
      pinVirtualList?.update();
    }
    render();
  } catch (err) {
    libraryLoading = false;
    console.error(err);
    render();
  }
}

async function loadRecipes() {
  if (!currentUser) return;
  const token = ++recipesFetchToken;
  libraryLoading = false;
  const [all, order] = await Promise.all([
    fetchAllRecipes(currentUser.uid),
    fetchHomeOrder(currentUser.uid),
  ]);
  if (token !== recipesFetchToken) return;
  allRecipes = all;
  homeOrder = order;
  refreshHomeRecipes();
}

function recipeRevision(recipe) {
  return [
    recipe.isOpen,
    JSON.stringify(recipe.pin?.methods ?? {}),
    displayName(recipe),
    methodNames(recipe.methods).length,
  ].join('|');
}

function recipesSnapshotChanged(prevRecipes, nextRecipes, prevOrder, nextOrder) {
  if (prevRecipes.length !== nextRecipes.length) return true;
  if (prevOrder.join(',') !== nextOrder.join(',')) return true;
  const prevMap = new Map(prevRecipes.map((recipe) => [recipe.id, recipeRevision(recipe)]));
  return nextRecipes.some((recipe) => prevMap.get(recipe.id) !== recipeRevision(recipe));
}

async function refreshRecipesInBackground() {
  if (!currentUser) return;
  const token = ++recipesFetchToken;
  try {
    const [all, order] = await Promise.all([
      fetchAllRecipes(currentUser.uid),
      fetchHomeOrder(currentUser.uid),
    ]);
    if (token !== recipesFetchToken) return;
    if (!recipesSnapshotChanged(allRecipes, all, homeOrder, order)) return;
    allRecipes = all;
    homeOrder = order;
    libraryLoading = false;
    refreshHomeRecipes();
    if (view.pinFlow?.step === 'list') {
      syncPinListCount();
      pinVirtualList?.update();
      return;
    }
    if (view.name === 'home') render();
  } catch (err) {
    console.error(err);
  }
}

function patchRecipeInMemory(recipeId, patch) {
  const idx = allRecipes.findIndex((recipe) => recipe.id === recipeId);
  if (idx < 0) return;
  allRecipes[idx] = normalizeRecipe({ ...allRecipes[idx], ...patch });
  refreshHomeRecipes();
}

function removeRecipeFromMemory(recipeId) {
  allRecipes = allRecipes.filter((recipe) => recipe.id !== recipeId);
  homeOrder = homeOrder.filter((id) => id !== recipeId);
  refreshHomeRecipes();
}

function refreshHomeRecipes() {
  recipes = applyHomeOrder(allRecipes.filter(isOnHomeScreen), homeOrder);
}

async function persistHomeOrder() {
  if (!currentUser) return;
  homeOrder = recipes.map((r) => r.id);
  await saveHomeOrder(currentUser.uid, homeOrder);
}

async function pinRecipeOnHome(recipe) {
  const pinMethods = buildFullPinMethods(recipe);
  await updateRecipe(currentUser.uid, recipe.id, { isOpen: true });
  await saveRecipePin(currentUser.uid, recipe.id, pinMethods);
  homeOrder = [...homeOrder.filter((id) => id !== recipe.id), recipe.id];
  await saveHomeOrder(currentUser.uid, homeOrder);
  const hasAny = Object.values(pinMethods).some((drinks) => Array.isArray(drinks) && drinks.length > 0);
  patchRecipeInMemory(recipe.id, {
    isOpen: true,
    pin: hasAny ? { methods: pinMethods } : undefined,
  });
}

async function unpinRecipeFromHome(recipe) {
  if (hasActivePin(recipe)) {
    await saveRecipePin(currentUser.uid, recipe.id, {});
  }
  if (recipe.isOpen !== false) {
    await updateRecipe(currentUser.uid, recipe.id, { isOpen: false });
  }
  homeOrder = homeOrder.filter((id) => id !== recipe.id);
  await saveHomeOrder(currentUser.uid, homeOrder);
  patchRecipeInMemory(recipe.id, { isOpen: false, pin: undefined });
  if (view.panel?.recipeId === recipe.id) view.panel = null;
}

function getRecipe(id) {
  return recipes.find((r) => r.id === id) || allRecipes.find((r) => r.id === id);
}

function openPanel(recipeId, methodName = null, drinkName = null, editing = false) {
  const recipe = getRecipe(recipeId);
  const { activeMethod, activeDrink } = resolveVisibleSelection(recipe, methodName, drinkName);
  view.panel = {
    recipeId,
    methodName: activeMethod,
    drinkName: activeDrink,
    editing,
    addMode: null,
    menuOpen: false,
  };
}

function renderPresetField({ label, presetName, customName, readonlyName, options, value, placeholder, editable }) {
  if (!editable) {
    const fieldName = readonlyName || presetName.replace(/Preset$/, '');
    return `
      <label class="edit-field">
        <span>${label}</span>
        <input type="text" name="${fieldName}" value="${escapeHtml(value)}" readonly />
      </label>`;
  }

  const { preset, custom } = presetSelection(value, options);
  return `
    <label class="edit-field">
      <span>${label}</span>
      <select name="${presetName}" class="edit-select preset-select" required>
        <option value="">${placeholder}</option>
        ${options.map((o) => `<option value="${escapeHtml(o)}" ${preset === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
      </select>
      <input type="text" name="${customName}" class="preset-custom" placeholder="Enter ${label.toLowerCase()}" value="${escapeHtml(custom)}" ${preset === 'Other' ? '' : 'hidden'} />
    </label>`;
}

function bindPresetSelects(root = document) {
  root.querySelectorAll('.preset-select').forEach((select) => {
    const custom = select.parentElement?.querySelector('.preset-custom');
    if (!custom) return;
    const sync = () => {
      const isOther = select.value === 'Other';
      custom.hidden = !isOther;
      custom.required = isOther;
      if (!isOther) custom.value = '';
    };
    select.addEventListener('change', sync);
    sync();
  });
}

function readPresetFromForm(fd, presetKey, customKey) {
  return resolvePresetValue(fd.get(presetKey), fd.get(customKey));
}

function renderTabSlot(items, active, dataAttr, className = 'method-tab', tabsClass = 'method-tabs') {
  let inner;
  if (items.length > 1) {
    inner = `<div class="${tabsClass}" role="tablist">
      ${items
        .map(
          (name) =>
            `<button type="button" class="${className} ${name === active ? 'active' : ''}" ${dataAttr}="${escapeHtml(name)}" role="tab">${escapeHtml(name)}</button>`
        )
        .join('')}
    </div>`;
  } else if (items.length === 1) {
    inner = `<p class="method-single">${escapeHtml(items[0])}</p>`;
  } else {
    inner = `<span class="tab-slot-placeholder" aria-hidden="true"></span>`;
  }
  return `<div class="panel-tab-slot">${inner}</div>`;
}

function render() {
  if (!currentUser) {
    app.innerHTML = renderLogin();
    bindLogin();
    return;
  }

  if (view.name === 'home') {
    app.innerHTML =
      renderShell(renderHome() + (view.panel ? renderDetailPanel() : '') + (view.pinFlow ? renderPinFlow() : ''));
    bindShell();
    bindHome();
    if (view.panel) bindDetailPanel();
    if (view.pinFlow) bindPinFlow();
  } else if (view.name === 'add') {
    app.innerHTML = renderShell(renderAddForm());
    bindShell();
    bindAddForm();
  }
}

function renderLogin() {
  return `
    <div class="login">
      <div class="login-card">
        <div class="logo">
          ${renderBrandIcon()}
          <h1>Coffee Dial</h1>
        </div>
        <p class="login-tagline">Your best recipes, always at hand.</p>
        <button type="button" class="btn btn-google" id="btn-google">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Sign in with Google
        </button>
      </div>
    </div>
  `;
}

function renderBrandIcon() {
  const iconUrl = `${import.meta.env.BASE_URL}images/coffee-icon.png`;
  return `<img src="${iconUrl}" alt="" class="brand-icon" width="28" height="28" />`;
}

function renderShell(content) {
  const photo = currentUser.photoURL
    ? `<img src="${escapeHtml(currentUser.photoURL)}" alt="" class="avatar" />`
    : `<span class="avatar avatar-fallback">${initials(currentUser.displayName)}</span>`;

  const showReorder = view.name === 'home' && recipes.length >= 2;
  const reorderIconUrl = `${import.meta.env.BASE_URL}images/reorder-icon.png`;
  const reorderBtn = showReorder
    ? view.reorderMode
      ? `<button type="button" class="btn-reorder-header btn-reorder-ok" id="btn-reorder" title="Done reordering">OK</button>`
      : `<button type="button" class="btn-reorder-header" id="btn-reorder" title="Reorder tiles" aria-label="Reorder tiles">
          <img src="${reorderIconUrl}" alt="" class="reorder-icon" width="18" height="18" />
        </button>`
    : '';

  return `
    <header class="header">
      <button type="button" class="brand" id="btn-home">
        ${renderBrandIcon()}
        <span class="brand-text">Coffee Dial</span>
      </button>
      <div class="header-actions">
        <button type="button" class="btn-icon" id="btn-add" title="Add coffee">+</button>
        <button type="button" class="btn-pin-header" id="btn-pin-coffee" title="Search coffees" aria-label="Search coffees">
          <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2" />
            <path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
        ${reorderBtn}
        ${photo}
      </div>
    </header>
    <main class="main">${content}</main>
  `;
}

function tileBackgroundUrl(variant) {
  return `${import.meta.env.BASE_URL}images/Background_tile_${variant}.png`;
}

function renderCoffeeTile(r, index = 0) {
  const variant = (index % TILE_BG_COUNT) + 1;
  const patternStyle = `background-image: url('${tileBackgroundUrl(variant)}')`;
  const decafIcon = isDecafCoffee(r)
    ? `<img src="${import.meta.env.BASE_URL}images/decaf_light.png" alt="Decaf" class="tile-decaf-icon" width="18" height="18" />`
    : '';
  return `
    <button type="button" class="tile" data-id="${escapeHtml(r.id)}" draggable="${view.reorderMode ? 'true' : 'false'}">
      <div class="tile-header">
        <h2 class="tile-name">${escapeHtml(displayName(r))}</h2>
        ${displaySubtitle(r) ? `<p class="tile-sub">${escapeHtml(displaySubtitle(r))}</p>` : ''}
        ${decafIcon}
      </div>
      <div class="tile-pattern" style="${patternStyle}" aria-hidden="true"></div>
    </button>`;
}

function renderHome() {
  const tiles = recipes.map((r, index) => renderCoffeeTile(r, index)).join('');
  const reorderClass = view.reorderMode ? ' tiles-reorder-mode' : '';
  const reorderHint = view.reorderMode
    ? '<p class="tiles-reorder-hint">Drag tiles to reorder, then tap OK</p>'
    : '';
  return `${reorderHint}<div class="tiles${reorderClass}" id="tiles-list">${tiles}</div>`;
}

function renderPinListItem(recipe) {
  const methods = methodNames(recipe.methods);
  const drinkCount = methods.reduce((n, m) => n + drinkNames(recipe.methods, m).length, 0);
  const onHome = isOnHomeScreen(recipe);
  return `
    <div class="pin-list-item${onHome ? ' pin-list-item-on-home' : ''}" data-search-text="${escapeHtml(recipeSearchText(recipe))}" data-on-home="${onHome ? '1' : '0'}">
      <button type="button" class="pin-list-main" data-pin-recipe="${escapeHtml(recipe.id)}">
        <span class="pin-list-name">${escapeHtml(displayName(recipe))}</span>
        ${displaySubtitle(recipe) ? `<span class="pin-list-sub">${escapeHtml(displaySubtitle(recipe))}</span>` : ''}
        <span class="pin-list-meta">${methods.length} method${methods.length === 1 ? '' : 's'} · ${drinkCount} drink${drinkCount === 1 ? '' : 's'}</span>
      </button>
      <button type="button" class="pin-list-toggle${onHome ? ' is-unpin' : ''}" data-pin-toggle-recipe="${escapeHtml(recipe.id)}" title="${onHome ? 'Remove from home screen' : 'Add to home screen'}" aria-label="${onHome ? 'Unpin coffee' : 'Pin coffee'}">${onHome ? 'Unpin' : 'Pin'}</button>
      <button type="button" class="pin-list-delete" data-pin-delete-recipe="${escapeHtml(recipe.id)}" title="Delete coffee" aria-label="Delete coffee">Delete</button>
    </div>`;
}

function renderPinFilterChips(activeFilter) {
  const chips = [
    { id: 'all', label: 'All' },
    { id: 'on-home', label: 'On home' },
    { id: 'not-on-home', label: 'Not on home' },
  ];
  return chips
    .map(
      ({ id, label }) => `
    <button type="button" class="pin-filter-chip${activeFilter === id ? ' is-active' : ''}" data-pin-filter="${id}" aria-pressed="${activeFilter === id}">${label}</button>`
    )
    .join('');
}

function renderPinSectionRow(title, isFirst) {
  return `<h3 class="pin-list-section-title pin-list-virtual-section${isFirst ? ' is-first' : ''}">${escapeHtml(title)}</h3>`;
}

function pinListCountText(stats, filter, query) {
  let text = formatPinListCount({
    visible: stats.visible,
    total: stats.total,
    onHomeTotal: stats.onHomeTotal,
    filter,
    query,
  });
  if (libraryLoading) text += ' · loading library…';
  return text;
}

function syncPinListCount() {
  const pinListCount = document.getElementById('pin-list-count');
  if (!pinListCount || view.pinFlow?.step !== 'list') return;
  const stats = buildPinListRows(
    allRecipes,
    view.pinFlow.filter || 'all',
    view.pinFlow.search || ''
  );
  pinListCount.dataset.total = String(stats.total);
  pinListCount.dataset.onHome = String(stats.onHomeTotal);
  pinListCount.textContent = pinListCountText(
    stats,
    view.pinFlow.filter || 'all',
    view.pinFlow.search || ''
  );
  const pinListEmpty = document.getElementById('pin-list-empty');
  if (pinListEmpty) pinListEmpty.hidden = stats.visible > 0 || libraryLoading;
}

function renderPinFlow() {
  if (view.pinFlow.step === 'list') {
    if (allRecipes.length === 0 && !libraryLoading) {
      return `
        <div class="panel-backdrop" id="pin-backdrop">
          <div class="pin-panel" role="dialog">
            <header class="pin-header">
              <h2>Pin coffee</h2>
              <button type="button" class="panel-action-btn" id="pin-close" title="Close">×</button>
            </header>
            <p class="pin-empty">No coffees saved yet. Add a coffee first.</p>
          </div>
        </div>`;
    }

    const activeFilter = view.pinFlow.filter || 'all';
    const searchValue = view.pinFlow.search || '';
    const stats = buildPinListRows(allRecipes, activeFilter, searchValue);

    return `
      <div class="panel-backdrop" id="pin-backdrop">
        <div class="pin-panel" role="dialog">
          <header class="pin-header">
            <h2>Coffees</h2>
            <button type="button" class="panel-action-btn" id="pin-close" title="Close">×</button>
          </header>
          <div class="pin-toolbar">
            <label class="pin-search">
              <span class="pin-search-label">Search</span>
              <input type="search" id="pin-coffee-search" class="pin-search-input" placeholder="Search coffees, methods, drinks…" autocomplete="off" value="${escapeHtml(searchValue)}" />
            </label>
            <div class="pin-filters" role="group" aria-label="Filter coffees">
              ${renderPinFilterChips(activeFilter)}
            </div>
            <p class="pin-list-count" id="pin-list-count" data-total="${stats.total}" data-on-home="${stats.onHomeTotal}">
              ${escapeHtml(pinListCountText(stats, activeFilter, searchValue))}
            </p>
          </div>
          <p class="pin-empty pin-list-empty" id="pin-list-empty"${stats.visible > 0 || libraryLoading ? ' hidden' : ''}>No coffees match your search.</p>
          <div class="pin-list-body pin-list-body-virtual" id="pin-list-body"></div>
        </div>
      </div>`;
  }

  const recipe = allRecipes.find((r) => r.id === view.pinFlow.recipeId);
  if (!recipe) return '';

  const methods = methodNames(recipe.methods);
  const sections = methods
    .map((method) => {
      const drinks = drinkNames(recipe.methods, method);
      const checks = drinks
        .map(
          (drink) => `
        <div class="pin-check-row">
          <label class="pin-check">
            <input type="checkbox" data-pin-method="${escapeHtml(method)}" data-pin-drink="${escapeHtml(drink)}" ${isPinChecked(recipe, method, drink) ? 'checked' : ''} />
            <span>${escapeHtml(drink)}</span>
          </label>
          <button type="button" class="pin-delete-drink" data-pin-delete-method="${escapeHtml(method)}" data-pin-delete-drink="${escapeHtml(drink)}" title="Delete drink" aria-label="Delete ${escapeHtml(drink)}">Delete</button>
        </div>`
        )
        .join('');
      return `
      <div class="pin-method-group">
        <h3 class="pin-method-name">${escapeHtml(method)}</h3>
        <div class="pin-checks">${checks}</div>
      </div>`;
    })
    .join('');

  return `
    <div class="panel-backdrop" id="pin-backdrop">
      <div class="pin-panel pin-panel-config" role="dialog">
        <header class="pin-header">
          <div>
            <h2>${escapeHtml(displayName(recipe))}</h2>
            ${displaySubtitle(recipe) ? `<p class="pin-subtitle">${escapeHtml(displaySubtitle(recipe))}</p>` : ''}
          </div>
          <button type="button" class="panel-action-btn" id="pin-close" title="Close">×</button>
        </header>
        <p class="pin-hint">Choose which methods and drinks to show on the home screen. All recipes stay saved in Firebase.</p>
        <form id="pin-form" class="pin-form">
          ${sections || '<p class="pin-empty">This coffee has no saved recipes yet.</p>'}
          <footer class="pin-footer">
            <button type="button" class="edit-footer-discard" id="pin-back">Back</button>
            <button type="submit" class="btn btn-save">Save pin</button>
          </footer>
        </form>
      </div>
    </div>`;
}

function bindPinFlow() {
  pinVirtualList?.destroy();
  pinVirtualList = null;

  document.getElementById('pin-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'pin-backdrop') {
      view.pinFlow = null;
      render();
    }
  });

  document.getElementById('pin-close')?.addEventListener('click', () => {
    view.pinFlow = null;
    render();
  });

  if (view.pinFlow?.step === 'list') {
    const pinSearchInput = document.getElementById('pin-coffee-search');
    const pinListBody = document.getElementById('pin-list-body');

    pinVirtualList = createPinVirtualList(pinListBody, {
      getRecipes: () => allRecipes,
      getFilter: () => view.pinFlow?.filter || 'all',
      getQuery: () => view.pinFlow?.search || '',
      renderItem: renderPinListItem,
      renderSection: renderPinSectionRow,
    });
    pinVirtualList.update();
    syncPinListCount();

    pinSearchInput?.addEventListener('input', () => {
      view.pinFlow.search = pinSearchInput.value;
      syncPinListCount();
      pinVirtualList.update({ resetScroll: true });
    });

    document.querySelectorAll('[data-pin-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        view.pinFlow.filter = btn.dataset.pinFilter;
        document.querySelectorAll('[data-pin-filter]').forEach((chip) => {
          const active = chip === btn;
          chip.classList.toggle('is-active', active);
          chip.setAttribute('aria-pressed', String(active));
        });
        syncPinListCount();
        pinVirtualList.update({ resetScroll: true });
      });
    });

    pinListBody?.addEventListener('click', async (e) => {
      const toggleBtn = e.target.closest('[data-pin-toggle-recipe]');
      if (toggleBtn) {
        e.stopPropagation();
        const recipeId = toggleBtn.dataset.pinToggleRecipe;
        const recipe = allRecipes.find((r) => r.id === recipeId);
        if (!recipe) return;

        if (isOnHomeScreen(recipe)) await unpinRecipeFromHome(recipe);
        else await pinRecipeOnHome(recipe);
        render();
        return;
      }

      const deleteBtn = e.target.closest('[data-pin-delete-recipe]');
      if (deleteBtn) {
        e.stopPropagation();
        const recipeId = deleteBtn.dataset.pinDeleteRecipe;
        const recipe = allRecipes.find((r) => r.id === recipeId);
        if (!recipe) return;
        if (!confirm(`Delete "${displayName(recipe)}" and all its recipes? This cannot be undone.`)) return;

        await deleteRecipe(currentUser.uid, recipeId);
        removeRecipeFromMemory(recipeId);
        if (view.panel?.recipeId === recipeId) view.panel = null;
        render();
        return;
      }

      const recipeBtn = e.target.closest('[data-pin-recipe]');
      if (recipeBtn) {
        view.pinFlow = {
          step: 'configure',
          recipeId: recipeBtn.dataset.pinRecipe,
          filter: view.pinFlow?.filter || 'all',
          search: view.pinFlow?.search || '',
        };
        render();
      }
    });

    return;
  }

  document.querySelectorAll('[data-pin-delete-drink]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const recipeId = view.pinFlow?.recipeId;
      if (!recipeId) return;

      const methodName = btn.dataset.pinDeleteMethod;
      const drinkName = btn.dataset.pinDeleteDrink;
      const recipe = allRecipes.find((r) => r.id === recipeId);
      if (!recipe || !methodName || !drinkName) return;
      if (!confirm(`Delete drink "${drinkName}"? This cannot be undone.`)) return;

      const methods = deleteDrinkFromMethods(recipe.methods, methodName, drinkName);
      const pinMethods = removeDrinkFromPinMethods(recipe.pin?.methods, methodName, drinkName);

      await updateRecipe(currentUser.uid, recipeId, { methods });
      await saveRecipePin(currentUser.uid, recipeId, pinMethods);
      const hasAny = Object.values(pinMethods).some((drinks) => Array.isArray(drinks) && drinks.length > 0);
      patchRecipeInMemory(recipeId, {
        methods,
        pin: hasAny ? { methods: pinMethods } : undefined,
      });

      if (view.panel?.recipeId === recipeId) {
        const updated = getRecipe(recipeId);
        if (updated) {
          const { activeMethod, activeDrink } = resolveVisibleSelection(
            updated,
            view.panel.methodName,
            view.panel.drinkName
          );
          view.panel.methodName = activeMethod;
          view.panel.drinkName = activeDrink;
        } else {
          view.panel = null;
        }
      }

      render();
    });
  });

  document.getElementById('pin-back')?.addEventListener('click', () => {
    view.pinFlow = { step: 'list', filter: view.pinFlow?.filter || 'all', search: view.pinFlow?.search || '' };
    render();
  });

  document.getElementById('pin-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const recipeId = view.pinFlow.recipeId;
    const pinMethods = buildPinMethodsFromForm(e.target);
    await saveRecipePin(currentUser.uid, recipeId, pinMethods);
    const hasAny = Object.values(pinMethods).some((drinks) => Array.isArray(drinks) && drinks.length > 0);
    patchRecipeInMemory(recipeId, { pin: hasAny ? { methods: pinMethods } : undefined });
    if (view.panel?.recipeId === recipeId) {
      const recipe = getRecipe(recipeId);
      const { activeMethod, activeDrink } = resolveVisibleSelection(
        recipe,
        view.panel.methodName,
        view.panel.drinkName
      );
      view.panel.methodName = activeMethod;
      view.panel.drinkName = activeDrink;
    }
    view.pinFlow = null;
    render();
  });
}

function renderDetailPanel() {
  const recipe = getRecipe(view.panel.recipeId);
  if (!recipe) return '';

  if (view.panel.editing) {
    return renderPanelEdit(recipe);
  }

  const { activeMethod, activeDrink } = resolveVisibleSelection(
    recipe,
    view.panel.methodName,
    view.panel.drinkName
  );
  view.panel.methodName = activeMethod;
  view.panel.drinkName = activeDrink;

  const methods = visibleMethodNames(recipe);
  const drinks = activeMethod ? visibleDrinkNames(recipe, activeMethod) : [];
  const drink = activeMethod && activeDrink ? getDrinkParams(recipe, activeMethod, activeDrink) : null;

  const methodTabs = renderTabSlot(methods, activeMethod, 'data-method');
  const drinkTabs = renderTabSlot(
    drinks,
    activeDrink,
    'data-drink',
    'drink-tab',
    'method-tabs drink-tabs'
  );

  if (!activeMethod || !drink) {
    return `
      <div class="panel-backdrop" id="panel-backdrop">
        <div class="recipe-panel" role="dialog">
          ${renderPanelHeader(recipe, null)}
          <div class="panel-empty">
            <p>No recipes saved yet.</p>
            <button type="button" class="btn btn-primary" id="btn-start-edit">Add first recipe</button>
          </div>
        </div>
      </div>`;
  }

  const ratio = formatRatio(drink);
  const grinderLabel = drink.gear || 'Grinder';
  const grinderValue = drink.grind || '—';

  return `
    <div class="panel-backdrop" id="panel-backdrop">
      <div class="recipe-panel recipe-panel-view" role="dialog">
        ${renderPanelHeader(recipe, drink)}

        ${methodTabs}
        ${drinkTabs}

        <div class="panel-body">
        <section class="brew-stats">
          <h3 class="brew-stats-title">
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9 3v2H7v2h2v2h2V7h2V5h-2V3H9zm0 8v2H7v2h2v2h2v-2h2v-2h-2v-2H9zm8-8v2h-2v2h2v2h2V7h2V5h-2V3h-2zm0 8v2h-2v2h2v2h2v-2h2v-2h-2v-2h-2z"/></svg>
            Brew stats
          </h3>
          <div class="stat-cards">
            <div class="stat-card">
              <span class="stat-label">In</span>
              <span class="stat-value">${escapeHtml(formatStatValue('dose', drink.dose))}</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Ratio</span>
              <span class="stat-value">${escapeHtml(ratio)}</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Out</span>
              <span class="stat-value">${escapeHtml(formatStatValue('out', drink.out))}</span>
            </div>
          </div>
          <div class="stat-cards stat-cards-secondary">
            <div class="stat-card">
              <span class="stat-label">${escapeHtml(String(grinderLabel).toUpperCase())}</span>
              <span class="stat-value">${escapeHtml(String(grinderValue))}</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Time</span>
              <span class="stat-value">${escapeHtml(formatTimeDisplay(drink.time))}</span>
            </div>
            <div class="stat-card stat-card-temp">
              <span class="stat-label">Temp</span>
              <span class="stat-value"><span class="temp-badge">${escapeHtml(formatTempDisplay(drink.temp))}</span></span>
            </div>
          </div>
        </section>

        <div class="note-boxes">
          <details class="note-box${drink.notes ? ' has-content' : ''}">
            <summary class="note-box-head">
              <span class="note-box-label">Notes</span>
            </summary>
            <div class="note-box-body${drink.notes ? '' : ' is-empty'}">${drink.notes ? escapeHtml(drink.notes) : '—'}</div>
          </details>
          <details class="note-box note-box-improve${drink.improve ? ' has-content' : ''}">
            <summary class="note-box-head">
              <span class="note-box-label">Improve</span>
            </summary>
            <div class="note-box-body${drink.improve ? '' : ' is-empty'}">${drink.improve ? escapeHtml(drink.improve) : '—'}</div>
          </details>
        </div>
        </div>

        <div class="panel-nav">
          <button type="button" class="panel-nav-btn" id="btn-prev" title="Previous coffee" ${recipes.findIndex((r) => r.id === recipe.id) <= 0 ? 'disabled' : ''}>←</button>
          <button type="button" class="panel-nav-btn" id="btn-next" title="Next coffee" ${recipes.findIndex((r) => r.id === recipe.id) >= recipes.length - 1 ? 'disabled' : ''}>→</button>
        </div>
      </div>
    </div>
  `;
}

function renderPanelHeader(recipe, drink) {
  const rating = drink?.rating ?? '';
  const compact = drink != null;
  const subtitle = displaySubtitle(recipe);
  return `
    <header class="panel-header${compact ? ' panel-header-compact' : ''}">
      <div class="panel-title-block">
        <h2 class="panel-title">${escapeHtml(displayName(recipe))}</h2>
        ${compact ? `<p class="panel-farmer">${subtitle ? escapeHtml(subtitle) : '&nbsp;'}</p>` : subtitle ? `<p class="panel-farmer">${escapeHtml(subtitle)}</p>` : ''}
        ${compact ? `<div class="panel-stars">${renderStars(rating)}</div>` : rating !== '' && rating != null ? `<div class="panel-stars">${renderStars(rating)}</div>` : ''}
      </div>
      <div class="panel-actions">
        <button type="button" class="panel-action-btn" id="btn-edit" title="Edit">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <div class="panel-menu-wrap">
          <button type="button" class="panel-action-btn" id="btn-menu" title="More">⋯</button>
          ${
            view.panel.menuOpen
              ? `<div class="panel-menu" id="panel-menu">
              <button type="button" data-menu="edit-pin">Edit pin</button>
              <button type="button" data-menu="add-method">Add method</button>
              <button type="button" data-menu="add-drink">Add drink</button>
              <button type="button" data-menu="unpin">Unpin coffee</button>
            </div>`
              : ''
          }
        </div>
        <button type="button" class="panel-action-btn" id="btn-close" title="Close">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
    </header>`;
}

function renderPanelEdit(recipe) {
  const methods = normalizeMethods(recipe.methods);
  const addMode = view.panel.addMode;
  const isNewMethod = addMode === 'method';
  const isNewDrink = addMode === 'method' || addMode === 'drink';
  const isMethodEditable = isNewMethod || !addMode;

  const methodName = isNewMethod ? '' : view.panel.methodName || '';
  const drinkName = isNewDrink ? '' : view.panel.drinkName || '';
  const copySource =
    addMode === 'drink' && methodName && view.panel.copyFromDrink
      ? getDrinkParams(recipe, methodName, view.panel.copyFromDrink)
      : null;
  const existingDrink =
    methodName && drinkName
      ? methods[methodName]?.[drinkName]
      : copySource;
  const data = existingDrink ? { ...emptyDrinkParams(), ...existingDrink } : emptyDrinkParams();
  const ratioDisplay = formatRatioDisplay(data.dose, data.out, data.ratio);

  const editTitle =
    addMode === 'method' ? 'Add method' : addMode === 'drink' ? 'Add drink' : 'Edit recipe';

  return `
    <div class="panel-backdrop" id="panel-backdrop">
      <div class="recipe-panel recipe-panel-edit" role="dialog">
        <header class="edit-topbar">
          <h2 class="edit-topbar-title">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            ${editTitle}
          </h2>
          <button type="button" class="panel-action-btn" id="btn-cancel-edit" title="Close">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </header>

        <form id="form-method" class="edit-form">
          <details class="edit-section">
            <summary class="edit-section-head">
              <span class="edit-section-label">Coffee</span>
              <span class="edit-section-chevron">▾</span>
            </summary>
            <div class="edit-section-body">
              <div class="edit-grid-3">
                <label class="edit-field">
                  <span>Coffee name</span>
                  <input type="text" name="coffeeName" value="${escapeHtml(recipe.name || '')}" placeholder="Auto from bean info" />
                </label>
                <label class="edit-field">
                  <span>Roaster</span>
                  <input type="text" name="coffeeRoaster" value="${escapeHtml(recipe.roaster || recipe.farmer || '')}" />
                </label>
                <label class="edit-field">
                  <span>Blend / farmer</span>
                  <input type="text" name="coffeeFarmer" value="${escapeHtml(recipe.roaster ? recipe.farmer || '' : '')}" />
                </label>
                <label class="edit-field">
                  <span>Origin</span>
                  <input type="text" name="coffeeOrigin" value="${escapeHtml(recipe.origin || '')}" />
                </label>
                <label class="edit-field">
                  <span>Variety</span>
                  <input type="text" name="coffeeVariety" value="${escapeHtml(recipe.variety || '')}" />
                </label>
                <label class="edit-field">
                  <span>Processing</span>
                  <input type="text" name="coffeeProcessing" value="${escapeHtml(recipe.processing || '')}" />
                </label>
                <label class="edit-field">
                  <span>Roast type</span>
                  <select name="coffeeRoastType" class="edit-select">
                    <option value="">Select roast</option>
                    ${ROAST_TYPES.map((r) => `<option value="${r}" ${recipe.roastType === r ? 'selected' : ''}>${r}</option>`).join('')}
                  </select>
                </label>
              </div>
            </div>
          </details>

          <details class="edit-section">
            <summary class="edit-section-head">
              <span class="edit-section-label">Extraction</span>
              <span class="edit-section-chevron">▾</span>
            </summary>
            <div class="edit-section-body">
              ${renderPresetField({
                label: 'Brewing method',
                presetName: 'methodPreset',
                customName: 'methodCustom',
                readonlyName: 'methodName',
                options: BREWING_METHODS,
                value: methodName,
                placeholder: 'Select method',
                editable: isMethodEditable,
              })}
              <div class="edit-grid-inline-2 edit-grid-spaced">
                ${renderPresetField({
                  label: 'Drink',
                  presetName: 'drinkPreset',
                  customName: 'drinkCustom',
                  readonlyName: 'drinkName',
                  options: DRINKS,
                  value: drinkName,
                  placeholder: 'Select drink',
                  editable: isNewDrink,
                })}
                <label class="edit-field">
                  <span>Gear</span>
                  <input type="text" name="gear" value="${escapeHtml(String(data.gear || ''))}" placeholder="DF64" />
                </label>
              </div>
              <div class="edit-grid-inline-3 edit-grid-spaced">
                <label class="edit-field">
                  <span>Grind size</span>
                  <input type="text" name="grind" value="${escapeHtml(String(data.grind || ''))}" placeholder="12" inputmode="decimal" />
                </label>
                <label class="edit-field">
                  <span>Temp</span>
                  <input type="text" name="temp" value="${escapeHtml(String(data.temp || ''))}" placeholder="L4" />
                </label>
                <label class="edit-field">
                  <span>Time (sec)</span>
                  <input type="text" name="time" value="${escapeHtml(String(data.time || ''))}" placeholder="20" inputmode="decimal" />
                </label>
              </div>
              <div class="dose-row">
                <label class="edit-field dose-field">
                  <span>In (g)</span>
                  <input type="text" name="dose" id="input-dose" value="${escapeHtml(String(data.dose || ''))}" placeholder="18" inputmode="decimal" />
                </label>
                <div class="ratio-display" id="ratio-display" aria-live="polite">${escapeHtml(ratioDisplay)}</div>
                <label class="edit-field dose-field">
                  <span>Out (g)</span>
                  <input type="text" name="out" id="input-out" value="${escapeHtml(String(data.out || ''))}" placeholder="40" inputmode="decimal" />
                </label>
              </div>
              <input type="hidden" name="ratio" id="input-ratio" value="${escapeHtml(computeRatio(data.dose, data.out) || String(data.ratio || ''))}" />
            </div>
          </details>

          <details class="edit-section">
            <summary class="edit-section-head">
              <span class="edit-section-label">Cupping</span>
              <span class="edit-section-chevron">▾</span>
            </summary>
            <div class="edit-section-body">
              <div class="edit-field">
                <span>Rating</span>
                ${renderStarPicker(data.rating)}
              </div>
              <label class="edit-field">
                <span>Tasting notes</span>
                <textarea name="notes" rows="3" placeholder="Funky strawberries, tropical fruit">${escapeHtml(String(data.notes || ''))}</textarea>
              </label>
              <label class="edit-field">
                <span>Improve</span>
                <textarea name="improve" rows="2" placeholder="Maybe a bit hotter">${escapeHtml(String(data.improve || ''))}</textarea>
              </label>
            </div>
          </details>

          <footer class="edit-footer">
            <div class="edit-footer-actions">
              <button type="button" class="edit-footer-discard" id="btn-discard">Discard</button>
              <button type="submit" class="btn btn-save">
                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                Save recipe
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>`;
}

function renderAddForm() {
  const templateOptions = beanTemplates
    .map(
      (r) =>
        `<option value="${escapeHtml(r.id)}">${escapeHtml(displayName(r))}${displaySubtitle(r) ? ` · ${escapeHtml(displaySubtitle(r))}` : ''}</option>`
    )
    .join('');

  const roastOptions = ROAST_TYPES.map((r) => `<option value="${r}">${r}</option>`).join('');

  return `
    <div class="add-page">
      <header class="add-topbar">
        <button type="button" class="btn-back" id="btn-back">← Back</button>
        <h1 class="add-topbar-title">
          <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          New coffee
        </h1>
        <span class="add-topbar-spacer"></span>
      </header>

      <form id="form-add" class="add-form">
        <details class="edit-section bean-section" open>
          <summary class="edit-section-head">
            <span class="edit-section-icon">🌱</span>
            <span class="edit-section-label">Bean</span>
            <span class="edit-section-chevron">▾</span>
          </summary>
          <div class="edit-section-body">
            <label class="edit-field">
              <span>Add to existing coffee</span>
              <select name="beanTemplate" id="bean-template" class="edit-select">
                <option value="">— New coffee —</option>
                ${templateOptions}
              </select>
            </label>
            <p class="field-hint add-hint" id="add-merge-hint" hidden>
              Method and drink will be added to the selected coffee.
            </p>
            <div class="edit-grid-3 edit-grid-spaced">
              <label class="edit-field">
                <span>Roaster</span>
                <input type="text" name="roaster" data-bean-field placeholder="e.g. La Cabra" />
              </label>
              <label class="edit-field">
                <span>Blend / farmer</span>
                <input type="text" name="farmer" data-bean-field placeholder="e.g. Felipe Arcila" />
              </label>
              <label class="edit-field">
                <span>Origin</span>
                <input type="text" name="origin" data-bean-field placeholder="e.g. Ethiopia" />
              </label>
            </div>
            <div class="edit-grid-3 edit-grid-spaced">
              <label class="edit-field">
                <span>Variety</span>
                <input type="text" name="variety" data-bean-field placeholder="e.g. Geisha" />
              </label>
              <label class="edit-field">
                <span>Processing</span>
                <input type="text" name="processing" data-bean-field placeholder="e.g. Natural" />
              </label>
              <label class="edit-field">
                <span>Roast type</span>
                <select name="roastType" data-bean-field class="edit-select">
                  <option value="">Select roast</option>
                  ${roastOptions}
                </select>
              </label>
            </div>
            <label class="edit-field edit-grid-spaced">
              <span>Coffee name <span class="field-hint">(optional — auto-generated if empty)</span></span>
              <input type="text" name="name" data-bean-field placeholder="e.g. Nosegrind" />
            </label>
          </div>
        </details>

        <details class="edit-section" open>
          <summary class="edit-section-head">
            <span class="edit-section-icon">⚗</span>
            <span class="edit-section-label">Extraction</span>
            <span class="edit-section-chevron">▾</span>
          </summary>
          <div class="edit-section-body">
            ${renderPresetField({
              label: 'Brewing method',
              presetName: 'methodPreset',
              customName: 'methodCustom',
              options: BREWING_METHODS,
              value: '',
              placeholder: 'Select method',
              editable: true,
            })}
            <div class="edit-grid-inline-2 edit-grid-spaced">
              ${renderPresetField({
                label: 'Drink',
                presetName: 'drinkPreset',
                customName: 'drinkCustom',
                options: DRINKS,
                value: '',
                placeholder: 'Select drink',
                editable: true,
              })}
              <label class="edit-field">
                <span>Gear</span>
                <input type="text" name="gear" placeholder="DF64" />
              </label>
            </div>
            <div class="edit-grid-inline-3 edit-grid-spaced">
              <label class="edit-field">
                <span>Grind size</span>
                <input type="text" name="grind" placeholder="12" inputmode="decimal" />
              </label>
              <label class="edit-field">
                <span>Temp</span>
                <input type="text" name="temp" placeholder="L4" />
              </label>
              <label class="edit-field">
                <span>Time (sec)</span>
                <input type="text" name="time" placeholder="20" inputmode="decimal" />
              </label>
            </div>
            <div class="dose-row">
              <label class="edit-field dose-field">
                <span>In (g)</span>
                <input type="text" name="dose" id="add-dose" placeholder="18" inputmode="decimal" />
              </label>
              <div class="ratio-display" id="add-ratio-display">1 : —</div>
              <label class="edit-field dose-field">
                <span>Out (g)</span>
                <input type="text" name="out" id="add-out" placeholder="40" inputmode="decimal" />
              </label>
            </div>
          </div>
        </details>

        <details class="edit-section">
          <summary class="edit-section-head">
            <span class="edit-section-icon">☕</span>
            <span class="edit-section-label">Cupping</span>
            <span class="edit-section-chevron">▾</span>
          </summary>
          <div class="edit-section-body">
            <div class="edit-field">
              <span>Rating</span>
              ${renderStarPicker('')}
            </div>
            <label class="edit-field">
              <span>Tasting notes</span>
              <textarea name="notes" rows="3" placeholder="Funky strawberries, tropical fruit"></textarea>
            </label>
            <label class="edit-field">
              <span>Improve</span>
              <textarea name="improve" rows="2" placeholder="Maybe a bit hotter"></textarea>
            </label>
          </div>
        </details>

        <footer class="add-footer">
          <button type="button" class="edit-footer-discard" id="btn-discard-add">Discard</button>
          <button type="submit" class="btn btn-save">
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            Save coffee
          </button>
        </footer>
      </form>
    </div>
  `;
}

function promptApplyScope(methodName, drinkName, allDrinks) {
  if (allDrinks.length <= 1) return Promise.resolve('one');

  const others = allDrinks.filter((d) => d !== drinkName);
  const othersLabel = others.map((d) => `"${d}"`).join(', ');

  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'scope-backdrop';
    backdrop.innerHTML = `
      <div class="scope-dialog" role="dialog" aria-labelledby="scope-title">
        <h3 id="scope-title" class="scope-title">Apply recipe changes?</h3>
        <p class="scope-text">
          You updated the recipe for <strong>${escapeHtml(drinkName)}</strong> (${escapeHtml(methodName)}).
          Apply the same settings to ${others.length === 1 ? 'the other drink' : 'all other drinks'} for this method
          (${othersLabel})?
        </p>
        <div class="scope-actions">
          <button type="button" class="btn btn-secondary" data-scope="one">This drink only</button>
          <button type="button" class="btn btn-primary" data-scope="all">All ${escapeHtml(methodName)} drinks</button>
        </div>
        <button type="button" class="scope-cancel" data-scope="cancel">Cancel</button>
      </div>
    `;

    const close = (value) => {
      backdrop.remove();
      resolve(value);
    };

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(null);
    });
    backdrop.querySelectorAll('[data-scope]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const scope = btn.dataset.scope;
        close(scope === 'cancel' ? null : scope);
      });
    });

    document.body.appendChild(backdrop);
  });
}

async function openAddView() {
  if (currentUser) beanTemplates = await fetchAllRecipes(currentUser.uid);
  view = { name: 'add', panel: null, pinFlow: null, reorderMode: false };
  render();
}

function bindLogin() {
  document.getElementById('btn-google')?.addEventListener('click', () => signInWithGoogle());
}

function bindShell() {
  document.getElementById('btn-home')?.addEventListener('click', () => {
    view = { name: 'home', panel: null, pinFlow: null, reorderMode: false };
    render();
  });
  document.getElementById('btn-add')?.addEventListener('click', () => openAddView());
  document.getElementById('btn-pin-coffee')?.addEventListener('click', () => {
    view.pinFlow = { step: 'list', filter: 'all', search: '' };
    view.reorderMode = false;
    render();
    refreshRecipesInBackground();
  });
  document.getElementById('btn-reorder')?.addEventListener('click', async () => {
    if (view.reorderMode) {
      view.reorderMode = false;
      await persistHomeOrder();
    } else {
      view.reorderMode = true;
      view.panel = null;
      view.pinFlow = null;
    }
    render();
  });
}

function bindHome() {
  document.getElementById('btn-add-empty')?.addEventListener('click', () => openAddView());
  bindTileReorder();

  document.querySelectorAll('.tile').forEach((el) => {
    el.addEventListener('click', async () => {
      if (view.reorderMode) return;
      if (el.dataset.suppressClick === '1') {
        delete el.dataset.suppressClick;
        return;
      }
      const id = el.dataset.id;
      const fresh = await fetchRecipe(currentUser.uid, id);
      if (fresh) {
        const allIdx = allRecipes.findIndex((r) => r.id === id);
        if (allIdx >= 0) allRecipes[allIdx] = fresh;
        else allRecipes.push(fresh);
        refreshHomeRecipes();
      }
      openPanel(id);
      render();
    });
  });
}

function syncRecipesOrderFromDom(container) {
  const ids = [...container.querySelectorAll('.tile')].map((el) => el.dataset.id);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  recipes = ids.map((id) => byId.get(id)).filter(Boolean);
  persistHomeOrder().catch(console.error);
}

const TILE_FLIP_TRANSITION = 'transform 0.38s cubic-bezier(0.34, 1.45, 0.64, 1)';
const DRAG_GHOST = new Image();
DRAG_GHOST.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function clearTileMotionStyles(container) {
  container.querySelectorAll('.tile').forEach((tile) => {
    tile.classList.remove('tile-moving');
    tile.style.transition = '';
    tile.style.transform = '';
  });
}

function flipReorderTiles(container, mutateDom) {
  const tiles = [...container.querySelectorAll('.tile')];
  const beforeRects = new Map(tiles.map((tile) => [tile, tile.getBoundingClientRect()]));

  mutateDom();

  requestAnimationFrame(() => {
    tiles.forEach((tile) => {
      if (!container.contains(tile)) return;
      const first = beforeRects.get(tile);
      if (!first) return;
      const last = tile.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

      tile.style.transition = 'none';
      tile.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    });

    container.getBoundingClientRect();

    tiles.forEach((tile) => {
      if (!tile.style.transform) return;
      tile.classList.add('tile-moving');
      tile.style.transition = TILE_FLIP_TRANSITION;
      tile.style.transform = '';
    });
  });
}

function bindTileReorder() {
  const container = document.getElementById('tiles-list');
  if (!container || !view.reorderMode || recipes.length < 2) return;

  let draggedEl = null;
  let touchEl = null;

  const isVertical = () => window.matchMedia('(max-width: 600px)').matches;

  const insertDraggedBefore = (target, pointerBefore) => {
    if (!draggedEl || !target || draggedEl === target) return;
    const shouldMove = pointerBefore
      ? draggedEl.nextElementSibling !== target
      : target.nextElementSibling !== draggedEl;
    if (!shouldMove) return;
    flipReorderTiles(container, () => {
      if (pointerBefore) container.insertBefore(draggedEl, target);
      else container.insertBefore(draggedEl, target.nextSibling);
    });
  };

  container.querySelectorAll('.tile').forEach((tile) => {
    tile.addEventListener('transitionend', (e) => {
      if (e.propertyName !== 'transform' || !tile.classList.contains('tile-moving')) return;
      tile.classList.remove('tile-moving');
      if (!tile.classList.contains('tile-dragging')) {
        tile.style.transition = '';
        tile.style.transform = '';
      }
    });

    tile.addEventListener('dragstart', (e) => {
      if (!view.reorderMode) {
        e.preventDefault();
        return;
      }
      draggedEl = tile;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', tile.dataset.id);
      e.dataTransfer.setDragImage(DRAG_GHOST, 0, 0);
      requestAnimationFrame(() => tile.classList.add('tile-dragging'));
    });

    tile.addEventListener('dragend', () => {
      tile.classList.remove('tile-dragging');
      clearTileMotionStyles(container);
      if (draggedEl) {
        syncRecipesOrderFromDom(container);
        draggedEl.dataset.suppressClick = '1';
        draggedEl = null;
      }
    });

    tile.addEventListener('dragover', (e) => {
      if (!view.reorderMode) return;
      e.preventDefault();
      if (!draggedEl || draggedEl === tile) return;
      e.dataTransfer.dropEffect = 'move';
      const rect = tile.getBoundingClientRect();
      const before = isVertical()
        ? e.clientY < rect.top + rect.height / 2
        : e.clientX < rect.left + rect.width / 2;
      insertDraggedBefore(tile, before);
    });

    tile.addEventListener('touchstart', (e) => {
      if (!view.reorderMode || e.touches.length !== 1) return;
      touchEl = tile;
      tile.classList.add('tile-dragging');
    }, { passive: true });

    tile.addEventListener('touchmove', (e) => {
      if (!view.reorderMode || !touchEl || touchEl !== tile) return;
      e.preventDefault();
      const t = e.touches[0];
      const target = document.elementFromPoint(t.clientX, t.clientY)?.closest('.tile');
      if (!target || !container.contains(target)) return;
      draggedEl = touchEl;
      const rect = target.getBoundingClientRect();
      const before = t.clientY < rect.top + rect.height / 2;
      insertDraggedBefore(target, before);
    }, { passive: false });

    tile.addEventListener('touchend', () => {
      if (!touchEl) return;
      touchEl.classList.remove('tile-dragging');
      clearTileMotionStyles(container);
      syncRecipesOrderFromDom(container);
      touchEl.dataset.suppressClick = '1';
      touchEl = null;
      draggedEl = null;
    });

    tile.addEventListener('touchcancel', () => {
      touchEl?.classList.remove('tile-dragging');
      clearTileMotionStyles(container);
      touchEl = null;
      draggedEl = null;
    });
  });
}

function bindDetailPanel() {
  const recipe = getRecipe(view.panel.recipeId);
  if (!recipe) return;

  document.getElementById('panel-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'panel-backdrop') {
      view.panel = null;
      render();
    }
  });

  document.getElementById('btn-close')?.addEventListener('click', () => {
    view.panel = null;
    render();
  });

  document.getElementById('btn-edit')?.addEventListener('click', () => {
    view.panel.editing = true;
    view.panel.addMode = null;
    view.panel.menuOpen = false;
    render();
  });

  document.getElementById('btn-start-edit')?.addEventListener('click', () => {
    view.panel.editing = true;
    view.panel.addMode = 'method';
    view.panel.methodName = null;
    view.panel.drinkName = null;
    render();
  });

  document.getElementById('btn-menu')?.addEventListener('click', (e) => {
    e.stopPropagation();
    view.panel.menuOpen = !view.panel.menuOpen;
    render();
  });

  document.querySelectorAll('[data-menu]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.menu;
      view.panel.menuOpen = false;

      if (action === 'edit-pin') {
        view.panel = null;
        view.pinFlow = {
          step: 'configure',
          recipeId: recipe.id,
          filter: view.pinFlow?.filter || 'all',
          search: view.pinFlow?.search || '',
        };
        render();
        return;
      }

      if (action === 'add-method') {
        view.panel.editing = true;
        view.panel.addMode = 'method';
        view.panel.methodName = null;
        view.panel.drinkName = null;
        render();
        return;
      }

      if (action === 'add-drink') {
        view.panel.editing = true;
        view.panel.addMode = 'drink';
        view.panel.copyFromDrink = view.panel.drinkName;
        render();
        return;
      }

      if (action === 'unpin') {
        await unpinRecipeFromHome(recipe);
        view.panel = null;
        render();
        return;
      }
    });
  });

  document.querySelectorAll('.method-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const { activeMethod, activeDrink } = resolveVisibleSelection(recipe, tab.dataset.method);
      view.panel.methodName = activeMethod;
      view.panel.drinkName = activeDrink;
      render();
    });
  });

  document.querySelectorAll('.drink-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      view.panel.drinkName = tab.dataset.drink;
      render();
    });
  });

  document.getElementById('btn-prev')?.addEventListener('click', () => {
    const idx = recipes.findIndex((r) => r.id === recipe.id);
    if (idx > 0) openPanel(recipes[idx - 1].id);
    render();
  });

  document.getElementById('btn-next')?.addEventListener('click', () => {
    const idx = recipes.findIndex((r) => r.id === recipe.id);
    if (idx < recipes.length - 1) openPanel(recipes[idx + 1].id);
    render();
  });

  if (view.panel.editing) {
    bindPanelEdit(recipe);
    bindPresetSelects(document.getElementById('form-method'));
  }

  document.addEventListener(
    'click',
    () => {
      if (view.panel?.menuOpen) {
        view.panel.menuOpen = false;
        render();
      }
    },
    { once: true }
  );
}

function bindPanelEdit(recipe) {
  const cancel = () => {
    if (view.panel.addMode === 'drink' && view.panel.copyFromDrink) {
      view.panel.drinkName = view.panel.copyFromDrink;
    }
    view.panel.copyFromDrink = null;
    view.panel.editing = false;
    view.panel.addMode = null;
    const { activeMethod, activeDrink } = resolveVisibleSelection(
      recipe,
      view.panel.methodName,
      view.panel.drinkName
    );
    view.panel.methodName = activeMethod;
    view.panel.drinkName = activeDrink;
    render();
  };

  document.getElementById('btn-cancel-edit')?.addEventListener('click', cancel);
  document.getElementById('btn-discard')?.addEventListener('click', cancel);

  const doseInput = document.getElementById('input-dose');
  const outInput = document.getElementById('input-out');
  const ratioDisplay = document.getElementById('ratio-display');
  const ratioHidden = document.getElementById('input-ratio');

  function updateRatio() {
    const dose = doseInput?.value ?? '';
    const out = outInput?.value ?? '';
    const ratio = computeRatio(dose, out);
    if (ratioDisplay) ratioDisplay.textContent = formatRatioDisplay(dose, out);
    if (ratioHidden) ratioHidden.value = ratio;
  }

  doseInput?.addEventListener('input', updateRatio);
  outInput?.addEventListener('input', updateRatio);

  document.querySelectorAll('.star-picker-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const picker = btn.closest('.star-picker');
      const val = Number(btn.dataset.rating);
      picker.querySelector('input[type="hidden"]').value = val;
      picker.querySelectorAll('.star-picker-btn').forEach((b, i) => {
        b.classList.toggle('active', i < val);
      });
    });
  });

  document.getElementById('form-method')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const addMode = view.panel.addMode;
    const isNewMethod = addMode === 'method';
    const isNewDrink = addMode === 'method' || addMode === 'drink';
    const isMethodEditable = isNewMethod || !addMode;
    const methodName = (
      isMethodEditable
        ? readPresetFromForm(fd, 'methodPreset', 'methodCustom')
        : String(fd.get('methodName') ?? view.panel.methodName ?? '').trim()
    );
    const drinkName = (
      isNewDrink
        ? readPresetFromForm(fd, 'drinkPreset', 'drinkCustom')
        : String(fd.get('drinkName') ?? view.panel.drinkName ?? '').trim()
    );
    if (!methodName || !drinkName) {
      alert('Please select both a brewing method and a drink.');
      return;
    }

    try {
    const drinkParams = buildDrinkParamsFromForm(fd);
    const prevMethod = view.panel.methodName;
    const prevDrink = view.panel.drinkName;
    let methods = normalizeMethods(recipe.methods);
    const methodRenamed = Boolean(prevMethod && prevMethod !== methodName && !addMode);

    if (methodRenamed) {
      methods = renameMethodInMethods(methods, prevMethod, methodName);
    }

    const drinksForMethod = drinkNames(methods, methodName);
    const shouldAskScope =
      !view.panel.addMode &&
      !methodRenamed &&
      drinksForMethod.length > 1 &&
      drinksForMethod.includes(prevDrink);

    let applyScope = 'one';
    if (shouldAskScope) {
      applyScope = await promptApplyScope(methodName, drinkName, drinksForMethod);
      if (!applyScope) return;
    }

    const coffeeUpdates = {};
    const coffeeName = String(fd.get('coffeeName') ?? '').trim();
    const coffeeRoaster = String(fd.get('coffeeRoaster') ?? '').trim();
    const coffeeFarmer = String(fd.get('coffeeFarmer') ?? '').trim();
    const coffeeOrigin = String(fd.get('coffeeOrigin') ?? '').trim();
    const coffeeVariety = String(fd.get('coffeeVariety') ?? '').trim();
    const coffeeProcessing = String(fd.get('coffeeProcessing') ?? '').trim();
    const coffeeRoastType = String(fd.get('coffeeRoastType') ?? '').trim();
    if (coffeeName) coffeeUpdates.name = coffeeName;
    if (coffeeRoaster) coffeeUpdates.roaster = coffeeRoaster;
    if (coffeeFarmer) coffeeUpdates.farmer = coffeeFarmer;
    if (coffeeOrigin) coffeeUpdates.origin = coffeeOrigin;
    if (coffeeVariety) coffeeUpdates.variety = coffeeVariety;
    if (coffeeProcessing) coffeeUpdates.processing = coffeeProcessing;
    if (coffeeRoastType) coffeeUpdates.roastType = coffeeRoastType;
    if (!coffeeUpdates.name) {
      coffeeUpdates.name = generateCoffeeName({
        name: coffeeName,
        roaster: coffeeRoaster,
        farmer: coffeeFarmer,
        origin: coffeeOrigin,
        variety: coffeeVariety,
      });
    }

    const isAddingDrink = view.panel.addMode === 'drink';
    const prevDrinkForSave = isAddingDrink || view.panel.addMode === 'method' ? null : prevDrink;

    const updatedMethods = applyDrinkSave(
      methods,
      methodName,
      drinkName,
      drinkParams,
      applyScope,
      prevDrinkForSave
    );

    const recipeUpdates = { methods: updatedMethods, ...coffeeUpdates };
    if (methodRenamed && recipe.pin) {
      recipeUpdates.pin = renameMethodInPin(recipe.pin, prevMethod, methodName);
    } else if ((addMode === 'method' || addMode === 'drink') && hasActivePin(recipe)) {
      recipeUpdates.pin = appendToPin(recipe.pin, methodName, drinkName);
    }

    await updateRecipe(currentUser.uid, recipe.id, recipeUpdates);
    recipe.methods = updatedMethods;
    if (recipeUpdates.pin) recipe.pin = recipeUpdates.pin;
    Object.assign(recipe, coffeeUpdates);

    const allIdx = allRecipes.findIndex((r) => r.id === recipe.id);
    if (allIdx >= 0) {
      allRecipes[allIdx] = {
        ...allRecipes[allIdx],
        methods: updatedMethods,
        ...(recipeUpdates.pin ? { pin: recipeUpdates.pin } : {}),
        ...coffeeUpdates,
      };
    }
    refreshHomeRecipes();

    view.panel.methodName = methodName;
    view.panel.drinkName = drinkName;
    view.panel.editing = false;
    view.panel.addMode = null;
    view.panel.copyFromDrink = null;
    render();
    } catch (err) {
      console.error(err);
      alert('Could not save recipe. Please try again.');
    }
  });

  document.getElementById('btn-delete-drink')?.addEventListener('click', async () => {
    const methodName = view.panel.methodName;
    const drinkName = view.panel.drinkName;
    if (!methodName || !drinkName || !confirm(`Delete drink "${drinkName}"?`)) return;

    const methods = normalizeMethods(recipe.methods);
    if (methods[methodName]) {
      delete methods[methodName][drinkName];
      if (!Object.keys(methods[methodName]).length) delete methods[methodName];
    }

    await updateRecipe(currentUser.uid, recipe.id, { methods });
    recipe.methods = methods;

    const { activeMethod, activeDrink } = resolveVisibleSelection(recipe);
    view.panel.methodName = activeMethod;
    view.panel.drinkName = activeDrink;
    view.panel.editing = false;
    view.panel.addMode = null;
    render();
  });
}

function bindAddForm() {
  const goHome = () => {
    view = { name: 'home', panel: null, pinFlow: null, reorderMode: false };
    render();
  };

  document.getElementById('btn-back')?.addEventListener('click', goHome);
  document.getElementById('btn-discard-add')?.addEventListener('click', goHome);

  const doseInput = document.getElementById('add-dose');
  const outInput = document.getElementById('add-out');
  const ratioDisplay = document.getElementById('add-ratio-display');

  function updateRatio() {
    const dose = doseInput?.value ?? '';
    const out = outInput?.value ?? '';
    if (ratioDisplay) ratioDisplay.textContent = formatRatioDisplay(dose, out);
  }

  doseInput?.addEventListener('input', updateRatio);
  outInput?.addEventListener('input', updateRatio);

  document.getElementById('bean-template')?.addEventListener('change', (e) => {
    const id = e.target.value;
    const form = document.getElementById('form-add');
    const hint = document.getElementById('add-merge-hint');
    if (hint) hint.hidden = !id;

    if (!id) {
      form.querySelectorAll('[data-bean-field]').forEach((el) => {
        el.value = '';
      });
      return;
    }
    const template = beanTemplates.find((r) => r.id === id);
    if (!template) return;
    const bean = beanFieldsFromRecipe(template);
    for (const [key, val] of Object.entries(bean)) {
      const input = form.querySelector(`[name="${key}"]`);
      if (input) input.value = val;
    }
  });

  function allKnownRecipes() {
    const byId = new Map();
    for (const r of [...recipes, ...beanTemplates]) byId.set(r.id, r);
    return [...byId.values()];
  }

  document.querySelectorAll('.star-picker-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const picker = btn.closest('.star-picker');
      const val = Number(btn.dataset.rating);
      picker.querySelector('input[type="hidden"]').value = val;
      picker.querySelectorAll('.star-picker-btn').forEach((b, i) => {
        b.classList.toggle('active', i < val);
      });
    });
  });

  bindPresetSelects(document.getElementById('form-add'));

  document.getElementById('form-add')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);

    const beanData = {
      name: String(fd.get('name') ?? '').trim(),
      roaster: String(fd.get('roaster') ?? '').trim(),
      farmer: String(fd.get('farmer') ?? '').trim(),
      origin: String(fd.get('origin') ?? '').trim(),
      variety: String(fd.get('variety') ?? '').trim(),
      processing: String(fd.get('processing') ?? '').trim(),
      roastType: String(fd.get('roastType') ?? '').trim(),
    };

    const methodName = readPresetFromForm(fd, 'methodPreset', 'methodCustom');
    const drinkName = readPresetFromForm(fd, 'drinkPreset', 'drinkCustom');
    const drinkParams = methodName && drinkName ? buildDrinkParamsFromForm(fd) : null;

    const templateId = String(fd.get('beanTemplate') ?? '').trim();
    let existing = templateId ? allKnownRecipes().find((r) => r.id === templateId) : null;
    if (!existing) existing = findMatchingRecipe(allKnownRecipes(), beanData);

    if (existing && drinkParams) {
      const updated = await appendDrinkToRecipe(
        currentUser.uid,
        existing.id,
        methodName,
        drinkName,
        drinkParams
      );
      const allIdx = allRecipes.findIndex((r) => r.id === existing.id);
      if (allIdx >= 0) allRecipes[allIdx] = updated;
      else allRecipes.unshift(updated);
      refreshHomeRecipes();

      view = { name: 'home', panel: null, pinFlow: null, reorderMode: false };
      openPanel(updated.id, methodName, drinkName);
      render();
      return;
    }

    let methods = {};
    if (methodName && drinkName && drinkParams) {
      methods[methodName] = { [drinkName]: drinkParams };
    }

    const created = await createRecipe(currentUser.uid, { ...beanData, methods });
    allRecipes.unshift(created);
    homeOrder = [created.id, ...homeOrder.filter((id) => id !== created.id)];
    await persistHomeOrder();
    refreshHomeRecipes();
    view = { name: 'home', panel: null, pinFlow: null, reorderMode: false };
    openPanel(created.id, methodName || null, drinkName || null);
    render();
  });
}

render();
