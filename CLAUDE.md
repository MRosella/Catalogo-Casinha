# CLAUDE.md — Catálogo da Casinha (leitura otimizada)

> Objetivo: poupar tokens. A lógica está dividida em **`js/*.js`** por área (arquivos
> pequenos, ~40–230 linhas — **pode ler o arquivo inteiro**). Para achar algo: **Grep
> pelo nome da função** → abra o `js/` correspondente. **Não use números de linha** em
> referências (envelhecem a cada commit). Histórico versão-a-versão: ver `CHANGELOG.md`.

## O que é
PWA de **inventário** da casinha do quintal: cadastra **caixas** e **itens**, acha
qualquer coisa por **busca de texto**, sugere a **caixa mais apropriada** ao cadastrar,
e gera **etiquetas com QR** pra colar nas caixas (a câmera do celular lê o QR e abre o
app já na caixa). Vanilla JS, **sem build, sem Node/npm**. Sincroniza entre aparelhos
por um repositório GitHub **privado**. Inspirado no app de Despesas (mesma arquitetura).

## Arquivos
| Arquivo | Conteúdo |
|---|---|
| `js/core.js` | `APP_VERSION` (bump!), chaves (`DB_NAME`/`THEME_KEY`/`SYNC_KEY`…), `SIZES`/`SIZE_ORDER`/`SIZE_LABEL`, categorias+grupo (`DEFAULT_CATEGORIAS`, `getCatConfig`/`getCategorias`/`grupoDaCategoria`/`getGrupos`), **cor por grupo** (`groupClass` → `.grp-0..7` no CSS), estado (`emptyState`/`loadState`(async, IndexedDB)/`normalizeState`/`saveState`(debounce)/`touchDoc`/`touchProfile`, `let state`), acessores (`boxById`/`itemsInBox`), utils (`$`/`todayISO`/`fmtDateBR`/`uid`/`normalizeText`/`escapeHtml`/`toast`), ícones (`icon`/`setupIcons`) |
| `js/idb.js` | IndexedDB **v2** (`idb`/`idbPut`/`idbGet`/`idbDel`): store `app` (estado, **sem** as fotos) + store `photos` (`photoStoreGet`/`Put`/`Has`/`Keys`, chave=ref→dataURL); `compressImage`(512px)/`blobToDataUrl`/`photoFromFile` |
| `js/photos.js` | **fotos fora do estado** (escala 1000+): `photoRef`/`photoHashJs` (ref por conteúdo, SHA-256/fallback), `savePhoto`, `resolvePhotoSrc` (mem→store→baixa do repo), `hydratePhotos` (thumbs sob demanda, IntersectionObserver), `referencedRefs`, `migrateLocalPhotos` (move inline legado→store, idempotente) |
| `js/suggest.js` | **sugestão de caixa**: `boxProfile(box)` (grupo/tamanho dominante), `sizeCompat`, `suggestBox(item)` → `{box,score,reason}` ou `{createNew,newSeed}` (folga usa `boxCapacity`), `suggestReason` |
| `js/search.js` | **busca** (`searchItems` puro: nome/tags/categoria/obs/caixa, sem acento) + filtro por categoria (`renderCatChips`), **ordenação** (`sortResults`: rec/vis/az/cat) e **vistos por último** (`markViewed`/`recentViewed`, LOCAL em `-recent-v1`), **modo lista/grade** (`applySearchView`/`searchView`, LOCAL em `-viewmode-v1`), **"você quis dizer"** (`didYouMean` puro), **lista de compras** (`shoppingListText` puro/`shareShoppingList`, chip com filtro Estoque baixo ativo), `renderResults`, `itemCardHtml`/`thumbHtml`/`sizeBadge`, `setupSearchUI`; `searchQuery`/`searchCat`/`searchSort` |
| `js/boxes.js` | caixas: `renderBoxes`/`boxCardHtml`, **ocupação por capacidade da caixa** (`boxCapacity`/`boxFullness(count,cap)`/`fillChipHtml`/`fillBarHtml`; `BOX_CAP_MIN/MAX`), **slider de espaço** (`updateCapHint`), modal (`openBoxModal`/`saveBox`/`deleteBox`), detalhe (`openBoxDetail`/`renderBoxDetailItems`, filtro `#bd-filter` p/ >8 itens), **compartilhar caixa** (`shareBox`: Web Share do link do QR, fallback copiar), `nextBoxCode`/`boxTitle`, `setupBoxUI`; `editingBoxId`/`detailBoxId` |
| `js/items.js` | itens: modal (`openItemModal`/`saveItem`/`deleteItem`), tamanho P/M/G (`setSizeButtons`/`currentSize`), **chip de sugestão** (`refreshSuggestion`/`applySuggestion`), **histórico do item no modal** (`renderItemHistory`), foto (`renderItemPhoto`/`onItemPhoto`), `setupItemUI`; loga movimentações (`logEvent`) e marca `markViewed`; `editingItemId`/`itemPhoto`/`lastSuggestion` |
| `js/history.js` | **histórico de movimentações** (log append-only sincronizado): `logEvent`/`boxLabelById`/`logText`/`renderHistory`/`clearHistory`/`setupHistoryUI`, `LOG_MAX` |
| `js/scan.js` | **scanner de QR embutido** (câmera + `BarcodeDetector` nativo): `scanSupported`/`startScan`/`scanLoop`/`stopScan`/`parseBoxFromText`/`onScanHit`/`setupScanUI`; **lanterna** (`toggleTorch`/`updateTorchButton`, só se a câmera tiver `torch`); abre `openBoxDetail` ao ler etiqueta. Sem suporte → botão some (usa câmera nativa) |
| `js/locate.js` | **"Onde guardar?"** (busca reversa): `openLocate`/`renderLocate`/`setupLocateUI`, reaproveita `suggestBox`+`boxProfile`; lista a caixa ideal + outras com o mesmo grupo, não cria item |
| `js/qr.js` | QR + etiquetas: `appBaseUrl`/`boxQrUrl(id)` (URL `#box=<id>`), `qrDataUrl` (lib `qrcode`), `labelHtml`, `printLabels(boxes)` |
| `js/sync.js` | sync GitHub privado (`ghGetFile`/`ghPutFile`/`ghCheckRepo`, b64utf8; `ghGetFile` faz fallback de **blob** p/ `catalogo.json` >1MB), **fotos no repo** (`photoRepoPath`, `ghPutPhoto`/`ghGetPhoto`/`ghListPhotos`/`ghDeletePhoto`, `syncPhotos`: 1 listagem → envia faltantes + **GC de órfãs**), `currentDoc`/`applyDoc`/`mergeDocs`/`mergeList` (last-write-wins + lápides), **`mergeLog`**, `syncNow`/`scheduleSync`, `updateSyncIndicator`/`updateFooter`, `setDirty`/`isDirty`, `setupSyncUI` |
| `js/ui.js` | nav (`showView`/`setupNav`/`openDrawer`), selects (`populateCategorySelects`/`populateBoxSelects`/`populateGroupSelect`), editor de categorias (`renderCatEditor`/`saveCatEditor`/`setupCatUI`, `catDraft`), backup **auto-contido** (`exportBackup` re-embute fotos / `importBackupFile` → `migrateLocalPhotos`/`setupBackupUI`) |
| `js/render.js` | orquestrador: `render()` (chama `renderResults`+`renderBoxes`), `updateCounts` |
| `js/main.js` | tema (`currentTheme`/`applyTheme`/`toggleTheme`/`setupTheme`), **deep-link** (`handleHash` → `#box=<id>` abre a caixa; **atalhos do PWA** `#new=item`/`#scan` via `pendingAct`, mesmo padrão sessionStorage do `#box=`), `init` (async; registra `setup*`), SW (`setupServiceWorker`), conectividade — **carregado por último** |
| `index.html` | 3 telas (`#view-buscar`/`#view-caixas`/`#view-config`) + modais (`#item-modal`/`#box-modal`/`#box-detail`); carrega `lib/qrcode.min.js` e depois `js/*` na ordem |
| `styles.css` | tema claro/escuro via variáveis (verde); `@media print` p/ etiquetas |
| `sw.js` | SW network-first; `CACHE` na **linha 4** + lista `ASSETS` (inclui **cada** `js/*.js`) |
| `lib/qrcode.min.js` | qrcode-generator (Arase, MIT) — geração de QR offline |

