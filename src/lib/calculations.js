// =====================================================================
// CONTROL - Todas las formulas viven en este archivo.
// Son funciones puras: sin React, sin Supabase, sin efectos secundarios.
// Reciben filas tal como salen de la base de datos (snake_case).
// Nota: en la base de datos los campos se llaman "odometer", pero en la
// interfaz se muestran como "kilometraje".
//
// Convenciones:
//  - installed_odometer de wear_parts = kilometraje de la instalacion ORIGINAL.
//    No se actualiza al cambiar la pieza; los cambios quedan en part_replacements.
//  - Nada de lo calculado aqui se guarda en la base de datos.
// =====================================================================

const WEEKS_PER_YEAR = 52;
const FREQ_PER_YEAR = { weekly: 52, monthly: 12, annual: 1 };
const FUEL_EFFICIENCY_RANGE = [20, 400]; // km por galon considerados creibles

const hasNum = (v) => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v));
const num = (v) => (hasNum(v) ? Number(v) : 0);
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

// ---------- Fechas (cadenas 'YYYY-MM-DD') ----------
export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const weekEnd = (weekStart) => addDays(weekStart, 6);

export function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  return addDays(dateStr, -dow);
}

// ---------- Gasto bruto ----------
// Suma de todo lo pagado entre dos fechas (inclusive). No usa km.
export function grossExpense(expenses, from, to) {
  return sum(
    expenses.filter((e) => e.expense_date >= from && e.expense_date <= to),
    (e) => num(e.amount)
  );
}

// ---------- Gasolina ----------
// Rendimiento real = km entre el primer y el ultimo tanqueo / galones de los
// tanqueos posteriores al primero (supone tanques llenos). Si no hay datos
// suficientes o el resultado no es creible, se usa el rendimiento declarado.
// Precio del galon = el del ultimo tanqueo con galones; si no hay, el configurado.
export function fuelModel(vehicle, expenses) {
  const fills = expenses
    .filter((e) => e.category === 'gasoline' && num(e.gallons) > 0 && hasNum(e.odometer))
    .sort((a, b) => num(a.odometer) - num(b.odometer));

  let efficiency = num(vehicle.fuel_efficiency_km_gallon);
  let efficiencySource = 'estimated';
  if (fills.length >= 2) {
    const km = num(fills[fills.length - 1].odometer) - num(fills[0].odometer);
    const gallons = sum(fills.slice(1), (f) => num(f.gallons));
    const eff = km / gallons;
    if (km > 0 && eff >= FUEL_EFFICIENCY_RANGE[0] && eff <= FUEL_EFFICIENCY_RANGE[1]) {
      efficiency = eff;
      efficiencySource = 'real';
    }
  }

  const latest = fills
    .slice()
    .sort((a, b) => (a.expense_date < b.expense_date ? 1 : -1))[0];
  const pricePerGallon = latest ? num(latest.amount) / num(latest.gallons) : num(vehicle.fuel_gallon_price);

  return { efficiency, efficiencySource, pricePerGallon, perKm: pricePerGallon / efficiency };
}

// ---------- Desgaste de piezas ----------
// Vida util real = promedio de los ultimos 3 intervalos entre kilometrajes
// (instalacion original + reemplazos). Sin dos puntos, se usa la estimada.
export function partLife(part, replacements) {
  const points = [];
  if (hasNum(part.installed_odometer)) points.push(num(part.installed_odometer));
  replacements
    .filter((r) => r.wear_part_id === part.id)
    .forEach((r) => points.push(num(r.odometer)));
  points.sort((a, b) => a - b);

  const gaps = [];
  for (let i = 1; i < points.length; i++) {
    const gap = points[i] - points[i - 1];
    if (gap > 0) gaps.push(gap);
  }
  const recent = gaps.slice(-3);
  if (recent.length) return { lifeKm: sum(recent, (g) => g) / recent.length, source: 'real' };
  return { lifeKm: num(part.estimated_life_km), source: 'estimated' };
}

export function wearModel(parts, replacements = []) {
  const items = parts.map((p) => {
    const { lifeKm, source } = partLife(p, replacements);
    return {
      id: p.id,
      partType: p.part_type,
      price: num(p.price),
      lifeKm,
      source,
      perKm: num(p.price) / lifeKm,
    };
  });
  return { items, perKm: sum(items, (i) => i.perKm) };
}

// ---------- Costos fijos ----------
export function fixedCostModel(fixedCosts) {
  const annual = sum(fixedCosts, (c) => num(c.amount) * (FREQ_PER_YEAR[c.frequency] ?? 0));
  return { annual, perWeek: annual / WEEKS_PER_YEAR };
}

// ---------- Imprevistos ----------
// Imprevistos pagados en las ultimas 12 semanas (84 dias hasta asOf) / 12.
export function unexpectedPerWeek(expenses, asOf) {
  const from = addDays(asOf, -83);
  const total = sum(
    expenses.filter(
      (e) => e.category === 'unexpected' && e.expense_date >= from && e.expense_date <= asOf
    ),
    (e) => num(e.amount)
  );
  return total / 12;
}

// ---------- Gasto operacional de una semana ----------
export function weekOperating({ km, fuelPerKm, wearPerKm, fixedPerWeek, unexpected }) {
  const gasoline = km * fuelPerKm;
  const wear = km * wearPerKm;
  const total = gasoline + wear + fixedPerWeek + unexpected;
  return { km, gasoline, wear, fixed: fixedPerWeek, unexpected, total };
}

