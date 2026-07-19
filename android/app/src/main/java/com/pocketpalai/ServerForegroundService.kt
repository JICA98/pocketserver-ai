package com.pocketpal

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class ServerForegroundService : Service() {

    private var bindMode: String = "localhost"
    private var port: Int = 8080
    private var activeRequests: Int = 0

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) return START_NOT_STICKY

        if (intent.action == ACTION_STOP) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        bindMode = intent.getStringExtra(EXTRA_BIND_MODE) ?: bindMode
        port = intent.getIntExtra(EXTRA_PORT, port)
        activeRequests = intent.getIntExtra(EXTRA_ACTIVE_REQUESTS, activeRequests)

        val notification = buildNotification()
        startForeground(NOTIFICATION_ID, notification)
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
    }

    private fun buildNotification(): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val openPendingIntent = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = Intent(ACTION_STOP)
        val stopPendingIntent = PendingIntent.getBroadcast(
            this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val requestText = if (activeRequests > 0) {
            "$activeRequests active request(s)"
        } else {
            "Idle"
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("PocketPal Server")
            .setContentText("$bindMode, port $port")
            .setSubText(requestText)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopPendingIntent)
            .addAction(android.R.drawable.ic_menu_view, "Open App", openPendingIntent)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Server",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows when the PocketPal server is running"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    companion object {
        const val CHANNEL_ID = "pocketpal_server"
        const val NOTIFICATION_ID = 2001
        const val ACTION_STOP = "com.pocketpal.ACTION_STOP_SERVER"

        const val EXTRA_BIND_MODE = "bindMode"
        const val EXTRA_PORT = "port"
        const val EXTRA_ACTIVE_REQUESTS = "activeRequests"
    }
}
