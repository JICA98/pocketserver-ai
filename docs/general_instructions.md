# PocketServer AI — General Implementation Instructions

## 1. Project Goal

Transform the `JICA98/pocketserver-ai` fork of PocketPal AI into an on-device LLM server application while retaining PocketPal's existing local model, chat, model-management, settings, and inference capabilities.

The finished app must:

1. Open on a new **Server** screen by default instead of opening on Chat.
2. Add a permanent **Server** destination to the existing sidebar/drawer.
3. Serve the currently loaded local model through an HTTP API.
4. Support access through:
   - `localhost` / loopback on the phone.
   - The phone's local network IP.
   - Internet tunnels or reverse proxies.
5. Provide an OpenAI-compatible API wherever practical.
6. Keep the existing Chat UI available from the sidebar.
7. Match the existing PocketPal visual language, theme, spacing, components, and interaction patterns.
8. Work without requiring a paid cloud service.
9. Avoid weakening the app's existing local/offline behavior when the server is disabled.

Original upstream:

- `https://github.com/a-ghorbani/pocketpal-ai`

Target fork:

- `https://github.com/JICA98/pocketserver-ai`

---

## 2. Mandatory Working Rules

### 2.1 Inspect before editing

Before making changes, inspect the current fork and identify:

- Navigation root and drawer configuration.
- Initial/default route.
- Chat screen and chat inference flow.
- Model store and model-loading lifecycle.
- `llama.rn` context ownership.
- Existing completion, streaming, cancellation, and formatting functions.
- MobX store conventions.
- Existing services, hooks, theme utilities, localization system, and tests.
- Android and iOS native project configuration.
- Whether the fork already contains partial server code.

Do not assume that upstream file paths, component names, or APIs still match the fork.

### 2.2 Reuse the existing inference pipeline

The server must not create an unrelated second inference implementation unless technically unavoidable.

Reuse the same:

- Loaded model.
- Model settings.
- Prompt/chat template behavior.
- Token streaming mechanism.
- Stop sequences.
- Context and generation parameters.
- Cancellation handling.
- Resource cleanup.
- Error mapping.

Introduce a shared inference coordinator if Chat and Server currently call model inference directly in incompatible ways.

### 2.3 Preserve existing features

Do not remove or regress:

- Chat.
- Model download/import/load/unload.
- Pals.
- Benchmarking.
- Settings.
- TTS.
- Tool/talent behavior.
- Existing database data.
- Existing theme and localization behavior.

Server work must be additive.

### 2.4 Make focused changes

Avoid broad refactors unrelated to the server feature. Do not rename large parts of the project merely for style consistency.

Every changed file must have a clear connection to:

- Server runtime.
- Server UI.
- Navigation.
- Shared inference safety.
- Tests.
- Required native configuration.
- Documentation.

### 2.5 Cross-platform expectations

Implement Android fully.

Keep TypeScript and shared UI code portable to iOS. Where iOS cannot support the same background or networking behavior, expose a clear capability state instead of crashing or silently failing.

Do not claim background server availability on a platform unless it has been tested.

---

## 3. Functional Scope

## 3.1 Server screen

Create a first-class Server screen that becomes the app's default landing screen.

The screen must include:

- Current server state:
  - Stopped.
  - Starting.
  - Running.
  - Stopping.
  - Error.
- Loaded model name.
- Clear warning when no model is loaded.
- Start Server button.
- Stop Server button.
- Restart Server action.
- Host/bind mode.
- Port.
- Local URL.
- LAN URL.
- Public tunnel URL when available.
- Copy buttons for URLs.
- Share action where supported.
- API key/authentication controls.
- Active request count.
- Current generation status.
- Basic counters:
  - Requests served.
  - Failed requests.
  - Tokens generated when available.
- Recent request log.
- Expandable advanced settings.
- Troubleshooting/help section.

The screen must use the project's existing design system and must look like a native PocketPal screen, not a web admin dashboard embedded in the app.

## 3.2 Default route and sidebar

Change app startup behavior so that:

- A normal cold launch opens Server.
- Server is available in the sidebar/drawer.
- Chat remains available in the sidebar.
- Existing deep links continue to route to their intended destination.
- Notification/deep-link navigation must not be overridden by the default Server route.
- State restoration must not produce a blank or invalid screen.

Use a route name such as `Server`, following current project naming conventions.

## 3.3 HTTP API

