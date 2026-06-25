'use strict';
/* ============================================================
   Navegação (menu lateral + telas), selects, editor de
   categorias e backup (export/import).
   ============================================================ */
const VIEW_TITLES = { buscar: 'Buscar', caixas: 'Caixas', config: 'Configurações' };

function openDrawer() { $('drawer').classList.add('open'); $('drawer-backdrop').classList.add('show'); }
function closeDrawer() { $('drawer').classList.remove('open'); $('drawer-backdrop').classList.remove('show'); }

function showView(name) {
  if (!VIEW_TITLES[name]) name = 'buscar';
  document.querySelectorAll('.view').forEach((v) => { v.hidden = (v.id !== 'view-' + name); });
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  const ht = $('header-title'); if (ht) ht.textContent = VIEW_TITLES[name];
  if (name === 'buscar') renderResults();
  if (name === 'caixas') renderBoxes();
  window.scrollTo(0, 0);
}

function setupNav() {
  $('menu-toggle').addEventListener('click', openDrawer);
  $('drawer-backdrop').addEventListener('click', closeDrawer);
  document.querySelectorAll('.nav-item').forEach((b) =>
    b.addEventListener('click', () => { showView(b.dataset.view); closeDrawer(); }));
  showView('buscar');
}

/* ---------------- Selects ---------------- */
function populateCategorySelects() {
  const cats = getCategorias();
  const opts = cats.map((c) => `<option>${escapeHtml(c)}</option>`).join('');
  const mc = $('m-categoria');
  if (mc) { const cur = mc.value; mc.innerHTML = '<option value="">Selecione…</option>' + opts; if (cats.indexOf(cur) >= 0) mc.value = cur; }
}
function populateBoxSelects() {
  const sel = $('m-box'); if (!sel) return;
  const cur = sel.value;
  const boxes = (state.boxes || []).slice().sort((a, b) => (a.code || '').localeCompare(b.code || '', 'pt', { numeric: true }));
  sel.innerHTML = '<option value="">— sem caixa —</option>' + boxes.map((b) => `<option value="${b.id}">${escapeHtml(boxTitle(b))}</option>`).join('');
  if (cur) sel.value = cur;
}
function populateGroupSelect(sel, val) {
  if (!sel) return;
  const grupos = getGrupos();
  sel.innerHTML = '<option value="">(automático)</option>' + grupos.map((g) => `<option>${escapeHtml(g)}</option>`).join('');
  sel.value = val || '';
}

/* ---------------- Editor de categorias (nome + grupo) ---------------- */
let catDraft = null;
function getCatDraft() { if (!catDraft) catDraft = getCatConfig().map((c) => Object.assign({}, c)); return catDraft; }
function setCatStatus(msg, cls) { const s = $('cat-status'); if (s) { s.textContent = msg || ''; s.className = 'sync-status' + (cls ? ' ' + cls : ''); } }
function renderCatEditor() {
  const box = $('cat-list'); if (!box) return;
  box.innerHTML = getCatDraft().map((c, i) => `
    <div class="cat-row" data-i="${i}">
      <input type="text" class="cat-nome" data-i="${i}" value="${escapeHtml(c.nome)}" placeholder="Categoria" autocapitalize="words" />
      <input type="text" class="cat-grupo" data-i="${i}" value="${escapeHtml(c.grupo || '')}" placeholder="Grupo" autocapitalize="words" />
      <button type="button" class="hist-btn danger cat-del" data-i="${i}" aria-label="Remover">✕</button>
    </div>`).join('');
}
function saveCatEditor() {
  const seen = {}, out = [];
  for (const r of getCatDraft()) {
    const nome = (r.nome || '').trim(); if (!nome) continue;
    if (seen[nome]) { setCatStatus('Categoria repetida: ' + nome, 'err'); return; }
    seen[nome] = 1;
    out.push({ nome, grupo: (r.grupo || '').trim() || nome });
  }
  if (!out.length) { setCatStatus('Defina ao menos uma categoria.', 'err'); return; }
  state.config = { categorias: out };
  touchProfile(); saveState();
  catDraft = null;
  populateCategorySelects();
  render(); renderCatEditor();
  setCatStatus('Categorias salvas.', 'ok');
}
function setupCatUI() {
  const box = $('cat-list'); if (!box) return;
  renderCatEditor();
  box.addEventListener('input', (e) => {
    const t = e.target, i = +t.dataset.i;
    if (isNaN(i) || !catDraft || !catDraft[i]) return;
    if (t.classList.contains('cat-nome')) catDraft[i].nome = t.value;
    else if (t.classList.contains('cat-grupo')) catDraft[i].grupo = t.value;
  });
  box.addEventListener('click', (e) => {
    const del = e.target.closest('.cat-del'); if (!del) return;
    getCatDraft().splice(+del.dataset.i, 1); renderCatEditor(); setCatStatus('');
  });
  $('cat-add').addEventListener('click', () => { getCatDraft().push({ nome: '', grupo: '' }); renderCatEditor(); });
  $('cat-save').addEventListener('click', saveCatEditor);
  $('cat-reset').addEventListener('click', () => {
    if (!confirm('Restaurar as categorias padrão?')) return;
    catDraft = DEFAULT_CATEGORIAS.map((c) => Object.assign({}, c)); renderCatEditor(); setCatStatus('');
  });
}

/* ---------------- Backup (export/import do estado) ---------------- */
function exportBackup() {
  const blob = new Blob([JSON.stringify(currentDoc(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'catalogo-casinha-' + todayISO() + '.json';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Backup exportado.');
}
function importBackupFile(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const doc = JSON.parse(r.result);
      if (!doc || (!Array.isArray(doc.items) && !Array.isArray(doc.boxes))) throw new Error('arquivo inválido');
      if (!confirm('Mesclar este backup com os dados atuais? (itens/caixas se somam; o mais recente vence)')) return;
      const merged = mergeDocs(currentDoc(), doc);
      touchProfile();
      applyDoc(merged);
      toast('Backup importado.');
    } catch (e) { console.error(e); toast('Backup inválido.'); }
  };
  r.readAsText(file);
}
function setupBackupUI() {
  if ($('bk-export')) $('bk-export').addEventListener('click', exportBackup);
  if ($('bk-import-btn')) $('bk-import-btn').addEventListener('click', () => $('bk-import').click());
  if ($('bk-import')) $('bk-import').addEventListener('change', (ev) => { const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; importBackupFile(f); });
}
