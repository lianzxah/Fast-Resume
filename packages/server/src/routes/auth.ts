import { Hono } from 'hono';
import type { AuthResponse, PasswordUpdateRequest } from '@resume-editor/shared';
import { db, type UserRow } from '../db';
import { hashPassword, verifyPassword, signToken } from '../services/auth';
import { generateId } from '@resume-editor/shared';
import { authMiddleware, type AuthEnv } from '../middleware/auth';
import { getUserById, updateUserProfile, userToDTO } from '../services/user-store';

export const authRoutes = new Hono<AuthEnv>();

// ============================================================
// POST /register - 注册
// ============================================================
authRoutes.post('/register', async (c) => {
  const { username, password } = await c.req.json();

  if (!username || typeof username !== 'string' || username.length < 2) {
    return c.json({ success: false, error: '用户名至少 2 个字符' }, 400);
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return c.json({ success: false, error: '密码至少 6 个字符' }, 400);
  }

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) {
    return c.json({ success: false, error: '用户名已存在' }, 409);
  }

  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  const row: UserRow = {
    id: generateId('user'),
    username,
    password_hash: await hashPassword(password),
    display_name: username,
    email: null,
    avatar_url: null,
    role: userCount.count === 0 ? 'admin' : 'member',
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO users
     (id, username, password_hash, display_name, email, avatar_url, role, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.username,
    row.password_hash,
    row.display_name,
    row.email,
    row.avatar_url,
    row.role,
    row.updated_at,
    row.created_at
  );

  const token = signToken({ userId: row.id, username: row.username, role: row.role });
  const data: AuthResponse = { token, user: userToDTO(row) };
  return c.json({ success: true, data });
});

// ============================================================
// POST /login - 登录
// ============================================================
authRoutes.post('/login', async (c) => {
  const { username, password } = await c.req.json();

  if (!username || !password) {
    return c.json({ success: false, error: '请输入用户名和密码' }, 400);
  }

  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return c.json({ success: false, error: '用户名或密码错误' }, 401);
  }

  const token = signToken({ userId: row.id, username: row.username, role: row.role });
  const data: AuthResponse = { token, user: userToDTO(row) };
  return c.json({ success: true, data });
});

// ============================================================
// GET /me - 当前用户信息
// ============================================================
authRoutes.get('/me', authMiddleware, (c) => {
  const row = getUserById(c.get('userId'));
  if (!row) return c.json({ success: false, error: '账号不存在' }, 404);
  return c.json({ success: true, data: userToDTO(row) });
});

// ============================================================
// PUT /me - 更新个人资料
// ============================================================
authRoutes.put('/me', authMiddleware, async (c) => {
  const userId = c.get('userId');
  try {
    return c.json({ success: true, data: updateUserProfile(userId, await c.req.json()) });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : '资料格式不正确' }, 400);
  }
});

// ============================================================
// PUT /password - 修改密码
// ============================================================
authRoutes.put('/password', authMiddleware, async (c) => {
  const body = (await c.req.json()) as Partial<PasswordUpdateRequest>;
  if (!body.currentPassword || !body.nextPassword) {
    return c.json({ success: false, error: '请输入当前密码和新密码' }, 400);
  }
  if (body.nextPassword.length < 6) {
    return c.json({ success: false, error: '新密码至少 6 个字符' }, 400);
  }

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(c.get('userId')) as UserRow | undefined;
  if (!row) return c.json({ success: false, error: '账号不存在' }, 404);
  if (!(await verifyPassword(body.currentPassword, row.password_hash))) {
    return c.json({ success: false, error: '当前密码不正确' }, 400);
  }

  const updatedAt = new Date().toISOString();
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    await hashPassword(body.nextPassword),
    updatedAt,
    row.id
  );
  return c.json({ success: true, data: { updatedAt } });
});
