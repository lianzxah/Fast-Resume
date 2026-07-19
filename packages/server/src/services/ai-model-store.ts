import type {
  AiModelConfigResponse,
  AiModelProfile,
  AiModelProfileInput,
  AiModelRuntimeSnapshot,
} from '@resume-editor/shared';
import {
  findAiModelPresetByRuntime,
  generateId,
  isSupportedAiModel,
  resolveAiModelPreset,
} from '@resume-editor/shared';
import { db, type AiModelProfileRow } from '../db';
import { AI_LIMITS, envAiDefaults, maskSecret } from '../config';
import type { AgentConfig } from '@resume-editor/ai-agent';

const ENV_PROFILE_ID = 'env-default';

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, '');
}

function normalizeTemperature(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0.2;
  return Math.max(0, Math.min(2, value));
}

function normalizeModelInput(input: AiModelProfileInput, existing?: AiModelProfileRow) {
  const preset = resolveAiModelPreset(input.presetId) ?? findAiModelPresetByRuntime(input);
  const baseUrl = preset?.baseUrl ?? input.baseUrl ?? existing?.base_url;
  const model = preset?.model ?? input.model ?? existing?.model;

  if (!baseUrl?.trim()) throw new Error('缺少 AI_BASE_URL');
  if (!model?.trim()) throw new Error('缺少 AI_MODEL');
  if (!isSupportedAiModel(model)) {
    throw new Error('当前仅支持 deepseek-v4-flash 和 deepseek-v4-pro');
  }

  return {
    preset,
    name: input.name?.trim() || preset?.label || existing?.name || model.trim(),
    provider: input.provider || 'openai-compatible',
    baseUrl: normalizeBaseUrl(baseUrl),
    model: model.trim(),
    temperature: normalizeTemperature(input.temperature ?? preset?.temperature ?? existing?.temperature),
    maxTokens: input.maxTokens ?? preset?.maxTokens ?? existing?.max_tokens ?? null,
    supportsJsonMode:
      input.supportsJsonMode ?? preset?.supportsJsonMode ?? (existing ? existing.supports_json_mode === 1 : true),
    enabled: input.enabled ?? (existing ? existing.enabled === 1 : true),
  };
}