const sumOperating = (list) => ({
  km: sum(list, (o) => o.km),
  gasoline: sum(list, (o) => o.gasoline),
  wear: sum(list, (o) => o.wear),
  fixed: sum(list, (o) => o.fixed),
  unexpected: sum(list, (o) => o.unexpected),
  total: sum(list, (o) => o.total),
});

// ---------- Metricas principales ----------
// Punto de entrada unico para la interfaz.
// costPerKm = suma del gasto operacional de las ultimas 4 semanas cerradas
//             / suma de sus km. Sin semanas cerradas: estimacion de la semana 1.
export function computeMetrics({
  vehicle,
  wearParts = [],
  fixedCosts = [],
  weeks = [],
  expenses = [],
  replacements = [],
  today,
}) {
  const fuel = fuelModel(vehicle, expenses);
  const wear = wearModel(wearParts, replacements);
  const fixed = fixedCostModel(fixedCosts);

  const operatingFor = (km, asOf) =>
    weekOperating({
      km,
      fuelPerKm: fuel.perKm,
      wearPerKm: wear.perKm,
      fixedPerWeek: fixed.perWeek,
      unexpected: unexpectedPerWeek(expenses, asOf),
    });

  const closed = weeks
    .filter((w) => hasNum(w.odometer_end))
    .map((w) => ({ week: w, km: num(w.odometer_end) - num(w.odometer_start) }))
    .filter((x) => x.km > 0)
    .sort((a, b) => (a.week.week_start < b.week.week_start ? -1 : 1))
    .slice(-4);

  let status;
  let window;
  if (closed.length) {
    status = 'real';
    window = sumOperating(closed.map((x) => operatingFor(x.km, weekEnd(x.week.week_start))));
  } else {
    status = 'estimated';
    const km = num(vehicle.usual_km_per_day) * num(vehicle.usual_days_per_week);
    window = operatingFor(km, today);
  }

  const perKm = {
    gasoline: window.gasoline / window.km,
    wear: (window.wear + window.unexpected) / window.km, // desgaste + imprevistos
    fixed: window.fixed / window.km,
  };
  perKm.total = perKm.gasoline + perKm.wear + perKm.fixed;

  // Semana en curso (la mas reciente)
  const latestWeek = weeks.slice().sort((a, b) => (a.week_start < b.week_start ? 1 : -1))[0];
  let currentWeek = null;
  if (latestWeek) {
    const start = latestWeek.week_start;
    const end = weekEnd(start);
    const isClosed = hasNum(latestWeek.odometer_end);
    const km = isClosed
      ? num(latestWeek.odometer_end) - num(latestWeek.odometer_start)
      : num(vehicle.usual_km_per_day) * num(vehicle.usual_days_per_week);
    currentWeek = {
      weekStart: start,
      weekEnd: end,
      status: isClosed ? 'real' : 'estimated',
      gross: grossExpense(expenses, start, end),
      operating: operatingFor(km, end < today ? end : today),
    };
  }

  return {
    status, // 'real' | 'estimated'
    costPerKm: perKm.total,
    perKm, // { gasoline, wear, fixed, total } por km
    window, // sumas de la ventana usada (ultimas 4 semanas cerradas o estimacion)
    fuel,
    wear,
    fixed,
    currentWeek,
  };
}

// ---------- Modo trabajo ----------
function alertLevel({ net, costPct, maxPct }) {
  if (net < 0) return 'loss'; // estas perdiendo dinero
  if (costPct === null) return 'good';
  if (costPct >= maxPct) return 'too_cheap'; // estas cobrando muy barato
  if (costPct > Math.min(30, maxPct)) return 'tight'; // margen ajustado
  return 'good';
}

// Jornada que se esta cerrando ahora, con las capas del costo por km vigente.
export function computeWorkSession({ odometer_start, odometer_end, income }, metrics, maxPct = 50) {
  const km = num(odometer_end) - num(odometer_start);
  const gasoline = km * metrics.perKm.gasoline;
  const wear = km * metrics.perKm.wear;
  const fixed = km * metrics.perKm.fixed;
  const cost = gasoline + wear + fixed;
  const inc = num(income);
  const net = inc - cost;
  const costPct = inc > 0 ? (cost / inc) * 100 : null;
  return {
    km,
    layers: { gasoline, wear, fixed },
    cost,
    pocketProfit: inc - gasoline, // ganancia en bolsillo
    netProfit: net, // ganancia real
    setAside: inc - gasoline - net, // apartar = desgaste + fijos
    margin: inc > 0 ? (net / inc) * 100 : null,
    costPct,
    incomePerKm: km > 0 ? inc / km : null,
    minPerKm: metrics.costPerKm / (maxPct / 100),
    alert: alertLevel({ net, costPct, maxPct }),
  };
}

// Jornada ya guardada: usa el costo por km que se le mostro al cerrarla
// (cost_per_km_applied), asi el historial no cambia si cambian los precios.
export function computeSavedWorkSession(session, maxPct = 50) {
  const km = num(session.odometer_end) - num(session.odometer_start);
  const cost = km * num(session.cost_per_km_applied);
  const inc = num(session.income);
  const net = inc - cost;
  const costPct = inc > 0 ? (cost / inc) * 100 : null;
  return {
    km,
    cost,
    netProfit: net,
    margin: inc > 0 ? (net / inc) * 100 : null,
    costPct,
    alert: alertLevel({ net, costPct, maxPct }),
  };
}
