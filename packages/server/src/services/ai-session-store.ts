import { generateId } from '@resume-editor/shared';
import type {
  AiAppliedChange,
  AiEditProposal,
  AiEvent,
  AiModelRuntimeSnapshot,
  AiProposalStatus,
} from '@resume-editor/shared';
import {
  db,
  type AiAppliedChangeRow,
  type AiMessageRow,
  type AiProposalRow,
  type AiSessionRow,
} from '../db';

export interface AiSessionDTO {
  id: string;
  resumeId: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessageDTO {
  id: string;
  role: string;
  content: string;
  thinkingLabel?: string;
  thinkingContent?: string;
  createdAt: string;
}

export interface AiProposalDTO {
  id: string;
  sessionId: string;
  status: AiProposalStatus;
  risk: AiEditProposal['risk'];
  proposal: AiEditProposal;
  createdAt: string;
  updatedAt: string;
}

function toSessionDTO(row: AiSessionRow): AiSessionDTO {
  return {
    id: row.id,
    resumeId: row.resume_id,
    title: row.title ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessageDTO(row: AiMessageRow): AiMessageDTO {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    thinkingLabel: row.thinking_label ?? undefined,
    thinkingContent: row.thinking_content ?? undefined,
    createdAt: row.created_at,
  };
}

function toProposalDTO(row: AiProposalRow): AiProposalDTO {
  const proposal = JSON.parse(row.payload) as AiEditProposal;
  return {
    id: row.id,
    sessionId: row.session_id,
    status: row.status as AiProposalStatus,
    risk: row.risk as AiEditProposal['risk'],
    proposal,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAppliedChangeDTO(row: AiAppliedChangeRow): AiAppliedChange {
  return {
    id: row.id,
    attemptId: row.attempt_id ?? undefined,
    proposalId: row.proposal_id,
    resumeId: row.resume_id,
    title: row.title ?? undefined,
    changedElementIds: JSON.parse(row.changed_element_ids) as string[],
    commandTypes: JSON.parse(row.command_types) as string[],
    beforeHash: row.before_hash ?? undefined,
    afterHash: row.after_hash ?? undefined,
    beforeDocument: row.before_document ? JSON.parse(row.before_document) : undefined,
    afterDocument: row.after_document ? JSON.parse(row.after_document) : undefined,
    model: row.model ? (JSON.parse(row.model) as AiModelRuntimeSnapshot) : undefined,
    appliedAt: row.applied_at,
    status: row.status,
    revertedAt: row.reverted_at ?? undefined,
    revertAttemptId: row.revert_attempt_id ?? undefined,
  };
}

export function createAiSession(userId: string, resumeId: string, title?: string): AiSessionDTO {
  const now = new Date().toISOString();
  const row: AiSessionRow = {
    id: generateId('ai_sess'),
    user_id: userId,
    resume_id: resumeId,
    title: title || '新的 AI 对话',
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    'INSERT INTO ai_sessions (id, user_id, resume_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(row.id, row.user_id, row.resume_id, row.title, row.created_at, row.updated_at);

  return toSessionDTO(row);
}

export function getOwnedAiSession(sessionId: string, userId: string): AiSessionDTO | null {
  const row = db.prepare('SELECT * FROM ai_sessions WHERE id = ?').get(sessionId) as
    | AiSessionRow
    | undefined;
  if (!row || row.user_id !== userId) return null;
  return toSessionDTO(row);
}

export function listAiSessions(userId: string, resumeId: string): AiSessionDTO[] {
  const rows = db
    .prepare(
      'SELECT * FROM ai_sessions WHERE user_id = ? AND resume_id = ? ORDER BY updated_at DESC'
    )
    .all(userId, resumeId) as AiSessionRow[];
  return rows.map(toSessionDTO);
}

export function deleteAiSession(sessionId: string, userId: string): boolean {
  const result = db
    .prepare('DELETE FROM ai_sessions WHERE id = ? AND user_id = ?')
    .run(sessionId, userId);
  return result.changes > 0;
}

export function appendAiMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  thinking?: { label?: string; content?: string }
): AiMessageDTO {
  const now = new Date().toISOString();
  const row: AiMessageRow = {
    id: generateId('ai_msg'),
    session_id: sessionId,
    role,
    content,
    thinking_label: thinking?.label ?? null,
    thinking_content: thinking?.content ?? null,
    created_at: now,
  };

  db.prepare(
    'INSERT INTO ai_messages (id, session_id, role, content, thinking_label, thinking_content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    row.id,
    row.session_id,
    row.role,
    row.content,
    row.thinking_label,
    row.thinking_content,
    row.created_at
  );
  db.prepare('UPDATE ai_sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);

  return toMessageDTO(row);
}

export function appendAiEvent(sessionId: string, event: AiEvent): void {
  db.prepare(
    'INSERT INTO ai_events (id, session_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(
    generateId('ai_evt'),
    sessionId,
    event.type,
    JSON.stringify(event),
    new Date().toISOString()
  );
}

export function listAiMessages(sessionId: string): AiMessageDTO[] {
  const rows = db
    .prepare('SELECT * FROM ai_messages WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId) as AiMessageRow[];
  return rows.map(toMessageDTO);
}

export function listAiProposals(sessionId: string): AiProposalDTO[] {
  const rows = db
    .prepare(
      "SELECT * FROM ai_proposals WHERE session_id = ? AND status = 'proposed' ORDER BY created_at ASC"
    )
    .all(sessionId) as AiProposalRow[];
  return rows.map(toProposalDTO);
}

export function hasUnrevertedAiChanges(sessionId: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM ai_applied_changes WHERE session_id = ? AND status = 'applied' LIMIT 1")
    .get(sessionId);
  return Boolean(row);
}

export function recordAiTurn(input: {
  sessionId: string;
  status: 'completed' | 'failed';
  model: AiModelRuntimeSnapshot;
  events: AiEvent[];
  errorCode?: string;
}): void {
  db.prepare(
    'INSERT INTO ai_turns (id, session_id, status, model, payload, error_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    generateId('ai_turn'),
    input.sessionId,
    input.status,
    JSON.stringify(input.model),
    JSON.stringify({ events: input.events }),
    input.errorCode ?? null,
    new Date().toISOString()
  );
}

export function upsertAiProposal(sessionId: string, proposal: AiEditProposal): AiProposalDTO {
  const now = new Date().toISOString();
  const existing = db
    .prepare('SELECT * FROM ai_proposals WHERE id = ? AND session_id = ?')
    .get(proposal.id, sessionId) as AiProposalRow | undefined;

  if (existing) {
    db.prepare(
      'UPDATE ai_proposals SET payload = ?, risk = ?, updated_at = ? WHERE id = ? AND session_id = ?'
    ).run(JSON.stringify(proposal), proposal.risk, now, proposal.id, sessionId);
  } else {
    db.prepare(
      'INSERT INTO ai_proposals (id, session_id, status, risk, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(proposal.id, sessionId, 'proposed', proposal.risk, JSON.stringify(proposal), now, now);
  }

  const row = db
    .prepare('SELECT * FROM ai_proposals WHERE id = ? AND session_id = ?')
    .get(proposal.id, sessionId) as AiProposalRow;
  return toProposalDTO(row);
}

export function getAiProposal(sessionId: string, proposalId: string): AiProposalDTO | null {
  const row = db
    .prepare('SELECT * FROM ai_proposals WHERE id = ? AND session_id = ?')
    .get(proposalId, sessionId) as AiProposalRow | undefined;
  return row ? toProposalDTO(row) : null;
}

export function updateAiProposalStatus(
  sessionId: string,
  proposalId: string,
  status: AiProposalStatus
): AiProposalDTO | null {
  db.prepare(
    'UPDATE ai_proposals SET status = ?, updated_at = ? WHERE id = ? AND session_id = ?'
  ).run(status, new Date().toISOString(), proposalId, sessionId);
  return getAiProposal(sessionId, proposalId);
}

export function recordAiAppliedChange(input: {
  sessionId: string;
  change: AiAppliedChange;
}): AiAppliedChange {
  const existing = db
    .prepare(
      'SELECT * FROM ai_applied_changes WHERE proposal_id = ? AND session_id = ? ORDER BY applied_at DESC LIMIT 1'
    )
    .get(input.change.proposalId, input.sessionId) as AiAppliedChangeRow | undefined;
  if (existing) return toAppliedChangeDTO(existing);

  const id = generateId('ai_apply');
  db.prepare(
    `INSERT INTO ai_applied_changes
     (id, attempt_id, proposal_id, session_id, resume_id, title, changed_element_ids, command_types,
      before_hash, after_hash, before_document, after_document, model, applied_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'applied')`
  ).run(
    id,
    input.change.attemptId ?? null,
    input.change.proposalId,
    input.sessionId,
    input.change.resumeId,
    input.change.title ?? null,
    JSON.stringify(input.change.changedElementIds),
    JSON.stringify(input.change.commandTypes),
    input.change.beforeHash ?? null,
    input.change.afterHash ?? null,
    input.change.beforeDocument ? JSON.stringify(input.change.beforeDocument) : null,
    input.change.afterDocument ? JSON.stringify(input.change.afterDocument) : null,
    input.change.model ? JSON.stringify(input.change.model) : null,
    input.change.appliedAt
  );
  return getAiAppliedChange(input.sessionId, id) as AiAppliedChange;
}

export function listAiAppliedChanges(sessionId: string): AiAppliedChange[] {
  const rows = db
    .prepare(
      'SELECT * FROM ai_applied_changes WHERE session_id = ? ORDER BY applied_at DESC LIMIT 30'
    )
    .all(sessionId) as AiAppliedChangeRow[];
  return rows.map(toAppliedChangeDTO);
}

export function getAiAppliedChange(sessionId: string, changeId: string): AiAppliedChange | null {
  const row = db
    .prepare('SELECT * FROM ai_applied_changes WHERE id = ? AND session_id = ?')
    .get(changeId, sessionId) as AiAppliedChangeRow | undefined;
  return row ? toAppliedChangeDTO(row) : null;
}

export function getAiAppliedChangeByProposal(
  sessionId: string,
  proposalId: string
): AiAppliedChange | null {
  const row = db
    .prepare(
      'SELECT * FROM ai_applied_changes WHERE proposal_id = ? AND session_id = ? ORDER BY applied_at DESC LIMIT 1'
    )
    .get(proposalId, sessionId) as AiAppliedChangeRow | undefined;
  return row ? toAppliedChangeDTO(row) : null;
}

export function markAiAppliedChangeReverted(
  sessionId: string,
  changeId: string,
  attemptId: string
): AiAppliedChange | null {
  const revertedAt = new Date().toISOString();
  db.prepare(
    "UPDATE ai_applied_changes SET status = 'reverted', reverted_at = ?, revert_attempt_id = ? WHERE id = ? AND session_id = ? AND status = 'applied'"
  ).run(revertedAt, attemptId, changeId, sessionId);
  return getAiAppliedChange(sessionId, changeId);
}

export function restoreAiAppliedChange(
  sessionId: string,
  changeId: string,
  attemptId: string
): AiAppliedChange | null {
  db.prepare(
    "UPDATE ai_applied_changes SET status = 'applied', reverted_at = NULL, revert_attempt_id = NULL WHERE id = ? AND session_id = ? AND status = 'reverted' AND revert_attempt_id = ?"
  ).run(changeId, sessionId, attemptId);
  return getAiAppliedChange(sessionId, changeId);
}

export function cancelAiAppliedChange(
  sessionId: string,
  changeId: string,
  attemptId: string
): string | null {
  const change = getAiAppliedChange(sessionId, changeId);
  if (!change || change.status !== 'applied' || change.attemptId !== attemptId) return null;
  db.transaction(() => {
    db.prepare('DELETE FROM ai_applied_changes WHERE id = ? AND session_id = ?').run(
      changeId,
      sessionId
    );
    db.prepare(
      "UPDATE ai_proposals SET status = 'proposed', updated_at = ? WHERE id = ? AND session_id = ?"
    ).run(new Date().toISOString(), change.proposalId, sessionId);
  })();
  return changeId;
}