function profileFromRow(row: AiModelProfileRow): AiModelProfile {
  const masked = maskSecret(row.api_key);
  const preset = findAiModelPresetByRuntime({ baseUrl: row.base_url, model: row.model });
  return {
    id: row.id,
    name: row.name,
    provider: 'openai-compatible',
    scope: row.scope,
    presetId: preset?.id,
    providerLabel: preset?.providerLabel,
    baseUrl: row.base_url,
    model: row.model,
    temperature: row.temperature,
    maxTokens: row.max_tokens ?? undefined,
    supportsJsonMode: row.supports_json_mode === 1,
    enabled: row.enabled === 1,
    isDefault: row.is_default === 1,
    apiKeyConfigured: masked.configured,
    apiKeyPreview: masked.preview,
    readonly: row.scope === 'system',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function envProfile(isDefault: boolean): AiModelProfile {
  const env = envAiDefaults();
  const masked = maskSecret(env.apiKey);
  return {
    id: ENV_PROFILE_ID,
    name: '环境变量默认模型',
    provider: 'openai-compatible',
    scope: 'environment',
    baseUrl: env.baseUrl,
    model: env.model,
    temperature: env.temperature,
    maxTokens: env.maxTokens,
    supportsJsonMode: env.supportsJsonMode,
    enabled: true,
    isDefault,
    apiKeyConfigured: masked.configured,
    apiKeyPreview: masked.preview,
    readonly: true,
  };
}

function normalizeProfileList(rows: AiModelProfileRow[], defaultProfileId: string): AiModelProfile[] {
  return rows.filter((row) => isSupportedAiModel(row.model)).map((row) => ({
    ...profileFromRow(row),
    isDefault: row.id === defaultProfileId,
  }));
}

function upsertModelPreference(userId: string, profileId: string): void {
  db.prepare(
    `INSERT INTO ai_model_preferences (user_id, profile_id, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET profile_id = excluded.profile_id, updated_at = excluded.updated_at`
  ).run(userId, profileId, new Date().toISOString());
}

function profileVisibleToUser(row: AiModelProfileRow, userId: string): boolean {
  return row.enabled === 1 && (row.scope === 'system' || (row.scope === 'user' && row.user_id === userId));
}

function chooseDefaultProfileId(userId: string, rows: AiModelProfileRow[]): string {
  const preference = db
    .prepare('SELECT profile_id FROM ai_model_preferences WHERE user_id = ?')
    .get(userId) as { profile_id: string } | undefined;
  if (preference?.profile_id === ENV_PROFILE_ID) return ENV_PROFILE_ID;
  if (preference && rows.some((row) => row.id === preference.profile_id && profileVisibleToUser(row, userId))) {
    return preference.profile_id;
  }

  return (
    rows.find((row) => row.scope === 'user' && row.user_id === userId && row.is_default === 1 && row.enabled === 1)
      ?.id ??
    rows.find((row) => row.scope === 'system' && row.is_default === 1 && row.enabled === 1)?.id ??
    ENV_PROFILE_ID
  );
}

export function listAiModelProfiles(userId: string): AiModelConfigResponse {
  const rows = db
    .prepare(
      `SELECT * FROM ai_model_profiles
       WHERE (scope = 'system' AND enabled = 1) OR (scope = 'user' AND user_id = ?)
       ORDER BY
         CASE scope WHEN 'system' THEN 0 ELSE 1 END,
         is_default DESC,
         updated_at DESC`
    )
    .all(userId) as AiModelProfileRow[];
  const supportedRows = rows.filter((row) => isSupportedAiModel(row.model));
  const defaultProfileId = chooseDefaultProfileId(userId, supportedRows);
  const env = envProfile(defaultProfileId === ENV_PROFILE_ID);
  return {
    profiles: [env, ...normalizeProfileList(supportedRows, defaultProfileId)],
    defaultProfileId,
    limits: AI_LIMITS,
  };
}

export function saveDefaultAiModelProfile(userId: string, input: AiModelProfileInput): AiModelProfile {
  const now = new Date().toISOString();
  const existing = input.id
    ? (db
        .prepare("SELECT * FROM ai_model_profiles WHERE id = ? AND user_id = ? AND scope = 'user'")
        .get(input.id, userId) as AiModelProfileRow | undefined)
    : undefined;
  const id = existing?.id ?? generateId('ai_model');
  const normalized = normalizeModelInput(input, existing);
  const apiKey = input.apiKey && input.apiKey.trim() ? input.apiKey.trim() : existing?.api_key ?? null;

  db.prepare("UPDATE ai_model_profiles SET is_default = 0 WHERE user_id = ? AND scope = 'user'").run(userId);

  if (existing) {
    db.prepare(
      `UPDATE ai_model_profiles
       SET name = ?, provider = ?, base_url = ?, model = ?, temperature = ?, max_tokens = ?,
           supports_json_mode = ?, enabled = ?, is_default = 1, api_key = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND scope = 'user'`
    ).run(
      normalized.name,
      normalized.provider,
      normalized.baseUrl,
      normalized.model,
      normalized.temperature,
      normalized.maxTokens,
      normalized.supportsJsonMode ? 1 : 0,
      normalized.enabled ? 1 : 0,
      apiKey,
      now,
      id,
      userId
    );
  } else {
    db.prepare(
      `INSERT INTO ai_model_profiles
       (id, user_id, name, provider, base_url, model, temperature, max_tokens,
        supports_json_mode, enabled, is_default, scope, api_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'user', ?, ?, ?)`
    ).run(
      id,
      userId,
      normalized.name,
      normalized.provider,
      normalized.baseUrl,
      normalized.model,
      normalized.temperature,
      normalized.maxTokens,
      normalized.supportsJsonMode ? 1 : 0,
      normalized.enabled ? 1 : 0,
      apiKey,
      now,
      now
    );
  }

  const row = db.prepare('SELECT * FROM ai_model_profiles WHERE id = ?').get(id) as AiModelProfileRow;
  upsertModelPreference(userId, row.id);
  return { ...profileFromRow(row), isDefault: true };
}

export function setDefaultAiModelProfile(userId: string, profileId: string): AiModelProfile {
  if (profileId === ENV_PROFILE_ID) {
    db.prepare("UPDATE ai_model_profiles SET is_default = 0 WHERE user_id = ? AND scope = 'user'").run(userId);
    upsertModelPreference(userId, ENV_PROFILE_ID);
    return envProfile(true);
  }

  const row = db
    .prepare(
      `SELECT * FROM ai_model_profiles
       WHERE id = ? AND enabled = 1 AND (scope = 'system' OR (scope = 'user' AND user_id = ?))`
    )
    .get(profileId, userId) as AiModelProfileRow | undefined;
  if (!row) throw new Error('AI 模型配置不存在或已禁用');
  if (!isSupportedAiModel(row.model)) {
    throw new Error('当前仅支持 deepseek-v4-flash 和 deepseek-v4-pro');
  }

  if (row.scope === 'user') {
    db.prepare("UPDATE ai_model_profiles SET is_default = 0 WHERE user_id = ? AND scope = 'user'").run(userId);
    db.prepare('UPDATE ai_model_profiles SET is_default = 1, updated_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      profileId
    );
  }
  upsertModelPreference(userId, profileId);
  return { ...profileFromRow({ ...row, is_default: 1 }), isDefault: true };
}

export function resolveAiRuntimeConfig(
  userId: string,
  profileId?: string
): { agentConfig: AgentConfig; snapshot: AiModelRuntimeSnapshot } {
  const requestedId = profileId || listAiModelProfiles(userId).defaultProfileId || ENV_PROFILE_ID;
  if (requestedId === ENV_PROFILE_ID) {
    const env = envAiDefaults();
    if (!isSupportedAiModel(env.model)) {
      throw new Error('AI_MODEL 必须为 deepseek-v4-flash 或 deepseek-v4-pro');
    }
    return {
      agentConfig: {
        apiKey: env.apiKey,
        baseUrl: env.baseUrl,
        model: env.model,
        temperature: env.temperature,
        maxTokens: env.maxTokens,
        supportsJsonMode: env.supportsJsonMode,
      },
      snapshot: {
        profileId: ENV_PROFILE_ID,
        provider: 'openai-compatible',
        baseUrl: env.baseUrl,
        model: env.model,
        temperature: env.temperature,
        maxTokens: env.maxTokens,
        supportsJsonMode: env.supportsJsonMode,
      },
    };
  }

  const row = db
    .prepare(
      `SELECT * FROM ai_model_profiles
       WHERE id = ? AND enabled = 1 AND (scope = 'system' OR (scope = 'user' AND user_id = ?))`
    )
    .get(requestedId, userId) as AiModelProfileRow | undefined;
  if (!row) throw new Error('AI 模型配置不存在或已禁用');
  if (!isSupportedAiModel(row.model)) {
    throw new Error('当前仅支持 deepseek-v4-flash 和 deepseek-v4-pro');
  }

  return {
    agentConfig: {
      apiKey: row.api_key ?? undefined,
      baseUrl: row.base_url,
      model: row.model,
      temperature: row.temperature,
      maxTokens: row.max_tokens ?? undefined,
      supportsJsonMode: row.supports_json_mode === 1,
    },
    snapshot: {
      profileId: row.id,
      provider: 'openai-compatible',
      baseUrl: row.base_url,
      model: row.model,
      temperature: row.temperature,
      maxTokens: row.max_tokens ?? undefined,
      supportsJsonMode: row.supports_json_mode === 1,
    },
  };
}

export function listSystemAiModelProfiles(): AiModelProfile[] {
  const rows = db
    .prepare(
      `SELECT * FROM ai_model_profiles
       WHERE scope = 'system'
       ORDER BY is_default DESC, enabled DESC, updated_at DESC`
    )
    .all() as AiModelProfileRow[];
  return rows.filter((row) => isSupportedAiModel(row.model)).map(profileFromRow);
}

export function saveSystemAiModelProfile(adminUserId: string, input: AiModelProfileInput): AiModelProfile {
  const now = new Date().toISOString();
  const existing = input.id
    ? (db
        .prepare("SELECT * FROM ai_model_profiles WHERE id = ? AND scope = 'system'")
        .get(input.id) as AiModelProfileRow | undefined)
    : undefined;
  const id = existing?.id ?? generateId('ai_model');
  const normalized = normalizeModelInput(input, existing);
  const apiKey = input.apiKey && input.apiKey.trim() ? input.apiKey.trim() : existing?.api_key ?? null;
  const hasSystemDefault = db
    .prepare("SELECT id FROM ai_model_profiles WHERE scope = 'system' AND is_default = 1 LIMIT 1")
    .get();
  const shouldBeDefault = existing?.is_default === 1 || !hasSystemDefault;

  if (existing) {
    db.prepare(
      `UPDATE ai_model_profiles
       SET name = ?, provider = ?, base_url = ?, model = ?, temperature = ?, max_tokens = ?,
           supports_json_mode = ?, enabled = ?, api_key = ?, updated_at = ?
       WHERE id = ? AND scope = 'system'`
    ).run(
      normalized.name,
      normalized.provider,
      normalized.baseUrl,
      normalized.model,
      normalized.temperature,
      normalized.maxTokens,
      normalized.supportsJsonMode ? 1 : 0,
      normalized.enabled ? 1 : 0,
      apiKey,
      now,
      id
    );
  } else {
    db.prepare(
      `INSERT INTO ai_model_profiles
       (id, user_id, name, provider, base_url, model, temperature, max_tokens,
        supports_json_mode, enabled, is_default, scope, api_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'system', ?, ?, ?)`
    ).run(
      id,
      adminUserId,
      normalized.name,
      normalized.provider,
      normalized.baseUrl,
      normalized.model,
      normalized.temperature,
      normalized.maxTokens,
      normalized.supportsJsonMode ? 1 : 0,
      normalized.enabled ? 1 : 0,
      shouldBeDefault ? 1 : 0,
      apiKey,
      now,
      now
    );
  }

  const row = db.prepare('SELECT * FROM ai_model_profiles WHERE id = ?').get(id) as AiModelProfileRow;
  return profileFromRow(row);
}

export function setSystemAiModelDefault(profileId: string): AiModelProfile {
  const row = db
    .prepare("SELECT * FROM ai_model_profiles WHERE id = ? AND scope = 'system' AND enabled = 1")
    .get(profileId) as AiModelProfileRow | undefined;
  if (!row) throw new Error('系统 AI 模型不存在或已禁用');

  db.prepare("UPDATE ai_model_profiles SET is_default = 0 WHERE scope = 'system'").run();
  db.prepare('UPDATE ai_model_profiles SET is_default = 1, updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    profileId
  );
  return { ...profileFromRow({ ...row, is_default: 1 }), isDefault: true };
}

export function deleteSystemAiModelProfile(profileId: string): void {
  const row = db
    .prepare("SELECT * FROM ai_model_profiles WHERE id = ? AND scope = 'system'")
    .get(profileId) as AiModelProfileRow | undefined;
  if (!row) throw new Error('系统 AI 模型不存在');

  db.prepare('DELETE FROM ai_model_preferences WHERE profile_id = ?').run(profileId);
  db.prepare("DELETE FROM ai_model_profiles WHERE id = ? AND scope = 'system'").run(profileId);

  if (row.is_default === 1) {
    const next = db
      .prepare("SELECT id FROM ai_model_profiles WHERE scope = 'system' AND enabled = 1 ORDER BY updated_at DESC LIMIT 1")
      .get() as { id: string } | undefined;
    if (next) setSystemAiModelDefault(next.id);
  }
}
