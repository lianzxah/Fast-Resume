import { describe, expect, it } from 'vitest';
import {
  createEmptyResumeData,
  resumeDataToFlowDocument,
  type ResumeTemplate,
} from '@resume-editor/shared';
import { createFixedTextMeasurer, createResumeLayoutEngine } from '../../src/layout/layout-engine';

function template(): ResumeTemplate {
  return {
    id: 'template-layout-test',
    name: '布局测试',
    description: '',
    category: 'classic',
    thumbnail: '',
    theme: {
      primaryColor: '#111111',
      secondaryColor: '#333333',
      accentColor: '#2563eb',
      textColor: '#222222',
      backgroundColor: '#ffffff',
    },
    pageConfig: {
      size: 'Custom',
      orientation: 'portrait',
      width: 100,
      height: 80,
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      backgroundColor: '#ffffff',
      dpi: 96,
    },
    pages: [
      {
        id: 'template-page',
        pageNumber: 1,
        elements: [
          {
            id: 'decoration-1',
            type: 'shape',
            name: '固定装饰',
            left: 40,
            top: 40,
            width: 20,
            height: 20,
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: true,
            zIndex: 0,
            shapeType: 'rectangle',
            fill: '#2563eb',
            strokeColor: 'transparent',
            strokeWidth: 0,
            borderRadius: 0,
          },
        ],
      },
    ],
  };
}

function flowWithSummary(summary: string) {
  const data = createEmptyResumeData();
  data.personalInfo.name = '张三';
  data.personalInfo.summary = summary;
  data.sectionOrder = ['summary'];
  return resumeDataToFlowDocument(data);
}

const engine = createResumeLayoutEngine({
  textMeasurer: createFixedTextMeasurer({ averageCharacterWidth: 7 }),
});

describe('ResumeLayoutEngine full layout', () => {
  it('adds and reclaims continuation pages as flow content grows and shrinks', () => {
    const short = engine.layout({
      template: template(),
      flowDocument: flowWithSummary('简短介绍'),
    });
    const long = engine.layout({
      template: template(),
      flowDocument: flowWithSummary(
        Array.from({ length: 80 }, (_, i) => `第 ${i} 行内容`).join('\n')
      ),
    });
    const shortAgain = engine.layout({
      template: template(),
      flowDocument: flowWithSummary('简短介绍'),
    });

    expect(short.pages).toHaveLength(1);
    expect(long.pages.length).toBeGreaterThan(1);
    expect(shortAgain.pages).toHaveLength(1);
    expect(shortAgain.pages[0].id).toBe(short.pages[0].id);
  });

  it('splits an oversized logical block by lines without losing source content', () => {
    const source = Array.from({ length: 60 }, (_, index) => `稳定内容 ${index}`).join('\n');
    const result = engine.layout({
      template: template(),
      flowDocument: flowWithSummary(source),
    });
    const summaryFragments = result.fragments.filter(
      (fragment) => fragment.semanticRef?.section === 'summary'
    );

    expect(summaryFragments.length).toBeGreaterThan(1);
    expect(summaryFragments.map((fragment) => fragment.content).join('\n')).toBe(source);
    expect(summaryFragments.map((fragment) => fragment.id)).toEqual(
      summaryFragments.map((fragment, index) => `${fragment.blockId}::fragment:${index}`)
    );
  });

  it('retains explicit visual elements and reports collisions instead of deleting them', () => {
    const result = engine.layout({
      template: template(),
      flowDocument: flowWithSummary('简历正文'),
    });

    expect(result.pages[0].elements.some((element) => element.id === 'decoration-1')).toBe(true);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'freeform-flow-collision', pageIndex: 0 }),
      ])
    );
  });

  it('is deterministic for identical flow, template and measurement inputs', () => {
    const request = {
      template: template(),
      flowDocument: flowWithSummary('可重复的布局输入'),
    };
    expect(engine.layout(request)).toEqual(engine.layout(request));
  });
});
