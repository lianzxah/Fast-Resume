import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PAGE_CONFIG,
  buildAiTextIndex,
  type AiEditorContext,
  type ResumeDocument,
} from '@resume-editor/shared';
import { createOpenAICompatibleProvider, ResumeAssistant, type LlmProvider } from './index';

class FakeLlmProvider implements LlmProvider {
  calls = 0;
  streamCalls = 0;

  async *streamText(): AsyncIterable<string> {
    this.streamCalls += 1;
    yield '发现经历描述缺少结果量化。';
    yield '将保留事实并强化行动与影响。';
  }

  async invokeJson<T>(input: Parameters<LlmProvider['invokeJson']>[0]): Promise<T> {
    this.calls += 1;
    if (input.user.includes('候选正文元素')) {
      return {
        title: '全栈工程师视角优化简历',
        rationale: '突出工程交付、跨端协作和系统化能力。',
        summary: ['优化工作经历表达'],
        edits: [
          {
            elementId: 'el_text_1',
            nextContent: '主导前后端协同开发，负责核心业务模块交付，并持续优化工程效率。',
            summary: '强化全栈协作与交付价值',
          },
        ],
      } as T;
    }
    return {
      title: '优化文本',
      rationale: '保守润色选中文本',
      nextContent: '主导前端核心模块开发，提升交付效率。',
      summary: ['优化措辞'],
    } as T;
  }
}

class StreamingJsonProvider implements LlmProvider {
  async invokeJson<T>(): Promise<T> {
    throw new Error('streamJson should be used');
  }

  async *streamJson(): AsyncIterable<string> {
    yield '{"title":"优化文本","rationale":"强化表达","nextContent":"主导前端';
    yield '核心模块开发，提升交付效率。","summary":["优化措辞"]}';
  }

  async *streamText(): AsyncIterable<string> {
    yield '确认目标文本并检查事实边界。';
  }
}

