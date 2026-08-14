/* SBOT Codifica — aplicação.

   Tela única com roteamento por hash, estado em memória + localStorage e
   renderização direta em HTML. Sem dependências e sem etapa de build:
   o que está no repositório é exatamente o que o GitHub Pages publica. */

import { brl, esc, carCores, carCurto, sigla, nomeCurto, MANUAL_PDF } from './format.js';
import { carregarDados, buscar } from './data.js';
import { persistido, salvar } from './store.js';
import { linhas, linhasOpme, totais, texto } from './solicitacao.js';
import { imprimir } from './print.js';
import { carregarCid10Abreviado } from './cid10.js';

/* ---------------------------------------------------------------- estado -- */

const st = {
  data: null,
  erro: '',
  screen: 'home',
  query: '',
  esp: null,
  procId: null,
  cidSel: null,
  cidExp: false,
  opmeExp: false,
  exportOpen: false,
  ...persistido
};

const el = {
  screen: document.getElementById('screen'),
  scroll: document.getElementById('scroll'),
  searchwrap: document.getElementById('searchwrap'),
  input: document.getElementById('search-input'),
  clear: document.getElementById('search-clear'),
  subtitle: document.getElementById('bar-subtitle'),
  favCount: document.getElementById('fav-count'),
  procbar: document.getElementById('procbar'),
  tabBadge: document.getElementById('tab-badge'),
  sheet: document.getElementById('sheet'),
  toast: document.getElementById('toast'),
  tabbar: document.getElementById('tabbar'),
  tabs: {
    home: document.getElementById('tab-home'),
    cesta: document.getElementById('tab-cesta'),
    salvos: document.getElementById('tab-salvos')
  }
};

const scrollPorRota = new Map();
let rotaAtual = '';
let navegouNoApp = false;
let toastTimer = null;

const proc = (id) => (st.data ? st.data.proc(id) : null);
const rowsAtuais = () => (st.data ? linhas(st.data, st) : []);
const rowsOpmeAtuais = () => (st.data ? linhasOpme(st.data, st) : []);

function persistir() {
  salvar(st);
}

/* Descrições abreviadas do CID-10 (github.com/Mauriston/cid10), usadas na
   solicitação. Buscadas uma vez e cacheadas; falha em silêncio — a
   solicitação cai de volta na descrição completa do Manual. */
let cid10Cache = null;

async function garantirCid10() {
  if (!cid10Cache) {
    try {
      cid10Cache = await carregarCid10Abreviado();
    } catch {
      /* mantém null — texto()/montarDocumento() usam a descrição do Manual como reserva */
    }
  }
  return cid10Cache;
}

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.hidden = true;
  }, 1900);
}

/* -------------------------------------------------------------- roteamento -- */

function rotaDoEstado() {
  if (st.screen === 'esp') return '#/esp/' + encodeURIComponent(st.esp || '');
  if (st.screen === 'proc') return '#/proc/' + encodeURIComponent(st.procId || '');
  if (st.screen === 'cesta') return '#/solicitacao';
  if (st.screen === 'salvos') return '#/salvos';
  return '#/';
}

function navegar(rota) {
  navegouNoApp = true;
  if (location.hash === rota) aplicarRota();
  else location.hash = rota;
}

function voltar() {
  if (navegouNoApp && history.length > 1) {
    history.back();
    return;
  }
  // entrada direta por link: volta para o contexto mais próximo
  if (st.screen === 'proc' && st.esp) navegar('#/esp/' + encodeURIComponent(st.esp));
  else navegar('#/');
}

function aplicarRota() {
  const hash = location.hash || '#/';
  const [, secao, param] = hash.split('/');

  const anterior = rotaAtual;
  if (anterior) scrollPorRota.set(anterior, el.scroll.scrollTop);

  if (secao === 'esp' && param) {
    st.screen = 'esp';
    st.esp = decodeURIComponent(param);
  } else if (secao === 'proc' && param) {
    const id = decodeURIComponent(param);
    st.screen = 'proc';
    st.procId = id;
    st.cidSel = null;
    st.cidExp = false;
    st.opmeExp = false;
    registrarHistorico(id);
  } else if (secao === 'solicitacao') {
    st.screen = 'cesta';
  } else if (secao === 'salvos') {
    st.screen = 'salvos';
  } else {
    st.screen = 'home';
  }

  rotaAtual = hash;
  st.exportOpen = false;
  render();

  // home e listas de especialidade voltam onde o usuário parou
  const restaura = st.screen === 'home' || st.screen === 'esp';
  el.scroll.scrollTop = restaura ? scrollPorRota.get(hash) || 0 : 0;

  // toda navegação reexibe a tab bar flutuante, sem herdar direção da tela anterior
  el.tabbar.classList.remove('tabbar--hidden');
  ultimoScrollTop = el.scroll.scrollTop;
}

function registrarHistorico(id) {
  if (!st.data || !proc(id)) return;
  st.hist = [id].concat(st.hist.filter((h) => h !== id)).slice(0, 8);
  persistir();
}

function removerRecente(id) {
  st.hist = st.hist.filter((h) => h !== id);
  persistir();
  if (st.screen === 'home') atualizar();
}

