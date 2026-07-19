import type {
  AiEditProposal,
  AiEvent,
  AiEditorContext,
  AiTextIndexItem,
  JsonPatchOperation,
  ViewCommand,
} from '@resume-editor/shared';
import {
  buildAiTextIndex,
  createAiElementSnapshot,
  createDocumentFingerprint,
  extractAiFactTokens,
  findElementLocation,
  generateId,
  isSupportedAiModel,
} from '@resume-editor/shared';

export interface AgentConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  supportsJsonMode?: boolean;
  timeoutMs?: number;
}

export interface ResumeAssistantTurnInput {
  sessionId: string;
  message: string;
  context: AiEditorContext;
  signal?: AbortSignal;
}

export interface LlmProvider {
  invokeJson<T>(input: {
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<T>;
  /** 流式输出面向用户的可审计分析摘要，不暴露模型私有思维链。 */
  streamText?(input: {
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }): AsyncIterable<string>;
  /** 流式返回结构化 JSON 原文，由 Agent 增量提取预览并在结束时严格解析。 */
  streamJson?(input: {
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }): AsyncIterable<string>;
}

interface RewriteOutput {
  title?: string;
  rationale?: string;
  nextContent: string;
  summary?: string[];
}

interface MultiRewriteOutput {
  title?: string;
  rationale?: string;
  summary?: string[];
  edits: Array<{
    elementId: string;
    nextContent: string;
    summary?: string;
  }>;
}

class OpenAICompatibleProvider implements LlmProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxTokens?: number;
  private readonly supportsJsonMode: boolean;
  private readonly timeoutMs: number;

  constructor(config: AgentConfig) {
    if (!config.apiKey) {
      throw new Error('AI_API_KEY 未配置');
    }
    if (config.model && !isSupportedAiModel(config.model)) {
      throw new Error('当前仅支持 deepseek-v4-flash 和 deepseek-v4-pro');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || 'https://api.deepseek.com/v1').replace(/\/$/, '');
    this.model = config.model || 'deepseek-v4-pro';
    this.temperature = config.temperature ?? 0.2;
    this.maxTokens = config.maxTokens;
    this.supportsJsonMode = config.supportsJsonMode ?? true;
    this.timeoutMs = config.timeoutMs ?? 45_000;
  }

  async invokeJson<T>(input: {
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const abort = () => controller.abort();
    input.signal?.addEventListener('abort', abort, { once: true });

    try {
      const body: Record<string, unknown> = {
        model: this.model,
        temperature: input.temperature ?? this.temperature,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      };
      if (this.baseUrl.includes('api.deepseek.com')) {
        body.thinking = { type: 'disabled' };
      }
      if (this.supportsJsonMode) body.response_format = { type: 'json_object' };
      if (input.maxTokens ?? this.maxTokens) body.max_tokens = input.maxTokens ?? this.maxTokens;

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`LLM 请求失败 (${response.status}): ${text.slice(0, 400)}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error('LLM 响应为空');

      return parseJsonObject<T>(content);
    } finally {
      clearTimeout(timeout);
      input.signal?.removeEventListener('abort', abort);
    }
  }

  streamText(input: {
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }): AsyncIterable<string> {
    return this.streamCompletion({ ...input, thinking: true, jsonMode: false });
  }

  streamJson(input: {
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }): AsyncIterable<string> {
    return this.streamCompletion({ ...input, thinking: false, jsonMode: true });
  }

  private async *streamCompletion(input: {
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    thinking: boolean;
    jsonMode: boolean;
  }): AsyncIterable<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const abort = () => controller.abort();
    input.signal?.addEventListener('abort', abort, { once: true });

    try {
      const body: Record<string, unknown> = {
        model: this.model,
        temperature: input.temperature ?? this.temperature,
        stream: true,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      };
      if (this.baseUrl.includes('api.deepseek.com') && this.model.startsWith('deepseek-v4')) {
        body.thinking = { type: input.thinking ? 'enabled' : 'disabled' };
        if (input.thinking) body.reasoning_effort = 'high';
      }
      if (input.jsonMode && this.supportsJsonMode) {
        body.response_format = { type: 'json_object' };
      }
      if (input.maxTokens ?? this.maxTokens) body.max_tokens = input.maxTokens ?? this.maxTokens;

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`LLM 请求失败 (${response.status}): ${text.slice(0, 400)}`);
      }
      if (!response.body) throw new Error('LLM 流式响应为空');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const parseLine = (line: string): string | null => {
        const data = line.startsWith('data:') ? line.slice(5).trim() : '';
        if (!data || data === '[DONE]') return null;
        try {
          const chunk = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          return chunk.choices?.[0]?.delta?.content ?? null;
        } catch {
          // 某些兼容提供方会插入 ping/非 JSON 行，忽略并继续后续完整帧。
          return null;
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const content = parseLine(line);
          if (content) yield content;
        }
        if (done) break;
      }
      if (buffer.trim()) {
        const content = parseLine(buffer);
        if (content) yield content;
      }
    } finally {
      clearTimeout(timeout);
      input.signal?.removeEventListener('abort', abort);
    }
  }
}

function parseJsonObject<T>(content: string): T {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const json = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(json) as T;
}

function decodeJsonStringPrefix(source: string, start: number): string {
  let result = '';
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (char === '"') break;
    if (char !== '\\') {
      result += char;
      continue;
    }
    const escaped = source[index + 1];
    if (!escaped) break;
    const escapes: Record<string, string> = {
      '"': '"',
      '\\': '\\',
      '/': '/',
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
    };
    if (escaped === 'u') {
      const hex = source.slice(index + 2, index + 6);
      if (!/^[\da-fA-F]{4}$/.test(hex)) break;
      result += String.fromCharCode(Number.parseInt(hex, 16));
      index += 5;
      continue;
    }
    result += escapes[escaped] ?? escaped;
    index += 1;
  }
  return result;
}

function extractStreamingNextContents(source: string): string {
  const values: string[] = [];
  const pattern = /"nextContent"\s*:\s*"/g;
  for (const match of source.matchAll(pattern)) {
    values.push(decodeJsonStringPrefix(source, (match.index ?? 0) + match[0].length));
  }
  return values.filter(Boolean).join('\n\n');
}

function summarizeContext(context: AiEditorContext): string {
  const selected = getSelectedTextItems(context);
  const scopedText = context.visibleTextIndex
    .slice(0, context.contextScope === 'document' ? 80 : 30)
    .map(
      (item, index) =>
        `${index + 1}. [${item.elementId}] 第${item.pageIndex + 1}页 ${item.name}: ${item.content.slice(0, 360)}`
    )
    .join('\n');

  return [
    `简历标题: ${context.document.metadata.title}`,
    `上下文范围: ${context.contextScope ?? 'selection'}`,
    `当前页: ${context.activePageIndex + 1}/${context.document.pages.length}`,
    `选中元素: ${context.selectedIds.join(', ') || '无'}`,
    selected.length > 0
      ? `选中文本:\n${selected.map((item) => `[${item.elementId}] ${item.content}`).join('\n')}`
      : '选中文本: 无',
    `相关文本索引:\n${scopedText || '无文本'}`,
  ].join('\n\n');
}

function getSelectedTextItems(context: AiEditorContext): AiTextIndexItem[] {
  const selected = new Set(context.selectedIds);
  return context.visibleTextIndex.filter((item) => selected.has(item.elementId));
}

function getDocumentTextItems(context: AiEditorContext): AiTextIndexItem[] {
  return buildAiTextIndex(context.document);
}

function isPersonalIdentityText(item: AiTextIndexItem): boolean {
  const role = item.semanticRef?.role;
  const section = item.semanticRef?.section;
  const field = item.semanticRef?.field ?? '';
  const name = item.name.toLowerCase();

  if (role === 'sectionTitle' || role === 'metadata' || role === 'decorative') return true;
  if (section === 'personalInfo') return true;
  if (field.includes('name') || field.includes('contact')) return true;
  if (/姓名|名字|联系信息|电话|手机|邮箱|email|phone|contact/i.test(item.name)) return true;
  if (name.includes('name') || name.includes('contact')) return true;

  return false;
}

function isSubstantialResumeText(item: AiTextIndexItem): boolean {
  if (isPersonalIdentityText(item)) return false;
  const compact = item.content.replace(/\s/g, '');
  if (compact.length < 4) return false;
  if (/^(工作经历|项目经历|教育背景|专业技能|技能|个人简介|证书与资质)$/.test(compact))
    return false;
  return true;
}

function resumeOptimizationIntent(message: string): boolean {
  const asksOptimize = /优化|润色|改写|提升|完善|增强|重写|生成/.test(message);
  const wholeResume = /简历|整份|全文|全局|整体|全部|工程师|全栈|后端|前端|架构/.test(message);
  const selectedOnly = /这段|选中|当前文本|这个文本/.test(message);
  return asksOptimize && wholeResume && !selectedOnly;
}

function findTextByKeywords(context: AiEditorContext, keywords: string[]): AiTextIndexItem | null {
  const normalized = keywords.map((keyword) => keyword.toLowerCase()).filter(Boolean);
  if (normalized.length === 0) return null;
  return (
    getDocumentTextItems(context).find((item) => {
      if (!isSubstantialResumeText(item) && !/姓名|名字/.test(normalized.join(' '))) return false;
      const haystack =
        `${item.name}\n${item.content}\n${item.semanticRef?.section ?? ''}\n${item.semanticRef?.field ?? ''}`.toLowerCase();
      return normalized.some((keyword) => haystack.includes(keyword));
    }) ?? null
  );
}

function chooseTargetText(
  context: AiEditorContext,
  message: string
): { target: AiTextIndexItem | null; selected: boolean } {
  const selected = getSelectedTextItems(context);
  if (selected.length > 0) return { target: selected[0], selected: true };

  const keywordTarget = findTextByKeywords(context, extractTargetKeywords(message));
  if (keywordTarget) return { target: keywordTarget, selected: false };

  const activePageTarget = getDocumentTextItems(context).find(
    (item) => item.pageIndex === context.activePageIndex && isSubstantialResumeText(item)
  );
  return { target: activePageTarget ?? null, selected: false };
}

function extractTargetKeywords(message: string): string[] {
  const known = [
    ['技能', 'skills'],
    ['工作', '经历', 'experience'],
    ['项目', 'projects'],
    ['教育', '学历', 'education'],
    ['证书', '认证', 'certifications'],
    ['简介', '总结', 'summary'],
    ['姓名', '名字', 'personalInfo'],
  ];
  return known.flatMap(([cn, alt, semantic]) =>
    message.includes(cn) || message.includes(alt) ? [cn, alt, semantic ?? ''] : []
  );
}

function buildRewriteSystemPrompt(): string {
  return [
    '你是资深招聘官、ATS 简历编辑与事实校验助手。',
    '你只负责精细改写一个目标文本元素，不直接输出解释性 markdown。',
    '必须输出 JSON object，字段: title, rationale, nextContent, summary。',
    'nextContent 必须保留原语言风格，避免编造经历、数字、公司、学校、时间、地点和证书。',
    '每条经历优先呈现“行动 + 对象 + 方法 + 已有结果”，但原文没有结果时不得补造。',
    '删除空洞自评、重复措辞和弱动词，保留 bullet、换行、时间和技术名称。',
    '如果用户明确提供了新事实，可以纳入；否则只能优化措辞、结构、清晰度和岗位匹配。',
    'summary 必须具体说明修改了什么；rationale 说明为什么对招聘官更有效。',
  ].join('\n');
}

function buildRewriteUserPrompt(
  input: ResumeAssistantTurnInput,
  target: AiTextIndexItem,
  analysisSummary?: string
): string {
  return [
    `用户指令:\n${input.message}`,
    `目标文本元素:\n[${target.elementId}] ${target.name}`,
    `原文:\n${target.content}`,
    `编辑器上下文:\n${summarizeContext(input.context)}`,
    analysisSummary ? `深度分析摘要:\n${analysisSummary}` : '',
    '请返回 JSON，例如 {"title":"优化工作经历","rationale":"...","nextContent":"...","summary":["..."]}',
  ].join('\n\n');
}

function extractTargetRole(message: string): string {
  const roleMatch = message.match(
    /(?:基于|以|从|按照).{0,8}([^，。,.]{2,24}?)(?:角度|视角|岗位|方向)/
  );
  if (roleMatch) return roleMatch[1].trim();
  if (/全栈/.test(message)) return '全栈工程师';
  if (/后端/.test(message)) return '后端工程师';
  if (/前端/.test(message)) return '前端工程师';
  return '目标岗位';
}

function pickHolisticTargets(context: AiEditorContext): AiTextIndexItem[] {
  const sectionPriority: Record<string, number> = {
    summary: 0,
    experience: 1,
    projects: 2,
    skills: 3,
    education: 4,
    certifications: 5,
    custom: 6,
  };

  return getDocumentTextItems(context)
    .filter(isSubstantialResumeText)
    .sort((a, b) => {
      const ap = sectionPriority[a.semanticRef?.section ?? 'custom'] ?? 9;
      const bp = sectionPriority[b.semanticRef?.section ?? 'custom'] ?? 9;
      if (ap !== bp) return ap - bp;
      return a.pageIndex - b.pageIndex || a.box.top - b.box.top;
    })
    .slice(0, 12);
}

function buildHolisticSystemPrompt(): string {
  return [
    '你是资深技术招聘官、ATS 简历编辑和事实校验助手。',
    '你要基于目标岗位视角优化简历正文，而不是优化姓名、联系方式、段落标题或装饰文本。',
    '必须输出 JSON object，字段: title, rationale, summary, edits。',
    'edits 是数组，每项包含 elementId, nextContent, summary。',
    '只能改写给出的候选正文元素，不能新增 elementId，不能删除元素。',
    '不能编造公司、学校、时间、数字、项目结果、技术栈和证书；只能强化表达、职责边界、工程价值、全栈协作和可读性。',
    '如果原文缺少量化结果，不要凭空补数字；可改为更清晰的职责与影响描述。',
    '保留原语言，保留 bullet/换行结构，避免把姓名或联系方式写进正文。',
    '按个人简介、工作经历、项目、技能的优先级编辑，避免各段落重复同一句价值描述。',
    '工作/项目条目优先使用强动词并明确责任边界；技能段保持紧凑，不把未出现的关键词硬塞进简历。',
    'summary 必须按元素给出可核对的具体修改，rationale 说明整体策略与取舍。',
  ].join('\n');
}

function buildHolisticUserPrompt(
  input: ResumeAssistantTurnInput,
  targets: AiTextIndexItem[],
  targetRole: string,
  analysisSummary?: string
): string {
  const candidates = targets
    .map((item, index) =>
      [
        `${index + 1}. elementId=${item.elementId}`,
        `name=${item.name}`,
        `semantic=${item.semanticRef ? JSON.stringify(item.semanticRef) : 'none'}`,
        `content:\n${item.content}`,
      ].join('\n')
    )
    .join('\n\n');

  return [
    `用户指令:\n${input.message}`,
    `目标岗位视角: ${targetRole}`,
    `候选正文元素，只能从这些元素中挑选需要优化的项:\n${candidates}`,
    analysisSummary ? `深度分析摘要:\n${analysisSummary}` : '',
    '请返回 JSON，例如 {"title":"全栈工程师视角优化简历","rationale":"...","summary":["..."],"edits":[{"elementId":"...","nextContent":"...","summary":"..."}]}',
  ].join('\n\n');
}

function targetSnapshot(context: AiEditorContext, elementId: string) {
  const location = findElementLocation(context.document, elementId);
  return location ? [createAiElementSnapshot(location.element)] : [];
}

function buildTextReplaceProposal(
  input: ResumeAssistantTurnInput,
  target: AiTextIndexItem,
  output: RewriteOutput,
  fallbackTitle: string,
  selectedTarget: boolean
): AiEditProposal {
  const autoApply = selectedTarget;
  const riskReasons = selectedTarget ? [] : ['未显式选中目标文本，需人工确认'];
  return {
    id: generateId('ai_prop'),
    title: output.title || fallbackTitle,
    rationale: output.rationale || '根据用户指令优化目标文本。',
    risk: selectedTarget ? 'low' : 'medium',
    baseDocumentHash:
      input.context.documentHash ?? createDocumentFingerprint(input.context.document),
    baseRevision: input.context.documentRevision,
    targetSnapshots: targetSnapshot(input.context, target.elementId),
    allowedFacts: extractAiFactTokens(input.message),
    validationProfile: 'reviewed-enhancement',
    commands: [
      {
        type: 'text.replace',
        elementId: target.elementId,
        nextContent: output.nextContent,
      },
    ],
    preview: {
      changedElementIds: [target.elementId],
      summary: output.summary && output.summary.length > 0 ? output.summary : ['改写目标文本内容'],
      beforeAfter: [
        { elementId: target.elementId, before: target.content, after: output.nextContent },
      ],
    },
    requiresConfirmation: !autoApply,
    autoApply,
    riskReasons,
  };
}

function buildHolisticProposal(
  input: ResumeAssistantTurnInput,
  targets: AiTextIndexItem[],
  output: MultiRewriteOutput,
  targetRole: string
): AiEditProposal {
  const targetById = new Map(targets.map((target) => [target.elementId, target]));
  const edits = output.edits
    .map((edit) => ({ ...edit, target: targetById.get(edit.elementId) }))
    .filter((edit): edit is typeof edit & { target: AiTextIndexItem } => Boolean(edit.target))
    .filter(
      (edit) => edit.nextContent.trim() && edit.nextContent.trim() !== edit.target.content.trim()
    )
    .slice(0, 10);

  if (edits.length === 0) {
    throw new Error('LLM 未返回可应用的简历正文优化项');
  }

  const snapshots = edits.flatMap((edit) => targetSnapshot(input.context, edit.elementId));

  return {
    id: generateId('ai_prop'),
    title: output.title || `${targetRole}视角优化简历`,
    rationale: output.rationale || `从${targetRole}视角优化简历正文表达。`,
    risk: 'medium',
    baseDocumentHash:
      input.context.documentHash ?? createDocumentFingerprint(input.context.document),
    baseRevision: input.context.documentRevision,
    targetSnapshots: snapshots,
    allowedFacts: extractAiFactTokens(input.message),
    validationProfile: 'reviewed-enhancement',
    commands: edits.map((edit) => ({
      type: 'text.replace' as const,
      elementId: edit.elementId,
      nextContent: edit.nextContent,
    })),
    preview: {
      changedElementIds: edits.map((edit) => edit.elementId),
      summary:
        output.summary && output.summary.length > 0
          ? output.summary
          : edits.map((edit) => edit.summary || `优化 ${edit.target.name}`),
      beforeAfter: edits.map((edit) => ({
        elementId: edit.elementId,
        before: edit.target.content,
        after: edit.nextContent,
      })),
    },
    requiresConfirmation: true,
    autoApply: false,
    riskReasons: ['整份简历优化涉及多个正文元素，需要人工确认后应用'],
  };
}

function buildAnalysisSystemPrompt(): string {
  return [
    '你是简历质量审核员。输出的是面向用户的简洁分析摘要，不是私有思维链。',
    '请按“目标理解、主要问题、优化策略、事实边界”四个短段输出。',
    '优先检查岗位匹配、信息完整性、重复表达、弱动词、责任边界、可读性与 ATS 关键词。',
    '不得编造原文不存在的经历、数字、技术栈、时间、公司、学校或证书。',
    '不输出 JSON，不输出内部推理步骤，总长度控制在 600 字内。',
  ].join('\n');
}

function buildAnalysisUserPrompt(input: ResumeAssistantTurnInput): string {
  const targets = resumeOptimizationIntent(input.message)
    ? pickHolisticTargets(input.context)
    : chooseTargetText(input.context, input.message).target
      ? [chooseTargetText(input.context, input.message).target as AiTextIndexItem]
      : [];
  return [
    `用户指令:\n${input.message}`,
    `简历上下文:\n${summarizeContext(input.context)}`,
    `本轮候选目标:\n${targets.map((item) => `[${item.elementId}] ${item.name}: ${item.content}`).join('\n\n')}`,
  ].join('\n\n');
}

function viewIntent(input: ResumeAssistantTurnInput): AiEvent[] | null {
  const message = input.message;
  const commands: ViewCommand[] = [];

  if (/助手|AI 面板|对话/.test(message) && /打开|显示|展开/.test(message)) {
    commands.push({ type: 'view.openAssistant' });
  }
  if (/模板/.test(message) && /打开|显示|切到|看看/.test(message)) {
    commands.push({ type: 'view.openLeftPanel', tab: 'templates' });
  }
  if (/图层/.test(message) && /打开|显示|切到|看看/.test(message)) {
    commands.push({ type: 'view.openLeftPanel', tab: 'layers' });
  }
  if (/页面/.test(message) && /打开|显示|切到|看看/.test(message)) {
    commands.push({ type: 'view.openLeftPanel', tab: 'pages' });
  }
  if (/适应|全页|缩放到/.test(message)) {
    commands.push({ type: 'view.zoomToFit' });
  }

  const pageMatch = message.match(/第\s*(\d+)\s*页/);
  if (pageMatch) {
    commands.push({ type: 'view.setActivePage', pageIndex: Math.max(0, Number(pageMatch[1]) - 1) });
  }

  const target = findTextByKeywords(input.context, extractTargetKeywords(message));
  if ((/找到|定位|跳到|选择|查看/.test(message) || commands.length > 0) && target) {
    commands.push({ type: 'view.scrollToElement', elementId: target.elementId });
    commands.push({ type: 'view.selectElements', elementIds: [target.elementId] });
  }

  if (commands.length === 0) return null;
  return [
    { type: 'message.delta', text: '已调整编辑器视图。' },
    ...commands.map((command) => ({ type: 'view.command' as const, command })),
    { type: 'message.done', messageId: generateId('ai_msg') },
  ];
}

function semanticPatchIntent(input: ResumeAssistantTurnInput): AiEvent[] | null {
  if (!input.context.document.resumeData) return null;
  const message = input.message.trim();
  const patch: JsonPatchOperation[] = [];
  const summary: string[] = [];

  const name = message.match(/(?:姓名|名字).{0,8}(?:改为|改成|设为|设置为)\s*([^\s，。]+)/);
  if (name) {
    patch.push({ op: 'replace', path: '/personalInfo/name', value: name[1] });
    summary.push(`姓名改为 ${name[1]}`);
  }

  const email = message.match(
    /(?:邮箱|email).{0,8}(?:改为|改成|设为|设置为)?\s*([\w.-]+@[\w.-]+\.\w+)/i
  );
  if (email) {
    const op = input.context.document.resumeData.personalInfo.email ? 'replace' : 'add';
    patch.push({ op, path: '/personalInfo/email', value: email[1] });
    summary.push(`邮箱改为 ${email[1]}`);
  }

  const phone = message.match(
    /(?:电话|手机|phone).{0,8}(?:改为|改成|设为|设置为)?\s*((?:\+?\d[\d\s().-]{6,}\d))/i
  );
  if (phone) {
    const op = input.context.document.resumeData.personalInfo.phone ? 'replace' : 'add';
    patch.push({ op, path: '/personalInfo/phone', value: phone[1].trim() });
    summary.push(`电话改为 ${phone[1].trim()}`);
  }

  const addSkill = message.match(
    /(?:新增|添加|加入).{0,10}(?:技能|技术栈|技术)\s*[：:]?\s*([^，。]+)/
  );
  if (addSkill) {
    const skills = addSkill[1]
      .split(/[,，、/]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (skills.length > 0) {
      if (input.context.document.resumeData.skills.length === 0) {
        patch.push({
          op: 'add',
          path: '/skills/0',
          value: { category: '技能', items: skills.map((skill) => ({ name: skill })) },
        });
      } else {
        for (const skill of skills) {
          patch.push({ op: 'add', path: '/skills/0/items/-', value: { name: skill } });
        }
      }
      summary.push(`新增技能：${skills.join('、')}`);
    }
  }

  if (patch.length === 0) return null;

  const proposal: AiEditProposal = {
    id: generateId('ai_prop'),
    title: '更新结构化简历信息',
    rationale: '根据用户明确指令修改 ResumeData，并重新生成语义绑定的画布元素。',
    risk: 'medium',
    baseDocumentHash:
      input.context.documentHash ?? createDocumentFingerprint(input.context.document),
    baseRevision: input.context.documentRevision,
    allowedFacts: extractAiFactTokens(input.message),
    commands: [{ type: 'resumeData.patch', patch, relayout: 'document' }],
    preview: {
      changedElementIds: [],
      summary,
    },
    requiresConfirmation: true,
    autoApply: false,
    riskReasons: ['结构化数据修改会触发文档重排，需要人工确认'],
  };

  return [
    { type: 'message.delta', text: '已生成结构化简历修改方案，请确认后应用。' },
    { type: 'message.done', messageId: generateId('ai_msg') },
    { type: 'edit.proposal', proposal },
  ];
}

export class ResumeAssistant {
  constructor(private readonly llm?: LlmProvider) {}

  async runTurn(input: ResumeAssistantTurnInput): Promise<AiEvent[]> {
    const events: AiEvent[] = [];
    for await (const event of this.streamTurn(input)) events.push(event);
    return events;
  }

  async *streamTurn(input: ResumeAssistantTurnInput): AsyncIterable<AiEvent> {
    const viewEvents = viewIntent(input);
    if (viewEvents) {
      for (const event of viewEvents) yield event;
      return;
    }

    const patchEvents = semanticPatchIntent(input);
    if (patchEvents) {
      for (const event of patchEvents) yield event;
      return;
    }

    if (!this.llm?.streamText) throw new Error('当前模型适配器不支持深度分析流');
    let analysisSummary = '';
    yield { type: 'thinking.started', label: '正在深度分析简历内容与岗位匹配' };
    yield {
      type: 'thinking.delta',
      text: '正在确认优化目标、目标岗位和可编辑范围…\n正在检查表达完整性、重复内容与事实边界…\n',
    };
    for await (const delta of this.llm.streamText({
      system: buildAnalysisSystemPrompt(),
      user: buildAnalysisUserPrompt(input),
      temperature: 0.15,
      maxTokens: 900,
      signal: input.signal,
    })) {
      analysisSummary += delta;
      yield { type: 'thinking.delta', text: delta };
    }
    yield { type: 'thinking.done' };

    if (resumeOptimizationIntent(input.message)) {
      if (!this.llm) throw new Error('AI_API_KEY 未配置');
      const targets = pickHolisticTargets(input.context);
      if (targets.length === 0) {
        yield {
          type: 'question',
          question: '当前简历中没有可优化的正文内容。请先导入工作经历、项目经历或个人简介。',
        };
        return;
      }
      const targetRole = extractTargetRole(input.message);
      const request = {
        system: buildHolisticSystemPrompt(),
        user: buildHolisticUserPrompt(input, targets, targetRole, analysisSummary),
        temperature: 0.25,
        signal: input.signal,
      };
      let output: MultiRewriteOutput;
      let streamedPreview = '';
      if (this.llm.streamJson) {
        let raw = '';
        for await (const delta of this.llm.streamJson(request)) {
          raw += delta;
          const nextPreview = extractStreamingNextContents(raw);
          if (
            nextPreview.startsWith(streamedPreview) &&
            nextPreview.length > streamedPreview.length
          ) {
            yield { type: 'message.delta', text: nextPreview.slice(streamedPreview.length) };
            streamedPreview = nextPreview;
          }
        }
        output = parseJsonObject<MultiRewriteOutput>(raw);
      } else {
        output = await this.llm.invokeJson<MultiRewriteOutput>(request);
      }
      if (!Array.isArray(output.edits)) throw new Error('LLM 未返回 edits');
      const proposal = buildHolisticProposal(input, targets, output, targetRole);
      if (!streamedPreview) {
        yield {
          type: 'message.delta',
          text: `已生成${targetRole}视角的简历优化方案，请审阅差异后应用。`,
        };
      }
      yield { type: 'message.done', messageId: generateId('ai_msg') };
      yield { type: 'edit.proposal', proposal };
      return;
    }

    const { target, selected } = chooseTargetText(input.context, input.message);
    if (!target) {
      yield {
        type: 'question',
        question: '当前简历中没有可编辑文本。请先选中一个文本框，或导入/创建简历内容。',
      };
      return;
    }

    if (!this.llm) throw new Error('AI_API_KEY 未配置');

    const request = {
      system: buildRewriteSystemPrompt(),
      user: buildRewriteUserPrompt(input, target, analysisSummary),
      temperature: 0.3,
      signal: input.signal,
    };
    let output: RewriteOutput;
    let streamedPreview = '';
    if (this.llm.streamJson) {
      let raw = '';
      for await (const delta of this.llm.streamJson(request)) {
        raw += delta;
        const nextPreview = extractStreamingNextContents(raw);
        if (
          nextPreview.startsWith(streamedPreview) &&
          nextPreview.length > streamedPreview.length
        ) {
          yield { type: 'message.delta', text: nextPreview.slice(streamedPreview.length) };
          streamedPreview = nextPreview;
        }
      }
      output = parseJsonObject<RewriteOutput>(raw);
    } else {
      output = await this.llm.invokeJson<RewriteOutput>(request);
    }

    if (!output.nextContent || typeof output.nextContent !== 'string') {
      throw new Error('LLM 未返回 nextContent');
    }

    const proposal = buildTextReplaceProposal(input, target, output, '优化简历文本', selected);
    if (!streamedPreview) {
      yield { type: 'message.delta', text: '已完成目标文本的精细优化，请审阅差异。' };
    }
    yield { type: 'message.done', messageId: generateId('ai_msg') };
    yield { type: 'edit.proposal', proposal };
  }
}

export function createOpenAICompatibleProvider(config: AgentConfig): LlmProvider {
  return new OpenAICompatibleProvider(config);
}

export function createResumeAssistant(config: AgentConfig): ResumeAssistant {
  return new ResumeAssistant(config.apiKey ? createOpenAICompatibleProvider(config) : undefined);
}

export async function runResumeAssistantTurn(
  input: ResumeAssistantTurnInput,
  config: AgentConfig
): Promise<AiEvent[]> {
  return createResumeAssistant(config).runTurn(input);
}

export function runResumeAssistantTurnStream(
  input: ResumeAssistantTurnInput,
  config: AgentConfig
): AsyncIterable<AiEvent> {
  return createResumeAssistant(config).streamTurn(input);
}

export default createResumeAssistant;
