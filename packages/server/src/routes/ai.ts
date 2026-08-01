import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type {
  AiAppliedChange,
  AiApplyProposalRequest,
  AiEditorContext,
  AiEvent,
  AiStreamFrame,
  AiTurnRequest,
  ResumeDocument,
  ResumeElement,
} from '@resume-editor/shared';
import {
  applyAiEditProposal as computeAiEditProposal,
  applyAiTextHeightAdjustments,
  createDocumentFingerprint,
  isSupportedAiModel,
} from '@resume-editor/shared';
import { runResumeAssistantTurn, runResumeAssistantTurnStream } from '@resume-editor/ai-agent';
import { db, type ResumeRow } from '../db';
import { authMiddleware, type AuthEnv } from '../middleware/auth';
import { AI_LIMITS } from '../config';
import {
  listAiModelProfiles,
  resolveAiRuntimeConfig,
  saveDefaultAiModelProfile,
  setDefaultAiModelProfile,
} from '../services/ai-model-store';
import {
  appendAiEvent,
  appendAiMessage,
  cancelAiAppliedChange,
  createAiSession,
  deleteAiSession,
  getAiProposal,
  getOwnedAiSession,
  getAiAppliedChange,
  getAiAppliedChangeByProposal,
  hasUnrevertedAiChanges,
  listAiAppliedChanges,
  listAiMessages,
  listAiProposals,
  listAiSessions,
  recordAiAppliedChange,
  recordAiTurn,
  restoreAiAppliedChange,
  markAiAppliedChangeReverted,
  updateAiProposalStatus,
  upsertAiProposal,
} from '../services/ai-session-store';

export const aiRoutes = new Hono<AuthEnv>();

aiRoutes.use('*', authMiddleware);

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function collectTurnThinking(events: AiEvent[]): { label?: string; content?: string } | undefined {
  const label = events.find((event) => event.type === 'thinking.started')?.label;
  const content = events
    .filter(
      (event): event is Extract<AiEvent, { type: 'thinking.delta' }> =>
        event.type === 'thinking.delta'
    )
    .map((event) => event.text)
    .join('');
  return label || content ? { label, content } : undefined;
}

function collectTurnAssistantText(events: AiEvent[], fallback: string): string {
  return (
    events
      .filter(
        (event): event is Extract<AiEvent, { type: 'message.delta' | 'question' }> =>
          event.type === 'message.delta' || event.type === 'question'
      )
      .map((event) => (event.type === 'message.delta' ? event.text : event.question))
      .join('') || fallback
  );
}

function getOwnedResume(resumeId: string, userId: string): ResumeRow | null {
  const row = db.prepare('SELECT * FROM resumes WHERE id = ?').get(resumeId) as
    | ResumeRow
    | undefined;
  if (!row || row.user_id !== userId) return null;
  return row;
}

function enforceRateLimit(userId: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(userId);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (bucket.count >= 20) return false;
  bucket.count += 1;
  return true;
}

function requestTooLarge(c: any, maxBytes = AI_LIMITS.maxRequestBytes): boolean {
  const length = Number(c.req.header('content-length') || '0');
  return Number.isFinite(length) && length > maxBytes;
}

function sanitizeElement(element: ResumeElement): ResumeElement {
  if (element.type === 'image') {
    const src = element.src?.startsWith('data:') ? '[image omitted]' : element.src;
    return { ...element, src };
  }
  if (element.type === 'group') {
    return { ...element, children: element.children.map(sanitizeElement) };
  }
  return element;
}

function sanitizeDocument(document: ResumeDocument): ResumeDocument {
  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      elements: page.elements.map(sanitizeElement),
    })),
  };
}

function sanitizeContext(context: AiEditorContext): AiEditorContext {
  let charBudget = AI_LIMITS.maxVisibleTextChars;
  const visibleTextIndex = context.visibleTextIndex
    .slice(0, AI_LIMITS.maxTextIndexItems)
    .map((item) => {
      const content = item.content.slice(0, Math.max(0, Math.min(item.content.length, charBudget)));
      charBudget -= content.length;
      return { ...item, content };
    })
    .filter((item) => item.content.length > 0);

  return {
    ...context,
    document: sanitizeDocument(context.document),
    visibleTextIndex,
    contextScope:
      context.contextScope ?? (context.selectedIds.length > 0 ? 'selection' : 'activePage'),
  };
}

function aiErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('AI_API_KEY')) return 'AI_CONFIG_MISSING';
  if (message.includes('JSON')) return 'AI_BAD_JSON';
  if (message.includes('abort')) return 'AI_TIMEOUT';
  if (message.includes('LLM 请求失败')) return 'AI_PROVIDER_FAILED';
  return 'AI_FAILED';
}

// ============================================================
// 模型配置
// ============================================================
aiRoutes.get('/config', (c) => {
  return c.json({ success: true, data: listAiModelProfiles(c.get('userId')) });
});

aiRoutes.put('/config/default', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const profile = saveDefaultAiModelProfile(userId, body);
  return c.json({ success: true, data: profile });
});

aiRoutes.put('/config/default-profile', async (c) => {
  const userId = c.get('userId');
  const { profileId } = await c.req.json();
  if (!profileId || typeof profileId !== 'string') {
    return c.json({ success: false, error: '缺少 profileId' }, 400);
  }
  return c.json({ success: true, data: setDefaultAiModelProfile(userId, profileId) });
});

aiRoutes.post('/config/test', async (c) => {
  const body = await c.req.json();
  if (!body.baseUrl || !body.model) {
    return c.json({ success: false, error: '缺少 baseUrl 或 model' }, 400);
  }
  if (!isSupportedAiModel(body.model)) {
    return c.json(
      { success: false, error: '当前仅支持 deepseek-v4-flash 和 deepseek-v4-pro' },
      400
    );
  }
  return c.json({
    success: true,
    data: { ok: true, message: '配置格式有效；发送消息时会进行真实模型调用。' },
  });
});

// ============================================================
// 会话
// ============================================================
aiRoutes.get('/sessions', (c) => {
  const userId = c.get('userId');
  const resumeId = c.req.query('resumeId');
  if (!resumeId) return c.json({ success: false, error: '缺少 resumeId' }, 400);
  if (!getOwnedResume(resumeId, userId))
    return c.json({ success: false, error: '简历不存在' }, 404);

  return c.json({ success: true, data: listAiSessions(userId, resumeId) });
});

aiRoutes.post('/sessions', async (c) => {
  const userId = c.get('userId');
  const { resumeId, title } = await c.req.json();
  if (!resumeId || typeof resumeId !== 'string') {
    return c.json({ success: false, error: '缺少 resumeId' }, 400);
  }
  if (!getOwnedResume(resumeId, userId))
    return c.json({ success: false, error: '简历不存在' }, 404);

  return c.json({ success: true, data: createAiSession(userId, resumeId, title) });
});

aiRoutes.delete('/sessions/:sessionId', (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.param('sessionId');
  const session = getOwnedAiSession(sessionId, userId);
  if (!session) return c.json({ success: false, error: 'AI 会话不存在' }, 404);
  if (hasUnrevertedAiChanges(sessionId)) {
    return c.json(
      { success: false, error: '该会话仍有已应用的 AI 修改，请先回退后再删除会话' },
      409
    );
  }
  const deleted = deleteAiSession(sessionId, userId);
  if (!deleted) return c.json({ success: false, error: 'AI 会话不存在' }, 404);
  return c.json({ success: true, data: { id: sessionId } });
});

aiRoutes.get('/sessions/:sessionId/messages', (c) => {
  const userId = c.get('userId');
  const session = getOwnedAiSession(c.req.param('sessionId'), userId);
  if (!session) return c.json({ success: false, error: 'AI 会话不存在' }, 404);

  return c.json({ success: true, data: listAiMessages(session.id) });
});

aiRoutes.get('/sessions/:sessionId/proposals', (c) => {
  const session = getOwnedAiSession(c.req.param('sessionId'), c.get('userId'));
  if (!session) return c.json({ success: false, error: 'AI 会话不存在' }, 404);
  return c.json({ success: true, data: listAiProposals(session.id) });
});

