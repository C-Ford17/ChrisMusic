package com.chrismusic.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media3.session.MediaNotification;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

import com.google.common.collect.ImmutableList;

/**
 * MusicPlayerService — Media3 MediaSessionService.
 */
public class MusicPlayerService extends MediaSessionService {

    private static final String TAG = "MusicPlayerService";
    private static final String CHANNEL_ID = "chrismusic_playback_v3"; // New channel
    private static final int NOTIFICATION_ID = 1001;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        
        MediaSession session = ExoPlayerPlugin.getMediaSession();
        if (session != null) {
            addSession(session);
        }
        
        Log.d(TAG, "MusicPlayerService created");
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
            channel.setSound(null, null); // Ensure no sound on updates
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return ExoPlayerPlugin.getMediaSession();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId);
        return START_STICKY;
    }
}
