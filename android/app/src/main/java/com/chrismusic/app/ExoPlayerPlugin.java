package com.chrismusic.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.OptIn;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.PermissionState;

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

    private ExoPlayer exoPlayer;
    private static MediaSession mediaSession; // Static so MusicPlayerService can access it
    private final Handler progressHandler = new Handler(Looper.getMainLooper());
    private Runnable progressRunnable;
    private boolean serviceStarted = false;

    public static MediaSession getMediaSession() {
        return mediaSession;
    }

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
                MediaMetadata.Builder metaBuilder = new MediaMetadata.Builder()
                        .setTitle(title)
                        .setArtist(artist);
                
                if (artwork != null && !artwork.isEmpty()) {
                    metaBuilder.setArtworkUri(android.net.Uri.parse(artwork));
                }
                
                MediaMetadata mediaMetadata = metaBuilder.build();

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
            return;
        }

        Context context = getContext();

        exoPlayer = new ExoPlayer.Builder(context).build();

        // Wrap ExoPlayer in a ForwardingPlayer
        // Since we manage the queue in JS, ExoPlayer only has 1 item.
        // Media3 normally hides Next/Prev buttons if queue is 1.
        // ForwardingPlayer tricks it into always showing them and intercepts clicks.
        ForwardingPlayer forwardingPlayer = new ForwardingPlayer(exoPlayer) {
            @Override
            public Player.Commands getAvailableCommands() {
                return super.getAvailableCommands().buildUpon()
                        .add(Player.COMMAND_SEEK_TO_NEXT)
                        .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                        .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                        .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                        .build();
            }

            @Override
            public boolean isCommandAvailable(int command) {
                if (command == Player.COMMAND_SEEK_TO_NEXT || command == Player.COMMAND_SEEK_TO_PREVIOUS ||
                    command == Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM || command == Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM) {
                    return true;
                }
                return super.isCommandAvailable(command);
            }

            @Override
            public boolean hasNextMediaItem() {
                return true;
            }

            @Override
            public boolean hasPreviousMediaItem() {
                return true;
            }

            @Override
            public void seekToNext() {
                new Handler(Looper.getMainLooper()).post(() -> notifyListeners("onNativeNext", new JSObject()));
            }

            @Override
            public void seekToNextMediaItem() {
                new Handler(Looper.getMainLooper()).post(() -> notifyListeners("onNativeNext", new JSObject()));
            }

            @Override
            public void seekToPrevious() {
                new Handler(Looper.getMainLooper()).post(() -> notifyListeners("onNativePrevious", new JSObject()));
            }

            @Override
            public void seekToPreviousMediaItem() {
                new Handler(Looper.getMainLooper()).post(() -> notifyListeners("onNativePrevious", new JSObject()));
            }

        };

        // Pass forwardingPlayer to MediaSession instead of exoPlayer
        mediaSession = new MediaSession.Builder(context, forwardingPlayer).build();

        exoPlayer.addListener(new Player.Listener() {
            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                notifyStateChange(isPlaying ? "playing" : "paused");
            }

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
                // Media3 MediaSessionService automatically handles foregrounding when playback starts.
                // Using startForegroundService here forces us to show a notification immediately,
                // which crashes in Android 14 if Media3 hasn't prepared the media yet.
                // Therefore, we use startService.
                context.startService(intent);
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
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        if (exoPlayer != null) {
            exoPlayer.release();
            exoPlayer = null;
        }
        stopMusicService();
    }
}
