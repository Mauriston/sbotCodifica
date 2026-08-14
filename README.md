# SBOT Codifica

App web (mobile-first) para consultar os dados extraídos do **Manual de Codificação da SBOT**: procedimentos por especialidade, códigos TUSS/CBHPM aplicáveis (com porte e valor), CID-10 cabíveis, exames necessários para a autorização cirúrgica e a lista de **OPME sugeridos** por procedimento (com técnica/variante, quantidade e observações do Manual). Permite montar uma solicitação com códigos e itens de OPME, aplicar a regra de via de acesso (100% no principal, 70%/50% nos demais) e exportar o texto pronto (copiar, PDF ou compartilhar).

**App publicado:** habilite o GitHub Pages deste repositório (veja [Deploy](#deploy)) para gerar a URL de acesso.

## Como funciona

- **100% estático, sem build.** `index.html` carrega `assets/js/app.js` como módulo ES; não há bundler, framework ou passo de compilação — o que está no repositório é exatamente o que é publicado.
- **Banco de dados = `sbot_cbhpm_tuss_v1.json`.** O app busca esse arquivo em tempo de execução (`fetch('./sbot_cbhpm_tuss_v1.json')`). Para atualizar o Manual, basta substituir esse arquivo por uma nova exportação com a mesma estrutura (`meta`, `catalogos.cbhpm`, `catalogos.cid`, `catalogos.porte_cirurgico`, `procedimentos[]`, cada procedimento com `opme_sugeridos[]` opcional) e publicar — nenhum código muda.
- **Descrição abreviada do CID-10 = catálogo externo.** Na solicitação, cada CID é mostrado na forma abreviada (ex.: "S42.3 Frat da diafise do umero"), buscada em tempo real em [`github.com/Mauriston/cid10`](https://github.com/Mauriston/cid10) e cacheada na sessão (`assets/js/cid10.js`); a lista de OPME não depende de nada externo — nome, técnica/variante, quantidade e observação de cada item vêm inteiramente do `opme_sugeridos[]` de cada procedimento, dentro do próprio `sbot_cbhpm_tuss_v1.json`.
- **Estado do usuário** (solicitação em montagem, favoritos, histórico, ano da tabela) fica em `localStorage`, só no aparelho.
- **Funciona offline** depois da primeira visita: um Service Worker (`sw.js`) guarda em cache o app e a última versão do JSON.

## Estrutura

```
index.html                  casca do app (app bar, tab bar, containers das telas)
assets/css/app.css          folha de estilo única (tokens de cor/tipografia do Design System SBOT)
assets/js/
  app.js                    estado, roteamento (hash) e renderização das telas
  data.js                   carrega e adapta o JSON (inclui OPME por procedimento), índice e busca
  format.js                 formatação (moeda, texto), cores por caráter, siglas
  solicitacao.js             regra de via de acesso, totais, linhas de OPME e texto de exportação
  cid10.js                  busca e cacheia a descrição abreviada do CID-10 (catálogo externo)
  print.js                  geração do documento para impressão/PDF
  store.js                  persistência em localStorage
assets/icons/                ícones do app (gerados por tools/gen-icons.mjs)
manifest.webmanifest         manifesto PWA
sw.js                        service worker (cache do app shell + do JSON)
sbot_cbhpm_tuss_v1.json      banco de dados (Manual de Codificação da SBOT)
.github/workflows/deploy.yml publica o site no GitHub Pages a cada push em main
tools/gen-icons.mjs           script de apoio (Node + Playwright) para gerar os PNGs dos ícones — não faz parte do site publicado
```

## Deploy

O workflow `.github/workflows/deploy.yml` publica automaticamente no GitHub Pages a cada push em `main`, usando `actions/upload-pages-artifact` + `actions/deploy-pages` (sem gh-pages branch).

Passo único, manual, para ativar (se ainda não estiver ativo):

1. Neste repositório: **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.
2. Faça merge deste branch em `main` (ou rode o workflow manualmente em **Actions → Deploy GitHub Pages → Run workflow**).
3. Após o job `deploy` concluir, a URL pública aparece em **Settings → Pages** e na página do próprio workflow (`environment: github-pages`).

Qualquer push subsequente em `main` — inclusive apenas atualizar `sbot_cbhpm_tuss_v1.json` com uma nova versão do Manual — redeploya o site automaticamente.

## Rodando localmente

Não precisa de instalação: é HTML/CSS/JS puro. Basta servir a pasta por HTTP (módulos ES não carregam via `file://`):

```
npx http-server . -p 8080
# ou
python3 -m http.server 8080
```

Abra `http://localhost:8080`.

## Atualizando os ícones

Os PNGs em `assets/icons/` são gerados a partir de `assets/icons/favicon.svg` pelo script `tools/gen-icons.mjs` (usa Playwright/Chromium só nesse passo de build local, não em produção):

```
npm install playwright
node tools/gen-icons.mjs
```
