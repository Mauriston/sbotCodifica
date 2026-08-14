/* Constantes de apresentação e helpers de formatação. */

/** Caráter da indicação → [cor do texto, cor de fundo] do chip. */
export const CAR = {
  'Eletiva': ['#1F6E96', '#E1EDF4'],
  'Urgência': ['#F05400', '#FDE8DC'],
  'Eletiva/Urgência': ['#146B5E', '#D8ECE8'],
  'Urgência/Emergência': ['#F05400', '#FDE8DC'],
  'Depende da condição do paciente': ['#6B7680', '#F2F2F2']
};

/** Rótulo curto do caráter, usado nas listas. */
export const CURTO = {
  'Eletiva': 'Eletiva',
  'Urgência': 'Urgência',
  'Eletiva/Urgência': 'Elet/Urg',
  'Urgência/Emergência': 'Urg/Emerg',
  'Depende da condição do paciente': 'Depende'
};

/** Sigla exibida no card de cada especialidade. */
export const SIGLAS = {
  'Coluna': 'CO',
  'Ombro e Cotovelo': 'OC',
  'Mão': 'MÃO',
  'Quadril': 'QD',
  'Joelho': 'JO',
  'Pé e Tornozelo': 'PT',
  'Trauma': 'TR',
  'Oncologia Ortopédica': 'ON',
  'Ortopedia Pediátrica': 'PED',
  'Reconstrução e Alongamento Ósseo': 'RA',
  'Atuação em Dor': 'DOR'
};

export const MANUAL_PDF = 'https://defesa.sbot.org.br/assets/file/Manual-SBOT-27-11-25.pdf';

/** Minúsculas sem acento, para busca. */
export const norm = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Número → moeda brasileira. */
export const brl = (v) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Escapa texto para interpolação segura em HTML. */
export const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const carCores = (c) => CAR[c] || CAR['Eletiva'];
export const carCurto = (c) => CURTO[c] || c;
export const sigla = (nome) => SIGLAS[nome] || nome.slice(0, 2).toUpperCase();
