import React from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { GripHorizontal, GripVertical } from 'lucide-react';
import { useEditorStore } from '@/store';
import { BottomPanel } from './BottomPanel';
import { CanvasWorkspace } from './CanvasWorkspace';
import { LeftPanel } from './LeftPanel';
import { MenuBar } from './MenuBar';
import { RightPanel } from './RightPanel';
import { StatusBar } from './StatusBar';

/**
 * 可复用的经典编辑工作台。状态来自外层 EditorSessionProvider，组件本身不再
 * 假设全局唯一 Store，因此后续可嵌入 Solo 指挥台的画布区域。
 */
export const EditorWorkbench: React.FC = () => {
  const ui = useEditorStore((state) => state.ui);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="h-screen w-screen overflow-hidden flex flex-col bg-background">
        <MenuBar />

        <PanelGroup direction="vertical" className="flex-1 min-h-0">
          <Panel defaultSize={ui.bottomPanelVisible ? 68 : 100} minSize={32} order={1}>
            <PanelGroup direction="horizontal" className="h-full min-h-0">
              {ui.leftPanelVisible && (
                <>
                  <Panel defaultSize={18} minSize={12} maxSize={30} collapsible order={1}>
                    <LeftPanel />
                  </Panel>
                  <PanelResizeHandle className="group relative w-[3px] bg-border hover:bg-primary/40 active:bg-primary/60 transition-colors data-[resize-handle-active]:bg-primary/60">
                    <div className="absolute inset-y-0 -left-[3px] -right-[3px]" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <GripVertical className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </PanelResizeHandle>
                </>
              )}

              <Panel defaultSize={64} minSize={30} order={2}>
                <CanvasWorkspace />
              </Panel>

              {ui.rightPanelVisible && (
                <>
                  <PanelResizeHandle className="group relative w-[3px] bg-border hover:bg-primary/40 active:bg-primary/60 transition-colors data-[resize-handle-active]:bg-primary/60">
                    <div className="absolute inset-y-0 -left-[3px] -right-[3px]" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <GripVertical className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </PanelResizeHandle>
                  <Panel defaultSize={18} minSize={14} maxSize={30} collapsible order={3}>
                    <RightPanel />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          {ui.bottomPanelVisible && (
            <>
              <PanelResizeHandle className="group relative h-[6px] bg-border hover:bg-primary/35 active:bg-primary/60 transition-colors data-[resize-handle-active]:bg-primary/60">
                <div className="absolute -top-[4px] -bottom-[4px] inset-x-0" />
                <div className="absolute left-1/2 top-1/2 flex h-4 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-data-[resize-handle-active]:opacity-100">
                  <GripHorizontal className="h-3.5 w-3.5" />
                </div>
              </PanelResizeHandle>
              <Panel defaultSize={32} minSize={18} maxSize={68} collapsible order={2}>
                <BottomPanel />
              </Panel>
            </>
          )}
        </PanelGroup>
        <StatusBar />
      </div>
    </DndProvider>
  );
};
