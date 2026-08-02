import { describe, expect, it } from 'vitest';
import {
  createEmptyResumeData,
  resumeDataToFlowDocument,
  type ResumeTemplate,
} from '@resume-editor/shared';
import { createResumeLayoutEngine } from '../../../src/layout/layout-engine';
import { createIncrementalResumeLayout } from '../../../src/layout/incremental/incremental-layout';

const template: ResumeTemplate = {
  id: 'incremental-template',
  name: '增量测试',
  description: '',
  category: 'classic',
  thumbnail: '',
  theme: {
    primaryColor: '#111',
    secondaryColor: '#333',
    accentColor: '#2563eb',
    textColor: '#222',
    backgroundColor: '#fff',
  },
  pageConfig: {
    size: 'A4',
    orientation: 'portrait',
    width: 210,
    height: 297,
    margins: { top: 20, right: 15, bottom: 20, left: 15 },
    backgroundColor: '#fff',
    dpi: 96,
  },
  pages: [{ id: 'template-page', pageNumber: 1, elements: [] }],
};

function flow(summary: string, secondExperience = '第二段经历') {
  const data = createEmptyResumeData();
  data.personalInfo.name = '张三';
  data.personalInfo.summary = summary;
  data.experience = [
    {
      id: 'exp-a',
      company: '甲公司',
      position: '工程师',
      startDate: '2022',
      descriptions: ['第一段经历'],
    },
    {
      id: 'exp-b',
      company: '乙公司',
      position: '工程师',
      startDate: '2024',
      descriptions: [secondExperience],
    },
  ];
  return resumeDataToFlowDocument(data);
}

describe('IncrementalResumeLayout', () => {
  it('emits no element diff for identical revisions', () => {
    const incremental = createIncrementalResumeLayout(createResumeLayoutEngine());
    const first = incremental.reflow({ revision: 1, template, flowDocument: flow('简介') });
    const second = incremental.reflow({
      revision: 2,
      template,
      flowDocument: flow('简介'),
      previous: first.snapshot,
    });

    expect(second.dirtyBlockIds).toEqual([]);
    expect(second.diff.operations).toEqual([]);
  });

  it('starts dirty propagation at the changed logical block and preserves unaffected ids', () => {
    const incremental = createIncrementalResumeLayout(createResumeLayoutEngine());
    const first = incremental.reflow({ revision: 1, template, flowDocument: flow('旧简介') });
    const second = incremental.reflow({
      revision: 2,
      template,
      flowDocument: flow('新简介'),
      previous: first.snapshot,
    });

    expect(second.dirtyBlockIds).toEqual([expect.stringContaining('flow:summary:')]);
    const expBIds = first.result.fragments
      .filter((item) => item.semanticRef?.itemId === 'exp-b')
      .map((item) => item.id);
    expect(
      second.result.fragments
        .filter((item) => item.semanticRef?.itemId === 'exp-b')
        .map((item) => item.id)
    ).toEqual(expBIds);
    expect(second.diff.operations.every((operation) => operation.elementId)).toBe(true);
  });

  it('classifies incompatible constraints for template-switch preview', () => {
    const incremental = createIncrementalResumeLayout(createResumeLayoutEngine());
    const report = incremental.migrateConstraints(
      [
        { id: 'order-1', type: 'flow-order', blockId: 'a', beforeBlockId: 'b' },
        { id: 'region-1', type: 'region-assignment', blockId: 'a', regionId: 'sidebar' },
        { id: 'pin-1', type: 'absolute-pin', elementId: 'avatar', pageIndex: 0, left: 20, top: 20 },
      ],
      template
    );
    expect(report.compatible.map((item) => item.id)).toEqual(['order-1', 'pin-1']);
    expect(report.requiresPreview.map((item) => item.constraint.id)).toEqual(['region-1']);
  });
});
