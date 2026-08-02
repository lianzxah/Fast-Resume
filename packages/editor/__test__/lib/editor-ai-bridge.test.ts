import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PAGE_CONFIG,
  type AiAppliedChange,
  type AiEditProposal,
  type ResumeDocument,
} from '@resume-editor/shared';
import { createClassicEditorSession } from '@/store/editor-session';
import {
  canRevertAiChange,
  commitPreparedAiChangeRevert,
  commitPreparedAiEditProposal,
  prepareAiChangeRevert,
  prepareAiEditProposal,
} from '../../src/lib/editor-ai-bridge';

vi.mock('@resume-editor/canvas-engine', () => ({
  alignBoxes: vi.fn(() => []),
  distributeBoxes: vi.fn(() => []),
  measureTextElementHeightAdjustments: vi.fn(() => []),
}));

function document(): ResumeDocument {
  return {
    id: 'document-1',
    version: '1.0.0',
    metadata: {
      title: '正式简历',
      author: '',
      createdAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    },
    pageConfig: DEFAULT_PAGE_CONFIG,
    pages: [
      {
        id: 'page-1',
        pageNumber: 1,
        elements: [
          {
            id: 'text-1',
            type: 'text',
            name: '工作经历',
            left: 60,
            top: 80,
            width: 500,
            height: 40,
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 1,
            content: '负责前端开发',
            fontSize: 12,
            fontFamily: 'sans-serif',
            fontWeight: 'normal',
            fontStyle: 'normal',
            textAlign: 'left',
            lineHeight: 1.5,
            letterSpacing: 0,
            color: '#111111',
            underline: false,
            strikethrough: false,
          },
        ],
      },
    ],
  };
}

function proposal(): AiEditProposal {
  return {
    id: 'proposal-1',
    title: '优化工作经历',
    rationale: '突出职责',
    risk: 'low',
    validationProfile: 'strict',
    commands: [
      {
        type: 'text.replace',
        elementId: 'text-1',
        nextContent: '主导前端开发',
      },
    ],
    preview: { changedElementIds: ['text-1'], summary: ['优化工作经历'] },
    requiresConfirmation: false,
    autoApply: true,
  };
}

describe('editor AI bridge', () => {
  it('applies one prepared proposal to the supplied session only', () => {
    const target = createClassicEditorSession({ initialDocument: document() });
    const other = createClassicEditorSession({ initialDocument: document() });
    const prepared = prepareAiEditProposal(target, proposal());

    commitPreparedAiEditProposal(target, proposal(), prepared);

    expect(target.getState().document.pages[0].elements[0]).toMatchObject({
      content: '主导前端开发',
    });
    expect(target.getState().selection.selectedIds).toEqual(['text-1']);
    expect(target.getState().documentRevision).toBe(1);
    expect(other.getState().document.pages[0].elements[0]).toMatchObject({
      content: '负责前端开发',
    });
  });

  it('rejects a prepared proposal when the document changed before commit', () => {
    const session = createClassicEditorSession({ initialDocument: document() });
    const prepared = prepareAiEditProposal(session, proposal());
    session.getState().updateDocumentTitle('用户刚刚修改');

    expect(() => commitPreparedAiEditProposal(session, proposal(), prepared)).toThrow('简历已变化');
  });

  it('reverts the AI target through the same supplied session', () => {
    const session = createClassicEditorSession({ initialDocument: document() });
    const prepared = prepareAiEditProposal(session, proposal());
    commitPreparedAiEditProposal(session, proposal(), prepared);
    const change: AiAppliedChange = {
      proposalId: 'proposal-1',
      resumeId: 'resume-1',
      title: '优化工作经历',
      commandTypes: prepared.commandTypes,
      changedElementIds: prepared.changedElementIds,
      beforeDocument: prepared.beforeDocument,
      afterDocument: prepared.afterDocument,
      appliedAt: '2026-08-02T01:00:00.000Z',
    };

    expect(canRevertAiChange(session, change).ok).toBe(true);
    const revert = prepareAiChangeRevert(session, change);
    commitPreparedAiChangeRevert(session, change, revert);

    expect(session.getState().document.pages[0].elements[0]).toMatchObject({
      content: '负责前端开发',
    });
    expect(session.getState().documentRevision).toBe(2);
  });
});
