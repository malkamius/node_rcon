import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import fetch from 'node-fetch';

export type AuthRole = 'admin' | 'server-admin' | 'instance-manager' | 'user';
export interface AuthUser { id: string; email: string; role: AuthRole; provider: 'sso' | 'local'; assignedInstanceKeys?: string[]; passwordHash?: string; }
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
export function getAuthenticatedUser(req: Request, config: any): AuthUser | null {
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
    const user = getAuthenticatedUser(req, config);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    (req as any).user = user;
    next();
  };
}

export function registerAuth(app: any, config: any, configPath: string) {
  const auth = readAuth(config);
  app.get('/api/auth/status', (req: Request, res: Response) => {
    const user = getAuthenticatedUser(req, config);
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
    if (!user) {
      // The first SSO login bootstraps the installation. Every later SSO address
      // must be explicitly invited by an administrator.
      if (auth.users.length) return res.status(403).send('This SSO email has not been granted access by an administrator.');
      user = { id: crypto.randomUUID(), email, role: 'admin', provider: 'sso' };
      auth.users.push(user); persist(config, configPath);
    }
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
  const requireAccessManager = (req: Request, res: Response) => { const actor = getAuthenticatedUser(req, config); if (!actor || !['admin', 'server-admin'].includes(actor.role)) { res.status(403).json({ error: 'Access management permission required' }); return false; } (req as any).user = actor; return true; };
  const canManageTarget = (actor: AuthUser, target: AuthUser) => actor.role === 'admin' || (target.role !== 'admin' && target.role !== 'server-admin' && target.id !== actor.id);
  const inScope = (actor: AuthUser, keys: string[]) => actor.role !== 'server-admin' || keys.every(key => (actor.assignedInstanceKeys || []).includes(key));
  app.get('/api/auth/users', (req: Request, res: Response) => { if (!requireAccessManager(req, res)) return; res.json({ users: auth.users.map(({ passwordHash, ...u }) => u) }); });
  app.post('/api/auth/users', (req: Request, res: Response) => {
    if (!requireAccessManager(req, res)) return;
    const email = String(req.body?.email || '').trim().toLowerCase();
    const provider = req.body?.provider === 'sso' ? 'sso' : 'local';
    const password = String(req.body?.password || '');
    if (!email.includes('@') || auth.users.some(u => u.email.toLowerCase() === email)) return res.status(400).json({ error: 'A unique, valid email is required' });
    if (provider === 'local' && password.length < 12) return res.status(400).json({ error: 'Local passwords must be at least 12 characters' });
    const role: AuthRole = ['admin', 'server-admin', 'instance-manager', 'user'].includes(req.body?.role) ? req.body.role : 'user';
    const actor = (req as any).user as AuthUser;
    const assignedInstanceKeys = Array.isArray(req.body?.assignedInstanceKeys) ? req.body.assignedInstanceKeys.map((key: any) => String(key)) : [];
    if (actor.role !== 'admin' && (role === 'admin' || !inScope(actor, assignedInstanceKeys))) return res.status(403).json({ error: 'You can only grant permissions within your server scope' });
    const user: AuthUser = { id: crypto.randomUUID(), email, role, provider, assignedInstanceKeys, ...(provider === 'local' ? { passwordHash: hashPassword(password) } : {}) };
    auth.users.push(user); persist(config, configPath);
    res.status(201).json({ user: { id: user.id, email: user.email, role: user.role, provider: user.provider } });
  });
  app.patch('/api/auth/users/:id', (req: Request, res: Response) => {
    if (!requireAccessManager(req, res)) return;
    const user = auth.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const actor = (req as any).user as AuthUser;
    if (!canManageTarget(actor, user)) return res.status(403).json({ error: 'You cannot modify this administrator' });
    if (['admin', 'server-admin', 'instance-manager', 'user'].includes(req.body?.role)) {
      if (actor.role !== 'admin' && req.body.role === 'admin') return res.status(403).json({ error: 'Only site admins can grant site admin access' });
      user.role = req.body.role;
    }
    if (Array.isArray(req.body?.assignedInstanceKeys)) { const keys = req.body.assignedInstanceKeys.map((key: any) => String(key)); if (!inScope(actor, keys)) return res.status(403).json({ error: 'Assignment is outside your server scope' }); user.assignedInstanceKeys = keys; }
    persist(config, configPath); res.json({ ok: true });
  });
  app.delete('/api/auth/users/:id', (req: Request, res: Response) => {
    if (!requireAccessManager(req, res)) return;
    if ((req as any).user.id === req.params.id) return res.status(400).json({ error: 'You cannot remove your own access' });
    const index = auth.users.findIndex(u => u.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'User not found' });
    if (!canManageTarget((req as any).user, auth.users[index])) return res.status(403).json({ error: 'You cannot remove this administrator' });
    auth.users.splice(index, 1); persist(config, configPath); res.json({ ok: true });
  });
}
