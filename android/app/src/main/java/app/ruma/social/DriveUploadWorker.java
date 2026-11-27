package app.ruma.social;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Data;
import androidx.work.ForegroundInfo;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Worker de WorkManager para subidas pesadas a Google Drive en 2.º plano (Android 14–16 compliant):
 * - Lee los archivos en streaming en bloques de 5 MB directo desde `content://` (sin OOM).
 * - Usa Google Drive Resumable Upload API (`308 Resume Incomplete`).
 * - Muestra notificación de progreso con botón "Cancelar" en canal `drive_uploads`.
 * - Recupera el token de acceso desde Android Keystore (nunca guardado en claro en WorkManager SQLite)
 *   y lo purga automáticamente al terminar.
 */
public class DriveUploadWorker extends Worker {
    public static final String KEY_JOB_ID = "jobId";
    public static final String KEY_PROGRESS_PERCENT = "percent";
    public static final String KEY_PROGRESS_FILE_INDEX = "fileIndex";
    public static final String KEY_PROGRESS_TOTAL_FILES = "totalFiles";
    public static final String KEY_PROGRESS_FILE_NAME = "fileName";
    public static final String KEY_RESULT_JSON = "resultJson";
    public static final String KEY_RESULT_KEY = "resultKey";
    public static final String KEY_ERROR_MESSAGE = "errorMessage";

    private static final String CHANNEL_ID = "drive_uploads";
    private static final int NOTIFICATION_ID = 4102;
    private static final int CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB (múltiplo de 256 KB requerido por Google)

    public DriveUploadWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public ForegroundInfo getForegroundInfo() {
        ensureChannel();
        return createForegroundInfo("Google Drive", "Subiendo recuerdos a tu carpeta Ruma...", 5, 100);
    }

    private Result failWithMessage(String message) {
        String safeMsg = message == null ? "Error al subir a Google Drive" : message;
        if (safeMsg.length() > 260) safeMsg = safeMsg.substring(0, 260);
        return Result.failure(new Data.Builder().putString(KEY_ERROR_MESSAGE, safeMsg).build());
    }

    @NonNull
    @Override
    public Result doWork() {
        String jobId = getInputData().getString(KEY_JOB_ID);
        if (jobId == null || jobId.isEmpty()) {
            return failWithMessage("Identificador de subida no válido.");
        }
        String vaultKey = "drive_job_" + jobId;
        try {
            String rawPayload = RumaKeystoreHelper.getDecrypted(getApplicationContext(), vaultKey);
            if (rawPayload == null || rawPayload.isEmpty()) {
                return failWithMessage("No se encontraron los datos de la subida (sesión expirada).");
            }

            JSONObject job = new JSONObject(rawPayload);
            String accessToken = job.optString("accessToken", "");
            String folderId = job.optString("folderId", "");
            String title = job.optString("title", "Recuerdo");
            JSONArray files = job.optJSONArray("files");
            if (accessToken.isEmpty() || folderId.isEmpty() || files == null || files.length() == 0) {
                return failWithMessage("Datos de subida incompletos (token, carpeta o archivos).");
            }

            ensureChannel();
            try {
                setForegroundAsync(createForegroundInfo(title, "Preparando subida a Google Drive...", 5, 100));
            } catch (Exception ignored) {
                // MIUI puede restringir notificaciones en primer plano
            }

            JSONArray uploaded = new JSONArray();
            JSONArray failed = new JSONArray();
            int totalFiles = files.length();

            for (int i = 0; i < totalFiles; i++) {
                if (isStopped()) {
                    return failWithMessage("Subida cancelada.");
                }
                JSONObject fileObj = files.getJSONObject(i);
                String uriStr = fileObj.optString("uri", "");
                String fileName = fileObj.optString("name", "archivo_" + (i + 1));
                String mimeType = fileObj.optString("mimeType", "application/octet-stream");
                long fileSize = fileObj.optLong("size", 0L);

                try {
                    JSONObject driveItem = uploadSingleFileResumable(
                            accessToken,
                            folderId,
                            Uri.parse(uriStr),
                            fileName,
                            mimeType,
                            fileSize,
                            title,
                            i,
                            totalFiles
                    );
                    driveItem.put("index", i);
                    uploaded.put(driveItem);
                } catch (Exception fileErr) {
                    JSONObject errEntry = new JSONObject();
                    errEntry.put("name", fileName);
                    errEntry.put("index", i);
                    String errMsg = fileErr.getMessage() != null ? fileErr.getMessage() : "Error al subir";
                    if (errMsg.length() > 220) errMsg = errMsg.substring(0, 220);
                    errEntry.put("error", errMsg);
                    failed.put(errEntry);
                }
            }

            JSONObject summary = new JSONObject();
            summary.put("uploaded", uploaded);
            summary.put("failed", failed);

            String summaryStr = summary.toString();
            String resultKey = "drive_result_" + jobId;
            RumaKeystoreHelper.putEncrypted(getApplicationContext(), resultKey, summaryStr);
            Data.Builder outBuilder = new Data.Builder().putString(KEY_RESULT_KEY, resultKey);
            if (summaryStr.length() < 4096) {
                outBuilder.putString(KEY_RESULT_JSON, summaryStr);
            }
            return Result.success(outBuilder.build());
        } catch (Exception e) {
            return failWithMessage(e.getMessage());
        } finally {
            RumaKeystoreHelper.remove(getApplicationContext(), vaultKey);
        }
    }

