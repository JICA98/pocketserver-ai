/* eslint-disable react/no-unstable-nested-components, react-native/no-inline-styles */
import React, {useState} from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Clipboard,
  Alert,
} from 'react-native';
import {Text, Button, Divider} from 'react-native-paper';
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

export type ServerStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';
export type BindMode = 'localhost' | 'lan';

export interface ServerViewModel {
  status: ServerStatus;
  bindMode: BindMode;
  port: string;
  authEnabled: boolean;
  apiKey: string;
  showApiKey: boolean;
  loadedModel: string | null;
  publicUrl: string;
  activeRequests: number;
  queuedRequests: number;
  requestsServed: number;
  failedRequests: number;
  tokensGenerated: number;
  logs: Array<{
    id: string;
    timestamp: string;
    method: string;
    route: string;
    status: number;
    duration: number;
  }>;
}

export const ServerScreen: React.FC = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, insets);

  // Temporary VM state for the Phase 1 shell
  const [vm, setVm] = useState<ServerViewModel>({
    status: 'stopped',
    bindMode: 'localhost',
    port: '8080',
    authEnabled: true,
    apiKey: 'sk-pocketpal-local-server-key-xyz',
    showApiKey: false,
    loadedModel: 'Llama-3-8B-Instruct.Q4_K_M.gguf',
    publicUrl: '',
    activeRequests: 0,
    queuedRequests: 0,
    requestsServed: 0,
    failedRequests: 0,
    tokensGenerated: 0,
    logs: [],
  });

  const [advancedCollapsed, setAdvancedCollapsed] = useState(true);

  // Handlers
  const handleStart = () => {
    setVm(prev => ({...prev, status: 'starting'}));
    setTimeout(() => {
      setVm(prev => ({
        ...prev,
        status: 'running',
        requestsServed: 0,
        logs: [
          {
            id: '1',
            timestamp: new Date().toLocaleTimeString(),
            method: 'SYSTEM',
            route: 'Server started successfully.',
            status: 200,
            duration: 0,
          },
        ],
      }));
    }, 1000);
  };

  const handleStop = () => {
    setVm(prev => ({...prev, status: 'stopping'}));
    setTimeout(() => {
      setVm(prev => ({
        ...prev,
        status: 'stopped',
        logs: [
          ...prev.logs,
          {
            id: String(prev.logs.length + 1),
            timestamp: new Date().toLocaleTimeString(),
            method: 'SYSTEM',
            route: 'Server stopped.',
            status: 200,
            duration: 0,
          },
        ],
      }));
    }, 1000);
  };

  const handleCopy = (text: string, label: string) => {
    Clipboard.setString(text);
    Alert.alert('Copied', `${label} copied to clipboard.`);
  };

  const handleRegenerateKey = () => {
    Alert.alert(
      'Regenerate API Key',
      'Are you sure you want to regenerate the API key? Active clients using the old key will be rejected.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: () => {
            const randomBytes = Array.from({length: 16}, () =>
              Math.floor(Math.random() * 16).toString(16),
            ).join('');
            setVm(prev => ({
              ...prev,
              apiKey: `sk-pocketpal-${randomBytes}`,
            }));
          },
        },
      ],
    );
  };

  const getStatusColor = (status: ServerStatus) => {
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
  };

  const localAddress = `http://127.0.0.1:${vm.port}`;
  const lanAddress = `http://192.168.1.100:${vm.port}`; // Placeholder LAN IP

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Server Status Header Card */}
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.statusHeader}>
              <View
                style={[
                  styles.statusDot,
                  {backgroundColor: getStatusColor(vm.status)},
                ]}
              />
              <View>
                <Text style={styles.title}>PocketServer AI</Text>
                <Text style={styles.subtitle}>
                  Status:{' '}
                  {vm.status.charAt(0).toUpperCase() + vm.status.slice(1)}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.buttonContainer}>
            {vm.status === 'stopped' || vm.status === 'error' ? (
              <Button
                mode="contained"
                icon={() => <PlayIcon stroke={theme.colors.onPrimary} />}
                onPress={handleStart}
                style={styles.button}
                buttonColor={theme.colors.primary}
                disabled={vm.loadedModel === null}>
                Start Server
              </Button>
            ) : (
              <Button
                mode="contained"
                icon={() => <StopIcon stroke={theme.colors.onPrimary} />}
                onPress={handleStop}
                style={styles.button}
                buttonColor={theme.colors.error}
                disabled={vm.status === 'starting' || vm.status === 'stopping'}>
                Stop Server
              </Button>
            )}
          </View>
        </View>

        {/* Model Readiness Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Active Model</Text>
          {vm.loadedModel ? (
            <View>
              <Text style={styles.subtitle}>{vm.loadedModel}</Text>
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
                Please load/select a GGUF model in the Models screen before
                starting the server.
              </Text>
            </View>
          )}
        </View>

        {/* Addresses Card */}
        {vm.status === 'running' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Connection Addresses</Text>

            <View style={styles.addressCard}>
              <Text style={styles.addressText} numberOfLines={1}>
                Localhost: {localAddress}
              </Text>
              <TouchableOpacity
                onPress={() => handleCopy(localAddress, 'Local URL')}>
                <CopyIcon stroke={theme.colors.primary} />
              </TouchableOpacity>
            </View>

            {vm.bindMode === 'lan' && (
              <View style={styles.addressCard}>
                <Text style={styles.addressText} numberOfLines={1}>
                  Local Network: {lanAddress}
                </Text>
                <TouchableOpacity
                  onPress={() => handleCopy(lanAddress, 'LAN URL')}>
                  <CopyIcon stroke={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            )}

            {vm.publicUrl ? (
              <View style={styles.addressCard}>
                <Text style={styles.addressText} numberOfLines={1}>
                  Public Tunnel: {vm.publicUrl}
                </Text>
                <TouchableOpacity
                  onPress={() => handleCopy(vm.publicUrl, 'Public URL')}>
                  <CopyIcon stroke={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        )}

        {/* Access and Authentication Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Access & Authentication</Text>

          <View style={styles.row}>
            <Text style={styles.subtitle}>Require API Key</Text>
            <TouchableOpacity
              onPress={() =>
                setVm(prev => ({...prev, authEnabled: !prev.authEnabled}))
              }>
              <Text style={{color: theme.colors.primary, fontWeight: 'bold'}}>
                {vm.authEnabled ? 'ENABLED' : 'DISABLED'}
              </Text>
            </TouchableOpacity>
          </View>

          {vm.authEnabled && (
            <View style={styles.apiKeyContainer}>
              <Text style={styles.apiKeyText} numberOfLines={1}>
                {vm.showApiKey ? vm.apiKey : '••••••••••••••••••••••••••••••••'}
              </Text>
              <View style={{flexDirection: 'row', gap: 12}}>
                <TouchableOpacity
                  onPress={() =>
                    setVm(prev => ({...prev, showApiKey: !prev.showApiKey}))
                  }>
                  {vm.showApiKey ? (
                    <EyeOffIcon stroke={theme.colors.primary} />
                  ) : (
                    <EyeIcon stroke={theme.colors.primary} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleCopy(vm.apiKey, 'API Key')}>
                  <CopyIcon stroke={theme.colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRegenerateKey}>
                  <RefreshIcon stroke={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Advanced Settings Section */}
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
              <View>
                <Text style={styles.subtitle}>Host Bind Mode</Text>
                <View style={{flexDirection: 'row', gap: 8, marginTop: 8}}>
                  <Button
                    mode={
                      vm.bindMode === 'localhost' ? 'contained' : 'outlined'
                    }
                    onPress={() =>
                      setVm(prev => ({...prev, bindMode: 'localhost'}))
                    }
                    style={{flex: 1}}>
                    Localhost
                  </Button>
                  <Button
                    mode={vm.bindMode === 'lan' ? 'contained' : 'outlined'}
                    onPress={() => setVm(prev => ({...prev, bindMode: 'lan'}))}
                    style={{flex: 1}}>
                    Local Network (LAN)
                  </Button>
                </View>
              </View>

              <View>
                <Text style={styles.subtitle}>Server Port</Text>
                <TextInput
                  value={vm.port}
                  onChangeText={text => setVm(prev => ({...prev, port: text}))}
                  keyboardType="numeric"
                  style={styles.textInput}
                />
              </View>
            </View>
          )}
        </View>

        {/* Logs Card */}
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.sectionTitle}>Activity Logs</Text>
            {vm.logs.length > 0 && (
              <TouchableOpacity
                onPress={() => setVm(prev => ({...prev, logs: []}))}>
                <Text style={{color: theme.colors.error}}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.logConsole}>
            <ScrollView nestedScrollEnabled>
              {vm.logs.length === 0 ? (
                <Text style={styles.emptyLogText}>No activity logs yet</Text>
              ) : (
                vm.logs.map(log => (
                  <Text key={log.id} style={styles.logText}>
                    [{log.timestamp}] {log.method} {log.route} - {log.status}{' '}
                    {log.duration > 0 ? `(${log.duration}ms)` : ''}
                  </Text>
                ))
              )}
            </ScrollView>
          </View>
        </View>

        {/* Examples Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>API Example Usage</Text>
          <Text style={styles.subtitle}>Health Check</Text>
          <View style={styles.exampleCodeContainer}>
            <Text style={styles.exampleCodeText}>
              curl{' '}
              {vm.status === 'running' ? localAddress : 'http://127.0.0.1:8080'}
              /health
            </Text>
          </View>

          <Text style={[styles.subtitle, {marginTop: 8}]}>Chat Completion</Text>
          <View style={styles.exampleCodeContainer}>
            <Text style={styles.exampleCodeText} selectable>
              {`curl ${vm.status === 'running' ? localAddress : 'http://127.0.0.1:8080'}/v1/chat/completions \\
  -H "Authorization: Bearer ${vm.authEnabled ? 'YOUR_API_KEY' : ''}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "local-model",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'`}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
