import { describe, expect, it } from 'vitest';
import {
  applyLogicalBlockContentEdit,
  createLayoutFragmentId,
  resumeDataToFlowDocument,
  type ResumeData,
} from '../src';

function resumeData(): ResumeData {
  return {
    personalInfo: {
      name: '张三',
      title: '前端工程师',
      email: 'zhangsan@example.com',
      summary: '关注复杂编辑器体验。',
    },
    experience: [
      {
        id: 'experience-a',
        company: '甲公司',
        position: '前端工程师',
        startDate: '2022-01',
        endDate: '2024-01',
        descriptions: ['负责编辑器', '建设设计系统'],
      },
      {
        id: 'experience-b',
        company: '乙公司',
        position: '高级前端工程师',
        startDate: '2024-02',
        descriptions: ['负责 AI 产品'],
      },
    ],
    education: [],
    skills: [{ category: '前端', items: [{ name: 'TypeScript', level: 'expert' }] }],
    projects: [],
    certifications: [],
    customSections: [],
    sectionOrder: ['summary', 'experience', 'skills'],
  };
}

describe('FlowDocument', () => {
  it('compiles the same semantic input to stable logical block ids and order', () => {
    const first = resumeDataToFlowDocument(resumeData());
    const second = resumeDataToFlowDocument(resumeData());

    expect(first.blocks.map((block) => block.id)).toEqual(second.blocks.map((block) => block.id));
    expect(first.order).toEqual(second.order);
    expect(new Set(first.order).size).toBe(first.order.length);
  });

  it('keeps every logical id stable when one experience body changes', () => {
    const beforeData = resumeData();
    const afterData = resumeData();
    afterData.experience[0].descriptions = ['负责复杂画布和增量布局'];

    const before = resumeDataToFlowDocument(beforeData);
    const after = resumeDataToFlowDocument(afterData);

    expect(after.blocks.map((block) => block.id)).toEqual(before.blocks.map((block) => block.id));
    expect(
      after.blocks.find(
        (block) =>
          block.semanticRef?.section === 'experience' && block.semanticRef.itemId === 'experience-b'
      )?.id
    ).toBe(
      before.blocks.find(
        (block) =>
          block.semanticRef?.section === 'experience' && block.semanticRef.itemId === 'experience-b'
      )?.id
    );
  });

  it('materializes persistent deterministic item ids for legacy semantic data', () => {
    const legacy = resumeData();
    legacy.experience[0].id = '';

    const first = resumeDataToFlowDocument(legacy);
    const second = resumeDataToFlowDocument(legacy);
    const generatedId = first.semanticData?.experience[0].id;

    expect(generatedId).toMatch(/^experience_/);
    expect(second.semanticData?.experience[0].id).toBe(generatedId);
    expect(legacy.experience[0].id).toBe('');
  });

  it('repairs duplicate legacy item ids before creating logical blocks', () => {
    const legacy = resumeData();
    legacy.experience[1].id = legacy.experience[0].id;

    const flow = resumeDataToFlowDocument(legacy);
    const ids = flow.semanticData!.experience.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(flow.order).size).toBe(flow.order.length);
  });

  it('syncs explicitly mapped edits and preserves unmapped rich content', () => {
    const flow = resumeDataToFlowDocument(resumeData());
    const body = flow.blocks.find(
      (block) =>
        block.semanticRef?.section === 'experience' &&
        block.semanticRef.itemId === 'experience-a' &&
        block.semanticRef.field === 'descriptions'
    );
    expect(body).toBeDefined();

    const synchronized = applyLogicalBlockContentEdit(
      flow,
      body!.id,
      '主导编辑器架构\n建设组件系统'
    );
    expect(synchronized.semanticSync).toBe('synchronized');
    expect(synchronized.document.semanticData?.experience[0].descriptions).toEqual([
      '主导编辑器架构',
      '建设组件系统',
    ]);

    const readonlyBlock = flow.blocks.find((block) => block.source?.sync === 'readonly');
    expect(readonlyBlock).toBeDefined();
    const preserved = applyLogicalBlockContentEdit(
      flow,
      readonlyBlock!.id,
      '无法可靠结构化，但必须完整保留的富文本'
    );
    expect(preserved.semanticSync).toBe('unmapped');
    expect(preserved.document.blocks.find((block) => block.id === readonlyBlock!.id)?.content).toBe(
      '无法可靠结构化，但必须完整保留的富文本'
    );
    expect(preserved.document.semanticData).toEqual(flow.semanticData);
  });

  it('creates deterministic pagination fragment ids without changing block identity', () => {
    expect(createLayoutFragmentId('flow:experience:experience-a:descriptions', 0)).toBe(
      'flow:experience:experience-a:descriptions::fragment:0'
    );
    expect(createLayoutFragmentId('flow:experience:experience-a:descriptions', 2)).toBe(
      'flow:experience:experience-a:descriptions::fragment:2'
    );
  });
});
