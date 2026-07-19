# PocketServer AI — Implementation Tasks

Complete tasks in order. Do not skip validation gates. Adapt filenames to the repository after inspecting the current fork.

---

# Phase 0 — Baseline and Repository Audit

## Task 0.1 — Establish baseline

- [x] Clone or open `JICA98/pocketserver-ai`.
- [x] Record current branch and commit.
- [x] Add the upstream remote if missing.
- [x] Confirm the fork builds before server changes.
- [x] Run lint.
- [x] Run TypeScript checks.
- [x] Run tests.
- [x] Build and launch Android.
- [x] Record any pre-existing failures separately.

Suggested commands:

```bash
git status
git remote -v
git branch --show-current
git log -1 --oneline
yarn install
yarn lint
yarn typecheck
yarn test
yarn android
```

Acceptance:

- Existing failures are clearly distinguished from new failures.
- A baseline app launch is verified.

## Task 0.2 — Map the app architecture

Locate and document:

- [x] App entry point.
- [x] Navigation container.
- [x] Drawer/sidebar definition.
- [x] Current initial route.
- [x] Chat route.
- [x] Model screens/routes.
- [x] Root MobX store.
- [x] Model store.
- [x] Chat store/session store.
- [x] Model load/unload methods.
- [x] Actual `llama.rn` generation entry points.
- [x] Streaming callbacks.
- [x] Cancellation method.
- [x] Prompt/template formatter.
- [x] Existing remote OpenAI client support, if present.
- [x] Existing background service code, if present.
- [x] Existing network utility code.
- [x] Localization registration.
- [x] Theme/component conventions.
- [x] Existing server work in the fork.

Create a concise architecture note in the implementation PR or commit description.

Acceptance:

- No implementation begins until the model context owner and generation flow are understood.

## Task 0.3 — Decide the HTTP server implementation

Evaluate candidate libraries or a minimal native implementation.

- [x] Confirm Android support.
- [x] Confirm React Native New Architecture support.
- [x] Confirm request streaming or SSE support.
- [x] Confirm binding to loopback and all interfaces.
- [x] Confirm request cancellation/disconnect visibility.
- [x] Check maintenance status and license.
- [x] Check foreground-service compatibility.
- [x] Check binary size impact.
- [x] Check iOS feasibility.
- [x] Write the selected approach and rejected alternatives.

Acceptance:

- The chosen implementation can send incremental SSE data.
- The implementation is not abandoned/unmaintained without a documented reason.

---

# Phase 1 — Navigation and Server Screen Shell

## Task 1.1 — Add Server route types

- [x] Add a typed `Server` route to the appropriate navigator type.
- [x] Update route-name constants if the project uses them.
- [x] Ensure route typing passes TypeScript.
- [x] Add a server icon using the project's existing icon approach.

Acceptance:

- `navigate('Server')` is type-safe.

## Task 1.2 — Add Server to the sidebar

- [x] Add Server as a visible drawer/sidebar item.
- [x] Place it in a logical high-priority position.
- [x] Keep Chat available.
- [x] Preserve existing drawer behavior.
- [x] Add localization strings.
- [x] Verify active-state styling.

Acceptance:

- Server is accessible from the sidebar on phone and tablet layouts.

## Task 1.3 — Make Server the default screen

- [x] Change the normal initial route from Chat to Server.
- [x] Preserve deep-link destination handling.
- [x] Preserve restored navigation where intended.
- [x] Verify no splash-to-blank transition.
- [x] Add/update navigation tests.

Acceptance:

- Cold launch opens Server.
- A chat deep link still opens Chat or the intended thread.

## Task 1.4 — Build the Server screen shell

Create the screen with static/placeholder state supplied by a temporary typed view model, not fake network behavior.

Sections:

- [x] Header/status.
- [x] Model readiness.
- [x] Start/Stop controls.
- [x] Local and LAN address cards.
- [x] Authentication.
- [x] Tunnel/public access.
- [x] Advanced settings.
- [x] Activity/logs.
- [x] API examples/help.

Acceptance:

- UI matches existing PocketPal components and themes.
- No hard-coded light-only colors.
- Screen works at small phone and tablet widths.

---

# Phase 2 — Server Domain Model and Persistence

## Task 2.1 — Define server types

Create typed definitions for:

