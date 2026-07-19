import Konva from 'konva';
import { jsPDF } from 'jspdf';
import type { ResumeDocument, ResumePage, PageConfig, ResumeElement } from '@resume-editor/shared';
import { pxToMm } from '@resume-editor/shared';
import { getPageMetrics } from './page-metrics';
import {
  toTextAttrs,
  toRectAttrs,
  toEllipseAttrs,
  toLineAttrs,
  toTriangleAttrs,
  toPolygonAttrs,
  toImageAttrs,
  getShapeKind,
  getPolygonPoints,
  normalizeCornerRadius,
  normalizeElementSize,
  normalizeNonNegative,
} from './element-mapper';
import { hasRichText, shapeHasText, layoutTextElement, layoutShapeText } from './rich-text';
import { collectPdfLinkAnnotations } from './links';
import { resolvePdfRenderOptions, type PdfExportOptions } from './pdf-export-options';
import type { TextElement, ShapeElement } from '@resume-editor/shared';

// ============================================================
// 导出工具 (框架无关)
// 使用命令式 Konva 在离屏容器中重建页面并导出为 PNG / PDF。
// 与交互层共享 element-mapper，保证导出与编辑所见一致。
// ============================================================

type ImageLoader = (src: string) => Promise<HTMLImageElement | null>;

/** 加载图片为 HTMLImageElement */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 单页导出期间复用相同图片，避免重复解码。 */
function createCachedImageLoader(): ImageLoader {
  const cache = new Map<string, Promise<HTMLImageElement | null>>();
  return (src) => {
    const cached = cache.get(src);
    if (cached) return cached;

    const pending = loadImage(src);
    cache.set(src, pending);
    return pending;
  };
}

/** 命令式构建富文本 Group (与 RichTextNode 布局一致) */
function buildRichTextGroup(el: TextElement): Konva.Group {
  const group = new Konva.Group({
    id: el.id,
    name: el.name,
    x: el.left,
    y: el.top,
    rotation: el.rotation,
    opacity: el.opacity,
    visible: el.visible,
  });
  if (el.backgroundColor) {
    group.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: normalizeElementSize(el.width),
        height: normalizeElementSize(el.height),
        fill: el.backgroundColor,
      })
    );
  }
  const { runs } = layoutTextElement(el);
  for (const r of runs) {
    group.add(
      new Konva.Text({
        x: r.x,
        y: r.y,
        text: r.text,
        fontSize: r.fontSize,
        fontFamily: r.fontFamily,
        fontStyle: r.fontStyle,
        textDecoration: r.textDecoration,
        fill: r.fill,
        lineHeight: el.lineHeight,
        letterSpacing: el.letterSpacing,
      })
    );
  }
  return group;
}

/** 命令式构建形状图元 (盒内相对坐标, 供含文本 Group 使用) */
function buildShapeFigure(el: ShapeElement): Konva.Shape {
  const kind = getShapeKind(el);
  const fillProps = {
    fill: el.fill,
    stroke: el.strokeColor,
    strokeWidth: normalizeNonNegative(el.strokeWidth),
  };
  const w = normalizeElementSize(el.width);
  const h = normalizeElementSize(el.height);
  if (kind === 'ellipse') {
    return new Konva.Ellipse({ x: w / 2, y: h / 2, radiusX: w / 2, radiusY: h / 2, ...fillProps });
  }
  if (kind === 'triangle') {
    return new Konva.Line({ points: [w / 2, 0, w, h, 0, h], closed: true, ...fillProps });
  }
  if (kind === 'polygon') {
    return new Konva.Line({
      points: getPolygonPoints(el),
      closed: true,
      lineJoin: 'round',
      ...fillProps,
    });
  }
  if (kind === 'line') {
    return new Konva.Line({
      points: [0, h / 2, w, h / 2],
      stroke: el.strokeColor,
      strokeWidth: normalizeNonNegative(el.strokeWidth, 2) || 2,
    });
  }
  return new Konva.Rect({
    x: 0,
    y: 0,
    width: w,
    height: h,
    cornerRadius: normalizeCornerRadius(el.borderRadius, w, h),
    ...fillProps,
  });
}

/** 命令式构建含文本形状 Group (与 ShapeNode 布局一致) */
function buildShapeGroup(el: ShapeElement): Konva.Group {
  const group = new Konva.Group({
    id: el.id,
    name: el.name,
    x: el.left,
    y: el.top,
    rotation: el.rotation,
    opacity: el.opacity,
    visible: el.visible,
  });
  group.add(buildShapeFigure(el));
  const { runs } = layoutShapeText(el);
  for (const r of runs) {
    group.add(
      new Konva.Text({
        x: r.x,
        y: r.y,
        text: r.text,
        fontSize: r.fontSize,
        fontFamily: r.fontFamily,
        fontStyle: r.fontStyle,
        textDecoration: r.textDecoration,
        fill: r.fill,
      })
    );
  }
  return group;
}

