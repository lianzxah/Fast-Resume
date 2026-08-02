import { describe, expect, it, vi } from 'vitest';
import type { ResumeDocument } from '@resume-editor/shared';
import { createEditorSession } from '../../src/store/editor-session';

vi.mock('@resume-editor/canvas-engine', () => ({
  alignBoxes: vi.fn(() => []),
  distributeBoxes: vi.fn(() => []),
}));

function createDocument(id: string, title: string): ResumeDocument {
  return {
    id,
    version: '1.0.0',
    metadata: {
      title,
      author: '',
      createdAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    },
    pageConfig: {
      size: 'A4',
      orientation: 'portrait',
      dpi: 96,
      width: 794,
      height: 1123,
      margins: { top: 40, right: 40, bottom: 40, left: 40 },
      backgroundColor: '#ffffff',
    },
    pages: [{ id: `${id}-page-1`, pageNumber: 1, elements: [] }],
  };
}

describe('EditorSession', () => {
  it('isolates a Solo working draft from the classic formal resume', () => {
    const source = createDocument('resume-1', '正式简历');
    const classic = createEditorSession({
      id: 'classic-1',
      mode: 'classic',
      persistence: 'formal',
      initialDocument: source,
    });
    const solo = createEditorSession({
      id: 'solo-1',
      mode: 'solo',
      persistence: 'draft',
      initialDocument: source,
    });

    solo.getState().updateDocumentTitle('Solo 工作草稿');
    solo.getState().addPage();
    solo.getState().setActivePage(1);
    solo.getState().toggleRightPanel();

    expect(solo.mode).toBe('solo');
    expect(solo.persistence).toBe('draft');
    expect(solo.getState().document.metadata.title).toBe('Solo 工作草稿');
    expect(solo.getState().document.pages).toHaveLength(2);
    expect(solo.getState().activePageIndex).toBe(1);
    expect(solo.getState().ui.rightPanelVisible).toBe(false);

    expect(classic.mode).toBe('classic');
    expect(classic.persistence).toBe('formal');
    expect(classic.getState().document.metadata.title).toBe('正式简历');
    expect(classic.getState().document.pages).toHaveLength(1);
    expect(classic.getState().activePageIndex).toBe(0);
    expect(classic.getState().ui.rightPanelVisible).toBe(true);
    expect(source.metadata.title).toBe('正式简历');
    expect(source.pages).toHaveLength(1);
  });

  it('keeps subscriptions and undo history scoped to one session', () => {
    const classic = createEditorSession({
      id: 'classic-2',
      mode: 'classic',
      persistence: 'formal',
      initialDocument: createDocument('resume-2', '正式版本'),
    });
    const solo = createEditorSession({
      id: 'solo-2',
      mode: 'solo',
      persistence: 'draft',
      initialDocument: createDocument('resume-2', '正式版本'),
    });
    const classicListener = vi.fn();
    const soloListener = vi.fn();
    const unsubscribeClassic = classic.subscribe(classicListener);
    const unsubscribeSolo = solo.subscribe(soloListener);

    solo.getState().addPage();
    solo.getState().undo();

    expect(solo.getState().document.pages).toHaveLength(1);
    expect(solo.getState().future).toHaveLength(1);
    expect(classic.getState().future).toHaveLength(0);
    expect(soloListener).toHaveBeenCalled();
    expect(classicListener).not.toHaveBeenCalled();

    unsubscribeClassic();
    unsubscribeSolo();
  });
});