    private JSONObject uploadSingleFileResumable(
            String accessToken,
            String folderId,
            Uri contentUri,
            String fileName,
            String mimeType,
            long knownSize,
            String memoryTitle,
            int fileIndexZero,
            int totalFiles
    ) throws Exception {
        ContentResolver resolver = getApplicationContext().getContentResolver();
        long totalSize = knownSize;
        if (totalSize <= 0) {
            try (InputStream probe = resolver.openInputStream(contentUri)) {
                if (probe != null) {
                    byte[] tmp = new byte[64 * 1024];
                    long counted = 0;
                    int read;
                    while ((read = probe.read(tmp)) != -1) {
                        counted += read;
                    }
                    totalSize = counted;
                }
            }
        }
        if (totalSize <= 0) {
            throw new IllegalStateException("El archivo seleccionado está vacío o no es accesible.");
        }

        // 1. Iniciar sesión de subida resumable en Google Drive API v3
        String uploadUrl = initResumableSession(accessToken, folderId, fileName, mimeType, totalSize);

        // 2. Enviar fragmentos de 5 MB leyendo en streaming desde ContentResolver
        byte[] chunkBuffer = new byte[CHUNK_SIZE];
        long offset = 0L;
        String finalBody = "";

        try (InputStream rawIn = resolver.openInputStream(contentUri)) {
            if (rawIn == null) {
                throw new IllegalStateException("No se pudo abrir el archivo para lectura.");
            }
            BufferedInputStream in = new BufferedInputStream(rawIn, 64 * 1024);

            while (offset < totalSize) {
                if (isStopped()) {
                    throw new IllegalStateException("Subida cancelada por el usuario.");
                }
                int bytesToRead = (int) Math.min(CHUNK_SIZE, totalSize - offset);
                int filled = 0;
                while (filled < bytesToRead) {
                    int n = in.read(chunkBuffer, filled, bytesToRead - filled);
                    if (n == -1) break;
                    filled += n;
                }
                if (filled <= 0) break;

                long endByte = offset + filled - 1;
                HttpURLConnection conn = (HttpURLConnection) new URL(uploadUrl).openConnection();
                conn.setRequestMethod("PUT");
                conn.setConnectTimeout(30_000);
                conn.setReadTimeout(90_000);
                conn.setDoOutput(true);
                conn.setFixedLengthStreamingMode(filled);
                conn.setRequestProperty("Content-Type", mimeType);
                conn.setRequestProperty("Content-Range", "bytes " + offset + "-" + endByte + "/" + totalSize);

                try (OutputStream out = conn.getOutputStream()) {
                    out.write(chunkBuffer, 0, filled);
                    out.flush();
                }

                int code = conn.getResponseCode();
                if (code == 308) {
                    offset += filled;
                } else if (code >= 200 && code < 300) {
                    finalBody = readStream(conn.getInputStream());
                    offset = totalSize;
                } else {
                    String err = readStream(conn.getErrorStream());
                    throw new IllegalStateException("Google Drive HTTP " + code + ": " + err);
                }
                conn.disconnect();

                double fileFraction = (double) offset / (double) totalSize;
                int overallPct = (int) Math.min(99, Math.max(5, Math.round(((fileIndexZero + fileFraction) / totalFiles) * 100.0)));
                reportProgress(memoryTitle, fileName, fileIndexZero + 1, totalFiles, overallPct);
            }
        }

        JSONObject parsed = finalBody.isEmpty() ? new JSONObject() : new JSONObject(finalBody);
        String id = parsed.optString("id", "");
        JSONObject out = new JSONObject();
        out.put("id", id);
        out.put("name", parsed.optString("name", fileName));
        out.put("webViewLink", parsed.optString("webViewLink", id.isEmpty() ? "" : "https://drive.google.com/file/d/" + id + "/view"));
        return out;
    }