/* --------------------------------------------- deslizar recente pra apagar -- */

// arrasto detectado por último: suprime o clique fantasma que o navegador
// dispara logo após o pointerup de um arrasto, pra não abrir o procedimento
let swipeAcabouDeArrastar = false;
let swipeFlagTimer = null;

function iniciarSwipeRecente(wrap, evInicio) {
  const cartao = wrap.querySelector('.recente');
  if (!cartao) return;

  const largura = wrap.getBoundingClientRect().width;
  const limiar = Math.min(64, largura * 0.35);
  const startX = evInicio.clientX;
  const startY = evInicio.clientY;
  let dx = 0;
  let horizontal = null; // null = ainda indefinido, true/false após o 1º movimento decisivo

  function mover(ev) {
    const deltaX = ev.clientX - startX;
    const deltaY = ev.clientY - startY;
    if (horizontal === null) {
      if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return;
      horizontal = Math.abs(deltaX) > Math.abs(deltaY);
      if (horizontal) cartao.classList.add('recente--arrastando');
    }
    if (!horizontal) return;
    ev.preventDefault();
    dx = Math.max(-largura, Math.min(0, deltaX));
    cartao.style.transform = `translateX(${dx}px)`;
  }

  function soltar() {
    window.removeEventListener('pointermove', mover);
    window.removeEventListener('pointerup', soltar);
    window.removeEventListener('pointercancel', soltar);
    if (!horizontal) return;

    cartao.classList.remove('recente--arrastando');
    swipeAcabouDeArrastar = true;
    clearTimeout(swipeFlagTimer);
    swipeFlagTimer = setTimeout(() => {
      swipeAcabouDeArrastar = false;
    }, 400);

    if (dx <= -limiar) {
      cartao.style.transform = `translateX(-${largura}px)`;
      cartao.style.opacity = '0';
      const id = wrap.dataset.id;
      setTimeout(() => removerRecente(id), 180);
    } else {
      cartao.style.transform = '';
    }
  }

  window.addEventListener('pointermove', mover);
  window.addEventListener('pointerup', soltar);
  window.addEventListener('pointercancel', soltar);
}

document.addEventListener('pointerdown', (ev) => {
  if (ev.button !== undefined && ev.button !== 0) return;
  const wrap = ev.target.closest('.recente-wrap');
  if (wrap) iniciarSwipeRecente(wrap, ev);
});

/* ------------------------------------------------------------- solicitação -- */

function alternarCodigo(procId, codigo, porte) {
  const key = procId + '|' + codigo;
  const existe = st.cesta.some((c) => c.key === key);
  st.cesta = existe
    ? st.cesta.filter((c) => c.key !== key)
    : st.cesta.concat([{ key, procId, codigo, porte, via: 'mesma' }]);
  persistir();
}

function alternarVia(key) {
  st.cesta = st.cesta.map((c) =>
    c.key === key ? { ...c, via: c.via === 'outra' ? 'mesma' : 'outra' } : c
  );
  persistir();
}

function alternarOpme(procId, idx) {
  const key = procId + '|opme|' + idx;
  const existe = st.opme.some((o) => o.key === key);
  st.opme = existe ? st.opme.filter((o) => o.key !== key) : st.opme.concat([{ key, procId, idx }]);
  persistir();
}

/* ---------------------------------------------------------------- partes -- */

function chipCar(car, curto) {
  const [cor, bg] = carCores(car);
  return `<span class="chip" style="color:${cor};background:${bg}">${esc(curto ? carCurto(car) : car)}</span>`;
}

function iconeChevron() {
  return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8A9199" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>`;
}

function iconeVoltar() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1E8C7C" stroke-width="2.2" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg>`;
}

function iconeCheck(tam = 11) {
  return `<svg width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.5" aria-hidden="true"><path d="M5 13l4 4 10-10"></path></svg>`;
}

const OPME_LIMITE = 24;

/** Agrupa itens de OPME consecutivos do mesmo grupo/variante (ex.: "Opção 1"), preservando a ordem do Manual. */
function blocosOpme(itens) {
  const blocos = [];
  for (const it of itens) {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.grupo === it.grupo) ultimo.itens.push(it);
    else blocos.push({ grupo: it.grupo, itens: [it] });
  }
  return blocos;
}

/* ----------------------------------------------------------------- telas -- */

function telaCarregando() {
  return `<div class="empty" style="padding-top:80px">Carregando o Manual de Codificação…</div>`;
}

function telaErro() {
  return `
    <div class="empty" style="padding-top:70px">
      <p>Não foi possível carregar o banco de dados do Manual.</p>
      <p class="muted" style="font-size:12px">${esc(st.erro)}</p>
      <button class="btn-primary" type="button" data-act="recarregar" style="margin-top:14px;display:inline-block">Tentar de novo</button>
    </div>`;
}

function telaHome() {
  const q = st.query.trim();
  if (q.length > 0) return blocoResultados(q);
  return blocoNavegacao();
}

