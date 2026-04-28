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

    private String getBestClient() {
        return getContext().getSharedPreferences("yt_native", Context.MODE_PRIVATE)
                .getString("best_client", "web");
    }

    private void saveBestClient(String client) {
        getContext().getSharedPreferences("yt_native", Context.MODE_PRIVATE)
                .edit().putString("best_client", client).apply();
    }

    @PluginMethod
    public void getStreamUrl(PluginCall call) {
        String videoId = call.getString("videoId");
        if (videoId == null) {
            call.reject("videoId is required");
            return;
        }

        new Thread(() -> {
            try {
                ensureEngineReady();
                
                String best = getBestClient();
                String[] clients = {best, "ios", "web", "android", "tv_embedded"};
                
                String url = null;
                for (String client : clients) {
                    if (url != null && !url.isEmpty()) break;
                    Log.d(TAG, "[Stream] Trying client: " + client);
                    url = tryExtractUrl(videoId, client);
                    if (url != null && !url.isEmpty()) {
                        saveBestClient(client);
                    }
                }

                if (url == null || url.isEmpty()) {
                    call.reject("Extraction returned empty URL after all retries");
                    return;
                }
                JSObject ret = new JSObject();
                ret.put("url", url);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Extraction critical error: " + e.getMessage());
                call.reject("Extraction failed: " + e.getMessage());
            }
        }).start();
    }

    /**
     * Tries to extract a direct audio stream URL via yt-dlp -g.
     * Handles multi-line output (DASH returns audio+video URLs on separate lines).
     * Returns null if extraction fails or returns no usable URL.
     */
    private String tryExtractUrl(String videoId, String playerClient) {
        try {
            YoutubeDLRequest request = new YoutubeDLRequest("https://www.youtube.com/watch?v=" + videoId);
            // bestaudio/best — no ext filter, ExoPlayer (Media3) handles m4a, webm, opus natively
            request.addOption("-f", "bestaudio/best");
            request.addOption("-g");
            request.addOption("--no-playlist");
            request.addOption("--no-check-certificate");
            // Do NOT use --no-warnings: we want stderr in logcat for debugging
            request.addOption("--extractor-args", "youtube:player-client=" + playerClient);
            addCommonOptions(request);

            Log.d(TAG, "[Stream] Requesting URL for: " + videoId + " (client=" + playerClient + ")");
            YoutubeDLResponse response = YoutubeDL.getInstance().execute(request, null);
            String out = response.getOut();
            String err = response.getErr();

            // Always log stderr so we can debug extraction failures in logcat
            if (err != null && !err.trim().isEmpty()) {
                Log.w(TAG, "[Stream] yt-dlp stderr (" + playerClient + "): " + err.trim());
            }

            if (out == null || out.trim().isEmpty()) {
                Log.w(TAG, "[Stream] Empty stdout for client=" + playerClient);
                return null;
            }

            // yt-dlp -g may return multiple lines for DASH streams (audio+video URLs).
            // Take only the first line — typically the audio stream.
            String[] lines = out.trim().split("\n");
            String audioUrl = lines[0].trim();
            Log.d(TAG, "[Stream] Got URL (" + lines.length + " lines, client=" + playerClient + "): "
                    + audioUrl.substring(0, Math.min(80, audioUrl.length())) + "...");
            return audioUrl;
        } catch (Exception e) {
            Log.w(TAG, "[Stream] tryExtractUrl exception (client=" + playerClient + "): " + e.getMessage());
            return null;
        }
    }

    @PluginMethod
    public void downloadToAdts(PluginCall call) {
        String videoId = call.getString("videoId");
        if (videoId == null) {
            call.reject("videoId is required");
            return;
        }

        new Thread(() -> {
            try {
                ensureEngineReady();

                File tempFile = new File(getContext().getCacheDir(), videoId + ".aac");
                if (tempFile.exists()) tempFile.delete();

                String best = getBestClient();
                String[] clients = {best, "ios", "web", "android", "tv_embedded"};
                
                boolean downloaded = false;
                for (String client : clients) {
                    if (downloaded) break;
                    Log.d(TAG, "[ADTS] Trying download client: " + client);
                    downloaded = tryDownload(videoId, client, tempFile);
                    if (downloaded) {
                        saveBestClient(client);
                    }
                }

                if (!downloaded || !tempFile.exists() || tempFile.length() == 0) {
                    File fallback = new File(getContext().getCacheDir(), videoId + ".aac.aac");
                    if (fallback.exists() && fallback.length() > 0) {
                        tempFile = fallback;
                    } else {
                        call.reject("Extraction failed: output file missing after all retries");
                        return;
                    }
                }

                byte[] bytes = readFile(tempFile);
                String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);

                JSObject ret = new JSObject();
                ret.put("base64", base64);
                ret.put("format", "adts");
                call.resolve(ret);

                tempFile.delete();
            } catch (Exception e) {
                Log.e(TAG, "Native extraction error", e);
                call.reject("Extraction failed: " + e.getMessage());
            }
        }).start();
    }

    private boolean tryDownload(String videoId, String playerClient, File outputFile) {
        try {
            YoutubeDLRequest request = new YoutubeDLRequest("https://www.youtube.com/watch?v=" + videoId);
            request.addOption("-f", "bestaudio/best");
            request.addOption("-o", outputFile.getAbsolutePath());
            request.addOption("--no-playlist");
            request.addOption("--no-check-certificate");
            // No --no-warnings: log stderr for debugging
            request.addOption("--extractor-args", "youtube:player-client=" + playerClient);
            addCommonOptions(request);

            Log.i(TAG, "[ADTS] Downloading " + videoId + " (client=" + playerClient + ")");
            YoutubeDLResponse response = YoutubeDL.getInstance().execute(request, null);
            String err = response.getErr();
            if (err != null && !err.trim().isEmpty()) {
                Log.w(TAG, "[ADTS] yt-dlp stderr (" + playerClient + "): " + err.trim());
            }
            boolean success = outputFile.exists() && outputFile.length() > 0;
            Log.i(TAG, "[ADTS] Download " + (success ? "success" : "failed - empty file") + " (client=" + playerClient + ")");
            return success;
        } catch (Exception e) {
            Log.w(TAG, "[ADTS] tryDownload exception (client=" + playerClient + "): " + e.getMessage());
            return false;
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
