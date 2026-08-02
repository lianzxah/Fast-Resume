import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileWarning, Loader2 } from 'lucide-react';
import { EditorWorkbench } from '@/components/layout/EditorWorkbench';
import { VersionHistoryDialog } from '@/components/VersionHistoryDialog';
import {
  createClassicEditorSession,
  EditorSessionProvider,
  useEditorStore,
  useEditorStoreApi,
} from '@/store';
import { resumeApi } from '@/lib/api';
import { readBackup, useResumePersistence } from '@/hooks/useResumePersistence';
import { registerManualSave, registerOpenVersions } from '@/lib/save-bus';
import { loadClassicResume } from '@/lib/classic-resume-loader';

const EditorPageContent: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const editorSession = useEditorStoreApi();
  const { setDocument, setResumeId } = useEditorStore();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [versionsOpen, setVersionsOpen] = useState(false);

  const { saveNow } = useResumePersistence(status === 'ready' ? (id ?? null) : null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setStatus('loading');
    void (async () => {
      try {
        const loaded = await loadClassicResume(id, {
          fetchResume: resumeApi.get,
          readBackup,
        });
        if (cancelled) return;
        setDocument(loaded.document);
        setResumeId(id);
        if (loaded.usedBackup) editorSession.getState().markDirty();
        setStatus('ready');
      } catch (caught: unknown) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : '加载失败');
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editorSession, id, setDocument, setResumeId]);

  useEffect(() => {
    registerManualSave(() => saveNow());
    registerOpenVersions(() => setVersionsOpen(true));
    return () => {
      registerManualSave(null);
      registerOpenVersions(null);
    };
  }, [saveNow]);

  if (status === 'loading') {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <FileWarning className="w-8 h-8" />
        <p className="text-sm">{error}</p>
        <button onClick={() => navigate('/')} className="text-sm text-primary">
          返回首页
        </button>
      </div>
    );
  }

  return (
    <>
      <EditorWorkbench />
      {id && (
        <VersionHistoryDialog
          resumeId={id}
          open={versionsOpen}
          onClose={() => setVersionsOpen(false)}
          onRestored={(document) => {
            setDocument(document);
            setResumeId(id);
            editorSession.getState().setSaveState({ lastSavedAt: new Date().toISOString() });
          }}
        />
      )}
    </>
  );
};

export const EditorPage: React.FC = () => {
  const [session] = useState(() => createClassicEditorSession());

  return (
    <EditorSessionProvider session={session}>
      <EditorPageContent />
    </EditorSessionProvider>
  );
};
