'use strict';
/* ============================================================
   Busca por texto + filtro por categoria (tela inicial).
   ============================================================ */
let searchQuery = '';
let searchCat = '';   // '' = todas
let searchSort = 'rec';   // rec=recentes(updatedAt) · vis=vistos por último · az=nome · cat=categoria
let searchOut = false;    // true = mostrar só itens "em uso" (retirados)
let searchNobox = false;  // true = mostrar só itens órfãos (sem caixa e não "soltos de propósito")

/* "Vistos por último": lista LOCAL de ids de itens abertos (não sincroniza). */
function recentViewed() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; } }
function markViewed(id) {
  if (!id) return;
  let r = recentViewed().filter((x) => x !== id);
  r.unshift(id);
  if (r.length > 40) r = r.slice(0, 40);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch (e) {}
}

/* Ordena a lista de resultados conforme searchSort. Função pura. */
function sortResults(list) {
  const arr = list.slice();
  if (searchSort === 'az') arr.sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name)));
  else if (searchSort === 'cat') arr.sort((a, b) => normalizeText(a.category).localeCompare(normalizeText(b.category)) || normalizeText(a.name).localeCompare(normalizeText(b.name)));
  else if (searchSort === 'vis') { const r = recentViewed(); const ix = (id) => { const i = r.indexOf(id); return i < 0 ? 9999 : i; }; arr.sort((a, b) => ix(a.id) - ix(b.id) || (b.updatedAt || 0) - (a.updatedAt || 0)); }
  else arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return arr;
}

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

/* Miniatura: foto por ref (carregada sob demanda em hydratePhotos), foto inline
   legada, ou ícone genérico. O placeholder com data-pref vira <img> ao aparecer. */
function thumbHtml(it) {
  if (it.photo && it.photo.ref) return `<span class="it-thumb it-thumb-ph" data-pref="${escapeHtml(it.photo.ref)}" aria-hidden="true">${icon('box', 22)}</span>`;
  if (it.photo && it.photo.data) return `<img class="it-thumb" src="${it.photo.data}" alt="" />`;
  return `<span class="it-thumb it-thumb-ph" aria-hidden="true">${icon('box', 22)}</span>`;
}

function sizeBadge(size) {
  if (!size) return '';
  return `<span class="size-badge size-${size}" title="${SIZE_LABEL[size] || ''}">${size}</span>`;
}

/* Chip da caixa do item: caixa real · "Solto" (sem caixa de propósito) · "Sem caixa" (órfão). */
function boxChipHtml(it) {
  const box = boxById(it.boxId);
  if (box) return `<span class="e-box">${icon('box', 14)} ${escapeHtml(boxTitle(box))}</span>`;
  if (it.loose) return `<span class="e-box is-loose">${icon('map-pin', 13)} Solto</span>`;
  return `<span class="e-box is-orphan">${icon('alert-triangle', 13)} Sem caixa</span>`;
}

/* Stepper de quantidade (ajuste rápido na lista). */
function qtyStepHtml(it) {
  const q = it.qty || 0;
  return `<span class="qty-step">
    <button type="button" class="qty-btn" data-qsub="${it.id}" aria-label="Diminuir quantidade">−</button>
    <span class="qty-val${q <= 1 ? ' low' : ''}" data-qval="${it.id}">${q}</span>
    <button type="button" class="qty-btn" data-qadd="${it.id}" aria-label="Aumentar quantidade">+</button>
  </span>`;
}

/* Ajusta a quantidade de um item por delta; persiste e atualiza só o número (sem re-render). */
function bumpQty(id, delta) {
  const it = (state.items || []).find((x) => x.id === id); if (!it) return;
  const q = Math.max(0, (it.qty || 0) + delta);
  if (q === (it.qty || 0)) return;
  it.qty = q; it.updatedAt = Date.now();
  touchDoc(); saveState();
  document.querySelectorAll(`[data-qval="${id}"]`).forEach((el) => { el.textContent = q; el.classList.toggle('low', q <= 1); });
}

/* Cartão de um item na lista de resultados. */
function itemCardHtml(it) {
  const out = !!it.out;
  const outBadge = out ? `<span class="it-out-badge">${icon('log-out', 11)} Em uso</span>` : '';
  const toggle = `<button class="qbtn it-out-btn${out ? ' active' : ''}" data-toggleout="${it.id}" aria-label="${out ? 'Devolver à caixa' : 'Marcar como em uso'}" title="${out ? 'Devolver à caixa' : 'Marcar como em uso'}">${icon(out ? 'rotate-ccw' : 'log-out', 18)}</button>`;
  return `<li class="entry${out ? ' is-out' : ''}" data-item="${it.id}">
    ${thumbHtml(it)}
    <div class="e-main">
      <div class="e-desc">${escapeHtml(it.name)} ${sizeBadge(it.size)} ${outBadge}</div>
      <div class="e-meta">${it.category ? escapeHtml(it.category) : ''}${qtyStepHtml(it)}</div>
    </div>
    ${boxChipHtml(it)}
    ${toggle}
  </li>`;
}

