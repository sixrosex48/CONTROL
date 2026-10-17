import { useState } from 'react';
import { useData } from '../context/DataContext';
import { addExpense, updateExpense, deleteExpense, startWeek, closeWeek } from '../lib/api';
import { mondayOf } from '../lib/calculations';
import { money, kmText, todayStr } from '../lib/format';

export const CATS = [
    { id: 'gasoline', label: 'Gasolina' },
    { id: 'wear_part', label: 'Pieza' },
    { id: 'fixed_cost', label: 'Fijo' },
    { id: 'unexpected', label: 'Imprevisto' },
    { id: 'other', label: 'Otro' },
];
export const CAT_LABEL = Object.fromEntries(CATS.map((c) => [c.id, c.label]));
export const PART_LABELS = { tires: 'Llantas', chain_kit: 'Kit de arrastre', oil: 'Aceite y filtro', brake_pads: 'Pastillas', battery: 'Batería' };
export const FIXED_LABELS = { soat: 'SOAT', technical_inspection: 'Tecnomecánica', vehicle_tax: 'Impuesto vehicular', insurance: 'Seguro', parking: 'Parqueadero', other: 'Otro' };

const str = (v) => (v === null || v === undefined ? '' : String(v));
const toNum = (s) => (s === '' || s === null || s === undefined ? NaN : Number(s));
const fmt = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/* ---------- Semana: iniciar y cerrar ---------- */
function WeekCard({ data, refresh }) {
    const { vehicle, weeks } = data;
    const monday = mondayOf(todayStr());
    const open = weeks.find((w) => w.odometer_end === null || w.odometer_end === undefined);
    const thisWeek = weeks.find((w) => w.week_start === monday);
    const lastClosed = weeks
        .filter((w) => w.odometer_end !== null && w.odometer_end !== undefined)
        .sort((a, b) => (a.week_start < b.week_start ? 1 : -1))[0];

    const [km, setKm] = useState(open ? '' : str(lastClosed?.odometer_end ?? vehicle.initial_odometer));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function run(fn) {
        setError('');
        setBusy(true);
        try {
            await fn();
            setKm('');
            await refresh();
        } catch (e) {
            console.error(e);
            setError('No pudimos guardar. Intenta de nuevo.');
        } finally {
            setBusy(false);
        }
    }

    function start(e) {
        e.preventDefault();
        const v = toNum(km);
        if (!(v >= 0)) return setError('Escribe el kilometraje actual.');
        run(() => startWeek(vehicle, monday, Math.round(v)));
    }

    function close(e) {
        e.preventDefault();
        const v = toNum(km);
        if (!(v >= open.odometer_start)) return setError(`El kilometraje debe ser mayor o igual a ${open.odometer_start}.`);
        run(() => closeWeek(open.id, Math.round(v)));
    }

    if (open) {
        return (
            <form className="card" onSubmit={close}>
                <div className="mic">Cierre de semana</div>
                <div className="kv"><span>Semana del</span><span>{fmt(open.week_start)}</span></div>
                <div className="kv"><span>Kilometraje del lunes</span><span>{kmText(open.odometer_start)}</span></div>
                {open.week_start < monday && (
                    <p className="msg-info">Esta semana quedó sin cerrar. Ciérrala con el kilometraje con el que terminó ese domingo; después podrás iniciar la actual.</p>
                )}
                <label className="field">
                    Kilometraje de cierre (km)
                    <input type="number" min="0" value={km} onChange={(e) => setKm(e.target.value)} />
                </label>
                {error && <div className="msg-error">{error}</div>}
                <div><button className="btn btn-ghost" disabled={busy}>Cerrar semana</button></div>
            </form>
        );
    }

    if (thisWeek) {
        return (
            <section className="card">
                <div className="mic">Semana cerrada</div>
                <div className="kv"><span>Recorriste</span><span>{kmText(thisWeek.odometer_end - thisWeek.odometer_start)}</span></div>
                <p className="muted">Podrás iniciar la siguiente el próximo lunes.</p>
            </section>
        );
    }

    return (
        <form className="card" onSubmit={start}>
            <div className="mic">Iniciar semana</div>
            <p className="muted">Anota el kilometraje de tu moto hoy. El domingo lo cierras con el kilometraje final.</p>
            <label className="field">
                Kilometraje actual (km)
                <input type="number" min="0" value={km} onChange={(e) => setKm(e.target.value)} />
            </label>
            {error && <div className="msg-error">{error}</div>}
            <div><button className="btn" disabled={busy}>Iniciar semana</button></div>
        </form>
    );
}

