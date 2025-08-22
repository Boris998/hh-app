CREATE TYPE "public"."completion_status" AS ENUM('scheduled', 'active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."elo_status" AS ENUM('pending', 'calculating', 'completed', 'error');--> statement-breakpoint
CREATE TYPE "public"."final_result" AS ENUM('win', 'loss', 'draw');--> statement-breakpoint
CREATE TYPE "public"."post_type" AS ENUM('activity_recap', 'skill_milestone', 'general');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('public', 'friends', 'private');--> statement-breakpoint
ALTER TYPE "public"."participant_status" ADD VALUE 'rated';--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid,
	"user_id" uuid NOT NULL,
	"title" varchar(255),
	"content" text NOT NULL,
	"post_type" "post_type" DEFAULT 'general' NOT NULL,
	"skill_highlights" jsonb,
	"visibility" "visibility" DEFAULT 'public' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "posts_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "user_general_skill_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"skill_definition_id" uuid NOT NULL,
	"overall_average_rating" numeric(4, 2),
	"total_ratings" integer DEFAULT 0,
	"activity_types_count" integer DEFAULT 0,
	"last_calculated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_general_skill_summaries_user_id_skill_definition_id_unique" UNIQUE("user_id","skill_definition_id")
);
--> statement-breakpoint
ALTER TABLE "activity_chat_read_status" DROP CONSTRAINT "activity_chat_read_status_user_id_chat_room_id_unique";--> statement-breakpoint
ALTER TABLE "activities" DROP CONSTRAINT "activities_activity_type_id_activity_types_id_fk";
--> statement-breakpoint
ALTER TABLE "activities" DROP CONSTRAINT "activities_creator_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "activity_chat_messages" DROP CONSTRAINT "activity_chat_messages_chat_room_id_activity_chat_rooms_id_fk";
--> statement-breakpoint
ALTER TABLE "activity_chat_messages" DROP CONSTRAINT "activity_chat_messages_sender_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "activity_chat_read_status" DROP CONSTRAINT "activity_chat_read_status_chat_room_id_activity_chat_rooms_id_fk";
--> statement-breakpoint
ALTER TABLE "activity_chat_read_status" DROP CONSTRAINT "activity_chat_read_status_last_read_message_id_activity_chat_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "activity_elo_status" DROP CONSTRAINT "activity_elo_status_activity_id_activities_id_fk";
--> statement-breakpoint
ALTER TABLE "activity_participants" DROP CONSTRAINT "activity_participants_activity_id_activities_id_fk";
--> statement-breakpoint
ALTER TABLE "activity_participants" DROP CONSTRAINT "activity_participants_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "activity_type_skills" DROP CONSTRAINT "activity_type_skills_activity_type_id_activity_types_id_fk";
--> statement-breakpoint
ALTER TABLE "activity_type_skills" DROP CONSTRAINT "activity_type_skills_skill_definition_id_skill_definitions_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_rooms" DROP CONSTRAINT "chat_rooms_created_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_room_id_chat_rooms_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_sender_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "room_members" DROP CONSTRAINT "room_members_room_id_chat_rooms_id_fk";
--> statement-breakpoint
ALTER TABLE "room_members" DROP CONSTRAINT "room_members_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_activity_skill_ratings" DROP CONSTRAINT "user_activity_skill_ratings_activity_id_activities_id_fk";
--> statement-breakpoint
ALTER TABLE "user_activity_skill_ratings" DROP CONSTRAINT "user_activity_skill_ratings_rated_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_activity_skill_ratings" DROP CONSTRAINT "user_activity_skill_ratings_rating_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_activity_skill_ratings" DROP CONSTRAINT "user_activity_skill_ratings_skill_definition_id_skill_definitions_id_fk";
--> statement-breakpoint
ALTER TABLE "user_activity_type_elos" DROP CONSTRAINT "user_activity_type_elos_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_activity_type_elos" DROP CONSTRAINT "user_activity_type_elos_activity_type_id_activity_types_id_fk";
--> statement-breakpoint
ALTER TABLE "user_activity_type_skill_summaries" DROP CONSTRAINT "user_activity_type_skill_summaries_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_activity_type_skill_summaries" DROP CONSTRAINT "user_activity_type_skill_summaries_activity_type_id_activity_types_id_fk";
--> statement-breakpoint
ALTER TABLE "user_activity_type_skill_summaries" DROP CONSTRAINT "user_activity_type_skill_summaries_skill_definition_id_skill_definitions_id_fk";
--> statement-breakpoint
ALTER TABLE "user_connections" DROP CONSTRAINT "user_connections_user1_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_connections" DROP CONSTRAINT "user_connections_user2_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "entity_change_user_timestamp_idx";--> statement-breakpoint
DROP INDEX "entity_change_type_timestamp_idx";--> statement-breakpoint
DROP INDEX "entity_change_related_idx";--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "description" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "location" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "skill_requirements" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "is_elo_rated" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "completion_status" SET DEFAULT 'scheduled'::"public"."completion_status";--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "completion_status" SET DATA TYPE "public"."completion_status" USING "completion_status"::"public"."completion_status";--> statement-breakpoint
ALTER TABLE "activity_chat_rooms" ALTER COLUMN "name" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "activity_elo_status" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."elo_status";--> statement-breakpoint
ALTER TABLE "activity_elo_status" ALTER COLUMN "status" SET DATA TYPE "public"."elo_status" USING "status"::"public"."elo_status";--> statement-breakpoint
ALTER TABLE "activity_elo_status" ALTER COLUMN "locked_by" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "activity_participants" ALTER COLUMN "final_result" SET DATA TYPE "public"."final_result" USING "final_result"::"public"."final_result";--> statement-breakpoint
ALTER TABLE "activity_types" ALTER COLUMN "skill_categories" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "activity_types" ALTER COLUMN "skill_categories" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_types" ALTER COLUMN "default_elo_settings" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "activity_types" ALTER COLUMN "default_elo_settings" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_rooms" ALTER COLUMN "is_private" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "message_type" SET DEFAULT 'text'::"public"."chat_message_type";--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "message_type" SET DATA TYPE "public"."chat_message_type" USING "message_type"::"public"."chat_message_type";--> statement-breakpoint
ALTER TABLE "user_activity_type_elos" ALTER COLUMN "games_played" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_activity_type_elos" ALTER COLUMN "volatility" SET DEFAULT 350;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "entity_change_log" ALTER COLUMN "affected_user_id" SET DEFAULT null;--> statement-breakpoint
ALTER TABLE "entity_change_log" ALTER COLUMN "related_entity_id" SET DEFAULT null;--> statement-breakpoint
ALTER TABLE "entity_change_log" ALTER COLUMN "previous_data" SET DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "entity_change_log" ALTER COLUMN "change_details" SET DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "entity_change_log" ALTER COLUMN "triggered_by" SET DEFAULT null;--> statement-breakpoint
ALTER TABLE "activity_chat_messages" ADD COLUMN "room_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_chat_messages" ADD COLUMN "reply_to_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_chat_messages" ADD COLUMN "attachment_url" varchar(500);--> statement-breakpoint
ALTER TABLE "activity_chat_read_status" ADD COLUMN "room_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_elo_status" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_elo_status" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD COLUMN "creator_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "reply_to_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "edited_at" timestamp;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "creator_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "is_private" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "max_members" integer;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "activity_type_id" uuid;--> statement-breakpoint
ALTER TABLE "user_activity_type_elos" ADD COLUMN "season_elo" integer;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_general_skill_summaries" ADD CONSTRAINT "user_general_skill_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_general_skill_summaries" ADD CONSTRAINT "user_general_skill_summaries_skill_definition_id_skill_definitions_id_fk" FOREIGN KEY ("skill_definition_id") REFERENCES "public"."skill_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_activity_type_id_activity_types_id_fk" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_chat_messages" ADD CONSTRAINT "activity_chat_messages_room_id_activity_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."activity_chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_chat_messages" ADD CONSTRAINT "activity_chat_messages_reply_to_id_activity_chat_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."activity_chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_chat_messages" ADD CONSTRAINT "activity_chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_chat_read_status" ADD CONSTRAINT "activity_chat_read_status_room_id_activity_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."activity_chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_chat_read_status" ADD CONSTRAINT "activity_chat_read_status_last_read_message_id_activity_chat_messages_id_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."activity_chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_elo_status" ADD CONSTRAINT "activity_elo_status_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_type_skills" ADD CONSTRAINT "activity_type_skills_activity_type_id_activity_types_id_fk" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_type_skills" ADD CONSTRAINT "activity_type_skills_skill_definition_id_skill_definitions_id_fk" FOREIGN KEY ("skill_definition_id") REFERENCES "public"."skill_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_chat_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_activity_type_id_activity_types_id_fk" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_skill_ratings" ADD CONSTRAINT "user_activity_skill_ratings_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_skill_ratings" ADD CONSTRAINT "user_activity_skill_ratings_rated_user_id_users_id_fk" FOREIGN KEY ("rated_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_skill_ratings" ADD CONSTRAINT "user_activity_skill_ratings_rating_user_id_users_id_fk" FOREIGN KEY ("rating_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_skill_ratings" ADD CONSTRAINT "user_activity_skill_ratings_skill_definition_id_skill_definitions_id_fk" FOREIGN KEY ("skill_definition_id") REFERENCES "public"."skill_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_type_elos" ADD CONSTRAINT "user_activity_type_elos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_type_elos" ADD CONSTRAINT "user_activity_type_elos_activity_type_id_activity_types_id_fk" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_type_skill_summaries" ADD CONSTRAINT "user_activity_type_skill_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_type_skill_summaries" ADD CONSTRAINT "user_activity_type_skill_summaries_activity_type_id_activity_types_id_fk" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_type_skill_summaries" ADD CONSTRAINT "user_activity_type_skill_summaries_skill_definition_id_skill_definitions_id_fk" FOREIGN KEY ("skill_definition_id") REFERENCES "public"."skill_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_connections" ADD CONSTRAINT "user_connections_user1_id_users_id_fk" FOREIGN KEY ("user1_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_connections" ADD CONSTRAINT "user_connections_user2_id_users_id_fk" FOREIGN KEY ("user2_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_chat_messages_room_created_idx" ON "activity_chat_messages" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE INDEX "elo_score_idx" ON "user_activity_type_elos" USING btree ("activity_type_id","elo_score");--> statement-breakpoint
CREATE INDEX "entity_change_log_affected_user_idx" ON "entity_change_log" USING btree ("affected_user_id");--> statement-breakpoint
CREATE INDEX "entity_change_log_entity_type_idx" ON "entity_change_log" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "entity_change_log_created_at_idx" ON "entity_change_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "entity_change_log_entity_idx" ON "entity_change_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
ALTER TABLE "activity_chat_messages" DROP COLUMN "chat_room_id";--> statement-breakpoint
ALTER TABLE "activity_chat_messages" DROP COLUMN "is_edited";--> statement-breakpoint
ALTER TABLE "activity_chat_read_status" DROP COLUMN "chat_room_id";--> statement-breakpoint
ALTER TABLE "activity_chat_rooms" DROP COLUMN "auto_delete_after_hours";--> statement-breakpoint
ALTER TABLE "activity_chat_rooms" DROP COLUMN "deleted_at";--> statement-breakpoint
ALTER TABLE "activity_types" DROP COLUMN "is_active";--> statement-breakpoint
ALTER TABLE "chat_rooms" DROP COLUMN "created_by_id";--> statement-breakpoint
ALTER TABLE "messages" DROP COLUMN "metadata";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN "logo_url";--> statement-breakpoint
ALTER TABLE "user_delta_cursors" DROP COLUMN "preferred_poll_interval";--> statement-breakpoint
ALTER TABLE "activity_chat_read_status" ADD CONSTRAINT "activity_chat_read_status_user_id_room_id_unique" UNIQUE("user_id","room_id");--> statement-breakpoint
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_activity_id_user_id_unique" UNIQUE("activity_id","user_id");--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_user_id_unique" UNIQUE("room_id","user_id");--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_user_id_unique" UNIQUE("team_id","user_id");--> statement-breakpoint
ALTER TABLE "user_connections" ADD CONSTRAINT "user_connections_user1_id_user2_id_unique" UNIQUE("user1_id","user2_id");--> statement-breakpoint
ALTER TABLE "user_delta_cursors" ADD CONSTRAINT "user_delta_cursors_user_id_unique" UNIQUE("user_id");