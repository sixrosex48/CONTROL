import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadAll } from '../lib/api';
import { computeMetrics } from '../lib/calculations';
import { todayStr } from '../lib/format';

// Carga los datos del usuario y calcula las metricas una sola vez.
// Las pantallas solo leen de aqui con useData(); despues de guardar algo,
// llaman a refresh() para recargar.
const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  const refresh = useCallback(async () => {
    try {
      const data = await loadAll();
      setState({ loading: false, error: null, data });
    } catch (error) {
      setState({ loading: false, error, data: null });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const metrics = useMemo(
    () => (state.data ? computeMetrics({ ...state.data, today: todayStr() }) : null),
    [state.data]
  );

  return <DataContext.Provider value={{ ...state, metrics, refresh }}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);
