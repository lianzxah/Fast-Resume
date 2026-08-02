import React, { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Eye,
  FileSearch,
  FileText,
  Grid3X3,
  History,
  Home,
  Layers3,
  LayoutTemplate,
  ListChecks,
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Save,
  Search,
  Send,
  Settings2,
  Sparkles,
  SquarePen,
  Target,
  Upload,
  UserRound,
  WandSparkles,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';

/**
 * PROTOTYPE — throwaway UI used to answer:
 * “How should a resume-generation Solo mode fit the current editor?”
 * Three variants live on /prototype/solo and switch with ?variant=A|B|C.
 */

type VariantKey = 'A' | 'B' | 'C';

const VARIANTS: Array<{ key: VariantKey; name: string }> = [
  { key: 'A', name: '任务指挥台' },
  { key: 'B', name: '阶段式工作流' },
  { key: 'C', name: '画布增强模式' },
];

const WORK_STEPS = [
  { title: '理解目标岗位', detail: '提取能力模型与关键词', status: 'done' },
  { title: '盘点现有素材', detail: '简历、项目说明、补充信息', status: 'done' },
  { title: '规划简历结构', detail: '确定取舍与内容顺序', status: 'active' },
  { title: '生成整份简历', detail: '逐段撰写并匹配版式', status: 'idle' },
  { title: '一致性检查', detail: '事实、时间线、ATS 关键词', status: 'idle' },
] as const;

const cn = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(' ');

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  className?: string;
}

const IconButton = ({ icon: Icon, label, active, className }: IconButtonProps) => (
  <button
    type="button"
    title={label}
    className={cn(
      'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900',
      active && 'bg-blue-600 text-white hover:bg-blue-600 hover:text-white',
      className
    )}
  >
    <Icon className="h-4 w-4" />
  </button>
);

const Brand = () => (
  <div className="flex shrink-0 items-center gap-2.5 font-semibold text-slate-900">
    <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-xs font-bold text-white shadow-sm">
      F
    </div>
    <span className="text-[13px] text-blue-700">Fast Resume</span>
  </div>
);

interface PrototypeTopBarProps {
  modeLabel: string;
  running: boolean;
  onToggleRunning: () => void;
  compact?: boolean;
}

const PrototypeTopBar = ({
  modeLabel,
  running,
  onToggleRunning,
  compact = false,
}: PrototypeTopBarProps) => (
  <header className="flex h-11 shrink-0 items-center border-b border-slate-200 bg-white px-3">
    <Brand />
    {!compact ? (
      <nav className="ml-5 flex items-center gap-1 text-xs text-slate-600">
        {['文件', '编辑', '视图', '插入'].map((item) => (
          <button key={item} type="button" className="rounded px-2 py-1.5 hover:bg-slate-100">
            {item}
          </button>
        ))}
      </nav>
    ) : null}
    <div className="mx-auto flex min-w-0 items-center gap-2 text-xs text-slate-500">
      <FileText className="h-3.5 w-3.5" />
      <span className="max-w-52 truncate font-medium text-slate-700">张三 · 高级前端工程师</span>
      <span>/</span>
      <span className="text-violet-600">{modeLabel}</span>
    </div>
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="hidden rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-500 xl:inline-flex">
        deepseek-v4-pro
      </span>
      <button
        type="button"
        onClick={onToggleRunning}
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition',
          running
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
        )}
      >
        {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        {running ? 'Solo 执行中' : '继续执行'}
      </button>
      <IconButton icon={Save} label="保存" />
      <div className="ml-0.5 rounded border border-violet-200 bg-violet-50 px-1.5 py-1 text-[9px] font-semibold tracking-wide text-violet-600">
        PROTOTYPE
      </div>
    </div>
  </header>
);

const StatusDot = ({ status }: { status: (typeof WORK_STEPS)[number]['status'] }) => {
  if (status === 'done') {
    return (
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
        <Check className="h-3 w-3" />
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className="relative grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-600 text-white ring-4 ring-blue-100">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
      </span>
    );
  }
  return <span className="h-5 w-5 shrink-0 rounded-full border-2 border-slate-200 bg-white" />;
};

interface MockResumeProps {
  scale?: 'small' | 'medium' | 'large';
  showAnnotations?: boolean;
  className?: string;
}