- [x] `ServerStatus`.
- [x] `BindMode`.
- [x] `ServerConfig`.
- [x] `ServerRuntimeInfo`.
- [x] `ServerStats`.
- [x] `ServerLogEntry`.
- [x] `ServerCapabilities`.
- [x] `TunnelMode`.
- [x] `OpenAIErrorResponse`.
- [x] Request/response DTOs.

Acceptance:

- No pervasive `any` is introduced.

## Task 2.2 — Implement ServerStore

Add a MobX store following repository conventions.

State:

- [x] Status.
- [x] Config.
- [x] Runtime URLs.
- [x] Model readiness.
- [x] Active request count.
- [x] Queue count.
- [x] Stats.
- [x] Sanitized logs.
- [x] Last error.
- [x] Capability flags.

Actions:

- [x] Start.
- [x] Stop.
- [x] Restart.
- [x] Update config.
- [x] Regenerate API key.
- [x] Clear logs.
- [x] Refresh network addresses.
- [x] Set manual public URL.

Acceptance:

- Start/stop actions are guarded against duplicate taps.
- Store contains no socket/native server object if the existing architecture separates services from stores.

## Task 2.3 — Persist preferences securely

- [x] Persist non-secret settings using the project's settings persistence.
- [x] Store the API key in Keychain/secure storage.
- [x] Generate a cryptographically strong key.
- [x] Do not store transient Running state.
- [x] Reset runtime state truthfully after process restart.
- [x] Add migration/default handling for existing installs.

Acceptance:

- Upgrading an existing PocketPal install does not crash.
- API key is not present in plain AsyncStorage or logs.

## Task 2.4 — Add config validation

Validate:

- [x] Port is an integer in `1024..65535`, unless privileged ports are intentionally supported.
- [x] Port is not already in use.
- [x] Allowed origins are valid.
- [x] Queue limit is bounded.
- [x] Timeout is bounded.
- [x] Manual URL is valid HTTP/HTTPS.
- [x] API key is non-empty when auth is enabled.

Acceptance:

- Invalid values produce inline messages and never reach native server start.

---

# Phase 3 — HTTP Server Foundation

## Task 3.1 — Implement lifecycle controller

Implement an idempotent controller:

- [x] `start(config)`.
- [x] `stop()`.
- [x] `restart(config)`.
- [x] `isRunning()`.
- [x] Cleanup in all failure paths.
- [x] Runtime event subscription.
- [x] State synchronization with ServerStore.
- [x] Port-in-use error handling.

Acceptance:

- Calling Start twice creates only one server.
- Calling Stop twice is harmless.
- Failed start returns to Error/Stopped truthfully.

## Task 3.2 — Add base routes

Implement:

### `GET /`

Return service identity and links.

### `GET /health`

Return at least:

```json
{
  "status": "ok",
  "server": "running",
  "model_loaded": true,
  "inference_ready": true,
  "busy": false
}
```

### `GET /version`

Return app/server/API version information.

- [x] Add JSON content type.
- [x] Add request IDs.
- [x] Add consistent error handling.
- [x] Add route-not-found handling.

Acceptance:

- Routes work from the phone itself.
- Routes work from another LAN device in LAN mode.

## Task 3.3 — Add middleware/protection

- [x] Request ID.
- [x] JSON parser with body-size limit.
- [x] Bearer authentication.
- [x] CORS.
- [x] `OPTIONS` handling.
- [x] Request timeout.
- [x] Safe error boundary.
- [x] Access logging with redaction.
- [x] Basic rate limiting.
- [x] Connection cleanup.

Acceptance:

- Authorization headers never appear in UI logs.
- Oversized JSON is rejected without memory blow-up.

## Task 3.4 — Network address discovery

- [x] Enumerate suitable LAN IPv4 addresses.
- [x] Avoid loopback and unusable interfaces for displayed LAN URL.
- [x] Handle Wi-Fi/hotspot changes.
- [x] Handle no-network state.
- [x] Avoid presenting `0.0.0.0` as a client destination.
- [x] Consider IPv6 and bracket formatting.

Acceptance:

- The URL displayed in the app is actually reachable in the tested network mode.

---

# Phase 4 — Shared Inference Coordinator

## Task 4.1 — Extract or introduce a shared inference interface

Define a common interface used by Chat and Server.

Inputs should cover:

- [ ] Messages or prompt.
- [ ] Model identifier.
- [ ] Generation parameters.
- [ ] Stop sequences.
- [ ] Streaming callback.
- [ ] Abort/cancellation signal.
- [ ] Request source: Chat or Server.
- [ ] Optional tool configuration only when supported.