function blocoResultados(q) {
  const achados = buscar(st.data, q);

  if (!achados.length) {
    return `<div class="results">${
      q.length >= 2
        ? '<div class="empty">Nada encontrado. Tente outro termo, um código TUSS ou um CID.</div>'
        : '<div class="results__label">Digite ao menos 2 caracteres.</div>'
    }</div>`;
  }

  const cards = achados
    .map(({ proc: p, hit }) => {
      const meta = p.tuss.length + ' códigos · ' + p.cids.length + ' CIDs';
      return `
      <button class="card card--tap result" type="button" data-act="open-proc" data-id="${esc(p.id)}">
        <div class="result__chips">
          <span class="chip chip--esp">${esc(p.esp)}</span>
          ${chipCar(p.car, true)}
        </div>
        <div class="result__nome">${esc(nomeCurto(p.nome))}</div>
        <div class="result__meta">${esc(meta)}</div>
        ${hit ? `<div class="result__hit">${esc(hit)}</div>` : ''}
      </button>`;
    })
    .join('');

  return `
    <div class="results">
      <div class="results__label">${achados.length} procedimento${achados.length === 1 ? '' : 's'}</div>
      <div class="stack gap-10">${cards}</div>
    </div>`;
}

function blocoNavegacao() {
  const d = st.data;

  const recentes = st.hist
    .slice(0, 3)
    .map((id) => proc(id))
    .filter(Boolean);

  const blocoRecentes = recentes.length
    ? `
    <div class="recentes">
      <div class="recentes__title">Recentes</div>
      <div class="stack gap-8">
        ${recentes
          .map(
            (p) => `
          <div class="recente-wrap" data-id="${esc(p.id)}">
            <div class="recente-del" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path></svg>
              <span>Remover</span>
            </div>
            <button class="recente" type="button" data-act="open-proc" data-id="${esc(p.id)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8A9199" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>
              <span>${esc(p.nome)}</span>
              ${iconeChevron()}
            </button>
          </div>`
          )
          .join('')}
      </div>
    </div>`
    : '';

  const grade = d.especialidades
    .map(
      (e) => `
      <button class="esp-card" type="button" data-act="open-esp" data-esp="${esc(e.nome)}">
        <div class="esp-card__sigla">${esc(sigla(e.nome))}</div>
        <div>
          <div class="esp-card__nome">${esc(e.nome)}</div>
          <div class="esp-card__count">${e.count} procedimentos</div>
        </div>
      </button>`
    )
    .join('');

  return `
    <div class="pad">
      ${blocoRecentes}
      <div class="esp-head">
        <span class="esp-head__title">Especialidades</span>
        <span class="esp-head__count">${d.procs.length} procedimentos</span>
      </div>
      <div class="esp-grid">${grade}</div>

      <div class="banner">
        <div class="banner__title">Tabela CBHPM ${esc(st.ano)}</div>
        <div class="banner__text">Valores por porte cirúrgico. Troque o ano na solicitação para comparar reajustes.</div>
      </div>

      <a class="manual" href="${MANUAL_PDF}" target="_blank" rel="noopener">
        <div class="manual__icon">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#146B5E" stroke-width="2" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"></path><path d="M14 3v4h4M10 12h6M10 16h4"></path></svg>
        </div>
        <div class="manual__body">
          <div class="manual__title">Manual de Codificação SBOT</div>
          <div class="manual__meta">Abrir PDF completo · nov/2025</div>
        </div>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1E8C7C" stroke-width="2" aria-hidden="true" style="flex-shrink:0"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"></path></svg>
      </a>
    </div>`;
}

function telaEspecialidade() {
  const lista = st.data.procs.filter((p) => p.esp === st.esp);

  const cards = lista
    .map((p) => {
      const meta = p.tuss.length + ' códigos · ' + p.cids.length + ' CIDs · ' + p.exames.length + ' exames';
      return `
      <button class="card card--tap" type="button" data-act="open-proc" data-id="${esc(p.id)}">
        <div class="proc-row">
          <div style="flex:1;min-width:0">
            <div class="proc-row__nome">${esc(nomeCurto(p.nome))}</div>
            <div class="proc-row__meta">${esc(meta)}</div>
          </div>
          ${chipCar(p.car, true)}
        </div>
      </button>`;
    })
    .join('');

  return `
    <div class="subhead">
      <button class="subhead__back" type="button" data-act="voltar" aria-label="Voltar">${iconeVoltar()}</button>
      <div style="min-width:0">
        <div class="subhead__title">${esc(st.esp)}</div>
        <div class="subhead__meta">${lista.length} procedimentos</div>
      </div>
    </div>
    <div class="stack gap-9" style="padding:14px 18px 24px">${cards}</div>`;
}

