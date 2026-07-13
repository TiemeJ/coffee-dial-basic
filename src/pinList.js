import { displayName, isOnHomeScreen, recipeSearchText } from './utils.js';

const ITEM_HEIGHT = 64;
const SECTION_HEIGHT = 32;
const SECTION_GAP = 14;
const BUFFER_ROWS = 6;

export function pinRecipeMatches(recipe, filter, query) {
  const onHome = isOnHomeScreen(recipe);
  if (filter === 'on-home' && !onHome) return false;
  if (filter === 'not-on-home' && onHome) return false;
  const q = String(query ?? '').trim().toLowerCase();
  if (q && !recipeSearchText(recipe).includes(q)) return false;
  return true;
}

export function buildPinListRows(recipes, filter, query) {
  const sorted = [...recipes].sort((a, b) =>
    displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' })
  );
  const filtered = sorted.filter((recipe) => pinRecipeMatches(recipe, filter, query));
  const onHome = filtered.filter(isOnHomeScreen);
  const library = filtered.filter((recipe) => !isOnHomeScreen(recipe));
  const rows = [];

  if (onHome.length) {
    rows.push({ type: 'section', title: 'On home', isFirst: rows.length === 0 });
    onHome.forEach((recipe) => rows.push({ type: 'recipe', recipe }));
  }
  if (library.length) {
    rows.push({ type: 'section', title: 'Library', isFirst: rows.length === 0 });
    library.forEach((recipe) => rows.push({ type: 'recipe', recipe }));
  }

  return {
    rows,
    visible: filtered.length,
    onHomeTotal: recipes.filter(isOnHomeScreen).length,
    total: recipes.length,
  };
}

function rowHeight(row) {
  if (row.type === 'section') return row.isFirst ? SECTION_HEIGHT : SECTION_HEIGHT + SECTION_GAP;
  return ITEM_HEIGHT;
}

function buildLayout(rows) {
  const starts = [0];
  for (const row of rows) {
    starts.push(starts[starts.length - 1] + rowHeight(row));
  }
  return starts;
}

function findRowAtOffset(starts, offset) {
  let lo = 0;
  let hi = starts.length - 2;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi + 1) / 2);
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function createPinVirtualList(bodyEl, { getRecipes, getFilter, getQuery, renderItem, renderSection }) {
  let rows = [];
  let layout = [0];
  let rafId = 0;

  const paint = () => {
    rafId = 0;
    if (!bodyEl) return;

    const { rows: nextRows, visible } = buildPinListRows(getRecipes(), getFilter(), getQuery());
    rows = nextRows;
    layout = buildLayout(rows);
    const totalHeight = layout[layout.length - 1] || 0;

    if (!rows.length) {
      bodyEl.innerHTML = '';
      bodyEl.dataset.visible = '0';
      return;
    }

    bodyEl.dataset.visible = String(visible);

    const scrollTop = bodyEl.scrollTop;
    const viewport = bodyEl.clientHeight || 320;
    const start = Math.max(0, findRowAtOffset(layout, scrollTop) - BUFFER_ROWS);
    let end = start;
    while (end < rows.length && layout[end] < scrollTop + viewport) end += 1;
    end = Math.min(rows.length - 1, end + BUFFER_ROWS);

    const html = rows
      .slice(start, end + 1)
      .map((row) => {
        if (row.type === 'section') {
          return renderSection(row.title, row.isFirst);
        }
        return renderItem(row.recipe);
      })
      .join('');

    bodyEl.innerHTML = `
      <div class="pin-list-virtual-track" style="height:${totalHeight}px">
        <div class="pin-list-virtual-window" style="transform:translateY(${layout[start]}px)">
          ${html}
        </div>
      </div>`;
  };

  const schedulePaint = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(paint);
  };

  const onScroll = () => schedulePaint();
  bodyEl.addEventListener('scroll', onScroll, { passive: true });

  return {
    update({ resetScroll = false } = {}) {
      if (resetScroll) bodyEl.scrollTop = 0;
      schedulePaint();
    },
    getVisibleCount() {
      return Number(bodyEl.dataset.visible) || 0;
    },
    destroy() {
      if (rafId) cancelAnimationFrame(rafId);
      bodyEl.removeEventListener('scroll', onScroll);
    },
  };
}

export function formatPinListCount({ visible, total, onHomeTotal, filter, query }) {
  const isFiltered = Boolean(String(query ?? '').trim()) || filter !== 'all';
  if (isFiltered) {
    return `${visible} matching · ${onHomeTotal} on home · ${total} total`;
  }
  return `${total} coffee${total === 1 ? '' : 's'} · ${onHomeTotal} on home`;
}