Outputs:

- [ ] Text.
- [ ] Finish reason.
- [ ] Token usage where available.
- [ ] Timing data.
- [ ] Error category.

Acceptance:

- Existing Chat behavior remains functionally equivalent.

## Task 4.2 — Implement concurrency control

- [ ] Use one active generation by default.
- [ ] Add a bounded queue or explicit `429` rejection.
- [ ] Track active and queued requests.
- [ ] Ensure fairness.
- [ ] Support cancellation while queued.
- [ ] Release locks in `finally`.
- [ ] Coordinate model unload/reload.

Acceptance:

- Two simultaneous clients cannot corrupt the model context.
- A failed request cannot permanently lock inference.

## Task 4.3 — Implement cancellation

Cancellation sources:

- [ ] HTTP client disconnect.
- [ ] Request timeout.
- [ ] App Stop Server action.
- [ ] Model unload/reload.
- [ ] Chat cancellation.
- [ ] App lifecycle shutdown.

Acceptance:

- Cancellation releases queue/active counters and native generation resources.
- No completion continues indefinitely after a disconnected streaming client.

## Task 4.4 — Usage accounting

- [ ] Capture prompt token count where supported.
- [ ] Capture completion token count.
- [ ] Capture total tokens.
- [ ] Fall back to `null`/omitted values rather than fabricated numbers.
- [ ] Track generation duration.
- [ ] Update aggregate stats.

Acceptance:

- API usage values are real or explicitly unavailable.

---

# Phase 5 — OpenAI-Compatible API

## Task 5.1 — Implement `GET /v1/models`

Return the loaded/local model in an OpenAI-style list.

- [ ] Include stable model ID.
- [ ] Include object type.
- [ ] Include created timestamp when meaningful.
- [ ] Include owner string.
- [ ] Clearly represent no loaded model.

Acceptance:

- Common OpenAI clients can parse the response.

## Task 5.2 — Validate chat completion requests

Validate:

- [ ] `messages` is present and non-empty.
- [ ] Roles are supported.
- [ ] Content shapes are supported.
- [ ] Numeric parameters are bounded.
- [ ] `max_tokens` respects model/context limits.
- [ ] Stop values are normalized.
- [ ] Unsupported multimodal content gets a clear error.
- [ ] Unsupported tools/response formats get a clear error or safe fallback.
- [ ] Unknown fields do not crash parsing.

Acceptance:

- Malformed input returns `400` with a stable error code.

## Task 5.3 — Implement non-streaming chat completions

- [ ] Convert OpenAI messages into the model's required chat-template input.
- [ ] Reuse the same formatter used by Chat.
- [ ] Run through InferenceCoordinator.
- [ ] Return OpenAI-shaped response.
- [ ] Map finish reasons.
- [ ] Include real usage when available.

Acceptance:

- A standard OpenAI SDK/client can obtain a completion.

## Task 5.4 — Implement streaming chat completions

- [ ] Use SSE.
- [ ] Send headers before generation.
- [ ] Emit role delta if appropriate.
- [ ] Emit content deltas.
- [ ] Emit final finish reason.
- [ ] Emit `[DONE]`.
- [ ] Flush chunks promptly.
- [ ] Handle UTF-8 boundaries safely.
- [ ] Handle client disconnect.
- [ ] Avoid buffering the whole response.

Acceptance:

- `curl -N` visibly receives incremental tokens.
- OpenAI-compatible clients complete without hanging.

## Task 5.5 — Implement `/v1/completions`

- [ ] Accept string prompt.
- [ ] Support streaming and non-streaming.
- [ ] Reuse inference coordinator.
- [ ] Return OpenAI-compatible text completion shape.
- [ ] Reject unsupported prompt arrays clearly if not implemented.

Acceptance:

- Endpoint behaves independently of chat message formatting.

## Task 5.6 — Tool and structured-output behavior

Inspect the existing PocketPal AgentRunner/Talents flow.

- [ ] Decide whether server requests may invoke Talents.
- [ ] Keep tools disabled by default unless safely supported.
- [ ] Do not silently claim full OpenAI tool-call compatibility.
- [ ] Map supported tool calls correctly if implemented.
- [ ] Validate JSON response format only if the inference stack can enforce it.
- [ ] Document limitations.

Acceptance:

- Unsupported tool requests return a clear, non-crashing response.

---

# Phase 6 — Connect Runtime to Server UI

