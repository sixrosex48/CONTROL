import { useState } from 'react';
import { useData } from '../context/DataContext';
import { deleteExpense, deleteWorkSession, updateWorkSession } from '../lib/api';
import { computeSavedWorkSession } from '../lib/calculations';
import { money, kmText, percent } from '../lib/format';
import { CATS, CAT_LABEL, PART_LABELS, FIXED_LABELS, ExpenseForm } from './Registrar';

const fmt = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const PAGE = 30;

function WorkEditForm({ session, refresh, onDone, onCancel }) {
    const [date, setDate] = useState(session.session_date);
    const [start, setStart] = useState(String(session.odometer_start));
    const [end, setEnd] = useState(String(session.odometer_end));
    const [income, setIncome] = useState(String(session.income));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function submit(e) {
        e.preventDefault();
        if (start === '' || end === '' || !(Number(end) > Number(start))) {
            return setError('El kilometraje final debe ser mayor al inicial.');
        }
        if (income === '' || !(Number(income) >= 0)) return setError('Escribe el ingreso.');
        setError('');
        setBusy(true);
        try {
            await updateWorkSession(session.id, {
                session_date: date,
                odometer_start: Math.round(Number(start)),
                odometer_end: Math.round(Number(end)),
                income: Math.round(Number(income)),
            });
            await refresh();
            onDone('Jornada actualizada.');
        } catch (err) {
            console.error(err);
            setError('No pudimos guardar. Intenta de nuevo.');
            setBusy(false);
        }
    }

    return (
        <form className="card" onSubmit={submit}>
            <div className="mic">Editar jornada</div>
            <label className="field">Fecha<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <div className="row">
                <label className="field">Kilometraje inicial (km)<input type="number" min="0" value={start} onChange={(e) => setStart(e.target.value)} /></label>
                <label className="field">Kilometraje final (km)<input type="number" min="0" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
            </div>
            <label className="field">Ingreso ($)<input type="number" min="0" value={income} onChange={(e) => setIncome(e.target.value)} /></label>
            {error && <div className="msg-error">{error}</div>}
            <div className="row" style={{ gap: 10 }}>
                <button className="btn" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
                <button type="button" className="btn btn-quiet" onClick={onCancel}>Cancelar</button>
            </div>
        </form>
    );
}

export default function Historial() {
    const { data, refresh } = useData();
    const [filter, setFilter] = useState('all');
    const [limit, setLimit] = useState(PAGE);
    const [editing, setEditing] = useState(null);
    const [notice, setNotice] = useState('');
    const [editingSession, setEditingSession] = useState(null);
    if (!data) return null;

    const { vehicle, expenses, wearParts, fixedCosts, workSessions } = data;
    const maxPct = Number(vehicle.max_expense_percentage ?? 50);
    const list = expenses.filter((e) => filter === 'all' || e.category === filter);
    const total = list.reduce((a, e) => a + Number(e.amount), 0);

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

    async function removeExpense(e) {
        if (!window.confirm('¿Eliminar este gasto?')) return;
        try {
            await deleteExpense(e.id);
            await refresh();
        } catch (err) {
            console.error(err);
            alert('No pudimos eliminarlo. Intenta de nuevo.');
        }
    }

    async function removeSession(s) {
        if (!window.confirm('¿Eliminar esta jornada?')) return;
        try {
            await deleteWorkSession(s.id);
            await refresh();
        } catch (err) {
            console.error(err);
            alert('No pudimos eliminarla. Intenta de nuevo.');
        }
    }

    return (
        <div className="stack">
            <div className="page-head">
                <div className="mic">Todos tus registros</div>
                <h1 className="h1">Historial</h1>
            </div>

            {notice && <div className="msg-info">{notice}</div>}
            {editing && (
                <ExpenseForm
                    key={editing.id}
                    data={data}
                    refresh={refresh}
                    editing={editing}
                    onDone={(msg) => { setEditing(null); setNotice(msg); }}
                    onCancel={() => setEditing(null)}
                />
            )}

            {editingSession && (
                <WorkEditForm
                    key={editingSession.id}
                    session={editingSession}
                    refresh={refresh}
                    onDone={(msg) => { setEditingSession(null); setNotice(msg); }}
                    onCancel={() => setEditingSession(null)}
                />
            )}

            <div className="pills">
                {[{ id: 'all', label: 'Todos' }, ...CATS].map((c) => (
                    <button key={c.id} className={`pill${filter === c.id ? ' on' : ''}`} onClick={() => { setFilter(c.id); setLimit(PAGE); }}>
                        {c.label}
                    </button>
                ))}
            </div>

            <section className="card">
                <div className="mic">Gastos</div>
                {list.length === 0 && <p className="muted">No hay gastos para mostrar.</p>}
                {list.slice(0, limit).map((e) => (
                    <div className="kv" key={e.id}>
                        <span>
                            {fmt(e.expense_date)} · {label(e)}
                            {e.odometer !== null && e.odometer !== undefined ? ` · ${kmText(e.odometer)}` : ''}
                        </span>
                        <span className="actions">
                            <span>{money(e.amount)}</span>
                            <button className="link" onClick={() => { setNotice(''); setEditing(e); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar</button>
                            <button className="link danger" onClick={() => removeExpense(e)}>Eliminar</button>
                        </span>
                    </div>
                ))}
                {list.length > limit && (
                    <div><button className="btn btn-quiet" onClick={() => setLimit((n) => n + PAGE)}>Ver más</button></div>
                )}
                {list.length > 0 && (
                    <div className="kv"><span>Total mostrado (gasto bruto)</span><span className="hi">{money(total)}</span></div>
                )}
            </section>

            {vehicle.work_mode_enabled && (
                <section className="card">
                    <div className="mic">Jornadas de trabajo</div>
                    {workSessions.length === 0 && <p className="muted">Aún no has registrado jornadas.</p>}
                    {workSessions.map((s) => {
                        const r = computeSavedWorkSession(s, maxPct);
                        return (
                            <div className="kv" key={s.id}>
                                <span className="actions">
                                    <span>{money(r.netProfit)}</span>
                                    <button className="link" onClick={() => { setNotice(''); setEditingSession(s); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Editar</button>
                                    <button className="link danger" onClick={() => removeSession(s)}>Eliminar</button>
                                </span>
                            </div>
                        );
                    })}
                </section>
            )}
        </div>
    );
}