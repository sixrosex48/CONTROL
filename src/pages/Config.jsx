import { useState } from 'react';
import { useData } from '../context/DataContext';
import { saveVehicle, saveWearParts, saveFixedCost, deleteFixedCost } from '../lib/api';

// Piezas de desgaste (catalogo cerrado de la base de datos)
const PARTS = [
  { type: 'tires', label: 'Llantas (juego completo)', price: '380000', life: '15000' },
  { type: 'chain_kit', label: 'Kit de arrastre', price: '180000', life: '18000' },
  { type: 'oil', label: 'Aceite y filtro', price: '40000', life: '2500' },
  { type: 'brake_pads', label: 'Pastillas', price: '90000', life: '10000' },
  { type: 'battery', label: 'Batería', price: '120000', life: '30000' },
];

const FIXED = [
  { type: 'soat', label: 'SOAT', freq: 'annual', ph: '330000' },
  { type: 'technical_inspection', label: 'Tecnomecánica', freq: 'annual', ph: '240000' },
  { type: 'vehicle_tax', label: 'Impuesto vehicular', freq: 'annual', ph: '120000' },
  { type: 'insurance', label: 'Seguro', freq: 'annual', ph: '' },
  { type: 'parking', label: 'Parqueadero', freq: 'monthly', ph: '' },
];

const str = (v) => (v === null || v === undefined ? '' : String(v));
const toNum = (s) => (s === '' || s === null || s === undefined ? NaN : Number(s));

function initialForm(data) {
  const v = data?.vehicle;
  return {
    odometer: str(v?.initial_odometer),
    gallonPrice: str(v?.fuel_gallon_price),
    efficiency: str(v?.fuel_efficiency_km_gallon),
    kmPerDay: str(v?.usual_km_per_day),
    daysPerWeek: str(v?.usual_days_per_week),
    work: Boolean(v?.work_mode_enabled),
    maxPct: str(v?.max_expense_percentage) || '50',
    parts: Object.fromEntries(
      PARTS.map((p) => {
        const ex = data?.wearParts?.find((w) => w.part_type === p.type);
        return [p.type, { price: str(ex?.price), life: str(ex?.estimated_life_km), installed: str(ex?.installed_odometer) }];
      })
    ),
    fixed: Object.fromEntries(
      FIXED.map((f) => {
        const ex = data?.fixedCosts?.find((c) => c.cost_type === f.type);
        return [f.type, { amount: str(ex?.amount), freq: ex?.frequency ?? f.freq }];
      })
    ),
  };
}