## Task 6.1 — Replace placeholder Server UI state

Connect the screen to ServerStore.

- [ ] Status.
- [ ] Model state.
- [ ] Start/Stop/Restart.
- [ ] Port.
- [ ] Bind mode.
- [ ] URLs.
- [ ] Auth.
- [ ] Stats.
- [ ] Logs.
- [ ] Errors.
- [ ] Capability limitations.

Acceptance:

- UI always reflects actual controller state.

## Task 6.2 — Add URL and credential actions

- [ ] Copy local URL.
- [ ] Copy LAN URL.
- [ ] Copy public URL.
- [ ] Copy API key.
- [ ] Share URL.
- [ ] Regenerate API key with confirmation.
- [ ] Mask/unmask API key.
- [ ] Show brief success feedback.

Acceptance:

- Real key is never exposed accidentally in logs or screenshots created by tests.

## Task 6.3 — Add API examples

Generate examples from current config:

- [ ] Health curl.
- [ ] Chat completion curl.
- [ ] Streaming curl.
- [ ] OpenAI Python client example.
- [ ] JavaScript OpenAI client example.
- [ ] LM Studio/Open WebUI/custom base URL guidance if compatible.

Acceptance:

- Examples update when host, port, or auth changes.
- Examples use placeholders or deliberately revealed credentials.

## Task 6.4 — Add activity/log panel

- [ ] Show recent request entries.
- [ ] Show active request count.
- [ ] Show queue count.
- [ ] Show request duration/status.
- [ ] Clear logs.
- [ ] Cap in-memory history.
- [ ] Redact secrets and content.

Acceptance:

- High request volume cannot grow logs without a bound.

---

# Phase 7 — Local Network and Tunnel Support

## Task 7.1 — Verify localhost mode

Test:

- [ ] Android app-local client if available.
- [ ] `adb shell`/device-local curl equivalent.
- [ ] `adb reverse` development flow.
- [ ] Auth on/off behavior.

Acceptance:

- Loopback-only mode is not reachable from another LAN device.

## Task 7.2 — Verify LAN mode

Test from another device:

- [ ] Health.
- [ ] Models.
- [ ] Non-streaming completion.
- [ ] Streaming completion.
- [ ] Unauthorized request.
- [ ] Wrong API key.
- [ ] Phone IP changes.
- [ ] Hotspot mode.

Acceptance:

- LAN access works using the URL displayed by the app.

## Task 7.3 — Add manual external tunnel mode

- [ ] Add a tunnel mode selector.
- [ ] Add manual public URL entry.
- [ ] Validate HTTPS/HTTP URL.
- [ ] Display local target port.
- [ ] Explain that API auth must remain enabled.
- [ ] Add provider-neutral instructions.
- [ ] Do not imply the app itself created the tunnel.

Acceptance:

- A tunnel created outside the app can be represented and shared from the Server UI.

## Task 7.4 — Document/test free tunnel approaches

Add concise setup guidance for at least:

- [ ] Cloudflare Quick Tunnel.
- [ ] Tailscale Funnel or Tailscale access.
- [ ] SSH reverse tunnel.
- [ ] One additional provider/tool.

For each, state:

- Command or setup outline.
- Local target host/port.
- Authentication warning.
- Provider/account limitations.
- Whether the tunnel process runs on phone, PC, or another host.

Acceptance:

- Instructions do not promise permanently free or unchanged provider terms.

## Task 7.5 — Optional embedded Cloudflare tunnel spike

Only perform after the manual mode is stable.

- [ ] Confirm Android ARM64 binary/library option.
- [ ] Review license.
- [ ] Review binary update/security strategy.
- [ ] Measure APK size impact.
- [ ] Capture stdout/stderr safely.
- [ ] Parse generated public URL.
- [ ] Stop process reliably.
- [ ] Handle process death.
- [ ] Do not ship if reliability/security is poor.

Acceptance:

- A rejected spike is valid if evidence is documented.
- Do not block the core server release on embedded tunnelling.

---

# Phase 8 — Android Background Server

## Task 8.1 — Prove lifecycle behavior

Before implementing a foreground service, test:

- [ ] Screen off.
- [ ] App backgrounded.
- [ ] Activity recreated.
- [ ] Process remains alive.
- [ ] Network remains reachable.
- [ ] Streaming remains active.

Acceptance:

- Actual behavior is measured rather than assumed.

## Task 8.2 — Implement foreground service where required

