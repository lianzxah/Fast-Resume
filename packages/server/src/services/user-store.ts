import type {
  AdminSummaryDTO,
  AdminUserDTO,
  AdminUserUpdateRequest,
  UserDTO,
  UserProfileUpdateRequest,
  UserRole,
} from '@resume-editor/shared';
import { db, type UserRow } from '../db';

export function userToDTO(row: UserRow): UserDTO {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    email: row.email || undefined,
    avatarUrl: row.avatar_url || undefined,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

export function normalizeUserProfileInput(input: UserProfileUpdateRequest): UserProfileUpdateRequest {
  const hasDisplayName = Object.prototype.hasOwnProperty.call(input, 'displayName');
  const hasEmail = Object.prototype.hasOwnProperty.call(input, 'email');
  const hasAvatarUrl = Object.prototype.hasOwnProperty.call(input, 'avatarUrl');
  const displayName = input.displayName?.trim();
  const email = input.email?.trim();
  const avatarUrl = input.avatarUrl?.trim();

  if (displayName !== undefined && displayName.length < 1) {
    throw new Error('名称不能为空');
  }
  if (displayName && displayName.length > 40) {
    throw new Error('名称不能超过 40 个字符');
  }
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120)) {
    throw new Error('邮箱格式不正确');
  }
  if (avatarUrl && avatarUrl.length > 800) {
    throw new Error('头像地址过长');
  }

  return {
    ...(hasDisplayName ? { displayName } : {}),
    ...(hasEmail ? { email: email || '' } : {}),
    ...(hasAvatarUrl ? { avatarUrl: avatarUrl || '' } : {}),
  };
}

export function normalizeAdminUserInput(input: AdminUserUpdateRequest): AdminUserUpdateRequest {
  const profile = normalizeUserProfileInput(input);
  const role = input.role;
  if (role !== undefined && role !== 'admin' && role !== 'member') {
    throw new Error('用户角色不正确');
  }
  return { ...profile, role };
}

export function getUserById(userId: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
}

export function updateUserProfile(userId: string, input: UserProfileUpdateRequest): UserDTO {
  const row = getUserById(userId);
  if (!row) throw new Error('账号不存在');

  const normalized = normalizeUserProfileInput(input);
  const updatedAt = new Date().toISOString();
  const displayName = 'displayName' in normalized ? normalized.displayName || row.username : row.display_name;
  const email = 'email' in normalized ? normalized.email || null : row.email;
  const avatarUrl = 'avatarUrl' in normalized ? normalized.avatarUrl || null : row.avatar_url;
  db.prepare('UPDATE users SET display_name = ?, email = ?, avatar_url = ?, updated_at = ? WHERE id = ?').run(
    displayName ?? row.username,
    email,
    avatarUrl,
    updatedAt,
    userId
  );

  return userToDTO({
    ...row,
    display_name: displayName ?? row.username,
    email,
    avatar_url: avatarUrl,
    updated_at: updatedAt,
  });
}

export function listAdminUsers(): AdminUserDTO[] {
  const rows = db
    .prepare(
      `SELECT
         users.*,
         COUNT(resumes.id) AS resume_count,
         MAX(resumes.updated_at) AS latest_resume_updated_at
       FROM users
       LEFT JOIN resumes ON resumes.user_id = users.id
       GROUP BY users.id
       ORDER BY users.created_at ASC`
    )
    .all() as Array<
    UserRow & {
      resume_count: number;
      latest_resume_updated_at: string | null;
    }
  >;

  return rows.map((row) => ({
    ...userToDTO(row),
    resumeCount: row.resume_count,
    latestResumeUpdatedAt: row.latest_resume_updated_at || undefined,
  }));
}

export function updateAdminUser(userId: string, input: AdminUserUpdateRequest): AdminUserDTO {
  const row = getUserById(userId);
  if (!row) throw new Error('账号不存在');

  const normalized = normalizeAdminUserInput(input);
  const updatedAt = new Date().toISOString();
  const role: UserRole = normalized.role ?? row.role;
  const displayName = 'displayName' in normalized ? normalized.displayName || row.username : row.display_name;
  const email = 'email' in normalized ? normalized.email || null : row.email;
  const avatarUrl = 'avatarUrl' in normalized ? normalized.avatarUrl || null : row.avatar_url;

  db.prepare('UPDATE users SET display_name = ?, email = ?, avatar_url = ?, role = ?, updated_at = ? WHERE id = ?').run(
    displayName ?? row.username,
    email,
    avatarUrl,
    role,
    updatedAt,
    userId
  );

  const resumeStats = db
    .prepare('SELECT COUNT(*) AS count, MAX(updated_at) AS latest FROM resumes WHERE user_id = ?')
    .get(userId) as { count: number; latest: string | null };

  return {
    ...userToDTO({
      ...row,
      display_name: displayName ?? row.username,
      email,
      avatar_url: avatarUrl,
      role,
      updated_at: updatedAt,
    }),
    resumeCount: resumeStats.count,
    latestResumeUpdatedAt: resumeStats.latest || undefined,
  };
}

export function deleteUser(userId: string): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

export function updateUserPasswordHash(userId: string, passwordHash: string): { id: string; updatedAt: string } {
  const row = getUserById(userId);
  if (!row) throw new Error('账号不存在');

  const updatedAt = new Date().toISOString();
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, updatedAt, userId);
  return { id: userId, updatedAt };
}

export function adminSummary(): AdminSummaryDTO {
  const userStats = db
    .prepare("SELECT COUNT(*) AS user_count, SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admin_count FROM users")
    .get() as { user_count: number; admin_count: number | null };
  const resumeStats = db.prepare('SELECT COUNT(*) AS resume_count FROM resumes').get() as { resume_count: number };
  const modelStats = db
    .prepare("SELECT COUNT(*) AS model_count FROM ai_model_profiles WHERE scope = 'system'")
    .get() as { model_count: number };

  return {
    userCount: userStats.user_count,
    adminCount: userStats.admin_count ?? 0,
    resumeCount: resumeStats.resume_count,
    systemModelCount: modelStats.model_count,
  };
}