/* Chips de categoria (Todas + cada categoria com contagem). */
function renderCatChips() {
  const box = $('cat-chips'); if (!box) return;
  const counts = {};
  for (const it of (state.items || [])) counts[it.category] = (counts[it.category] || 0) + 1;
  const cats = getCategorias();
  const outN = (state.items || []).filter((it) => it.out).length;
  const noboxN = (state.items || []).filter((it) => !it.boxId && !it.loose).length;
  const allActive = searchCat === '' && !searchOut && !searchNobox;
  let html = `<button class="chip${allActive ? ' active' : ''}" data-cat="">Todas (${(state.items || []).length})</button>`;
  if (outN) html += `<button class="chip chip-out${searchOut ? ' active' : ''}" data-onlyout="1">${icon('log-out', 12)} Em uso (${outN})</button>`;
  if (noboxN) html += `<button class="chip chip-nobox${searchNobox ? ' active' : ''}" data-nobox="1">${icon('alert-triangle', 12)} Sem caixa (${noboxN})</button>`;
  html += cats.filter((c) => counts[c]).map((c) =>
    `<button class="chip${searchCat === c ? ' active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)} (${counts[c]})</button>`).join('');
  box.innerHTML = html;
}

/* Renderiza a lista de resultados conforme a busca atual. */
function renderResults() {
  const list = $('results'); if (!list) return;
  renderCatChips();
  let found = searchItems(searchQuery, searchCat);
  if (searchOut) found = found.filter((it) => it.out);
  if (searchNobox) found = found.filter((it) => !it.boxId && !it.loose);
  const res = sortResults(found);
  if (!res.length) {
    const total = (state.items || []).length;
    if (!total) {
      list.innerHTML = (state.boxes || []).length
        ? emptyStateHtml('search', 'Nenhum item ainda', 'Cadastre o primeiro item — o app sugere a melhor caixa para ele.', 'data-empty="add-item"', 'Novo item')
        : emptyStateHtml('box', 'Bem-vindo ao Catálogo!', 'Comece criando uma caixa para guardar e organizar seus itens.', 'data-empty="add-box"', 'Criar primeira caixa');
    } else {
      list.innerHTML = `<li class="empty-list">Nada encontrado para essa busca.</li>`;
    }
    setupIcons(list);
    return;
  }
  list.innerHTML = res.map(itemCardHtml).join('');
  setupIcons(list);
  hydratePhotos(list);
}

function setupSearchUI() {
  const q = $('q');
  if (q) q.addEventListener('input', () => { searchQuery = q.value; renderResults(); });
  const chips = $('cat-chips');
  if (chips) chips.addEventListener('click', (e) => {
    const nob = e.target.closest('[data-nobox]');
    if (nob) { searchNobox = !searchNobox; searchOut = false; searchCat = ''; renderResults(); return; }
    const out = e.target.closest('[data-onlyout]');
    if (out) { searchOut = !searchOut; searchNobox = false; searchCat = ''; renderResults(); return; }
    const b = e.target.closest('[data-cat]'); if (!b) return;
    searchCat = b.dataset.cat || ''; searchOut = false; searchNobox = false;
    renderResults();
  });
  const sort = $('sort');
  if (sort) sort.addEventListener('change', () => { searchSort = sort.value || 'rec'; renderResults(); });
  const list = $('results');
  if (list) list.addEventListener('click', (e) => {
    if (e.target.closest('[data-empty="add-item"]')) { openItemModal(null); return; }
    if (e.target.closest('[data-empty="add-box"]')) { openBoxModal(null); return; }
    const qa = e.target.closest('[data-qadd]'); if (qa) { e.stopPropagation(); bumpQty(qa.dataset.qadd, 1); return; }
    const qs = e.target.closest('[data-qsub]'); if (qs) { e.stopPropagation(); bumpQty(qs.dataset.qsub, -1); return; }
    const tg = e.target.closest('[data-toggleout]');
    if (tg) { e.stopPropagation(); toggleItemOut(tg.dataset.toggleout); return; }
    const li = e.target.closest('[data-item]'); if (!li) return;
    const it = (state.items || []).find((x) => x.id === li.dataset.item);
    if (it) openItemModal(it);
  });
  if ($('btn-add-item')) $('btn-add-item').addEventListener('click', () => openItemModal(null));
}
