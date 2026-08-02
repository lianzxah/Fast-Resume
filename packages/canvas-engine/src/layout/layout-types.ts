import type {
  FlowDocument,
  LogicalBlockId,
  LogicalTextRole,
  PageConfig,
  ResumeElement,
  ResumePage,
  ResumeSemanticRef,
  ResumeTemplate,
} from '@resume-editor/shared';

export interface LayoutRegion {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CompiledResumeTemplate {
  templateId: string;
  pageConfig: PageConfig;
  primaryRegion: LayoutRegion;
  visualElements: ResumeElement[];
}

export interface TextMeasureRequest {
  content: string;
  width: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
}

export interface TextMeasureResult {
  lines: string[];
  lineHeightPx: number;
  height: number;
}

export interface LayoutTextMeasurer {
  measure(request: TextMeasureRequest): TextMeasureResult;
}

export interface LayoutFragment {
  id: string;
  blockId: LogicalBlockId;
  fragmentIndex: number;
  pageIndex: number;
  startOffset: number;
  endOffset: number;
  content: string;
  semanticRef?: ResumeSemanticRef;
  textRole: LogicalTextRole;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
}

export type LayoutDiagnosticCode =
  | 'freeform-flow-collision'
  | 'block-overflow'
  | 'missing-primary-region';

export interface LayoutDiagnostic {
  code: LayoutDiagnosticCode;
  message: string;
  pageIndex?: number;
  blockId?: LogicalBlockId;
  elementId?: string;
}

export interface ResumeLayoutRequest {
  template: ResumeTemplate;
  flowDocument: FlowDocument;
}

export interface ResumeLayoutResult {
  pages: ResumePage[];
  fragments: LayoutFragment[];
  diagnostics: LayoutDiagnostic[];
  compiledTemplate: CompiledResumeTemplate;
}

export interface ResumeLayoutEngine {
  layout(request: ResumeLayoutRequest): ResumeLayoutResult;
}
