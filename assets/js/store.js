/* Estado persistido no aparelho (localStorage).
   Guarda a solicitação em montagem, favoritos, histórico e preferências —
   nada sai do dispositivo. */

const CHAVE = 'sbot-codifica:v1';

const PADRAO = {
  cesta: [],          // [{ key, procId, codigo, porte, via: 'mesma'|'outra' }]
  favs: [],           // [procId]
  hist: [],           // [procId] — mais recente primeiro, até 8
  ano: null,          // ano da tabela CBHPM escolhido
  urgencia: false,    // porte +30%
  apartamento: false, // porte ×2
  semReducao: false,  // desliga a regra de via de acesso
  exportModo: 'completa',
  salvosTab: 'fav'
};

function ler() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return { ...PADRAO };
    const salvo = JSON.parse(bruto);
    return { ...PADRAO, ...(salvo && typeof salvo === 'object' ? salvo : {}) };
  } catch {
    return { ...PADRAO };
  }
}

export const persistido = ler();

/** Grava o subconjunto persistente do estado. Falhas (modo privado, cota) são ignoradas. */
export function salvar(state) {
  try {
    const dados = {};
    for (const k of Object.keys(PADRAO)) dados[k] = state[k];
    localStorage.setItem(CHAVE, JSON.stringify(dados));
  } catch {
    /* sem persistência disponível — o app segue funcionando na sessão */
  }
}

export function limparTudo() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* ignora */
  }
}
