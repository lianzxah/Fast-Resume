import type { ResumeSemanticRef, TextSegment } from './elements';
import type { ResumeData } from './resume-data';

export type LogicalBlockId = string;
export type LayoutFragmentId = string;

export type LogicalTextRole =
  | 'name'
  | 'headline'
  | 'sectionTitle'
  | 'itemTitle'
  | 'body'
  | 'metadata';

export interface LogicalTextStyle {
  role: LogicalTextRole;
  emphasis?: 'normal' | 'strong' | 'muted';
}

export interface LogicalBlockLayout {
  role: 'flow' | 'bounded' | 'absolute';
  regionId: string;
  groupId?: string;
  keepTogether?: boolean;
  breakPolicy?: 'between-lines' | 'between-items' | 'avoid';
}

export interface LogicalBlockSource {
  kind: 'resumeData' | 'unclassified';
  /** scalar/lines 可安全回写 ResumeData；readonly 表示正文保留但不反向重建结构化数据。 */
  sync: 'scalar' | 'lines' | 'readonly';
}

export interface LogicalContentBlock {
  id: LogicalBlockId;
  semanticRef?: ResumeSemanticRef;
  content: string;
  segments?: TextSegment[];
  style: LogicalTextStyle;
  layout: LogicalBlockLayout;
  source?: LogicalBlockSource;
}

export interface FlowDocument {
  schemaVersion: 1;
  blocks: LogicalContentBlock[];
  order: LogicalBlockId[];
  /** 用于 AI 和字段级合并；逻辑块仍是完整正文的权威来源。 */
  semanticData?: ResumeData;
}

export interface LayoutFragmentRef {
  id: LayoutFragmentId;
  blockId: LogicalBlockId;
  fragmentIndex: number;
  pageIndex: number;
  startOffset: number;
  endOffset: number;
}
