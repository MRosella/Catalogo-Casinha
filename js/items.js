'use strict';
/* ============================================================
   Itens: modal de cadastro/edição (foto embutida, tamanho P/M/G,
   chip de sugestão de caixa).
   ============================================================ */

let editingItemId = null;
let itemPhoto = { mode: 'keep', data: null, w: 0, h: 0 };   // mode: keep | set | remove
let lastSuggestion = null;

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
  $('m-qty').value = item && item.qty ? item.qty : '';
  $('m-tags').value = item ? (item.tags || '') : '';
  $('m-note').value = item ? (item.note || '') : '';
  itemPhoto = { mode: 'keep', data: item && item.photo ? item.photo.data : null, w: item && item.photo ? item.photo.w : 0, h: item && item.photo ? item.photo.h : 0 };
  renderItemPhoto();
  $('m-delete').style.display = item ? '' : 'none';
  refreshSuggestion();
  $('item-modal').classList.add('open');
  setTimeout(() => { try { $('m-name').focus(); } catch (e) {} }, 50);
}
function closeItemModal() { $('item-modal').classList.remove('open'); editingItemId = null; }

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

function saveItem() {
  const name = ($('m-name').value || '').trim();
  if (!name) { toast('Dê um nome ao item.'); return; }
  const now = Date.now();
  let it = editingItemId ? (state.items || []).find((x) => x.id === editingItemId) : null;
  const isNew = !it;
  const prevBoxId = isNew ? '' : (it.boxId || '');
  if (!it) { it = { id: uid() }; state.items.push(it); }
  it.name = name;
  it.category = $('m-categoria').value || '';
  it.size = currentSize();
  it.boxId = $('m-box').value || '';
  it.qty = parseInt($('m-qty').value, 10) || 0;
  it.tags = ($('m-tags').value || '').trim();
  it.note = ($('m-note').value || '').trim();
  if (itemPhoto.mode === 'set') it.photo = { data: itemPhoto.data, w: itemPhoto.w, h: itemPhoto.h };
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

function deleteItem() {
  if (!editingItemId) return;
  if (!confirm('Excluir este item?')) return;
  const now = Date.now();
  const it = (state.items || []).find((x) => x.id === editingItemId);
  if (it) logEvent('remove', it, boxLabelById(it.boxId), '');
  state.items = state.items.filter((x) => x.id !== editingItemId);
  state.tomb.items[editingItemId] = now;
  touchDoc(); saveState();
  closeItemModal();
  render();
  toast('Item excluído.');
}

function viewItemPhoto() {
  if (!itemPhoto.data) return;
  const w = window.open('');
  if (w) w.document.write(`<img src="${itemPhoto.data}" style="max-width:100%">`);
}

function setupItemUI() {
  $('m-save').addEventListener('click', saveItem);
  $('m-cancel').addEventListener('click', closeItemModal);
  $('m-delete').addEventListener('click', deleteItem);
  $('m-categoria').addEventListener('change', refreshSuggestion);
  $('m-box').addEventListener('change', refreshSuggestion);
  $('m-suggest').addEventListener('click', applySuggestion);
  document.querySelectorAll('#m-size-group .size-btn').forEach((b) =>
    b.addEventListener('click', () => { setSizeButtons(currentSize() === b.dataset.size ? '' : b.dataset.size); refreshSuggestion(); }));
  $('m-photo-cam').addEventListener('click', () => $('m-photo-file').click());
  $('m-photo-pick').addEventListener('click', () => $('m-photo-import').click());
  $('m-photo-file').addEventListener('change', (ev) => { const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; onItemPhoto(f); });
  $('m-photo-import').addEventListener('change', (ev) => { const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; onItemPhoto(f); });
  $('m-photo-view').addEventListener('click', viewItemPhoto);
  $('m-photo-remove').addEventListener('click', () => { itemPhoto = { mode: 'remove', data: null, w: 0, h: 0 }; renderItemPhoto(); });
  $('item-modal').addEventListener('click', (e) => { if (e.target === $('item-modal')) closeItemModal(); });
}
