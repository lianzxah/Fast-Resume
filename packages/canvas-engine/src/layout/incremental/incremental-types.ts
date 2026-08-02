import type {
  FlowDocument,
  LogicalBlockId,
  ResumeElement,
  ResumeTemplate,
} from '@resume-editor/shared';
import type { ResumeLayoutEngine, ResumeLayoutResult } from '../layout-types';

export type LayoutConstraint =
  | {
      id: string;
      type: 'flow-order';
      blockId: LogicalBlockId;
      beforeBlockId?: LogicalBlockId;
      afterBlockId?: LogicalBlockId;
    }
  | { id: string; type: 'region-assignment'; blockId: LogicalBlockId; regionId: string }
  | {
      id: string;
      type: 'absolute-pin';
      elementId: string;
      pageIndex: number;
      left: number;
      top: number;
    }
  | { id: string; type: 'fixed-width'; blockId: LogicalBlockId; width: number }
  | { id: string; type: 'visibility'; targetId: string; visible: boolean };

export type LayoutDensity = 'comfortable' | 'compact' | 'tight';

export interface LayoutSnapshot {
  revision: number;
  templateHash: string;
  fontHash: string;
  blockHashes: Record<LogicalBlockId, string>;
  result: ResumeLayoutResult;
}

export type LayoutDiffOperation =
  | { type: 'add'; elementId: string; pageIndex: number; element: ResumeElement }
  | { type: 'update'; elementId: string; pageIndex: number; element: ResumeElement }
  | { type: 'remove'; elementId: string; pageIndex: number };

export interface LayoutDiff {
  fromRevision?: number;
  toRevision: number;
  operations: LayoutDiffOperation[];
}

export interface IncrementalLayoutRequest {
  revision: number;
  template: ResumeTemplate;
  flowDocument: FlowDocument;
  constraints?: LayoutConstraint[];
  previous?: LayoutSnapshot;
  fontHash?: string;
}

export interface IncrementalLayoutResult {
  result: ResumeLayoutResult;
  snapshot: LayoutSnapshot;
  diff: LayoutDiff;
  dirtyBlockIds: LogicalBlockId[];
}

export interface ConstraintMigrationReport {
  compatible: LayoutConstraint[];
  requiresPreview: Array<{ constraint: LayoutConstraint; reason: string }>;
}

export interface IncrementalResumeLayout {
  reflow(request: IncrementalLayoutRequest): IncrementalLayoutResult;
  migrateConstraints(
    constraints: LayoutConstraint[],
    target: ResumeTemplate
  ): ConstraintMigrationReport;
}

export type ResumeLayoutEnginePort = ResumeLayoutEngine;
