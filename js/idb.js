'use strict';
/* ---- IndexedDB: guarda o estado inteiro (com fotos embutidas) ----
   Fotos viajam dentro do JSON sincronizado, então o estado é grande demais p/
   localStorage (~5MB). Por isso persistimos em IndexedDB (cota bem maior). */
let _idb = null;
function idb() {
  if (_idb) return _idb;
  _idb = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('app'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _idb;
}
async function idbPut(key, val) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('app', 'readwrite'); tx.objectStore('app').put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
async function idbGet(key) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('app', 'readonly'); const r = tx.objectStore('app').get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbDel(key) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('app', 'readwrite'); tx.objectStore('app').delete(key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }

/* ---- Compressão de imagem (canvas) → dataURL embutido no item ----
   maxDim/quality pequenos de propósito: a foto vai no JSON sincronizado. */
function compressImage(file, maxDim, quality) {
  maxDim = maxDim || 640; quality = quality || 0.55;
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      w = Math.round(w * scale); h = Math.round(h * scale);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob((blob) => blob ? resolve({ blob, w, h }) : reject(new Error('Falha ao processar imagem')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagem inválida')); };
    img.src = url;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/* lê um File de imagem e devolve {data,w,h} pronto p/ guardar no item */
async function photoFromFile(file) {
  const { blob, w, h } = await compressImage(file);
  const data = await blobToDataUrl(blob);
  return { data, w, h };
}
