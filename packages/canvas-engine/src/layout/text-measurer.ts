import type { LayoutTextMeasurer, TextMeasureRequest, TextMeasureResult } from './layout-types';

export interface FixedTextMeasurerOptions {
  averageCharacterWidth?: number;
}

function wrapLine(line: string, charactersPerLine: number): string[] {
  if (line.length === 0) return [''];
  const wrapped: string[] = [];
  for (let index = 0; index < line.length; index += charactersPerLine) {
    wrapped.push(line.slice(index, index + charactersPerLine));
  }
  return wrapped;
}

/** 确定性测试/SSR Adapter；浏览器生产 Adapter 在 M4 改用真实字体测量。 */
export function createFixedTextMeasurer(
  options: FixedTextMeasurerOptions = {}
): LayoutTextMeasurer {
  const configuredWidth = options.averageCharacterWidth;
  return {
    measure(request: TextMeasureRequest): TextMeasureResult {
      const averageWidth = configuredWidth ?? request.fontSize * 0.58;
      const charactersPerLine = Math.max(1, Math.floor(request.width / averageWidth));
      const lines = request.content
        .split(/\r?\n/)
        .flatMap((line) => wrapLine(line, charactersPerLine));
      const lineHeightPx = request.fontSize * request.lineHeight;
      return {
        lines: lines.length > 0 ? lines : [''],
        lineHeightPx,
        height: Math.max(1, lines.length) * lineHeightPx,
      };
    },
  };
}