function telaProcedimento() {
  const p = proc(st.procId);
  if (!p) return `<div class="empty" style="padding-top:70px">Procedimento não encontrado.</div>`;

  const selecionados = new Set(st.cesta.filter((c) => c.procId === p.id).map((c) => c.codigo));
  const favorito = st.favs.includes(p.id);

  const cardsTuss = p.tuss
    .map((t) => {
      const on = selecionados.has(t.codigo);
      return `
      <button class="tuss-card" type="button" aria-pressed="${on}"
              data-act="toggle-cod" data-id="${esc(p.id)}" data-cod="${esc(t.codigo)}" data-porte="${esc(t.porte)}">
        <span class="checkbox ${on ? 'checkbox--on' : ''}">${iconeCheck()}</span>
        <span class="tuss-card__body">
          <span class="tuss-card__head">
            <span class="tuss-card__cod">${esc(t.codigo)}</span>
            <span class="porte">porte ${esc(t.porte)}</span>
          </span>
          <span class="tuss-card__desc">${esc(st.data.cbhpm[t.codigo] || '—')}</span>
        </span>
        <span class="tuss-card__val">
          <strong>${esc(brl(st.data.valorPorte(t.porte, st.ano)))}</strong>
          <small>${esc(st.ano)}</small>
        </span>
      </button>`;
    })
    .join('');

  const cidsMostrar = st.cidExp ? p.cids : p.cids.slice(0, 12);
  const chipsCid = cidsMostrar
    .map(
      (c) => `
      <button class="cid-chip ${st.cidSel === c ? 'cid-chip--on' : ''}" type="button"
              data-act="cid" data-cod="${esc(c)}" title="${esc(st.data.cid[c] || '')}">${esc(c)}</button>`
    )
    .join('');

  const detalheCid = st.cidSel
    ? `<div class="cids__detail">
         <div class="cids__detail-cod">${esc(st.cidSel)}</div>
         <div class="cids__detail-desc">${esc(st.data.cid[st.cidSel] || '')}</div>
       </div>`
    : '';

  const maisCids =
    p.cids.length > 12
      ? `<button class="cids__more" type="button" data-act="cid-more">${
          st.cidExp ? 'Mostrar menos' : 'Ver todos os ' + p.cids.length + ' CIDs'
        }</button>`
      : '';

  const exames = p.exames.length
    ? p.exames
        .map(
          (x) => `<div class="exame"><span class="exame__dot"></span><span>${esc(x)}</span></div>`
        )
        .join('')
    : `<div class="exames__vazio">Não informado no Manual.</div>`;

  const opmeSelecionados = new Set(st.opme.filter((o) => o.procId === p.id).map((o) => o.idx));
  const opmeMostrar = st.opmeExp || p.opme.length <= OPME_LIMITE ? p.opme : p.opme.slice(0, OPME_LIMITE);
  const opmeBlocos = blocosOpme(opmeMostrar)
    .map((b) => {
      const notas = [...new Set(b.itens.map((it) => it.observacao).filter(Boolean))];
      const cabecalho = b.grupo ? `<div class="opme-grupo">${esc(b.grupo)}</div>` : '';
      const notasHtml = notas.map((n) => `<div class="opme-nota">${esc(n)}</div>`).join('');
      const linhas = b.itens
        .map((it) => {
          const on = opmeSelecionados.has(it.idx);
          return `
          <button class="opme-item ${on ? 'opme-item--on' : ''}" type="button" aria-pressed="${on}"
                  data-act="toggle-opme" data-id="${esc(p.id)}" data-idx="${it.idx}">
            <span class="opme-item__check">${iconeCheck(9)}</span>
            <span class="opme-item__nome">${esc(it.item)}</span>
            ${it.quantidade ? `<span class="opme-item__qtd">×${esc(it.quantidade)}</span>` : ''}
          </button>`;
        })
        .join('');
      return cabecalho + notasHtml + linhas;
    })
    .join('');

  const opmeMais =
    p.opme.length > OPME_LIMITE
      ? `<button class="cids__more" type="button" data-act="opme-more">${
          st.opmeExp ? 'Mostrar menos' : 'Ver todos os ' + p.opme.length + ' itens'
        }</button>`
      : '';

  return `
    <div class="prochead">
      <div class="prochead__bar">
        <button class="subhead__back" type="button" data-act="voltar" aria-label="Voltar">${iconeVoltar()}</button>
        <button type="button" data-act="fav" aria-pressed="${favorito}" aria-label="${favorito ? 'Remover dos favoritos' : 'Salvar nos favoritos'}">
          <svg width="19" height="19" viewBox="0 0 24 24" stroke="#1E8C7C" stroke-width="2" fill="${favorito ? '#1E8C7C' : 'none'}" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21z"></path></svg>
        </button>
      </div>
      <div class="prochead__chips">
        <span class="chip chip--esp">${esc(p.esp)}</span>
        ${chipCar(p.car, false)}
      </div>
      <h1 class="prochead__nome">${esc(p.nome)}</h1>
      ${p.ind ? `<div class="prochead__ind">${esc(p.ind)}</div>` : ''}
    </div>

    <div class="tuss">
      <div class="section-head">
        <span class="section-title">Códigos TUSS/CBHPM</span>
        <button class="link-action" type="button" data-act="add-all">Selecionar todos</button>
      </div>
      <div class="stack gap-9">${cardsTuss}</div>
    </div>

    <div class="cids">
      <div class="section-head">
        <span class="section-title">CID-10 cabíveis</span>
        <span class="muted" style="font-size:12px">${p.cids.length}</span>
      </div>
      <div class="cids__box">
        ${p.cids.length ? `<div class="cids__chips">${chipsCid}</div>` : '<div class="muted" style="font-size:13px">Não informado no Manual.</div>'}
        ${detalheCid}
        ${maisCids}
      </div>
    </div>

    <div class="exames">
      <div class="exames__title">Exames para autorização</div>
      <div class="exames__box">${exames}</div>
    </div>

    <div class="opme">
      <div class="section-head">
        <span class="section-title">OPME sugeridos</span>
        <span class="muted" style="font-size:12px">${p.opme.length}</span>
      </div>
      <div class="opme-box">
        ${p.opme.length ? opmeBlocos : '<div class="exames__vazio">Não informado no Manual.</div>'}
        ${opmeMais}
      </div>
    </div>`;
}

