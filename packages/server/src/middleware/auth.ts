import type { Context, Next } from 'hono';
import { verifyToken, type JwtPayload } from '../services/auth';
import { db, type UserRow } from '../db';

// ============================================================
// JWT 鉴权中间件
// 校验 Authorization: Bearer <token>，注入 userId / username 到 context。
// ============================================================

export type AuthEnv = {
  Variables: {
    userId: string;
    username: string;
    userRole: UserRow['role'];
  };
};

export async function authMiddleware(c: Context<AuthEnv>, next: Next) {
  const header = c.req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ success: false, error: '未登录' }, 401);
  }
  const token = header.slice(7);
  const payload: JwtPayload | null = verifyToken(token);
  if (!payload) {
    return c.json({ success: false, error: '登录已过期，请重新登录' }, 401);
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId) as UserRow | undefined;
  if (!user) {
    return c.json({ success: false, error: '账号不存在或已被移除' }, 401);
  }

  c.set('userId', user.id);
  c.set('username', user.username);
  c.set('userRole', user.role);
  await next();
}

export async function adminMiddleware(c: Context<AuthEnv>, next: Next) {
  if (c.get('userRole') !== 'admin') {
    return c.json({ success: false, error: '需要管理员权限' }, 403);
  }
  await next();
}
