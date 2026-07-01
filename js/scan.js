'use strict';
/* ============================================================
   Scanner de QR embutido. Usa a câmera (getUserMedia) + o
   BarcodeDetector NATIVO (Chrome Android) para ler a etiqueta da
   caixa e abrir o detalhe direto — fecha o ciclo etiquetei →
   escaneei → achei, sem sair do app e sem dependência nova.
   Se o navegador não tiver BarcodeDetector, o botão some (a câmera
   nativa do celular continua lendo o QR, que é uma URL do app).
   ============================================================ */
let scanStream = null, scanRAF = null, scanDetector = null, scanning = false, scanTorchOn = false;

function scanSupported() {
  return ('BarcodeDetector' in window) && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

async function startScan() {
  if (scanning) return;
  if (!scanSupported()) { toast('Seu navegador não lê QR aqui — use a câmera do celular na etiqueta.'); return; }
  const ov = $('scan-overlay'); ov.classList.add('open');
  $('scan-msg').textContent = 'Aponte para o QR da caixa…';
  try {
    scanDetector = new BarcodeDetector({ formats: ['qr_code'] });
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    const v = $('scan-video'); v.srcObject = scanStream; await v.play();
    scanning = true;
    updateTorchButton();
    scanLoop();
  } catch (e) {
    console.warn('scan falhou', e);
    stopScan();
    toast('Não foi possível abrir a câmera.');
  }
}

async function scanLoop() {
  if (!scanning) return;
  const v = $('scan-video');
  try {
    const codes = await scanDetector.detect(v);
    for (const c of (codes || [])) {
      const id = parseBoxFromText(c.rawValue);
      if (id) { onScanHit(id); return; }
    }
    if (codes && codes.length) $('scan-msg').textContent = 'QR lido, mas não é de uma caixa daqui.';
  } catch (e) { /* detect pode falhar entre frames; segue tentando */ }
  scanRAF = requestAnimationFrame(scanLoop);
}

/* extrai o id da caixa de um texto de QR (URL com #box=<id> ou só o id);
   só retorna se a caixa existir neste catálogo. */
function parseBoxFromText(text) {
  if (!text) return null;
  const m = /#box=([^&\s]+)/.exec(text);
  let id = m ? decodeURIComponent(m[1]) : null;
  if (!id && /^[a-z0-9]+$/i.test(String(text).trim())) id = String(text).trim();
  return (id && boxById(id)) ? id : null;
}

function onScanHit(id) {
  try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {}
  stopScan();
  showView('caixas');
  openBoxDetail(id);
}

function stopScan() {
  scanning = false;
  scanTorchOn = false;
  if (scanRAF) { cancelAnimationFrame(scanRAF); scanRAF = null; }
  if (scanStream) { scanStream.getTracks().forEach((t) => t.stop()); scanStream = null; }
  const v = $('scan-video'); if (v) v.srcObject = null;
  const ov = $('scan-overlay'); if (ov) ov.classList.remove('open');
  updateTorchButton();
}

/* ---- Lanterna (torch): só aparece quando a câmera declara suporte ---- */
function updateTorchButton() {
  const b = $('scan-torch'); if (!b) return;
  const track = scanStream && scanStream.getVideoTracks()[0];
  let has = false;
  try { has = !!(track && track.getCapabilities && track.getCapabilities().torch); } catch (e) {}
  b.style.display = has ? '' : 'none';
  b.classList.toggle('on', scanTorchOn);
  b.innerHTML = icon('zap', 22);
}
async function toggleTorch() {
  const track = scanStream && scanStream.getVideoTracks()[0]; if (!track) return;
  try {
    scanTorchOn = !scanTorchOn;
    await track.applyConstraints({ advanced: [{ torch: scanTorchOn }] });
  } catch (e) { scanTorchOn = false; toast('A lanterna não funcionou nesta câmera.'); }
  updateTorchButton();
}

function setupScanUI() {
  const btn = $('btn-scan');
  if (btn) {
    if (!scanSupported()) btn.style.display = 'none';   // sem leitor embutido: esconde (usa câmera nativa)
    else btn.addEventListener('click', startScan);
  }
  const close = $('scan-close'); if (close) close.addEventListener('click', stopScan);
  const torch = $('scan-torch'); if (torch) torch.addEventListener('click', toggleTorch);
}
