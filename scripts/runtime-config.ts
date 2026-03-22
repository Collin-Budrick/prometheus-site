import {
  hasTemplateFeature,
  templateBranding,
  resolveTemplateFeatures,
  type ResolvedTemplateFeatures
} from '../packages/template-config/src/index.ts'

type ProcessEnv = NodeJS.ProcessEnv

export type SiteRuntimeConfig = {
  domains: {
    db: string
    dbProd: string
    web: string
    webProd: string
  }
  ports: {
    http: string
    https: string
    api: string
    spacetimedb: string
    garnet: string
    webtransport: string
    deviceWeb: string
  }
  compose: {
    projectName: string
    profiles: string[]
    includeOptionalServices: boolean
    services: {
      core: readonly string[]
      web: readonly string[]
      proxy: readonly string[]
      optional: readonly string[]
    }
  }
  template: ResolvedTemplateFeatures
  caddy: {
    certBasename: string
    certPemPath: string
    certKeyPath: string
  }
}

const DEFAULT_DOMAINS = {
  db: templateBranding.domains.db,
  dbProd: templateBranding.domains.dbProd,
  web: templateBranding.domains.web,
  webProd: templateBranding.domains.webProd
} as const

const DEFAULT_PORTS = {
  http: '80',
  https: '443',
  api: '4000',
  spacetimedb: '3000',
  garnet: '6379',
  webtransport: '4444',
  deviceWeb: '4173'
} as const

const DEFAULT_COMPOSE = {
  projectName: templateBranding.composeProjectName,
  services: {
    core: ['spacetimedb', 'garnet', 'api'],
    web: ['web'],
    proxy: ['caddy'],
    optional: []
  } as const
} as const

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

const trim = (value: string | undefined) => {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const readString = (env: ProcessEnv, key: string, fallback: string) => trim(env[key]) ?? fallback

const readPort = (env: ProcessEnv, key: string, fallback: string) => {
  const raw = trim(env[key])
  const value = raw ?? fallback
  const port = Number.parseInt(value, 10)
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`[runtime-config] Invalid port for ${key}: ${raw ?? '(unset)'}`)
  }
  return `${port}`
}

const readPortAliases = (env: ProcessEnv, keys: string[], fallback: string) => {
  const resolvedKey = keys.find((key) => trim(env[key]) !== undefined) ?? keys[0] ?? ''
  const resolvedValue = keys.map((key) => trim(env[key])).find((value) => value !== undefined)
  return readPort({ ...env, [resolvedKey]: resolvedValue }, resolvedKey, fallback)
}

const sanitizeHost = (value: string) => value.replace(/^https?:\/\//, '').split('/')[0]

const readDomain = (env: ProcessEnv, key: string, fallback: string) => {
  const value = sanitizeHost(readString(env, key, fallback))
  if (!value.includes('.')) {
    throw new Error(`[runtime-config] Invalid domain for ${key}: ${value}`)
  }
  return value
}

const parseProfiles = (env: ProcessEnv, template: ResolvedTemplateFeatures) => {
  const raw = readString(env, 'PROMETHEUS_COMPOSE_PROFILE', '')
  const explicit = raw ? raw.split(',').map((part) => part.trim()).filter(Boolean) : []
  return Array.from(new Set([...template.composeProfiles, ...explicit]))
}

const readBool = (value: string | undefined, fallback: boolean) => {
  const normalized = trim(value)
  if (!normalized) return fallback
  return TRUE_VALUES.has(normalized.toLowerCase())
}

const readIncludeOptionalServices = (env: ProcessEnv, template: ResolvedTemplateFeatures) => {
  const profiles = parseProfiles(env, template)
  const force = readBool(env.PROMETHEUS_ENABLE_REALTIME_SERVICES, false)
  if (force) return true
  if (profiles.includes('all')) return true
  if (profiles.includes('full')) return true
  if (profiles.includes('realtime')) return true
  return hasTemplateFeature(template, 'realtime')
}

const readProjectName = (env: ProcessEnv) => {
  const value = readString(env, 'COMPOSE_PROJECT_NAME', DEFAULT_COMPOSE.projectName)
  if (!/^[a-zA-Z][\w-]*$/.test(value)) {
    throw new Error(`[runtime-config] Invalid COMPOSE_PROJECT_NAME: ${value}`)
  }
  return value
}

const computeCertBasename = (web: string, webProd: string, db: string, dbProd: string) =>
  `${web}+${webProd}+${db}+${dbProd}`

export const getRuntimeConfig = (env: ProcessEnv = process.env): SiteRuntimeConfig => {
  const template = resolveTemplateFeatures(env)
  const dbHost = readDomain(env, 'PROMETHEUS_DB_HOST', DEFAULT_DOMAINS.db)
  const dbProd = readDomain(env, 'PROMETHEUS_DB_HOST_PROD', DEFAULT_DOMAINS.dbProd)
  const webHost = readDomain(env, 'PROMETHEUS_WEB_HOST', DEFAULT_DOMAINS.web)
  const webProd = readDomain(env, 'PROMETHEUS_WEB_HOST_PROD', DEFAULT_DOMAINS.webProd)
  const ports = {
    http: readPort(env, 'PROMETHEUS_HTTP_PORT', DEFAULT_PORTS.http),
    https: readPort(env, 'PROMETHEUS_HTTPS_PORT', DEFAULT_PORTS.https),
    api: readPort(env, 'PROMETHEUS_API_PORT', DEFAULT_PORTS.api),
    spacetimedb: readPort(env, 'PROMETHEUS_SPACETIMEDB_PORT', DEFAULT_PORTS.spacetimedb),
    garnet: readPortAliases(env, ['PROMETHEUS_GARNET_PORT', 'PROMETHEUS_VALKEY_PORT'], DEFAULT_PORTS.garnet),
    webtransport: readPort(env, 'PROMETHEUS_WEBTRANSPORT_PORT', DEFAULT_PORTS.webtransport),
    deviceWeb: readPort(env, 'PROMETHEUS_DEVICE_WEB_PORT', DEFAULT_PORTS.deviceWeb)
  }
  const certBasename = readString(
    env,
    'PROMETHEUS_CADDY_CERT_BASENAME',
    computeCertBasename(webHost, webProd, dbHost, dbProd)
  )
  const includeOptionalServices = readIncludeOptionalServices(env, template)
  const profiles = parseProfiles(env, template)
  const projectName = readProjectName(env)

  return {
    domains: {
      db: dbHost,
      dbProd,
      web: webHost,
      webProd
    },
    ports,
    compose: {
      projectName,
      profiles,
      includeOptionalServices,
      services: {
        core: DEFAULT_COMPOSE.services.core,
        web: DEFAULT_COMPOSE.services.web,
        proxy: DEFAULT_COMPOSE.services.proxy,
        optional: DEFAULT_COMPOSE.services.optional
      }
    },
    template,
    caddy: {
      certBasename,
      certPemPath: `/etc/caddy/certs/${certBasename}.pem`,
      certKeyPath: `/etc/caddy/certs/${certBasename}.key`
    }
  }
}
