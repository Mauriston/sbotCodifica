/* Cálculo da solicitação cirúrgica e geração dos textos de exportação.

   Regras (Manual SBOT / CBHPM, conforme definido com o usuário):
   - o código de maior valor é o principal e recebe 100% do porte;
   - cada código seguinte recebe 50% (mesma via de acesso do principal)
     ou 70% quando executado por via de acesso diferente;
   - urgência multiplica o porte por 1,3 e apartamento por 2, antes da
     regra de via de acesso. Os dois acréscimos podem ser combinados. */

import { brl } from './format.js';

/**
 * Monta as linhas da solicitação já ordenadas e com percentual aplicado.
 * @param {object} data modelo devolvido por adaptar()
 * @param {object} st   estado do app
 * @returns {Array<{key,procId,codigo,porte,via,principal,fator,bruto,final,desc,pct}>}
 */
export function linhas(data, st) {
  const mult = (st.urgencia ? 1.3 : 1) * (st.apartamento ? 2 : 1);

  const base = st.cesta
    .map((c) => ({ ...c, bruto: data.valorPorte(c.porte, st.ano) * mult }))
    .sort((a, b) => b.bruto - a.bruto);

  return base.map((r, i) => {
    const via = r.via === 'outra' ? 'outra' : 'mesma';
    const principal = i === 0;
    const fator = st.semReducao || principal ? 1 : via === 'outra' ? 0.7 : 0.5;
    return {
      ...r,
      via,
      principal,
      fator,
      final: r.bruto * fator,
      desc: data.cbhpm[r.codigo] || '',
      pct: Math.round(fator * 100) + '%'
    };
  });
}

/** Somatórios da solicitação. */
export function totais(rows) {
  const somaCheia = rows.reduce((s, r) => s + r.bruto, 0);
  const total = rows.reduce((s, r) => s + r.final, 0);
  return { somaCheia, total, reducao: somaCheia - total };
}

/** Procedimentos representados na solicitação, na ordem em que aparecem. */
export function procedimentosDaSolicitacao(data, rows) {
  const ids = [...new Set(rows.map((r) => r.procId))];
  return ids.map((id) => data.proc(id)).filter(Boolean);
}

/** Acréscimos ativos, como rótulos curtos ("urgência +30%", "apartamento ×2"). */
export function acrescimos(st) {
  return [
    st.urgencia ? 'urgência +30%' : '',
    st.apartamento ? 'apartamento ×2' : ''
  ].filter(Boolean);
}

/**
 * Texto da solicitação, no formato definido pelo usuário.
 * modo 'completa'   → descrição, códigos com porte/percentual/valor, total, exames e CID
 * modo 'simples'    → descrição e lista "CÓDIGOS TUSS:" com código e descrição
 */
export function texto(data, st, rows) {
  const procs = procedimentosDaSolicitacao(data, rows);

  if (st.exportModo === 'simples') {
    let s = procs.map((p) => p.nome).join('\n') + '\n\nCÓDIGOS TUSS:\n';
    for (const r of rows) s += '- ' + r.codigo + ': ' + (data.cbhpm[r.codigo] || '—') + '\n';
    return s.trimEnd();
  }

  const extras = acrescimos(st);
  let t = procs.map((p) => p.nome).join('\n') + '\n\n';
  t += 'CÓDIGOS (CBHPM ' + st.ano + (extras.length ? ' · ' + extras.join(' · ') : '') + ')\n\n';
  for (const r of rows) {
    t += r.codigo + '  porte ' + r.porte + '  ' + brl(r.final) + '\n';
  }
  t += 'TOTAL: ' + brl(totais(rows).total) + '\n\n';
  t += '------\n\n';

  const exames = [...new Set(procs.flatMap((p) => p.exames))];
  const cids = [...new Set(procs.flatMap((p) => p.cids))];
  t += 'Exames: ' + (exames.length ? exames.join('; ') : 'não informado') + '\n\n';
  t += 'CID:\n';
  t += cids.length
    ? cids.map((c) => '* ' + c + ' - ' + (data.cid[c] || 'descrição não informada')).join('\n')
    : 'não informado';
  return t;
}
