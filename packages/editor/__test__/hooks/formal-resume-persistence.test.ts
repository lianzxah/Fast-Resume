import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PAGE_CONFIG, type ResumeDocument } from '@resume-editor/shared';
import { createClassicEditorSession, createEditorSession } from '@/store/editor-session';
import { createFormalResumePersistence } from '../../src/hooks/formal-resume-persistence';

vi.mock('@resume-editor/canvas-engine', () => ({
  alignBoxes: vi.fn(() => []),
  distributeBoxes: vi.fn(() => []),
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
    pages: [{ id: 'page-1', pageNumber: 1, elements: [] }],
  };
}

describe('formal resume persistence', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('backs up immediately and debounces a formal resume autosave', async () => {
    const session = createClassicEditorSession({
      initialDocument: document(),
      resumeId: 'resume-1',
    });
    const updateResume = vi.fn().mockResolvedValue(undefined);
    const writeBackup = vi.fn();
    const persistence = createFormalResumePersistence({
      session,
      updateResume,
      makeThumbnail: vi.fn().mockResolvedValue('thumbnail'),
      backups: { write: writeBackup, remove: vi.fn() },
      now: () => '2026-08-02T01:00:00.000Z',
    });
    persistence.startAutosave('resume-1', 2_000);

    session.getState().updateDocumentTitle('第一次修改');
    session.getState().updateDocumentTitle('第二次修改');

    expect(writeBackup).toHaveBeenCalledTimes(2);
    expect(updateResume).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(updateResume).toHaveBeenCalledTimes(1);
    expect(updateResume).toHaveBeenCalledWith(
      'resume-1',
      expect.objectContaining({
        title: '第二次修改',
        createVersion: false,
      })
    );
    expect(session.getState().isDirty).toBe(false);
    persistence.dispose();
  });

  it('creates a version on manual save and writes a recovery backup on failure', async () => {
    const session = createClassicEditorSession({
      initialDocument: document(),
      resumeId: 'resume-1',
    });
    const writeBackup = vi.fn();
    const updateResume = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('网络失败'));
    const persistence = createFormalResumePersistence({
      session,
      updateResume,
      makeThumbnail: vi.fn().mockResolvedValue(undefined),
      backups: { write: writeBackup, remove: vi.fn() },
      now: () => '2026-08-02T01:00:00.000Z',
    });

    await persistence.save(true, '手动保存');
    expect(updateResume).toHaveBeenLastCalledWith(
      'resume-1',
      expect.objectContaining({ createVersion: true, message: '手动保存' })
    );

    session.getState().updateDocumentTitle('失败前修改');
    await persistence.save(false);
    expect(writeBackup).toHaveBeenCalledWith('resume-1', session.getState().document);
    expect(session.getState().saveError).toBe('网络失败');
  });

  it('never writes a Solo draft through the formal resume adapter', async () => {
    const solo = createEditorSession({
      mode: 'solo',
      persistence: 'draft',
      initialDocument: document(),
      resumeId: 'resume-1',
    });
    const updateResume = vi.fn();
    const writeBackup = vi.fn();
    const persistence = createFormalResumePersistence({
      session: solo,
      updateResume,
      makeThumbnail: vi.fn(),
      backups: { write: writeBackup, remove: vi.fn() },
    });

    persistence.startAutosave('resume-1', 10);
    solo.getState().updateDocumentTitle('Solo 草稿');
    await vi.advanceTimersByTimeAsync(10);
    await persistence.save(false);

    expect(updateResume).not.toHaveBeenCalled();
    expect(writeBackup).not.toHaveBeenCalled();
  });

  it('does not mark a newer document clean when an older save finishes', async () => {
    const session = createClassicEditorSession({
      initialDocument: document(),
      resumeId: 'resume-1',
    });
    let resolveUpdate!: () => void;
    const updateResume = vi.fn(() => new Promise<void>((resolve) => (resolveUpdate = resolve)));
    const writeBackup = vi.fn();
    const removeBackup = vi.fn();
    const persistence = createFormalResumePersistence({
      session,
      updateResume,
      makeThumbnail: vi.fn().mockResolvedValue(undefined),
      backups: { write: writeBackup, remove: removeBackup },
    });

    const saving = persistence.save(false);
    await Promise.resolve();
    session.getState().updateDocumentTitle('保存期间的新修改');
    resolveUpdate();
    await saving;

    expect(session.getState().isDirty).toBe(true);
    expect(removeBackup).not.toHaveBeenCalled();
    expect(writeBackup).toHaveBeenLastCalledWith('resume-1', session.getState().document);
  });
});