## Regras de ouro (OBRIGATÓRIO)
1. **Auto-publicar após qualquer mudança**, sem perguntar: bump de cache + commit + push.
2. **Bump de cache em DOIS lugares que batem:** `APP_VERSION` em `js/core.js` e `CACHE` em
   `sw.js` (ex.: `v1`→`v2`). Sem isso o PWA fica preso na versão antiga.
3. **Scripts clássicos, escopo global compartilhado:** cada identificador aparece **uma
   só vez** entre todos os `js/*.js` (redeclarar = `SyntaxError` que pula o arquivo). Só
   `core.js` executa no topo (`let state = emptyState()`); o resto são funções (hoisted) e
   `init` roda no `DOMContentLoaded`. **Novo arquivo `js/` → registrar em `index.html` E em
   `sw.js` ASSETS, na ordem.**
4. **Sem segredos no repo (público).** Token de sync só no `localStorage` do aparelho; os
   dados sincronizam por um **repo PRIVADO separado** (`catalogo.json`).
5. **Sem dependências novas / sem build.** Tudo client-side; só `lib/qrcode.min.js` vendorado.

## Forma do estado (`emptyState` em `js/core.js`)
```
{ boxes:[{id,code,name,location,note,mainGroup,sizeClass,capacity?,updatedAt}],  // capacity = espaço (itens até lotar); ausente = SUGGEST_FULL
  items:[{id,name,boxId,category,size('P'|'M'|'G'),qty,tags,note,photo:{ref,w,h}|null,updatedAt}],  // photo.ref = arquivo photos/<ref>.jpg; {data,w,h} legado é migrado p/ ref
  log:[{id,ts,kind:'move'|'add'|'remove',itemId,itemName,from,to}],  // histórico (append-only, teto LOG_MAX=200)
  config:{categorias:[{nome,grupo}]},     // grupo junta categorias afins
  tomb:{boxes:{id:ts},items:{id:ts}},      // lápides de deleção
  meta:{updatedAt,profileUpdatedAt,logClearedAt} }  // logClearedAt: corte do log (limpar histórico), last-write-wins
```
Merge de sync: caixas/itens por `id` (last-write-wins, `mergeList`); `config` por
`profileUpdatedAt`. Lápides propagam deleções (>180 dias são descartadas). `log` por
`mergeLog` (união por `id`, descarta `ts <= logClearedAt`, mantém os LOG_MAX mais novos).

