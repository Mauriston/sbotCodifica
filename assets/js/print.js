/* Geração do PDF da solicitação.

   Sem dependências: monta um documento A4 em #print-root e chama window.print().
   No iPhone/iPad o próprio menu de impressão do Safari oferece "Salvar em
   Arquivos"/"Enviar por…" como PDF; no desktop, "Salvar como PDF". */

import { brl, esc } from './format.js';
import { totais, procedimentosDaSolicitacao, acrescimos, linhaOpme } from './solicitacao.js';

const dataLonga = () =>
  new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

function tabelaCodigos(rows) {
  const linhas = rows
    .map(
      (r) => `
      <tr>
        <td><strong>${esc(r.codigo)}</strong></td>
        <td>${esc(r.desc || '—')}</td>
        <td class="num">${esc(r.porte)}</td>
        <td class="num">${esc(brl(r.final))}</td>
      </tr>`
    )
    .join('');

  return `
    <table class="doc__table">
      <thead>
        <tr>
          <th>Código</th><th>Descrição</th>
          <th class="num">Porte</th><th class="num">Valor</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>`;
}

function listaCodigos(rows) {
  return `<ul class="doc__body">${rows
    .map((r) => `<li><strong>${esc(r.codigo)}</strong>: ${esc(r.desc || '—')}</li>`)
    .join('')}</ul>`;
}

function listaExames(examesRows) {
  return examesRows.map((e) => esc(e.texto)).join('; ');
}

function listaCids(cidsRows) {
  return `<ul class="doc__body">${cidsRows.map((c) => `<li>${esc(c.abreviado)}</li>`).join('')}</ul>`;
}

function listaOpme(opmeRows) {
  return `<ul class="doc__body">${opmeRows.map((o) => `<li>${esc(linhaOpme(o))}</li>`).join('')}</ul>`;
}

/**
 * Monta o documento imprimível a partir de uma solicitação (atual ou salva).
 * @param {{rows: Array, opmeRows?: Array, examesRows?: Array, cidsRows?: Array}} ctx
 */
export function montarDocumento(data, st, ctx) {
  const { rows, opmeRows = [], examesRows = [], cidsRows = [] } = ctx;
  const procIds = [
    ...rows.map((r) => r.procId),
    ...opmeRows.map((o) => o.procId),
    ...examesRows.map((e) => e.procId),
    ...cidsRows.map((c) => c.procId)
  ];
  const procs = procedimentosDaSolicitacao(data, procIds);
  const simples = st.exportModo === 'simples';
  const extras = acrescimos(st);
  const { total } = totais(rows);

  const secaoCodigos = !rows.length
    ? ''
    : simples
    ? `<div class="doc__section"><h2>Códigos TUSS</h2>${listaCodigos(rows)}</div>`
    : `<div class="doc__section">
         <h2>Códigos (CBHPM ${esc(st.ano)}${extras.length ? ' · ' + esc(extras.join(' · ')) : ''})</h2>
         ${tabelaCodigos(rows)}
         <div class="doc__total"><span>Total</span><span>${esc(brl(total))}</span></div>
       </div>`;

  return `
    <div class="doc">
      <div class="doc__head">
        <div>
          <div class="doc__title">Solicitação de autorização cirúrgica</div>
          <div class="doc__sub">Códigos TUSS/CBHPM · Manual de Codificação da SBOT · ${esc(dataLonga())}</div>
        </div>
      </div>

      <div class="doc__section">
        <h2>Procedimento${procs.length > 1 ? 's' : ''}</h2>
        ${procs.map((p) => `<div class="doc__proc">${esc(p.nome)}</div>`).join('')}
      </div>

      ${secaoCodigos}

      <div class="doc__section">
        <h2>Exames para autorização</h2>
        <div class="doc__body">${examesRows.length ? listaExames(examesRows) : 'não informado'}</div>
      </div>

      <div class="doc__section">
        <h2>CID-10</h2>
        ${cidsRows.length ? listaCids(cidsRows) : '<div class="doc__body">não informado</div>'}
      </div>

      <div class="doc__section">
        <h2>OPME sugeridos</h2>
        ${opmeRows.length ? listaOpme(opmeRows) : '<div class="doc__body">não informado</div>'}
      </div>

      <div class="doc__foot">
        ${
          simples
            ? 'Documento gerado no SBOT Codifica a partir do Manual de Codificação da SBOT.'
            : `Valores de porte cirúrgico da tabela CBHPM ${esc(st.ano)}. Não incluem porte anestésico,
               custo operacional nem materiais. Documento gerado no SBOT Codifica a partir do
               Manual de Codificação da SBOT.`
        }
      </div>
    </div>`;
}

/** Preenche #print-root e dispara a impressão. Devolve false se o navegador não suporta. */
export function imprimir(data, st, ctx) {
  const alvo = document.getElementById('print-root');
  if (!alvo || typeof window.print !== 'function') return false;

  alvo.innerHTML = montarDocumento(data, st, ctx);
  const tituloOriginal = document.title;
  document.title = 'Solicitacao-SBOT-' + new Date().toISOString().slice(0, 10);

  const restaurar = () => {
    document.title = tituloOriginal;
    window.removeEventListener('afterprint', restaurar);
  };
  window.addEventListener('afterprint', restaurar);

  window.print();
  // Safari não dispara afterprint de forma confiável; garante a restauração.
  setTimeout(restaurar, 3000);
  return true;
}
