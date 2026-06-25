'use strict';
/* ============================================================
   Busca por texto + filtro por categoria (tela inicial).
   ============================================================ */
let searchQuery = '';
let searchCat = '';   // '' = todas

/* Filtra os itens por termos (nome/tags/categoria/observação/caixa) e categoria.
   Ignora acentos e caixa (maiúsc/minúsc). Função pura → testada em logic.html. */
function searchItems(query, catFilter) {
  const terms = normalizeText(query).trim().split(/\s+/).filter(Boolean);
  return (state.items || []).filter((it) => {
    if (catFilter && it.category !== catFilter) return false;
    if (!terms.length) return true;
    const box = boxById(it.boxId);
    const hay = normalizeText([it.name, it.tags, it.category, it.note, box && box.code, box && box.name]
      .filter(Boolean).join(' '));
    return terms.every((t) => hay.includes(t));
  });
}

/* Miniatura (foto embutida) ou ícone genérico. */
function thumbHtml(it) {
  if (it.photo && it.photo.data) return `<img class="it-thumb" src="${it.photo.data}" alt="" />`;
  return `<span class="it-thumb it-thumb-ph" aria-hidden="true">${icon('box', 22)}</span>`;
}

function sizeBadge(size) {
  if (!size) return '';
  return `<span class="size-badge size-${size}" title="${SIZE_LABEL[size] || ''}">${size}</span>`;
}

/* Cartão de um item na lista de resultados. */
function itemCardHtml(it) {
  const box = boxById(it.boxId);
  const local = box ? (box.code ? box.code : '') + (box.name ? (box.code ? ' · ' : '') + box.name : '') : 'sem caixa';
  const meta = [it.category, it.qty ? ('×' + it.qty) : ''].filter(Boolean).join(' · ');
  return `<li class="entry" data-item="${it.id}">
    ${thumbHtml(it)}
    <div class="e-main">
      <div class="e-desc">${escapeHtml(it.name)} ${sizeBadge(it.size)}</div>
      <div class="e-meta">${escapeHtml(meta)}</div>
    </div>
    <span class="e-box">${icon('box', 14)} ${escapeHtml(local)}</span>
  </li>`;
}

/* Chips de categoria (Todas + cada categoria com contagem). */
function renderCatChips() {
  const box = $('cat-chips'); if (!box) return;
  const counts = {};
  for (const it of (state.items || [])) counts[it.category] = (counts[it.category] || 0) + 1;
  const cats = getCategorias();
  let html = `<button class="chip${searchCat === '' ? ' active' : ''}" data-cat="">Todas (${(state.items || []).length})</button>`;
  html += cats.filter((c) => counts[c]).map((c) =>
    `<button class="chip${searchCat === c ? ' active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)} (${counts[c]})</button>`).join('');
  box.innerHTML = html;
}

/* Renderiza a lista de resultados conforme a busca atual. */
function renderResults() {
  const list = $('results'); if (!list) return;
  renderCatChips();
  const res = searchItems(searchQuery, searchCat).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (!res.length) {
    const total = (state.items || []).length;
    list.innerHTML = `<li class="empty-list">${total ? 'Nada encontrado para essa busca.' : 'Nenhum item ainda. Toque em “Novo item” para começar.'}</li>`;
    return;
  }
  list.innerHTML = res.map(itemCardHtml).join('');
  setupIcons(list);
}

function setupSearchUI() {
  const q = $('q');
  if (q) q.addEventListener('input', () => { searchQuery = q.value; renderResults(); });
  const chips = $('cat-chips');
  if (chips) chips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    searchCat = b.dataset.cat || '';
    renderResults();
  });
  const list = $('results');
  if (list) list.addEventListener('click', (e) => {
    const li = e.target.closest('[data-item]'); if (!li) return;
    const it = (state.items || []).find((x) => x.id === li.dataset.item);
    if (it) openItemModal(it);
  });
  if ($('btn-add-item')) $('btn-add-item').addEventListener('click', () => openItemModal(null));
}
