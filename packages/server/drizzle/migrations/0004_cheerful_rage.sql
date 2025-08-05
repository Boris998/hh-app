CREATE TABLE "delta_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"summary_date" timestamp NOT NULL,
	"elo_changes" integer DEFAULT 0,
	"activity_changes" integer DEFAULT 0,
	"skill_rating_changes" integer DEFAULT 0,
	"connection_changes" integer DEFAULT 0,
	"summary_data" jsonb DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"change_type" varchar(20) NOT NULL,
	"affected_user_id" uuid,
	"related_entity_id" uuid,
	"previous_data" jsonb,
	"new_data" jsonb NOT NULL,
	"change_details" jsonb,
	"triggered_by" uuid,
	"change_source" varchar(50) DEFAULT 'system',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_delta_cursors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"last_elo_sync" timestamp DEFAULT now(),
	"last_activity_sync" timestamp DEFAULT now(),
	"last_skill_rating_sync" timestamp DEFAULT now(),
	"last_connection_sync" timestamp DEFAULT now(),
	"last_matchmaking_sync" timestamp DEFAULT now(),
	"client_type" varchar(20) DEFAULT 'web',
	"last_active_at" timestamp DEFAULT now(),
	"preferred_poll_interval" integer DEFAULT 5000,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delta_summaries" ADD CONSTRAINT "delta_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_change_log" ADD CONSTRAINT "entity_change_log_affected_user_id_users_id_fk" FOREIGN KEY ("affected_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_change_log" ADD CONSTRAINT "entity_change_log_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_delta_cursors" ADD CONSTRAINT "user_delta_cursors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delta_summary_user_date_idx" ON "delta_summaries" USING btree ("user_id","summary_date");--> statement-breakpoint
CREATE INDEX "entity_change_user_timestamp_idx" ON "entity_change_log" USING btree ("affected_user_id","created_at");--> statement-breakpoint
CREATE INDEX "entity_change_type_timestamp_idx" ON "entity_change_log" USING btree ("entity_type","created_at");--> statement-breakpoint
CREATE INDEX "entity_change_related_idx" ON "entity_change_log" USING btree ("related_entity_id","created_at");--> statement-breakpoint
CREATE INDEX "user_delta_cursor_idx" ON "user_delta_cursors" USING btree ("user_id");