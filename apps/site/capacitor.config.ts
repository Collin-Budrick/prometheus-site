import type { CapacitorConfig } from '@capacitor/cli';

const resolveServerUrl = (): string | undefined => {
  const explicit = process.env.CAPACITOR_SERVER_URL?.trim();
  if (explicit) return explicit;
  const host = process.env.PROMETHEUS_WEB_HOST?.trim();
  if (!host) return undefined;
  if (host.startsWith('http://') || host.startsWith('https://')) return host;
  const httpsPort = process.env.PROMETHEUS_HTTPS_PORT?.trim();
  const portSuffix = httpsPort && httpsPort !== '443' ? `:${httpsPort}` : '';
  return `https://${host}${portSuffix}`;
};

const serverUrl = resolveServerUrl();

const config: CapacitorConfig = {
  appId: 'dev.prometheus.site',
  appName: 'Prometheus',
  webDir: 'dist',
  ...(serverUrl ? { server: { url: serverUrl } } : {})
};

export default config;