function telaSolicitacao() {
  const rows = rowsAtuais();
  const opmeRows = rowsOpmeAtuais();
  const { total } = totais(rows);
  const temItens = rows.length > 0 || opmeRows.length > 0;

  const procsNomes = [...new Set([...st.cesta.map((c) => c.procId), ...st.opme.map((o) => o.procId)])]
    .map((id) => proc(id))
    .filter(Boolean)
    .map((p) => p.nome)
    .join(' + ');

  const subtitulo = temItens
    ? procsNomes
    : '100% no principal · 70% em via diferente · 50% na mesma via';

  const anos = st.data.meta.anos
    .map(
      (a) => `<button class="ano ${a === st.ano ? 'ano--on' : ''}" type="button" data-act="ano" data-ano="${esc(a)}">${esc(a)}</button>`
    )
    .join('');

  const cabecalho = `
    <div class="solic-head">
      <div class="solic-head__top">
        <div>
          <div class="solic-head__title">Solicitação Cirúrgica</div>
          <div class="solic-head__sub">${esc(subtitulo)}</div>
        </div>
        ${
          temItens
            ? `<button class="btn-limpar" type="button" data-act="limpar">
                 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F05400" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path></svg>
                 <span>Limpar</span>
               </button>`
            : ''
        }
      </div>
      <div class="pills">
        <button class="pill pill--urg" type="button" data-act="urg" aria-pressed="${!!st.urgencia}">Urgência · +30%</button>
        <button class="pill pill--apto" type="button" data-act="apto" aria-pressed="${!!st.apartamento}">Apartamento · ×2</button>
      </div>
      <div class="anos">${anos}</div>
    </div>`;

  if (!temItens) {
    return (
      cabecalho +
      `<div class="empty" style="padding:60px 34px">
         <div style="width:56px;height:56px;border-radius:999px;background:#E4E6E7;margin:0 auto 16px;display:flex;align-items:center;justify-content:center">
           <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6B7680" stroke-width="1.8" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"></path><path d="M14 3v4h4M10 12h6M10 16h4"></path></svg>
         </div>
         Nenhum código ou OPME selecionado. Abra um procedimento e marque o que vai na solicitação.
       </div>`
    );
  }

  const cards = rows
    .map((r) => {
      const classePct = r.fator === 1 ? 'pct--100' : r.fator >= 0.7 ? 'pct--70' : 'pct--50';
      const mostrarVia = !r.principal;
      return `
      <div class="solic-card">
        <div class="solic-card__row">
          <div class="solic-card__body">
            <div class="solic-card__cod">${esc(r.codigo)}</div>
            <div class="solic-card__desc">${esc(r.desc || '—')}</div>
            <div class="solic-card__origem">porte ${esc(r.porte)}</div>
            ${
              mostrarVia
                ? `<button class="via ${r.via === 'outra' ? 'via--on' : ''}" type="button" data-act="via" data-key="${esc(r.key)}" aria-pressed="${r.via === 'outra'}">
                     <span class="via__box">${iconeCheck(9)}</span>
                     <span>Via diferente (70%)</span>
                   </button>`
                : ''
            }
            ${r.principal ? '<div class="solic-card__principal">via principal</div>' : ''}
          </div>
          <div class="solic-card__vals">
            <div class="solic-card__final">${esc(brl(r.final))}</div>
            ${r.fator === 1 ? '' : `<div class="solic-card__cheio">${esc(brl(r.bruto))}</div>`}
            <span class="pct ${classePct}">${esc(r.pct)}</span>
            <button class="solic-card__remove" type="button" data-act="remove" data-key="${esc(r.key)}">remover</button>
          </div>
        </div>
      </div>`;
    })
    .join('');

  const opmeSecao = opmeRows.length
    ? `
    <div class="opme">
      <div class="section-head">
        <span class="section-title">OPME selecionados</span>
        <span class="muted" style="font-size:12px">${opmeRows.length}</span>
      </div>
      <div class="opme-box">
        ${opmeRows
          .map((o) => {
            const p = proc(o.procId);
            const nome = (o.grupo ? o.grupo + ' — ' : '') + o.item;
            return `
            <div class="opme-sel">
              <div class="opme-sel__body">
                <div class="opme-sel__nome">${esc(nome)}</div>
                <div class="opme-sel__origem">${esc(p ? p.nome : '')}${o.quantidade ? ' · ×' + esc(o.quantidade) : ''}</div>
              </div>
              <button class="solic-card__remove" type="button" data-act="remove-opme" data-key="${esc(o.key)}">remover</button>
            </div>`;
          })
          .join('')}
      </div>
    </div>`
    : '';

  const totaisSecao = rows.length
    ? `
      <div class="totais">
        <div class="totais__total">
          <span class="totais__total-label">Total CBHPM ${esc(st.ano)}</span>
          <span class="totais__total-valor">${esc(brl(total))}</span>
        </div>
      </div>`
    : '';

  return (
    cabecalho +
    `<div class="solic-list">
      ${cards}
      ${opmeSecao}
      ${totaisSecao}
      <button class="btn-primary btn-primary--block" type="button" data-act="export-open">Gerar solicitação</button>
    </div>`
  );
}

