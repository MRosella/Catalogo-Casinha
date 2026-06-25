# Changelog — Catálogo da Casinha

## v1 — versão inicial
PWA de inventário da casinha do quintal (caixas + itens), no mesmo molde do app de
Despesas (vanilla JS, sem build, módulos `js/*.js` em escopo global, SW network-first
com cache versionado).

- **Caixas e itens** com CRUD completo (modais), foto comprimida **embutida** no item
  (`item.photo.data`), tamanho P/M/G, quantidade, tags e observação.
- **Busca por texto** (ignora acento/caixa; casa nome, tags, categoria, observação e
  nome/código da caixa) + **filtro por categoria** em chips.
- **Sugestão inteligente de caixa** ao cadastrar (`suggestBox`): heurística local por
  afinidade de **grupo** de categoria + **tamanho** compatível + folga; chip de 1 toque,
  com opção de criar caixa nova já no grupo/tamanho do item.
- **QR + etiquetas imprimíveis**: cada caixa gera uma etiqueta com código, nome e QR
  (`#box=<id>`); a câmera nativa do celular abre o app já na caixa (deep-link `handleHash`).
- **Sincronização entre aparelhos** por repositório GitHub privado (`catalogo.json`),
  merge last-write-wins + lápides; **backup** export/import em `.json`.
- **Estado no IndexedDB** (fotos embutidas não cabem no localStorage); `init` renderiza a
  UI antes de esperar o carregamento.
- **Categorias com grupo** editáveis; tema claro/escuro; offline-first (PWA instalável).
- Harnesses de teste `tests/integrity.html` e `tests/logic.html` (PASS headless).
