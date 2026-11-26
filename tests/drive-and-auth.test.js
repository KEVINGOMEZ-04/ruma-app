import { describe, it, expect, beforeEach, vi } from 'vitest';

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    clear: () => { data.clear(); }
  };
}

globalThis.localStorage = createMemoryStorage();

const { CONFIG } = await import('../src/core/config.js');
const { GoogleAuth } = await import('../src/services/google-auth.js');
const { DriveResumableUploader } = await import('../src/services/drive-resumable-uploader.js');

describe('GoogleAuth session expiration (AUD-08)', () => {
  beforeEach(() => {
    localStorage.clear();
    GoogleAuth.clearToken();
  });

  it('invalidates an in-memory cached session once expiresAt has passed', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-01T12:00:00Z'));
      localStorage.setItem(CONFIG.storageKeys.driveAuthSession, JSON.stringify({
        accessToken: 'tok_123',
        email: 'test@example.com',
        expiresAt: Date.now() + 60_000
      }));

      // Loads into in-memory currentSession
      expect(GoogleAuth.getAccessToken()).toBe('tok_123');

      // Advance past expiration without page reload
      vi.advanceTimersByTime(61_000);
      expect(GoogleAuth.getAccessToken()).toBeNull();
      expect(GoogleAuth.isConnected()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('DriveResumableUploader hardening (AUD-08)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects trashed items and non-folder mimeTypes in verifyFolderAccess', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'f1', name: 'Trash', mimeType: 'application/vnd.google-apps.folder', trashed: true })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'f2', name: 'doc.pdf', mimeType: 'application/pdf', trashed: false })
      });

    await expect(DriveResumableUploader.verifyFolderAccess('tok', 'f1')).rejects.toThrow(/papelera/i);
    await expect(DriveResumableUploader.verifyFolderAccess('tok', 'f2')).rejects.toThrow(/carpeta/i);
  });

  it('sends valid multipart/related Content-Type in uploadMultipartFile', async () => {
    let capturedHeaders = null;
    globalThis.fetch = vi.fn(async (_url, opts) => {
      capturedHeaders = opts.headers;
      return {
        ok: true,
        json: async () => ({ id: 'drive_1', name: 'foto.jpg', webViewLink: 'https://drive.google.com/file/d/drive_1/view' })
      };
    });

    const file = new Blob(['hello'], { type: 'image/jpeg' });
    file.name = 'foto.jpg';
    const res = await DriveResumableUploader.uploadMultipartFile('tok', 'folder_1', file);

    expect(res.id).toBe('drive_1');
    expect(capturedHeaders['Content-Type']).toMatch(/^multipart\/related; boundary=ruma_drive_/);
  });

  it('does not silently fall back to multipart when resumable init fails on large files (> 4.5 MB)', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid Credentials' } })
    }));

    const bigFile = new Blob([new Uint8Array(5 * 1024 * 1024)], { type: 'video/mp4' });
    bigFile.name = 'clip.mp4';

    await expect(DriveResumableUploader.uploadLargeFile('tok', 'folder_1', bigFile))
      .rejects.toThrow(/Invalid Credentials/);
    // Must only have called fetch once (no multipart fallback!)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('honors Range header on 308 responses during resumable chunked upload', async () => {
    const fileSize = 6 * 1024 * 1024;
    const bigFile = new Blob([new Uint8Array(fileSize)], { type: 'video/mp4' });
    bigFile.name = 'clip.mp4';

    const ranges = [];
    let call = 0;
    globalThis.fetch = vi.fn(async (_url, opts) => {
      call++;
      if (call === 1) {
        return { ok: true, status: 200, headers: new Headers({ Location: 'https://upload.example/session1' }) };
      }
      ranges.push(opts.headers['Content-Range']);
      if (call === 2) {
        // Server acknowledges only first 2 MB (bytes 0-2097151)
        return { ok: false, status: 308, headers: new Headers({ Range: 'bytes=0-2097151' }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'vid_99', name: 'clip.mp4', webViewLink: 'https://drive.google.com/file/d/vid_99/view' })
      };
    });

    const res = await DriveResumableUploader.uploadLargeFile('tok', 'folder_1', bigFile);
    expect(res.id).toBe('vid_99');
    expect(ranges[0]).toBe(`bytes 0-${5 * 1024 * 1024 - 1}/${fileSize}`);
    // Second chunk must resume from acknowledged byte 2097152, not 5 MB!
    expect(ranges[1]).toBe(`bytes 2097152-${fileSize - 1}/${fileSize}`);
  });
});

describe('DriveBridge.syncExistingMemoryToDrive idempotency (AUD-08)', () => {
  it('reuses existing driveSubfolderId, skips already-synced files, and never disguises a video thumbnail as .mp4', async () => {
    const { DriveBridge } = await import('../src/services/drive-bridge.js');
    const { MediaStorage } = await import('../src/services/media-storage.js');

    vi.spyOn(DriveBridge, 'ensureAccessToken').mockResolvedValue('tok_valid');
    const verifySpy = vi.spyOn(DriveResumableUploader, 'verifyFolderAccess').mockResolvedValue({
      id: 'sub_existing',
      name: 'Playa',
      webViewLink: 'https://drive.google.com/drive/folders/sub_existing'
    });
    const createSpy = vi.spyOn(DriveResumableUploader, 'createSubfolder');
    const uploadSpy = vi.spyOn(DriveResumableUploader, 'uploadLargeFile').mockResolvedValue({
      id: 'new_file_id',
      webViewLink: 'https://drive.google.com/file/d/new_file_id/view'
    });
    vi.spyOn(MediaStorage, 'getMedia').mockResolvedValue(null);

    const group = { id: 'g1', driveFolderUrl: 'https://drive.google.com/drive/folders/parent_1' };

    // Case 1: 1 already-synced photo + 1 missing video with JPEG thumbnail -> reuses subfolder, 0 uploads!
    const memory = {
      id: 'mem_1',
      title: 'Playa',
      date: '2026-05-01',
      driveSubfolderId: 'sub_existing',
      files: [
        { id: 'f1', name: 'foto.jpg', type: 'image/jpeg', isVideo: false, driveFileId: 'already_1' },
        { id: 'f2', name: 'clip.mp4', type: 'video/mp4', isVideo: true, thumbnail: 'data:image/jpeg;base64,AAAA' }
      ]
    };

    const res = await DriveBridge.syncExistingMemoryToDrive(group, memory);
    expect(verifySpy).toHaveBeenCalledWith('tok_valid', 'sub_existing');
    expect(createSpy).not.toHaveBeenCalled();
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(res.driveSubfolderId).toBe('sub_existing');

    // Case 2: Only missing video without IndexedDB blob -> must throw instead of falsely marking synced!
    const videoOnlyMem = {
      id: 'mem_2',
      title: 'Solo video',
      date: '2026-05-01',
      driveSubfolderId: 'sub_existing',
      files: [
        { id: 'f3', name: 'clip.mp4', type: 'video/mp4', isVideo: true, thumbnail: 'data:image/jpeg;base64,AAAA' }
      ]
    };
    await expect(DriveBridge.syncExistingMemoryToDrive(group, videoOnlyMem)).rejects.toThrow(/originales/i);
  });
});