function telaSalvos() {
  const ids = st.salvosTab === 'fav' ? st.favs : st.hist;
  const itens = ids.map((id) => proc(id)).filter(Boolean);

  const lista = itens
    .map(
      (p) => `
      <button class="card card--tap" type="button" data-act="open-proc" data-id="${esc(p.id)}">
        <div class="salvo__nome">${esc(p.nome)}</div>
        <div class="salvo__meta">${esc(p.esp)} · ${p.tuss.length} códigos</div>
      </button>`
    )
    .join('');

  const vazio =
    st.salvosTab === 'fav'
      ? 'Nenhum favorito ainda. Toque na bandeira dentro de um procedimento.'
      : 'Seu histórico aparece aqui conforme você consulta procedimentos.';

  return `
    <div class="pad">
      <div class="salvos__title">Salvos</div>
      <div class="tabs">
        <button class="tabs__btn ${st.salvosTab === 'fav' ? 'tabs__btn--on' : ''}" type="button" data-act="tab-fav">Favoritos</button>
        <button class="tabs__btn ${st.salvosTab === 'hist' ? 'tabs__btn--on' : ''}" type="button" data-act="tab-hist">Histórico</button>
      </div>
      ${itens.length ? `<div class="stack gap-9">${lista}</div>` : `<div class="empty" style="padding:50px 20px">${vazio}</div>`}
    </div>`;
}

/* ------------------------------------------------------------------ sheet -- */

function renderSheet() {
  if (!st.exportOpen || !st.data) {
    el.sheet.innerHTML = '';
    return;
  }

  const rows = rowsAtuais();
  const opmeRows = rowsOpmeAtuais();
  const { total } = totais(rows);
  const simples = st.exportModo === 'simples';
  const resumo = simples
    ? rows.length + ' códigos · sem valores'
    : rows.length + ' códigos' + (opmeRows.length ? ' · ' + opmeRows.length + ' OPME' : '') + ' · total ' + brl(total);

  el.sheet.innerHTML = `
    <div class="sheet-overlay" data-act="export-close" role="dialog" aria-modal="true" aria-label="Solicitação pronta">
      <div class="sheet" data-stop>
        <div class="sheet__grip"></div>
        <div class="sheet__title">Solicitação pronta</div>
        <div class="sheet__resumo">${esc(resumo)}</div>
        <div class="sheet__modos">
          <button class="modo ${simples ? '' : 'modo--on'}" type="button" data-act="modo-completa">Completa</button>
          <button class="modo ${simples ? 'modo--on' : ''}" type="button" data-act="modo-simples">Simplificada (sem valores)</button>
        </div>
        <pre class="sheet__preview">${esc(texto(st.data, st, rows, cid10Cache, opmeRows))}</pre>
        <div class="sheet__acoes">
          <button class="sheet__btn sheet__btn--primary" type="button" data-act="copiar">Copiar texto</button>
          <button class="sheet__btn" type="button" data-act="pdf">Gerar PDF</button>
          <button class="sheet__btn" type="button" data-act="compartilhar">Compartilhar</button>
          <button class="sheet__btn sheet__btn--ghost" type="button" data-act="export-close">Fechar</button>
        </div>
      </div>
    </div>`;
}

/* --------------------------------------------------------------- render -- */

function renderProcbar() {
  const mostrar = st.screen === 'proc' && st.data;
  if (!mostrar) {
    el.procbar.innerHTML = '';
    return;
  }

  const rows = rowsAtuais();
  const doProc = rows.filter((r) => r.procId === st.procId);
  const opmeDoProc = rowsOpmeAtuais().filter((o) => o.procId === st.procId);
  if (!doProc.length && !opmeDoProc.length) {
    el.procbar.innerHTML = '';
    return;
  }

  const { total } = totais(rows);
  const partes = [];
  if (doProc.length) partes.push(doProc.length + ' código' + (doProc.length === 1 ? '' : 's'));
  if (opmeDoProc.length) partes.push(opmeDoProc.length + ' OPME');
  const rotulo = partes.join(' · ') + ' selecionado' + (doProc.length + opmeDoProc.length === 1 ? '' : 's');

  el.procbar.innerHTML = `
    <div class="procbar">
      <div class="procbar__info">
        <div class="procbar__label">${esc(rotulo)}</div>
        ${doProc.length ? `<div class="procbar__total">${esc(brl(total))}</div>` : ''}
      </div>
      <button class="btn-primary" type="button" data-act="go-cesta">Ver solicitação</button>
    </div>`;
}

