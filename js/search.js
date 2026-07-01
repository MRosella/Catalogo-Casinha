'use strict';
/* ============================================================
   Busca por texto + filtro por categoria (tela inicial).
   ============================================================ */
let searchQuery = '';
let searchCat = '';   // '' = todas
let searchSort = 'rec';   // rec=recentes(updatedAt) · vis=vistos por último · az=nome · cat=categoria
let searchOut = false;    // true = mostrar só itens "em uso" (retirados)
let searchNobox = false;  // true = mostrar só itens órfãos (sem caixa e não "soltos de propósito")
let searchLow = false;    // true = mostrar só itens com estoque baixo (qty <= min, min>0)
let searchView = 'list';  // 'list' ou 'grid' (fotos grandes); persiste LOCAL em VIEWMODE_KEY

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

/* Distância de edição (Levenshtein) entre duas strings. Pura. */
function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}
/* Semelhança de nomes 0..1 (acento/caixa-insensível). 1=igual; trata
   singular/plural e substring (>=3 chars) como forte; senão usa Levenshtein. */
function nameSimilarity(a, b) {
  a = normalizeText(a).trim(); b = normalizeText(b).trim();
  if (!a || !b) return 0;
  if (a === b) return 1;
  const short = Math.min(a.length, b.length);
  if (short >= 3 && (a.includes(b) || b.includes(a))) return 0.9;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}
/* Itens existentes com nome parecido (acima do limiar de exibição), excluindo
   excludeId (o próprio item em edição), do mais parecido p/ menos. Pura. */
function findSimilarItems(name, excludeId) {
  const SHOW = 0.72;
  return (state.items || [])
    .filter((it) => it.id !== excludeId)
    .map((it) => ({ item: it, score: nameSimilarity(name, it.name) }))
    .filter((m) => m.score >= SHOW)
    .sort((x, y) => y.score - x.score);
}

/* Item com estoque baixo: tem mínimo definido e a quantidade chegou nele. */
function isLowStock(it) { return !!(it && it.min > 0 && (it.qty || 0) <= it.min); }

/* "Você quis dizer…?": melhor item cujo nome (ou tag) parece com a busca vazia
   de resultados. Devolve o item ou null. Pura → testada em logic.html. */
function didYouMean(query, items) {
  const q = normalizeText(query).trim();
  if (q.length < 3) return null;
  let best = null, bs = 0;
  for (const it of (items || [])) {
    const cands = [it.name].concat((it.tags || '').split(/[,;]+/));
    for (const c of cands) {
      if (!c || !c.trim()) continue;
      const s = nameSimilarity(q, c);
      if (s > bs) { bs = s; best = it; }
    }
  }
  return (best && bs >= 0.55) ? best : null;
}

/* Texto da lista de compras a partir dos itens com estoque baixo. Pura. */
function shoppingListText(items) {
  const low = (items || []).filter(isLowStock)
    .slice().sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name)));
  if (!low.length) return '';
  return 'Lista de compras — Casinha:\n' +
    low.map((it) => `• ${it.name} (tem ${it.qty || 0}, mín ${it.min})`).join('\n');
}
/* Compartilha (ou copia) a lista de compras. */
function shareShoppingList() {
  const text = shoppingListText(state.items);
  if (!text) { toast('Nada com estoque baixo.'); return; }
  if (navigator.share) { navigator.share({ text }).catch(() => {}); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast('Lista copiada.')).catch(() => toast('Não foi possível copiar.'));
    return;
  }
  toast('Compartilhar não é suportado aqui.');
}

/* Realça em <mark> os trechos do texto que casam com os termos da busca
   (acento/caixa-insensível). Escapa o HTML por caractere. Pura → testada. */
