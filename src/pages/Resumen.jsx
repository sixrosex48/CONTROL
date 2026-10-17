import { useData } from '../context/DataContext';
import { money, kmText } from '../lib/format';

const PART_LABELS = {
    tires: 'Llantas',
    chain_kit: 'Kit de arrastre',
    oil: 'Aceite y filtro',
    brake_pads: 'Pastillas',
    battery: 'Batería',
};

function Row({ k, v, hi }) {
    return (
        <div className="kv">
            <span>{k}</span>
            <span className={hi ? 'hi' : ''}>{v}</span>
        </div>
    );
}

function Layer({ name, value, total }) {
    const w = total > 0 ? Math.min(100, (value / total) * 100) : 0;
    return (
        <div className="layer">
            <div className="kv flat">
                <span>{name}</span>
                <span>{money(value)} /km</span>
            </div>
            <div className="bar"><div style={{ width: `${w}%` }} /></div>
        </div>
    );
}

export default function Resumen() {
    const { metrics: m } = useData();
    if (!m) return null;
    const estimated = m.status === 'estimated';
    const w = m.currentWeek;

    return (
        <div className="stack">
            <div className="page-head">
                <div className="mic">Esta semana</div>
                <h1 className="h1">Tu resumen</h1>
            </div>

            <div className="cols">
                <section className="card">
                    <div className="mic">Costo por km</div>
                    <div className="big">{money(m.costPerKm)}<small> /km</small></div>
                    <span className="chip">{estimated ? 'Estimado' : 'Real'}</span>
                    <p className="muted">
                        {estimated
                            ? 'Se vuelve «Real» cuando cierres tu primera semana con el kilometraje del domingo.'
                            : 'Calculado con tus últimas semanas cerradas.'}
                    </p>
                    <Layer name="Gasolina" value={m.perKm.gasoline} total={m.perKm.total} />
                    <Layer name="Desgaste e imprevistos" value={m.perKm.wear} total={m.perKm.total} />
                    <Layer name="Fijos" value={m.perKm.fixed} total={m.perKm.total} />
                    <Row k="100 km te cuestan" v={money(m.costPerKm * 100)} hi />
                </section>

                <div className="stack">
                    <section className="card">
                        <div className="mic">Gasto bruto vs. operacional</div>
                        {w ? (
                            <>
                                <Row k="Gasto bruto (lo que pagaste)" v={money(w.gross)} />
                                <Row
                                    k={w.status === 'estimated' ? 'Gasto operacional estimado de la semana' : 'Gasto operacional (lo que te costó)'}
                                    v={money(w.operating.total)}
                                    hi
                                />
                                {w.status === 'estimated' && (
                                    <p className="muted">Es una estimación con tus km habituales. Se vuelve real al cerrar la semana con el kilometraje del domingo.</p>
                                )}
                                <p className="muted">No se suman: el bruto cuenta cuando pagas; el operacional, cuando la moto se consume.</p>
                            </>
                        ) : (
                            <p className="muted">Aún no has iniciado una semana. Hazlo en «Registrar» para ver tus gastos.</p>
                        )}
                    </section>

                    <section className="card">
                        <div className="mic">De dónde sale</div>
                        <Row k="Rendimiento" v={`${Math.round(m.fuel.efficiency)} km/galón · ${m.fuel.efficiencySource === 'real' ? 'real' : 'estimado'}`} />
                        <Row k="Precio del galón" v={money(m.fuel.pricePerGallon)} />
                        <Row k="Fijos por semana" v={money(m.fixed.perWeek)} />
                        {m.wear.items.map((p) => (
                            <Row
                                key={p.id}
                                k={PART_LABELS[p.partType] ?? p.partType}
                                v={`${money(p.perKm)} /km · dura ${kmText(p.lifeKm)} · ${p.source === 'real' ? 'real' : 'estimada'}`}
                            />
                        ))}
                    </section>
                </div>
            </div>
        </div>
    );
}