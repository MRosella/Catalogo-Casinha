'use strict';
/* ============================================================
   Itens: modal de cadastro/edição (foto embutida, tamanho P/M/G,
   chip de sugestão de caixa).
   ============================================================ */

let editingItemId = null;
let itemPhoto = { mode: 'keep', data: null, w: 0, h: 0 };   // mode: keep | set | remove
let lastSuggestion = null;
let dupMatches = [];   // itens parecidos com o nome digitado (aviso de duplicado)

function openItemModal(item, presetBoxId) {
  editingItemId = item ? item.id : null;
  if (item) markViewed(item.id);   // alimenta a ordenação "Vistos por último"
  $('item-modal-title').textContent = item ? 'Editar item' : 'Novo item';
  $('m-name').value = item ? (item.name || '') : '';
  populateCategorySelects();
  $('m-categoria').value = item ? (item.category || '') : '';
  setSizeButtons(item ? (item.size || '') : '');
  populateBoxSelects();
  $('m-box').value = item ? (item.boxId || '') : (presetBoxId || '');
  if ($('m-loose')) $('m-loose').checked = !!(item && item.loose);
  updateLooseRow();
  $('m-qty').value = item && item.qty ? item.qty : '';
  if ($('m-min')) $('m-min').value = item && item.min ? item.min : '';
  $('m-tags').value = item ? (item.tags || '') : '';
  $('m-note').value = item ? (item.note || '') : '';
  const ph = (item && item.photo) ? item.photo : null;
  itemPhoto = { mode: 'keep', data: ph ? (ph.data || null) : null, w: ph ? (ph.w || 0) : 0, h: ph ? (ph.h || 0) : 0 };
  renderItemPhoto();
  if (ph && ph.ref && !itemPhoto.data) {           // foto externalizada: resolve o preview async
    const forId = item.id;
    resolvePhotoSrc(ph.ref).then((src) => {
      if (src && editingItemId === forId && itemPhoto.mode === 'keep' && !itemPhoto.data) { itemPhoto.data = src; renderItemPhoto(); }
    });
  }
  renderOutToggle(item && item.out ? item.out : 0);
  $('m-delete').style.display = item ? '' : 'none';
  refreshSuggestion();
  refreshDupWarning();
  $('item-modal').classList.add('open');
  setTimeout(() => { try { $('m-name').focus(); } catch (e) {} }, 50);
}
function closeItemModal() { $('item-modal').classList.remove('open'); editingItemId = null; }

/* Mostra a opção "guardado solto" só quando nenhuma caixa está selecionada. */
function updateLooseRow() {
  const row = $('m-loose-row'); if (!row) return;
  row.style.display = (($('m-box').value || '') === '') ? 'flex' : 'none';
}

/* ---- Tamanho (botões P/M/G) ---- */
function setSizeButtons(val) {
  document.querySelectorAll('#m-size-group .size-btn').forEach((b) => b.classList.toggle('active', b.dataset.size === val));
  $('m-size-group').dataset.value = val || '';
}
function currentSize() { return $('m-size-group').dataset.value || ''; }

/* ---- Sugestão de caixa ---- */
function refreshSuggestion() {
  const chip = $('m-suggest'); if (!chip) return;
  const cat = $('m-categoria').value;
  if (!cat) { chip.style.display = 'none'; lastSuggestion = null; return; }
  const s = suggestBox({ category: cat, size: currentSize(), boxId: editingItemId ? null : '' });
  lastSuggestion = s;
  // se já está na caixa sugerida, não precisa do chip
  if (!s.createNew && s.box && $('m-box').value === s.box.id) { chip.style.display = 'none'; return; }
  const label = s.createNew ? ('Criar caixa nova de ' + grupoDaCategoria(cat))
                            : ('Sugestão: ' + boxTitle(s.box));
  chip.innerHTML = `<span class="sg-ic">${icon('box', 15)}</span><span class="sg-txt"><b>${escapeHtml(label)}</b><small>${escapeHtml(s.reason)}</small></span>`;
  chip.style.display = '';
  setupIcons(chip);
}
function applySuggestion() {
  const s = lastSuggestion; if (!s) return;
  if (s.createNew) {
    // cria a caixa na hora (código automático), já no grupo/tamanho do item, e seleciona
    const b = { id: uid(), code: nextBoxCode(), name: grupoDaCategoria($('m-categoria').value), location: '', note: '', mainGroup: s.newSeed.mainGroup, sizeClass: s.newSeed.sizeClass, updatedAt: Date.now() };
    state.boxes.push(b);
    touchDoc(); saveState();
    populateBoxSelects();
    $('m-box').value = b.id;
    toast('Caixa ' + boxTitle(b) + ' criada.');
  } else if (s.box) {
    $('m-box').value = s.box.id;
  }
  refreshSuggestion();
}

