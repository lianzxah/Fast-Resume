import { Hono } from 'hono';
import type { AdminPasswordResetRequest, AdminUserUpdateRequest, AiModelProfileInput } from '@resume-editor/shared';
import { db } from '../db';
import { adminMiddleware, authMiddleware, type AuthEnv } from '../middleware/auth';
import { hashPassword } from '../services/auth';
import {
  adminSummary,
  deleteUser,
  getUserById,
  listAdminUsers,
  updateAdminUser,
  updateUserPasswordHash,
} from '../services/user-store';
import {
  deleteSystemAiModelProfile,
  listSystemAiModelProfiles,
  saveSystemAiModelProfile,
  setSystemAiModelDefault,
} from '../services/ai-model-store';

export const adminRoutes = new Hono<AuthEnv>();

adminRoutes.use('*', authMiddleware);
adminRoutes.use('*', adminMiddleware);

function adminCount(): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get() as { count: number };
  return row.count;
}

// ============================================================
// GET /summary - 后台概览
// ============================================================
adminRoutes.get('/summary', (c) => {
  return c.json({ success: true, data: adminSummary() });
});

// ============================================================
// GET /users - 注册用户列表
// ============================================================
adminRoutes.get('/users', (c) => {
  return c.json({ success: true, data: listAdminUsers() });
});

// ============================================================
// PATCH /users/:id - 更新用户资料 / 角色
// ============================================================
adminRoutes.patch('/users/:id', async (c) => {
  const targetId = c.req.param('id');
  const target = getUserById(targetId);
  if (!target) return c.json({ success: false, error: '账号不存在' }, 404);

  const body = (await c.req.json()) as AdminUserUpdateRequest;
  if (target.role === 'admin' && body.role === 'member' && adminCount() <= 1) {
    return c.json({ success: false, error: '至少需要保留一个管理员账号' }, 400);
  }

  try {
    return c.json({ success: true, data: updateAdminUser(targetId, body) });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : '更新用户失败' }, 400);
  }
});

// ============================================================
// POST /users/:id/password - 管理员重置用户密码
// ============================================================
adminRoutes.post('/users/:id/password', async (c) => {
  const targetId = c.req.param('id');
  const target = getUserById(targetId);
  if (!target) return c.json({ success: false, error: '账号不存在' }, 404);

  const body = (await c.req.json()) as Partial<AdminPasswordResetRequest>;
  if (!body.nextPassword || typeof body.nextPassword !== 'string') {
    return c.json({ success: false, error: '请输入新密码' }, 400);
  }
  if (body.nextPassword.length < 6) {
    return c.json({ success: false, error: '新密码至少 6 个字符' }, 400);
  }

  const result = updateUserPasswordHash(targetId, await hashPassword(body.nextPassword));
  return c.json({ success: true, data: result });
});

// ============================================================
// DELETE /users/:id - 删除用户
// ============================================================
adminRoutes.delete('/users/:id', (c) => {
  const targetId = c.req.param('id');
  if (targetId === c.get('userId')) {
    return c.json({ success: false, error: '不能删除当前登录账号' }, 400);
  }

  const target = getUserById(targetId);
  if (!target) return c.json({ success: false, error: '账号不存在' }, 404);
  if (target.role === 'admin' && adminCount() <= 1) {
    return c.json({ success: false, error: '至少需要保留一个管理员账号' }, 400);
  }

  deleteUser(targetId);
  return c.json({ success: true, data: { id: targetId } });
});

// ============================================================
// GET /ai-models - 系统 AI 模型列表
// ============================================================
adminRoutes.get('/ai-models', (c) => {
  return c.json({ success: true, data: listSystemAiModelProfiles() });
});

// ============================================================
// POST /ai-models - 创建系统 AI 模型
// ============================================================
adminRoutes.post('/ai-models', async (c) => {
  try {
    return c.json({ success: true, data: saveSystemAiModelProfile(c.get('userId'), await c.req.json()) });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : '保存模型失败' }, 400);
  }
});

// ============================================================
// PUT /ai-models/:id - 更新系统 AI 模型
// ============================================================
adminRoutes.put('/ai-models/:id', async (c) => {
  const body = (await c.req.json()) as AiModelProfileInput;
  try {
    return c.json({
      success: true,
      data: saveSystemAiModelProfile(c.get('userId'), { ...body, id: c.req.param('id') }),
    });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : '保存模型失败' }, 400);
  }
});

// ============================================================
// POST /ai-models/:id/default - 设为系统默认模型
// ============================================================
adminRoutes.post('/ai-models/:id/default', (c) => {
  try {
    return c.json({ success: true, data: setSystemAiModelDefault(c.req.param('id')) });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : '设置默认模型失败' }, 400);
  }
});

// ============================================================
// DELETE /ai-models/:id - 删除系统 AI 模型
// ============================================================
adminRoutes.delete('/ai-models/:id', (c) => {
  try {
    deleteSystemAiModelProfile(c.req.param('id'));
    return c.json({ success: true, data: { id: c.req.param('id') } });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : '删除模型失败' }, 400);
  }
});
