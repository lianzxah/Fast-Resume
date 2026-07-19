import { Hono } from 'hono';
import type {
  ResumeMetaDTO,
  ResumeVersionDTO,
  ResumeDetailDTO,
} from '@resume-editor/shared';
import { generateId } from '@resume-editor/shared';
import { db, type ResumeRow, type VersionRow } from '../db';
import { authMiddleware, type AuthEnv } from '../middleware/auth';
import {
  writeCurrentDocument,
  readCurrentDocument,
  writeVersionDocument,
  readVersionDocument,
  writeCurrentThumbnail,
  writeVersionThumbnail,
  readThumbnail,
  deleteResumeArtifacts,
} from '../services/storage';

export const resumeRoutes = new Hono<AuthEnv>();

// 所有简历接口需登录
resumeRoutes.use('*', authMiddleware);

// ------------------------------------------------------------
// 辅助
// ------------------------------------------------------------
function toMeta(row: ResumeRow): ResumeMetaDTO {
  return {
    id: row.id,
    title: row.title,
    thumbnail: `/api/resumes/${row.id}/thumbnail?v=${row.current_version}`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: row.tags ? JSON.parse(row.tags) : undefined,
    currentVersion: row.current_version,
  };
}

function getOwnedResume(resumeId: string, userId: string): ResumeRow | null {
  const row = db.prepare('SELECT * FROM resumes WHERE id = ?').get(resumeId) as ResumeRow | undefined;
  if (!row || row.user_id !== userId) return null;
  return row;
}

function insertVersion(resumeId: string, version: number, message?: string): void {
  const v: VersionRow = {
    id: generateId('ver'),
    resume_id: resumeId,
    version,
    message: message ?? null,
    created_at: new Date().toISOString(),
  };
  db.prepare('INSERT INTO resume_versions (id, resume_id, version, message, created_at) VALUES (?, ?, ?, ?, ?)').run(
    v.id,
    v.resume_id,
    v.version,
    v.message,
    v.created_at
  );
}

// ============================================================
// GET / - 当前用户简历列表 (最近编辑在前)
// ============================================================
resumeRoutes.get('/', (c) => {
  const userId = c.get('userId');
  const rows = db
    .prepare('SELECT * FROM resumes WHERE user_id = ? ORDER BY updated_at DESC')
    .all(userId) as ResumeRow[];
  return c.json({ success: true, data: rows.map(toMeta) });
});

// ============================================================
// POST / - 新建简历 (生成版本 1)
// ============================================================
resumeRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const { title, document, thumbnail } = await c.req.json();

  if (!document) {
    return c.json({ success: false, error: '缺少文档内容' }, 400);
  }

  const now = new Date().toISOString();
  const row: ResumeRow = {
    id: generateId('resume'),
    user_id: userId,
    title: title || '未命名简历',
    tags: null,
    current_version: 1,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    'INSERT INTO resumes (id, user_id, title, tags, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(row.id, row.user_id, row.title, row.tags, row.current_version, row.created_at, row.updated_at);

  writeCurrentDocument(row.id, document);
  writeVersionDocument(row.id, 1, document);
  insertVersion(row.id, 1, '创建');
  if (thumbnail) {
    writeCurrentThumbnail(row.id, thumbnail);
    writeVersionThumbnail(row.id, 1, thumbnail);
  }

  return c.json({ success: true, data: toMeta(row) });
});

// ============================================================
// GET /:id - 简历详情 (含文档)
// ============================================================
resumeRoutes.get('/:id', (c) => {
  const userId = c.get('userId');
  const row = getOwnedResume(c.req.param('id'), userId);
  if (!row) return c.json({ success: false, error: '简历不存在' }, 404);

  const document = readCurrentDocument(row.id);
  const detail: ResumeDetailDTO = { ...toMeta(row), document };
  return c.json({ success: true, data: detail });
});

// ============================================================
// PUT /:id - 更新 / 自动保存 (createVersion=true 时生成新版本快照)
// ============================================================
resumeRoutes.put('/:id', async (c) => {
  const userId = c.get('userId');
  const row = getOwnedResume(c.req.param('id'), userId);
  if (!row) return c.json({ success: false, error: '简历不存在' }, 404);

  const { title, document, thumbnail, createVersion, message } = await c.req.json();
  if (!document) return c.json({ success: false, error: '缺少文档内容' }, 400);

  const now = new Date().toISOString();
  let version = row.current_version;
  if (createVersion) version = row.current_version + 1;

  db.prepare('UPDATE resumes SET title = ?, current_version = ?, updated_at = ? WHERE id = ?').run(
    title ?? row.title,
    version,
    now,
    row.id
  );

  writeCurrentDocument(row.id, document);
  if (thumbnail) writeCurrentThumbnail(row.id, thumbnail);

  if (createVersion) {
    writeVersionDocument(row.id, version, document);
    if (thumbnail) writeVersionThumbnail(row.id, version, thumbnail);
    insertVersion(row.id, version, message);
  }

  const updated = { ...row, title: title ?? row.title, current_version: version, updated_at: now };
  return c.json({ success: true, data: toMeta(updated) });
});