/* ---- Aviso de item duplicado (só em item novo) ---- */
function refreshDupWarning() {
  const chip = $('m-dup'); if (!chip) return;
  const name = ($('m-name').value || '').trim();
  dupMatches = (!editingItemId && name.length >= 2) ? findSimilarItems(name, null) : [];
  if (!dupMatches.length) { chip.style.display = 'none'; return; }
  const top = dupMatches[0].item;
  const where = top.boxId ? boxTitle(boxById(top.boxId)) : (top.loose ? 'solto na casinha' : 'sem caixa');
  const more = dupMatches.length > 1 ? ` (+${dupMatches.length - 1})` : '';
  chip.innerHTML = `<span class="sg-ic">${icon('alert-triangle', 15)}</span>` +
    `<span class="sg-txt"><b>Já existe: ${escapeHtml(top.name)}${more}</b>` +
    `<small>${escapeHtml(where)} · toque para somar à quantidade</small></span>`;
  chip.style.display = '';
  setupIcons(chip);
}
/* Soma a quantidade digitada (ou 1) ao item existente em vez de criar duplicado. */
function applyDupMerge() {
  const top = dupMatches[0]; if (!top) return;
  const it = top.item;
  const add = parseInt($('m-qty').value, 10) || 1;
  it.qty = (it.qty || 0) + add;
  it.updatedAt = Date.now();
  logEvent('add', it, '', boxLabelById(it.boxId));
  touchDoc(); saveState();
  closeItemModal();
  render();
  toast(it.name + ': quantidade agora ' + it.qty + '.');
}

/* ---- "Em uso" (retirado da caixa, sem excluir) ---- */
/* Reflete o estado no botão do modal; some em item novo (ainda não salvo). */
function renderOutToggle(outTs) {
  const btn = $('m-out'); if (!btn) return;
  if (!editingItemId) { btn.style.display = 'none'; return; }
  btn.style.display = '';
  const isOut = !!outTs;
  btn.classList.toggle('active', isOut);
  btn.innerHTML = `${icon(isOut ? 'rotate-ccw' : 'log-out', 16)} ${isOut ? 'Devolver à caixa' : 'Marcar como em uso'}`;
}
/* Alterna o estado "em uso" de um item por id; registra no histórico e re-renderiza. */
function toggleItemOut(id) {
  const it = (state.items || []).find((x) => x.id === id); if (!it) return;
  const now = Date.now();
  const wasOut = !!it.out;
  it.out = wasOut ? 0 : now;
  it.updatedAt = now;
  logEvent(wasOut ? 'return' : 'out', it, boxLabelById(it.boxId), boxLabelById(it.boxId));
  touchDoc(); saveState();
  render();
  if (detailBoxId) openBoxDetail(detailBoxId);          // atualiza o detalhe da caixa aberto
  if (editingItemId === id) renderOutToggle(it.out);     // atualiza o botão do modal aberto
  toast(wasOut ? 'Devolvido à caixa.' : 'Marcado como em uso.');
}

/* ---- Foto (embutida) ---- */
function renderItemPhoto() {
  const has = (itemPhoto.mode === 'set' || (itemPhoto.mode === 'keep' && itemPhoto.data));
  $('m-photo-preview').innerHTML = has && itemPhoto.data ? `<img src="${itemPhoto.data}" alt="foto do item" />` : '';
  $('m-photo-view').style.display = has && itemPhoto.data ? '' : 'none';
  $('m-photo-remove').style.display = has && itemPhoto.data ? '' : 'none';
}
async function onItemPhoto(file) {
  if (!file) return;
  try {
    const p = await photoFromFile(file);
    itemPhoto = { mode: 'set', data: p.data, w: p.w, h: p.h };
    renderItemPhoto();
  } catch (e) { console.warn('foto falhou', e); toast('Não foi possível usar a imagem.'); }
}

