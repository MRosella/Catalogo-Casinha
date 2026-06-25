'use strict';
/* ============================================================
   QR das caixas + impressão de etiquetas.
   O QR codifica a URL do app com #box=<id>: a câmera nativa do
   celular lê e abre o app já na caixa (sem leitor embutido).
   Geração via lib/qrcode.min.js (qrcode-generator, offline).
   ============================================================ */

/* diretório do app (sem index.html / sem hash / sem query) */
function appBaseUrl() { return location.origin + location.pathname.replace(/[^/]*$/, ''); }
function boxQrUrl(id) { return appBaseUrl() + '#box=' + encodeURIComponent(id); }

/* GIF data URL do QR (cellSize px por módulo, margem em módulos). */
function qrDataUrl(text, cell, margin) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createDataURL(cell || 5, margin == null ? 1 : margin);
}

function labelHtml(b) {
  const grp = b.mainGroup || boxProfile(b).domGroup || '';
  return `<div class="label">
    <img class="label-qr" src="${qrDataUrl(boxQrUrl(b.id), 5, 1)}" alt="QR ${escapeHtml(boxTitle(b))}" />
    <div class="label-txt">
      <div class="label-code">${escapeHtml(b.code || '')}</div>
      <div class="label-name">${escapeHtml(b.name || '')}</div>
      ${grp ? `<div class="label-meta">${escapeHtml(grp)}</div>` : ''}
    </div>
  </div>`;
}

/* Monta a folha de etiquetas no #print-root e dispara a impressão. */
function printLabels(boxes) {
  const list = (boxes || []).filter(Boolean);
  if (!list.length) { toast('Nenhuma caixa para imprimir.'); return; }
  if (typeof qrcode === 'undefined') { toast('Biblioteca de QR não carregou.'); return; }
  const root = $('print-root');
  root.innerHTML = `<div class="labels-sheet">${list.map(labelHtml).join('')}</div>`;
  window.print();
}
