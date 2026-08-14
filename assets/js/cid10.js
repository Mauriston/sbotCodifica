/* Descrições abreviadas do CID-10, buscadas do catálogo público mantido em
   github.com/Mauriston/cid10 — fonte de verdade única para a forma
   abreviada usada na solicitação (ex.: "S42.3 Frat da diafise do umero").
   O arquivo é grande (~14 mil CIDs); é buscado uma única vez e cacheado
   em memória pelo resto da sessão. */

const CID10_URL = 'https://raw.githubusercontent.com/Mauriston/cid10/refs/heads/main/cid10.json';

let cache = null;
let emAndamento = null;

/** Devolve um Map código → descrição abreviada (ex.: "S423" → "S42.3 Frat da diafise do umero"). */
export function carregarCid10Abreviado() {
  if (cache) return Promise.resolve(cache);
  if (emAndamento) return emAndamento;

  emAndamento = fetch(CID10_URL)
    .then((res) => {
      if (!res.ok) throw new Error('Falha ao carregar CID-10 (' + res.status + ')');
      return res.json();
    })
    .then((json) => {
      const mapa = new Map();
      for (const row of json.rows || []) {
        if (row.codigo && row.descricao_abreviada) {
          mapa.set(row.codigo, row.descricao_abreviada.replace(/\s+/g, ' ').trim());
        }
      }
      cache = mapa;
      return mapa;
    })
    .finally(() => {
      emAndamento = null;
    });

  return emAndamento;
}
