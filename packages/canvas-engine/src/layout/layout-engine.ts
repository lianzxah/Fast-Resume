import {
  createLayoutFragmentId,
  type LogicalContentBlock,
  type LogicalTextRole,
  type ResumeElement,
  type ResumePage,
  type TextElement,
} from '@resume-editor/shared';
import { compileResumeTemplate } from './template-compiler';
import { createFixedTextMeasurer } from './text-measurer';
import type {
  CompiledResumeTemplate,
  LayoutDiagnostic,
  LayoutFragment,
  LayoutTextMeasurer,
  ResumeLayoutEngine,
  ResumeLayoutRequest,
  ResumeLayoutResult,
} from './layout-types';

const BLOCK_GAP = 6;
const FONT_FAMILY = 'Microsoft YaHei, sans-serif';

interface TextStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: 'normal' | 'bold';
}

function styleForRole(role: LogicalTextRole): TextStyle {
  switch (role) {
    case 'name':
      return { fontSize: 28, lineHeight: 1.2, fontWeight: 'bold' };
    case 'headline':
      return { fontSize: 16, lineHeight: 1.35, fontWeight: 'normal' };
    case 'sectionTitle':
      return { fontSize: 15, lineHeight: 1.35, fontWeight: 'bold' };
    case 'itemTitle':
      return { fontSize: 13, lineHeight: 1.4, fontWeight: 'bold' };
    case 'metadata':
      return { fontSize: 11, lineHeight: 1.4, fontWeight: 'normal' };
    case 'body':
      return { fontSize: 12, lineHeight: 1.55, fontWeight: 'normal' };
  }
}

function cloneVisuals(template: CompiledResumeTemplate, pageIndex: number): ResumeElement[] {
  return template.visualElements.map((element) => ({
    ...JSON.parse(JSON.stringify(element)),
    id: pageIndex === 0 ? element.id : `${element.id}::continuation:${pageIndex}`,
  })) as ResumeElement[];
}

function intersects(a: ResumeElement, fragment: LayoutFragment): boolean {
  return !(
    a.left + a.width <= fragment.left ||
    fragment.left + fragment.width <= a.left ||
    a.top + a.height <= fragment.top ||
    fragment.top + fragment.height <= a.top
  );
}

function createFlowElement(fragment: LayoutFragment, zIndex: number, color: string): TextElement {
  return {
    id: `flow-element:${fragment.id}`,
    type: 'text',
    name: `流式内容 ${fragment.blockId}`,
    semanticRef: fragment.semanticRef,
    left: fragment.left,
    top: fragment.top,
    width: fragment.width,
    height: fragment.height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex,
    content: fragment.content,
    fontSize: fragment.fontSize,
    fontFamily: FONT_FAMILY,
    fontWeight: styleForRole(fragment.textRole).fontWeight,
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: fragment.lineHeight,
    letterSpacing: 0,
    color,
    underline: false,
    strikethrough: false,
  };
}

function groupConsecutiveBlocks(blocks: LogicalContentBlock[]): LogicalContentBlock[][] {
  const groups: LogicalContentBlock[][] = [];
  for (const block of blocks) {
    const current = groups[groups.length - 1];
    if (current && current[0].layout.groupId === block.layout.groupId) current.push(block);
    else groups.push([block]);
  }
  return groups;
}

function estimateGroupHeight(
  blocks: LogicalContentBlock[],
  width: number,
  measurer: LayoutTextMeasurer
): number {
  return blocks.reduce((height, block) => {
    const style = styleForRole(block.style.role);
    const measured = measurer.measure({
      content: block.content,
      width,
      ...style,
      fontFamily: FONT_FAMILY,
    });
    return height + measured.height + BLOCK_GAP;
  }, 0);
}

export interface CreateResumeLayoutEngineOptions {
  textMeasurer?: LayoutTextMeasurer;
}

