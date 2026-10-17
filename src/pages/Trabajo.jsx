import { useEffect, useState } from 'react';
import { useData } from '../context/DataContext';
import { addWorkSession, deleteWorkSession, startActiveWorkSession, cancelActiveWorkSession } from '../lib/api';
import { computeWorkSession, computeSavedWorkSession } from '../lib/calculations';
import { money, kmText, percent, todayStr } from '../lib/format';

const KEY_DRAFT = 'control.jornada.borrador';
const readDraft = () => {
    try { return JSON.parse(localStorage.getItem(KEY_DRAFT)) ?? {}; } catch { return {}; }
};
const toNum = (s) => (s === '' || s === null || s === undefined ? NaN : Number(s));
const fmt = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const fmtFull = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

const ALERTS = {
    good: 'Buen margen',
    tight: 'Margen ajustado',
    too_cheap: 'Estás cobrando muy barato: tu costo por km se acerca a tu ingreso por km.',
    loss: 'Estás perdiendo dinero en esta jornada.',
};

function Row({ k, v, hi }) {
    return (
        <div className="kv">
            <span>{k}</span>
            <span className={hi ? 'hi' : ''}>{v}</span>
        </div>
    );
}

function Result({ title, r }) {
    return (
        <section className="card">
            <div className="mic">{title}</div>
            <Row k="Costo de la jornada" v={money(r.cost)} />
            <Row k="Ganancia en bolsillo" v={money(r.pocketProfit)} />
            <Row k="Ganancia real" v={money(r.netProfit)} hi />
            <Row k="Apartar para repuestos y fijos" v={money(r.setAside)} />
            <Row k="Margen" v={percent(r.margin)} />
            <Row k="Cobraste por km" v={money(r.incomePerKm)} />
            <Row k="Mínimo a cobrar por km" v={money(r.minPerKm)} />
            <span className="chip">{ALERTS[r.alert].split(':')[0]}</span>
            {r.alert !== 'good' && r.alert !== 'tight' ? <p className="msg-error">{ALERTS[r.alert]}</p> : null}
        </section>
    );
}

