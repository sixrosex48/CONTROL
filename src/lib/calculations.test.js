import { describe, it, expect } from 'vitest';
import {
  computeMetrics,
  computeWorkSession,
  computeSavedWorkSession,
  fuelModel,
  mondayOf,
} from './calculations';

// Caso de referencia (los mismos numeros usados al disenar las formulas)
const vehicle = {
  fuel_gallon_price: 17500,
  fuel_efficiency_km_gallon: 120,
  usual_km_per_day: 20,
  usual_days_per_week: 7,
};
const wearParts = [
  { id: 'p1', part_type: 'front_tire', price: 190000, estimated_life_km: 15000 },
  { id: 'p2', part_type: 'rear_tire', price: 190000, estimated_life_km: 15000 },
  { id: 'p3', part_type: 'chain_kit', price: 180000, estimated_life_km: 18000 },
  { id: 'p4', part_type: 'oil', price: 40000, estimated_life_km: 2500 },
  { id: 'p5', part_type: 'front_brake_pads', price: 45000, estimated_life_km: 10000 },
  { id: 'p6', part_type: 'battery', price: 120000, estimated_life_km: 30000 },
];
const fixedCosts = [
  { amount: 330000, frequency: 'annual' },
  { amount: 240000, frequency: 'annual' },
  { amount: 120000, frequency: 'annual' },
];
const base = { vehicle, wearParts, fixedCosts, today: '2026-10-16' };

describe('semana 1 sin historial (estimado)', () => {
  const m = computeMetrics({ ...base });
  it('estima 140 km y costo por km ~300', () => {
    expect(m.status).toBe('estimated');
    expect(m.window.km).toBe(140);
    expect(m.window.total).toBeCloseTo(42063.0, 0);
    expect(m.costPerKm).toBeCloseTo(300.4, 1);
  });
});

describe('semana cerrada de 600 km (real)', () => {
  const weeks = [{ week_start: '2026-10-05', odometer_start: 32000, odometer_end: 32600 }];
  const m = computeMetrics({ ...base, weeks });
  it('costo por km ~227,8 y capas 145,8 / 59,8 / 22,1', () => {
    expect(m.status).toBe('real');
    expect(m.costPerKm).toBeCloseTo(227.78, 1);
    expect(m.perKm.gasoline).toBeCloseTo(145.83, 1);
    expect(m.perKm.wear).toBeCloseTo(59.83, 1);
    expect(m.perKm.fixed).toBeCloseTo(22.11, 1);
  });
  it('jornada de 100 km con ingreso de 160.000', () => {
    const r = computeWorkSession({ odometer_start: 32140, odometer_end: 32240, income: 160000 }, m, 50);
    expect(r.cost).toBeCloseTo(22778, 0);
    expect(r.pocketProfit).toBeCloseTo(145417, 0);
    expect(r.netProfit).toBeCloseTo(137222, 0);
    expect(r.setAside).toBeCloseTo(8194.9, 0);
    expect(r.margin).toBeCloseTo(85.76, 1);
    expect(r.minPerKm).toBeCloseTo(455.6, 0);
    expect(r.alert).toBe('good');
  });
  it('avisa cuando se cobra muy barato', () => {
    const r = computeWorkSession({ odometer_start: 0, odometer_end: 100, income: 40000 }, m, 50);
    expect(r.alert).toBe('too_cheap');
  });
  it('jornada guardada usa el costo por km aplicado', () => {
    const r = computeSavedWorkSession(
      { odometer_start: 0, odometer_end: 100, income: 160000, cost_per_km_applied: 200 }
    );
    expect(r.cost).toBe(20000);
  });
});

describe('imprevistos', () => {
  it('se reparten en 12 semanas', () => {
    const weeks = [{ week_start: '2026-10-05', odometer_start: 32000, odometer_end: 32600 }];
    const expenses = [{ category: 'unexpected', amount: 120000, expense_date: '2026-10-09' }];
    const m = computeMetrics({ ...base, weeks, expenses });
    expect(m.window.unexpected).toBeCloseTo(10000, 0);
  });
});

describe('gasolina', () => {
  it('rendimiento real tanque a tanque', () => {
    const expenses = [
      { category: 'gasoline', amount: 35000, gallons: 2, odometer: 32000, expense_date: '2026-10-01' },
      { category: 'gasoline', amount: 35000, gallons: 2, odometer: 32240, expense_date: '2026-10-08' },
    ];
    const f = fuelModel(vehicle, expenses);
    expect(f.efficiencySource).toBe('real');
    expect(f.efficiency).toBeCloseTo(120, 5);
    expect(f.pricePerGallon).toBeCloseTo(17500, 5);
  });
});

describe('fechas', () => {
  it('mondayOf devuelve el lunes de la semana', () => {
    expect(mondayOf('2026-10-16')).toBe('2026-10-12');
  });
});
