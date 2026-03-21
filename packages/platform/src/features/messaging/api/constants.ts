export const maxPromptLength = 2000
export const maxPromptPayloadBytes = 32 * 1024
export const contactsChannel = 'contacts:stream'
export const p2pChannel = 'chat:p2p:stream'

export const p2pDeviceKeyPrefix = 'chat:p2p:device:'
export const p2pUserDevicesPrefix = 'chat:p2p:user:'
export const p2pMailboxPrefix = 'chat:p2p:mailbox:'
export const p2pPrekeyPrefix = 'chat:p2p:prekey:'
export const p2pPushPrefix = 'chat:p2p:push:'
export const p2pPushUserPrefix = 'chat:p2p:push:user:'
export const p2pDeviceTtlSeconds = 60 * 60 * 24 * 30
export const p2pMailboxTtlSeconds = 60 * 60 * 24 * 7
export const p2pMailboxMaxEntries = 2000
export const p2pPrekeyTtlSeconds = 60 * 60 * 24 * 30
export const p2pPushTtlSeconds = 60 * 60 * 24 * 30

export const buildDeviceKey = (deviceId: string) => `${p2pDeviceKeyPrefix}${deviceId}`
export const buildUserDevicesKey = (userId: string) => `${p2pUserDevicesPrefix}${userId}:devices`
export const buildMailboxKey = (deviceId: string) => `${p2pMailboxPrefix}${deviceId}`
export const buildMailboxIndexKey = (deviceId: string) => `${p2pMailboxPrefix}${deviceId}:index`
export const buildPrekeyKey = (deviceId: string) => `${p2pPrekeyPrefix}${deviceId}`
export const buildPushKey = (deviceId: string) => `${p2pPushPrefix}${deviceId}`
export const buildPushUserKey = (userId: string) => `${p2pPushUserPrefix}${userId}:devices`