const MockResume = ({ scale = 'large', showAnnotations = false, className }: MockResumeProps) => {
  const widthClass =
    scale === 'small' ? 'w-[310px]' : scale === 'medium' ? 'w-[420px]' : 'w-[500px]';

  return (
    <div className={cn('relative', widthClass, className)}>
      <article className="aspect-[210/297] w-full overflow-hidden bg-white text-slate-700 shadow-[0_18px_60px_rgba(15,23,42,0.16)] ring-1 ring-slate-200">
        <div className="bg-gradient-to-r from-blue-800 to-blue-700 px-[8%] py-[7%] text-white">
          <div className="text-[clamp(18px,2.5vw,30px)] font-semibold tracking-wide">张三</div>
          <div className="mt-[2%] text-[clamp(7px,1vw,11px)] text-blue-100">
            高级前端工程师 · 5 年经验 · 上海
          </div>
        </div>
        <div className="px-[8%] py-[5%] text-[clamp(6px,.72vw,9px)] leading-[1.65]">
          <div className="flex gap-[3%] border-b border-slate-100 pb-[3%] text-slate-500">
            <span>138-0000-0000</span>
            <span>zhangsan@email.com</span>
            <span>github.com/zhangsan</span>
          </div>
          <ResumeSection title="职业概要">
            5 年大型 Web 应用研发经验，主导组件平台与性能体系建设。擅长 React、TypeScript
            与工程化治理，能够将复杂业务拆解为可复用的前端基础能力。
          </ResumeSection>
          <ResumeSection title="核心能力">
            <div className="grid grid-cols-2 gap-x-[6%] gap-y-[1%]">
              <span>• React / TypeScript / Next.js</span>
              <span>• 设计系统与组件平台</span>
              <span>• 性能优化与稳定性治理</span>
              <span>• 团队协作与技术方案评审</span>
            </div>
          </ResumeSection>
          <ResumeSection title="工作经历">
            <div className="flex justify-between font-semibold text-slate-800">
              <span>XX 科技有限公司 · 高级前端工程师</span>
              <span className="font-normal text-slate-400">2022.03 — 至今</span>
            </div>
            <div className="mt-[1.4%] space-y-[.7%]">
              <p>• 主导 20+ 业务线组件平台升级，交付周期缩短 35%，线上缺陷下降 28%</p>
              <p>• 重构核心工作台渲染链路，首屏时间从 3.2s 降至 1.4s</p>
              <p>• 建立性能监控与质量门禁，覆盖 90% 核心页面和 40+ 日常发布</p>
            </div>
            <div className="mt-[3%] flex justify-between font-semibold text-slate-800">
              <span>YY 互联 · 前端工程师</span>
              <span className="font-normal text-slate-400">2020.07 — 2022.02</span>
            </div>
            <p className="mt-[1.4%]">
              • 负责数据产品核心模块，沉淀 12 个复用能力并推动设计规范落地
            </p>
          </ResumeSection>
          <ResumeSection title="项目经历">
            <div className="font-semibold text-slate-800">企业级可视化搭建平台</div>
            <p className="mt-[1%]">
              负责画布内核和多人协作链路，支持 60+ 模板、千级节点编辑与分钟级发布。
            </p>
          </ResumeSection>
          <ResumeSection title="教育背景">
            <div className="flex justify-between">
              <strong className="text-slate-800">XX 大学 · 计算机科学与技术 · 本科</strong>
              <span className="text-slate-400">2016.09 — 2020.06</span>
            </div>
          </ResumeSection>
        </div>
      </article>
      {showAnnotations ? (
        <>
          <div className="absolute -right-5 top-[33%] flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-[10px] font-bold text-white shadow-lg">
            3
          </div>
          <div className="absolute -left-6 top-[51%] flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-[10px] font-bold text-white shadow-lg">
            AI
          </div>
        </>
      ) : null}
    </div>
  );
};

const ResumeSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mt-[4.2%]">
    <div className="mb-[1.5%] flex items-center gap-[2%] text-[1.25em] font-semibold text-blue-700">
      <span className="h-[1.2em] w-[3px] bg-blue-600" />
      {title}
    </div>
    <div>{children}</div>
  </section>
);

const CanvasToolbar = () => (
  <div className="flex h-10 shrink-0 items-center border-b border-slate-200 bg-white px-3">
    <div className="flex items-center gap-1">
      <IconButton icon={SquarePen} label="选择" active />
      <IconButton icon={FileText} label="文本" />
      <IconButton icon={Layers3} label="形状" />
      <IconButton icon={Upload} label="图片" />
    </div>
    <div className="ml-auto flex items-center gap-0.5 border-l border-slate-200 pl-2">
      <IconButton icon={ZoomOut} label="缩小" />
      <span className="w-12 text-center text-[11px] text-slate-500">82%</span>
      <IconButton icon={ZoomIn} label="放大" />
      <IconButton icon={Maximize2} label="适应窗口" />
    </div>
  </div>
);

