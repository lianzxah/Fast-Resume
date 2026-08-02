import type {
  IncrementalLayoutRequest,
  IncrementalLayoutResult,
} from '@resume-editor/canvas-engine';

export interface LayoutWorkerPort {
  reflow(request: IncrementalLayoutRequest): Promise<IncrementalLayoutResult>;
}

export interface IncrementalLayoutSchedulerOptions {
  worker: LayoutWorkerPort;
  onPreview(request: IncrementalLayoutRequest): void;
  onApply(result: IncrementalLayoutResult): void;
  onError?(error: unknown): void;
  idleMs?: number;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
  setTimer?: (callback: () => void, delay: number) => number;
  clearTimer?: (handle: number) => void;
}

/** 两阶段调度：RAF 合并局部预览，120ms/组合结束后请求 Worker 全局回流。 */
export class IncrementalLayoutScheduler {
  private readonly options: Required<IncrementalLayoutSchedulerOptions> & {
    idleMs: number;
  };
  private latestRequest: IncrementalLayoutRequest | null = null;
  private previewFrame: number | null = null;
  private applyFrame: number | null = null;
  private timer: number | null = null;
  private composing = false;
  private disposed = false;

  constructor(options: IncrementalLayoutSchedulerOptions) {
    this.options = {
      ...options,
      idleMs: options.idleMs ?? 120,
      onError: options.onError ?? (() => undefined),
      requestFrame: options.requestFrame ?? requestAnimationFrame,
      cancelFrame: options.cancelFrame ?? cancelAnimationFrame,
      setTimer: options.setTimer ?? ((callback, delay) => window.setTimeout(callback, delay)),
      clearTimer: options.clearTimer ?? ((handle) => window.clearTimeout(handle)),
    };
  }

  schedule(request: IncrementalLayoutRequest): void {
    if (this.disposed) return;
    this.latestRequest = request;
    if (this.previewFrame === null) {
      this.previewFrame = this.options.requestFrame(() => {
        this.previewFrame = null;
        if (this.latestRequest) this.options.onPreview(this.latestRequest);
      });
    }
    if (!this.composing) this.scheduleGlobalReflow();
  }

  compositionStart(): void {
    this.composing = true;
    this.clearGlobalTimer();
  }

  compositionEnd(): void {
    this.composing = false;
    void this.runGlobalReflow();
  }

  dispose(): void {
    this.disposed = true;
    this.clearGlobalTimer();
    if (this.previewFrame !== null) this.options.cancelFrame(this.previewFrame);
    if (this.applyFrame !== null) this.options.cancelFrame(this.applyFrame);
    this.previewFrame = null;
    this.applyFrame = null;
  }

  private scheduleGlobalReflow(): void {
    this.clearGlobalTimer();
    this.timer = this.options.setTimer(() => {
      this.timer = null;
      void this.runGlobalReflow();
    }, this.options.idleMs);
  }

  private clearGlobalTimer(): void {
    if (this.timer !== null) this.options.clearTimer(this.timer);
    this.timer = null;
  }

  private async runGlobalReflow(): Promise<void> {
    const request = this.latestRequest;
    if (!request || this.disposed || this.composing) return;
    let result: IncrementalLayoutResult;
    try {
      result = await this.options.worker.reflow(request);
    } catch (error) {
      if (!this.disposed) this.options.onError(error);
      return;
    }
    if (this.disposed || result.snapshot.revision !== this.latestRequest?.revision) {
      return;
    }
    if (this.applyFrame !== null) this.options.cancelFrame(this.applyFrame);
    this.applyFrame = this.options.requestFrame(() => {
      this.applyFrame = null;
      if (result.snapshot.revision === this.latestRequest?.revision) {
        this.options.onApply(result);
      }
    });
  }
}
