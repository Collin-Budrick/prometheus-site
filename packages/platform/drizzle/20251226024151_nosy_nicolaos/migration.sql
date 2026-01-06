CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "image" text;
--> statement-breakpoint
UPDATE "users" SET "name" = COALESCE("name", "email") WHERE "name" IS NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "token" text;
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "ip_address" text;
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "user_agent" text;
--> statement-breakpoint
UPDATE "auth_sessions" SET "token" = "id" WHERE "token" IS NULL;
--> statement-breakpoint
ALTER TABLE "auth_sessions" ALTER COLUMN "token" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "auth_keys" ADD COLUMN "access_token" text;
--> statement-breakpoint
ALTER TABLE "auth_keys" ADD COLUMN "refresh_token" text;
--> statement-breakpoint
ALTER TABLE "auth_keys" ADD COLUMN "id_token" text;
--> statement-breakpoint
ALTER TABLE "auth_keys" ADD COLUMN "access_token_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "auth_keys" ADD COLUMN "refresh_token_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "auth_keys" ADD COLUMN "scope" text;
--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "credential_id" text;
--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "aaguid" text;
--> statement-breakpoint
ALTER TABLE "passkeys" ALTER COLUMN "name" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "passkeys" ALTER COLUMN "transports" TYPE text USING array_to_string("transports", ',');
--> statement-breakpoint
UPDATE "passkeys" SET "credential_id" = "id" WHERE "credential_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "passkeys" ALTER COLUMN "credential_id" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_unique" ON "auth_sessions" ("token");
--> statement-breakpoint
CREATE UNIQUE INDEX "passkeys_credential_id_unique" ON "passkeys" ("credential_id");
--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
