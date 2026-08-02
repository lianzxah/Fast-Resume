import React, { createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { generateId, type ResumeDocument } from '@resume-editor/shared';
import {
  createEditorStore,
  type EditorActions,
  type EditorStore,
  type EditorStoreApi,
} from './editor-store';

export type EditorMode = 'classic' | 'solo';
export type EditorPersistencePolicy = 'formal' | 'draft' | 'none';

/**
 * 一次编辑上下文的公开边界。它既承载 Zustand StoreApi，也声明数据归属，
 * 让同一套画布组件可以安全地绑定正式简历或 Solo 工作草稿。
 */
export interface EditorSession extends EditorStoreApi {
  readonly id: string;
  readonly mode: EditorMode;
  readonly persistence: EditorPersistencePolicy;
}

export interface CreateEditorSessionOptions {
  id?: string;
  mode: EditorMode;
  persistence: EditorPersistencePolicy;
  initialDocument?: ResumeDocument;
  resumeId?: string | null;
}

export type CreateClassicEditorSessionOptions = Omit<
  CreateEditorSessionOptions,
  'mode' | 'persistence'
>;

export type CreateInMemoryEditorSessionOptions = Omit<
  CreateEditorSessionOptions,
  'persistence' | 'mode'
> & { mode?: EditorMode };

export function createEditorSession(options: CreateEditorSessionOptions): EditorSession {
  if (options.mode === 'solo' && options.persistence === 'formal') {
    throw new Error('Solo sessions cannot use the formal resume persistence policy');
  }
  const store = createEditorStore({
    initialDocument: options.initialDocument,
    resumeId: options.resumeId,
  });

  return {
    id: options.id ?? generateId('editor-session'),
    mode: options.mode,
    persistence: options.persistence,
    getState: store.getState,
    getInitialState: store.getInitialState,
    setState: store.setState,
    subscribe: store.subscribe,
  };
}

export function createClassicEditorSession(
  options: CreateClassicEditorSessionOptions = {}
): EditorSession {
  return createEditorSession({
    ...options,
    mode: 'classic',
    persistence: 'formal',
  });
}

export function createInMemoryEditorSession(
  options: CreateInMemoryEditorSessionOptions = {}
): EditorSession {
  return createEditorSession({
    ...options,
    mode: options.mode ?? 'classic',
    persistence: 'none',
  });
}

const EditorSessionContext = createContext<EditorSession | null>(null);

export interface EditorSessionProviderProps {
  session: EditorSession;
  children: ReactNode;
}

export const EditorSessionProvider: React.FC<EditorSessionProviderProps> = ({
  session,
  children,
}) => <EditorSessionContext.Provider value={session}>{children}</EditorSessionContext.Provider>;

export function useEditorSession(): EditorSession {
  const session = useContext(EditorSessionContext);
  if (!session) {
    throw new Error('Editor components must be rendered inside an EditorSessionProvider');
  }
  return session;
}

const selectIdentity = (state: EditorStore): EditorStore => state;

export function useEditorStore(): EditorStore;
export function useEditorStore<T>(selector: (state: EditorStore) => T): T;
export function useEditorStore<T>(selector?: (state: EditorStore) => T): T | EditorStore {
  const session = useEditorSession();
  const resolvedSelector = (selector ?? selectIdentity) as (state: EditorStore) => T | EditorStore;
  return useStore(session, resolvedSelector);
}

export function useEditorSelector<T>(selector: (state: EditorStore) => T): T {
  return useStore(useEditorSession(), selector);
}

/** Store action 在会话生命周期内保持稳定，可供只发命令、不订阅状态的组件使用。 */
export function useEditorCommands(): EditorActions {
  return useEditorSession().getState();
}

/** 命令式回调、订阅与桥接层使用；始终返回当前 Provider 的会话。 */
export function useEditorStoreApi(): EditorSession {
  return useEditorSession();
}