- [ ] Create notification channel.
- [ ] Persistent notification with server state.
- [ ] Stop action.
- [ ] Correct Android manifest entries.
- [ ] Correct foreground service type where required.
- [ ] Start/stop native service from controller.
- [ ] Keep state synchronized after Activity recreation.
- [ ] Handle Android permission requirements.
- [ ] Avoid boot auto-start by default.

Acceptance:

- Android does not terminate the server immediately after backgrounding under normal tested conditions.

## Task 8.3 — Power/network locks

- [ ] Determine whether partial wake lock is required.
- [ ] Determine whether Wi-Fi lock is required.
- [ ] Acquire only while needed.
- [ ] Release on stop/error/process cleanup.
- [ ] Explain battery impact in UI.

Acceptance:

- No lock remains after server stops.

## Task 8.4 — Notification controls

- [ ] Show bind mode and port.
- [ ] Show active request indicator where practical.
- [ ] Add Stop.
- [ ] Add Open App.
- [ ] Never display API key.
- [ ] Handle stale notification after crash.

Acceptance:

- Notification accurately represents server state.

---

# Phase 9 — Security Hardening

## Task 9.1 — Threat-model the exposed server

Document risks:

- [ ] Unauthorized LAN user.
- [ ] Public tunnel scanning.
- [ ] Prompt/data exposure.
- [ ] Denial of service.
- [ ] Oversized request.
- [ ] Endless generation.
- [ ] Queue flooding.
- [ ] CORS/browser abuse.
- [ ] Secret leakage.
- [ ] Unsafe admin endpoints.
- [ ] Model reload races.

Acceptance:

- Each material risk has a mitigation or explicit limitation.

## Task 9.2 — Enforce resource limits

- [ ] Request body limit.
- [ ] Prompt/context limit.
- [ ] Output token limit.
- [ ] Queue limit.
- [ ] Concurrent generation limit.
- [ ] Request timeout.
- [ ] Idle timeout.
- [ ] Log retention limit.
- [ ] Rate limit.

Acceptance:

- Malicious or accidental load cannot trivially allocate unbounded memory.

## Task 9.3 — Harden authentication

- [ ] Secure random API key.
- [ ] Bearer parser.
- [ ] Constant-time comparison where feasible.
- [ ] Secure persistence.
- [ ] Regeneration.
- [ ] Redaction.
- [ ] Auth required by default outside localhost.
- [ ] Tests for malformed/missing headers.

Acceptance:

- LAN and public modes cannot start unauthenticated without an explicit warning/override.

## Task 9.4 — Release logging policy

- [ ] Disable verbose body logging in release.
- [ ] Remove stack traces from HTTP responses.
- [ ] Redact IPs if privacy mode enabled.
- [ ] Never log tokens/keys.
- [ ] Verify native library logs.

Acceptance:

- A release log review finds no secrets or full prompts by default.

---

# Phase 10 — Tests and Compatibility

## Task 10.1 — Unit tests

Add tests for:

- [ ] Config validation.
- [ ] Auth parsing.
- [ ] Secret redaction.
- [ ] Error mapping.
- [ ] Request DTO validation.
- [ ] SSE encoding.
- [ ] Response mapping.
- [ ] Queue behavior.
- [ ] Cancellation.
- [ ] URL generation.
- [ ] LAN address filtering.
- [ ] Store state transitions.
- [ ] Start/stop idempotency.

Acceptance:

- Tests are deterministic and do not require a real model unless marked integration-only.

## Task 10.2 — Navigation/UI tests

- [ ] Server is default route.
- [ ] Server drawer item exists.
- [ ] Start disabled with invalid config.
- [ ] No-model warning.
- [ ] Running state controls.
- [ ] Error state.
- [ ] Theme coverage.
- [ ] Accessibility labels.

Acceptance:

- Existing navigation tests remain green.

## Task 10.3 — HTTP integration tests

Test:

- [ ] Health.
- [ ] Models.
- [ ] Auth.
- [ ] CORS.
- [ ] Invalid JSON.
- [ ] Oversized body.
- [ ] Non-streaming completion.
- [ ] Streaming completion.
- [ ] Queue full.
- [ ] Timeout.
- [ ] Disconnect.
- [ ] Server stop during request.

Acceptance:

- Tests verify response status, headers, shape, and cleanup.

## Task 10.4 — Physical-device matrix

Record results for at least one physical Android device:

