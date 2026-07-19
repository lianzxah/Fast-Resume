import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { DATA_DIR } from '../db';

// ============================================================
// 产物文件存储 (文档 JSON / 缩略图)
// 目录结构:
//   data/resumes/{resumeId}/document.json          当前文档
//   data/resumes/{resumeId}/thumb.png              当前缩略图
//   data/resumes/{resumeId}/versions/{v}.json      版本快照文档
//   data/resumes/{resumeId}/versions/{v}.png       版本快照缩略图
// ============================================================

const RESUMES_DIR = resolve(DATA_DIR, 'resumes');

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function resumeDir(resumeId: string): string {
  const dir = resolve(RESUMES_DIR, resumeId);
  ensureDir(dir);
  return dir;
}

function versionsDir(resumeId: string): string {
  const dir = resolve(resumeDir(resumeId), 'versions');
  ensureDir(dir);
  return dir;
}

// ------------------------------------------------------------
// 文档 JSON
// ------------------------------------------------------------

/** 写入当前文档 */
export function writeCurrentDocument(resumeId: string, document: unknown): void {
  writeFileSync(resolve(resumeDir(resumeId), 'document.json'), JSON.stringify(document), 'utf-8');
}

/** 读取当前文档 */
export function readCurrentDocument(resumeId: string): unknown | null {
  const path = resolve(resumeDir(resumeId), 'document.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/** 写入版本快照文档 */
export function writeVersionDocument(resumeId: string, version: number, document: unknown): void {
  writeFileSync(resolve(versionsDir(resumeId), `${version}.json`), JSON.stringify(document), 'utf-8');
}

/** 读取版本快照文档 */
export function readVersionDocument(resumeId: string, version: number): unknown | null {
  const path = resolve(versionsDir(resumeId), `${version}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// 缩略图 (base64 dataURL → png 文件)
// ------------------------------------------------------------

/** 从 dataURL 解析出 png Buffer */
function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[1], 'base64');
}

/** 写入当前缩略图，返回是否成功 */
export function writeCurrentThumbnail(resumeId: string, dataUrl: string): boolean {
  const buf = dataUrlToBuffer(dataUrl);
  if (!buf) return false;
  writeFileSync(resolve(resumeDir(resumeId), 'thumb.png'), buf);
  return true;
}

/** 写入版本缩略图 */
export function writeVersionThumbnail(resumeId: string, version: number, dataUrl: string): boolean {
  const buf = dataUrlToBuffer(dataUrl);
  if (!buf) return false;
  writeFileSync(resolve(versionsDir(resumeId), `${version}.png`), buf);
  return true;
}

/** 读取缩略图 Buffer (version 省略则取当前) */
export function readThumbnail(resumeId: string, version?: number): Buffer | null {
  const path =
    version === undefined
      ? resolve(resumeDir(resumeId), 'thumb.png')
      : resolve(versionsDir(resumeId), `${version}.png`);
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}

/** 删除简历所有产物 */
export function deleteResumeArtifacts(resumeId: string): void {
  const dir = resolve(RESUMES_DIR, resumeId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}
