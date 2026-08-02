import type { ResumeElement, ResumePage, ResumeTemplate } from '@resume-editor/shared';
import { getPageMetrics } from '../../core/page-metrics';
import type { ResumeLayoutEngine } from '../layout-types';
import type {
  ConstraintMigrationReport,
  IncrementalLayoutRequest,
  IncrementalLayoutResult,
  IncrementalResumeLayout,
  LayoutConstraint,
  LayoutDiffOperation,
  LayoutSnapshot,
} from './incremental-types';

function hash(value: unknown): string {
  const input = JSON.stringify(value);
  let result = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    result ^= input.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(36);
}

function indexElements(
  pages: ResumePage[]
): Map<string, { pageIndex: number; element: ResumeElement }> {
  const index = new Map<string, { pageIndex: number; element: ResumeElement }>();
  pages.forEach((page, pageIndex) =>
    page.elements.forEach((element) => index.set(element.id, { pageIndex, element }))
  );
  return index;
}

function createDiff(
  previous: LayoutSnapshot | undefined,
  pages: ResumePage[],
  revision: number
): LayoutDiffOperation[] {
  if (!previous) {
    return pages.flatMap((page, pageIndex) =>
      page.elements.map((element) => ({
        type: 'add' as const,
        elementId: element.id,
        pageIndex,
        element,
      }))
    );
  }
  const before = indexElements(previous.result.pages);
  const after = indexElements(pages);
  const operations: LayoutDiffOperation[] = [];
  before.forEach((entry, elementId) => {
    if (!after.has(elementId))
      operations.push({ type: 'remove', elementId, pageIndex: entry.pageIndex });
  });
  after.forEach((entry, elementId) => {
    const old = before.get(elementId);
    if (!old)
      operations.push({
        type: 'add',
        elementId,
        pageIndex: entry.pageIndex,
        element: entry.element,
      });
    else if (old.pageIndex !== entry.pageIndex || hash(old.element) !== hash(entry.element)) {
      operations.push({
        type: 'update',
        elementId,
        pageIndex: entry.pageIndex,
        element: entry.element,
      });
    }
  });
  void revision;
  return operations;
}

function templateHash(template: ResumeTemplate): string {
  return hash({ id: template.id, pageConfig: template.pageConfig, pages: template.pages });
}

export function createIncrementalResumeLayout(engine: ResumeLayoutEngine): IncrementalResumeLayout {
  return {
    reflow(request: IncrementalLayoutRequest): IncrementalLayoutResult {
      const blockHashes = Object.fromEntries(
        request.flowDocument.blocks.map((block) => [block.id, hash(block)])
      );
      const nextTemplateHash = templateHash(request.template);
      const fontHash = request.fontHash ?? 'default-fonts';
      const previous = request.previous;
      const environmentChanged =
        previous?.templateHash !== nextTemplateHash || previous?.fontHash !== fontHash;
      const dirtyBlockIds = environmentChanged
        ? request.flowDocument.order
        : request.flowDocument.order.filter((id) => previous?.blockHashes[id] !== blockHashes[id]);

      if (previous && dirtyBlockIds.length === 0) {
        const snapshot: LayoutSnapshot = { ...previous, revision: request.revision };
        return {
          result: previous.result,
          snapshot,
          dirtyBlockIds,
          diff: { fromRevision: previous.revision, toRevision: request.revision, operations: [] },
        };
      }

      const result = engine.layout({
        template: request.template,
        flowDocument: request.flowDocument,
      });
      const snapshot: LayoutSnapshot = {
        revision: request.revision,
        templateHash: nextTemplateHash,
        fontHash,
        blockHashes,
        result,
      };
      return {
        result,
        snapshot,
        dirtyBlockIds,
        diff: {
          fromRevision: previous?.revision,
          toRevision: request.revision,
          operations: createDiff(previous, result.pages, request.revision),
        },
      };
    },

    migrateConstraints(
      constraints: LayoutConstraint[],
      target: ResumeTemplate
    ): ConstraintMigrationReport {
      const metrics = getPageMetrics(target.pageConfig);
      const compatible: LayoutConstraint[] = [];
      const requiresPreview: ConstraintMigrationReport['requiresPreview'] = [];
      for (const constraint of constraints) {
        if (constraint.type === 'region-assignment' && constraint.regionId !== 'main') {
          requiresPreview.push({ constraint, reason: '目标模板没有同名有界区域' });
        } else if (
          constraint.type === 'absolute-pin' &&
          (constraint.left < 0 ||
            constraint.top < 0 ||
            constraint.left > metrics.widthPx ||
            constraint.top > metrics.heightPx)
        ) {
          requiresPreview.push({ constraint, reason: '固定位置超出目标页面' });
        } else {
          compatible.push(constraint);
        }
      }
      return { compatible, requiresPreview };
    },
  };
}
