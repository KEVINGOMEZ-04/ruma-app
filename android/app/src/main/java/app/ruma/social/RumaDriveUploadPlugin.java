package app.ruma.social;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Size;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.lifecycle.LiveData;
import androidx.lifecycle.Observer;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.OutOfQuotaPolicy;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.UUID;

/**
 * Plugin nativo Capacitor 8 para:
 * 1) Selección de fotos/videos mediante Android Photo Picker oficial (SIN READ_MEDIA_IMAGES/VIDEO).
 * 2) Subidas en 2.º plano hacia Google Drive vía WorkManager (`DriveUploadWorker`).
 */
@CapacitorPlugin(name = "RumaDriveUpload")
public class RumaDriveUploadPlugin extends Plugin {

    @PluginMethod
    public void pickMedia(PluginCall call) {
        int requestedMax = call.getInt("maxItems", 10);
        int safeMax = Math.max(1, Math.min(requestedMax, 30));

        PickVisualMediaRequest request = new PickVisualMediaRequest.Builder()
                .setMediaType(ActivityResultContracts.PickVisualMedia.ImageAndVideo.INSTANCE)
                .build();

        Intent intent;
        if (safeMax == 1) {
            intent = new ActivityResultContracts.PickVisualMedia().createIntent(getContext(), request);
        } else {
            intent = new ActivityResultContracts.PickMultipleVisualMedia(safeMax).createIntent(getContext(), request);
        }
        startActivityForResult(call, intent, "handlePickMediaResult");
    }

    @ActivityCallback
    private void handlePickMediaResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        List<Uri> uris = new ActivityResultContracts.PickMultipleVisualMedia()
                .parseResult(result.getResultCode(), result.getData());

        JSArray files = new JSArray();
        if (uris != null) {
            ContentResolver resolver = getContext().getContentResolver();
            for (Uri uri : uris) {
                if (uri == null) continue;
                try {
                    resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (Exception ignored) {
                    // Photo Picker temporal grants remain readable for the active task lifecycle
                }

                String name = queryDisplayName(resolver, uri);
                long size = querySize(resolver, uri);
                String mimeType = resolver.getType(uri);
                if (mimeType == null || mimeType.isEmpty()) mimeType = "application/octet-stream";

                JSObject item = new JSObject();
                item.put("uri", uri.toString());
                item.put("name", name);
                item.put("mimeType", mimeType);
                item.put("size", size);
                item.put("thumbnailDataUrl", buildThumbnailDataUrl(resolver, uri));
                files.put(item);
            }
        }

        JSObject ret = new JSObject();
        ret.put("files", files);
        call.resolve(ret);
    }

    @PluginMethod
    public void enqueueUpload(PluginCall call) {
        String accessToken = call.getString("accessToken", "");
        String folderId = call.getString("folderId", "");
        String title = call.getString("title", "Recuerdo");
        JSArray files = call.getArray("files");

        if (accessToken.isEmpty() || folderId.isEmpty() || files == null || files.length() == 0) {
            call.reject("accessToken, folderId y files son requeridos.");
            return;
        }

        try {
            String jobId = UUID.randomUUID().toString();
            JSONObject vaultPayload = new JSONObject();
            vaultPayload.put("accessToken", accessToken);
            vaultPayload.put("folderId", folderId);
            vaultPayload.put("title", title);
            vaultPayload.put("files", files);

            RumaKeystoreHelper.putEncrypted(getContext(), "drive_job_" + jobId, vaultPayload.toString());

            Constraints constraints = new Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build();

            OneTimeWorkRequest workRequest = new OneTimeWorkRequest.Builder(DriveUploadWorker.class)
                    .setConstraints(constraints)
                    .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                    .setInputData(new Data.Builder().putString(DriveUploadWorker.KEY_JOB_ID, jobId).build())
                    .build();

            WorkManager wm = WorkManager.getInstance(getContext());
            wm.enqueue(workRequest);
            final UUID workUuid = workRequest.getId();

            new Handler(Looper.getMainLooper()).post(() -> {
                LiveData<WorkInfo> liveData = wm.getWorkInfoByIdLiveData(workUuid);
                Observer<WorkInfo> observer = new Observer<WorkInfo>() {
                    @Override
                    public void onChanged(WorkInfo info) {
                        if (info == null) return;
                        Data prog = info.getProgress();
                        int pct = prog.getInt(DriveUploadWorker.KEY_PROGRESS_PERCENT, -1);
                        if (pct >= 0) {
                            JSObject evt = new JSObject();
                            evt.put("workId", workUuid.toString());
                            evt.put("percent", pct);
                            evt.put("fileIndex", prog.getInt(DriveUploadWorker.KEY_PROGRESS_FILE_INDEX, 1));
                            evt.put("totalFiles", prog.getInt(DriveUploadWorker.KEY_PROGRESS_TOTAL_FILES, files.length()));
                            evt.put("fileName", prog.getString(DriveUploadWorker.KEY_PROGRESS_FILE_NAME));
                            notifyListeners("uploadProgress", evt);
                        }

                        if (info.getState().isFinished()) {
                            liveData.removeObserver(this);
                            if (info.getState() == WorkInfo.State.SUCCEEDED) {
                                JSObject ret = new JSObject();
                                ret.put("workId", workUuid.toString());
                                try {
                                    String raw = info.getOutputData().getString(DriveUploadWorker.KEY_RESULT_JSON);
                                    JSONObject parsed = raw != null ? new JSONObject(raw) : new JSONObject();
                                    ret.put("uploaded", parsed.optJSONArray("uploaded") != null ? parsed.optJSONArray("uploaded") : new JSONArray());
                                    ret.put("failed", parsed.optJSONArray("failed") != null ? parsed.optJSONArray("failed") : new JSONArray());
                                } catch (Exception e) {
                                    ret.put("uploaded", new JSArray());
                                    ret.put("failed", new JSArray());
                                }
                                call.resolve(ret);
                            } else {
                                call.reject("La subida a Google Drive fue cancelada o falló.");
                            }
                        }
                    }
                };
                liveData.observeForever(observer);
            });
        } catch (Exception e) {
            call.reject("No se pudo iniciar la subida en 2.º plano: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancelUpload(PluginCall call) {
        String workId = call.getString("workId");
        if (workId != null && !workId.isEmpty()) {
            try {
                WorkManager.getInstance(getContext()).cancelWorkById(UUID.fromString(workId));
            } catch (Exception ignored) {}
        }
        call.resolve();
    }

    private static String queryDisplayName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    String name = cursor.getString(idx);
                    if (name != null && !name.trim().isEmpty()) return name.trim();
                }
            }
        } catch (Exception ignored) {}
        return "recuerdo_" + System.currentTimeMillis();
    }

    private static long querySize(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.SIZE}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (idx >= 0) return cursor.getLong(idx);
            }
        } catch (Exception ignored) {}
        return 0L;
    }

    private static String buildThumbnailDataUrl(ContentResolver resolver, Uri uri) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "";
        try {
            Bitmap bmp = resolver.loadThumbnail(uri, new Size(320, 320), null);
            if (bmp == null) return "";
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 70, bos);
            bmp.recycle();
            return "data:image/jpeg;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
        } catch (Exception ignored) {
            return "";
        }
    }
}
