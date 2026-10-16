// Formatos para mostrar numeros en la interfaz (Colombia).
const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const plain = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

const bad = (n) => n === null || n === undefined || Number.isNaN(Number(n)) || !Number.isFinite(Number(n));

export const money = (n) => (bad(n) ? '—' : cop.format(Math.round(Number(n))));
export const kmText = (n) => (bad(n) ? '—' : `${plain.format(Math.round(Number(n)))} km`);
export const percent = (n) => (bad(n) ? '—' : `${dec1.format(Number(n))} %`);

// Fecha de hoy en hora local como 'YYYY-MM-DD' (no UTC, para no adelantar el dia).
export const todayStr = () => new Date().toLocaleDateString('en-CA');
