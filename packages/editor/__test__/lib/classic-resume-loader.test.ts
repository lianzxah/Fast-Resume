import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PAGE_CONFIG, type ResumeDocument } from '@resume-editor/shared';
import { loadClassicResume } from '../../src/lib/classic-resume-loader';

function document(title: string): ResumeDocument {
  return {
    id: `document-${title}`,
    version: '1.0.0',
    metadata: {
      title,
      author: '',
      createdAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    },
    pageConfig: DEFAULT_PAGE_CONFIG,
    pages: [{ id: `page-${title}`, pageNumber: 1, elements: [] }],
  };
}

describe('loadClassicResume', () => {
  it('loads the remote formal resume when no local backup exists', async () => {
    const remote = document('远端版本');
    const fetchResume = vi.fn().mockResolvedValue({ document: remote });

    await expect(
      loadClassicResume('resume-1', { fetchResume, readBackup: () => null })
    ).resolves.toEqual({ document: remote, usedBackup: false });
    expect(fetchResume).toHaveBeenCalledWith('resume-1');
  });

  it('prefers a different local backup without mutating the remote document', async () => {
    const remote = document('远端版本');
    const backup = document('本地未保存版本');

    const result = await loadClassicResume('resume-1', {
      fetchResume: vi.fn().mockResolvedValue({ document: remote }),
      readBackup: () => backup,
    });

    expect(result).toEqual({ document: backup, usedBackup: true });
    expect(remote.metadata.title).toBe('远端版本');
  });

  it('propagates a load failure to the route boundary', async () => {
    await expect(
      loadClassicResume('resume-1', {
        fetchResume: vi.fn().mockRejectedValue(new Error('服务不可用')),
        readBackup: () => null,
      })
    ).rejects.toThrow('服务不可用');
  });
});
