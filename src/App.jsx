import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Config from './pages/Config';

// Aqui se iran registrando las pantallas a medida que se construyen:
// const PAGES = { config: Config, registrar: Registrar, trabajo: Trabajo, resumen: Resumen, historial: Historial };
const PAGES = { config: Config };

function Pendiente({ page }) {
  return (
    <div className="page-head">
      <div className="mic">En construcción</div>
      <h1 className="h1">Pantalla «{page}»</h1>
      <p className="muted">Esta pantalla se construye en el siguiente paso.</p>
    </div>
  );
}

function Shell() {
  const { loading, error, data, refresh } = useData();
  const [page, setPage] = useState('resumen');

  if (loading) return <div className="center-msg">Cargando…</div>;
  if (error) {
    return (
      <div className="center-msg">
        <div>
          <p>No pudimos cargar tus datos.</p>
          <p className="muted">Revisa que las tablas existan en Supabase.</p>
          <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={refresh}>Reintentar</button>
        </div>
      </div>
    );
  }

  // Sin moto registrada: se obliga a pasar primero por la configuracion inicial.
  const needsSetup = !data;
  const current = needsSetup ? 'config' : page;
  const Page = PAGES[current];

  return (
    <Layout page={current} onNavigate={setPage} locked={needsSetup}>
      {Page ? <Page onNavigate={setPage} /> : <Pendiente page={current} />}
    </Layout>
  );
}

function Gate() {
  const { session, loading } = useAuth();
  if (loading) return <div className="center-msg">Cargando…</div>;
  if (!session) return <Login />;
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
