package com.chrismusic.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.YoutubeDLResponse;
import com.yausername.ffmpeg.FFmpeg;

import android.content.Context;
import android.util.Base64;
import android.util.Log;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "YouTubeNative")
public class YouTubeNativePlugin extends Plugin {
    private static final String TAG = "YouTubeNativePlugin";
    private boolean initialized = false;
    
    private static final String UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

    @PluginMethod
    public void init(PluginCall call) {
        try {
            boolean success = ensureEngineReady();
            JSObject ret = new JSObject();
            ret.put("status", success ? "initialized" : "failed");
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize native engine", e);
            call.reject("Initialization failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void forceReextraction(PluginCall call) {
        try {
            Context context = getContext();
            File ffmpegDir = new File(context.getNoBackupFilesDir(), "youtubedl-android");
            if (ffmpegDir.exists()) {
                deleteRecursive(ffmpegDir);
            }
            initialized = false;
            if (ensureEngineReady()) {
                call.resolve();
            } else {
                call.reject("Failed to re-initialize native engine");
            }
        } catch (Exception e) {
            call.reject("Force re-extraction failed: " + e.getMessage());
        }
    }

    private void deleteRecursive(File fileOrDirectory) {
        if (fileOrDirectory.isDirectory()) {
            File[] children = fileOrDirectory.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursive(child);
                }
            }
        }
        fileOrDirectory.delete();
    }

    @PluginMethod
    public void getDiagnostics(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            Context context = getContext();
            ret.put("initialized", initialized);
            ret.put("no_backup_dir", context.getNoBackupFilesDir().getAbsolutePath());
            ret.put("native_lib_dir", context.getApplicationInfo().nativeLibraryDir);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Diagnostics failed: " + e.getMessage());
        }
    }

    private synchronized boolean ensureEngineReady() {
        if (initialized) return true;
        try {
            Context context = getContext();
            Log.d(TAG, "[INIT] Initializing Native Engine APIs...");
            YoutubeDL.getInstance().init(context);
            FFmpeg.getInstance().init(context); 
            
            initialized = true;
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Native API init error", e);
            return false;
        }
    }


    private void addCommonOptions(YoutubeDLRequest request) {
        addCommonOptions(request, UA_DESKTOP);
    }

    private void addCommonOptions(YoutubeDLRequest request, String userAgent) {
        request.addOption("--user-agent", userAgent);
        request.addOption("--referer", "https://www.youtube.com/");
        request.addOption("--no-check-certificate");
        request.addOption("--no-update");
    }

    @PluginMethod
    public void getStreamUrl(PluginCall call) {
        String videoId = call.getString("videoId");
        if (videoId == null) {
            call.reject("videoId is required");
            return;
        }

        try {
            ensureEngineReady();
            YoutubeDLRequest request = new YoutubeDLRequest("https://www.youtube.com/watch?v=" + videoId);
            // El cliente 'web' suele ser el más estable para streams progresivos
            request.addOption("-f", "bestaudio[ext=m4a]/bestaudio/best");
            request.addOption("-g");
            request.addOption("--no-check-certificate");
            request.addOption("--no-warnings");
            request.addOption("--extractor-args", "youtube:player-client=web");
            addCommonOptions(request);
            
            Log.d(TAG, "[Stream] Extracting URL for: " + videoId);

            YoutubeDLResponse response = YoutubeDL.getInstance().execute(request, null);
            String url = response.getOut();

            if (url == null || url.trim().isEmpty()) {
                String err = response.getErr();
                call.reject("Extraction returned empty URL. Log: " + (err != null ? err : "No errors in log"));
                return;
            }

            JSObject ret = new JSObject();
            ret.put("url", url.trim());
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Extraction critical error: " + e.getMessage());
            call.reject("Extraction failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void downloadToAdts(PluginCall call) {
        String videoId = call.getString("videoId");
        if (videoId == null) {
            call.reject("videoId is required");
            return;
        }

        try {
            ensureEngineReady();

            // 1. Preparar archivo temporal
            File tempFile = new File(getContext().getCacheDir(), videoId + ".aac");
            if (tempFile.exists()) tempFile.delete();

            // 2. Usar YoutubeDL para descargar y transcodificar en UN SOLO paso
            YoutubeDLRequest request = new YoutubeDLRequest("https://www.youtube.com/watch?v=" + videoId);
            request.addOption("-f", "bestaudio/best");
            request.addOption("-o", tempFile.getAbsolutePath());
            addCommonOptions(request);

            Log.i(TAG, "Starting native yt-dlp audio extraction for " + videoId);
            
            // Execute (this block until finish)
            YoutubeDL.getInstance().execute(request, null);
            
            Log.i(TAG, "Native extraction success");

            // 3. Verificar resultado
            if (!tempFile.exists() || tempFile.length() == 0) {
                // yt-dlp a veces añade la extensión .aac si no la pusimos
                File fallbackFile = new File(getContext().getCacheDir(), videoId + ".aac.aac");
                if (fallbackFile.exists()) {
                    tempFile = fallbackFile;
                } else {
                    call.reject("Extraction failed: output file missing");
                    return;
                }
            }

            // 4. Leer Base64
            byte[] bytes = readFile(tempFile);
            String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);

            JSObject ret = new JSObject();
            ret.put("base64", base64);
            ret.put("format", "adts");
            call.resolve(ret);

            // Cleanup
            tempFile.delete();
        } catch (Exception e) {
            Log.e(TAG, "Native extraction error", e);
            call.reject("Extraction failed: " + e.getMessage());
        }
    }

    private byte[] readFile(File file) throws IOException {
        byte[] bytes = new byte[(int) file.length()];
        FileInputStream fis = new FileInputStream(file);
        fis.read(bytes);
        fis.close();
        return bytes;
    }

    @PluginMethod
    public void search(PluginCall call) {
        String query = call.getString("query");
        Integer count = call.getInt("count", 15);
        if (query == null) {
            call.reject("query is required");
            return;
        }

        try {
            ensureEngineReady();
            YoutubeDLRequest request = new YoutubeDLRequest("ytsearch" + count + ":" + query);
            request.addOption("--dump-json");
            request.addOption("--flat-playlist");
            request.addOption("--no-playlist");
            addCommonOptions(request, UA_DESKTOP);
            
            Log.d(TAG, "[SEARCH] Searching for: " + query);

            YoutubeDLResponse response = YoutubeDL.getInstance().execute(request, null);
            String out = response.getOut();
            
            String[] lines = out.split("\n");
            JSArray results = new JSArray();
            for (String line : lines) {
                if (line.trim().isEmpty()) continue;
                try {
                    JSONObject json = new JSONObject(line);
                    JSObject song = new JSObject();
                    song.put("id", json.optString("id", ""));
                    song.put("title", json.optString("title", "Unknown Title"));
                    song.put("artistName", json.optString("uploader", "Unknown Artist"));
                    song.put("thumbnailUrl", "https://i.ytimg.com/vi/" + json.optString("id") + "/hqdefault.jpg");
                    song.put("duration", json.optDouble("duration", 0));
                    song.put("sourceType", "youtube");
                    results.put(song);
                } catch (Exception jsonEx) {
                    Log.e(TAG, "Error parsing result line", jsonEx);
                }
            }

            JSObject ret = new JSObject();
            ret.put("results", results);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Search failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void updateYoutubeDL(PluginCall call) {
        call.reject("Manual update is temporarily disabled.");
    }
}
