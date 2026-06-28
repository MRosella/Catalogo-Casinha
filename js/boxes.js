'use strict';
/* ============================================================
   Caixas: CRUD, lista (tela Caixas), detalhe e modal.
   ============================================================ */

/* Próximo código sugerido p/ caixa nova: "C-01", "C-02"… (maior + 1). */
function nextBoxCode() {
  let max = 0;
  for (const b of (state.boxes || [])) {
    const m = /(\d+)\s*$/.exec(b.code || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'C-' + String(max + 1).padStart(2, '0');
}

function boxTitle(b) { return (b.code ? b.code : '') + (b.name ? (b.code ? ' · ' : '') + b.name : '') || '(sem nome)'; }

/* Capacidade (espaço) ajustável por caixa. Ausente = padrão SUGGEST_FULL. */
const BOX_CAP_MIN = 1;
const BOX_CAP_MAX = 60;
function boxCapacity(b) { const c = b && parseInt(b.capacity, 10); return (c && c > 0) ? c : SUGGEST_FULL; }

/* Estado de ocupação de uma caixa segundo a capacidade dela:
   ok (com folga) · near (≥80% cheia) · full (lotada). */
function boxFullness(count, cap) {
  cap = (cap && cap > 0) ? cap : SUGGEST_FULL;
  if (count >= cap) return { cls: 'full', label: 'Lotada' };
  if (count >= Math.round(cap * 0.8)) return { cls: 'near', label: 'Quase cheia' };
  return { cls: 'ok', label: count + (count === 1 ? ' item' : ' itens') };
}

/* Chip de ocupação p/ a lista de caixas. */
function fillChipHtml(count, cap) {
  const f = boxFullness(count, cap);
  const ic = f.cls === 'ok' ? '' : icon('alert-triangle', 12) + ' ';
  return `<span class="bx-fill bx-fill-${f.cls}">${ic}${escapeHtml(f.label)}</span>`;
}

/* Barra visual de ocupação (proporção count/cap), mesma cor do chip. */
function fillBarHtml(count, cap) {
  cap = (cap && cap > 0) ? cap : SUGGEST_FULL;
  const f = boxFullness(count, cap);
  const pct = count ? Math.max(5, Math.min(100, Math.round(count / cap * 100))) : 0;
  return `<span class="bx-bar bx-bar-${f.cls}" aria-hidden="true"><span class="bx-bar-fill" style="width:${pct}%"></span></span>`;
}

/* ---------- Lista de caixas (tela Caixas) ---------- */
function boxCardHtml(b) {
  const prof = boxProfile(b);
  const grp = prof.domGroup || b.mainGroup || '—';
  const loc = b.location ? `<span class="bx-loc">${icon('map-pin', 13)} ${escapeHtml(b.location)}</span>` : '';
  return `<li class="entry bx-row" data-box="${b.id}">
    <span class="it-thumb it-thumb-ph" aria-hidden="true">${icon('box', 22)}</span>
    <div class="e-main">
      <div class="e-desc">${escapeHtml(boxTitle(b))}</div>
      <div class="e-meta">${escapeHtml(grp)} ${loc}</div>
      ${fillBarHtml(prof.count, boxCapacity(b))}
    </div>
    ${fillChipHtml(prof.count, boxCapacity(b))}
    <button class="qbtn bx-edit" data-edit="${b.id}" aria-label="Editar caixa">${icon('edit', 18)}</button>
  </li>`;
}

function renderBoxes() {
  const list = $('boxes-list'); if (!list) return;
  const boxes = (state.boxes || []).slice().sort((a, b) => (a.code || '').localeCompare(b.code || '', 'pt', { numeric: true }));
  if (!boxes.length) {
    list.innerHTML = emptyStateHtml('box', 'Nenhuma caixa ainda',
      'Crie caixas para organizar seus itens e gerar etiquetas com QR para colar nelas.',
      'data-empty="add-box"', 'Nova caixa');
    setupIcons(list);
    return;
  }
  list.innerHTML = boxes.map(boxCardHtml).join('');
  setupIcons(list);
}

/* ---------- Modal de caixa (criar/editar) ---------- */
let editingBoxId = null;

function openBoxModal(box, seed) {
  editingBoxId = box ? box.id : null;
  $('bx-modal-title').textContent = box ? 'Editar caixa' : 'Nova caixa';
  $('bx-code').value = box ? (box.code || '') : nextBoxCode();
  $('bx-name').value = box ? (box.name || '') : '';
  $('bx-location').value = box ? (box.location || '') : '';
  $('bx-note').value = box ? (box.note || '') : '';
  populateGroupSelect($('bx-group'), box ? box.mainGroup : (seed && seed.mainGroup) || '');
  $('bx-size').value = box ? (box.sizeClass || '') : (seed && seed.sizeClass) || '';
  if ($('bx-cap')) { $('bx-cap').value = boxCapacity(box || {}); updateCapHint(box ? itemsInBox(box.id).length : 0); }
  $('bx-delete').style.display = box ? '' : 'none';
  $('box-modal').classList.add('open');
}
function closeBoxModal() { $('box-modal').classList.remove('open'); editingBoxId = null; }

/* Atualiza o número e a dica do slider de espaço a partir da ocupação atual. */
function updateCapHint(count) {
  const cap = parseInt(($('bx-cap') || {}).value, 10) || SUGGEST_FULL;
  if ($('bx-cap-val')) $('bx-cap-val').textContent = cap;
  const hint = $('bx-cap-hint'); if (!hint) return;
  const f = boxFullness(count, cap);
  if (f.cls === 'full') { hint.textContent = `Lotada (${count}/${cap})`; }
  else { const free = cap - count; hint.textContent = `Cabe${free === 1 ? '' : 'm'} mais ${free} (${count}/${cap})`; }
  hint.className = 'cap-hint cap-hint-' + f.cls;
}

function saveBox() {
  const code = ($('bx-code').value || '').trim();
  const name = ($('bx-name').value || '').trim();
  if (!code && !name) { toast('Dê um código ou nome à caixa.'); return; }
  const now = Date.now();
  let b = editingBoxId ? boxById(editingBoxId) : null;
  if (!b) { b = { id: uid() }; state.boxes.push(b); }
  b.code = code; b.name = name;
  b.location = ($('bx-location').value || '').trim();
  b.note = ($('bx-note').value || '').trim();
  b.mainGroup = $('bx-group').value || '';
  b.sizeClass = $('bx-size').value || '';
  if ($('bx-cap')) b.capacity = Math.max(BOX_CAP_MIN, Math.min(BOX_CAP_MAX, parseInt($('bx-cap').value, 10) || SUGGEST_FULL));
  b.updatedAt = now;
  touchDoc(); saveState();
  closeBoxModal();
  render();
  populateBoxSelects();
  toast('Caixa salva.');
}

async function deleteBox() {
  if (!editingBoxId) return;
  const n = itemsInBox(editingBoxId).length;
  const msg = n ? `Esta caixa tem ${n} ${n === 1 ? 'item' : 'itens'}. Eles ficarão SEM caixa. Excluir a caixa?`
                : 'Excluir esta caixa?';
  if (!await confirmDialog(msg, { okText: 'Excluir', danger: true })) return;
  const now = Date.now();
  for (const it of itemsInBox(editingBoxId)) { it.boxId = ''; it.updatedAt = now; }   // desvincula
  state.boxes = state.boxes.filter((b) => b.id !== editingBoxId);
  state.tomb.boxes[editingBoxId] = now;
  touchDoc(); saveState();
  closeBoxModal();
  render();
  populateBoxSelects();
  toast('Caixa excluída.');
}

/* ---------- Detalhe da caixa (itens dentro) ---------- */
let detailBoxId = null;
function openBoxDetail(id) {
  const b = boxById(id); if (!b) return;
  detailBoxId = id;
  $('bd-title').textContent = boxTitle(b);
  const prof = boxProfile(b);
  $('bd-sub').textContent = `${prof.count} ${prof.count === 1 ? 'item' : 'itens'}` +
    (b.location ? ' · ' + b.location : '') + (prof.domGroup ? ' · ' + prof.domGroup : '');
  const items = itemsInBox(id).slice().sort((a, b2) => normalizeText(a.name).localeCompare(normalizeText(b2.name)));
  const list = $('bd-items');
  list.innerHTML = items.length ? items.map(itemCardHtml).join('')
    : `<li class="empty-list">Caixa vazia. Cadastre itens e aponte para esta caixa.</li>`;
  setupIcons(list);
  hydratePhotos(list);
  $('bd-print').onclick = () => printLabels([b]);
  $('box-detail').classList.add('open');
}
function closeBoxDetail() { $('box-detail').classList.remove('open'); detailBoxId = null; setPendingBox(''); }

/* ---------- Mover vários itens de uma vez (a partir do detalhe da caixa) ---------- */
let moveFromBoxId = null;
function openMoveModal(fromId) {
  const b = boxById(fromId); if (!b) return;
  moveFromBoxId = fromId;
  const items = itemsInBox(fromId).slice().sort((a, c) => normalizeText(a.name).localeCompare(normalizeText(c.name)));
  $('mv-sub').textContent = 'De ' + boxTitle(b);
  const list = $('mv-list');
  list.innerHTML = items.length
    ? items.map((it) => `<li class="mv-row"><input type="checkbox" data-mv="${it.id}" /><span class="mv-name">${escapeHtml(it.name)}</span>${it.out ? '<span class="mv-cur">em uso</span>' : ''}</li>`).join('')
    : `<li class="mv-empty">Caixa vazia — nada para mover.</li>`;
  const others = (state.boxes || []).filter((x) => x.id !== fromId)
    .sort((a, c) => (a.code || '').localeCompare(c.code || '', 'pt', { numeric: true }));
  $('mv-target').innerHTML = '<option value="">— sem caixa —</option>' + others.map((x) => `<option value="${x.id}">${escapeHtml(boxTitle(x))}</option>`).join('');
  $('move-modal').classList.add('open');
}
function closeMoveModal() { $('move-modal').classList.remove('open'); moveFromBoxId = null; }
function doMoveItems() {
  const checked = Array.from(document.querySelectorAll('#mv-list input[data-mv]:checked')).map((c) => c.dataset.mv);
  if (!checked.length) { toast('Selecione ao menos um item.'); return; }
  const toId = $('mv-target').value || '';
  const toLabel = boxLabelById(toId);
  const now = Date.now();
  let n = 0;
  for (const id of checked) {
    const it = (state.items || []).find((x) => x.id === id);
    if (!it || (it.boxId || '') === toId) continue;
    logEvent('move', it, boxLabelById(it.boxId), toLabel);
    it.boxId = toId;
    if (toId) it.loose = false;          // entrou numa caixa: não é mais "solto de propósito"
    it.updatedAt = now;
    n++;
  }
  if (!n) { closeMoveModal(); toast('Nada mudou.'); return; }
  touchDoc(); saveState();
  closeMoveModal();
  render();
  if (detailBoxId) openBoxDetail(detailBoxId);
  toast(n + (n === 1 ? ' item movido.' : ' itens movidos.'));
}
function setupMoveUI() {
  const m = $('move-modal'); if (!m) return;
  $('mv-close').addEventListener('click', closeMoveModal);
  $('mv-cancel').addEventListener('click', closeMoveModal);
  $('mv-do').addEventListener('click', doMoveItems);
  $('mv-all').addEventListener('click', () => {
    const cbs = document.querySelectorAll('#mv-list input[data-mv]');
    const allOn = cbs.length && Array.from(cbs).every((c) => c.checked);
    cbs.forEach((c) => { c.checked = !allOn; });
  });
  $('mv-list').addEventListener('click', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const row = e.target.closest('.mv-row'); if (!row) return;
    const cb = row.querySelector('input[data-mv]'); if (cb) cb.checked = !cb.checked;
  });
  m.addEventListener('click', (e) => { if (e.target === m) closeMoveModal(); });
}

function setupBoxUI() {
  const list = $('boxes-list');
  if (list) list.addEventListener('click', (e) => {
    if (e.target.closest('[data-empty="add-box"]')) { openBoxModal(null); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) { const b = boxById(ed.dataset.edit); if (b) openBoxModal(b); return; }
    const row = e.target.closest('[data-box]');
    if (row) openBoxDetail(row.dataset.box);
  });
  if ($('btn-add-box')) $('btn-add-box').addEventListener('click', () => openBoxModal(null));
  if ($('btn-print-labels')) $('btn-print-labels').addEventListener('click', () => printLabels(state.boxes));
  if ($('bx-cap')) $('bx-cap').addEventListener('input', () => updateCapHint(editingBoxId ? itemsInBox(editingBoxId).length : 0));
  $('bx-save').addEventListener('click', saveBox);
  $('bx-cancel').addEventListener('click', closeBoxModal);
  $('bx-delete').addEventListener('click', deleteBox);
  $('box-modal').addEventListener('click', (e) => { if (e.target === $('box-modal')) closeBoxModal(); });
  // detalhe da caixa
  $('bd-close').addEventListener('click', closeBoxDetail);
  $('bd-add').addEventListener('click', () => { const id = detailBoxId; closeBoxDetail(); openItemModal(null, id); });
  if ($('bd-move')) $('bd-move').addEventListener('click', () => { if (detailBoxId) openMoveModal(detailBoxId); });
  setupMoveUI();
  const bdItems = $('bd-items');
  if (bdItems) bdItems.addEventListener('click', (e) => {
    const qa = e.target.closest('[data-qadd]'); if (qa) { e.stopPropagation(); bumpQty(qa.dataset.qadd, 1); return; }
    const qs = e.target.closest('[data-qsub]'); if (qs) { e.stopPropagation(); bumpQty(qs.dataset.qsub, -1); return; }
    const tg = e.target.closest('[data-toggleout]');
    if (tg) { e.stopPropagation(); toggleItemOut(tg.dataset.toggleout); return; }
    const li = e.target.closest('[data-item]'); if (!li) return;
    const it = (state.items || []).find((x) => x.id === li.dataset.item);
    if (it) { closeBoxDetail(); openItemModal(it); }
  });
  $('box-detail').addEventListener('click', (e) => { if (e.target === $('box-detail')) closeBoxDetail(); });
}