Implement an HTTP server hosted by the mobile app.

Minimum routes:

- `GET /`
- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/completions`

Recommended additional routes:

- `GET /version`
- `GET /metrics`
- `POST /api/server/stop`, only if safely restricted to local/authenticated callers.
- `POST /v1/embeddings` only if the loaded model and current inference stack genuinely support embeddings.

Do not expose a fake endpoint that returns fabricated success.

## 3.4 OpenAI-compatible behavior

`POST /v1/chat/completions` should accept commonly used OpenAI fields:

- `model`
- `messages`
- `stream`
- `temperature`
- `top_p`
- `max_tokens`
- `stop`
- `frequency_penalty`
- `presence_penalty`
- `seed`
- `response_format`
- `tools`
- `tool_choice`

Unsupported fields must be ignored safely or rejected with a clear OpenAI-style error. They must never crash the app.

Response shape should use:

- `id`
- `object`
- `created`
- `model`
- `choices`
- `usage`

Streaming should use Server-Sent Events:

- `Content-Type: text/event-stream`
- `data: {json}\n\n`
- Final `data: [DONE]\n\n`

Client disconnects must cancel or detach safely from generation.

## 3.5 Concurrency policy

On-device inference generally cannot safely handle unrestricted parallel generations.

Implement an explicit policy:

- Default maximum active generation requests: `1`.
- Additional requests are queued or rejected with HTTP `429`.
- The UI shows active and queued requests.
- A configurable queue limit may be added.
- Server requests and in-app Chat requests must use the same inference lock/coordinator.
- Model unload/reload must be blocked while generation is active, or active work must be cancelled safely.

Never allow simultaneous access to a non-thread-safe model context.

## 3.6 Bind modes

Provide at least:

### Localhost only

- Bind to `127.0.0.1`.
- Intended for clients running on the same device.
- Lowest exposure.

### Local network

- Bind to `0.0.0.0` or the correct platform equivalent.
- Display the reachable LAN address, for example:
  - `http://192.168.1.20:8080`
- Explain that client and phone normally need to be on the same network.
- Detect IP changes and refresh the displayed URL.

Never label `0.0.0.0` itself as the client URL.

## 3.7 Authentication and network safety

Authentication must be enabled by default for LAN and tunnel modes.

Implement:

- Generated API key.
- Regenerate key action.
- Copy key action.
- Optional manual key entry.
- `Authorization: Bearer <key>`.
- Constant-time comparison where available.
- No API key in normal logs.
- Masked API key in UI.
- Warning before disabling authentication.
- Separate preference for localhost-only unauthenticated access, if desired.

Also implement:

- Request body size limit.
- Header size protection when supported.
- Generation timeout.
- Idle connection timeout.
- Maximum prompt/context validation.
- Rate limiting or basic request throttling.
- Strict error handling.
- No arbitrary file serving.
- No directory traversal.
- No remote model import or arbitrary path loading through server endpoints.
- CORS configuration.

Recommended CORS defaults:

- Disabled or restrictive by default.
- Configurable allowed origins.
- Do not combine `*` origin with credentials.
- Handle `OPTIONS` correctly.

## 3.8 Tunnel support

The app must be usable with modern tunnelling or reverse-proxy tools without hard-wiring the whole design to one vendor.

Implement a tunnel-provider abstraction with states such as:

- Disabled.
- External/manual tunnel.
- Cloudflare Quick Tunnel.
- Provider command/instructions only.
- Connected.
- Reconnecting.
- Error.

The first production milestone may support **manual/external tunnels** by displaying the local port and setup guidance. Native embedded tunnel support should only be added when it is reliable and legally/licensing compatible.

Acceptable free or commonly available approaches to document/test include:

- Cloudflare Tunnel / Quick Tunnel.
- Tailscale Funnel, subject to account and plan availability.
- Pinggy.
- localhost.run.
- Bore or an equivalent self-hosted tunnel.
- ADB reverse for development.
- SSH reverse tunnelling where the user controls a server.

Do not:

- Bundle unknown third-party tunnel binaries without reviewing license, architecture support, update path, and security.
- Ship user credentials inside the app.
- Assume free provider terms will remain unchanged.
- Treat a public tunnel as safe without API authentication.

The Server UI should support a manual public URL field so that users can paste the URL created by an external tunnel client.

## 3.9 Background operation

