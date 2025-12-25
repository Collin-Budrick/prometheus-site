CREATE TABLE "auth_keys" (
	"id" text PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"hashed_password" text,
	"provider" text,
	"provider_user_id" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refresh_expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" text PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"device_type" text,
	"backed_up" boolean DEFAULT false NOT NULL,
	"authenticator_attachment" text,
	"transports" text[],
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_keys_provider_user_unique" ON "auth_keys" ("provider","provider_user_id");--> statement-breakpoint
CREATE INDEX "auth_keys_user_id_idx" ON "auth_keys" ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "passkeys_user_id_idx" ON "passkeys" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" ("email");--> statement-breakpoint
ALTER TABLE "auth_keys" ADD CONSTRAINT "auth_keys_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;