function createContext(): AiEditorContext {
  const document: ResumeDocument = {
    id: 'doc_test',
    version: '1.0.0',
    metadata: {
      title: '测试简历',
      author: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    pageConfig: DEFAULT_PAGE_CONFIG,
    pages: [
      {
        id: 'page_1',
        pageNumber: 1,
        elements: [
          {
            id: 'el_name',
            type: 'text',
            name: '姓名',
            semanticRef: { section: 'personalInfo', field: 'name', role: 'itemTitle' },
            left: 60,
            top: 40,
            width: 300,
            height: 40,
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 1,
            content: '张三',
            fontSize: 28,
            fontFamily: 'Microsoft YaHei, sans-serif',
            fontWeight: 'bold',
            fontStyle: 'normal',
            textAlign: 'left',
            lineHeight: 1.3,
            letterSpacing: 0,
            color: '#111111',
            underline: false,
            strikethrough: false,
          },
          {
            id: 'el_text_1',
            type: 'text',
            name: '工作经历',
            semanticRef: {
              section: 'experience',
              itemId: 'exp_1',
              field: 'descriptions',
              role: 'itemBody',
            },
            left: 60,
            top: 80,
            width: 500,
            height: 80,
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 1,
            content: '负责前端开发',
            fontSize: 12,
            fontFamily: 'Microsoft YaHei, sans-serif',
            fontWeight: 'normal',
            fontStyle: 'normal',
            textAlign: 'left',
            lineHeight: 1.6,
            letterSpacing: 0,
            color: '#333333',
            underline: false,
            strikethrough: false,
          },
        ],
      },
    ],
    resumeData: {
      personalInfo: { name: '张三' },
      experience: [],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
      customSections: [],
    },
  };

  return {
    resumeId: 'resume_1',
    document,
    activePageIndex: 0,
    selectedIds: ['el_text_1'],
    viewport: { zoom: 1 },
    visibleTextIndex: buildAiTextIndex(document),
  };
}

describe('ResumeAssistant', () => {
  it('returns an auto-applicable text replacement proposal for selected text', async () => {
    const assistant = new ResumeAssistant(new FakeLlmProvider());
    const events = await assistant.runTurn({
      sessionId: 'ai_sess_1',
      message: '优化这段',
      context: createContext(),
    });

    const proposalEvent = events.find((event) => event.type === 'edit.proposal');

    expect(proposalEvent?.type).toBe('edit.proposal');
    if (proposalEvent?.type !== 'edit.proposal') return;
    expect(proposalEvent.proposal.autoApply).toBe(true);
    expect(proposalEvent.proposal.commands[0]).toMatchObject({
      type: 'text.replace',
      elementId: 'el_text_1',
      nextContent: '主导前端核心模块开发，提升交付效率。',
    });
  });

  it('streams optimized resume content while the structured proposal is generated', async () => {
    const assistant = new ResumeAssistant(new StreamingJsonProvider());
    const events = [];
    for await (const event of assistant.streamTurn({
      sessionId: 'ai_sess_1',
      message: '优化这段',
      context: createContext(),
    })) {
      events.push(event);
    }

    const streamedText = events
      .filter((event) => event.type === 'message.delta')
      .map((event) => (event.type === 'message.delta' ? event.text : ''))
      .join('');
    expect(streamedText).toBe('主导前端核心模块开发，提升交付效率。');
    expect(events.some((event) => event.type === 'edit.proposal')).toBe(true);
  });

  it('handles view commands without calling the model', async () => {
    const llm = new FakeLlmProvider();
    const assistant = new ResumeAssistant(llm);
    const events = await assistant.runTurn({
      sessionId: 'ai_sess_1',
      message: '帮我定位到工作经历',
      context: createContext(),
    });

    expect(llm.calls).toBe(0);
    expect(events.some((event) => event.type === 'view.command')).toBe(true);
  });

  it('streams a user-visible analysis before generating a deep-mode proposal', async () => {
    const llm = new FakeLlmProvider();
    const assistant = new ResumeAssistant(llm);
    const events = [];
    for await (const event of assistant.streamTurn({
      sessionId: 'ai_sess_1',
      message: '深入优化这段经历',
      context: createContext(),
    })) {
      events.push(event);
    }

    expect(llm.streamCalls).toBe(1);
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'thinking.started',
        'thinking.delta',
        'thinking.done',
        'edit.proposal',
      ])
    );
    expect(
      events
        .filter((event) => event.type === 'thinking.delta')
        .map((event) => (event.type === 'thinking.delta' ? event.text : ''))
        .join('')
    ).toContain('强化行动与影响');
  });

  it('creates a confirmed resumeData patch for explicit personal info changes', async () => {
    const assistant = new ResumeAssistant(new FakeLlmProvider());
    const events = await assistant.runTurn({
      sessionId: 'ai_sess_1',
      message: '把姓名改为李四',
      context: createContext(),
    });
    const proposalEvent = events.find((event) => event.type === 'edit.proposal');

    expect(proposalEvent?.type).toBe('edit.proposal');
    if (proposalEvent?.type !== 'edit.proposal') return;
    expect(proposalEvent.proposal.requiresConfirmation).toBe(true);
    expect(proposalEvent.proposal.commands[0]).toMatchObject({
      type: 'resumeData.patch',
      relayout: 'document',
    });
  });

  it('optimizes resume body from a full-stack engineer perspective instead of rewriting the name', async () => {
    const context = createContext();
    context.selectedIds = [];
    const assistant = new ResumeAssistant(new FakeLlmProvider());
    const events = await assistant.runTurn({
      sessionId: 'ai_sess_1',
      message: '基于全栈工程师的角度优化这份简历',
      context,
    });
    const proposalEvent = events.find((event) => event.type === 'edit.proposal');

    expect(proposalEvent?.type).toBe('edit.proposal');
    if (proposalEvent?.type !== 'edit.proposal') return;
    expect(proposalEvent.proposal.requiresConfirmation).toBe(true);
    expect(proposalEvent.proposal.autoApply).toBe(false);
    expect(
      proposalEvent.proposal.commands.map((command) =>
        'elementId' in command ? command.elementId : ''
      )
    ).toEqual(['el_text_1']);
    expect(
      proposalEvent.proposal.commands.some(
        (command) => 'elementId' in command && command.elementId === 'el_name'
      )
    ).toBe(false);
  });
});

describe('DeepSeek V4 runtime', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(['deepseek-v4-flash', 'deepseek-v4-pro'])(
    'runs JSON generation with %s',
    async (model) => {
      const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
          model,
          thinking: { type: 'disabled' },
          response_format: { type: 'json_object' },
        });
        return new Response(
          JSON.stringify({ choices: [{ message: { content: '{"result":"ok"}' } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });
      vi.stubGlobal('fetch', fetchMock);

      const provider = createOpenAICompatibleProvider({
        apiKey: 'test-key',
        baseUrl: 'https://api.deepseek.com/v1',
        model,
        supportsJsonMode: true,
      });
      await expect(provider.invokeJson({ system: 'system', user: 'user' })).resolves.toEqual({
        result: 'ok',
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    }
  );

  it('rejects legacy runtime model names', () => {
    expect(() =>
      createOpenAICompatibleProvider({ apiKey: 'test-key', model: 'deepseek-chat' })
    ).toThrow('当前仅支持 deepseek-v4-flash 和 deepseek-v4-pro');
  });

  it('keeps a final SSE data frame that has no trailing newline', async () => {
    const payload = 'data: {"choices":[{"delta":{"content":"完整尾帧"}}]}';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(payload.slice(0, 23)));
                controller.enqueue(new TextEncoder().encode(payload.slice(23)));
                controller.close();
              },
            }),
            { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
          )
        )
      )
    );
    const provider = createOpenAICompatibleProvider({
      apiKey: 'test-key',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-v4-pro',
    });
    const chunks: string[] = [];
    for await (const chunk of provider.streamText?.({ system: 'system', user: 'user' }) ?? []) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['完整尾帧']);
  });
});
