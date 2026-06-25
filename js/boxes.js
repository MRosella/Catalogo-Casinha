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

/* Estado de ocupação de uma caixa (usa o mesmo SUGGEST_FULL da sugestão):
   ok (com folga) · near (≥80% cheia) · full (lotada). */
function boxFullness(count) {
  if (count >= SUGGEST_FULL) return { cls: 'full', label: 'Lotada' };
  if (count >= Math.round(SUGGEST_FULL * 0.8)) return { cls: 'near', label: 'Quase cheia' };
  return { cls: 'ok', label: count + (count === 1 ? ' item' : ' itens') };
}

/* Chip de ocupação p/ a lista de caixas. */
function fillChipHtml(count) {
  const f = boxFullness(count);
  const ic = f.cls === 'ok' ? '' : icon('alert-triangle', 12) + ' ';
  return `<span class="bx-fill bx-fill-${f.cls}">${ic}${escapeHtml(f.label)}</span>`;
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
    </div>
    ${fillChipHtml(prof.count)}
    <button class="qbtn bx-edit" data-edit="${b.id}" aria-label="Editar caixa">${icon('edit', 18)}</button>
  </li>`;
}

function renderBoxes() {
  const list = $('boxes-list'); if (!list) return;
  const boxes = (state.boxes || []).slice().sort((a, b) => (a.code || '').localeCompare(b.code || '', 'pt', { numeric: true }));
  if (!boxes.length) {
    list.innerHTML = `<li class="empty-list">Nenhuma caixa ainda. Toque em “Nova caixa”.</li>`;
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
  $('bx-delete').style.display = box ? '' : 'none';
  $('box-modal').classList.add('open');
}
function closeBoxModal() { $('box-modal').classList.remove('open'); editingBoxId = null; }

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
  b.updatedAt = now;
  touchDoc(); saveState();
  closeBoxModal();
  render();
  populateBoxSelects();
  toast('Caixa salva.');
}

function deleteBox() {
  if (!editingBoxId) return;
  const n = itemsInBox(editingBoxId).length;
  const msg = n ? `Esta caixa tem ${n} ${n === 1 ? 'item' : 'itens'}. Eles ficarão SEM caixa. Excluir a caixa?`
                : 'Excluir esta caixa?';
  if (!confirm(msg)) return;
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
  $('bd-print').onclick = () => printLabels([b]);
  $('box-detail').classList.add('open');
}
function closeBoxDetail() { $('box-detail').classList.remove('open'); detailBoxId = null; setPendingBox(''); }

function setupBoxUI() {
  const list = $('boxes-list');
  if (list) list.addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) { const b = boxById(ed.dataset.edit); if (b) openBoxModal(b); return; }
    const row = e.target.closest('[data-box]');
    if (row) openBoxDetail(row.dataset.box);
  });
  if ($('btn-add-box')) $('btn-add-box').addEventListener('click', () => openBoxModal(null));
  if ($('btn-print-labels')) $('btn-print-labels').addEventListener('click', () => printLabels(state.boxes));
  $('bx-save').addEventListener('click', saveBox);
  $('bx-cancel').addEventListener('click', closeBoxModal);
  $('bx-delete').addEventListener('click', deleteBox);
  $('box-modal').addEventListener('click', (e) => { if (e.target === $('box-modal')) closeBoxModal(); });
  // detalhe da caixa
  $('bd-close').addEventListener('click', closeBoxDetail);
  $('bd-add').addEventListener('click', () => { const id = detailBoxId; closeBoxDetail(); openItemModal(null, id); });
  const bdItems = $('bd-items');
  if (bdItems) bdItems.addEventListener('click', (e) => {
    const tg = e.target.closest('[data-toggleout]');
    if (tg) { e.stopPropagation(); toggleItemOut(tg.dataset.toggleout); return; }
    const li = e.target.closest('[data-item]'); if (!li) return;
    const it = (state.items || []).find((x) => x.id === li.dataset.item);
    if (it) { closeBoxDetail(); openItemModal(it); }
  });
  $('box-detail').addEventListener('click', (e) => { if (e.target === $('box-detail')) closeBoxDetail(); });
}