- [ ] Android version.
- [ ] Device/SoC.
- [ ] Wi-Fi LAN.
- [ ] Hotspot.
- [ ] Screen off.
- [ ] Background.
- [ ] 10+ sequential requests.
- [ ] Competing requests.
- [ ] Long streaming request.
- [ ] Tunnel request.
- [ ] Battery/thermal observations.
- [ ] Model unload/reload.

Acceptance:

- Test evidence includes actual client commands and observed output.

---

# Phase 11 — Documentation

## Task 11.1 — Update README

Add:

- [ ] What PocketServer AI changes from PocketPal.
- [ ] Server-first startup.
- [ ] Supported endpoints.
- [ ] Localhost setup.
- [ ] LAN setup.
- [ ] Authentication.
- [ ] Tunnel setup.
- [ ] Background limitations.
- [ ] Security warning.
- [ ] Example clients.
- [ ] Known limitations.
- [ ] Upstream attribution and license.

Acceptance:

- A new user can serve a model without reading source code.

## Task 11.2 — Add API documentation

Document:

- [ ] Base URL.
- [ ] Authentication.
- [ ] Routes.
- [ ] Request fields.
- [ ] Response fields.
- [ ] Streaming format.
- [ ] Error format.
- [ ] Unsupported OpenAI features.
- [ ] Limits.
- [ ] Example curl/Python/JavaScript clients.

Acceptance:

- Docs match implemented behavior exactly.

## Task 11.3 — Add troubleshooting

Cover:

- [ ] Port already in use.
- [ ] No model loaded.
- [ ] Client cannot reach LAN URL.
- [ ] VPN interference.
- [ ] Router client isolation.
- [ ] Phone IP changed.
- [ ] Android killed background process.
- [ ] Tunnel disconnected.
- [ ] Unauthorized.
- [ ] Streaming client buffers output.
- [ ] Model context exceeded.
- [ ] Thermal throttling.

Acceptance:

- Troubleshooting does not recommend disabling authentication as the primary fix.

---

# Phase 12 — Final Validation and Release Gate

## Task 12.1 — Full quality gate

Run:

```bash
yarn lint
yarn typecheck
yarn test
```

Then run the actual Android debug and release builds.

- [ ] Lint passes.
- [ ] Typecheck passes.
- [ ] Unit tests pass.
- [ ] Integration tests pass.
- [ ] Android debug build passes.
- [ ] Android release build passes.
- [ ] App installs.
- [ ] Cold launch opens Server.
- [ ] Sidebar contains Server and Chat.
- [ ] Model loads.
- [ ] Server starts.
- [ ] LAN client connects.
- [ ] Streaming works.
- [ ] Server stops cleanly.

## Task 12.2 — Regression pass

Verify:

- [ ] Normal Chat still works.
- [ ] Chat streaming still works.
- [ ] Stop generation still works.
- [ ] Models can be downloaded/imported.
- [ ] Models load/unload.
- [ ] Pals work.
- [ ] Settings persist.
- [ ] Benchmark screen works.
- [ ] TTS still works where previously supported.
- [ ] App data survives upgrade.

## Task 12.3 — Security release gate

- [ ] No committed API keys.
- [ ] No credentials in examples.
- [ ] No full prompts in default logs.
- [ ] Auth defaults are safe.
- [ ] Public exposure warning exists.
- [ ] Request limits are active.
- [ ] Admin/stop endpoint is absent or protected.
- [ ] Dependencies and licenses reviewed.

## Task 12.4 — Final acceptance scenario

Perform this exact scenario:

1. Install the app on a physical Android phone.
2. Launch it.
3. Confirm Server opens by default.
4. Open the sidebar and confirm Server and Chat are present.
5. Load a GGUF model.
6. Start the server in LAN mode with authentication enabled.
7. Copy the LAN URL and API key.
8. From a second device, run:

```bash
curl -N http://PHONE_IP:PORT/v1/chat/completions \
  -H "Authorization: Bearer API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "local-model",
    "messages": [
      {"role": "user", "content": "Reply with exactly: PocketServer works"}
    ],
    "stream": true
  }'
```

9. Confirm incremental SSE output.
10. Confirm final `[DONE]`.
11. Confirm the app request log contains a sanitized successful request.
12. Stop the server.
13. Confirm the endpoint is no longer reachable.
14. Open Chat and confirm local chat still works.

The implementation is not complete until this scenario passes or a specific evidenced blocker is documented.
