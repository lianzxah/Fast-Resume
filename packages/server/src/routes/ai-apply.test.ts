import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import {
  DEFAULT_PAGE_CONFIG,
  applyAiEditProposal,
  applyAiTextHeightAdjustments,
  createDocumentFingerprint,
  type AiApplyProposalRequest,
  type AiEditProposal,
  type ResumeDocument,
} from '@resume-editor/shared';

const dataDir = mkdtempSync(join(tmpdir(), 'fast-resume-ai-apply-'));
process.env.DATA_DIR = dataDir;

const document: ResumeDocument = {
  id: 'doc-1',
  version: '1.0.0',
  metadata: {
    title: '测试简历',
    author: '',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  pageConfig: DEFAULT_PAGE_CONFIG,
  pages: [
    {
      id: 'page-1',
      pageNumber: 1,
      elements: [
        {
          id: 'text-1',
          type: 'text',
          name: '正文',
          left: 40,
          top: 80,
          width: 300,
          height: 20,
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
          zIndex: 1,
          content: '负责开发',
          fontSize: 12,
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontWeight: 'normal',
          fontStyle: 'normal',
          textAlign: 'left',
          lineHeight: 1.5,
          letterSpacing: 0,
          color: '#111111',
          underline: false,
          strikethrough: false,
        },
      ],
    },
  ],
};

const proposal: AiEditProposal = {
  id: 'proposal-1',
  title: '优化正文',
  rationale: '验证服务端 checkpoint 重放',
  risk: 'low',
  validationProfile: 'reviewed-enhancement',
  commands: [
    {
      type: 'text.replace',
      elementId: 'text-1',
      nextContent: '负责开发\n负责开发',
    },
  ],
  preview: { changedElementIds: ['text-1'], summary: ['替换正文'] },
  requiresConfirmation: false,
};

let app: Hono;
let token: string;
let closeDatabase: () => void;

beforeAll(async () => {
  const [{ db }, { aiRoutes }, { signToken }, { upsertAiProposal }] = await Promise.all([
    import('../db'),
    import('./ai'),
    import('../services/auth'),
    import('../services/ai-session-store'),
  ]);
  closeDatabase = () => db.close();

  const now = '2026-08-01T00:00:00.000Z';
  db.prepare(
    'INSERT INTO users (id, username, password_hash, role, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('user-1', 'tester', 'unused', 'member', now, now);
  db.prepare(
    'INSERT INTO resumes (id, user_id, title, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('resume-1', 'user-1', '测试简历', 0, now, now);
  db.prepare(
    'INSERT INTO ai_sessions (id, user_id, resume_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('session-1', 'user-1', 'resume-1', '测试会话', now, now);
  upsertAiProposal('session-1', proposal);

  token = signToken({ userId: 'user-1', username: 'tester', role: 'member' });
  app = new Hono();
  app.route('/ai', aiRoutes);
});

afterAll(() => {
  closeDatabase?.();
  rmSync(dataDir, { recursive: true, force: true });
});

function createPayload(): AiApplyProposalRequest {
  const commandResult = applyAiEditProposal(proposal, document);
  const textHeightAdjustments = [{ elementId: 'text-1', height: 36 }];
  const afterDocument = applyAiTextHeightAdjustments(
    proposal,
    commandResult.document,
    textHeightAdjustments
  );

  return {
    attemptId: 'attempt-1',
    resumeId: 'resume-1',
    title: proposal.title,
    commandTypes: ['text.replace'],
    changedElementIds: ['text-1'],
    beforeHash: createDocumentFingerprint(document),
    afterHash: createDocumentFingerprint(afterDocument),
    beforeDocument: document,
    afterDocument,
    textHeightAdjustments,
  };
}

async function applyRequest(body: unknown): Promise<Response> {
  return await app.request('/ai/sessions/session-1/proposals/proposal-1/apply', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('AI proposal apply checkpoint', () => {
  it('requires an explicit text-height adjustment array', async () => {
    const { textHeightAdjustments, ...missingAdjustments } = createPayload();
    expect(textHeightAdjustments).toHaveLength(1);

    const response = await applyRequest(missingAdjustments);
    const body = (await response.json()) as { success: boolean; error?: string };

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: '缺少 AI 文本高度调整结果' });
  });

  it('replays authorized text height and records the matching checkpoint', async () => {
    const response = await applyRequest(createPayload());
    const body = (await response.json()) as {
      data?: { change: { afterDocument: ResumeDocument; afterHash: string } };
    };

    expect(response.status).toBe(200);
    expect(body.data?.change.afterDocument.pages[0].elements[0]).toMatchObject({
      content: '负责开发\n负责开发',
      height: 36,
    });
    expect(body.data?.change.afterHash).toBe(createPayload().afterHash);
  });
});
