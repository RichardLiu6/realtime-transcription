package com.americanbestlife.translate;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Keeps the app running while it transcribes with the screen off or another
 * app in front: Android only lets a foreground service of type "microphone"
 * record in the background, and it must show an ongoing notification. The
 * recording itself is in NativeSttPlugin; tapping the notification opens
 * the app.
 */
public class TranscriptionService extends Service {
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_TEXT = "text";
    private static final String CHANNEL_ID = "transcription";
    private static final int NOTIFICATION_ID = 1;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent != null ? intent.getStringExtra(EXTRA_TITLE) : null;
        String text = intent != null ? intent.getStringExtra(EXTRA_TEXT) : null;

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Transcription", NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(title != null ? title : "ABL Translate")
            .setContentText(text != null ? text : "")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(tap)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE : 0;
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type);
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
