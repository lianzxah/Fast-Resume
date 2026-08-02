import { useCallback, useEffect, useMemo } from 'react';
import { renderPageToDataURL } from '@resume-editor/canvas-engine';
import type { ResumeDocument } from '@resume-editor/shared';
import { useEditorStoreApi } from '@/store';
import { resumeApi } from '@/lib/api';
import { createFormalResumePersistence } from './formal-resume-persistence';

const AUTOSAVE_DELAY = 2_000;
const BACKUP_PREFIX = 'resume-editor-backup-';

export function backupKey(resumeId: string): string {
  return `${BACKUP_PREFIX}${resumeId}`;
}

export function readBackup(resumeId: string): ResumeDocument | null {
  try {
    const raw = localStorage.getItem(backupKey(resumeId));
    return raw ? (JSON.parse(raw) as ResumeDocument) : null;
  } catch {
    return null;
  }
}

async function makeThumbnail(document: ResumeDocument): Promise<string | undefined> {
  try {
    const page = document.pages[0];
    if (!page) return undefined;
    return await renderPageToDataURL(page, document.pageConfig, { pixelRatio: 0.35 });
  } catch {
    return undefined;
  }
}

const browserBackups = {
  write(resumeId: string, document: ResumeDocument) {
    try {
      localStorage.setItem(backupKey(resumeId), JSON.stringify(document));
    } catch {
      // localStorage 可能不可用或空间不足，远端保存仍可继续。
    }
  },
  remove(resumeId: string) {
    try {
      localStorage.removeItem(backupKey(resumeId));
    } catch {
      // ignore
    }
  },
};

export function useResumePersistence(resumeId: string | null) {
  const editorSession = useEditorStoreApi();
  const persistence = useMemo(
    () =>
      createFormalResumePersistence({
        session: editorSession,
        updateResume: resumeApi.update,
        makeThumbnail,
        backups: browserBackups,
      }),
    [editorSession]
  );

  const saveNow = useCallback(() => persistence.save(true, '手动保存'), [persistence]);

  useEffect(() => {
    if (!resumeId) return;
    return persistence.startAutosave(resumeId, AUTOSAVE_DELAY);
  }, [persistence, resumeId]);

  useEffect(() => () => persistence.dispose(), [persistence]);

  return { saveNow };
}