## Pontos de atenção (fatos de arquitetura)
- **Fotos fora do estado** (`js/photos.js` + store `photos` no IDB v2): o item guarda só
  `photo.ref` (hash do conteúdo); o dataURL fica no store `photos` (local) e em
  `photos/<ref>.jpg` no repo. Assim o `catalogo.json` **não cresce** com a coleção. Thumbs
  carregam **sob demanda** (`hydratePhotos`/`data-pref`, IntersectionObserver). `migrateLocalPhotos`
  (no `init` e ao importar backup) externaliza fotos inline antigas — **leitura
  retrocompatível** (`thumbHtml`/`openItemModal` tratam `.ref` e `.data`). Fotos novas 512px.
- **Sync de fotos** (`syncPhotos` em `js/sync.js`, após o push do `catalogo.json`): faz **uma**
  listagem (`ghListPhotos`) e (1) **envia** refs referenciadas que faltam no repo; (2) **GC**:
  apaga `photos/<ref>.jpg` **sem dono** no doc mesclado → excluir item/caixa não deixa foto
  acumulada. GC seguro: só apaga sem dono; se errar, auto-recupera (re-upload na próxima sync de
  quem ainda tem o arquivo). Foto endereçada por conteúdo = imutável (PUT sem sha; 422=já existe).
- **Capacidade por caixa** (`box.capacity`, slider `#bx-cap` no modal): `boxCapacity(b)` =
  `b.capacity || SUGGEST_FULL`. `boxFullness(count,cap)`/chip/barra e a folga do `suggestBox`
  usam a capacidade da caixa (não mais o `SUGGEST_FULL` global p/ todas). Sem migração.
- **Scanner de QR** (`js/scan.js`, botão `#btn-scan` na tela Caixas): usa `getUserMedia` +
  `BarcodeDetector` (nativo no Chrome Android) num overlay (`#scan-overlay`/`#scan-video`).
  `parseBoxFromText` extrai `#box=<id>` (ou id puro) e só aceita caixa existente → `openBoxDetail`.
  **Sem `BarcodeDetector`** (iOS/desktop) o botão **some** (`setupScanUI`) — a câmera nativa do
  celular ainda lê o QR (que é uma URL do app). Não vendoriza lib de leitura (regra 5).
