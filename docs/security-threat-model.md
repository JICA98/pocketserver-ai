# Security Threat Model — PocketPal Local Server

The local HTTP server exposes an OpenAI-compatible API on the device's
network. This document identifies risks and documents mitigations.

## Scope

- **Server**: in-app HTTP server via `LocalServerController` + `react-native-tcp-socket`
- **Modes**: localhost-only (`127.0.0.1`), LAN (`0.0.0.0`), tunnels (Cloudflare/Tailscale/SSH/ngrok)
- **Client types**: local apps, LAN devices, internet-exposed (via tunnel)

---

## Risk Matrix

### 1. Unauthorized LAN User

**Risk**: Anyone on same Wi-Fi can access the server.

**Mitigation**:
- Auth enabled by default (`authEnabled: true`)
- Console warning when LAN mode starts without auth
- API key stored in OS Keychain (never in AsyncStorage)
- API key uses `crypto.getRandomValues()` (cryptographically secure)
- Constant-time token comparison prevents timing side-channels

### 2. Public Tunnel Scanning

**Risk**: When exposed via tunnel, internet scanners may discover and probe.

**Mitigation**:
- Each tunnel provider has its own auth layer (Cloudflare Access, Tailscale ACL, SSH keys, ngrok basic auth)
- Documented setup in `docs/tunnel-guide.md`
- API key required by default even with tunnel
- No health endpoint returns sensitive data (just model_loaded status)

### 3. Prompt/Data Exposure

**Risk**: Request/response data leaked via logs, error responses, or network traces.

**Mitigation**:
- All `console.*` in server code guarded with `__DEV__` (stripped in release)
- Error responses sanitized: `err.message` replaced with generic messages in production
- Logs in `LocalServerStore` never contain request bodies
- No `console.log` of chat prompts or responses in server path
- IP addresses redacted in log entries (last two octets masked)

### 4. Denial of Service

**Risk**: Attacker floods server with requests, exhausting device resources.

**Mitigation**:
- Rate limit: per-IP sliding window (default 60 req/min), returns 429
- Queue limit: max 10 queued requests, returns 429 when exceeded
- Concurrent generation: single-threaded (InferenceCoordinator)
- Body size limit: 10 MB (returns 413)
- Request timeout: 60s default (returns generic error)

### 5. Oversized Request

**Risk**: Large request bodies consume memory / crash the server.

**Mitigation**:
- `Content-Length` > 10 MB returns 413 before any processing
- Header size limit: 16 KB (returns 413)

### 6. Endless Generation

**Risk**: Attacker requests unbounded token generation, consuming CPU indefinitely.

**Mitigation**:
- `max_tokens` capped at 16,384 tokens server-side
- Request timeout (60s) enforced via `Promise.race`/AbortController
- Streaming aborted on timeout or client disconnect

### 7. Queue Flooding

**Risk**: Attacker fills the inference queue, blocking legitimate users.

**Mitigation**:
- Queue limit: 10 (returns "Server busy" 429)
- Idle timeout: auto-stop after 5 minutes inactivity (frees resources)
- Rate limit prevents queue saturation

### 8. CORS/Browser Abuse

**Risk**: Malicious websites on LAN could call the server from browser origins.

**Mitigation**:
- CORS headers set to `*` by default (local use case)
- `corsAllowedOrigins` config field present for future restriction
- No sensitive cookies/sessions used (stateless Bearer auth)
- Browser cannot add custom `Authorization` header without user providing the token

### 9. Secret Leakage

**Risk**: API keys, HF tokens, or session data leaked via logs or responses.

**Mitigation**:
- API key generated with `crypto.getRandomValues()`, 16 random bytes
- API key stored exclusively in OS Keychain (`react-native-keychain`)
- API key never appears in `addLogEntry`, notification text, or HTTP response
- Key regeneration deletes old key, generates new one
- `sanitizeErrorMessage()` ensures no internal data leaks in error responses

### 10. Unsafe Admin Endpoints

**Risk**: Hidden admin/debug endpoints could be exploited.

**Mitigation**:
- Only OpenAI-compatible API routes exist: `/health`, `/v1/models`, `/v1/chat/completions`, `/v1/completions`
- No admin, debug, or configuration endpoints
- 404 catch-all for unknown routes
- POST-only inference endpoints (GET returns 405 where appropriate)

### 11. Model Reload Races

**Risk**: Reloading model while generation is active causes crash/corruption.

**Mitigation**:
- `InferenceCoordinator` serializes all requests (single active)
- Model reload blocks until active generation completes
- AbortController passed to inference engine for cancellation
- Queue drained on server stop before model release

---

## Limitations

### Not Addressed

| Limitation | Reason |
|-----------|--------|
| TLS/HTTPS | Not practical on-device without self-signed certs; tunnel providers handle TLS |
| Request signing/SigV4 | Overkill for local/dev use; Bearer token sufficient |
| Biometric API key protection | Keychain already provides OS-level encryption |
| Firewall/iptables integration | Device-level concern, not app-level |
| Audit logging | Not in scope for local on-device server |

### Model-Specific

- The inference engine (llama.cpp) runs natively and may have its own vulnerabilities
- Model weights from Hugging Face / community sources not verified (user responsibility)
- Multimodal image processing may have additional attack surface

---

## Security Configuration Reference

| Setting | Default | Purpose |
|---------|---------|---------|
| `authEnabled` | `true` | Bearer token required for all requests |
| `queueLimit` | `10` | Max queued inference requests |
| `requestTimeoutMs` | `60000` | Max time per request before abort |
| `idleTimeoutMs` | `300000` | Auto-stop after 5 min inactivity |
| `rateLimitMax` | `60` | Requests per rate-limit window |
| `rateLimitWindowMs` | `60000` | Rate-limit window duration |
| `corsAllowedOrigins` | `['*']` | CORS origin allowlist (unused, always *) |

## Pre-Release Checklist

- [ ] No API keys in source code, config files, or environment variables checked in
- [ ] No credentials in code examples or documentation screenshots
- [ ] No request/response bodies in default log output
- [ ] Auth enabled by default; LAN mode warns if disabled
- [ ] Request limits active and return appropriate error codes
- [ ] No unprotected admin or debug endpoints
- [ ] Dependencies audited for known vulnerabilities