aiRoutes.post('/sessions/:sessionId/messages/stream', async (c) => {
  const userId = c.get('userId');
  if (!enforceRateLimit(userId))
    return c.json({ success: false, error: 'AI 请求过于频繁，请稍后再试' }, 429);
  if (requestTooLarge(c)) return c.json({ success: false, error: 'AI 请求体过大' }, 413);

  const session = getOwnedAiSession(c.req.param('sessionId'), userId);
  if (!session) return c.json({ success: false, error: 'AI 会话不存在' }, 404);
  if (!getOwnedResume(session.resumeId, userId))
    return c.json({ success: false, error: '简历不存在' }, 404);

  const body = (await c.req.json()) as AiTurnRequest;
  if (!body.message || !body.context) {
    return c.json({ success: false, error: '缺少 message 或 context' }, 400);
  }
  if (body.message.length > AI_LIMITS.maxMessageChars) {
    return c.json({ success: false, error: 'AI 指令过长，请缩短后重试' }, 400);
  }
  if (body.resumeId !== session.resumeId || body.context.resumeId !== session.resumeId) {
    return c.json({ success: false, error: 'resumeId 与会话不匹配' }, 400);
  }

  const runtime = resolveAiRuntimeConfig(userId, body.modelProfileId);
  appendAiMessage(session.id, 'user', body.message);

  return streamSSE(c, async (stream) => {
    const events: import('@resume-editor/shared').AiEvent[] = [];
    let assistantMessagePersisted = false;
    const writeFrame = (frame: AiStreamFrame) => stream.writeSSE({ data: JSON.stringify(frame) });

    try {
      for await (const event of runResumeAssistantTurnStream(
        {
          sessionId: session.id,
          message: body.message,
          context: sanitizeContext(body.context),
          signal: c.req.raw.signal,
        },
        runtime.agentConfig
      )) {
        events.push(event);
        appendAiEvent(session.id, event);
        if (event.type === 'edit.proposal') upsertAiProposal(session.id, event.proposal);
        await writeFrame({ type: 'event', event });
      }

      const assistantText = collectTurnAssistantText(events, '已生成编辑方案。');
      appendAiMessage(session.id, 'assistant', assistantText, collectTurnThinking(events));
      assistantMessagePersisted = true;
      recordAiTurn({ sessionId: session.id, status: 'completed', model: runtime.snapshot, events });
      await writeFrame({
        type: 'done',
        response: { sessionId: session.id, status: 'completed', model: runtime.snapshot },
      });
    } catch (error: any) {
      const message =
        error?.name === 'AbortError' ? 'AI 请求已取消' : error?.message || 'AI 请求失败';
      const event = { type: 'error' as const, message, recoverable: true };
      events.push(event);
      appendAiEvent(session.id, event);
      if (!assistantMessagePersisted) {
        appendAiMessage(
          session.id,
          'assistant',
          collectTurnAssistantText(events, message),
          collectTurnThinking(events)
        );
        assistantMessagePersisted = true;
      }
      recordAiTurn({
        sessionId: session.id,
        status: 'failed',
        model: runtime.snapshot,
        events,
        errorCode: aiErrorCode(error),
      });
      await writeFrame({ type: 'event', event });
      await writeFrame({
        type: 'done',
        response: {
          sessionId: session.id,
          status: 'failed',
          errorCode: aiErrorCode(error),
          model: runtime.snapshot,
        },
      });
    }
  });
});

