/// <reference types="node" />
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      `postgresql://${process.env.POSTGRES_USER ?? 'prometheus'}:${process.env.POSTGRES_PASSWORD ?? 'secret'}@${
        process.env.POSTGRES_HOST ?? 'localhost'
      }:${process.env.POSTGRES_PORT ?? 5433}/${process.env.POSTGRES_DB ?? 'prometheus'}`,
    ssl: process.env.POSTGRES_SSL === 'true'
  }
})
