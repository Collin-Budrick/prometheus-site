import {
  bigint,
  boolean,
  index,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core'
import { createInsertSchema } from 'drizzle-zod'
import { z } from 'zod'

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { mode: 'date', withTimezone: true }),
    passwordHash: text('password_hash'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    emailUnique: uniqueIndex('users_email_unique').on(table.email)
  })
)

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    refreshExpiresAt: timestamp('refresh_expires_at', { mode: 'date', withTimezone: true })
  },
  (table) => ({
    userIdx: index('auth_sessions_user_id_idx').on(table.userId)
  })
)

export const authKeys = pgTable(
  'auth_keys',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    hashedPassword: text('hashed_password'),
    provider: text('provider'),
    providerUserId: text('provider_user_id'),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    providerUserUnique: uniqueIndex('auth_keys_provider_user_unique')
      .on(table.provider, table.providerUserId),
    userIdx: index('auth_keys_user_id_idx').on(table.userId)
  })
)

export const passkeys = pgTable(
  'passkeys',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    publicKey: text('public_key').notNull(),
    counter: bigint('counter', { mode: 'number' }).notNull().default(0),
    deviceType: text('device_type'),
    backedUp: boolean('backed_up').notNull().default(false),
    authenticatorAttachment: text('authenticator_attachment'),
    transports: text('transports').array(),
    lastUsedAt: timestamp('last_used_at', { mode: 'date', withTimezone: true }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    userIdx: index('passkeys_user_id_idx').on(table.userId)
  })
)

export const storeItems = pgTable('store_items', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: false }).defaultNow()
})

export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  author: text('author').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: false }).defaultNow()
})

export const insertUserSchema = createInsertSchema(users, {
  emailVerifiedAt: z.date().nullable()
})

export const insertAuthSessionSchema = createInsertSchema(authSessions, {
  refreshExpiresAt: z.date().nullable()
})

export const insertAuthKeySchema = createInsertSchema(authKeys, {
  provider: z.string().nullable(),
  providerUserId: z.string().nullable(),
  expiresAt: z.date().nullable()
})

export const insertPasskeySchema = createInsertSchema(passkeys, {
  deviceType: z.string().nullable(),
  authenticatorAttachment: z.string().nullable(),
  transports: z.array(z.string()).nullable(),
  lastUsedAt: z.date().nullable()
})

export const authPayloadSchema = z.object({
  user: insertUserSchema,
  session: insertAuthSessionSchema,
  key: insertAuthKeySchema,
  passkey: insertPasskeySchema
})
