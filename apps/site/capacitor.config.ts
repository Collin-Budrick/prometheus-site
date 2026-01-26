import type { CapacitorConfig } from '@capacitor/cli';

const resolveServerUrl = (): string | undefined => {
  const explicit = process.env.CAPACITOR_SERVER_URL?.trim();
  if (explicit) return explicit;
  const deviceHost = process.env.PROMETHEUS_DEVICE_HOST?.trim();
  if (deviceHost) {
    if (deviceHost.startsWith('http://') || deviceHost.startsWith('https://')) return deviceHost;
    const protocol = process.env.PROMETHEUS_DEVICE_PROTOCOL?.trim() || 'http';
    const port = process.env.PROMETHEUS_DEVICE_WEB_PORT?.trim() || '4173';
    const defaultPort = protocol === 'https' ? '443' : '80';
    const portSuffix = port && port !== defaultPort ? `:${port}` : '';
    return `${protocol}://${deviceHost}${portSuffix}`;
  }
  const host = process.env.PROMETHEUS_WEB_HOST?.trim();
  if (!host) return undefined;
  if (host.startsWith('http://') || host.startsWith('https://')) return host;
  const httpsPort = process.env.PROMETHEUS_HTTPS_PORT?.trim();
  const portSuffix = httpsPort && httpsPort !== '443' ? `:${httpsPort}` : '';
  return `https://${host}${portSuffix}`;
};

const normalizeHost = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    const url = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? new URL(trimmed)
      : new URL(`http://${trimmed}`);
    return url.hostname;
  } catch {
    return undefined;
  }
};

const serverUrl = resolveServerUrl();
const allowNavigation = (() => {
  const allow = new Set<string>();
  const serverHost = normalizeHost(serverUrl);
  if (serverHost) allow.add(serverHost);
  const webHost = normalizeHost(process.env.PROMETHEUS_WEB_HOST);
  if (webHost) allow.add(webHost);
  const deviceHost = normalizeHost(process.env.PROMETHEUS_DEVICE_HOST);
  if (deviceHost) allow.add(deviceHost);
  return allow.size ? Array.from(allow) : undefined;
})();
const cleartext = Boolean(serverUrl && serverUrl.startsWith('http://'));
const serverConfig = serverUrl
  ? {
      url: serverUrl,
      cleartext,
      ...(allowNavigation ? { allowNavigation } : {})
    }
  : undefined;

const config: CapacitorConfig = {
  appId: 'dev.prometheus.site',
  appName: 'Prometheus',
  webDir: 'dist',
  ...(serverConfig ? { server: serverConfig } : {}),
  ...(cleartext ? { android: { allowMixedContent: true } } : {})
};

export default config;