    private String initResumableSession(
            String accessToken,
            String folderId,
            String fileName,
            String mimeType,
            long totalSize
    ) throws Exception {
        JSONObject meta = new JSONObject();
        meta.put("name", fileName);
        JSONArray parents = new JSONArray();
        parents.put(folderId);
        meta.put("parents", parents);

        byte[] metaBytes = meta.toString().getBytes(StandardCharsets.UTF_8);
        URL url = new URL("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setConnectTimeout(30_000);
        conn.setReadTimeout(30_000);
        conn.setDoOutput(true);
        conn.setRequestProperty("Authorization", "Bearer " + accessToken);
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        conn.setRequestProperty("X-Upload-Content-Type", mimeType);
        conn.setRequestProperty("X-Upload-Content-Length", String.valueOf(totalSize));

        try (OutputStream out = conn.getOutputStream()) {
            out.write(metaBytes);
            out.flush();
        }

        int code = conn.getResponseCode();
        String location = conn.getHeaderField("Location");
        if (code < 200 || code >= 300 || location == null || location.isEmpty()) {
            String err = readStream(conn.getErrorStream());
            conn.disconnect();
            throw new IllegalStateException("No se pudo iniciar la sesión resumable (HTTP " + code + "): " + err);
        }
        conn.disconnect();
        return location;
    }

    private void reportProgress(String title, String fileName, int fileIndex, int totalFiles, int percent) {
        String text = "Subiendo (" + fileIndex + "/" + totalFiles + "): " + fileName;
        try {
            setForegroundAsync(createForegroundInfo(title, text, percent, 100));
        } catch (Exception ignored) {
            // MIUI puede restringir notificaciones en primer plano
        }
        setProgressAsync(new Data.Builder()
                .putInt(KEY_PROGRESS_PERCENT, percent)
                .putInt(KEY_PROGRESS_FILE_INDEX, fileIndex)
                .putInt(KEY_PROGRESS_TOTAL_FILES, totalFiles)
                .putString(KEY_PROGRESS_FILE_NAME, fileName)
                .build());
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getApplicationContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID,
                        "Subidas a Google Drive",
                        NotificationManager.IMPORTANCE_LOW
                );
                ch.setDescription("Progreso de respaldo de fotos y videos en segundo plano");
                nm.createNotificationChannel(ch);
            }
        }
    }

    private ForegroundInfo createForegroundInfo(String title, String contentText, int progress, int max) {
        PendingIntent cancelIntent = WorkManager.getInstance(getApplicationContext())
                .createCancelPendingIntent(getId());

        Notification notification = new NotificationCompat.Builder(getApplicationContext(), CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_ruma)
                .setContentTitle("ruma · " + title)
                .setContentText(contentText)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setProgress(max, progress, false)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Cancelar", cancelIntent)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return new ForegroundInfo(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        }
        return new ForegroundInfo(NOTIFICATION_ID, notification);
    }

    private static String readStream(InputStream in) {
        if (in == null) return "";
        try (InputStream stream = in; ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096];
            int n;
            while ((n = stream.read(buf)) != -1) {
                bos.write(buf, 0, n);
            }
            return bos.toString(StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            return "";
        }
    }
}