For Android, determine whether the chosen HTTP server can continue while the app is backgrounded.

If background serving is implemented:

- Use a foreground service.
- Show a persistent notification while the server is running.
- Include a Stop action.
- Use a clear notification channel.
- Respect Android background execution restrictions.
- Acquire a wake lock only when necessary.
- Prefer Wi-Fi lock only when justified.
- Release all locks when stopped.
- Survive Activity recreation.
- Restore UI state after process/activity lifecycle changes.
- Do not silently auto-start after reboot unless the user explicitly enables it.

If background serving is not implemented in the first milestone:

- State this clearly in the UI.
- Stop or pause safely when the app can no longer serve.
- Do not show a misleading Running state.

## 3.10 Model lifecycle

Server state must react to model lifecycle events:

- No loaded model:
  - Server may run only for health/status routes, or Start is disabled.
  - Completion endpoints return a clear `503`.
- Model loading:
  - Completion requests return `503` or wait according to an explicit policy.
- Model loaded:
  - Completion endpoints become ready.
- Model unloading:
  - Stop accepting new generation requests.
  - Finish or cancel active generation safely.
- Model error:
  - Surface the reason in UI and API response.

`GET /health` should distinguish:

- HTTP server alive.
- Model loaded.
- Inference ready.
- Busy.
- Error.

## 3.11 Persistence

Persist user preferences, not transient runtime objects.

Persist:

- Port.
- Bind mode.
- Authentication enabled.
- API key in secure storage.
- CORS settings.
- Queue limit.
- Timeout settings.
- Manual public URL.
- Background-mode preference.
- Last selected tunnel mode.

Do not persist:

- Open sockets.
- Active request objects.
- Raw generation callbacks.
- Unredacted secrets in AsyncStorage.
- Stale Running state after process death.

On app startup, runtime state must begin from a truthful state.

---

## 4. Architecture Guidance

Use names that match the existing repository conventions. A reasonable target structure is:

```text
src/
  screens/
    ServerScreen/
      ServerScreen.tsx
      components/
      hooks/
      styles.ts
  store/
    ServerStore.ts
  services/
    server/
      ServerController.ts
      HttpServerAdapter.ts
      routes/
        health.ts
        models.ts
        chatCompletions.ts
        completions.ts
      openai/
        requestValidation.ts
        responseMapping.ts
        streamEncoder.ts
        errors.ts
      auth/
      network/
      tunnel/
      logging/
  services/
    inference/
      InferenceCoordinator.ts
  specs/
    server.ts
```

This is guidance, not a command to create duplicate abstractions. Adapt to the actual repository.

### 4.1 ServerStore

The MobX server store should own serializable UI/runtime state such as:

- Status.
- Config.
- Reachable URLs.
- Statistics.
- Recent sanitized logs.
- Validation errors.
- Capability flags.

It should delegate socket and native operations to a service/controller.

### 4.2 ServerController

The controller should own:

- Start/stop lifecycle.
- Route registration.
- Request cancellation.
- Runtime references.
- Native service integration.
- Cleanup.
- Network-change handling.
- Store updates.

Starting and stopping must be idempotent.

### 4.3 InferenceCoordinator

Use one coordinator for both in-app Chat and HTTP requests.

Responsibilities:

- Mutual exclusion or queueing.
- Request IDs.
- Cancellation.
- Model readiness check.
- Parameter normalization.
- Prompt construction.
- Streaming callbacks.
- Usage accounting.
- Cleanup in `finally`.
- Safe model reload/unload coordination.

Do not duplicate model context ownership inside the server layer.

### 4.4 HTTP implementation selection

Before adding a dependency, compare viable React Native/native HTTP server choices for:

- Android support.
- iOS support.
- New Architecture compatibility.
- Streaming/SSE.
- Request body handling.
- Maintenance status.
- License.
- Native binary size.
- Foreground-service compatibility.
- IPv4/IPv6 behavior.
- TLS support.
- Open issues.

Record the decision in code comments or an architecture note.

Do not select a library solely because its README contains a minimal example.

---

## 5. UI/UX Requirements

Follow the existing theme and component patterns.

Required UI behavior:

- Starting disables duplicate Start taps.
- Stopping disables duplicate Stop taps.
- Invalid ports show inline validation.
- Changing bind/port while running prompts for or performs a controlled restart.
- Copy actions provide feedback.
- Public exposure warnings are prominent but not obstructive.
- Advanced settings are collapsed by default.
- Logs redact authorization headers and secrets.
- Long URLs wrap or truncate cleanly.
- Tablet layout remains usable.
- Dark and light themes both work.
- Accessibility labels exist for important controls.
- Status must not be indicated by color alone.