function renderCasca() {
  el.subtitle.textContent = st.data
    ? 'Manual de Codificação · CBHPM ' + st.ano + ' · OPME'
    : st.erro
    ? 'banco de dados indisponível'
    : 'carregando manual…';

  el.favCount.textContent = st.favs.length;

  el.tabs.home.classList.toggle('tab--on', st.screen === 'home' || st.screen === 'esp' || st.screen === 'proc');
  el.tabs.cesta.classList.toggle('tab--on', st.screen === 'cesta');
  el.tabs.salvos.classList.toggle('tab--on', st.screen === 'salvos');

  el.tabBadge.hidden = st.cesta.length === 0;
  el.tabBadge.textContent = st.cesta.length;

  el.searchwrap.hidden = !(st.screen === 'home' && st.data);
  el.clear.hidden = st.query.trim().length === 0;
}

function render() {
  renderCasca();

  if (st.erro) el.screen.innerHTML = telaErro();
  else if (!st.data) el.screen.innerHTML = telaCarregando();
  else if (st.screen === 'esp') el.screen.innerHTML = telaEspecialidade();
  else if (st.screen === 'proc') el.screen.innerHTML = telaProcedimento();
  else if (st.screen === 'cesta') el.screen.innerHTML = telaSolicitacao();
  else if (st.screen === 'salvos') el.screen.innerHTML = telaSalvos();
  else el.screen.innerHTML = telaHome();

  renderProcbar();
  renderSheet();
}

/** Re-renderiza apenas a tela atual (sem mexer no scroll nem no campo de busca). */
function atualizar() {
  const y = el.scroll.scrollTop;
  render();
  el.scroll.scrollTop = y;
}

/* ----------------------------------------------------------------- ações -- */

async function copiarTexto(t) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch {
    /* cai no plano B */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:absolute;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

const ACOES = {
  'go-home': () => navegar('#/'),
  'go-cesta': () => navegar('#/solicitacao'),
  'go-salvos': () => navegar('#/salvos'),
  voltar,
  recarregar: () => location.reload(),

  'open-proc': (ds) => navegar('#/proc/' + encodeURIComponent(ds.id)),
  'open-esp': (ds) => navegar('#/esp/' + encodeURIComponent(ds.esp)),

  'toggle-cod': (ds) => {
    alternarCodigo(ds.id, ds.cod, ds.porte);
    atualizar();
  },
  'add-all': () => {
    const p = proc(st.procId);
    if (!p) return;
    const jaTem = new Set(st.cesta.filter((c) => c.procId === p.id).map((c) => c.codigo));
    const novos = p.tuss
      .filter((t) => !jaTem.has(t.codigo))
      .map((t) => ({ key: p.id + '|' + t.codigo, procId: p.id, codigo: t.codigo, porte: t.porte, via: 'mesma' }));
    if (!novos.length) return;
    st.cesta = st.cesta.concat(novos);
    persistir();
    atualizar();
  },
  fav: () => {
    const p = proc(st.procId);
    if (!p) return;
    const tinha = st.favs.includes(p.id);
    st.favs = tinha ? st.favs.filter((f) => f !== p.id) : st.favs.concat([p.id]);
    persistir();
    atualizar();
    toast(tinha ? 'Removido dos favoritos' : 'Salvo nos favoritos');
  },
  cid: (ds) => {
    st.cidSel = st.cidSel === ds.cod ? null : ds.cod;
    atualizar();
  },
  'cid-more': () => {
    st.cidExp = !st.cidExp;
    atualizar();
  },
  'toggle-opme': (ds) => {
    alternarOpme(ds.id, Number(ds.idx));
    atualizar();
  },
  'opme-more': () => {
    st.opmeExp = !st.opmeExp;
    atualizar();
  },

  limpar: () => {
    st.cesta = [];
    st.opme = [];
    persistir();
    atualizar();
    toast('Solicitação limpa');
  },
  remove: (ds) => {
    st.cesta = st.cesta.filter((c) => c.key !== ds.key);
    persistir();
    atualizar();
  },
  'remove-opme': (ds) => {
    st.opme = st.opme.filter((o) => o.key !== ds.key);
    persistir();
    atualizar();
  },
  via: (ds) => {
    alternarVia(ds.key);
    atualizar();
  },
  urg: () => {
    st.urgencia = !st.urgencia;
    persistir();
    atualizar();
  },
  apto: () => {
    st.apartamento = !st.apartamento;
    persistir();
    atualizar();
  },
  ano: (ds) => {
    st.ano = ds.ano;
    persistir();
    atualizar();
  },

  'tab-fav': () => {
    st.salvosTab = 'fav';
    persistir();
    atualizar();
  },
  'tab-hist': () => {
    st.salvosTab = 'hist';
    persistir();
    atualizar();
  },

  'export-open': () => {
    if (!st.cesta.length && !st.opme.length) return;
    st.exportOpen = true;
    renderSheet();
    if (!cid10Cache) {
      // busca em segundo plano; atualiza a prévia se ainda estiver aberta quando terminar
      garantirCid10().then(() => {
        if (st.exportOpen) renderSheet();
      });
    }
  },
  'export-close': () => {
    st.exportOpen = false;
    renderSheet();
  },
  'modo-completa': () => {
    st.exportModo = 'completa';
    persistir();
    renderSheet();
  },
  'modo-simples': () => {
    st.exportModo = 'simples';
    persistir();
    renderSheet();
  },

  copiar: async () => {
    const ok = await copiarTexto(texto(st.data, st, rowsAtuais(), cid10Cache, rowsOpmeAtuais()));
    st.exportOpen = false;
    renderSheet();
    toast(ok ? 'Texto copiado' : 'Não foi possível copiar');
  },
  pdf: () => {
    const rows = rowsAtuais();
    st.exportOpen = false;
    renderSheet();
    const ok = imprimir(st.data, st, rows, cid10Cache, rowsOpmeAtuais());
    if (!ok) toast('Impressão indisponível neste navegador');
  },
  compartilhar: async () => {
    const t = texto(st.data, st, rowsAtuais(), cid10Cache, rowsOpmeAtuais());
    st.exportOpen = false;
    renderSheet();
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Solicitação cirúrgica', text: t });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    const ok = await copiarTexto(t);
    toast(ok ? 'Texto copiado para compartilhar' : 'Compartilhamento indisponível');
  }
};

/* ---------------------------------------------------------------- eventos -- */

document.addEventListener('click', (ev) => {
  const suprimir = swipeAcabouDeArrastar;
  swipeAcabouDeArrastar = false;

  const alvo = ev.target.closest('[data-act]');
  if (!alvo) return;

  // clique fantasma logo após arrastar um "recente" — não abre o procedimento
  if (suprimir && alvo.classList.contains('recente')) {
    ev.preventDefault();
    return;
  }

  // clique dentro do sheet não deve fechá-lo pelo overlay
  if (alvo.dataset.act === 'export-close' && alvo.classList.contains('sheet-overlay') && ev.target.closest('[data-stop]')) {
    return;
  }

  const acao = ACOES[alvo.dataset.act];
  if (!acao) return;
  ev.preventDefault();
  acao(alvo.dataset);
});

el.input.addEventListener('input', () => {
  st.query = el.input.value;
  el.clear.hidden = st.query.trim().length === 0;
  if (st.screen === 'home') {
    el.screen.innerHTML = telaHome();
    el.scroll.scrollTop = 0;
  }
});

el.input.addEventListener('search', () => {
  // botão "x" nativo do campo de busca
  if (el.input.value === '') el.input.dispatchEvent(new Event('input'));
});

el.clear.addEventListener('click', () => {
  el.input.value = '';
  st.query = '';
  el.clear.hidden = true;
  el.input.focus();
  if (st.screen === 'home') el.screen.innerHTML = telaHome();
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && st.exportOpen) {
    st.exportOpen = false;
    renderSheet();
  }
});

