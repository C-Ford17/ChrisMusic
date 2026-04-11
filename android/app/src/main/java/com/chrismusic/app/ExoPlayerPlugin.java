package com.chrismusic.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.annotation.OptIn;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ScheduledFuture;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

@CapacitorPlugin(
    name = "ExoPlayer",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = {Manifest.permission.POST_NOTIFICATIONS}
        )
    }
)
public class ExoPlayerPlugin extends Plugin {

    private static final String TAG = "ExoPlayerPlugin";

    // Progress polling interval in ms
    private static final long PROGRESS_INTERVAL_MS = 500;
    private static ExoPlayerPlugin instance;

    private final ScheduledExecutorService progressExecutor = Executors.newSingleThreadScheduledExecutor();
    private ScheduledFuture<?> progressFuture;
    private boolean serviceStarted = false;
    private String lastNotifiedState = "none";
    private String lastMediaId = null;
    private Player.Listener playerListener;
    private boolean isAppInBackground = false;
    private int backgroundPollCount = 0;

    // ─── Static Bridge (Service → Plugin) ───────────────────────────────────

    public static void onNativeNext() {
        if (instance != null) {
            instance.notifyListeners("onNativeNext", null);
        }
    }

    public static void onNativePrevious() {
        if (instance != null) {
            instance.notifyListeners("onNativePrevious", null);
        }
    }

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    @Override
    public void load() {
        Log.d(TAG, "[ExoPlayerPlugin] Plugin loaded");
        instance = this;
        // Start service early on app launch
        startMusicService();
    }

    @Override
    protected void handleOnDestroy() {
        Log.d(TAG, "[ExoPlayerPlugin] Plugin destroying, cleaning up resources...");
        stopProgressPolling();
        
        // Shut down the executor to prevent thread leaks
        try {
            progressExecutor.shutdownNow();
        } catch (Exception e) {
            Log.w(TAG, "Error shutting down progress executor", e);
        }

        removePlayerListener();
        instance = null;
        // DO NOT releasePlayer here. We want it to stay alive in the Service.
    }

    @Override
    protected void handleOnPause() {
        Log.d(TAG, "[ExoPlayerPlugin] App moving to background. Skipping progress events.");
        isAppInBackground = true;
        // Optional: stopProgressPolling(); // We can keep polling but skip notify to avoid bridge flooding
    }

    @Override
    protected void handleOnResume() {
        Log.d(TAG, "[ExoPlayerPlugin] App returned to foreground. Resuming progress updates.");
        isAppInBackground = false;
        
        // Force an immediate progress update to refresh UI
        new Handler(Looper.getMainLooper()).post(() -> {
            Player player = MusicPlayerService.getExoPlayer();
            if (player != null && player.isPlaying()) {
                sendProgressToJS(player);
            }
        });
    }

    // ─── Plugin Methods (JS → Native) ────────────────────────────────────────

