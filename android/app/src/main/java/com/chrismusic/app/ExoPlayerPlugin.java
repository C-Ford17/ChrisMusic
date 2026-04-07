package com.chrismusic.app;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.OptIn;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * ExoPlayerPlugin — Capacitor bridge to Media3 ExoPlayer.
 *
 * JS API:
 *   load({ url, title, artist, artwork? })
 *   play()
 *   pause()
 *   seek({ seconds })
 *   stop()
 *   setVolume({ volume })   // 0.0–1.0
 *
 * Events emitted to JS:
 *   "onStateChange" → { state: "loading" | "playing" | "paused" | "ended" | "error", error?: string }
 *   "onProgress"    → { current: number, duration: number }
 */
@CapacitorPlugin(name = "ExoPlayer")
public class ExoPlayerPlugin extends Plugin {

    private static final String TAG = "ExoPlayerPlugin";

    // Progress polling interval in ms
    private static final long PROGRESS_INTERVAL_MS = 500;

    private ExoPlayer exoPlayer;
    private final Handler progressHandler = new Handler(Looper.getMainLooper());
    private Runnable progressRunnable;
    private boolean serviceStarted = false;

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    @Override
    public void load() {
        // Plugin loaded — ExoPlayer is created lazily on first load() call
        Log.d(TAG, "[ExoPlayerPlugin] Plugin loaded");
    }

    @Override
    protected void handleOnDestroy() {
        stopProgressPolling();
        releasePlayer();
    }

    // ─── Plugin Methods (JS → Native) ────────────────────────────────────────

    @PluginMethod
    public void load(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title", "ChrisMusic");
        String artist = call.getString("artist", "");
        String artwork = call.getString("artwork", "");

        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                ensurePlayerCreated();

                // Build MediaItem with metadata for MediaSession / notification
                MediaMetadata mediaMetadata = new MediaMetadata.Builder()
                        .setTitle(title)
                        .setArtist(artist)
                        .build();

                MediaItem mediaItem = new MediaItem.Builder()
                        .setUri(url)
                        .setMediaMetadata(mediaMetadata)
                        .build();

                exoPlayer.setMediaItem(mediaItem);
                exoPlayer.prepare();
                exoPlayer.setPlayWhenReady(true);

                notifyStateChange("loading");
                startMusicService(title, artist);
                startProgressPolling();

                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "load() error", e);
                call.reject("Failed to load: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        new Handler(Looper.getMainLooper()).post(() -> {
            if (exoPlayer != null) {
                exoPlayer.play();
                notifyStateChange("playing");
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        new Handler(Looper.getMainLooper()).post(() -> {
            if (exoPlayer != null) {
                exoPlayer.pause();
                notifyStateChange("paused");
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void seek(PluginCall call) {
        Double seconds = call.getDouble("seconds");
        if (seconds == null) {
            call.reject("seconds is required");
            return;
        }
        new Handler(Looper.getMainLooper()).post(() -> {
            if (exoPlayer != null) {
                exoPlayer.seekTo((long) (seconds * 1000));
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        new Handler(Looper.getMainLooper()).post(() -> {
            stopProgressPolling();
            if (exoPlayer != null) {
                exoPlayer.stop();
                exoPlayer.clearMediaItems();
            }
            stopMusicService();
            notifyStateChange("paused");
            call.resolve();
        });
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        Double volume = call.getDouble("volume");
        if (volume == null) {
            call.reject("volume is required");
            return;
        }
        new Handler(Looper.getMainLooper()).post(() -> {
            if (exoPlayer != null) {
                exoPlayer.setVolume(volume.floatValue());
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void getCurrentState(PluginCall call) {
        new Handler(Looper.getMainLooper()).post(() -> {
            JSObject ret = new JSObject();
            if (exoPlayer != null) {
                ret.put("isPlaying", exoPlayer.isPlaying());
                ret.put("current", exoPlayer.getCurrentPosition() / 1000.0);
                ret.put("duration", exoPlayer.getDuration() == androidx.media3.common.C.TIME_UNSET
                        ? 0 : exoPlayer.getDuration() / 1000.0);
            } else {
                ret.put("isPlaying", false);
                ret.put("current", 0);
                ret.put("duration", 0);
            }
            call.resolve(ret);
        });
    }

    // ─── Internal helpers ────────────────────────────────────────────────────

    @OptIn(markerClass = UnstableApi.class)
    private void ensurePlayerCreated() {
        if (exoPlayer != null) {
            exoPlayer.stop();
            exoPlayer.clearMediaItems();
            return;
        }

        Context context = getContext();

        exoPlayer = new ExoPlayer.Builder(context).build();

        exoPlayer.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int playbackState) {
                switch (playbackState) {
                    case Player.STATE_BUFFERING:
                        notifyStateChange("loading");
                        break;
                    case Player.STATE_READY:
                        notifyStateChange(exoPlayer.isPlaying() ? "playing" : "paused");
                        break;
                    case Player.STATE_ENDED:
                        notifyStateChange("ended");
                        stopProgressPolling();
                        break;
                    case Player.STATE_IDLE:
                        // no-op
                        break;
                }
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                notifyStateChange(isPlaying ? "playing" : "paused");
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                Log.e(TAG, "ExoPlayer error: " + error.getMessage(), error);
                JSObject data = new JSObject();
                data.put("state", "error");
                data.put("error", error.getMessage());
                notifyListeners("onStateChange", data);
                stopProgressPolling();
            }
        });
    }

    private void notifyStateChange(String state) {
        JSObject data = new JSObject();
        data.put("state", state);
        notifyListeners("onStateChange", data);
    }

    // ─── Progress polling ────────────────────────────────────────────────────

    private void startProgressPolling() {
        stopProgressPolling();
        progressRunnable = new Runnable() {
            @Override
            public void run() {
                if (exoPlayer != null && exoPlayer.isPlaying()) {
                    long currentMs = exoPlayer.getCurrentPosition();
                    long durationMs = exoPlayer.getDuration();

                    JSObject data = new JSObject();
                    data.put("current", currentMs / 1000.0);
                    data.put("duration", durationMs == androidx.media3.common.C.TIME_UNSET
                            ? 0 : durationMs / 1000.0);
                    notifyListeners("onProgress", data);
                }
                progressHandler.postDelayed(this, PROGRESS_INTERVAL_MS);
            }
        };
        progressHandler.postDelayed(progressRunnable, PROGRESS_INTERVAL_MS);
    }

    private void stopProgressPolling() {
        if (progressRunnable != null) {
            progressHandler.removeCallbacks(progressRunnable);
            progressRunnable = null;
        }
    }

    // ─── ForegroundService ───────────────────────────────────────────────────

    private void startMusicService(String title, String artist) {
        try {
            Context context = getContext();
            Intent intent = new Intent(context, MusicPlayerService.class);
            intent.putExtra("title", title);
            intent.putExtra("artist", artist);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
            serviceStarted = true;
        } catch (Exception e) {
            Log.w(TAG, "Failed to start MusicPlayerService: " + e.getMessage());
        }
    }

    private void stopMusicService() {
        if (!serviceStarted) return;
        try {
            Context context = getContext();
            context.stopService(new Intent(context, MusicPlayerService.class));
            serviceStarted = false;
        } catch (Exception e) {
            Log.w(TAG, "Failed to stop MusicPlayerService: " + e.getMessage());
        }
    }

    // ─── Cleanup ─────────────────────────────────────────────────────────────

    private void releasePlayer() {
        if (exoPlayer != null) {
            exoPlayer.release();
            exoPlayer = null;
        }
        stopMusicService();
    }
}
