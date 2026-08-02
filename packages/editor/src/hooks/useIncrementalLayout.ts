import { useCallback, useEffect, useMemo } from 'react';
import type {
  IncrementalLayoutRequest,
  IncrementalLayoutResult,
} from '@resume-editor/canvas-engine';
import { IncrementalLayoutScheduler, type LayoutWorkerPort } from './incremental-layout-scheduler';

export interface UseIncrementalLayoutOptions {
  worker: LayoutWorkerPort;
  onPreview(request: IncrementalLayoutRequest): void;
  onApply(result: IncrementalLayoutResult): void;
}

export function useIncrementalLayout(options: UseIncrementalLayoutOptions) {
  const scheduler = useMemo(
    () => new IncrementalLayoutScheduler(options),
    [options.worker, options.onPreview, options.onApply]
  );
  useEffect(() => () => scheduler.dispose(), [scheduler]);

  return {
    schedule: useCallback(
      (request: IncrementalLayoutRequest) => scheduler.schedule(request),
      [scheduler]
    ),
    onCompositionStart: useCallback(() => scheduler.compositionStart(), [scheduler]),
    onCompositionEnd: useCallback(() => scheduler.compositionEnd(), [scheduler]),
  };
}