Suggested sections:

1. Server status.
2. Model.
3. Connection addresses.
4. Access and authentication.
5. Public access/tunnel.
6. Runtime options.
7. Activity and logs.
8. API examples.
9. Help.

Include copyable examples for:

```bash
curl http://PHONE_IP:PORT/health
```

and:

```bash
curl http://PHONE_IP:PORT/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "local-model",
    "messages": [
      {"role": "user", "content": "Hello"}
    ],
    "stream": true
  }'
```

Never place the real API key in screenshots, tests, fixtures, or committed documentation.

---

## 6. Error Contract

Use consistent JSON errors, preferably OpenAI-compatible:

```json
{
  "error": {
    "message": "No model is currently loaded.",
    "type": "server_unavailable",
    "param": null,
    "code": "model_not_loaded"
  }
}
```

Map at least:

- Invalid JSON: `400`.
- Invalid parameters: `400`.
- Unauthorized: `401`.
- Forbidden bind/admin operation: `403`.
- Unknown route: `404`.
- Payload too large: `413`.
- Too many requests / queue full: `429`.
- Client cancelled: non-error cleanup or appropriate platform behavior.
- Model not loaded: `503`.
- Server/inference initialization failure: `503`.
- Internal inference failure: `500`.
- Request timeout: `504`.

Do not expose native stack traces, absolute device paths, secrets, or full prompt contents in production responses.

---

## 7. Logging and Privacy

Provide sanitized recent logs in the UI.

A log entry may contain:

- Timestamp.
- Request ID.
- Method.
- Route.
- HTTP status.
- Duration.
- Streaming/non-streaming.
- Approximate input/output token count.
- Client IP, optionally masked/configurable.

A log entry must not contain by default:

- Authorization header.
- API key.
- Full request body.
- Full prompt.
- Full model response.
- Sensitive filesystem paths.
- Tunnel credentials.

Allow logs to be cleared.

---

## 8. Testing Requirements

Add automated tests for logic that can be tested without a physical device.

Minimum tests:

- Default route is Server.
- Server drawer item exists.
- Port validation.
- Bind-mode configuration.
- Auth enabled/disabled behavior.
- Bearer token parsing.
- Secret redaction.
- OpenAI request validation.
- Non-streaming response mapping.
- SSE chunk encoding.
- `[DONE]` termination.
- Model-not-loaded response.
- Queue full behavior.
- Request cancellation cleanup.
- Start/stop idempotency.
- State reset after process/runtime restart.
- CORS preflight behavior.
- Error response formatting.

Add integration/manual test instructions for:

- Android emulator.
- Physical Android phone.
- Localhost.
- Same Wi-Fi network.
- Mobile hotspot.
- VPN present.
- IPv6-only or mixed network where available.
- Screen off/background.
- App Activity recreation.
- Model unload during request.
- Client disconnect during streaming.
- Tunnel URL.
- Two competing clients.
- Very large request rejection.

---

## 9. Validation Commands

Use the repository's actual package manager and scripts. At minimum, run the equivalent of:

```bash
yarn lint
yarn typecheck
yarn test
```

Also run:

```bash
yarn android
```

or the project's actual Android build command.

When native code or native dependencies change:

- Clean/rebuild Android as required.
- Reinstall pods and build iOS where possible.
- Verify New Architecture compatibility.
- Verify release build, not only Metro debug mode.

Do not mark a task complete merely because TypeScript compiles.

---

## 10. Deliverable Standard

A task is complete only when:

- The feature is implemented.
- Existing functionality is preserved.
- Relevant tests are added.
- Typecheck, lint, and tests pass.
- Android build passes.
- Manual verification evidence is recorded.
- No API keys or secrets are committed.
- Documentation explains how to connect from another device.
- Known limitations are explicit.
- The app opens to Server by default.
- Server appears in the sidebar.
- A real client can obtain a streamed response from the loaded on-device model.

When blocked, document:

1. Exact blocker.
2. Evidence.
3. Files inspected.
4. Commands run.
5. Smallest reproducible failure.
6. Recommended next action.

Do not hide incomplete behavior behind mocked success states.