export function createResumeLayoutEngine(
  options: CreateResumeLayoutEngineOptions = {}
): ResumeLayoutEngine {
  const textMeasurer = options.textMeasurer ?? createFixedTextMeasurer();

  return {
    layout(request: ResumeLayoutRequest): ResumeLayoutResult {
      const compiledTemplate = compileResumeTemplate(request.template);
      const region = compiledTemplate.primaryRegion;
      const fragments: LayoutFragment[] = [];
      const diagnostics: LayoutDiagnostic[] = [];
      const pages: ResumePage[] = [];
      let pageIndex = -1;
      let cursorY = region.top;

      const ensurePage = () => {
        pageIndex += 1;
        cursorY = region.top;
        pages.push({
          id: `layout-page:${compiledTemplate.templateId}:${pageIndex}`,
          pageNumber: pageIndex + 1,
          elements: cloneVisuals(compiledTemplate, pageIndex),
        });
      };
      ensurePage();

      const blocksById = new Map(request.flowDocument.blocks.map((block) => [block.id, block]));
      const orderedBlocks = request.flowDocument.order
        .map((id) => blocksById.get(id))
        .filter((block): block is LogicalContentBlock => Boolean(block?.content.trim()));

      for (const group of groupConsecutiveBlocks(orderedBlocks)) {
        const groupHeight = estimateGroupHeight(group, region.width, textMeasurer);
        const regionBottom = region.top + region.height;
        if (
          groupHeight <= region.height &&
          cursorY > region.top &&
          cursorY + groupHeight > regionBottom
        ) {
          ensurePage();
        }

        for (const block of group) {
          const style = styleForRole(block.style.role);
          const measured = textMeasurer.measure({
            content: block.content,
            width: region.width,
            ...style,
            fontFamily: FONT_FAMILY,
          });
          let lineIndex = 0;
          let fragmentIndex = 0;
          let sourceOffset = 0;

          while (lineIndex < measured.lines.length) {
            const bottom = region.top + region.height;
            let availableLines = Math.floor((bottom - cursorY) / measured.lineHeightPx);
            const remainingLines = measured.lines.length - lineIndex;
            if (availableLines < 2 && remainingLines > availableLines && cursorY > region.top) {
              ensurePage();
              availableLines = Math.floor(region.height / measured.lineHeightPx);
            }
            if (
              remainingLines > availableLines &&
              remainingLines - availableLines === 1 &&
              availableLines > 2
            ) {
              availableLines -= 1;
            }
            const take = Math.max(1, Math.min(remainingLines, availableLines));
            const lines = measured.lines.slice(lineIndex, lineIndex + take);
            const content = lines.join('\n');
            const fragment: LayoutFragment = {
              id: createLayoutFragmentId(block.id, fragmentIndex),
              blockId: block.id,
              fragmentIndex,
              pageIndex,
              startOffset: sourceOffset,
              endOffset: sourceOffset + content.length,
              content,
              semanticRef: block.semanticRef,
              textRole: block.style.role,
              left: region.left,
              top: cursorY,
              width: region.width,
              height: take * measured.lineHeightPx,
              fontSize: style.fontSize,
              lineHeight: style.lineHeight,
            };
            fragments.push(fragment);
            pages[pageIndex].elements.push(
              createFlowElement(
                fragment,
                pages[pageIndex].elements.length,
                request.template.theme.textColor
              )
            );
            for (const visual of compiledTemplate.visualElements) {
              if (intersects(visual, fragment)) {
                const duplicate = diagnostics.some(
                  (item) =>
                    item.code === 'freeform-flow-collision' &&
                    item.pageIndex === pageIndex &&
                    item.elementId === visual.id
                );
                if (!duplicate) {
                  diagnostics.push({
                    code: 'freeform-flow-collision',
                    message: `视觉元素 ${visual.name} 与主流式区域内容重叠`,
                    pageIndex,
                    blockId: block.id,
                    elementId: visual.id,
                  });
                }
              }
            }

            cursorY += fragment.height;
            lineIndex += take;
            sourceOffset += content.length + (lineIndex < measured.lines.length ? 1 : 0);
            fragmentIndex += 1;
            if (lineIndex < measured.lines.length) ensurePage();
          }
          cursorY += BLOCK_GAP;
        }
      }

      return { pages, fragments, diagnostics, compiledTemplate };
    },
  };
}

export { createFixedTextMeasurer } from './text-measurer';
export type * from './layout-types';