aiRoutes.post('/sessions/:sessionId/messages', async (c) => {
  const userId = c.get('userId');
  if (!enforceRateLimit(userId))
    return c.json({ success: false, error: 'AI 请求过于频繁，请稍后再试' }, 429);
  if (requestTooLarge(c)) return c.json({ success: false, error: 'AI 请求体过大' }, 413);

  const session = getOwnedAiSession(c.req.param('sessionId'), userId);
  if (!session) return c.json({ success: false, error: 'AI 会话不存在' }, 404);
  if (!getOwnedResume(session.resumeId, userId))
    return c.json({ success: false, error: '简历不存在' }, 404);

  const body = (await c.req.json()) as AiTurnRequest;
  if (!body.message || !body.context) {
    return c.json({ success: false, error: '缺少 message 或 context' }, 400);
  }
  if (body.message.length > AI_LIMITS.maxMessageChars) {
    return c.json({ success: false, error: 'AI 指令过长，请缩短后重试' }, 400);
  }
  if (body.resumeId !== session.resumeId || body.context.resumeId !== session.resumeId) {
    return c.json({ success: false, error: 'resumeId 与会话不匹配' }, 400);
  }

  const runtime = resolveAiRuntimeConfig(userId, body.modelProfileId);
  appendAiMessage(session.id, 'user', body.message);

  try {
    const events = await runResumeAssistantTurn(
      {
        sessionId: session.id,
        message: body.message,
        context: sanitizeContext(body.context),
      },
      runtime.agentConfig
    );

    const assistantText = collectTurnAssistantText(events, '已生成编辑方案。');
    appendAiMessage(session.id, 'assistant', assistantText, collectTurnThinking(events));
    events.forEach((event) => {
      appendAiEvent(session.id, event);
      if (event.type === 'edit.proposal') upsertAiProposal(session.id, event.proposal);
    });
    recordAiTurn({ sessionId: session.id, status: 'completed', model: runtime.snapshot, events });

    return c.json({
      success: true,
      data: { sessionId: session.id, status: 'completed', events, model: runtime.snapshot },
    });
  } catch (error: any) {
    const message = error?.message || 'AI 请求失败';
    const event = { type: 'error' as const, message, recoverable: true };
    appendAiMessage(session.id, 'assistant', message);
    appendAiEvent(session.id, event);
    recordAiTurn({
      sessionId: session.id,
      status: 'failed',
      model: runtime.snapshot,
      events: [event],
      errorCode: aiErrorCode(error),
    });
    return c.json({
      success: true,
      data: {
        sessionId: session.id,
        status: 'failed',
        events: [event],
        errorCode: aiErrorCode(error),
        model: runtime.snapshot,
      },
    });
  }
});

aiRoutes.post('/sessions/:sessionId/proposals/:proposalId/apply', async (c) => {
  if (requestTooLarge(c, AI_LIMITS.maxCheckpointBytes)) {
    return c.json({ success: false, error: 'AI 修改 checkpoint 过大' }, 413);
  }
  const userId = c.get('userId');
  const session = getOwnedAiSession(c.req.param('sessionId'), userId);
  if (!session) return c.json({ success: false, error: 'AI 会话不存在' }, 404);
  if (!getOwnedResume(session.resumeId, userId))
    return c.json({ success: false, error: '简历不存在' }, 404);

  const proposal = getAiProposal(session.id, c.req.param('proposalId'));
  if (!proposal) return c.json({ success: false, error: 'AI 提案不存在' }, 404);

  const body = (await c.req.json()) as Partial<AiApplyProposalRequest>;
  if (!body.attemptId || typeof body.attemptId !== 'string') {
    return c.json({ success: false, error: '缺少应用尝试 token' }, 400);
  }
  if (!body.beforeDocument || !body.afterDocument || !body.beforeHash || !body.afterHash) {
    return c.json({ success: false, error: '缺少 AI 修改 checkpoint' }, 400);
  }
  if (!Array.isArray(body.textHeightAdjustments)) {
    return c.json({ success: false, error: '缺少 AI 文本高度调整结果' }, 400);
  }
  if (
    createDocumentFingerprint(body.beforeDocument) !== body.beforeHash ||
    createDocumentFingerprint(body.afterDocument) !== body.afterHash
  ) {
    return c.json({ success: false, error: 'AI 修改 checkpoint 校验失败' }, 400);
  }
  try {
    const computed = computeAiEditProposal(proposal.proposal, body.beforeDocument);
    const withDerivedLayout = applyAiTextHeightAdjustments(
      proposal.proposal,
      computed.document,
      body.textHeightAdjustments
    );
    if (createDocumentFingerprint(withDerivedLayout) !== body.afterHash) {
      return c.json({ success: false, error: 'AI 修改结果与提案不一致' }, 409);
    }
  } catch (error: any) {
    return c.json({ success: false, error: error?.message || 'AI 提案校验失败' }, 409);
  }
  const existingChange = getAiAppliedChangeByProposal(session.id, proposal.id);
  if (existingChange?.status === 'reverted') {
    return c.json({ success: false, error: '该 AI 提案已回退，不能重复应用' }, 409);
  }
  if (
    existingChange &&
    (existingChange.beforeHash !== body.beforeHash || existingChange.afterHash !== body.afterHash)
  ) {
    return c.json({ success: false, error: '该 AI 提案已使用不同 checkpoint 应用' }, 409);
  }
  const change: AiAppliedChange = {
    attemptId: body.attemptId,
    proposalId: proposal.id,
    resumeId: session.resumeId,
    title: body.title ?? proposal.proposal.title,
    commandTypes: body.commandTypes ?? proposal.proposal.commands.map((command) => command.type),
    changedElementIds: body.changedElementIds ?? proposal.proposal.preview.changedElementIds,
    beforeHash: body.beforeHash,
    afterHash: body.afterHash,
    beforeDocument: body.beforeDocument,
    afterDocument: body.afterDocument,
    model: body.model,
    appliedAt: new Date().toISOString(),
  };
  const { recordedChange, updated } = db.transaction(() => {
    const recordedChange = recordAiAppliedChange({ sessionId: session.id, change });
    const updated = updateAiProposalStatus(session.id, proposal.id, 'applied');
    appendAiEvent(session.id, {
      type: 'edit.applied',
      proposalId: proposal.id,
      changedElementIds: change.changedElementIds,
    });
    return { recordedChange, updated };
  })();
  return c.json({
    success: true,
    data: { proposalStatus: updated?.status ?? 'applied', change: recordedChange },
  });
});