async function saveItem() {
  const name = ($('m-name').value || '').trim();
  if (!name) { toast('Dê um nome ao item.'); return; }
  if (!editingItemId) {   // item novo: evita duplicar nome praticamente idêntico
    const strong = findSimilarItems(name, null).filter((m) => m.score >= 0.85);
    if (strong.length) {
      const ok = await confirmDialog('Já existe "' + strong[0].item.name +
        '". Criar um item separado mesmo assim?',
        { okText: 'Criar assim mesmo', cancelText: 'Cancelar' });
      if (!ok) return;   // cancelou: pode tocar no chip p/ somar
    }
  }
  const now = Date.now();
  let it = editingItemId ? (state.items || []).find((x) => x.id === editingItemId) : null;
  const isNew = !it;
  const prevBoxId = isNew ? '' : (it.boxId || '');
  if (!it) { it = { id: uid() }; state.items.push(it); }
  it.name = name;
  it.category = $('m-categoria').value || '';
  it.size = currentSize();
  it.boxId = $('m-box').value || '';
  it.loose = (!it.boxId && $('m-loose') && $('m-loose').checked) ? true : false;
  it.qty = parseInt($('m-qty').value, 10) || 0;
  it.min = ($('m-min') ? parseInt($('m-min').value, 10) : 0) || 0;
  it.tags = ($('m-tags').value || '').trim();
  it.note = ($('m-note').value || '').trim();
  if (itemPhoto.mode === 'set') it.photo = await savePhoto(itemPhoto.data, itemPhoto.w, itemPhoto.h);
  else if (itemPhoto.mode === 'remove') it.photo = null;
  it.updatedAt = now;
  // histórico: cadastro novo ou mudança de caixa (reorganização)
  if (isNew) logEvent('add', it, '', boxLabelById(it.boxId));
  else if (prevBoxId !== (it.boxId || '')) logEvent('move', it, boxLabelById(prevBoxId), boxLabelById(it.boxId));
  touchDoc(); saveState();
  closeItemModal();
  render();
  toast('Item salvo.');
}

async function deleteItem() {
  if (!editingItemId) return;
  if (!await confirmDialog('Excluir este item?', { okText: 'Excluir', danger: true })) return;
  const id = editingItemId;
  closeItemModal();
  deleteItemById(id);
}

/* ---- Exclusão com "Desfazer" (item e caixa) ---- */
let lastDeleted = null;   // {kind:'item'|'box', item?|box?, items?:[{id,boxId}]}

/* Exclui um item por id (usado pelo modal e pelo swipe), com rede de Desfazer. */
function deleteItemById(id) {
  const it = (state.items || []).find((x) => x.id === id); if (!it) return;
  const now = Date.now();
  logEvent('remove', it, boxLabelById(it.boxId), '');
  lastDeleted = { kind: 'item', item: Object.assign({}, it) };
  state.items = state.items.filter((x) => x.id !== id);
  state.tomb.items[id] = now;
  touchDoc(); saveState();
  render();
  if (detailBoxId) openBoxDetail(detailBoxId);
  showUndo('Item excluído.', undoLastDelete);
}

/* Restaura a última exclusão (item ou caixa + itens que ficaram sem caixa). */
function undoLastDelete() {
  const d = lastDeleted; if (!d) return; lastDeleted = null;
  const now = Date.now();
  if (d.kind === 'item') {
    d.item.updatedAt = now; state.items.push(d.item); delete state.tomb.items[d.item.id];
  } else {
    d.box.updatedAt = now; state.boxes.push(d.box); delete state.tomb.boxes[d.box.id];
    for (const r of (d.items || [])) { const it = (state.items || []).find((x) => x.id === r.id); if (it) { it.boxId = r.boxId; it.updatedAt = now; } }
    populateBoxSelects();
  }
  touchDoc(); saveState();
  render();
  if (detailBoxId) openBoxDetail(detailBoxId);
  toast('Restaurado.');
}

/* Barra "Desfazer": mostra por ~6s; o botão chama fn; some sozinha. */
function showUndo(msg, fn) {
  const bar = $('undo-bar'); if (!bar) { toast(msg); return; }
  $('undo-msg').textContent = msg;
  bar.hidden = false;
  requestAnimationFrame(() => bar.classList.add('show'));
  $('undo-btn').onclick = () => { hideUndo(); fn(); };
  clearTimeout(showUndo._t);
  showUndo._t = setTimeout(hideUndo, 6000);
}
function hideUndo() {
  const bar = $('undo-bar'); if (!bar) return;
  bar.classList.remove('show');
  clearTimeout(showUndo._t);
  setTimeout(() => { bar.hidden = true; }, 220);
}

