package com.pocketpal

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.pocketpal.specs.NativeServerForegroundServiceSpec

@ReactModule(name = NativeServerForegroundServiceSpec.NAME)
class ServerForegroundServiceModule(reactContext: ReactApplicationContext) :
    NativeServerForegroundServiceSpec(reactContext) {

    private val stopReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            sendEvent("stopRequested")
        }
    }

    init {
        val filter = IntentFilter(ServerForegroundService.ACTION_STOP)
        if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED || android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            reactApplicationContext.registerReceiver(stopReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            reactApplicationContext.registerReceiver(stopReceiver, filter)
        }
    }

    override fun addListener(eventName: String) {}

    override fun removeListeners(count: Double) {}

    override fun startForegroundService(bindMode: String, port: Double, promise: Promise) {
        val intent = Intent(reactApplicationContext, ServerForegroundService::class.java).apply {
            putExtra(ServerForegroundService.EXTRA_BIND_MODE, bindMode)
            putExtra(ServerForegroundService.EXTRA_PORT, port.toInt())
            putExtra(ServerForegroundService.EXTRA_ACTIVE_REQUESTS, 0)
        }
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            reactApplicationContext.startForegroundService(intent)
        } else {
            reactApplicationContext.startService(intent)
        }
        promise.resolve(null)
    }

    override fun updateNotification(
        bindMode: String,
        port: Double,
        activeRequests: Double,
        promise: Promise
    ) {
        val intent = Intent(reactApplicationContext, ServerForegroundService::class.java).apply {
            putExtra(ServerForegroundService.EXTRA_BIND_MODE, bindMode)
            putExtra(ServerForegroundService.EXTRA_PORT, port.toInt())
            putExtra(ServerForegroundService.EXTRA_ACTIVE_REQUESTS, activeRequests.toInt())
        }
        reactApplicationContext.startService(intent)
        promise.resolve(null)
    }

    override fun stopForegroundService(promise: Promise) {
        val intent = Intent(reactApplicationContext, ServerForegroundService::class.java).apply {
            action = ServerForegroundService.ACTION_STOP
        }
        reactApplicationContext.startService(intent)
        promise.resolve(null)
    }

    override fun onCatalystInstanceDestroy() {
        try {
            reactApplicationContext.unregisterReceiver(stopReceiver)
        } catch (_: Exception) {}
        super.onCatalystInstanceDestroy()
    }

    private fun sendEvent(eventType: String) {
        val params = Arguments.createMap().apply {
            putString("eventType", eventType)
        }
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("ServerForegroundService", params)
    }
}
