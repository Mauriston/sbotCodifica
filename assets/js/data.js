/* Carrega o banco de dados do app: o JSON do Manual de Codificação da SBOT
   publicado neste repositório (sbot_cbhpm_tuss_v1.json).

   O JSON é a única fonte de verdade — não existe cópia derivada em código.
   Aqui ele é apenas adaptado para um formato compacto de leitura e recebe um
   índice de busca pré-normalizado. */

import { norm } from './format.js';

export const DATA_URL = './sbot_cbhpm_tuss_v1.json';

/**
 * @typedef {Object} Proc
 * @property {string} id
 * @property {string} esp    especialidade
 * @property {string} nome   nome do procedimento
 * @property {string} ind    indicação
 * @property {string} car    caráter da indicação (Eletiva, Urgência, …)
 * @property {string[]} exames
 * @property {{codigo:string, porte:string}[]} tuss
 * @property {string[]} cids
 */

/** Converte o JSON bruto no modelo consumido pelas telas. */
export function adaptar(raw) {
  const cbhpm = {};
  for (const [codigo, v] of Object.entries(raw.catalogos.cbhpm || {})) {
    cbhpm[codigo] = (v && v.descricao) || '';
  }

  const cid = {};
  for (const [codigo, v] of Object.entries(raw.catalogos.cid || {})) {
    cid[codigo] = (v && v.descricao) || '';
  }

  const portes = {};
  for (const [porte, v] of Object.entries(raw.catalogos.porte_cirurgico || {})) {
    portes[porte] = (v && v.valores) || {};
  }

  const procs = (raw.procedimentos || []).map((p) => ({
    id: p.id,
    esp: p.especialidade || '—',
    nome: p.nome_procedimento || '',
    ind: p.indicacao || '',
    car: p.carater_indicacao || 'Eletiva',
    exames: p.exames_indicacao || [],
    tuss: (p.codigos_tuss || []).map((t) => ({ codigo: t.codigo, porte: t.porte })),
    cids: p.cids || []
  }));

  // índice de busca: uma string normalizada por dimensão pesquisável
  const indice = procs.map((p) => ({
    nome: norm(p.nome),
    esp: norm(p.esp),
    codigos: p.tuss.map((t) => norm(t.codigo)),
    cids: p.cids.map((c) => ({ codigo: c, busca: norm(c + ' ' + (cid[c] || '')) }))
  }));

  const espCounts = new Map();
  for (const p of procs) espCounts.set(p.esp, (espCounts.get(p.esp) || 0) + 1);

  const anos =
    (raw.meta && raw.meta.totais && raw.meta.totais.anos_tabela_valores) ||
    (raw.meta && raw.meta.anos) ||
    Object.keys(Object.values(portes)[0] || {}).sort().reverse();

  const byId = new Map(procs.map((p) => [p.id, p]));

  return {
    meta: { anos, fonte: (raw.meta && raw.meta.fonte) || '', geradoEm: (raw.meta && raw.meta.gerado_em) || '' },
    procs,
    indice,
    byId,
    cbhpm,
    cid,
    portes,
    especialidades: [...espCounts.entries()].map(([nome, count]) => ({ nome, count })),
    proc: (id) => byId.get(id) || null,
    /** Valor do porte cirúrgico no ano da tabela CBHPM. */
    valorPorte(porte, ano) {
      const v = portes[porte];
      return (v && v[ano]) || 0;
    }
  };
}

/** Busca o JSON do repositório e devolve o modelo adaptado. */
export async function carregarDados(url = DATA_URL) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error('Falha ao carregar o banco de dados (' + res.status + ')');
  return adaptar(await res.json());
}

/**
 * Busca por nome do procedimento, especialidade, código TUSS/CBHPM ou CID
 * (código ou descrição). Ordena por relevância; devolve no máximo `limite`.
 */
export function buscar(data, termo, limite = 30) {
  const q = norm(String(termo || '').trim());
  if (q.length < 2) return [];

  const achados = [];
  for (let i = 0; i < data.procs.length; i++) {
    const ix = data.indice[i];
    let score = -1;
    let hit = '';

    if (ix.nome.includes(q)) score = 0;
    else if (ix.esp.includes(q)) score = 1;
    else {
      const tussIdx = ix.codigos.findIndex((c) => c.includes(q));
      if (tussIdx >= 0) {
        score = 2;
        hit = 'código ' + data.procs[i].tuss[tussIdx].codigo;
      } else {
        const c = ix.cids.find((x) => x.busca.includes(q));
        if (c) {
          score = 3;
          hit = 'CID ' + c.codigo + ' — ' + (data.cid[c.codigo] || '');
        }
      }
    }

    if (score >= 0) achados.push({ proc: data.procs[i], score, hit });
  }

  return achados.sort((a, b) => a.score - b.score).slice(0, limite);
}