window.addEventListener('hashchange', aplicarRota);

/* Tab bar flutuante: some ao rolar para baixo (mais conteúdo), reaparece ao
   rolar para cima ou perto do topo. Limiar evita flicker por bounce elástico. */
const LIMIAR_TABBAR = 8;
let ultimoScrollTop = 0;

function atualizarVisibilidadeTabbar(scrollTop) {
  if (scrollTop <= LIMIAR_TABBAR) {
    el.tabbar.classList.remove('tabbar--hidden');
  } else if (scrollTop > ultimoScrollTop + LIMIAR_TABBAR) {
    el.tabbar.classList.add('tabbar--hidden');
    ultimoScrollTop = scrollTop;
  } else if (scrollTop < ultimoScrollTop - LIMIAR_TABBAR) {
    el.tabbar.classList.remove('tabbar--hidden');
    ultimoScrollTop = scrollTop;
  }
}

el.scroll.addEventListener(
  'scroll',
  () => {
    if (rotaAtual) scrollPorRota.set(rotaAtual, el.scroll.scrollTop);
    atualizarVisibilidadeTabbar(el.scroll.scrollTop);
  },
  { passive: true }
);

/* ----------------------------------------------------------------- início -- */

async function iniciar() {
  render();
  try {
    st.data = await carregarDados();
    if (!st.ano || !st.data.meta.anos.includes(st.ano)) st.ano = st.data.meta.anos[0];

    // limpa referências a procedimentos/itens que não existem mais no JSON
    st.favs = st.favs.filter((id) => st.data.proc(id));
    st.hist = st.hist.filter((id) => st.data.proc(id));
    st.cesta = st.cesta.filter((c) => st.data.proc(c.procId));
    st.opme = st.opme.filter((o) => {
      const p = st.data.proc(o.procId);
      return p && p.opme[o.idx];
    });
    persistir();
  } catch (e) {
    st.erro = (e && e.message) || String(e);
  }
  aplicarRota();
}

iniciar();
garantirCid10(); // pré-busca em segundo plano; pronta quando o usuário chegar à solicitação

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline continua opcional */
    });
  });
}
