import React from 'react';
import { createRoot } from 'react-dom/client';
import { ServerManagerPage } from './ServerManagerPage';
import { getAuthServerUrl } from '@kbs-cloud/shared/auth';

const SSO_MARKER = 'node-rcon:last-login:sso';
const SSO_REFRESH_MS = 6 * 60 * 60 * 1000;

function ssoUrl(silent = false) {
  const callback = window.location.origin + '/api/auth/callback' + (silent ? '?silent=1' : '');
  return `${getAuthServerUrl()}/api/auth/authorize?client_id=node-rcon&prompt=none&redirect_uri=${encodeURIComponent(callback)}`;
}

function refreshSsoInBackground() {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.display = 'none';
  frame.src = ssoUrl(true);
  document.body.appendChild(frame);
  window.setTimeout(() => frame.remove(), 30000);
}

const Login: React.FC<{ setup: boolean }> = ({ setup }) => {
  const [email, setEmail] = React.useState(''); const [password, setPassword] = React.useState(''); const [error, setError] = React.useState('');
  const submit = async (e: React.FormEvent) => { e.preventDefault(); const endpoint = setup ? '/api/auth/master-password' : '/api/auth/login'; const body = setup ? { password } : { email, password }; const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (r.ok) location.reload(); else setError((await r.json()).error || 'Request failed'); };
  return <main style={{ maxWidth: 420, margin: '12vh auto', fontFamily: 'sans-serif', padding: 24 }}><h1>Node RCON</h1><p>{setup ? 'Set a local master password or use SSO.' : 'Sign in to continue.'}</p>{error && <p style={{ color: 'crimson' }}>{error}</p>}<form onSubmit={submit}>{(!setup || setup) && <input placeholder={setup ? 'Admin email' : 'Email'} value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />}<input type="password" placeholder="Password (12+ characters)" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', marginBottom: 12 }} /><button type="submit">{setup ? 'Set master password' : 'Sign in locally'}</button></form><button onClick={() => location.href = ssoUrl()} style={{ marginTop: 12 }}>Sign in with SSO</button></main>;
};
const AuthGate: React.FC = () => { const [state, setState] = React.useState<any>(); React.useEffect(() => { let timer: number | undefined; fetch('/api/auth/status').then(r => r.json()).then(next => { setState(next); if (next.user?.provider === 'sso') { localStorage.setItem(SSO_MARKER, '1'); refreshSsoInBackground(); timer = window.setInterval(refreshSsoInBackground, SSO_REFRESH_MS); } else if (!next.user && localStorage.getItem(SSO_MARKER) === '1') refreshSsoInBackground(); }); return () => { if (timer) window.clearInterval(timer); }; }, []); React.useEffect(() => { if (new URLSearchParams(location.search).get('provider') === 'sso') localStorage.setItem(SSO_MARKER, '1'); }, []); return state ? (state.user ? <ServerManagerPage /> : <Login setup={state.setupRequired} />) : <div>Loading…</div>; };

const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<AuthGate />);
}
