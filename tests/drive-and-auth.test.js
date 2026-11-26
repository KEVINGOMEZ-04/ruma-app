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

describe('Google OAuth minimal scopes, Ruma 🌷 root folder & Drive HD streaming', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    GoogleAuth.clearToken();
  });

  it('uses non-restricted drive.file scope for Drive and profile-only scopes for login', () => {
    expect(CONFIG.googleDrive.scopes).toContain('https://www.googleapis.com/auth/drive.file');
    expect(CONFIG.googleDrive.scopes).not.toMatch(/\/auth\/drive(\s|$)/);
    expect(CONFIG.googleDrive.profileScopes).not.toContain('drive');
    expect(CONFIG.googleDrive.rootFolderName).toBe('Ruma 🌷');
  });

  it('distinguishes profile-only login sessions from Drive-authorized sessions', () => {
    localStorage.setItem(CONFIG.storageKeys.driveAuthSession, JSON.stringify({
      accessToken: 'tok_profile_only',
      email: 'user@example.com',
      hasDriveScope: false,
      expiresAt: Date.now() + 60_000
    }));

    expect(GoogleAuth.getAccessToken()).toBe('tok_profile_only');
    expect(GoogleAuth.hasDriveAccess()).toBe(false);
    expect(GoogleAuth.getDriveAccessToken()).toBeNull();
    expect(GoogleAuth.isConnected()).toBe(false);

    GoogleAuth.clearToken();
    localStorage.setItem(CONFIG.storageKeys.driveAuthSession, JSON.stringify({
      accessToken: 'tok_drive_file',
      email: 'user@example.com',
      hasDriveScope: true,
      expiresAt: Date.now() + 60_000
    }));

    expect(GoogleAuth.hasDriveAccess()).toBe(true);
    expect(GoogleAuth.getDriveAccessToken()).toBe('tok_drive_file');
  });

  it('reuses existing Ruma 🌷 root folder without creating duplicates, or creates Ruma 🌷 when absent', async () => {
    // 1) Existing Ruma 🌷 found -> reuses it (1 GET call, no POST)
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        files: [{ id: 'ruma_existing_id', name: 'Ruma 🌷', webViewLink: 'https://drive.google.com/drive/folders/ruma_existing_id' }]
      })
    });

    const reused = await DriveResumableUploader.createRootGroupFolder('tok_123');
    expect(reused.id).toBe('ruma_existing_id');
    expect(reused.name).toBe('Ruma 🌷');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // 2) Not found -> creates folder named exactly 'Ruma 🌷'
    let createdBody = null;
    globalThis.fetch = vi.fn()
      .mockImplementationOnce(async () => ({ ok: true, json: async () => ({ files: [] }) }))
      .mockImplementationOnce(async (_url, opts) => {
        createdBody = JSON.parse(opts.body);
        return { ok: true, json: async () => ({ id: 'ruma_new_id', name: 'Ruma 🌷', webViewLink: 'https://drive.google.com/drive/folders/ruma_new_id' }) };
      });

    const created = await DriveResumableUploader.createRootGroupFolder('tok_123');
    expect(created.id).toBe('ruma_new_id');
    expect(createdBody.name).toBe('Ruma 🌷');
    expect(createdBody.mimeType).toBe('application/vnd.google-apps.folder');
  });

  it('resolves cross-device HD/video media from Drive when Drive is connected, or flags needsDriveConnect otherwise', async () => {
    const { DriveBridge } = await import('../src/services/drive-bridge.js');
    const { MediaStorage } = await import('../src/services/media-storage.js');

    vi.spyOn(MediaStorage, 'getObjectUrl').mockResolvedValue(null);
    vi.spyOn(MediaStorage, 'saveMedia').mockResolvedValue({});

    const fileMeta = {
      id: 'blob_remote_1',
      name: 'playa.mp4',
      type: 'video/mp4',
      isVideo: true,
      thumbnail: 'data:image/jpeg;base64,AAAA',
      driveFileId: 'drive_vid_1',
      driveViewLink: 'https://drive.google.com/file/d/drive_vid_1/view'
    };

    // Without Drive token -> falls back to thumbnail and flags needsDriveConnect
    const offlineRes = await DriveBridge.resolveMemoryFileMedia(fileMeta, { id: 'g1' });
    expect(offlineRes.source).toBe('thumbnail');
    expect(offlineRes.needsDriveConnect).toBe(true);
    expect(offlineRes.originalIsVideo).toBe(true);

    // With Drive token -> downloads real video blob from Drive and returns objectURL
    localStorage.setItem(CONFIG.storageKeys.driveAuthSession, JSON.stringify({
      accessToken: 'tok_drive_ok',
      email: 'member@example.com',
      hasDriveScope: true,
      expiresAt: Date.now() + 60_000
    }));
    vi.spyOn(DriveResumableUploader, 'downloadFileBlob').mockResolvedValue(new Blob(['video-bytes'], { type: 'video/mp4' }));

    const hdRes = await DriveBridge.resolveMemoryFileMedia(fileMeta, { id: 'g1' });
    expect(hdRes.source).toBe('drive');
    expect(hdRes.isVideo).toBe(true);
    expect(hdRes.needsDriveConnect).toBe(false);
    expect(hdRes.url).toMatch(/^blob:/);
    URL.revokeObjectURL(hdRes.url);
  });

  it('blocks non-admin members from creating/linking the group Drive folder or rendering Drive config controls', async () => {
    const { DriveBridge } = await import('../src/services/drive-bridge.js');
    const { renderDriveConnectionPanelHtml } = await import('../src/components/drive-connect-modal.js');

    // Non-admin cannot auto-create Ruma 🌷 root folder via syncExistingMemoryToDrive
    localStorage.setItem(CONFIG.storageKeys.driveAuthSession, JSON.stringify({
      accessToken: 'tok_drive_member',
      email: 'member@example.com',
      hasDriveScope: true,
      expiresAt: Date.now() + 60_000
    }));

    const unlinkedGroup = { id: 'g_no_drive', name: 'Grupo Sin Drive', driveFolderUrl: '', creatorId: 'u_admin', admins: ['u_admin'], members: [{ id: 'u_admin', role: 'admin' }, { id: 'u_member', role: 'member' }] };
    const mem = { id: 'm1', title: 'Foto', date: '2026-11-26', files: [] };

    await expect(
      DriveBridge.syncExistingMemoryToDrive(unlinkedGroup, mem, null, { allowCreateRootFolder: false })
    ).rejects.toThrow(/Administradores/i);

    // Non-admin panel HTML is strictly read-only with zero config inputs/buttons
    const nonAdminHtml = renderDriveConnectionPanelHtml(unlinkedGroup, false);
    expect(nonAdminHtml).toContain('Solo administradores');
    expect(nonAdminHtml).not.toContain('inp-drive-folder-url');
    expect(nonAdminHtml).not.toContain('btn-drive-create-auto-folder');
    expect(nonAdminHtml).not.toContain('btn-drive-save-all');
    expect(nonAdminHtml).not.toContain('btn-drive-google-login');
  });
});
