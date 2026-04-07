package com.chrismusic.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

/**
 * MusicPlayerService — lightweight ForegroundService for background audio.
 *
 * Keeps the Media3 ExoPlayer alive when ChrisMusic is minimized.
 * The actual ExoPlayer instance lives in ExoPlayerPlugin; this service
 * only provides the foreground notification required by Android to allow
 * background media playback.
 *
 * In a future iteration this can be promoted to a full Media3
 * MediaSessionService for richer notification controls.
 */
public class MusicPlayerService extends Service {

    private static final String TAG = "MusicPlayerService";
    private static final String CHANNEL_ID = "chrismusic_playback";
    private static final int NOTIFICATION_ID = 1001;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = "ChrisMusic";
        String artist = "Reproduciendo en segundo plano";

        if (intent != null) {
            String t = intent.getStringExtra("title");
            String a = intent.getStringExtra("artist");
            if (t != null && !t.isEmpty()) title = t;
            if (a != null && !a.isEmpty()) artist = a;
        }

        startForeground(NOTIFICATION_ID, buildNotification(title, artist));
        Log.d(TAG, "MusicPlayerService started: " + title);

        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "MusicPlayerService destroyed");
    }

    // ─── Notification ─────────────────────────────────────────────────────

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "ChrisMusic Playback",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Controles de reproducción de ChrisMusic");
            channel.setShowBadge(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification(String title, String artist) {
        // Tap notification → open app
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent contentIntent = PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(artist)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(contentIntent)
                .setOngoing(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .build();
    }
}
