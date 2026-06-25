# Catálogo da Casinha

PWA para catalogar o que está guardado na casinha do quintal: **caixas** numeradas e
**itens**, com **busca por texto**, **sugestão inteligente de caixa** ao cadastrar,
**fotos**, **etiquetas com QR** (a câmera do celular abre o app já na caixa) e
**sincronização** entre aparelhos por um repositório GitHub privado.

Vanilla JS, sem build, offline-first. Veja `CLAUDE.md` para a arquitetura e `CHANGELOG.md`
para o histórico.

## Como publicar (GitHub Pages)
1. Crie um repositório no GitHub (ex.: `Catalogo-Casinha`) e faça push deste projeto.
2. Em *Settings → Pages*, publique a partir do branch `main` (raiz `/`).
3. Crie um repositório **privado** separado para os dados (ex.: `Catalogo-Casinha-dados`)
   e configure repositório + token em *Configurações → Sincronizar* (no aparelho).
