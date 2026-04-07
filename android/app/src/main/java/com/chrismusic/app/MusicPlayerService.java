package com.chrismusic.app;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

/**
 * MusicPlayerService — Media3 MediaSessionService.
 *
 * This service allows Android to recognize ChrisMusic as a media player,
 * providing the system notification controls and lock screen integration.
 * It retrieves the active MediaSession from ExoPlayerPlugin.
 */
public class MusicPlayerService extends MediaSessionService {

    private static final String TAG = "MusicPlayerService";
    private static final String CHANNEL_ID = "chrismusic_playback_v2";
    private static final int NOTIFICATION_ID = 1001;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        Log.d(TAG, "MusicPlayerService created");
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Reproductor de ChrisMusic",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Mantiene la app activa en segundo plano");
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        // Return the session created by ExoPlayerPlugin
        MediaSession session = ExoPlayerPlugin.getMediaSession();
        if (session == null) {
            Log.w(TAG, "onGetSession: MediaSession is null!");
        }
        return session;
    }

    @SuppressLint("ForegroundServiceType")
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "MusicPlayerService onStartCommand");

        // Immediately start foreground to satisfy Android 14's strict timer
        // We use a basic notification until MediaSession takes over
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent contentIntent = PendingIntent.getActivity(
                this, 0, launchIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("ChrisMusic")
                .setContentText("Preparando reproducción...")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(contentIntent)
                .setSilent(true)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        return super.onStartCommand(intent, flags, startId);
    }

    @Override
    public void onDestroy() {
        Log.d(TAG, "MusicPlayerService destroyed");
        super.onDestroy();
    }
}
