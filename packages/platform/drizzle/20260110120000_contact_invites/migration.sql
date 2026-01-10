CREATE TABLE "contact_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inviter_id" uuid NOT NULL,
	"invitee_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contact_invites_unique" ON "contact_invites" ("inviter_id","invitee_id");
--> statement-breakpoint
CREATE INDEX "contact_invites_inviter_idx" ON "contact_invites" ("inviter_id");
--> statement-breakpoint
CREATE INDEX "contact_invites_invitee_idx" ON "contact_invites" ("invitee_id");
--> statement-breakpoint
CREATE INDEX "contact_invites_status_idx" ON "contact_invites" ("status");
--> statement-breakpoint
ALTER TABLE "contact_invites" ADD CONSTRAINT "contact_invites_inviter_id_users_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "contact_invites" ADD CONSTRAINT "contact_invites_invitee_id_users_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "users"("id") ON DELETE CASCADE;