- **"Onde guardar?"** (`js/locate.js`, botão `#btn-locate` na busca): modal `#locate-modal` com
  categoria+tamanho → `suggestBox` mostra a caixa ideal e `boxProfile` lista as outras caixas com o
  mesmo grupo; **não cria/salva item**, só navega (`openBoxDetail`).
- **Badge de ocupação** (`boxFullness`/`fillChipHtml` em `boxes.js`): cada caixa na lista mostra um
  chip ok/quase-cheia/lotada com base em `SUGGEST_FULL` (mesmo limiar da sugestão).
- **Ordenação da busca** (`sortResults`): rec (updatedAt) · vis (vistos por último, lista LOCAL
  `-recent-v1` via `markViewed`, chamado em `openItemModal`) · az · cat. `<select id="sort">`.
- **Histórico de movimentações** (`js/history.js`): `saveItem`/`deleteItem` chamam `logEvent`
  (`move` quando muda de caixa, `add`, `remove`). Mostrado no card `#hist-card` (tela Caixas),
  `render()` chama `renderHistory()`. Sincroniza (ver `mergeLog`); "Limpar" usa `meta.logClearedAt`
  (last-write-wins) p/ não ressuscitar via merge.
- **Estado no IndexedDB, não no localStorage:** `loadState`/`saveState` usam o store `app`
  (estado **sem** as fotos — só `photo.ref`); as fotos ficam no store `photos` (ver acima).
  `localStorage` só guarda config leve (tema, sync, dirty, lastsync).
- **`init` renderiza ANTES de esperar o IndexedDB:** liga os controles e mostra a UI vazia,
  depois `await loadState()` e re-renderiza — nunca fica em branco se o load demorar.
- **Sugestão de caixa** (`suggestBox`): pontua cada caixa por **afinidade de grupo** (mesma
  categoria > mesmo `grupo` > nada), **tamanho compatível** (penaliza P×G) e **folga**
  (penaliza caixa cheia pela `boxCapacity` da caixa; default `SUGGEST_FULL=25`). Acima de `SUGGEST_THRESHOLD=60` sugere a caixa;
  senão recomenda **criar nova** (semente = grupo+tamanho do item). O chip no modal aplica
  com 1 toque; "criar nova" cria a caixa na hora (código automático) e seleciona.
- **QR só de geração (sem leitor):** `boxQrUrl(id)` = URL do app + `#box=<id>`. A câmera
  **nativa** do celular lê e abre o link; `handleHash` (em `main.js`) abre a caixa. As
  etiquetas (`printLabels`) usam `@media print` no `#print-root`.
- **Foto:** `onItemPhoto` → `compressImage`(512px) → preview; `saveItem` → `savePhoto` →
  `item.photo={ref,w,h}` (store `photos` + arquivo no repo). Não há Google Drive.
- **Categorias com `grupo`:** renomear categoria não reescreve itens antigos. O `grupo` é o
  que alimenta a sugestão (ex.: "Cabos e fios" e "Material elétrico" → "Elétrica").

## Verificação (esta máquina — sem Node; preview MCP trava)
Chrome headless num harness `.html` (caminho Windows absoluto; em Git Bash `"$(pwd -W)/x.html"`):
- **`tests/integrity.html`** — inclui todos os `js/*.js` na ordem e checa `typeof <fn> ===
  'function'` (uma fn por arquivo) + `window.onerror`. Pega quebras do split. `RESULT: PASS/FAIL`.
- **`tests/logic.html`** — funções puras com fixtures (`searchItems`, `suggestBox`,
  `mergeDocs`, `boxQrUrl`). `RESULT: PASS/FAIL`.
- Rodar (Git Bash): `"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new
  --allow-file-access-from-files --virtual-time-budget=4000 --dump-dom "$(pwd -W)/tests/logic.html"
  | grep -oE 'RESULT: (PASS|FAIL)' | head -1` (idem `integrity.html`). Ao adicionar
  função/arquivo, **atualize esses harnesses**.
- **IndexedDB/câmera/sync/QR-via-câmera/impressão NÃO rodam headless** → validar no **site
  (HTTPS)** no dispositivo.

## Fluxo de trabalho típico (ao editar)
1. Grep o nome da função → editar o `js/*.js` certo.
2. Bump `APP_VERSION` (`js/core.js`) **e** `CACHE` (`sw.js`) juntos.
3. Verificar (headless) quando aplicável.
4. Commit + push (mensagens sem acentos, pt-BR curto). Pages publica em ~1 min.