function highlightTerms(text, query) {
  text = text == null ? '' : String(text);
  const terms = normalizeText(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return escapeHtml(text);
  // versão normalizada + mapa de cada índice normalizado -> índice original
  let norm = ''; const map = [];
  for (let i = 0; i < text.length; i++) { const nc = normalizeText(text[i]); for (let k = 0; k < nc.length; k++) { norm += nc[k]; map.push(i); } }
  const mark = new Array(text.length).fill(false);
  for (const t of terms) {
    let from = 0, idx;
    while ((idx = norm.indexOf(t, from)) >= 0) {
      const o1 = map[idx], o2 = map[idx + t.length - 1];
      for (let j = o1; j <= o2; j++) mark[j] = true;
      from = idx + t.length;
    }
  }
  let html = '', open = false;
  for (let i = 0; i < text.length; i++) {
    if (mark[i] && !open) { html += '<mark>'; open = true; }
    else if (!mark[i] && open) { html += '</mark>'; open = false; }
    html += escapeHtml(text[i]);
  }
  if (open) html += '</mark>';
  return html;
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

/* Chip da caixa do item: caixa real (com a cor do grupo) · "Solto" · "Sem caixa" (órfão). */
function boxChipHtml(it) {
  const box = boxById(it.boxId);
  if (box) {
    const g = groupClass(box.mainGroup || boxProfile(box).domGroup);
    return `<span class="e-box${g ? ' grp-tint ' + g : ''}">${icon('box', 14)} ${escapeHtml(boxTitle(box))}</span>`;
  }
  if (it.loose) return `<span class="e-box is-loose">${icon('map-pin', 13)} Solto</span>`;
  return `<span class="e-box is-orphan">${icon('alert-triangle', 13)} Sem caixa</span>`;
}

/* Stepper de quantidade (ajuste rápido na lista). */
function qtyStepHtml(it) {
  const q = it.qty || 0;
  const low = it.min > 0 ? q <= it.min : q <= 1;
  return `<span class="qty-step">
    <button type="button" class="qty-btn" data-qsub="${it.id}" aria-label="Diminuir quantidade">−</button>
    <span class="qty-val${low ? ' low' : ''}" data-qval="${it.id}">${q}</span>
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
  const low = it.min > 0 ? q <= it.min : q <= 1;
  document.querySelectorAll(`[data-qval="${id}"]`).forEach((el) => { el.textContent = q; el.classList.toggle('low', low); });
}

/* Cartão de um item na lista de resultados. q = termo da busca (para realçar). */
function itemCardHtml(it, q) {
  const out = !!it.out;
  const outBadge = out ? `<span class="it-out-badge">${icon('log-out', 11)} Em uso</span>` : '';
  const lowBadge = isLowStock(it) ? `<span class="low-badge">${icon('alert-triangle', 11)} Estoque baixo</span>` : '';
  const toggle = `<button class="qbtn it-out-btn${out ? ' active' : ''}" data-toggleout="${it.id}" aria-label="${out ? 'Devolver à caixa' : 'Marcar como em uso'}" title="${out ? 'Devolver à caixa' : 'Marcar como em uso'}">${icon(out ? 'rotate-ccw' : 'log-out', 18)}</button>`;
  return `<li class="entry entry-sw${out ? ' is-out' : ''}" data-item="${it.id}">
    <span class="entry-bg" aria-hidden="true">${icon('trash-2', 20)} Excluir</span>
    <span class="entry-fg">
      ${thumbHtml(it)}
      <div class="e-main">
        <div class="e-desc">${highlightTerms(it.name, q || '')} ${sizeBadge(it.size)} ${outBadge} ${lowBadge}</div>
        <div class="e-meta">${it.category ? escapeHtml(it.category) : ''}${qtyStepHtml(it)}</div>
      </div>
      ${boxChipHtml(it)}
      ${toggle}
    </span>
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
  const lowN = (state.items || []).filter(isLowStock).length;
  const allActive = searchCat === '' && !searchOut && !searchNobox && !searchLow;
  let html = `<button class="chip${allActive ? ' active' : ''}" data-cat="">Todas (${(state.items || []).length})</button>`;
  if (outN) html += `<button class="chip chip-out${searchOut ? ' active' : ''}" data-onlyout="1">${icon('log-out', 12)} Em uso (${outN})</button>`;
  if (noboxN) html += `<button class="chip chip-nobox${searchNobox ? ' active' : ''}" data-nobox="1">${icon('alert-triangle', 12)} Sem caixa (${noboxN})</button>`;
  if (lowN) html += `<button class="chip chip-low${searchLow ? ' active' : ''}" data-low="1">${icon('alert-triangle', 12)} Estoque baixo (${lowN})</button>`;
  if (lowN && searchLow) html += `<button class="chip chip-share" data-sharelow="1">${icon('shopping-cart', 12)} Compartilhar lista</button>`;
  html += cats.filter((c) => counts[c]).map((c) =>
    `<button class="chip${searchCat === c ? ' active' : ''}" data-cat="${escapeHtml(c)}"><span class="grp-dot ${groupClass(grupoDaCategoria(c))}"></span>${escapeHtml(c)} (${counts[c]})</button>`).join('');
  box.innerHTML = html;
}

/* Renderiza a lista de resultados conforme a busca atual. */
function renderResults() {
  const list = $('results'); if (!list) return;
  renderCatChips();
  let found = searchItems(searchQuery, searchCat);
  if (searchOut) found = found.filter((it) => it.out);
  if (searchNobox) found = found.filter((it) => !it.boxId && !it.loose);
  if (searchLow) found = found.filter(isLowStock);
  const res = sortResults(found);
  if (!res.length) {
    const total = (state.items || []).length;
    if (!total) {
      list.innerHTML = (state.boxes || []).length
        ? emptyStateHtml('search', 'Nenhum item ainda', 'Cadastre o primeiro item — o app sugere a melhor caixa para ele.', 'data-empty="add-item"', 'Novo item')
        : emptyStateHtml('box', 'Bem-vindo ao Catálogo!', 'Comece criando uma caixa para guardar e organizar seus itens.', 'data-empty="add-box"', 'Criar primeira caixa');
    } else {
      const dym = didYouMean(searchQuery, state.items);
      list.innerHTML = `<li class="empty-list">Nada encontrado para essa busca.${dym
        ? `<br><button type="button" class="dym-btn" data-dym="${escapeHtml(dym.name)}">Você quis dizer <b>${escapeHtml(dym.name)}</b>?</button>` : ''}</li>`;
    }
    setupIcons(list);
    return;
  }
  list.innerHTML = res.map((it) => itemCardHtml(it, searchQuery)).join('');
  setupIcons(list);
  hydratePhotos(list);
}

/* Aplica o modo de visualização (lista/grade) na lista e no botão de alternância. */
function applySearchView() {
  const list = $('results'); if (list) list.classList.toggle('grid', searchView === 'grid');
  const btn = $('view-toggle');
  if (btn) {
    btn.innerHTML = icon(searchView === 'grid' ? 'list' : 'grid', 20);
    btn.title = searchView === 'grid' ? 'Ver em lista' : 'Ver em grade (fotos)';
  }
}

function setupSearchUI() {
  const q = $('q');
  if (q) q.addEventListener('input', () => { searchQuery = q.value; renderResults(); });
  try { const v = localStorage.getItem(VIEWMODE_KEY); if (v === 'grid') searchView = 'grid'; } catch (e) {}
  applySearchView();
  const vt = $('view-toggle');
  if (vt) vt.addEventListener('click', () => {
    searchView = searchView === 'grid' ? 'list' : 'grid';
    try { localStorage.setItem(VIEWMODE_KEY, searchView); } catch (e) {}
    applySearchView();
  });
  const chips = $('cat-chips');
  if (chips) chips.addEventListener('click', (e) => {
    const sh = e.target.closest('[data-sharelow]');
    if (sh) { shareShoppingList(); return; }
    const lo = e.target.closest('[data-low]');
    if (lo) { searchLow = !searchLow; searchOut = false; searchNobox = false; searchCat = ''; renderResults(); return; }
    const nob = e.target.closest('[data-nobox]');
    if (nob) { searchNobox = !searchNobox; searchOut = false; searchLow = false; searchCat = ''; renderResults(); return; }
    const out = e.target.closest('[data-onlyout]');
    if (out) { searchOut = !searchOut; searchNobox = false; searchLow = false; searchCat = ''; renderResults(); return; }
    const b = e.target.closest('[data-cat]'); if (!b) return;
    searchCat = b.dataset.cat || ''; searchOut = false; searchNobox = false; searchLow = false;
    renderResults();
  });
  const sort = $('sort');
  if (sort) sort.addEventListener('change', () => { searchSort = sort.value || 'rec'; renderResults(); });
  const list = $('results');
  if (list) list.addEventListener('click', (e) => {
    if (Date.now() - swipeGuardTs < 400) return;   // ignora clique-fantasma pós-swipe
    if (e.target.closest('[data-empty="add-item"]')) { openItemModal(null); return; }
    if (e.target.closest('[data-empty="add-box"]')) { openBoxModal(null); return; }
    const dy = e.target.closest('[data-dym]');
    if (dy) { searchQuery = dy.dataset.dym || ''; if ($('q')) $('q').value = searchQuery; renderResults(); return; }
    const qa = e.target.closest('[data-qadd]'); if (qa) { e.stopPropagation(); bumpQty(qa.dataset.qadd, 1); return; }
    const qs = e.target.closest('[data-qsub]'); if (qs) { e.stopPropagation(); bumpQty(qs.dataset.qsub, -1); return; }
    const tg = e.target.closest('[data-toggleout]');
    if (tg) { e.stopPropagation(); toggleItemOut(tg.dataset.toggleout); return; }
    if (openListThumb(e)) return;
    const li = e.target.closest('[data-item]'); if (!li) return;
    const it = (state.items || []).find((x) => x.id === li.dataset.item);
    if (it) openItemModal(it);
  });
  if ($('btn-add-item')) $('btn-add-item').addEventListener('click', () => openItemModal(null));
}