// ============================================================
// DELETE /:id - 删除简历
// ============================================================
resumeRoutes.delete('/:id', (c) => {
  const userId = c.get('userId');
  const row = getOwnedResume(c.req.param('id'), userId);
  if (!row) return c.json({ success: false, error: '简历不存在' }, 404);

  db.prepare('DELETE FROM resumes WHERE id = ?').run(row.id);
  deleteResumeArtifacts(row.id);
  return c.json({ success: true, data: { id: row.id } });
});

// ============================================================
// GET /:id/versions - 版本列表
// ============================================================
resumeRoutes.get('/:id/versions', (c) => {
  const userId = c.get('userId');
  const row = getOwnedResume(c.req.param('id'), userId);
  if (!row) return c.json({ success: false, error: '简历不存在' }, 404);

  const versions = db
    .prepare('SELECT * FROM resume_versions WHERE resume_id = ? ORDER BY version DESC')
    .all(row.id) as VersionRow[];

  const data: ResumeVersionDTO[] = versions.map((v) => ({
    id: v.id,
    resumeId: v.resume_id,
    version: v.version,
    message: v.message ?? undefined,
    createdAt: v.created_at,
    thumbnail: `/api/resumes/${row.id}/versions/${v.version}/thumbnail`,
  }));
  return c.json({ success: true, data });
});

// ============================================================
// GET /:id/versions/:version - 读取某版本文档
// ============================================================
resumeRoutes.get('/:id/versions/:version', (c) => {
  const userId = c.get('userId');
  const row = getOwnedResume(c.req.param('id'), userId);
  if (!row) return c.json({ success: false, error: '简历不存在' }, 404);

  const version = Number(c.req.param('version'));
  const document = readVersionDocument(row.id, version);
  if (!document) return c.json({ success: false, error: '版本不存在' }, 404);
  return c.json({ success: true, data: { document, version } });
});

// ============================================================
// POST /:id/versions/:version/restore - 回滚到指定版本 (生成新版本)
// ============================================================
resumeRoutes.post('/:id/versions/:version/restore', (c) => {
  const userId = c.get('userId');
  const row = getOwnedResume(c.req.param('id'), userId);
  if (!row) return c.json({ success: false, error: '简历不存在' }, 404);

  const version = Number(c.req.param('version'));
  const document = readVersionDocument(row.id, version);
  if (!document) return c.json({ success: false, error: '版本不存在' }, 404);

  const now = new Date().toISOString();
  const newVersion = row.current_version + 1;
  db.prepare('UPDATE resumes SET current_version = ?, updated_at = ? WHERE id = ?').run(newVersion, now, row.id);

  writeCurrentDocument(row.id, document);
  writeVersionDocument(row.id, newVersion, document);
  const oldThumb = readThumbnail(row.id, version);
  if (oldThumb) {
    const dataUrl = `data:image/png;base64,${oldThumb.toString('base64')}`;
    writeCurrentThumbnail(row.id, dataUrl);
    writeVersionThumbnail(row.id, newVersion, dataUrl);
  }
  insertVersion(row.id, newVersion, `回滚自 v${version}`);

  const updated = { ...row, current_version: newVersion, updated_at: now };
  return c.json({ success: true, data: { meta: toMeta(updated), document } });
});

// ============================================================
// GET /:id/thumbnail - 当前缩略图
// ============================================================
resumeRoutes.get('/:id/thumbnail', (c) => {
  const userId = c.get('userId');
  const row = getOwnedResume(c.req.param('id'), userId);
  if (!row) return c.json({ success: false, error: '简历不存在' }, 404);

  const buf = readThumbnail(row.id);
  if (!buf) return c.json({ success: false, error: '暂无缩略图' }, 404);
  return c.body(new Uint8Array(buf), 200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' });
});

// ============================================================
// GET /:id/versions/:version/thumbnail - 版本缩略图
// ============================================================
resumeRoutes.get('/:id/versions/:version/thumbnail', (c) => {
  const userId = c.get('userId');
  const row = getOwnedResume(c.req.param('id'), userId);
  if (!row) return c.json({ success: false, error: '简历不存在' }, 404);

  const version = Number(c.req.param('version'));
  const buf = readThumbnail(row.id, version);
  if (!buf) return c.json({ success: false, error: '暂无缩略图' }, 404);
  return c.body(new Uint8Array(buf), 200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' });
});
