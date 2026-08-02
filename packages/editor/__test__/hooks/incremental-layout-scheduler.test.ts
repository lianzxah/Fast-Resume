import { describe, expect, it, vi } from 'vitest';
import { IncrementalLayoutScheduler } from '../../src/hooks/incremental-layout-scheduler';

function result(revision: number) {
  return {
    snapshot: { revision },
    diff: { toRevision: revision, operations: [] },
  } as any;
}

describe('IncrementalLayoutScheduler', () => {
  it('coalesces local previews into one animation frame with the latest revision', () => {
    const frames: FrameRequestCallback[] = [];
    const preview = vi.fn();
    const scheduler = new IncrementalLayoutScheduler({
      worker: { reflow: vi.fn() },
      onPreview: preview,
      onApply: vi.fn(),
      requestFrame: (callback) => (frames.push(callback), frames.length),
      cancelFrame: vi.fn(),
      setTimer: vi.fn(() => 1),
      clearTimer: vi.fn(),
    });

    scheduler.schedule({ revision: 1 } as any);
    scheduler.schedule({ revision: 2 } as any);
    expect(preview).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    frames.shift()!(0);
    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview.mock.calls[0][0].revision).toBe(2);
  });

  it('discards stale worker results and atomically applies only the latest revision in RAF', async () => {
    const frames: FrameRequestCallback[] = [];
    const timers: Array<() => void> = [];
    const resolvers = new Map<number, (value: any) => void>();
    const apply = vi.fn();
    const scheduler = new IncrementalLayoutScheduler({
      worker: {
        reflow: ({ revision }) => new Promise((resolve) => resolvers.set(revision, resolve)),
      },
      onPreview: vi.fn(),
      onApply: apply,
      requestFrame: (callback) => (frames.push(callback), frames.length),
      cancelFrame: vi.fn(),
      setTimer: (callback) => (timers.push(callback), timers.length),
      clearTimer: vi.fn(),
    });

    scheduler.schedule({ revision: 1 } as any);
    frames.shift()!(0);
    timers.shift()!();
    scheduler.schedule({ revision: 2 } as any);
    frames.shift()!(0);
    timers.shift()!();

    resolvers.get(1)!(result(1));
    await Promise.resolve();
    expect(apply).not.toHaveBeenCalled();
    resolvers.get(2)!(result(2));
    await Promise.resolve();
    expect(frames).toHaveLength(1);
    frames.shift()!(0);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0][0].snapshot.revision).toBe(2);
  });

  it('defers global reflow during composition and runs it on compositionend', () => {
    const timers: Array<() => void> = [];
    const reflow = vi.fn().mockResolvedValue(result(1));
    const scheduler = new IncrementalLayoutScheduler({
      worker: { reflow },
      onPreview: vi.fn(),
      onApply: vi.fn(),
      requestFrame: vi.fn(() => 1),
      cancelFrame: vi.fn(),
      setTimer: (callback) => (timers.push(callback), timers.length),
      clearTimer: vi.fn(),
    });

    scheduler.compositionStart();
    scheduler.schedule({ revision: 1 } as any);
    expect(timers).toHaveLength(0);
    scheduler.compositionEnd();
    expect(reflow).toHaveBeenCalledTimes(1);
  });
});
