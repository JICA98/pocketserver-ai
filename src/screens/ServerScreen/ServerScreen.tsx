/* eslint-disable react/no-unstable-nested-components, react-native/no-inline-styles */
import React, {useState} from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Clipboard,
  Alert,
  Share,
} from 'react-native';
import {Text, Button, Divider, Switch} from 'react-native-paper';
import {observer} from 'mobx-react-lite';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  PlayIcon,
  StopIcon,
  CopyIcon,
  RefreshIcon,
  EyeIcon,
  EyeOffIcon,
} from '../../assets/icons';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {localServerStore} from '../../store/LocalServerStore';
import {modelStore} from '../../store';
import {LocalServerStatus} from '../../utils/localServerTypes';
import {ChatPalModelPickerSheet} from '../../components';

// ---------------------------------------------------------------------------
// Status colour helper
// ---------------------------------------------------------------------------
function getStatusColor(status: LocalServerStatus): string {
  switch (status) {
    case 'running':
      return '#4CAF50';
    case 'starting':
    case 'stopping':
      return '#FFC107';
    case 'error':
      return '#F44336';
    default:
      return '#9E9E9E';
  }
}

function statusLabel(status: LocalServerStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ---------------------------------------------------------------------------
// ServerScreen — wired to localServerStore
// ---------------------------------------------------------------------------
export const ServerScreen: React.FC = observer(() => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, insets);

  const [showApiKey, setShowApiKey] = useState(false);
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [advancedCollapsed, setAdvancedCollapsed] = useState(true);
  const [examplesCollapsed, setExamplesCollapsed] = useState(false);
  const [portText, setPortText] = useState(String(localServerStore.config.port));
  const [manualUrlText, setManualUrlText] = useState(
    localServerStore.config.manualPublicUrl ?? '',
  );

  const store = localServerStore;
  const isRunning = store.status === 'running';
  const isBusy = store.status === 'starting' || store.status === 'stopping';

  // ---- Handlers ----
  const handleStart = () => {
    store.start();
  };

  const handleStop = () => {
    store.stop();
  };

  const handleRestart = () => {
    store.restart();
  };

  const handleCopy = (text: string, label: string) => {
    Clipboard.setString(text);
    Alert.alert('Copied', `${label} copied to clipboard.`);
  };

  const handleShare = (url: string) => {
    Share.share({message: url}).catch(() => {});
  };

  const handleRegenerateKey = () => {
    Alert.alert(
      'Regenerate API Key',
      'Regenerating will disconnect all clients using the old key. Continue?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: () => store.regenerateApiKey(),
        },
      ],
    );
  };

  const handlePortBlur = () => {
    const n = parseInt(portText, 10);
    if (!isNaN(n) && n >= 1024 && n <= 65535) {
      store.updateConfig({port: n});
    } else {
      setPortText(String(store.config.port));
    }
  };

  const handleManualUrlBlur = () => {
    store.setManualPublicUrl(manualUrlText.trim());
  };

  const handleClearLogs = () => {
    store.clearLogs();
  };

  // ---- Derived state ----
  const localUrl = store.runtimeInfo.localUrl;
  const lanUrl = store.runtimeInfo.lanUrl;
  const publicUrl = store.runtimeInfo.publicUrl;
  const baseUrl = isRunning ? localUrl : 'http://127.0.0.1:8080';
  const apiKeyDisplay = showApiKey
    ? store.apiKey
    : '••••••••••••••••••••••••••';
  const authHeader = store.config.authEnabled
    ? `-H "Authorization: Bearer ${showApiKey ? store.apiKey : '<YOUR_API_KEY>'}"`
    : '';

  // ---- Examples (dynamic from config) ----
  const exampleHealth = `curl ${baseUrl}/health`;
  const exampleChat = `curl ${baseUrl}/v1/chat/completions \\
  ${authHeader ? authHeader + ' \\' : ''}
  -H "Content-Type: application/json" \\
  -d '{"model":"local-model","messages":[{"role":"user","content":"Hello!"}]}'`;
  const exampleStream = `curl -N ${baseUrl}/v1/chat/completions \\
  ${authHeader ? authHeader + ' \\' : ''}
  -H "Content-Type: application/json" \\
  -d '{"model":"local-model","messages":[{"role":"user","content":"Hello!"}],"stream":true}'`;
  const examplePython = `from openai import OpenAI
client = OpenAI(base_url="${baseUrl}/v1", api_key="${store.config.authEnabled ? '<YOUR_API_KEY>' : 'none'}")
resp = client.chat.completions.create(
    model="local-model",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(resp.choices[0].message.content)`;
  const exampleJS = `import OpenAI from "openai";
const client = new OpenAI({ baseURL: "${baseUrl}/v1", apiKey: "${store.config.authEnabled ? '<YOUR_API_KEY>' : 'none'}" });
const resp = await client.chat.completions.create({
  model: "local-model",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(resp.choices[0].message.content);`;

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.container}>

        {/* ── Status Header ── */}
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.statusHeader}>
              <View
                style={[
                  styles.statusDot,
                  {backgroundColor: getStatusColor(store.status)},
                ]}
              />
              <View>
                <Text style={styles.title}>PocketServer AI</Text>
                <Text style={styles.subtitle}>
                  Status: {statusLabel(store.status)}
                </Text>
              </View>
            </View>
          </View>

          {store.lastError ? (
            <View
              style={{
                backgroundColor: '#F4433622',
                padding: 8,
                borderRadius: 8,
              }}>
              <Text style={{color: '#F44336', fontSize: 12}}>
                Error: {store.lastError}
              </Text>
            </View>
          ) : null}

          <View style={styles.buttonContainer}>
            {store.status === 'stopped' || store.status === 'error' ? (
              <Button
                mode="contained"
                icon={() => <PlayIcon stroke={theme.colors.onPrimary} />}
                onPress={handleStart}
                style={styles.button}
                buttonColor={theme.colors.primary}
                disabled={isBusy || !store.isModelReady}>
                Start Server
              </Button>
            ) : (
              <>
                <Button
                  mode="contained"
                  icon={() => <StopIcon stroke={theme.colors.onPrimary} />}
                  onPress={handleStop}
                  style={styles.button}
                  buttonColor={theme.colors.error}
                  disabled={isBusy}>
                  Stop
                </Button>
                <Button
                  mode="outlined"
                  icon={() => <RefreshIcon stroke={theme.colors.primary} />}
                  onPress={handleRestart}
                  style={styles.button}
                  disabled={isBusy}>
                  Restart
                </Button>
              </>
            )}
          </View>
        </View>

        {/* ── Host Bind Mode ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Host Bind Mode</Text>
          <Text style={styles.caption}>
            Localhost: only reachable from this device.{'\n'}
            Local Network: reachable from other devices on the same Wi-Fi.
          </Text>
          <View style={{flexDirection: 'row', gap: 8, marginTop: 8}}>
            <Button
              mode={
                store.config.bindMode === 'localhost' ? 'contained' : 'outlined'
              }
              onPress={() => store.updateConfig({bindMode: 'localhost'})}
              style={{flex: 1}}
              disabled={isRunning}>
              Localhost
            </Button>
            <Button
              mode={store.config.bindMode === 'lan' ? 'contained' : 'outlined'}
              onPress={() => store.updateConfig({bindMode: 'lan'})}
              style={{flex: 1}}
              disabled={isRunning}>
              LAN
            </Button>
          </View>

          {/* Port (visible here so a stuck port can be changed easily) */}
          <View style={{marginTop: 12}}>
            <Text style={styles.subtitle}>Server Port</Text>
            <TextInput
              value={portText}
              onChangeText={setPortText}
              onBlur={handlePortBlur}
              keyboardType="numeric"
              style={styles.textInput}
              editable={!isRunning}
            />
            {store.validationErrors.port ? (
              <Text style={{color: '#F44336', fontSize: 12, marginTop: 4}}>
                {store.validationErrors.port}
              </Text>
            ) : null}
            <Text style={[styles.caption, {marginTop: 4}]}>
              If “port already in use” appears, change to another port (e.g.
              8081) — the app will also auto-bump the port on Start.
            </Text>
          </View>
        </View>

        {/* ── Active Model ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Active Model</Text>
          {modelStore.isContextLoading && modelStore.loadingModel ? (
            <View style={{padding: 8}}>
              <Text style={[styles.subtitle, {color: '#FFC107'}]}>
                Loading {modelStore.loadingModel.name}...
              </Text>
              <Text style={styles.caption}>
                Please wait while the model initializes
              </Text>
            </View>
          ) : store.isModelReady && store.loadedModelName ? (
            <View>
              <Text style={styles.subtitle}>{store.loadedModelName}</Text>
              <Text style={styles.caption}>Ready for local inference</Text>
            </View>
          ) : (
            <View
              style={{
                backgroundColor: '#F4433622',
                padding: 8,
                borderRadius: 8,
              }}>
              <Text style={{color: '#F44336', fontWeight: 'bold'}}>
                No Model Loaded
              </Text>
              <Text style={styles.caption}>
                Load a GGUF model before starting the server.
              </Text>
              <Button
                mode="contained"
                buttonColor="#F44336"
                textColor="#FFF"
                style={{marginTop: 8}}
                onPress={() => setIsPickerVisible(true)}>
                Select Model
              </Button>
            </View>
          )}
        </View>

        {/* ── Connection Addresses (visible once running) ── */}
        {isRunning && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Connection Addresses</Text>

            {/* Local */}
            <View style={styles.addressCard}>
              <Text style={styles.addressText} numberOfLines={1}>
                Localhost: {localUrl}
              </Text>
              <View style={{flexDirection: 'row', gap: 8}}>
                <TouchableOpacity onPress={() => handleCopy(localUrl, 'Local URL')}>
                  <CopyIcon stroke={theme.colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleShare(localUrl)}>
                  <RefreshIcon stroke={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* LAN */}
            {lanUrl ? (
              <View style={styles.addressCard}>
                <Text style={styles.addressText} numberOfLines={1}>
                  Local Network: {lanUrl}
                </Text>
                <View style={{flexDirection: 'row', gap: 8}}>
                  <TouchableOpacity onPress={() => handleCopy(lanUrl, 'LAN URL')}>
                    <CopyIcon stroke={theme.colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleShare(lanUrl)}>
                    <RefreshIcon stroke={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : store.config.bindMode === 'lan' ? (
              <View
                style={{
                  backgroundColor: '#FFC10722',
                  padding: 8,
                  borderRadius: 8,
                  marginTop: 4,
                }}>
                <Text style={{color: '#B8860B', fontSize: 12}}>
                  LAN mode is on, but the Wi-Fi IP could not be discovered.
                  Make sure Wi-Fi is connected and Android Settings → Apps →
                  PocketServer AI → Permissions has Wi-Fi / Local Network
                  access enabled. Then restart the server.
                </Text>
              </View>
            ) : (
              <View
                style={{
                  backgroundColor: '#2196F322',
                  padding: 8,
                  borderRadius: 8,
                  marginTop: 4,
                }}>
                <Text style={{color: '#1565C0', fontSize: 12}}>
                  Server is in Localhost mode — only reachable from this
                  device. Stop the server and switch to LAN in Host Bind Mode
                  below to also expose it on Wi-Fi (e.g.
                  http://192.168.x.x:8080).
                </Text>
              </View>
            )}

            {/* Public / tunnel */}
            {publicUrl ? (
              <View style={styles.addressCard}>
                <Text style={styles.addressText} numberOfLines={1}>
                  Public Tunnel: {publicUrl}
                </Text>
                <View style={{flexDirection: 'row', gap: 8}}>
                  <TouchableOpacity onPress={() => handleCopy(publicUrl, 'Public URL')}>
                    <CopyIcon stroke={theme.colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleShare(publicUrl)}>
                    <RefreshIcon stroke={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        )}

        {/* ── Stats ── */}
        {isRunning && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Stats</Text>
            <View style={[styles.row, {flexWrap: 'wrap', gap: 8}]}>
              <View style={styles.statChip}>
                <Text style={styles.statValue}>{store.activeRequests}</Text>
                <Text style={styles.statLabel}>Active</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statValue}>{store.queuedRequests}</Text>
                <Text style={styles.statLabel}>Queued</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statValue}>{store.stats.requestsServed}</Text>
                <Text style={styles.statLabel}>Served</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statValue}>{store.stats.requestsFailed}</Text>
                <Text style={styles.statLabel}>Failed</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statValue}>{store.stats.tokensGenerated}</Text>
                <Text style={styles.statLabel}>Tokens</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Authentication ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Access & Authentication</Text>

          <View style={styles.row}>
            <Text style={styles.subtitle}>Require API Key</Text>
            <Switch
              value={store.config.authEnabled}
              onValueChange={val =>
                store.updateConfig({authEnabled: val})
              }
              disabled={isRunning}
            />
          </View>

          {store.config.authEnabled && (
            <View style={styles.apiKeyContainer}>
              <Text style={styles.apiKeyText} numberOfLines={1}>
                {apiKeyDisplay}
              </Text>
              <View style={{flexDirection: 'row', gap: 12}}>
                <TouchableOpacity onPress={() => setShowApiKey(!showApiKey)}>
                  {showApiKey ? (
                    <EyeOffIcon stroke={theme.colors.primary} />
                  ) : (
                    <EyeIcon stroke={theme.colors.primary} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleCopy(store.apiKey, 'API Key')}>
                  <CopyIcon stroke={theme.colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRegenerateKey}>
                  <RefreshIcon stroke={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {store.validationErrors.apiKey ? (
            <Text style={{color: '#F44336', fontSize: 12}}>
              {store.validationErrors.apiKey}
            </Text>
          ) : null}
        </View>

        {/* ── Tunnel Configuration ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Tunnel / Public Access</Text>
          <Text style={styles.caption}>
            Run an external tunnel tool (e.g. Cloudflare, Tailscale, SSH) on a PC that
            forwards to this device's port {store.config.port}. Paste the public URL
            below.
          </Text>

          <View style={styles.row}>
            <Text style={styles.subtitle}>Enable Manual Tunnel URL</Text>
            <Switch
              value={store.config.tunnelMode === 'manual'}
              onValueChange={val =>
                store.updateConfig({tunnelMode: val ? 'manual' : 'disabled'})
              }
            />
          </View>

          {store.config.tunnelMode === 'manual' && (
            <View>
              <Text style={[styles.subtitle, {marginBottom: 4}]}>
                Public URL (https://... or http://...)
              </Text>
              <TextInput
                value={manualUrlText}
                onChangeText={setManualUrlText}
                onBlur={handleManualUrlBlur}
                placeholder="https://my-tunnel.example.com"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                autoCapitalize="none"
                keyboardType="url"
                style={styles.textInput}
              />
              {store.validationErrors.manualPublicUrl ? (
                <Text style={{color: '#F44336', fontSize: 12, marginTop: 4}}>
                  {store.validationErrors.manualPublicUrl}
                </Text>
              ) : null}
              <Text style={[styles.caption, {marginTop: 6}]}>
                ⚠️ Keep authentication enabled when using a public tunnel. Anyone
                with the URL can reach your device's LLM otherwise.
              </Text>
            </View>
          )}

          <View style={[styles.card, {backgroundColor: theme.colors.surfaceContainerHigh, padding: 10, gap: 4}]}>
            <Text style={[styles.subtitle, {fontWeight: 'bold'}]}>Free Tunnel Options</Text>
            <Text style={styles.caption}>
              {'• Cloudflare Quick Tunnel (PC):\n  cloudflared tunnel --url http://localhost:' + store.config.port}
            </Text>
            <Text style={styles.caption}>
              {'• Tailscale Funnel (PC):\n  tailscale funnel ' + store.config.port}
            </Text>
            <Text style={styles.caption}>
              {'• SSH Reverse Tunnel (any host):\n  ssh -R 0:localhost:' + store.config.port + ' serveo.net'}
            </Text>
            <Text style={styles.caption}>
              {'• ngrok (PC):\n  ngrok http ' + store.config.port}
            </Text>
            <Text style={[styles.caption, {marginTop: 4, fontStyle: 'italic'}]}>
              The tunnel runs on a separate PC/host and forwards traffic here. Always
              enable API key auth when exposing publicly. Free tiers may change.
            </Text>
          </View>
        </View>

        {/* ── Advanced Settings ── */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => setAdvancedCollapsed(!advancedCollapsed)}>
            <Text style={styles.sectionTitle}>Advanced Settings</Text>
            <Text style={{color: theme.colors.primary}}>
              {advancedCollapsed ? 'Show' : 'Hide'}
            </Text>
          </TouchableOpacity>

          {!advancedCollapsed && (
            <View style={{gap: theme.spacing.default}}>
              <Divider />

              {/* Capabilities */}
              <View
                style={{
                  backgroundColor: theme.colors.surfaceContainerHigh,
                  padding: 10,
                  borderRadius: 8,
                }}>
                <Text style={[styles.subtitle, {fontWeight: 'bold', marginBottom: 4}]}>
                  Capability Limitations
                </Text>
                <Text style={styles.caption}>
                  • Tool calls: not supported (returns 400){'\n'}
                  • Embeddings: not supported{'\n'}
                  • Vision / multimodal: not supported{'\n'}
                  • Concurrent generation: 1 active (queue depth {store.config.queueLimit})
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Activity Logs ── */}
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.sectionTitle}>
              Activity Logs{' '}
              {isRunning
                ? `· ${store.activeRequests} active · ${store.queuedRequests} queued`
                : ''}
            </Text>
            {store.logs.length > 0 && (
              <TouchableOpacity onPress={handleClearLogs}>
                <Text style={{color: theme.colors.error}}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.logConsole}>
            <ScrollView nestedScrollEnabled>
              {store.logs.length === 0 ? (
                <Text style={styles.emptyLogText}>No activity logs yet</Text>
              ) : (
                [...store.logs].reverse().map(log => (
                  <Text
                    key={log.id}
                    style={[
                      styles.logText,
                      log.error ? {color: '#FF6B6B'} : undefined,
                    ]}>
                    [{log.timestamp}] {log.method} {log.route} →{' '}
                    {log.status}
                    {log.duration > 0 ? ` (${log.duration}ms)` : ''}
                    {log.error ? ` ⚠ ${log.error}` : ''}
                  </Text>
                ))
              )}
            </ScrollView>
          </View>
        </View>

        {/* ── API Examples ── */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => setExamplesCollapsed(!examplesCollapsed)}>
            <Text style={styles.sectionTitle}>API Examples</Text>
            <Text style={{color: theme.colors.primary}}>
              {examplesCollapsed ? 'Show' : 'Hide'}
            </Text>
          </TouchableOpacity>

          {!examplesCollapsed && (
            <View style={{gap: theme.spacing.default}}>
              <Divider />

              {/* Health */}
              <View>
                <View style={styles.row}>
                  <Text style={styles.subtitle}>Health Check</Text>
                  <TouchableOpacity
                    onPress={() => handleCopy(exampleHealth, 'Health curl')}>
                    <CopyIcon stroke={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.exampleCodeContainer}>
                  <Text style={styles.exampleCodeText} selectable>
                    {exampleHealth}
                  </Text>
                </View>
              </View>

              {/* Chat completion */}
              <View>
                <View style={styles.row}>
                  <Text style={styles.subtitle}>Chat Completion</Text>
                  <TouchableOpacity
                    onPress={() => handleCopy(exampleChat, 'Chat curl')}>
                    <CopyIcon stroke={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.exampleCodeContainer}>
                  <Text style={styles.exampleCodeText} selectable>
                    {exampleChat}
                  </Text>
                </View>
              </View>

              {/* Streaming */}
              <View>
                <View style={styles.row}>
                  <Text style={styles.subtitle}>Streaming</Text>
                  <TouchableOpacity
                    onPress={() => handleCopy(exampleStream, 'Streaming curl')}>
                    <CopyIcon stroke={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.exampleCodeContainer}>
                  <Text style={styles.exampleCodeText} selectable>
                    {exampleStream}
                  </Text>
                </View>
              </View>

              {/* Python */}
              <View>
                <View style={styles.row}>
                  <Text style={styles.subtitle}>Python (openai SDK)</Text>
                  <TouchableOpacity
                    onPress={() => handleCopy(examplePython, 'Python example')}>
                    <CopyIcon stroke={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.exampleCodeContainer}>
                  <Text style={styles.exampleCodeText} selectable>
                    {examplePython}
                  </Text>
                </View>
              </View>

              {/* JavaScript */}
              <View>
                <View style={styles.row}>
                  <Text style={styles.subtitle}>JavaScript (openai SDK)</Text>
                  <TouchableOpacity
                    onPress={() => handleCopy(exampleJS, 'JS example')}>
                    <CopyIcon stroke={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.exampleCodeContainer}>
                  <Text style={styles.exampleCodeText} selectable>
                    {exampleJS}
                  </Text>
                </View>
              </View>

              <Text style={[styles.caption, {fontStyle: 'italic'}]}>
                LM Studio / Open WebUI: point base URL to {baseUrl}/v1 and set the
                API key if auth is enabled.
              </Text>
            </View>
          )}
        </View>

      </ScrollView>

      {isPickerVisible && (
        <ChatPalModelPickerSheet
          isVisible={isPickerVisible}
          onClose={() => setIsPickerVisible(false)}
          chatInputHeight={0}
        />
      )}
    </SafeAreaView>
  );
});
