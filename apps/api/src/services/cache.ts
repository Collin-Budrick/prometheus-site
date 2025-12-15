import { createClient } from '@valkey/client'

const valkeyOptions = {
  socket: {
    host: process.env.VALKEY_HOST ?? 'localhost',
    port: Number.parseInt(process.env.VALKEY_PORT ?? '6379', 10)
  }
}

export const valkey = createClient(valkeyOptions)

export async function connectValkey() {
  if (!valkey.isOpen) {
    await valkey.connect()
  }
}
