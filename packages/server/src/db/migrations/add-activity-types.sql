-- Migration: Add ActivityTypes table and update existing tables
-- File: drizzle/migrations/0001_add_activity_types.sql

-- Create activity category enum
CREATE TYPE "activity_category" AS ENUM (
  'team_sports', 
  'individual_sports', 
  'fitness', 
  'mind_body', 
  'combat_sports',
  'outdoor_activities'
);

-- Create activity_types table
CREATE TABLE "activity_types" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  "name" VARCHAR(100) NOT NULL UNIQUE,
  "description" TEXT,
  "category" "activity_category" NOT NULL,
  "is_solo_performable" BOOLEAN NOT NULL DEFAULT false,
  "skill_categories" JSONB NOT NULL DEFAULT '[]',
  "default_elo_settings" JSONB NOT NULL DEFAULT '{}',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "display_order" INTEGER DEFAULT 0,
  "icon_url" VARCHAR(500),
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create unique index on name (case-insensitive)
CREATE UNIQUE INDEX "activity_types_name_unique" ON "activity_types" (LOWER("name"));

-- Create indexes for performance
CREATE INDEX "idx_activity_types_category" ON "activity_types" ("category");
CREATE INDEX "idx_activity_types_active" ON "activity_types" ("is_active");
CREATE INDEX "idx_activity_types_display_order" ON "activity_types" ("display_order");

-- Add new columns to existing activities table
ALTER TABLE "activities" 
ADD COLUMN "max_participants" INTEGER,
ADD COLUMN "elo_level" INTEGER,
ADD COLUMN "skill_requirements" JSONB DEFAULT '{}',
ADD COLUMN "is_elo_rated" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "completion_status" VARCHAR(20) NOT NULL DEFAULT 'scheduled';

-- Create check constraint for completion_status
ALTER TABLE "activities" 
ADD CONSTRAINT "activities_completion_status_check" 
CHECK ("completion_status" IN ('scheduled', 'active', 'completed', 'cancelled'));

-- Add new columns to activity_participants table
ALTER TABLE "activity_participants"
ADD COLUMN "team" VARCHAR(50),
ADD COLUMN "final_result" VARCHAR(20),
ADD COLUMN "performance_notes" TEXT;

-- Create check constraint for final_result
ALTER TABLE "activity_participants"
ADD CONSTRAINT "activity_participants_final_result_check"
CHECK ("final_result" IN ('win', 'loss', 'draw', NULL));

-- Update activities table to reference activity_types
-- First, we need to handle the foreign key constraint
-- This assumes you have existing activities that need to be migrated

-- If you have existing activities, you'll need to:
-- 1. Create default activity types first
-- 2. Update existing activities to reference them
-- 3. Then add the foreign key constraint

-- For now, let's add the foreign key column without constraint
ALTER TABLE "activities" 
ADD COLUMN "activity_type_id_new" UUID;

-- Create index for the new foreign key
CREATE INDEX "idx_activities_activity_type_id" ON "activities" ("activity_type_id_new");

-- Add foreign key constraint (will be enabled after data migration)
-- ALTER TABLE "activities" 
-- ADD CONSTRAINT "activities_activity_type_id_fkey" 
-- FOREIGN KEY ("activity_type_id_new") REFERENCES "activity_types"("id");

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_activity_types_updated_at 
BEFORE UPDATE ON "activity_types" 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE "activity_types" IS 'Defines categories of sports and activities with their skill requirements and ELO settings';
COMMENT ON COLUMN "activity_types"."skill_categories" IS 'JSON array of skill category objects with weights and descriptions';
COMMENT ON COLUMN "activity_types"."default_elo_settings" IS 'JSON object containing ELO calculation parameters for this activity type';
COMMENT ON COLUMN "activities"."completion_status" IS 'Current status of the activity: scheduled, active, completed, or cancelled';
COMMENT ON COLUMN "activity_participants"."final_result" IS 'Result for this participant: win, loss, draw, or null if not applicable';