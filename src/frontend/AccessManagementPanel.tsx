import React from 'react';

type AccessUser = { id: string; email: string; role: 'admin' | 'server-admin' | 'instance-manager' | 'user'; provider: 'sso' | 'local' };

export const AccessManagementPanel: React.FC<{ onClose: () => void; siteAdmin?: boolean }> = ({ onClose, siteAdmin = false }) => {
  const [users, setUsers] = React.useState<AccessUser[]>([]);
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<'admin' | 'user'>('user');
  const [error, setError] = React.useState('');
  const load = React.useCallback(async () => { const r = await fetch('/api/auth/users'); const d = await r.json(); if (!r.ok) throw new Error(d.error); setUsers(d.users); }, []);
  React.useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
  const invite = async (e: React.FormEvent) => { e.preventDefault(); setError(''); const r = await fetch('/api/auth/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role, provider: 'sso' }) }); const d = await r.json(); if (!r.ok) return setError(d.error); setEmail(''); load(); };
  const remove = async (id: string) => { if (!window.confirm('Remove this email’s access?')) return; const r = await fetch(`/api/auth/users/${id}`, { method: 'DELETE' }); if (!r.ok) setError((await r.json()).error); else load(); };
  const changeRole = async (id: string, nextRole: string) => { const r = await fetch(`/api/auth/users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: nextRole }) }); if (!r.ok) setError((await r.json()).error); else load(); };
  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 2000, display: 'grid', placeItems: 'center', padding: 16 }}>
    <section style={{ background: '#20242b', color: '#eee', width: 'min(720px, 100%)', maxHeight: '90vh', overflow: 'auto', padding: 24, borderRadius: 8, boxShadow: '0 12px 40px #000' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><h2 style={{ margin: 0 }}>Access management</h2><p style={{ color: '#aeb7c4' }}>Control which SSO email addresses can sign in.</p></div><button onClick={onClose}>Close</button></header>
      {error && <p style={{ color: '#ff8d8d' }}>{error}</p>}
      <form onSubmit={invite} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '18px 0' }}><input required type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} style={{ flex: 1, minWidth: 220, padding: 9 }} /><select value={role} onChange={e => setRole(e.target.value as any)} style={{ padding: 9 }}><option value="user">User</option><option value="instance-manager">Instance manager</option><option value="server-admin">Server admin</option>{siteAdmin && <option value="admin">Site admin</option>}</select><button type="submit">Grant SSO access</button></form>
      <div>{users.map(u => <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid #3a414c', padding: '12px 0' }}><span style={{ flex: 1 }}>{u.email}<small style={{ display: 'block', color: '#9da7b5' }}>{u.provider === 'sso' ? 'SSO' : 'Local'} account</small></span><select value={u.role} onChange={e => changeRole(u.id, e.target.value)}><option value="user">User</option><option value="instance-manager">Instance manager</option><option value="server-admin">Server admin</option>{siteAdmin && <option value="admin">Site admin</option>}</select><button onClick={() => remove(u.id)}>Remove</button></div>)}</div>
    </section>
  </div>;
};
