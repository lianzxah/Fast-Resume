import type { ResumeDocument } from '@resume-editor/shared';

export interface ClassicResumeLoaderPorts {
  fetchResume: (resumeId: string) => Promise<{ document: ResumeDocument | unknown }>;
  readBackup: (resumeId: string) => ResumeDocument | null;
}

export interface LoadedClassicResume {
  document: ResumeDocument;
  usedBackup: boolean;
}

/** 固定经典路由的装载优先级：远端正式简历为基线，不同的本地备份优先恢复。 */
export async function loadClassicResume(
  resumeId: string,
  ports: ClassicResumeLoaderPorts
): Promise<LoadedClassicResume> {
  const detail = await ports.fetchResume(resumeId);
  const remoteDocument = detail.document as ResumeDocument;
  const backup = ports.readBackup(resumeId);
  const usedBackup = Boolean(backup && JSON.stringify(backup) !== JSON.stringify(remoteDocument));

  return {
    document: usedBackup ? (backup as ResumeDocument) : remoteDocument,
    usedBackup,
  };
}
