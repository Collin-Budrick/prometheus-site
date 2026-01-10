import {
  bigint,
  boolean,
  index,
  integer,
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
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    emailVerifiedAt: timestamp('email_verified_at', { mode: 'date', withTimezone: true }),
    passwordHash: text('password_hash'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull()
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)]
)

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    refreshExpiresAt: timestamp('refresh_expires_at', { mode: 'date', withTimezone: true })
  },
  (table) => [
    index('auth_sessions_user_id_idx').on(table.userId),
    uniqueIndex('auth_sessions_token_unique').on(table.token)
  ]
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
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { mode: 'date', withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { mode: 'date', withTimezone: true }),
    scope: text('scope'),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('auth_keys_provider_user_unique').on(table.provider, table.providerUserId),
    index('auth_keys_user_id_idx').on(table.userId)
  ]
)

export const passkeys = pgTable(
  'passkeys',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name'),
    credentialID: text('credential_id').notNull(),
    publicKey: text('public_key').notNull(),
    counter: bigint('counter', { mode: 'number' }).notNull().default(0),
    deviceType: text('device_type'),
    backedUp: boolean('backed_up').notNull().default(false),
    authenticatorAttachment: text('authenticator_attachment'),
    transports: text('transports'),
    lastUsedAt: timestamp('last_used_at', { mode: 'date', withTimezone: true }),
    aaguid: text('aaguid'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index('passkeys_user_id_idx').on(table.userId),
    uniqueIndex('passkeys_credential_id_unique').on(table.credentialID)
  ]
)

export const contactInvites = pgTable(
  'contact_invites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    inviterId: uuid('inviter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    inviteeId: uuid('invitee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('contact_invites_unique').on(table.inviterId, table.inviteeId),
    index('contact_invites_inviter_idx').on(table.inviterId),
    index('contact_invites_invitee_idx').on(table.inviteeId),
    index('contact_invites_status_idx').on(table.status)
  ]
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)]
)

export const storeItems = pgTable('store_items', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  quantity: integer('quantity').notNull().default(1),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: false }).defaultNow()
})

export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  author: text('author').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: false }).defaultNow()
})

export const insertUserSchema = createInsertSchema(users, {
  emailVerifiedAt: (schema) => schema.nullable()
})

export const insertAuthSessionSchema = createInsertSchema(authSessions, {
  refreshExpiresAt: (schema) => schema.nullable()
})

export const insertAuthKeySchema = createInsertSchema(authKeys, {
  provider: (schema) => schema.nullable(),
  providerUserId: (schema) => schema.nullable(),
  expiresAt: (schema) => schema.nullable()
})

export const insertPasskeySchema = createInsertSchema(passkeys, {
  deviceType: (schema) => schema.nullable(),
  authenticatorAttachment: (schema) => schema.nullable(),
  transports: (schema) => schema.nullable(),
  lastUsedAt: (schema) => schema.nullable()
})

export const authPayloadSchema = z.object({
  user: insertUserSchema,
  session: insertAuthSessionSchema,
  key: insertAuthKeySchema,
  passkey: insertPasskeySchema
})
