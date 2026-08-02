import type { ResumeElement, ResumeTemplate } from '@resume-editor/shared';
import { getPageMetrics } from '../core/page-metrics';
import type { CompiledResumeTemplate } from './layout-types';

function cloneElement(element: ResumeElement): ResumeElement {
  return JSON.parse(JSON.stringify(element)) as ResumeElement;
}

/**
 * 首版模板编译器只建立一个可跨页主区域。图片、形状和显式 decorative 元素
 * 作为视觉元素保留；模板示例文字只作为样式参考，不进入最终正文。
 */
export function compileResumeTemplate(template: ResumeTemplate): CompiledResumeTemplate {
  const metrics = getPageMetrics(template.pageConfig);
  const visualElements = (template.pages[0]?.elements ?? [])
    .filter(
      (element) =>
        element.type === 'image' ||
        element.type === 'shape' ||
        element.semanticRef?.role === 'decorative'
    )
    .map(cloneElement);

  return {
    templateId: template.id,
    pageConfig: template.pageConfig,
    primaryRegion: {
      id: 'main',
      left: metrics.margins.left,
      top: metrics.margins.top,
      width: metrics.widthPx - metrics.margins.left - metrics.margins.right,
      height: metrics.heightPx - metrics.margins.top - metrics.margins.bottom,
    },
    visualElements,
  };
}
