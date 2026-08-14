/* Cálculo da solicitação cirúrgica e geração dos textos de exportação.

   Regras (Manual SBOT / CBHPM, conforme definido com o usuário):
   - o código de maior valor é o principal e recebe 100% do porte;
   - cada código seguinte recebe 50% (mesma via de acesso do principal)
     ou 70% quando executado por via de acesso diferente;
   - urgência multiplica o porte por 1,3 e apartamento por 2, antes da
     regra de via de acesso. Os dois acréscimos podem ser combinados.

   Só entram na solicitação gerada os itens explicitamente selecionados
   pelo usuário — códigos TUSS (st.cesta), OPME (st.opme), exames
   (st.exames) e CID (st.cids) —, cada um guardado só como referência
   (procId + idx/código), nunca uma cópia do texto do catálogo. */

import { brl } from './format.js';

/**
 * Monta as linhas da solicitação já ordenadas e com percentual aplicado.
 * @param {object} data modelo devolvido por adaptar()
 * @param {object} st   estado do app (ou snapshot de uma solicitação salva)
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
    const fator = principal ? 1 : via === 'outra' ? 0.7 : 0.5;
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

/** Procedimentos representados na solicitação, a partir de uma lista (já combinada) de IDs. */
export function procedimentosDaSolicitacao(data, procIds) {
  const ids = [...new Set(procIds)];
  return ids.map((id) => data.proc(id)).filter(Boolean);
}

/**
 * Linhas de OPME selecionadas, resolvidas a partir do catálogo — a store
 * guarda só a referência (procId + idx), nunca uma cópia do texto do item.
 */
export function linhasOpme(data, st) {
  return st.opme
    .map((o) => {
      const p = data.proc(o.procId);
      const item = p && p.opme[o.idx];
      return item ? { key: o.key, procId: o.procId, ...item } : null;
    })
    .filter(Boolean);
}

/** Linhas de exames selecionados, resolvidas a partir do catálogo (procId + idx). */
export function linhasExame(data, st) {
  return st.exames
    .map((e) => {
      const p = data.proc(e.procId);
      const texto = p && p.exames[e.idx];
      return texto ? { key: e.key, procId: e.procId, texto } : null;
    })
    .filter(Boolean);
}

/** Acréscimos ativos, como rótulos curtos ("urgência +30%", "apartamento ×2"). */
export function acrescimos(st) {
  return [
    st.urgencia ? 'urgência +30%' : '',
    st.apartamento ? 'apartamento ×2' : ''
  ].filter(Boolean);
}

/**
 * Linha de exibição de um CID: forma abreviada do catálogo externo
 * (ex.: "S42.3 Frat da diafise do umero") quando disponível, ou o código
 * mais a descrição completa do Manual como reserva.
 * @param {object} data modelo devolvido por adaptar()
 * @param {Map<string,string>|null} cid10Map código → descrição abreviada
 * @param {string} c código do CID
 */
export function linhaCid(data, cid10Map, c) {
  const abreviada = cid10Map && cid10Map.get(c);
  return abreviada || c + ' - ' + (data.cid[c] || 'descrição não informada');
}

/** Linhas de CID selecionados, com a forma abreviada já resolvida (procId + idx → código). */
export function linhasCid(data, st, cid10Map) {
  return st.cids
    .map((c) => {
      const p = data.proc(c.procId);
      const codigo = p && p.cids[c.idx];
      return codigo ? { key: c.key, procId: c.procId, codigo, abreviado: linhaCid(data, cid10Map, codigo) } : null;
    })
    .filter(Boolean);
}

/** Linha de exibição de um item OPME: "2x PARAFUSO CORTICAL" ou só o nome quando sem quantidade. */
export function linhaOpme(o) {
  const nome = (o.grupo ? o.grupo + ' — ' : '') + o.item;
  return o.quantidade ? o.quantidade + 'x ' + nome : nome;
}

/**
 * Texto da solicitação, no formato definido pelo usuário.
 * modo 'completa'   → descrição, códigos com porte/valor, total, exames, CID (forma abreviada) e OPME selecionados
 * modo 'simples'    → descrição e lista "CÓDIGOS TUSS:" com código e descrição
 * @param {object} data modelo devolvido por adaptar()
 * @param {object} st   estado (ou snapshot salvo) — usa st.exportModo, st.ano, st.urgencia, st.apartamento
 * @param {{rows: Array, opmeRows?: Array, examesRows?: Array, cidsRows?: Array}} ctx
 */
export function texto(data, st, ctx) {
  const { rows, opmeRows = [], examesRows = [], cidsRows = [] } = ctx;
  const procIds = [
    ...rows.map((r) => r.procId),
    ...opmeRows.map((o) => o.procId),
    ...examesRows.map((e) => e.procId),
    ...cidsRows.map((c) => c.procId)
  ];
  const procs = procedimentosDaSolicitacao(data, procIds);

  if (st.exportModo === 'simples') {
    let s = procs.map((p) => p.nome).join('\n') + '\n\nCÓDIGOS TUSS:\n';
    for (const r of rows) s += '- ' + r.codigo + ': ' + (data.cbhpm[r.codigo] || '—') + '\n';
    return s.trimEnd();
  }

  const extras = acrescimos(st);
  let t = procs.map((p) => p.nome).join('\n') + '\n\n';
  if (rows.length) {
    t += 'CÓDIGOS (CBHPM ' + st.ano + (extras.length ? ' · ' + extras.join(' · ') : '') + ')\n\n';
    for (const r of rows) {
      t += r.codigo + '  porte ' + r.porte + '  ' + brl(r.final) + '\n';
    }
    t += 'TOTAL: ' + brl(totais(rows).total) + '\n\n';
    t += '------\n\n';
  }

  t += 'Exames: ' + (examesRows.length ? examesRows.map((e) => e.texto).join('; ') : 'não informado') + '\n\n';
  t += 'CID:\n';
  t += (cidsRows.length ? cidsRows.map((c) => '* ' + c.abreviado).join('\n') : 'não informado') + '\n\n';
  t += 'OPME:\n';
  t += opmeRows.length ? opmeRows.map((o) => '* ' + linhaOpme(o)).join('\n') : 'não informado';
  return t;
}