export default function Trabajo() {
    const { data, metrics, refresh } = useData();
    const [startInput, setStartInput] = useState(() => {
        const ks = [data?.vehicle?.initial_odometer ?? 0];
        data?.weeks?.forEach((w) => ks.push(w.odometer_end ?? w.odometer_start));
        data?.workSessions?.forEach((s) => ks.push(s.odometer_end));
        return String(Math.max(...ks.map(Number)));
    });
    const [endInput, setEndInput] = useState(() => readDraft().end ?? '');
    const [income, setIncome] = useState(() => readDraft().income ?? '');
    const [done, setDone] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        try { localStorage.setItem(KEY_DRAFT, JSON.stringify({ end: endInput, income })); } catch { /* sin almacenamiento */ }
    }, [endInput, income]);

    if (!data || !metrics) return null;
    const { vehicle, workSessions, activeSession } = data;
    if (!vehicle.work_mode_enabled) {
        return <p className="muted">Activa «Trabajo con mi moto» en Configuración para usar esta pantalla.</p>;
    }
    const maxPct = Number(vehicle.max_expense_percentage ?? 50);
    const active = Boolean(activeSession);
    const start = active ? Number(activeSession.odometer_start) : null;

    const kmEnd = toNum(endInput);
    const inc = toNum(income);
    const live =
        active && kmEnd > start && inc >= 0
            ? computeWorkSession({ odometer_start: start, odometer_end: kmEnd, income: inc }, metrics, maxPct)
            : null;

    async function begin(e) {
        e.preventDefault();
        const v = toNum(startInput);
        if (!(v >= 0)) return setError('Escribe el kilometraje con el que empiezas.');
        setError('');
        setBusy(true);
        try {
            await startActiveWorkSession(vehicle, Math.round(v), todayStr());
            setDone(null);
            await refresh();
        } catch (err) {
            console.error(err);
            setError('No pudimos iniciar la jornada. Intenta de nuevo.');
        } finally {
            setBusy(false);
        }
    }

    async function cancel() {
        setBusy(true);
        try {
            await cancelActiveWorkSession(vehicle.id);
            setEndInput('');
            setIncome('');
            await refresh();
        } catch (err) {
            console.error(err);
            setError('No pudimos cancelar. Intenta de nuevo.');
        } finally {
            setBusy(false);
        }
    }

    async function finish(e) {
        e.preventDefault();
        if (!live) return setError('Escribe un kilometraje final mayor al inicial y lo que ganaste.');
        setError('');
        setBusy(true);
        try {
            await addWorkSession(vehicle, {
                session_date: activeSession.started_on,
                odometer_start: start,
                odometer_end: Math.round(kmEnd),
                income: Math.round(inc),
                cost_per_km_applied: Math.round(metrics.costPerKm * 100) / 100,
            });
            setDone(live);
            await cancelActiveWorkSession(vehicle.id);
            setEndInput('');
            setIncome('');
            await refresh();
        } catch (err) {
            console.error(err);
            setError('No pudimos guardar la jornada. Intenta de nuevo.');
        } finally {
            setBusy(false);
        }
    }

    async function remove(s) {
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
                <div className="mic">{active ? 'Jornada en curso' : 'Modo trabajo'}</div>
                <h1 className="h1">Jornada de trabajo</h1>
                <p className="muted">
                    {active
                        ? `Iniciada el ${fmtFull(activeSession.started_on)} en ${kmText(start)}. Al terminar, escribe el kilometraje final y lo que ganaste.`
                        : 'Anota el kilometraje con el que empiezas a trabajar.'}
                </p>
            </div>

            <div className="cols">
                <div className="stack">
                    {!active ? (
                        <form className="card" onSubmit={begin}>
                            <div className="mic">Iniciar jornada</div>
                            <label className="field">
                                Kilometraje actual (km)
                                <input type="number" min="0" value={startInput} onChange={(e) => setStartInput(e.target.value)} />
                            </label>
                            {error && <div className="msg-error">{error}</div>}
                            <div><button className="btn" disabled={busy}>Iniciar jornada</button></div>
                        </form>
                    ) : (
                        <form className="card" onSubmit={finish}>
                            <div className="mic">Cerrar jornada</div>
                            <label className="field">
                                Kilometraje al finalizar (km)
                                <input type="number" min="0" value={endInput} onChange={(e) => setEndInput(e.target.value)} />
                            </label>
                            <label className="field">
                                Ingreso de la jornada ($)
                                <input type="number" min="0" value={income} onChange={(e) => setIncome(e.target.value)} />
                            </label>
                            {error && <div className="msg-error">{error}</div>}
                            <div className="row" style={{ gap: 10 }}>
                                <button className="btn" disabled={busy}>{busy ? 'Guardando…' : 'Finalizar jornada'}</button>
                                <button type="button" className="btn btn-quiet" onClick={cancel} disabled={busy}>Cancelar</button>
                            </div>
                        </form>
                    )}

                    <section className="card">
                        <div className="mic">Últimas jornadas</div>
                        {workSessions.length === 0 && <p className="muted">Aún no has registrado jornadas.</p>}
                        {workSessions.slice(0, 5).map((s) => {
                            const r = computeSavedWorkSession(s, maxPct);
                            return (
                                <div className="kv" key={s.id}>
                                    <span>{fmt(s.session_date)} · {kmText(r.km)} · {money(s.income)}</span>
                                    <span className="actions">
                                        <span>{money(r.netProfit)}</span>
                                        <button className="link danger" onClick={() => remove(s)}>Eliminar</button>
                                    </span>
                                </div>
                            );
                        })}
                    </section>
                </div>

                <div className="stack">
                    {live && <Result title={`Resultado en vivo · ${kmText(live.km)}`} r={live} />}
                    {!live && done && <Result title={`Jornada guardada · ${kmText(done.km)}`} r={done} />}
                    {!live && !done && (
                        <section className="card">
                            <div className="mic">Resultado</div>
                            <p className="muted">Cuando escribas el kilometraje final y tu ingreso, aquí verás cuánto ganaste de verdad.</p>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}