/* ---------- Formulario de gasto (nuevo o editando) ---------- */
export function ExpenseForm({ data, refresh, editing, onDone, onCancel }) {
    const { vehicle, wearParts, fixedCosts } = data;
    const [cat, setCat] = useState(editing?.category ?? 'gasoline');
    const [amount, setAmount] = useState(str(editing?.amount));
    const [date, setDate] = useState(editing?.expense_date ?? todayStr());
    const [km, setKm] = useState(str(editing?.odometer));
    const [gallons, setGallons] = useState(str(editing?.gallons));
    const [partId, setPartId] = useState(editing?.wear_part_id ?? wearParts[0]?.id ?? '');
    const [fixedId, setFixedId] = useState(editing?.fixed_cost_id ?? fixedCosts[0]?.id ?? '');
    const [note, setNote] = useState(editing?.description ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function submit(e) {
        e.preventDefault();
        if (!(toNum(amount) > 0)) return setError('Escribe el monto pagado.');
        if ((cat === 'gasoline' || cat === 'wear_part') && !(toNum(km) >= 0)) return setError('Escribe el kilometraje en que lo hiciste.');
        if (cat === 'gasoline' && gallons !== '' && !(toNum(gallons) > 0)) return setError('Revisa los galones.');
        if (cat === 'wear_part' && !partId) return setError('Primero agrega esa pieza en Configuración.');
        if (cat === 'fixed_cost' && !fixedId) return setError('Primero agrega ese costo fijo en Configuración.');

        const base = {
            expense_date: date,
            amount: Math.round(toNum(amount)),
            odometer: km === '' ? null : Math.round(toNum(km)),
            gallons: cat === 'gasoline' && gallons !== '' ? toNum(gallons) : null,
            description: note.trim() || null,
        };
        setError('');
        setBusy(true);
        try {
            if (editing) await updateExpense(editing.id, base);
            else {
                await addExpense(vehicle, {
                    ...base,
                    category: cat,
                    wear_part_id: cat === 'wear_part' ? partId : null,
                    fixed_cost_id: cat === 'fixed_cost' ? fixedId : null,
                });
            }
            await refresh();
            onDone(editing ? 'Gasto actualizado.' : 'Gasto guardado.');
        } catch (err) {
            console.error(err);
            setError('No pudimos guardar. Revisa los datos e intenta de nuevo.');
            setBusy(false);
        }
    }

    return (
        <form className="card" onSubmit={submit}>
            <div className="mic">{editing ? 'Editar gasto' : 'Nuevo gasto'}</div>
            <div className="pills">
                {CATS.map((c) => (
                    <button type="button" key={c.id} disabled={Boolean(editing)} className={`pill${cat === c.id ? ' on' : ''}`} onClick={() => setCat(c.id)}>
                        {c.label}
                    </button>
                ))}
            </div>

            {cat === 'wear_part' && (
                <label className="field">
                    Pieza
                    <select value={partId} onChange={(e) => setPartId(e.target.value)} disabled={Boolean(editing)}>
                        {wearParts.length === 0 && <option value="">Sin piezas configuradas</option>}
                        {wearParts.map((p) => <option key={p.id} value={p.id}>{PART_LABELS[p.part_type] ?? p.part_type}</option>)}
                    </select>
                </label>
            )}
            {cat === 'fixed_cost' && (
                <label className="field">
                    Costo fijo
                    <select value={fixedId} onChange={(e) => setFixedId(e.target.value)} disabled={Boolean(editing)}>
                        {fixedCosts.length === 0 && <option value="">Sin costos fijos configurados</option>}
                        {fixedCosts.map((c) => <option key={c.id} value={c.id}>{FIXED_LABELS[c.cost_type] ?? c.cost_type}</option>)}
                    </select>
                </label>
            )}

            <div className="row">
                <label className="field">Monto ($)<input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
                <label className="field">Fecha<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            </div>
            <div className="row">
                <label className="field">
                    Kilometraje (km){cat === 'gasoline' || cat === 'wear_part' ? '' : ' · opcional'}
                    <input type="number" min="0" value={km} onChange={(e) => setKm(e.target.value)} />
                </label>
                {cat === 'gasoline' && (
                    <label className="field">Galones · recomendado<input type="number" min="0" step="0.01" value={gallons} onChange={(e) => setGallons(e.target.value)} /></label>
                )}
            </div>
            <label className="field">Nota · opcional<input value={note} onChange={(e) => setNote(e.target.value)} /></label>

            {cat === 'gasoline' && <p className="muted">Con galones y kilometraje en cada tanqueo, la app calcula tu rendimiento real.</p>}
            {cat === 'wear_part' && !editing && <p className="muted">El monto pasará a ser el nuevo precio de la pieza y se guarda el cambio con su kilometraje.</p>}

            {error && <div className="msg-error">{error}</div>}
            <div className="row" style={{ gap: 10 }}>
                <button className="btn" disabled={busy}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar gasto'}</button>
                {editing && <button type="button" className="btn btn-quiet" onClick={onCancel}>Cancelar</button>}
            </div>
        </form>
    );
}

/* ---------- Últimos gastos ---------- */
function Recent({ data, refresh, onEdit }) {
    const { expenses, wearParts, fixedCosts } = data;

    const label = (e) => {
        if (e.category === 'wear_part') {
            const p = wearParts.find((x) => x.id === e.wear_part_id);
            return `Pieza · ${PART_LABELS[p?.part_type] ?? ''}`;
        }
        if (e.category === 'fixed_cost') {
            const c = fixedCosts.find((x) => x.id === e.fixed_cost_id);
            return `Fijo · ${FIXED_LABELS[c?.cost_type] ?? ''}`;
        }
        return CAT_LABEL[e.category];
    };

    async function remove(e) {
        if (!window.confirm('¿Eliminar este gasto?')) return;
        try {
            await deleteExpense(e.id);
            await refresh();
        } catch (err) {
            console.error(err);
            alert('No pudimos eliminarlo. Intenta de nuevo.');
        }
    }

    return (
        <section className="card">
            <div className="mic">Últimos gastos</div>
            {expenses.length === 0 && <p className="muted">Aún no has registrado gastos.</p>}
            {expenses.slice(0, 10).map((e) => (
                <div className="kv" key={e.id}>
                    <span>{fmt(e.expense_date)} · {label(e)}</span>
                    <span className="actions">
                        <span>{money(e.amount)}</span>
                        <button className="link" onClick={() => onEdit(e)}>Editar</button>
                        <button className="link danger" onClick={() => remove(e)}>Eliminar</button>
                    </span>
                </div>
            ))}
        </section>
    );
}

/* ---------- Pantalla ---------- */
export default function Registrar() {
    const { data, refresh } = useData();
    const [editing, setEditing] = useState(null);
    const [formKey, setFormKey] = useState(0);
    const [notice, setNotice] = useState('');
    if (!data) return null;

    const done = (msg) => {
        setEditing(null);
        setFormKey((k) => k + 1);
        setNotice(msg);
    };

    return (
        <div className="stack">
            <div className="page-head">
                <div className="mic">Semana actual</div>
                <h1 className="h1">Registrar</h1>
                <p className="muted">Anota tus gastos y cierra la semana con el kilometraje del domingo.</p>
            </div>
            {notice && <div className="msg-info">{notice}</div>}
            <div className="cols">
                <ExpenseForm
                    key={`${formKey}-${editing?.id ?? 'new'}`}
                    data={data}
                    refresh={refresh}
                    editing={editing}
                    onDone={done}
                    onCancel={() => { setEditing(null); setNotice(''); }}
                />
                <div className="stack">
                    <WeekCard data={data} refresh={refresh} />
                    <Recent data={data} refresh={refresh} onEdit={(e) => { setNotice(''); setEditing(e); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                </div>
            </div>
        </div>
    );
}