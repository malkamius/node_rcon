import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import fetch from 'node-fetch';

export interface AuthUser { id: string; email: string; role: 'admin' | 'user'; provider: 'sso' | 'local'; passwordHash?: string; }
interface AuthConfig { users: AuthUser[]; masterPasswordHash?: string; }
interface Session { token: string; userId: string; expiresAt: number; }

const sessions = new Map<string, Session>();
const COOKIE = 'node_rcon_session';
const SESSION_MS = 8 * 60 * 60 * 1000;

function readAuth(config: any): AuthConfig {
  config.auth = config.auth || { users: [] };
  config.auth.users = Array.isArray(config.auth.users) ? config.auth.users : [];
  return config.auth;
}
function persist(config: any, configPath: string) { fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8'); }
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password: string, encoded?: string): boolean {
  if (!encoded) return false;
  const [salt, expected] = encoded.split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}
function getUser(req: Request, config: any): AuthUser | null {
  const token = parseCookies(req.headers.cookie || '')[COOKIE];
  const session = token && sessions.get(token);
  if (!session || session.expiresAt < Date.now()) { if (token) sessions.delete(token); return null; }
  return readAuth(config).users.find(u => u.id === session.userId) || null;
}
function parseCookies(value: string): Record<string, string> {
  return Object.fromEntries(value.split(';').map(v => v.trim().split('=')).filter(v => v.length === 2).map(([k, val]) => [k, decodeURIComponent(val)]));
}
function setSession(res: Response, user: AuthUser) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { token, userId: user.id, expiresAt: Date.now() + SESSION_MS });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: false, maxAge: SESSION_MS });
}
function loopback(req: Request) { return req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1'; }

export function authMiddleware(config: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/api/') || req.path.startsWith('/api/auth/') || req.path === '/api/health') return next();
    const auth = readAuth(config);
    if (!auth.users.length) return res.status(503).json({ error: 'Authentication setup required', setupRequired: true });
    const user = getUser(req, config);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    (req as any).user = user;
    next();
  };
}

export function registerAuth(app: any, config: any, configPath: string) {
  const auth = readAuth(config);
  app.get('/api/auth/status', (req: Request, res: Response) => {
    const user = getUser(req, config);
    res.json({ setupRequired: !auth.users.length, masterPasswordSet: !!auth.masterPasswordHash, user: user ? { id: user.id, email: user.email, role: user.role, provider: user.provider } : null });
  });
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const user = auth.users.find(u => u.provider === 'local' && u.email.toLowerCase() === email);
    if (!user || !verifyPassword(String(req.body?.password || ''), user.passwordHash)) return res.status(401).json({ error: 'Invalid credentials' });
    setSession(res, user); res.json({ ok: true, user });
  });
  app.post('/api/auth/logout', (req: Request, res: Response) => { const token = parseCookies(req.headers.cookie || '')[COOKIE]; if (token) sessions.delete(token); res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; HttpOnly; SameSite=Lax`); res.json({ ok: true }); });
  app.get('/api/auth/callback', async (req: Request, res: Response) => {
    const code = String(req.query.code || '').trim();
    if (!code) return res.status(400).send('SSO callback did not include an authorization code.');
    let email = '';
    try {
      const tokenResponse = await fetch('https://auth.kbs-cloud.com/api/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, client_id: 'node-rcon' }) });
      if (!tokenResponse.ok) return res.status(401).send('SSO authorization code was rejected.');
      const tokenData: any = await tokenResponse.json();
      email = String(tokenData.user?.email || tokenData.email || '').trim().toLowerCase();
    } catch { return res.status(502).send('Unable to verify the SSO authorization code.'); }
    if (!email || !email.includes('@')) return res.status(401).send('SSO token did not contain a verified email.');
    let user = auth.users.find(u => u.email.toLowerCase() === email);
    if (!user) { user = { id: crypto.randomUUID(), email, role: auth.users.length ? 'user' : 'admin', provider: 'sso' }; auth.users.push(user); persist(config, configPath); }
    setSession(res, user);
    if (req.query.silent === '1') return res.redirect('/?auth=silent-success&provider=sso');
    res.redirect('/?auth=success&provider=sso');
  });
  app.post('/api/auth/master-password', (req: Request, res: Response) => {
    if (!loopback(req)) return res.status(403).json({ error: 'Master password can only be changed locally' });
    const current = String(req.body?.currentPassword || '');
    if (auth.masterPasswordHash && !verifyPassword(current, auth.masterPasswordHash)) return res.status(401).json({ error: 'Current master password is invalid' });
    const next = String(req.body?.password || '');
    if (next.length < 12) return res.status(400).json({ error: 'Password must be at least 12 characters' });
    auth.masterPasswordHash = hashPassword(next);
    if (!auth.users.length) auth.users.push({ id: crypto.randomUUID(), email: String(req.body?.email || 'local-admin@localhost').trim().toLowerCase(), role: 'admin', provider: 'local', passwordHash: auth.masterPasswordHash });
    persist(config, configPath); res.json({ ok: true });
  });
  app.get('/api/auth/users', (req: Request, res: Response) => { const user = (req as any).user; if (user?.role !== 'admin') return res.status(403).json({ error: 'Admin required' }); res.json({ users: auth.users.map(({ passwordHash, ...u }) => u) }); });
  app.post('/api/auth/users', (req: Request, res: Response) => { const actor = (req as any).user; if (actor?.role !== 'admin') return res.status(403).json({ error: 'Admin required' }); const email = String(req.body?.email || '').trim().toLowerCase(); const password = String(req.body?.password || ''); if (!email.includes('@') || password.length < 12) return res.status(400).json({ error: 'Valid email and 12-character password required' }); const role: 'admin' | 'user' = req.body?.role === 'admin' ? 'admin' : 'user'; const user: AuthUser = { id: crypto.randomUUID(), email, role, provider: 'local', passwordHash: hashPassword(password) }; auth.users.push(user); persist(config, configPath); res.status(201).json({ user: { id: user.id, email: user.email, role: user.role, provider: user.provider } }); });
}
