// =====================================================================
// CONTROL - Acceso a datos (Supabase). Aqui solo se guarda y se lee.
// No hay formulas: todo calculo esta en calculations.js.
// La seguridad (cada usuario ve solo lo suyo) la aplica RLS en la base.
// =====================================================================
import { supabase } from './supabaseClient';

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error('No hay sesion activa');
  return data.user.id;
}

// ---------- Sesion ----------
export const signUp = (email, password) => supabase.auth.signUp({ email, password });
export const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
export const signOut = () => supabase.auth.signOut();

// ---------- Moto ----------
export async function getVehicle() {
  return unwrap(await supabase.from('vehicles').select('*').maybeSingle());
}

export async function saveVehicle(values) {
  const user_id = await currentUserId();
  return unwrap(
    await supabase
      .from('vehicles')
      .upsert({ ...values, user_id }, { onConflict: 'user_id' })
      .select()
      .single()
  );
}

// ---------- Piezas de desgaste ----------
export async function saveWearParts(vehicle, parts) {
  const rows = parts.map((p) => ({ ...p, vehicle_id: vehicle.id, user_id: vehicle.user_id }));
  return unwrap(
    await supabase.from('wear_parts').upsert(rows, { onConflict: 'vehicle_id,part_type' }).select()
  );
}

// ---------- Costos fijos ----------
export async function saveFixedCost(vehicle, cost) {
  const row = { ...cost, vehicle_id: vehicle.id, user_id: vehicle.user_id };
  const query = cost.id
    ? supabase.from('fixed_costs').update(row).eq('id', cost.id)
    : supabase.from('fixed_costs').insert(row);
  return unwrap(await query.select().single());
}

export async function deleteFixedCost(id) {
  unwrap(await supabase.from('fixed_costs').delete().eq('id', id));
}

// ---------- Semanas ----------
// weekStart debe ser lunes (usa mondayOf de calculations.js).
export async function startWeek(vehicle, weekStart, odometerStart) {
  return unwrap(
    await supabase
      .from('weeks')
      .insert({
        vehicle_id: vehicle.id,
        user_id: vehicle.user_id,
        week_start: weekStart,
        odometer_start: odometerStart,
      })
      .select()
      .single()
  );
}

export async function closeWeek(weekId, odometerEnd) {
  return unwrap(
    await supabase.from('weeks').update({ odometer_end: odometerEnd }).eq('id', weekId).select().single()
  );
}

// ---------- Gastos ----------
// Al registrar una pieza nueva (category 'wear_part'): se guarda el gasto,
// se crea el reemplazo y el precio de la pieza pasa a ser el monto pagado.
// No se suma al operacional: solo cambia Precio_i. La vida real se calcula
// sola con los kilometrajes de los reemplazos.
export async function addExpense(vehicle, expense) {
  const base = { vehicle_id: vehicle.id, user_id: vehicle.user_id };
  const saved = unwrap(await supabase.from('expenses').insert({ ...base, ...expense }).select().single());

  if (expense.category === 'wear_part') {
    try {
      unwrap(
        await supabase.from('part_replacements').insert({
          ...base,
          wear_part_id: expense.wear_part_id,
          expense_id: saved.id,
          replaced_at: expense.expense_date,
          odometer: expense.odometer,
        })
      );
      unwrap(
        await supabase.from('wear_parts').update({ price: expense.amount }).eq('id', expense.wear_part_id)
      );
    } catch (err) {
      await supabase.from('expenses').delete().eq('id', saved.id); // deshacer
      throw err;
    }
  }
  return saved;
}

export async function updateExpense(id, patch) {
  return unwrap(await supabase.from('expenses').update(patch).eq('id', id).select().single());
}

// Borrar un gasto de pieza borra tambien su reemplazo (on delete cascade).
export async function deleteExpense(id) {
  unwrap(await supabase.from('expenses').delete().eq('id', id));
}

// ---------- Jornadas (modo trabajo) ----------
// cost_per_km_applied = metrics.costPerKm en el momento de cerrar la jornada.
export async function addWorkSession(vehicle, session) {
  return unwrap(
    await supabase
      .from('work_sessions')
      .insert({ vehicle_id: vehicle.id, user_id: vehicle.user_id, ...session })
      .select()
      .single()
  );
}

export async function updateWorkSession(id, patch) {
  return unwrap(await supabase.from('work_sessions').update(patch).eq('id', id).select().single());
}

export async function deleteWorkSession(id) {
  unwrap(await supabase.from('work_sessions').delete().eq('id', id));
}

// ---------- Carga completa ----------
// Devuelve todo lo necesario para computeMetrics y las pantallas.
export async function loadAll() {
  const vehicle = await getVehicle();
  if (!vehicle) return null;
  const byVehicle = (table, order) =>
    supabase.from(table).select('*').eq('vehicle_id', vehicle.id).order(order, { ascending: false });

  const [wearParts, fixedCosts, weeks, expenses, replacements, workSessions] = await Promise.all([
    byVehicle('wear_parts', 'created_at'),
    byVehicle('fixed_costs', 'created_at'),
    byVehicle('weeks', 'week_start'),
    byVehicle('expenses', 'expense_date'),
    byVehicle('part_replacements', 'odometer'),
    byVehicle('work_sessions', 'session_date'),
  ]).then((results) => results.map(unwrap));

  return { vehicle, wearParts, fixedCosts, weeks, expenses, replacements, workSessions };
}
