# Tunnel & Network Access Guide

PocketServer AI listens on-device over TCP. This guide explains how to reach
it from other devices on your network or from the public internet.

---

## Localhost Mode

The server binds to `127.0.0.1` only. It is **not** reachable from any other
device — including the same Wi-Fi LAN.

**Useful for:**
- `adb reverse` development workflow (see below)
- Keeping the server private while testing on-device

### `adb reverse` development flow

Forward traffic from your PC's port to the phone:

```bash
adb reverse tcp:8080 tcp:8080
```

Then on your PC, `curl http://localhost:8080/health` reaches the phone server.

**Auth on/off behavior:** Works identically to LAN mode. When auth is enabled,
every request must include `Authorization: Bearer <key>`.

---

## LAN Mode (Local Network)

Set **Host Bind Mode → LAN** in Advanced Settings. The server binds to
`0.0.0.0` and is reachable from any device on the same Wi-Fi network.

The LAN URL is shown in the Connection Addresses card once the server starts.

### Test checklist (from another device on the same network)

| Test | Expected |
|---|---|
| `curl http://<LAN_IP>:<PORT>/health` | `{"status":"ok",...}` |
| `curl http://<LAN_IP>:<PORT>/v1/models` | model list or `[]` |
| Non-streaming completion | JSON response with `choices[0].message.content` |
| Streaming completion (`-N` flag) | SSE chunks ending in `[DONE]` |
| Request without API key (auth enabled) | `401 Unauthorized` |
| Request with wrong API key | `401 Unauthorized` |

> **Phone IP changes:** If the device switches Wi-Fi networks or renews a
> DHCP lease, restart the server so the new IP is discovered and shown.

> **Hotspot mode:** Enable Mobile Hotspot on the phone; connect your PC to it.
> Use the hotspot gateway IP (usually `192.168.43.1`) or the IP shown in the
> app. This works identically to Wi-Fi LAN mode.

---

## Manual Tunnel (Public Internet)

You run a tunnel tool **on a separate PC or host** that forwards an HTTPS
public URL to the phone's local port. The app does **not** manage the tunnel
process.

### Setup steps

1. Enable **LAN mode** in the app (or use `adb reverse` if the tunnel runs
   on the PC the phone is connected to via USB).
2. Run one of the tunnel tools below.
3. Copy the generated public URL.
4. In the app → Tunnel / Public Access → toggle **Enable Manual Tunnel URL**
   → paste the URL → blur/confirm.
5. The URL is now shown in Connection Addresses and used in API examples.

> ⚠️ **Always keep auth enabled when exposing publicly.** Anyone with the
> public URL can reach your on-device LLM if auth is off.

---

## Free Tunnel Options

### 1. Cloudflare Quick Tunnel

**Runs on:** PC (or any host that can reach the phone)

```bash
# Install once
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
     -o cloudflared && chmod +x cloudflared

# Start tunnel — no account required
./cloudflared tunnel --url http://localhost:8080
```

- Cloudflare prints a random `*.trycloudflare.com` URL.
- No account or sign-in required for quick tunnels.
- **Limitation:** URL is ephemeral — changes every run. Requires free Cloudflare
  account + named tunnel for a stable URL.
- Terms: Cloudflare may change or remove the free quick-tunnel feature.

---

### 2. Tailscale Funnel

**Runs on:** The PC that is in your Tailnet and can reach the phone.

```bash
# Install Tailscale, sign in, then:
tailscale funnel 8080
```

Or share only within your Tailnet (no public exposure):

```bash
tailscale serve 8080
```

- Funnel exposes to the public internet; Serve exposes only within your Tailnet.
- Requires a Tailscale account (free tier available).
- **Limitation:** Funnel requires Tailscale 1.39+; some plans limit funnel ports.

---

### 3. SSH Reverse Tunnel

**Runs on:** Any host with an SSH server that allows `GatewayPorts`.

```bash
# Forward remote port 8080 → phone's local port 8080
ssh -R 0:localhost:8080 serveo.net

# Or with your own server:
ssh -R 8080:localhost:8080 user@your-server.com
```

- [Serveo](https://serveo.net) is a free SSH forwarding service with no account.
- Your own VPS gives a stable IP/domain.
- **Limitation:** Serveo is community-maintained and may be unreliable.
  Using your own SSH server is more reliable.

---

### 4. ngrok

**Runs on:** PC

```bash
# Install ngrok, sign up for a free account, then:
ngrok http 8080
```

- ngrok prints a public HTTPS URL.
- Free tier: sessions expire after some hours; URL changes each run.
- Paid tier: stable custom domains.
- Terms: ngrok free tier has bandwidth and connection limits.

---

## Security Notes for Public Tunnels

| Risk | Mitigation |
|---|---|
| Unauthorized access | Always enable API key auth; share the key only with intended clients |
| Prompt/data exposure | Tunnels encrypt traffic in transit; data is still processed on-device |
| Queue flooding | `queueLimit` in Advanced Settings caps concurrent server requests |
| Oversized requests | Body limit enforced in HttpServerAdapter (16 KB headers) |
| Key in logs | The app never logs the API key value; logs only show route/status/duration |

---

## Provider Disclaimer

Free tunnel services may change their terms, pricing, or availability at any
time. The guidance above reflects known behavior as of the app's release date
but does not guarantee permanently free or unchanged service.