function Num({ label, value, onChange, placeholder, step = '1' }) {
  return (
    <label className="field">
      {label}
      <input type="number" inputMode="decimal" min="0" step={step} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export default function Config({ onNavigate }) {
  const { data, refresh } = useData();
  const wasSetup = !data;
  const [f, setF] = useState(() => initialForm(data));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const set = (key) => (value) => setF((s) => ({ ...s, [key]: value }));
  const setPart = (type, key) => (value) => setF((s) => ({ ...s, parts: { ...s.parts, [type]: { ...s.parts[type], [key]: value } } }));
  const setFixed = (type, key) => (value) => setF((s) => ({ ...s, fixed: { ...s.fixed, [type]: { ...s.fixed[type], [key]: value } } }));

  function validate() {
    if (!(toNum(f.odometer) >= 0)) return 'Escribe el kilometraje actual de tu moto.';
    if (!(toNum(f.gallonPrice) > 0)) return 'Escribe el precio del galón.';
    if (!(toNum(f.efficiency) > 0)) return 'Escribe cuántos km rinde tu moto por galón.';
    if (!(toNum(f.kmPerDay) > 0)) return 'Escribe cuántos km haces en un día normal.';
    const d = toNum(f.daysPerWeek);
    if (!(d > 0 && d <= 7)) return 'Los días de uso por semana deben estar entre 1 y 7.';
    if (f.work) {
      const p = toNum(f.maxPct);
      if (!(p > 0 && p <= 100)) return 'El gasto máximo aceptado debe estar entre 1 y 100 %.';
    }
    for (const p of PARTS) {
      const { price, life } = f.parts[p.type];
      if (price === '' && life === '') continue;
      if (!(toNum(price) > 0) || !(toNum(life) > 0)) return `Completa el precio y la duración de: ${p.label}.`;
    }
    for (const x of FIXED) {
      const a = f.fixed[x.type].amount;
      if (a !== '' && !(toNum(a) > 0)) return `Revisa el valor de: ${x.label}.`;
    }
    return '';
  }

  async function submit(e) {
    e.preventDefault();
    setInfo('');
    const problem = validate();
    if (problem) return setError(problem);
    setError('');
    setBusy(true);
    try {
      const vehicle = await saveVehicle({
        initial_odometer: Math.round(toNum(f.odometer)),
        fuel_gallon_price: toNum(f.gallonPrice),
        fuel_efficiency_km_gallon: toNum(f.efficiency),
        usual_km_per_day: toNum(f.kmPerDay),
        usual_days_per_week: toNum(f.daysPerWeek),
        work_mode_enabled: f.work,
        max_expense_percentage: f.work ? toNum(f.maxPct) : null,
      });

      const partRows = PARTS.filter((p) => f.parts[p.type].price !== '').map((p) => {
        const x = f.parts[p.type];
        return {
          part_type: p.type,
          price: toNum(x.price),
          estimated_life_km: Math.round(toNum(x.life)),
          installed_odometer: x.installed === '' ? null : Math.round(toNum(x.installed)),
        };
      });
      if (partRows.length) await saveWearParts(vehicle, partRows);

      for (const x of FIXED) {
        const { amount, freq } = f.fixed[x.type];
        const existing = data?.fixedCosts?.find((c) => c.cost_type === x.type);
        if (amount === '') {
          if (existing) await deleteFixedCost(existing.id);
        } else {
          await saveFixedCost(vehicle, { id: existing?.id, cost_type: x.type, amount: toNum(amount), frequency: freq });
        }
      }

      await refresh();
      if (wasSetup) onNavigate('resumen');
      else setInfo('Cambios guardados.');
    } catch (err) {
      setError('No pudimos guardar. Revisa los datos e intenta de nuevo.');
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="page-head">
        <div className="mic">Tu moto</div>
        <h1 className="h1">{wasSetup ? 'Configura tu moto' : 'Configuración'}</h1>
        <p className="muted">Datos de una sola vez. Se afinan solos con tus registros reales.</p>
      </div>

      <div className="cols">
        <div className="stack">
          <section className="card">
            <div className="mic">Kilometraje y uso</div>
            <Num label="Kilometraje actual (km)" value={f.odometer} onChange={set('odometer')} placeholder="32000" />
            <div className="row">
              <Num label="Km por día" value={f.kmPerDay} onChange={set('kmPerDay')} placeholder="20" />
              <Num label="Días de uso por semana" value={f.daysPerWeek} onChange={set('daysPerWeek')} placeholder="7" step="0.5" />
            </div>
          </section>

          <section className="card">
            <div className="mic">Gasolina</div>
            <div className="row">
              <Num label="Precio del galón ($)" value={f.gallonPrice} onChange={set('gallonPrice')} placeholder="17500" />
              <Num label="Rendimiento (km por galón)" value={f.efficiency} onChange={set('efficiency')} placeholder="120" />
            </div>
          </section>

          <section className="card">
            <div className="mic">Modo trabajo</div>
            <label className="check">
              Trabajo con mi moto
              <input type="checkbox" checked={f.work} onChange={(e) => set('work')(e.target.checked)} />
            </label>
            {f.work && <Num label="Gasto máximo aceptado (% del ingreso)" value={f.maxPct} onChange={set('maxPct')} placeholder="50" />}
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="mic">Piezas de desgaste</div>
            <p className="muted">Precio de la pieza y cuántos km dura. Deja en blanco las que no uses. El kilometraje de instalación es opcional y ayuda a calcular la duración real.</p>
            {PARTS.map((p) => (
              <div key={p.type} className="part-row">
                <div className="row-label">{p.label}</div>
                <Num label="Precio ($)" value={f.parts[p.type].price} onChange={setPart(p.type, 'price')} placeholder={p.price} />
                <Num label="Dura (km)" value={f.parts[p.type].life} onChange={setPart(p.type, 'life')} placeholder={p.life} />
                <Num label="Instalada en (km)" value={f.parts[p.type].installed} onChange={setPart(p.type, 'installed')} placeholder="opcional" />
              </div>
            ))}
          </section>

          <section className="card">
            <div className="mic">Costos fijos</div>
            {FIXED.map((x) => (
              <div key={x.type} className="fixed-row">
                <div className="row-label">{x.label}</div>
                <Num label="Valor ($)" value={f.fixed[x.type].amount} onChange={setFixed(x.type, 'amount')} placeholder={x.ph || 'opcional'} />
                <label className="field">
                  Frecuencia
                  <select value={f.fixed[x.type].freq} onChange={(e) => setFixed(x.type, 'freq')(e.target.value)}>
                    <option value="annual">al año</option>
                    <option value="monthly">al mes</option>
                    <option value="weekly">a la semana</option>
                  </select>
                </label>
              </div>
            ))}
          </section>
        </div>
      </div>

      {error && <div className="msg-error">{error}</div>}
      {info && <div className="msg-info">{info}</div>}
      <div>
        <button className="btn" disabled={busy}>
          {busy ? 'Guardando…' : wasSetup ? 'Guardar y ver mi costo por km' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
