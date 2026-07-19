import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// ============================================================
// SQLite 数据库初始化
// 元数据 (用户 / 简历 / 版本) 存 SQLite；文档 JSON 与缩略图存文件系统。
// ============================================================

/** 数据根目录 (可通过 DATA_DIR 环境变量覆盖) */
export const DATA_DIR = resolve(process.env.DATA_DIR || resolve(process.cwd(), 'data'));

const DB_PATH = resolve(DATA_DIR, 'resume-editor.db');

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

ensureDir(dirname(DB_PATH));

export const db: DatabaseType = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ------------------------------------------------------------
// 表结构
// ------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name  TEXT,
    email         TEXT,
    avatar_url    TEXT,
    role          TEXT NOT NULL DEFAULT 'member',
    updated_at    TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS resumes (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    title           TEXT NOT NULL,
    tags            TEXT,
    current_version INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS resume_versions (
    id         TEXT PRIMARY KEY,
    resume_id  TEXT NOT NULL,
    version    INTEGER NOT NULL,
    message    TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_versions_resume ON resume_versions(resume_id, version DESC);

  CREATE TABLE IF NOT EXISTS ai_sessions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    resume_id  TEXT NOT NULL,
    title      TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ai_messages (
    id               TEXT PRIMARY KEY,
    session_id       TEXT NOT NULL,
    role             TEXT NOT NULL,
    content          TEXT NOT NULL,
    thinking_label   TEXT,
    thinking_content TEXT,
    created_at       TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ai_events (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    type       TEXT NOT NULL,
    payload    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_ai_sessions_resume ON ai_sessions(user_id, resume_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ai_messages_session ON ai_messages(session_id, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_ai_events_session ON ai_events(session_id, created_at ASC);

  CREATE TABLE IF NOT EXISTS ai_model_profiles (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL,
    name               TEXT NOT NULL,
    provider           TEXT NOT NULL,
    base_url           TEXT NOT NULL,
    model              TEXT NOT NULL,
    temperature        REAL NOT NULL,
    max_tokens         INTEGER,
    supports_json_mode INTEGER NOT NULL DEFAULT 1,
    enabled            INTEGER NOT NULL DEFAULT 1,
    is_default         INTEGER NOT NULL DEFAULT 0,
    scope              TEXT NOT NULL DEFAULT 'user',
    api_key            TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ai_model_preferences (
    user_id    TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ai_turns (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    status      TEXT NOT NULL,
    model       TEXT NOT NULL,
    payload     TEXT NOT NULL,
    error_code  TEXT,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ai_proposals (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    status      TEXT NOT NULL,
    risk        TEXT NOT NULL,
    payload     TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ai_applied_changes (
    id                  TEXT PRIMARY KEY,
    proposal_id         TEXT NOT NULL,
    session_id          TEXT NOT NULL,
    resume_id           TEXT NOT NULL,
    changed_element_ids TEXT NOT NULL,
    command_types       TEXT NOT NULL,
    before_hash         TEXT,
    after_hash          TEXT,
    model               TEXT,
    applied_at          TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_ai_model_profiles_user ON ai_model_profiles(user_id, is_default DESC, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ai_turns_session ON ai_turns(session_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ai_proposals_session ON ai_proposals(session_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ai_applied_changes_session ON ai_applied_changes(session_id, applied_at DESC);
`);

function tableHasColumn(table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function ensureColumn(table: string, column: string, definition: string): void {
  if (!tableHasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

function runMigrations(): void {
  ensureColumn('users', 'display_name', 'display_name TEXT');
  ensureColumn('users', 'email', 'email TEXT');
  ensureColumn('users', 'avatar_url', 'avatar_url TEXT');
  ensureColumn('users', 'role', "role TEXT NOT NULL DEFAULT 'member'");
  ensureColumn('users', 'updated_at', 'updated_at TEXT');
  ensureColumn('ai_model_profiles', 'scope', "scope TEXT NOT NULL DEFAULT 'user'");
  ensureColumn('ai_messages', 'thinking_label', 'thinking_label TEXT');
  ensureColumn('ai_messages', 'thinking_content', 'thinking_content TEXT');
  ensureColumn('ai_applied_changes', 'title', 'title TEXT');
  ensureColumn('ai_applied_changes', 'before_document', 'before_document TEXT');
  ensureColumn('ai_applied_changes', 'after_document', 'after_document TEXT');
  ensureColumn('ai_applied_changes', 'status', "status TEXT NOT NULL DEFAULT 'applied'");
  ensureColumn('ai_applied_changes', 'reverted_at', 'reverted_at TEXT');
  ensureColumn('ai_applied_changes', 'attempt_id', 'attempt_id TEXT');
  ensureColumn('ai_applied_changes', 'revert_attempt_id', 'revert_attempt_id TEXT');

  db.prepare(
    "UPDATE users SET display_name = username WHERE display_name IS NULL OR trim(display_name) = ''"
  ).run();
  db.prepare('UPDATE users SET updated_at = created_at WHERE updated_at IS NULL').run();
  db.prepare(
    "UPDATE ai_model_profiles SET scope = 'user' WHERE scope IS NULL OR trim(scope) = ''"
  ).run();

  const hasAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!hasAdmin) {
    const first = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get() as
      | { id: string }
      | undefined;
    if (first) {
      db.prepare("UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        first.id
      );
    }
  }
}

runMigrations();

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_ai_model_profiles_scope ON ai_model_profiles(scope, is_default DESC, updated_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_applied_changes_proposal_unique ON ai_applied_changes(session_id, proposal_id);
`);

// ------------------------------------------------------------
// 行类型
// ------------------------------------------------------------
export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: 'admin' | 'member';
  updated_at: string;
  created_at: string;
}

export interface ResumeRow {
  id: string;
  user_id: string;
  title: string;
  tags: string | null;
  current_version: number;
  created_at: string;
  updated_at: string;
}

export interface VersionRow {
  id: string;
  resume_id: string;
  version: number;
  message: string | null;
  created_at: string;
}

export interface AiSessionRow {
  id: string;
  user_id: string;
  resume_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiMessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  thinking_label: string | null;
  thinking_content: string | null;
  created_at: string;
}

export interface AiModelProfileRow {
  id: string;
  user_id: string;
  name: string;
  provider: string;
  base_url: string;
  model: string;
  temperature: number;
  max_tokens: number | null;
  supports_json_mode: number;
  enabled: number;
  is_default: number;
  scope: 'user' | 'system';
  api_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiProposalRow {
  id: string;
  session_id: string;
  status: string;
  risk: string;
  payload: string;
  created_at: string;
  updated_at: string;
}

export interface AiAppliedChangeRow {
  id: string;
  attempt_id: string | null;
  proposal_id: string;
  session_id: string;
  resume_id: string;
  title: string | null;
  changed_element_ids: string;
  command_types: string;
  before_hash: string | null;
  after_hash: string | null;
  before_document: string | null;
  after_document: string | null;
  model: string | null;
  applied_at: string;
  status: 'applied' | 'reverted';
  reverted_at: string | null;
  revert_attempt_id: string | null;
}