aiRoutes.post('/sessions/:sessionId/proposals/:proposalId/decline', (c) => {
  const userId = c.get('userId');
  const session = getOwnedAiSession(c.req.param('sessionId'), userId);
  if (!session) return c.json({ success: false, error: 'AI 会话不存在' }, 404);
  const proposal = updateAiProposalStatus(session.id, c.req.param('proposalId'), 'declined');
  if (!proposal) return c.json({ success: false, error: 'AI 提案不存在' }, 404);
  return c.json({ success: true, data: proposal });
});

aiRoutes.get('/sessions/:sessionId/changes', (c) => {
  const userId = c.get('userId');
  const session = getOwnedAiSession(c.req.param('sessionId'), userId);
  if (!session) return c.json({ success: false, error: 'AI 会话不存在' }, 404);
  return c.json({ success: true, data: listAiAppliedChanges(session.id) });
});

aiRoutes.post('/sessions/:sessionId/changes/:changeId/cancel', async (c) => {
  const session = getOwnedAiSession(c.req.param('sessionId'), c.get('userId'));
  if (!session) return c.json({ success: false, error: 'AI 会话不存在' }, 404);
  const { attemptId } = await c.req.json();
  if (!attemptId) return c.json({ success: false, error: '缺少应用尝试 token' }, 400);
  const id = cancelAiAppliedChange(session.id, c.req.param('changeId'), attemptId);
  if (!id) return c.json({ success: false, error: 'AI 修改记录不可取消' }, 409);
  return c.json({ success: true, data: { id } });
});

aiRoutes.post('/sessions/:sessionId/changes/:changeId/revert', async (c) => {
  const userId = c.get('userId');
  const session = getOwnedAiSession(c.req.param('sessionId'), userId);
  if (!session) return c.json({ success: false, error: 'AI 会话不存在' }, 404);
  const change = getAiAppliedChange(session.id, c.req.param('changeId'));
  if (!change) return c.json({ success: false, error: 'AI 修改记录不存在' }, 404);
  if (change.status === 'reverted') return c.json({ success: true, data: change });
  const { attemptId } = await c.req.json();
  if (!attemptId) return c.json({ success: false, error: '缺少回退尝试 token' }, 400);
  const reverted = markAiAppliedChangeReverted(session.id, c.req.param('changeId'), attemptId);
  return c.json({ success: true, data: reverted });
});

aiRoutes.post('/sessions/:sessionId/changes/:changeId/restore', async (c) => {
  const session = getOwnedAiSession(c.req.param('sessionId'), c.get('userId'));
  if (!session) return c.json({ success: false, error: 'AI 会话不存在' }, 404);
  const change = getAiAppliedChange(session.id, c.req.param('changeId'));
  if (!change) return c.json({ success: false, error: 'AI 修改记录不存在' }, 404);
  if (change.status === 'applied') return c.json({ success: true, data: change });
  const { attemptId } = await c.req.json();
  if (!attemptId) return c.json({ success: false, error: '缺少回退尝试 token' }, 400);
  return c.json({
    success: true,
    data: restoreAiAppliedChange(session.id, c.req.param('changeId'), attemptId),
  });
});
