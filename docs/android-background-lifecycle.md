# Android Background Lifecycle

Test procedure for verifying server behavior when app is backgrounded with
foreground service active. Perform on physical Android devices (especially
API 34+ and OEMs with aggressive battery optimization: Samsung One UI,
Xiaomi MIUI, Huawei EMUI).

## Prerequisites

- Model loaded and server running in LAN mode (`0.0.0.0`)
- Persistent notification visible ("PocketPal Server")
- Client device on same network to send test requests

## Test Matrix

### 1. Screen Off

| Step | Expected |
|------|----------|
| Start server, turn screen off | Notification stays visible |
| Send HTTP request from client | Request processed, response returned |
| Send streaming chat request | Streaming continues, all chunks delivered |

### 2. App Backgrounded (Home button / gesture)

| Step | Expected |
|------|----------|
| Start server, press Home | Notification stays visible |
| Send 3 sequential HTTP requests | All 3 processed successfully |
| App in recent apps (not killed) | Server keeps running |
| Return to app from recent apps | Server state reflects current reality (active requests) |

### 3. Activity Recreation (config change)

| Step | Expected |
|------|----------|
| Start server, rotate device | Server stays running |
| Check notification after rotation | Bind mode and port still correct |
| Send request after rotation | Request processed normally |

### 4. Process Idle / Doze

| Step | Expected |
|------|----------|
| Start server, background app | Server stays alive ≥ 5 minutes idle |
| Send request after 5 min idle | Request processed (may be slightly delayed) |
| Start server, background, lock device | Server stays alive ≥ 15 minutes |

### 5. Network Reachable

| Step | Expected |
|------|----------|
| Start server in LAN mode | LAN URL accessible from client device |
| Background app | LAN URL still accessible |
| Toggle Wi-Fi off while backgrounded | Server continues on localhost (no LAN) |
| Toggle Wi-Fi back on while backgrounded | LAN address resolves again |

### 6. Streaming Active While Backgrounded

| Step | Expected |
|------|----------|
| Start streaming chat request from client | Tokens stream normally |
| Background app mid-stream | Streaming continues, all tokens delivered |
| Foreground app during stream | No interruption, consistent output |

## Known Limitations

- **Samsung One UI 6+**: Aggressive battery optimization may pause JS thread
  even with foreground service. Users may need to disable battery optimization
  for PocketPal in system settings.
- **Xiaomi MIUI 14+**: Autostart behavior restricted by default. Users may
  need to enable "Autostart" in app info and set battery saver to "No
  restrictions."
- **Huawei EMUI 12+**: PowerGenie may throttle background process. Users may
  need to set app launch to "Manage manually" with all three toggles enabled.

## Battery Impact

Foreground service with `IMPORTANCE_LOW` notification keeps CPU awake but at
reduced frequency. No partial wake lock or Wi-Fi lock is held — Android's
foreground process policy handles CPU retention. Battery drain is proportional
to active inference: idle server has negligible impact; active streaming uses
normal inference power.

## After Crash / Process Kill

`START_NOT_STICKY` used — if the process is killed (OOM, user force-stop),
the service does NOT restart. Notification is automatically removed by the
system. User must restart the server manually from the app.
