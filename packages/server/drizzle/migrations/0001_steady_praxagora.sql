CREATE TABLE "activity_elo_status" (
	"activity_id" uuid PRIMARY KEY NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"locked_by" varchar(100),
	"locked_at" timestamp,
	"completed_at" timestamp,
	"error_message" text,
	"retry_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "activity_type_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_type_id" uuid NOT NULL,
	"skill_definition_id" uuid NOT NULL,
	"is_specific_to_activity_type" boolean DEFAULT false,
	"weight" integer DEFAULT 100,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "activity_type_skills_activity_type_id_skill_definition_id_unique" UNIQUE("activity_type_id","skill_definition_id")
);
--> statement-breakpoint
CREATE TABLE "skill_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"skill_type" "skill_type" NOT NULL,
	"is_general" boolean DEFAULT false NOT NULL,
	"description" text,
	"rating_scale_min" integer DEFAULT 1,
	"rating_scale_max" integer DEFAULT 10,
	"category" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "skill_definitions_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "skill_definitions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_activity_skill_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"rated_user_id" uuid NOT NULL,
	"rating_user_id" uuid NOT NULL,
	"skill_definition_id" uuid NOT NULL,
	"rating_value" integer NOT NULL,
	"confidence" integer DEFAULT 5,
	"comment" text,
	"is_anonymous" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_activity_skill_ratings_activity_id_rated_user_id_rating_user_id_skill_definition_id_unique" UNIQUE("activity_id","rated_user_id","rating_user_id","skill_definition_id")
);
--> statement-breakpoint
CREATE TABLE "user_activity_type_elos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"activity_type_id" uuid NOT NULL,
	"elo_score" integer DEFAULT 1200 NOT NULL,
	"games_played" integer DEFAULT 0,
	"peak_elo" integer DEFAULT 1200,
	"volatility" integer DEFAULT 300,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1,
	CONSTRAINT "user_activity_type_elos_user_id_activity_type_id_unique" UNIQUE("user_id","activity_type_id")
);
--> statement-breakpoint
CREATE TABLE "user_activity_type_skill_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"activity_type_id" uuid NOT NULL,
	"skill_definition_id" uuid NOT NULL,
	"average_rating" integer,
	"total_ratings" integer DEFAULT 0,
	"last_calculated_at" timestamp DEFAULT now(),
	"trend" varchar(20) DEFAULT 'stable',
	CONSTRAINT "user_activity_type_skill_summaries_user_id_activity_type_id_skill_definition_id_unique" UNIQUE("user_id","activity_type_id","skill_definition_id")
);
--> statement-breakpoint
CREATE TABLE "user_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user1_id" uuid NOT NULL,
	"user2_id" uuid NOT NULL,
	"status" "connection_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_elo_status" ADD CONSTRAINT "activity_elo_status_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_type_skills" ADD CONSTRAINT "activity_type_skills_activity_type_id_activity_types_id_fk" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_type_skills" ADD CONSTRAINT "activity_type_skills_skill_definition_id_skill_definitions_id_fk" FOREIGN KEY ("skill_definition_id") REFERENCES "public"."skill_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_skill_ratings" ADD CONSTRAINT "user_activity_skill_ratings_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_skill_ratings" ADD CONSTRAINT "user_activity_skill_ratings_rated_user_id_users_id_fk" FOREIGN KEY ("rated_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_skill_ratings" ADD CONSTRAINT "user_activity_skill_ratings_rating_user_id_users_id_fk" FOREIGN KEY ("rating_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_skill_ratings" ADD CONSTRAINT "user_activity_skill_ratings_skill_definition_id_skill_definitions_id_fk" FOREIGN KEY ("skill_definition_id") REFERENCES "public"."skill_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_type_elos" ADD CONSTRAINT "user_activity_type_elos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_type_elos" ADD CONSTRAINT "user_activity_type_elos_activity_type_id_activity_types_id_fk" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_type_skill_summaries" ADD CONSTRAINT "user_activity_type_skill_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_type_skill_summaries" ADD CONSTRAINT "user_activity_type_skill_summaries_activity_type_id_activity_types_id_fk" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_type_skill_summaries" ADD CONSTRAINT "user_activity_type_skill_summaries_skill_definition_id_skill_definitions_id_fk" FOREIGN KEY ("skill_definition_id") REFERENCES "public"."skill_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_connections" ADD CONSTRAINT "user_connections_user1_id_users_id_fk" FOREIGN KEY ("user1_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_connections" ADD CONSTRAINT "user_connections_user2_id_users_id_fk" FOREIGN KEY ("user2_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;