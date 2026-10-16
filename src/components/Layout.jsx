import Logo from './Logo';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { signOut } from '../lib/api';

const ITEMS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'registrar', label: 'Registrar' },
  { id: 'trabajo', label: 'Modo trabajo', onlyWork: true },
  { id: 'historial', label: 'Historial' },
  { id: 'config', label: 'Configuración' },
];

export default function Layout({ page, onNavigate, locked, children }) {
  const { session } = useAuth();
  const { data } = useData();
  const workEnabled = Boolean(data?.vehicle?.work_mode_enabled);

  return (
    <div className="shell">
      <aside className="sidebar">
        <Logo />
        <nav className="nav">
          {ITEMS.filter((i) => !i.onlyWork || workEnabled).map((i) => (
            <button
              key={i.id}
              className={`nav-item${page === i.id ? ' active' : ''}`}
              disabled={locked && i.id !== 'config'}
              onClick={() => onNavigate(i.id)}
            >
              {i.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="email">{session?.user?.email}</div>
          <button className="btn btn-quiet" onClick={signOut}>
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