/** 命令式构建单个元素对应的 Konva 节点 */
async function buildNode(el: ResumeElement, imageLoader: ImageLoader): Promise<Konva.Node | null> {
  if (!el.visible) return null;

  switch (el.type) {
    case 'text':
      if (hasRichText(el)) return buildRichTextGroup(el);
      return new Konva.Text(toTextAttrs(el));
    case 'shape': {
      if (shapeHasText(el)) return buildShapeGroup(el);
      const kind = getShapeKind(el);
      if (kind === 'ellipse') return new Konva.Ellipse(toEllipseAttrs(el));
      if (kind === 'line') return new Konva.Line(toLineAttrs(el));
      if (kind === 'triangle') return new Konva.Line(toTriangleAttrs(el));
      if (kind === 'polygon') return new Konva.Line(toPolygonAttrs(el));
      return new Konva.Rect(toRectAttrs(el));
    }
    case 'image': {
      const attrs = toImageAttrs(el);
      const img = await imageLoader(el.src);
      if (img) {
        return new Konva.Image({ ...attrs, image: img });
      }
      // 无图片时渲染占位矩形，保持与编辑器一致
      return new Konva.Rect({
        ...attrs,
        fill: '#f1f5f9',
        stroke: '#cbd5e1',
        strokeWidth: 1,
      });
    }
    case 'group': {
      // 组合元素: 递归渲染子元素到一个 Group
      const group = new Konva.Group({
        x: el.left,
        y: el.top,
        rotation: el.rotation,
        opacity: el.opacity,
        visible: el.visible,
      });
      const children = await Promise.all(el.children.map((child) => buildNode(child, imageLoader)));
      for (const childNode of children) {
        if (childNode) group.add(childNode as Konva.Shape);
      }
      return group;
    }
    default:
      return null;
  }
}

export interface RenderOptions {
  /** 输出像素倍率 (用于高清导出) */
  pixelRatio?: number;
  /** 是否绘制背景 */
  background?: boolean;
  /** 页面栅格图格式；PNG 适合无损图片，JPEG 适合小体积 PDF。 */
  mimeType?: 'image/png' | 'image/jpeg';
  /** JPEG 编码质量，范围 0–1。 */
  quality?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 将单个页面渲染为栅格图 data URL (离屏)。
 */
export async function renderPageToDataURL(
  page: ResumePage,
  pageConfig: PageConfig,
  options: RenderOptions = {}
): Promise<string> {
  const { pixelRatio = 2, background = true, mimeType = 'image/png', quality = 0.92 } = options;
  const metrics = getPageMetrics(pageConfig);

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-100000px';
  container.style.left = '-100000px';
  document.body.appendChild(container);

  const stage = new Konva.Stage({
    container,
    width: metrics.widthPx,
    height: metrics.heightPx,
  });
  try {
    const layer = new Konva.Layer();
    stage.add(layer);

    if (background) {
      layer.add(
        new Konva.Rect({
          x: 0,
          y: 0,
          width: metrics.widthPx,
          height: metrics.heightPx,
          fill: metrics.backgroundColor,
        })
      );
    }

    const sorted = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);
    const imageLoader = createCachedImageLoader();
    const nodes = await Promise.all(sorted.map((el) => buildNode(el, imageLoader)));
    for (const node of nodes) {
      if (node) layer.add(node as Konva.Shape);
    }
    layer.draw();

    return stage.toDataURL({
      pixelRatio: clamp(pixelRatio, 0.1, 4),
      mimeType,
      quality: clamp(quality, 0.1, 1),
    });
  } finally {
    stage.destroy();
    container.remove();
  }
}

/** 触发浏览器下载 */
function download(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/**
 * 导出指定页面为 PNG 并下载。
 */
export async function exportPageToPNG(
  page: ResumePage,
  pageConfig: PageConfig,
  filename = 'resume.png',
  options: RenderOptions = {}
): Promise<void> {
  const dataUrl = await renderPageToDataURL(page, pageConfig, options);
  download(dataUrl, filename);
}

/**
 * 导出整个文档为多页 PDF 并下载。
 */
export async function exportDocumentToPDF(
  doc: ResumeDocument,
  filename = 'resume.pdf',
  options: PdfExportOptions = {}
): Promise<void> {
  const firstPageConfig: PageConfig = {
    ...doc.pageConfig,
    ...(doc.pages[0]?.config || {}),
  };
  const renderOptions = resolvePdfRenderOptions(options);

  const pdf = new jsPDF({
    orientation: firstPageConfig.orientation === 'landscape' ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [firstPageConfig.width, firstPageConfig.height],
    compress: true,
    putOnlyUsedFonts: true,
    precision: 3,
  });

  for (let i = 0; i < doc.pages.length; i++) {
    const page = doc.pages[i];
    const pageCfg: PageConfig = { ...doc.pageConfig, ...(page.config || {}) };
    const dataUrl = await renderPageToDataURL(page, pageCfg, renderOptions);
    if (i > 0) {
      pdf.addPage(
        [pageCfg.width, pageCfg.height],
        pageCfg.orientation === 'landscape' ? 'landscape' : 'portrait'
      );
    }
    const imageFormat = renderOptions.mimeType === 'image/jpeg' ? 'JPEG' : 'PNG';
    pdf.addImage(
      dataUrl,
      imageFormat,
      0,
      0,
      pageCfg.width,
      pageCfg.height,
      undefined,
      imageFormat === 'PNG' ? 'FAST' : undefined
    );
    for (const link of collectPdfLinkAnnotations(page, pageCfg)) {
      pdf.link(link.x, link.y, link.width, link.height, { url: link.url });
    }
  }

  pdf.save(filename);
}

/** 将像素尺寸转换为毫米 (便于外部按 DPI 计算) */
export function pageSizeMm(pageConfig: PageConfig): { width: number; height: number } {
  const metrics = getPageMetrics(pageConfig);
  return {
    width: pxToMm(metrics.widthPx, pageConfig.dpi),
    height: pxToMm(metrics.heightPx, pageConfig.dpi),
  };
}