    @PluginMethod
    public void getPlaybackState(PluginCall call) {
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                Player player = MusicPlayerService.getExoPlayer();
                JSObject result = new JSObject();
                if (player != null) {
                    result.put("isPlaying", player.isPlaying());
                    result.put("currentPosition", player.getCurrentPosition() / 1000.0);
                    result.put("duration", player.getDuration() / 1000.0);
                    
                    MediaItem item = player.getCurrentMediaItem();
                    if (item != null) {
                        result.put("mediaId", item.mediaId);
                        if (item.localConfiguration != null) {
                            result.put("url", item.localConfiguration.uri.toString());
                        }
                        if (item.mediaMetadata.title != null) {
                            result.put("title", item.mediaMetadata.title.toString());
                        }
                    }

                    // Map internal state to our string states
                    int state = player.getPlaybackState();
                    String stateStr = "paused";
                    if (state == Player.STATE_BUFFERING) stateStr = "loading";
                    else if (player.isPlaying()) stateStr = "playing";
                    else if (state == Player.STATE_ENDED) stateStr = "ended";
                    
                    result.put("state", stateStr);
                } else {
                    result.put("state", "none");
                }
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Failed to get playback state", e);
            }
        });
    }

    @PluginMethod
    public void load(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title", "ChrisMusic");
        String artist = call.getString("artist", "");
        String artwork = call.getString("artwork", "");
        String id = call.getString("id", "");

        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                Player player = getOrStartPlayer();
                if (player == null) {
                    call.reject("Failed to initialize ExoPlayer");
                    return;
                }

                // Immediate cleanup to prevent audio overlap and clear old session data
                player.stop();
                player.clearMediaItems();

                // Build MediaItem with metadata for MediaSession / notification
                MediaMetadata.Builder metaBuilder = new MediaMetadata.Builder()
                        .setTitle(title)
                        .setArtist(artist);
                
                if (artwork != null && !artwork.isEmpty()) {
                    metaBuilder.setArtworkUri(android.net.Uri.parse(artwork));
                }
                
                MediaMetadata mediaMetadata = metaBuilder.build();

                MediaItem mediaItem = new MediaItem.Builder()
                        .setUri(url)
                        .setMediaId(id)
                        .setMediaMetadata(mediaMetadata)
                        .build();

                player.setMediaItem(mediaItem);
                player.prepare();
                player.setPlayWhenReady(true);

                notifyStateChange("loading");

                startProgressPolling();

                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "load() error", e);
                call.reject("Failed to load: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void addNextItem(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        String artwork = call.getString("artwork", "");
        String id = call.getString("id", "");

        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                Player player = getOrStartPlayer();
                if (player == null) return;

                // Build MediaItem with metadata
                androidx.media3.common.MediaMetadata metadata = new androidx.media3.common.MediaMetadata.Builder()
                        .setTitle(title)
                        .setArtist(artist)
                        .setArtworkUri(artwork != null && !artwork.isEmpty() ? android.net.Uri.parse(artwork) : null)
                        .build();

                androidx.media3.common.MediaItem mediaItem = new androidx.media3.common.MediaItem.Builder()
                        .setMediaId(id) // Track ID for JS syncing
                        .setUri(url)
                        .setMediaMetadata(metadata)
                        .build();

                // Add to the end of currently playing items
                player.addMediaItem(mediaItem);
                Log.d(TAG, "[ExoPlayerPlugin] Native Next Item added: " + title);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }

    private MusicPlayerService.PlayerEventListener centralListener;

    @PluginMethod
    public void play(PluginCall call) {
        new Handler(Looper.getMainLooper()).post(() -> {
            Player player = getOrStartPlayer();
            if (player != null) {
                player.play();
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        new Handler(Looper.getMainLooper()).post(() -> {
            Player player = getOrStartPlayer();
            if (player != null) {
                player.pause();
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
            Player player = getOrStartPlayer();
            if (player != null) {
                player.seekTo((long) (seconds * 1000));
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        new Handler(Looper.getMainLooper()).post(() -> {
            stopProgressPolling();
            Player player = getOrStartPlayer();
            if (player != null) {
                player.stop();
                player.clearMediaItems();
            }
            // We NO LONGER call stopMusicService() here. 
            // We want the service to stay alive for fast song switching and notification persistence.
            notifyStateChange("paused");
            call.resolve();
        });
    }

    @PluginMethod
    public void terminate(PluginCall call) {
        new Handler(Looper.getMainLooper()).post(() -> {
            stopProgressPolling();
            Player player = getOrStartPlayer();
            if (player != null) {
                player.stop();
                player.clearMediaItems();
            }
            stopMusicService();
            notifyStateChange("paused");
            call.resolve();
        });
    }

    @PluginMethod
    public void setRepeatMode(PluginCall call) {
        String mode = call.getString("mode", "off"); // off, one, all
        new Handler(Looper.getMainLooper()).post(() -> {
            Player player = getOrStartPlayer();
            if (player != null) {
                int exoMode = Player.REPEAT_MODE_OFF;
                if ("one".equals(mode)) exoMode = Player.REPEAT_MODE_ONE;
                else if ("all".equals(mode)) exoMode = Player.REPEAT_MODE_ALL;
                player.setRepeatMode(exoMode);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void setShuffleMode(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        new Handler(Looper.getMainLooper()).post(() -> {
            Player player = getOrStartPlayer();
            if (player != null) {
                player.setShuffleModeEnabled(enabled);
            }
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
            Player player = getOrStartPlayer();
            if (player != null) {
                player.setVolume(volume.floatValue());
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void getCurrentState(PluginCall call) {
        new Handler(Looper.getMainLooper()).post(() -> {
            JSObject ret = new JSObject();
            Player player = getOrStartPlayer();
            if (player != null) {
                ret.put("isPlaying", player.isPlaying());
                ret.put("current", player.getCurrentPosition() / 1000.0);
                ret.put("duration", player.getDuration() == androidx.media3.common.C.TIME_UNSET
                        ? 0 : player.getDuration() / 1000.0);
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
    private Player getOrStartPlayer() {
        Player player = MusicPlayerService.getOrInitializePlayer(getContext());
        startMusicService();
        
        // Ensure we are subscribed to the central service events
        if (centralListener == null) {
            setupCentralListener();
        }
        
        return player;
    }

    private void setupCentralListener() {
        centralListener = new MusicPlayerService.PlayerEventListener() {
            @Override
            public void onMediaItemTransition(@Nullable MediaItem mediaItem, int reason) {
                if (mediaItem != null && mediaItem.mediaId != null) {
                    if (mediaItem.mediaId.equals(lastMediaId)) return;
                    lastMediaId = mediaItem.mediaId;
                    
                    Log.i(TAG, "BRIDGE_EVENT: onMediaItemTransition to: " + mediaItem.mediaId);
                    JSObject data = new JSObject();
                    data.put("id", mediaItem.mediaId);
                    notifyListeners("onNativeTrackChange", data);
                }
            }

            @Override
            public void onPlaybackStateChanged(int playbackState) {
                Log.i(TAG, "BRIDGE_EVENT: onPlaybackStateChanged: " + playbackState);
                ExoPlayer base = MusicPlayerService.getExoPlayer();
                if (base == null) return;

                switch (playbackState) {
                    case Player.STATE_BUFFERING:
                        notifyStateChange("loading");
                        break;
                    case Player.STATE_READY:
                        // Only notify 'paused' if we reached READY and the user INTENDS to stay paused.
                        // (e.g. initial session restoration).
                        // If playWhenReady is true, we will be notified by onIsPlayingChanged(true) soon.
                        if (!base.getPlayWhenReady() && !base.isPlaying()) {
                            Log.i(TAG, "BRIDGE_EVENT: STATE_READY (intentional pause). Notifying JS.");
                            notifyStateChange("paused");
                        }
                        break;
                    case Player.STATE_ENDED:
                        Log.e(TAG, "BRIDGE_EVENT: STATE_ENDED. Sending 'ended' to JS.");
                        notifyStateChange("ended");
                        break;
                    case Player.STATE_IDLE:
                        // no-op
                        break;
                }
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                Log.i(TAG, "BRIDGE_EVENT: onIsPlayingChanged: " + isPlaying);
                
                ExoPlayer base = MusicPlayerService.getExoPlayer();
                if (base == null) return;

                int state = base.getPlaybackState();
                
                if (state == Player.STATE_ENDED) {
                    notifyStateChange("ended");
                    return;
                }

                if (!isPlaying) {
                    // Initial load/buffering protection.
                    if (base.getPlayWhenReady() && (state == Player.STATE_BUFFERING || state == Player.STATE_READY)) {
                        Log.d(TAG, "BRIDGE_EVENT: Intended to play. Ignoring technical 'non-playing' state.");
                        return;
                    }

                    // Reset/Stop handling
                    if (state == Player.STATE_IDLE) {
                        notifyStateChange("paused");
                        return;
                    }
                }
                
                notifyStateChange(isPlaying ? "playing" : "paused");
            }

            @Override
            public void onPlayerError(String error, int errorCode) {
                Log.e(TAG, "BRIDGE_EVENT: Player error: " + error + " (code: " + errorCode + ")");
                JSObject data = new JSObject();
                data.put("state", "error");
                data.put("error", error);
                data.put("errorCode", errorCode);
                notifyListeners("onStateChange", data);
                stopProgressPolling();
            }
        };
        MusicPlayerService.addEventListener(centralListener);
    }

    private void removePlayerListener() {
        // 1. Remove the direct player listener if any
        Player player = MusicPlayerService.getForwardingPlayer();
        if (player != null && playerListener != null) {
            player.removeListener(playerListener);
            playerListener = null;
        }
        // 2. Remove the central listener from the service
        if (centralListener != null) {
            MusicPlayerService.removeEventListener(centralListener);
            centralListener = null;
        }
    }

    private void notifyStateChange(String state) {
        if (state.equals(lastNotifiedState)) return;
        lastNotifiedState = state;
        
        Log.i(TAG, "[ExoPlayerPlugin] notifyStateChange: " + state);

        // Optimization: Start/Stop polling based on state
        if ("playing".equals(state)) {
            startProgressPolling();
        } else if ("paused".equals(state) || "ended".equals(state) || "error".equals(state)) {
            stopProgressPolling();
        }

        JSObject data = new JSObject();
        data.put("state", state);
        notifyListeners("onStateChange", data);
    }

    // ─── Progress polling ────────────────────────────────────────────────────

    private void startProgressPolling() {
        stopProgressPolling();
        Log.d(TAG, "[ExoPlayerPlugin] Starting background progress polling...");
        
        backgroundPollCount = 0;
        progressFuture = progressExecutor.scheduleAtFixedRate(() -> {
            new Handler(Looper.getMainLooper()).post(() -> {
                try {
                    ExoPlayer player = MusicPlayerService.getExoPlayer();
                    if (player != null && player.isPlaying()) {
                        if (isAppInBackground) {
                            // Reduced frequency in background (every 5 seconds) to avoid hangs 
                            // but keep WebView/bridge alive for state transitions
                            backgroundPollCount++;
                            if (backgroundPollCount >= 10) {
                                backgroundPollCount = 0;
                                sendProgressToJS(player);
                            }
                        } else {
                            sendProgressToJS(player);
                        }
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error in progress polling task: " + e.getMessage());
                }
            });
        }, 0, PROGRESS_INTERVAL_MS, TimeUnit.MILLISECONDS);
    }

    private void stopProgressPolling() {
        if (progressFuture != null) {
            progressFuture.cancel(false);
            progressFuture = null;
        }
    }

    private void sendProgressToJS(Player player) {
        long currentMs = player.getCurrentPosition();
        long durationMs = player.getDuration();

        JSObject data = new JSObject();
        data.put("current", currentMs / 1000.0);
        data.put("duration", durationMs == androidx.media3.common.C.TIME_UNSET
                ? 0 : durationMs / 1000.0);
        
        notifyListeners("onProgress", data);
    }

    // ─── ForegroundService ───────────────────────────────────────────────────

    private void startMusicService() {
        if (serviceStarted) return;
        try {
            Context context = getContext();
            Intent intent = new Intent(context, MusicPlayerService.class);
            context.startService(intent);
            serviceStarted = true;
        } catch (Exception e) {
            Log.w(TAG, "Failed to start MusicPlayerService: " + e.getMessage());
        }
    }

    private void stopMusicService() {
        serviceStarted = false;
        try {
            Context context = getContext();
            context.stopService(new Intent(context, MusicPlayerService.class));
        } catch (Exception e) {
            Log.w(TAG, "Failed to stop MusicPlayerService: " + e.getMessage());
        }
    }
}