const WorkspaceBackground = ({ children }: { children: ReactNode }) => (
  <div
    className="relative flex min-h-0 flex-1 items-start justify-center overflow-auto px-8 py-8"
    style={{
      backgroundColor: '#f2f4f8',
      backgroundImage: 'radial-gradient(#cbd5e1 0.65px, transparent 0.65px)',
      backgroundSize: '20px 20px',
    }}
  >
    {children}
  </div>
);

const SoloPrompt = () => (
  <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-50">
    <button
      type="button"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
    >
      <Plus className="h-4 w-4" />
    </button>
    <textarea
      rows={2}
      defaultValue="生成时强调复杂项目的业务影响，保留所有可验证数据。"
      className="min-h-10 flex-1 resize-none bg-transparent px-1 py-1 text-xs leading-5 text-slate-700 outline-none"
      aria-label="补充 Solo 指令"
    />
    <button
      type="button"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-600 text-white hover:bg-blue-700"
    >
      <Send className="h-4 w-4" />
    </button>
  </div>
);

const VariantA = () => {
  const [running, setRunning] = useState(true);

  return (
    <div className="flex h-screen min-w-[1120px] flex-col overflow-hidden bg-white text-slate-900">
      <PrototypeTopBar
        modeLabel="Solo · 任务指挥台"
        running={running}
        onToggleRunning={() => setRunning((value) => !value)}
      />
      <main className="grid min-h-0 flex-1 grid-cols-[286px_minmax(500px,1fr)_330px]">
        <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50/80">
          <div className="border-b border-slate-200 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                <Target className="h-4 w-4 text-blue-600" />
                本次目标
              </div>
              <button type="button" className="text-[10px] text-blue-600 hover:underline">
                编辑
              </button>
            </div>
            <p className="text-xs font-medium leading-5 text-slate-700">
              基于高级前端工程师 JD，生成一份突出架构、性能与团队影响力的两页中文简历。
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['目标：高级前端', '2 页以内', 'ATS 友好'].map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-white px-2 py-1 text-[10px] text-slate-500 ring-1 ring-slate-200"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="mb-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[.14em] text-slate-400">
              <span>执行计划</span>
              <span className="text-blue-600">2 / 5</span>
            </div>
            <div className="space-y-0.5">
              {WORK_STEPS.map((step, index) => (
                <button
                  key={step.title}
                  type="button"
                  className={cn(
                    'relative flex w-full gap-3 rounded-xl px-2 py-2.5 text-left transition',
                    step.status === 'active'
                      ? 'bg-white shadow-sm ring-1 ring-blue-100'
                      : 'hover:bg-white/80'
                  )}
                >
                  {index < WORK_STEPS.length - 1 ? (
                    <span className="absolute left-[17px] top-8 h-7 w-px bg-slate-200" />
                  ) : null}
                  <StatusDot status={step.status} />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        'block text-xs font-medium',
                        step.status === 'idle' && 'text-slate-400'
                      )}
                    >
                      {step.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                      {step.detail}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-slate-600">
              <span className="flex items-center gap-1.5">
                <FileSearch className="h-3.5 w-3.5 text-violet-500" /> 参考上下文
              </span>
              <span className="text-slate-400">4 项</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[10px] text-slate-500">
              <div className="rounded-lg border border-slate-200 bg-white px-2 py-2">现有简历</div>
              <div className="rounded-lg border border-slate-200 bg-white px-2 py-2">目标 JD</div>
              <div className="rounded-lg border border-slate-200 bg-white px-2 py-2">项目素材</div>
              <div className="rounded-lg border border-dashed border-slate-300 px-2 py-2 text-center">
                + 补充
              </div>
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col">
          <CanvasToolbar />
          <WorkspaceBackground>
            <div className="relative pb-16">
              <MockResume scale="large" showAnnotations />
              <div className="absolute -right-12 top-[31%] w-48 rounded-xl border border-emerald-200 bg-white p-3 shadow-xl">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> 已写入 3 项量化结果
                </div>
                <p className="mt-1.5 text-[10px] leading-4 text-slate-500">
                  来自项目素材，均标记为可验证信息。
                </p>
              </div>
            </div>
          </WorkspaceBackground>
          <div className="border-t border-slate-200 bg-white px-4 py-3">
            <SoloPrompt />
          </div>
        </section>

        <aside className="flex min-h-0 flex-col border-l border-slate-200 bg-white">
          <div className="flex h-10 shrink-0 items-center border-b border-slate-200 px-3">
            <Sparkles className="mr-2 h-4 w-4 text-violet-600" />
            <span className="text-xs font-semibold">Solo 执行动态</span>
            <button type="button" className="ml-auto text-slate-400 hover:text-slate-700">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-800">
                <BrainCircuit className="h-4 w-4" /> 正在规划简历结构
              </div>
              <p className="mt-2 text-[11px] leading-5 text-blue-700/80">
                目标岗位强调“复杂系统建设”与“团队影响力”。我将项目经历提前，并压缩弱相关教育信息。
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-blue-100">
                <div className="h-full w-[62%] rounded-full bg-blue-600" />
              </div>
              <div className="mt-1.5 flex justify-between text-[9px] text-blue-500">
                <span>结构草案 3 / 5</span>
                <span>约 1 分钟</span>
              </div>
            </div>

            <div className="mt-4 space-y-4 border-l border-slate-200 pl-4">
              <ActivityItem time="10:42" icon={Search} title="完成目标岗位分析">
                命中 18 个关键能力词，其中 7 个已被现有经历支撑。
              </ActivityItem>
              <ActivityItem time="10:43" icon={FileText} title="读取现有简历">
                发现 12 条可复用经历，4 条缺少量化结果。
              </ActivityItem>
              <ActivityItem time="10:44" icon={WandSparkles} title="生成内容策略" active>
                正在比较“技术深度优先”和“业务影响优先”两套结构。
              </ActivityItem>
            </div>

            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                <ClipboardCheck className="h-4 w-4" /> 需要你确认
              </div>
              <p className="mt-2 text-[11px] leading-5 text-amber-800/80">
                “首屏时间降低 56%”来自你的项目笔记，是否可以公开写入？
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="h-7 flex-1 rounded-lg border border-amber-200 bg-white text-[10px] text-amber-800"
                >
                  不写入
                </button>
                <button
                  type="button"
                  className="h-7 flex-1 rounded-lg bg-amber-600 text-[10px] font-medium text-white"
                >
                  确认可用
                </button>
              </div>
            </div>
          </div>
        </aside>
      </main>
      <PrototypeStatusBar label="Solo 任务 · 运行中" />
    </div>
  );
};

const ActivityItem = ({
  time,
  icon: Icon,
  title,
  active = false,
  children,
}: {
  time: string;
  icon: LucideIcon;
  title: string;
  active?: boolean;
  children: ReactNode;
}) => (
  <div className="relative">
    <span
      className={cn(
        'absolute -left-[23px] top-0 grid h-4 w-4 place-items-center rounded-full ring-4 ring-white',
        active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
      )}
    >
      <Icon className="h-2.5 w-2.5" />
    </span>
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-semibold text-slate-700">{title}</span>
      <span className="text-[9px] text-slate-400">{time}</span>
    </div>
    <p className="mt-1 text-[10px] leading-4 text-slate-500">{children}</p>
  </div>
);

const VariantB = () => {
  const [running, setRunning] = useState(true);
  const [activeStage, setActiveStage] = useState(2);
  const stages = ['目标', '素材', '策略', '生成', '校验', '交付'];

  return (
    <div className="flex h-screen min-w-[1120px] flex-col overflow-hidden bg-slate-50 text-slate-900">
      <PrototypeTopBar
        modeLabel="Solo · 阶段式工作流"
        running={running}
        onToggleRunning={() => setRunning((value) => !value)}
      />
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center">
          {stages.map((stage, index) => (
            <React.Fragment key={stage}>
              <button
                type="button"
                onClick={() => setActiveStage(index)}
                className="group flex min-w-20 flex-col items-center gap-1.5"
              >
                <span
                  className={cn(
                    'grid h-7 w-7 place-items-center rounded-full border text-[10px] font-semibold transition',
                    index < activeStage && 'border-emerald-500 bg-emerald-500 text-white',
                    index === activeStage &&
                      'border-blue-600 bg-blue-600 text-white ring-4 ring-blue-100',
                    index > activeStage &&
                      'border-slate-200 bg-white text-slate-400 group-hover:border-blue-300'
                  )}
                >
                  {index < activeStage ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span
                  className={cn(
                    'text-[10px]',
                    index === activeStage ? 'font-semibold text-blue-700' : 'text-slate-500'
                  )}
                >
                  {stage}
                </span>
              </button>
              {index < stages.length - 1 ? (
                <span
                  className={cn(
                    'mb-4 h-px flex-1',
                    index < activeStage ? 'bg-emerald-400' : 'bg-slate-200'
                  )}
                />
              ) : null}
            </React.Fragment>
          ))}
        </div>
      </div>

      <main className="grid min-h-0 flex-1 grid-cols-[72px_minmax(620px,1fr)_370px]">
        <aside className="flex flex-col items-center gap-2 border-r border-slate-200 bg-white py-3">
          <IconButton icon={Home} label="返回" />
          <span className="my-1 h-px w-8 bg-slate-200" />
          <IconButton icon={Target} label="目标" />
          <IconButton icon={FileSearch} label="素材" />
          <IconButton icon={BrainCircuit} label="策略" active />
          <IconButton icon={WandSparkles} label="生成" />
          <IconButton icon={ClipboardCheck} label="检查" />
          <span className="mt-auto" />
          <IconButton icon={History} label="任务历史" />
          <IconButton icon={Settings2} label="设置" />
        </aside>

        <section className="min-h-0 overflow-y-auto px-6 py-5">
          <div className="mx-auto max-w-4xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-violet-600">
                  <Sparkles className="h-3.5 w-3.5" /> 第 3 阶段 · 内容策略
                </div>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  先决定怎么写，再生成整份简历
                </h1>
                <p className="mt-1.5 max-w-2xl text-xs leading-5 text-slate-500">
                  Solo 已综合目标职位与 4 份素材，下面是本次生成将遵循的内容策略。
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600 shadow-sm hover:bg-slate-50"
              >
                调整策略
              </button>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <StrategyCard
                icon={BriefcaseBusiness}
                label="岗位画像"
                value="高级前端 / 平台方向"
                accent="blue"
              />
              <StrategyCard
                icon={FileText}
                label="目标长度"
                value="2 页 · 约 950 字"
                accent="violet"
              />
              <StrategyCard
                icon={Eye}
                label="表达风格"
                value="结果优先 · 克制专业"
                accent="emerald"
              />
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-blue-600" />
                  <h2 className="text-sm font-semibold">简历内容蓝图</h2>
                </div>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700">
                  AI 已规划
                </span>
              </div>
              <div className="mt-4 grid grid-cols-[1fr_1.2fr] gap-5">
                <div className="space-y-2">
                  {[
                    ['职业概要', '用 3 句话建立岗位匹配度', '8%'],
                    ['核心能力', '围绕平台、性能、协作分组', '12%'],
                    ['工作经历', '保留 2 段经历，强化成果', '42%'],
                    ['项目经历', '展开 1 个复杂项目', '28%'],
                    ['教育背景', '压缩为单行', '10%'],
                  ].map(([title, description, width], index) => (
                    <button
                      key={title}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition',
                        index === 2
                          ? 'border-blue-200 bg-blue-50/70'
                          : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                      )}
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">
                        0{index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-slate-700">{title}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                          {description}
                        </span>
                      </span>
                      <span className="text-[10px] text-slate-400">{width}</span>
                    </button>
                  ))}
                </div>
                <div className="rounded-xl bg-slate-950 p-4 text-slate-200">
                  <div className="flex items-center gap-2 text-xs font-semibold text-white">
                    <BrainCircuit className="h-4 w-4 text-violet-400" /> Solo 的取舍依据
                  </div>
                  <div className="mt-4 space-y-4 text-[11px] leading-5 text-slate-400">
                    <Reason number="01" title="项目经历提前">
                      JD 对平台建设和复杂交互权重高，搭建平台比常规业务经历更能建立差异。
                    </Reason>
                    <Reason number="02" title="删除泛化描述">
                      “负责日常开发”等 5 条内容没有事实增量，将为量化结果让出空间。
                    </Reason>
                    <Reason number="03" title="保留事实边界">
                      4 个缺少来源的数据会标为待确认，不会直接写入最终简历。
                    </Reason>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-700">
                  <UserRound className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-amber-900">生成前，只差 1 个信息</div>
                  <div className="mt-0.5 text-[10px] text-amber-800/70">
                    你在组件平台项目中主要负责架构方案，还是落地执行？
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-[10px] text-amber-800"
                >
                  稍后补充
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-amber-600 px-3 py-2 text-[10px] font-medium text-white"
                >
                  现在回答
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col border-l border-slate-200 bg-white">
          <div className="flex h-11 items-center border-b border-slate-200 px-3">
            <span className="text-xs font-semibold">预计生成结果</span>
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">
              第 1 / 2 页
            </span>
            <div className="ml-auto flex gap-1">
              <IconButton icon={Eye} label="预览" />
              <IconButton icon={MoreHorizontal} label="更多" />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-slate-100 px-7 py-5">
            <MockResume scale="small" />
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold text-slate-700">内容覆盖预测</span>
                <span className="text-emerald-600">良好</span>
              </div>
              <div className="mt-2 flex gap-1">
                {[95, 78, 88, 66, 84, 74, 90, 68].map((height, index) => (
                  <span
                    key={`${height}-${index}`}
                    className="flex-1 rounded-sm bg-blue-100"
                    style={{ height: `${Math.max(4, height / 9)}px` }}
                  >
                    <span
                      className="block h-full rounded-sm bg-blue-500"
                      style={{ width: `${height}%` }}
                    />
                  </span>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[9px] text-slate-400">
                <span>ATS 关键词 18 / 23</span>
                <span>事实完整度 86%</span>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-200 p-3">
            <button
              type="button"
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <WandSparkles className="h-4 w-4" /> 确认策略并生成
            </button>
          </div>
        </aside>
      </main>
      <PrototypeStatusBar label={`Solo 工作流 · 阶段 ${activeStage + 1} / 6`} />
    </div>
  );
};

const StrategyCard = ({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  accent: 'blue' | 'violet' | 'emerald';
}) => {
  const accents = {
    blue: 'bg-blue-50 text-blue-600',
    violet: 'bg-violet-50 text-violet-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className={cn('grid h-9 w-9 place-items-center rounded-xl', accents[accent])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-wide text-slate-400">{label}</div>
        <div className="mt-0.5 truncate text-xs font-semibold text-slate-700">{value}</div>
      </div>
    </div>
  );
};

const Reason = ({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) => (
  <div className="grid grid-cols-[24px_1fr] gap-2.5">
    <span className="font-mono text-[10px] text-violet-400">{number}</span>
    <div>
      <div className="font-medium text-slate-200">{title}</div>
      <p className="mt-0.5">{children}</p>
    </div>
  </div>
);

const TEMPLATE_CARDS = [
  ['经典简约', 'from-slate-800 to-slate-700'],
  ['现代商务', 'from-blue-700 to-blue-600'],
  ['创意设计', 'from-violet-600 to-fuchsia-500'],
  ['学术科研', 'from-emerald-700 to-teal-600'],
];

const VariantC = () => {
  const [running, setRunning] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(true);

  return (
    <div className="flex h-screen min-w-[1120px] flex-col overflow-hidden bg-white text-slate-900">
      <PrototypeTopBar
        modeLabel="Solo · 画布增强"
        running={running}
        onToggleRunning={() => setRunning((value) => !value)}
      />
      <main className="grid min-h-0 flex-1 grid-cols-[230px_minmax(520px,1fr)_280px]">
        <aside className="grid min-h-0 grid-cols-[42px_1fr] border-r border-slate-200 bg-white">
          <div className="flex flex-col items-center gap-1 border-r border-slate-200 py-2">
            <IconButton icon={LayoutTemplate} label="模板" active />
            <IconButton icon={Grid3X3} label="组件" />
            <IconButton icon={Layers3} label="图层" />
            <IconButton icon={FileText} label="页面" />
            <span className="mt-auto" />
            <IconButton icon={Sparkles} label="Solo" className="text-violet-600" />
          </div>
          <div className="min-h-0 overflow-y-auto p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold">模板</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATE_CARDS.map(([name, gradient], index) => (
                <button
                  key={name}
                  type="button"
                  className={cn(
                    'rounded-xl border bg-slate-50 p-1.5 text-left transition',
                    index === 1
                      ? 'border-blue-500 ring-2 ring-blue-100'
                      : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <div className="aspect-[3/4] rounded-md bg-white p-2 shadow-sm">
                    <div className={cn('h-4 rounded-sm bg-gradient-to-r', gradient)} />
                    <div className="mt-2 h-1 w-8 rounded bg-slate-300" />
                    <div className="mt-1 h-1 w-12 rounded bg-slate-200" />
                    <div className="mt-3 h-1 w-10 rounded bg-slate-300" />
                    <div className="mt-1 h-1 w-full rounded bg-slate-100" />
                    <div className="mt-1 h-1 w-4/5 rounded bg-slate-100" />
                  </div>
                  <span className="mt-1.5 block text-center text-[9px] text-slate-600">{name}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="relative flex min-h-0 min-w-0 flex-col">
          <CanvasToolbar />
          <WorkspaceBackground>
            <MockResume scale="medium" showAnnotations className={drawerOpen ? 'mb-56' : ''} />
            <div className="absolute left-3 top-14 flex flex-col gap-1 rounded-xl border border-violet-200 bg-white p-1.5 shadow-lg">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="mx-auto h-px w-5 bg-slate-200" />
              <IconButton icon={ListChecks} label="计划" />
              <IconButton icon={MessageSquare} label="对话" />
              <IconButton icon={History} label="记录" />
            </div>

            <button
              type="button"
              onClick={() => setDrawerOpen((value) => !value)}
              className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-[11px] font-medium text-violet-700 shadow-lg transition hover:-translate-y-0.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {drawerOpen ? '收起 Solo 工作台' : 'Solo 正在生成整份简历 · 62%'}
              <ChevronDown className={cn('h-3.5 w-3.5 transition', drawerOpen && 'rotate-180')} />
            </button>
          </WorkspaceBackground>

          {drawerOpen ? (
            <div className="absolute inset-x-0 bottom-0 z-10 h-56 border-t border-slate-200 bg-white/95 shadow-[0_-14px_40px_rgba(15,23,42,0.12)] backdrop-blur">
              <div className="grid h-full grid-cols-[190px_minmax(360px,1fr)_320px]">
                <div className="border-r border-slate-200 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <ListChecks className="h-4 w-4 text-blue-600" /> Solo 计划
                  </div>
                  <div className="mt-3 space-y-2">
                    {WORK_STEPS.slice(0, 4).map((step) => (
                      <div key={step.title} className="flex items-center gap-2 text-[10px]">
                        <StatusDot status={step.status} />
                        <span
                          className={cn(
                            step.status === 'idle' ? 'text-slate-400' : 'font-medium text-slate-600'
                          )}
                        >
                          {step.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex min-w-0 flex-col border-r border-slate-200 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <Bot className="h-4 w-4 text-violet-600" /> 正在生成工作经历
                    <span className="ml-auto text-[9px] font-normal text-slate-400">
                      已运行 1分24秒
                    </span>
                  </div>
                  <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-xl bg-slate-50 p-3 text-[10px] leading-5 text-slate-600">
                    <p className="text-slate-400">已读取现有简历、目标 JD 与 2 份项目素材</p>
                    <p className="mt-1.5">
                      正在重写「XX 科技 ·
                      高级前端工程师」经历，优先保留平台建设、性能治理与带队成果。
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-blue-600">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600" />
                      比对 6 条原始事实与 18 个岗位关键词…
                    </div>
                  </div>
                  <div className="mt-2">
                    <SoloPrompt />
                  </div>
                </div>
                <div className="flex min-h-0 flex-col p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">本轮变更</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-medium text-emerald-700">
                      3 处已生成
                    </span>
                  </div>
                  <div className="mt-2 min-h-0 flex-1 overflow-y-auto space-y-2">
                    <ChangeRow label="职业概要" detail="重写 · 匹配度 +18%" accepted />
                    <ChangeRow label="工作经历" detail="增加 3 项量化结果" />
                    <ChangeRow label="技能关键词" detail="新增 6 个 JD 词" />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="h-8 rounded-lg border border-slate-200 text-[10px] text-slate-600 hover:bg-slate-50"
                    >
                      逐项审阅
                    </button>
                    <button
                      type="button"
                      className="h-8 rounded-lg bg-blue-600 text-[10px] font-medium text-white hover:bg-blue-700"
                    >
                      全部应用
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <aside className="flex min-h-0 flex-col border-l border-slate-200 bg-white">
          <div className="flex h-10 items-center border-b border-slate-200 px-3">
            <span className="text-xs font-semibold">属性</span>
            <IconButton icon={MoreHorizontal} label="更多" className="ml-auto" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-blue-50 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-violet-800">
                <Sparkles className="h-4 w-4" /> Solo 模式已接管画布
              </div>
              <p className="mt-2 text-[10px] leading-4 text-violet-700/80">
                生成期间仍可查看和缩放；手动编辑会暂停对应段落，避免覆盖你的改动。
              </p>
            </div>

            <PropertySection title="页面设置">
              <PropertyRow label="尺寸" value="210 × 297 mm" />
              <PropertyRow label="页数" value="2 页" />
              <PropertyRow label="边距" value="18 mm" />
            </PropertySection>
            <PropertySection title="Solo 约束">
              <label className="flex items-center justify-between py-1.5 text-[10px] text-slate-500">
                不虚构事实
                <span className="relative h-4 w-7 rounded-full bg-blue-600">
                  <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full bg-white" />
                </span>
              </label>
              <label className="flex items-center justify-between py-1.5 text-[10px] text-slate-500">
                保留手动改动
                <span className="relative h-4 w-7 rounded-full bg-blue-600">
                  <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full bg-white" />
                </span>
              </label>
              <label className="flex items-center justify-between py-1.5 text-[10px] text-slate-500">
                自动适配版式
                <span className="relative h-4 w-7 rounded-full bg-blue-600">
                  <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full bg-white" />
                </span>
              </label>
            </PropertySection>
          </div>
        </aside>
      </main>
      <PrototypeStatusBar label="页 1 / 2 · Solo 生成中 62%" />
    </div>
  );
};

const ChangeRow = ({
  label,
  detail,
  accepted = false,
}: {
  label: string;
  detail: string;
  accepted?: boolean;
}) => (
  <button
    type="button"
    className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-left hover:border-blue-200"
  >
    <span
      className={cn(
        'grid h-6 w-6 shrink-0 place-items-center rounded-lg',
        accepted ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
      )}
    >
      {accepted ? <Check className="h-3.5 w-3.5" /> : <WandSparkles className="h-3.5 w-3.5" />}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[10px] font-semibold text-slate-700">{label}</span>
      <span className="block truncate text-[9px] text-slate-400">{detail}</span>
    </span>
    <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
  </button>
);

const PropertySection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mt-5 border-t border-slate-100 pt-3">
    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
      {title}
    </div>
    {children}
  </section>
);

const PropertyRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between py-1.5 text-[10px]">
    <span className="text-slate-400">{label}</span>
    <span className="text-slate-600">{value}</span>
  </div>
);

const PrototypeStatusBar = ({ label }: { label: string }) => (
  <footer className="flex h-5 shrink-0 items-center bg-blue-600 px-3 text-[9px] text-blue-50">
    <span>{label}</span>
    <span className="mx-2 text-blue-300">|</span>
    <span>事实保护：开启</span>
    <span className="ml-auto">设计探索 · 不连接真实数据</span>
  </footer>
);

const PrototypeSwitcher = ({
  current,
  onChange,
}: {
  current: VariantKey;
  onChange: (variant: VariantKey) => void;
}) => {
  const currentIndex = VARIANTS.findIndex((variant) => variant.key === current);
  const cycle = (direction: -1 | 1) => {
    const nextIndex = (currentIndex + direction + VARIANTS.length) % VARIANTS.length;
    onChange(VARIANTS[nextIndex].key);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft') cycle(-1);
      if (event.key === 'ArrowRight') cycle(1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-slate-700 bg-slate-950/95 p-1.5 text-white shadow-2xl backdrop-blur">
      <button
        type="button"
        onClick={() => cycle(-1)}
        className="grid h-8 w-8 place-items-center rounded-full text-slate-300 hover:bg-white/10 hover:text-white"
        aria-label="上一版"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-1 px-1">
        {VARIANTS.map((variant) => (
          <button
            key={variant.key}
            type="button"
            onClick={() => onChange(variant.key)}
            className={cn(
              'rounded-full px-3 py-1.5 text-[11px] transition',
              current === variant.key
                ? 'bg-white font-semibold text-slate-950'
                : 'text-slate-400 hover:text-white'
            )}
          >
            {variant.key} · {variant.name}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => cycle(1)}
        className="grid h-8 w-8 place-items-center rounded-full text-slate-300 hover:bg-white/10 hover:text-white"
        aria-label="下一版"
      >
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
};

export const SoloModePrototype = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawVariant = searchParams.get('variant');
  const variant: VariantKey = rawVariant === 'B' || rawVariant === 'C' ? rawVariant : 'A';

  const setVariant = (nextVariant: VariantKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('variant', nextVariant);
    setSearchParams(next, { replace: true });
  };

  return (
    <>
      {variant === 'A' ? <VariantA /> : variant === 'B' ? <VariantB /> : <VariantC />}
      {import.meta.env.DEV ? <PrototypeSwitcher current={variant} onChange={setVariant} /> : null}
    </>
  );
};

export default SoloModePrototype;
