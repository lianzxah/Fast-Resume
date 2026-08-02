import type { ResumeDocument } from '@resume-editor/shared';
import type { SaveResumePayload } from '@/lib/api';
import type { EditorSession } from '@/store/editor-session';

export interface FormalResumeBackupPort {
  write(resumeId: string, document: ResumeDocument): void;
  remove(resumeId: string): void;
}

export interface FormalResumePersistencePorts {
  session: EditorSession;
  updateResume: (resumeId: string, payload: SaveResumePayload) => Promise<unknown>;
  makeThumbnail: (document: ResumeDocument) => Promise<string | undefined>;
  backups: FormalResumeBackupPort;
  now?: () => string;
}

export interface FormalResumePersistence {
  save(createVersion: boolean, message?: string): Promise<void>;
  startAutosave(resumeId: string, delayMs: number): () => void;
  dispose(): void;
}

/**
 * 正式简历持久化深模块。它只认识 Session 与端口，并在边界处拒绝 Solo 草稿，
 * 从而避免共享画布接入后把工作草稿误写到正式简历 API。
 */
export function createFormalResumePersistence(
  ports: FormalResumePersistencePorts
): FormalResumePersistence {
  const now = ports.now ?? (() => new Date().toISOString());
  let timer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe: (() => void) | null = null;

  const stopAutosave = () => {
    unsubscribe?.();
    unsubscribe = null;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const save = async (createVersion: boolean, message?: string) => {
    if (ports.session.persistence !== 'formal') return;
    const state = ports.session.getState();
    const resumeId = state.resumeId;
    if (!resumeId) return;
    const document = state.document;
    state.setSaveState({ isSaving: true, saveError: null });

    try {
      const thumbnail = await ports.makeThumbnail(document);
      await ports.updateResume(resumeId, {
        title: document.metadata.title,
        document,
        thumbnail,
        createVersion,
        message,
      });
      const current = ports.session.getState();
      current.setSaveState({ isSaving: false, lastSavedAt: now() });
      if (current.document === document) {
        current.markClean();
        ports.backups.remove(resumeId);
      } else {
        // 保存期间产生了更新：旧快照已成功，但当前文档仍需保持 dirty 和本地兜底。
        ports.backups.write(resumeId, current.document);
      }
    } catch (caught: unknown) {
      const current = ports.session.getState();
      current.setSaveState({
        isSaving: false,
        saveError: caught instanceof Error ? caught.message : '保存失败',
      });
      ports.backups.write(resumeId, document);
    }
  };

  return {
    save,
    startAutosave(resumeId, delayMs) {
      stopAutosave();
      if (ports.session.persistence !== 'formal') return stopAutosave;

      unsubscribe = ports.session.subscribe((state, previous) => {
        if (state.document === previous.document || !state.isDirty) return;
        ports.backups.write(resumeId, state.document);
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          void save(false);
        }, delayMs);
      });
      return stopAutosave;
    },
    dispose: stopAutosave,
  };
}
