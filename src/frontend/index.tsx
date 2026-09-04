import React from 'react';
import { createRoot } from 'react-dom/client';
import { ServerManagerPage } from './ServerManagerPage';
import { getAuthServerUrl } from '@kbs-cloud/shared/auth';

const Login: React.FC<{ setup: boolean }> = ({ setup }) => {
  const [email, setEmail] = React.useState(''); const [password, setPassword] = React.useState(''); const [error, setError] = React.useState('');
  const submit = async (e: React.FormEvent) => { e.preventDefault(); const endpoint = setup ? '/api/auth/master-password' : '/api/auth/login'; const body = setup ? { password } : { email, password }; const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (r.ok) location.reload(); else setError((await r.json()).error || 'Request failed'); };
  const authHost = getAuthServerUrl();
  const sso = `${authHost}/api/auth/authorize?client_id=node-rcon&redirect_uri=${encodeURIComponent(window.location.origin + '/api/auth/callback')}`;
  return <main style={{ maxWidth: 420, margin: '12vh auto', fontFamily: 'sans-serif', padding: 24 }}><h1>Node RCON</h1><p>{setup ? 'Set a local master password or use SSO.' : 'Sign in to continue.'}</p>{error && <p style={{ color: 'crimson' }}>{error}</p>}<form onSubmit={submit}>{(!setup || setup) && <input placeholder={setup ? 'Admin email' : 'Email'} value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />}<input type="password" placeholder="Password (12+ characters)" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', marginBottom: 12 }} /><button type="submit">{setup ? 'Set master password' : 'Sign in locally'}</button></form><button onClick={() => location.href = sso} style={{ marginTop: 12 }}>Sign in with SSO</button></main>;
};
const AuthGate: React.FC = () => { const [state, setState] = React.useState<any>(); React.useEffect(() => { fetch('/api/auth/status').then(r => r.json()).then(setState); }, []); return state ? (state.user ? <ServerManagerPage /> : <Login setup={state.setupRequired} />) : <div>Loading…</div>; };

const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<AuthGate />);
}
