package com.chrismusic.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

/**
 * MusicPlayerService — Media3 MediaSessionService.
 * This service is the OWNER of the ExoPlayer and MediaSession.
 * Supports "tricked" Next/Prev buttons via ForwardingPlayer.
 */
public class MusicPlayerService extends MediaSessionService {

    private static final String TAG = "MusicPlayerService";
    private static final String CHANNEL_ID = "chrismusic_playback_v3";

    private static ExoPlayer baseExoPlayer;
    private static Player forwardingPlayer;
    private static MediaSession mediaSession;

    /**
     * Listener interface for bridging events to the ExoPlayerPlugin.
     */
    public interface PlayerEventListener {
        void onPlaybackStateChanged(int playbackState);
        void onIsPlayingChanged(boolean isPlaying);
        void onMediaItemTransition(@Nullable androidx.media3.common.MediaItem mediaItem, int reason);
        void onPlayerError(String error, int errorCode);
    }

    private static final java.util.List<PlayerEventListener> eventListeners = new java.util.ArrayList<>();

    public static synchronized void addEventListener(PlayerEventListener listener) {
        if (!eventListeners.contains(listener)) {
            eventListeners.add(listener);
        }
    }

    public static synchronized void removeEventListener(PlayerEventListener listener) {
        eventListeners.remove(listener);
    }

    /**
     * Synchronized accessor that ensures the ExoPlayer and MediaSession exist.
     */
    public static synchronized Player getOrInitializePlayer(Context context) {
        if (baseExoPlayer == null) {
            Log.d(TAG, "Static initialization of ExoPlayer with ForwardingPlayer...");
            
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build();

            baseExoPlayer = new ExoPlayer.Builder(context.getApplicationContext())
                    .setAudioAttributes(audioAttributes, true)
                    .build();

            // Wake mode keeps CPU and Wi-Fi alive
            baseExoPlayer.setWakeMode(C.WAKE_MODE_NETWORK);

            // Add the persistent central listener
            baseExoPlayer.addListener(new Player.Listener() {
                @Override
                public void onPlaybackStateChanged(int state) {
                    Log.d(TAG, "CENTRAL_LISTENER: onPlaybackStateChanged: " + state);
                    // Defensive 'ended' check: if IDLE but near duration, consider it ended
                    if (state == Player.STATE_IDLE) {
                        long pos = baseExoPlayer.getCurrentPosition();
                        long dur = baseExoPlayer.getDuration();
                        if (dur > 0 && pos >= (dur - 1500)) {
                             Log.w(TAG, "CENTRAL_LISTENER: IDLE near END detected, forcing ENDED signal.");
                             notifyListenersState(Player.STATE_ENDED);
                             return;
                        }
                    }
                    notifyListenersState(state);
                }

                @Override
                public void onIsPlayingChanged(boolean isPlaying) {
                    Log.d(TAG, "CENTRAL_LISTENER: onIsPlayingChanged: " + isPlaying);
                    notifyListenersPlaying(isPlaying);
                }

                @Override
                public void onMediaItemTransition(@Nullable androidx.media3.common.MediaItem mediaItem, int reason) {
                    Log.d(TAG, "CENTRAL_LISTENER: onMediaItemTransition: " + (mediaItem != null ? mediaItem.mediaId : "null"));
                    notifyListenersTransition(mediaItem, reason);
                }

                @Override
                public void onPlayerError(androidx.media3.common.PlaybackException error) {
                    Log.e(TAG, "CENTRAL_LISTENER: onPlayerError: " + error.getMessage() + " code: " + error.errorCode);
                    notifyListenersError(error.getMessage(), error.errorCode);
                }
            });

            // Wrap with ForwardingPlayer to force Next/Prev buttons in notification
            forwardingPlayer = new ForwardingPlayer(baseExoPlayer) {
                @Override
                public Commands getAvailableCommands() {
                    return super.getAvailableCommands().buildUpon()
                            .add(COMMAND_SEEK_TO_NEXT)
                            .add(COMMAND_SEEK_TO_PREVIOUS)
                            .build();
                }

                @Override
                public boolean isCommandAvailable(int command) {
                    return command == COMMAND_SEEK_TO_NEXT || 
                           command == COMMAND_SEEK_TO_PREVIOUS || 
                           super.isCommandAvailable(command);
                }

                @Override
                public void seekToNext() {
                    Log.d(TAG, "seekToNext triggered from notification. Attempting native skip...");
                    if (baseExoPlayer.hasNextMediaItem()) {
                        super.seekToNext();
                    } else {
                        // Fallback to JS if no native next item
                        ExoPlayerPlugin.onNativeNext();
                    }
                }

                @Override
                public void seekToPrevious() {
                    Log.d(TAG, "seekToPrevious triggered from notification. Attempting native skip...");
                    if (baseExoPlayer.hasPreviousMediaItem()) {
                        super.seekToPrevious();
                    } else {
                        // Fallback to JS if no native previous item
                        ExoPlayerPlugin.onNativePrevious();
                    }
                }
            };

            // MediaSession hosts the WRAPPED player
            mediaSession = new MediaSession.Builder(context.getApplicationContext(), forwardingPlayer).build();
        }
        return forwardingPlayer;
    }

    private static synchronized void notifyListenersState(int state) {
        for (PlayerEventListener l : new java.util.ArrayList<>(eventListeners)) {
            l.onPlaybackStateChanged(state);
        }
    }

    private static synchronized void notifyListenersPlaying(boolean isPlaying) {
        for (PlayerEventListener l : new java.util.ArrayList<>(eventListeners)) {
            l.onIsPlayingChanged(isPlaying);
        }
    }

    private static synchronized void notifyListenersError(String error, int errorCode) {
        for (PlayerEventListener l : new java.util.ArrayList<>(eventListeners)) {
            l.onPlayerError(error, errorCode);
        }
    }

    private static synchronized void notifyListenersTransition(androidx.media3.common.MediaItem mediaItem, int reason) {
        for (PlayerEventListener l : new java.util.ArrayList<>(eventListeners)) {
            l.onMediaItemTransition(mediaItem, reason);
        }
    }

    public static ExoPlayer getExoPlayer() {
        return baseExoPlayer;
    }
    
    public static Player getForwardingPlayer() {
        return forwardingPlayer;
    }

    public static MediaSession getMediaSession() {
        return mediaSession;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "MusicPlayerService.onCreate() called");
        
        createNotificationChannel();
        
        // Ensure player is ready
        getOrInitializePlayer(this);
        
        if (mediaSession != null) {
            addSession(mediaSession);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "ChrisMusic Playback",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Control de reproducción de música");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return mediaSession;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        Log.d(TAG, "MusicPlayerService.onDestroy() called");
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        if (baseExoPlayer != null) {
            baseExoPlayer.release();
            baseExoPlayer = null;
        }
        forwardingPlayer = null;
        super.onDestroy();
    }
}
