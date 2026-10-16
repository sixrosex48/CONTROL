import { useState } from 'react';
import Logo from '../components/Logo';
import { signIn, signUp } from '../lib/api';

const traducir = (msg = '') => {
  if (msg.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (msg.includes('Email not confirmed')) return 'Primero confirma tu correo con el enlace que te enviamos.';
  if (msg.includes('already registered')) return 'Ese correo ya tiene una cuenta. Inicia sesión.';
  if (msg.includes('at least')) return 'La contraseña debe tener mínimo 8 caracteres.';
  if (msg.includes('rate limit')) return 'Demasiados intentos. Espera unos minutos.';
  return 'No pudimos completar la acción. Intenta de nuevo.';
};

export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const isLogin = mode === 'login';

  async function submit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      if (isLogin) {
        const { error: err } = await signIn(email.trim(), password);
        if (err) throw err;
      } else {
        const { data, error: err } = await signUp(email.trim(), password);
        if (err) throw err;
        // Si Supabase pide confirmar el correo, no hay sesion todavia.
        if (!data.session) setInfo('Te enviamos un correo para confirmar tu cuenta. Confírmalo y luego inicia sesión.');
      }
    } catch (err) {
      setError(traducir(err.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <Logo />
        <div className="mic" style={{ marginTop: 18 }}>Tu moto. Tus costos. Tus decisiones.</div>
        <h1 className="h1">{isLogin ? 'Qué bueno tenerte de vuelta.' : 'Crea tu cuenta.'}</h1>
        <p className="muted">
          {isLogin
            ? 'Accede para gestionar tu moto y conocer sus costos.'
            : 'Empieza a conocer cuánto te cuesta cada kilómetro.'}
        </p>
        <form onSubmit={submit}>
          <label className="field">
            Correo electrónico
            <input type="email" required placeholder="tu@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label className="field">
            Contraseña
            <input type="password" required minLength={8} placeholder="Mínimo 8 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isLogin ? 'current-password' : 'new-password'} />
          </label>
          {error && <div className="msg-error">{error}</div>}
          {info && <div className="msg-info">{info}</div>}
          <button className="btn" disabled={busy}>
            {busy ? 'Un momento…' : isLogin ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>
        <div className="auth-foot">
          {isLogin ? '¿Aún no tienes cuenta? ' : '¿Ya tienes cuenta? '}
          <button className="link" onClick={() => { setMode(isLogin ? 'signup' : 'login'); setError(''); setInfo(''); }}>
            {isLogin ? 'Regístrate' : 'Inicia sesión'}
          </button>
        </div>
      </div>
    </div>
  );
}
