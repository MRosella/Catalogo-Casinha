'use strict';
/* ============================================================
   "Onde guardar?" — busca reversa da sugestão. Dado o tipo de item
   que você tem na mão (categoria + tamanho), mostra a caixa SUGERIDA
   (suggestBox) e as outras caixas que JÁ têm itens do mesmo grupo,
   com 1 toque pra abrir a caixa. Reaproveita suggestBox + boxProfile;
   não cria nem salva item nenhum.
   ============================================================ */
let locSize = '';

function openLocate() {
  populateLocCats();
  $('loc-cat').value = '';
  setLocSize('');
  renderLocate();
  $('locate-modal').classList.add('open');
}
function closeLocate() { $('locate-modal').classList.remove('open'); }

function populateLocCats() {
  const sel = $('loc-cat'); if (!sel) return;
  sel.innerHTML = '<option value="">Selecione a categoria…</option>' + getCategorias().map((c) => `<option>${escapeHtml(c)}</option>`).join('');
}
function setLocSize(v) {
  locSize = v || '';
  document.querySelectorAll('#loc-size-group .size-btn').forEach((b) => b.classList.toggle('active', b.dataset.size === locSize));
}

function renderLocate() {
  const out = $('loc-result'); if (!out) return;
  const cat = $('loc-cat').value;
  if (!cat) { out.innerHTML = `<p class="hint">Escolha a categoria (e o tamanho) do item para ver onde guardar.</p>`; return; }
  const grupo = grupoDaCategoria(cat);
  const s = suggestBox({ category: cat, size: locSize });
  let html = '';
  if (s.createNew) {
    html += `<div class="loc-sug loc-new"><div class="loc-sug-h">${icon('plus', 16)} Criar caixa nova de ${escapeHtml(grupo)}</div><div class="loc-sug-r">${escapeHtml(s.reason)}</div></div>`;
  } else {
    html += `<button type="button" class="loc-sug" data-open="${s.box.id}"><div class="loc-sug-h">${icon('box', 16)} ${escapeHtml(boxTitle(s.box))}</div><div class="loc-sug-r">${escapeHtml(s.reason)}</div></button>`;
  }
  // outras caixas que já têm esse grupo
  const others = (state.boxes || [])
    .map((b) => ({ b: b, n: boxProfile(b).groupCount[grupo] || 0 }))
    .filter((x) => x.n > 0 && (s.createNew || x.b.id !== s.box.id))
    .sort((a, b) => b.n - a.n);
  if (others.length) {
    html += `<div class="loc-others-h">Outras caixas com ${escapeHtml(grupo.toLowerCase())}</div><ul class="entries">`;
    html += others.map((x) => `<li class="entry" data-open="${x.b.id}">
      <span class="it-thumb it-thumb-ph" aria-hidden="true">${icon('box', 20)}</span>
      <div class="e-main"><div class="e-desc">${escapeHtml(boxTitle(x.b))}</div><div class="e-meta">${x.n} de ${escapeHtml(grupo.toLowerCase())}</div></div>
    </li>`).join('') + `</ul>`;
  }
  out.innerHTML = html;
}

function setupLocateUI() {
  const open = $('btn-locate'); if (open) open.addEventListener('click', openLocate);
  const m = $('locate-modal'); if (!m) return;
  $('loc-close').addEventListener('click', closeLocate);
  $('loc-cat').addEventListener('change', renderLocate);
  document.querySelectorAll('#loc-size-group .size-btn').forEach((b) =>
    b.addEventListener('click', () => { setLocSize(locSize === b.dataset.size ? '' : b.dataset.size); renderLocate(); }));
  $('loc-result').addEventListener('click', (e) => {
    const el = e.target.closest('[data-open]'); if (!el) return;
    closeLocate(); showView('caixas'); openBoxDetail(el.dataset.open);
  });
  m.addEventListener('click', (e) => { if (e.target === m) closeLocate(); });
}