/* ---- Swipe p/ excluir item (arrastar para a esquerda na lista) ---- */
let swipeGuardTs = 0;   // marca o fim de um swipe → o handler de clique ignora o clique-fantasma
function setupSwipeDelete(listEl) {
  if (!listEl) return;
  let fg = null, id = '', x0 = 0, y0 = 0, dir = 0, dx = 0, li = null;
  const TH = () => Math.min(140, Math.max(90, listEl.clientWidth * 0.4));
  listEl.addEventListener('touchstart', (e) => {
    const t = e.target.closest('.entry-sw[data-item]');
    if (!t) { fg = null; return; }
    li = t; fg = t.querySelector('.entry-fg'); id = t.dataset.item;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dir = 0; dx = 0;
    if (fg) fg.style.transition = 'none';
  }, { passive: true });
  listEl.addEventListener('touchmove', (e) => {
    if (!fg) return;
    const cx = e.touches[0].clientX, cy = e.touches[0].clientY;
    if (!dir) {
      if (Math.abs(cx - x0) > 10 && Math.abs(cx - x0) > Math.abs(cy - y0)) dir = 1;        // horizontal
      else if (Math.abs(cy - y0) > 10) { dir = -1; fg = null; return; }                    // vertical = scroll
      else return;
    }
    dx = Math.min(0, cx - x0);   // só para a esquerda
    e.preventDefault();
    fg.style.transform = 'translateX(' + dx + 'px)';
    li.classList.toggle('will-delete', -dx > TH());
  }, { passive: false });
  const end = () => {
    if (!fg) return;
    const f = fg, l = li, theId = id;
    f.style.transition = '';
    if (-dx > TH()) {
      f.style.transform = 'translateX(-100%)';
      swipeGuardTs = Date.now();
      setTimeout(() => deleteItemById(theId), 160);
    } else {
      f.style.transform = '';
      if (l) l.classList.remove('will-delete');
      if (dir === 1) swipeGuardTs = Date.now();
    }
    fg = null; li = null; dir = 0; dx = 0;
  };
  listEl.addEventListener('touchend', end);
  listEl.addEventListener('touchcancel', end);
}

function viewItemPhoto() { if (itemPhoto.data) openLightbox(itemPhoto.data); }

/* ---- Lightbox interno (substitui o window.open, que saía do app no PWA) ---- */
function openLightbox(src) {
  const lb = $('lightbox'); if (!lb || !src) return;
  $('lb-img').src = src;
  lb.classList.add('open');
}
function closeLightbox() {
  const lb = $('lightbox'); if (!lb) return;
  lb.classList.remove('open');
  $('lb-img').removeAttribute('src');
}
function setupLightboxUI() {
  const lb = $('lightbox'); if (!lb) return;
  $('lb-close').addEventListener('click', closeLightbox);
  lb.addEventListener('click', (e) => { if (e.target === lb || e.target.id === 'lb-img') closeLightbox(); });
}

/* Clique numa miniatura da lista: abre só a foto no lightbox (sem abrir o item).
   Retorna true se tratou (havia miniatura com foto); false p/ cair no openItemModal. */
function openListThumb(e) {
  const thumb = e.target.closest('.it-thumb'); if (!thumb) return false;
  const li = e.target.closest('[data-item]'); if (!li) return false;
  const it = (state.items || []).find((x) => x.id === li.dataset.item);
  if (!it || !it.photo) return false;   // sem foto: miniatura genérica abre o item
  e.stopPropagation();
  const src = thumb.tagName === 'IMG' ? thumb.getAttribute('src') : null;
  if (src) openLightbox(src);
  else if (it.photo.ref) resolvePhotoSrc(it.photo.ref).then((s) => { if (s) openLightbox(s); });
  else if (it.photo.data) openLightbox(it.photo.data);
  return true;
}

function setupItemUI() {
  $('m-save').addEventListener('click', saveItem);
  $('m-cancel').addEventListener('click', closeItemModal);
  $('m-delete').addEventListener('click', deleteItem);
  if ($('m-out')) $('m-out').addEventListener('click', () => { if (editingItemId) toggleItemOut(editingItemId); });
  $('m-name').addEventListener('input', refreshDupWarning);
  $('m-categoria').addEventListener('change', refreshSuggestion);
  $('m-box').addEventListener('change', () => { updateLooseRow(); refreshSuggestion(); });
  $('m-suggest').addEventListener('click', applySuggestion);
  $('m-dup').addEventListener('click', applyDupMerge);
  document.querySelectorAll('#m-size-group .size-btn').forEach((b) =>
    b.addEventListener('click', () => { setSizeButtons(currentSize() === b.dataset.size ? '' : b.dataset.size); refreshSuggestion(); }));
  $('m-photo-cam').addEventListener('click', () => $('m-photo-file').click());
  $('m-photo-pick').addEventListener('click', () => $('m-photo-import').click());
  $('m-photo-file').addEventListener('change', (ev) => { const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; onItemPhoto(f); });
  $('m-photo-import').addEventListener('change', (ev) => { const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; onItemPhoto(f); });
  $('m-photo-view').addEventListener('click', viewItemPhoto);
  $('m-photo-remove').addEventListener('click', () => { itemPhoto = { mode: 'remove', data: null, w: 0, h: 0 }; renderItemPhoto(); });
  if ($('m-photo-preview')) $('m-photo-preview').addEventListener('click', () => { if (itemPhoto.data) openLightbox(itemPhoto.data); });
  $('item-modal').addEventListener('click', (e) => { if (e.target === $('item-modal')) closeItemModal(); });
  setupSwipeDelete($('results'));
  setupSwipeDelete($('bd-items'));
  setupLightboxUI();
}
