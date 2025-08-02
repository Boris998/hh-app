# hh-app
healthy society 


ActivityTypes Implementation Guide
Overview
This implementation adds a comprehensive ActivityTypes system to your sports activity tracking platform, supporting 16 different sports/activities with detailed skill categories and ELO settings.
🚀 Quick Setup
1. Database Setup
bash# Full setup (recommended for first time)
pnpm setup:full

# Or step by step
pnpm db:generate  # Generate migration
pnpm db:push      # Apply to database
pnpm seed:activity-types  # Seed with sports data
2. Start Server
bashpnpm start
3. Test Implementation
bash# Get all activity types
curl http://localhost:3000/api/activity-types

# Get team sports only
curl http://localhost:3000/api/activity-types/category/team_sports

# Search for activities
curl "http://localhost:3000/api/activity-types/search?q=ball"
📋 What's Included
Sports/Activities (16 total)

Team Sports: Football, Basketball, Handball, Volleyball
Individual Sports: Running, Tennis, Ping Pong, Golf, Biking
Fitness: Fitness, Functional Fitness
Mind-Body: Yoga, Psychology Session, Mental Health Session
Combat Sports: Boxing, MMA

Key Features

✅ Rich Skill Categories - Each sport has 3-4 skill categories with detailed breakdown
✅ Flexible ELO Settings - Sport-specific K-factors and starting ratings
✅ Search & Filtering - Find activities by name, category, or description
✅ Admin Management - Create, update, and toggle activity types
✅ Type Safety - Full TypeScript support with Zod validation

📁 Files Created/Modified
New Files
src/db/activity-types.schema.ts       # Zod validation schemas
src/db/seeds/activity-types.seed.ts   # Seed data for 16 sports
src/db/seeds/seed-activity-types.ts   # Seeding script
src/routes/activity-types.router.ts   # API endpoints
scripts/setup-database.ts             # Setup automation
Modified Files
src/db/schema.ts                      # Added ActivityTypes table
src/db/zod.schema.ts                  # Updated with new schemas
src/app.ts                           # Added ActivityTypes router
package.json                         # Added new scripts
drizzle.config.ts                    # Updated schema paths
🎯 API Endpoints
Public Endpoints
GET    /api/activity-types                    # List all active types
GET    //activity-types/:publicId          # Get specific type
GET    /api/activity-types/category/:category # Filter by category  
GET    /api/activity-types/search             # Search activities
GET    /api/activity-types/:publicId/skills   # Get skill categories
GET    /api/activity-types/:publicId/elo-settings # Get ELO config
Admin Endpoints (requires authentication)
POST   /api/activity-types                    # Create new type
PUT    /api/activity-types/:publicId          # Update existing
PATCH  /api/activity-types/:publicId/toggle   # Activate/deactivate
🏗️ Database Schema
ActivityTypes Table
sql- id (UUID, Primary Key)
- publicId (UUID, Unique)
- name (VARCHAR, Unique) 
- description (TEXT)
- category (ENUM: team_sports, individual_sports, fitness, mind_body, combat_sports, outdoor_activities)
- isSoloPerformable (BOOLEAN)
- skillCategories (JSONB) - Array of skill category objects
- defaultELOSettings (JSONB) - ELO configuration object
- isActive (BOOLEAN)
- displayOrder (INTEGER)
- iconUrl (VARCHAR)
- createdAt, updatedAt (TIMESTAMP)
Enhanced Activities Table
Added fields:

maxParticipants - Capacity limits
eloLevel - Suggested ELO range
skillRequirements - Minimum skill levels (JSON)
isELORated - Toggle for competitive vs casual
completionStatus - scheduled/active/completed/cancelled

Enhanced ActivityParticipants Table
Added fields:

team - Team assignment (A/B, Red/Blue, etc.)
finalResult - win/loss/draw for ELO calculation
performanceNotes - Post-game comments

📊 Example Data Structure
Skill Categories (Basketball)
json[
  {
    "id": "offensive",
    "name": "Offensive Skills", 
    "description": "Scoring and ball-handling abilities",
    "skills": ["shooting", "dribbling", "layups", "free_throws", "post_moves"],
    "weight": 0.35,
    "displayOrder": 1
  },
  {
    "id": "defensive", 
    "name": "Defensive Skills",
    "description": "Preventing opponent scoring", 
    "skills": ["man_defense", "rebounding", "steals", "blocks", "help_defense"],
    "weight": 0.3,
    "displayOrder": 2
  }
]
ELO Settings (Football)
json{
  "startingELO": 1200,
  "kFactor": {
    "new": 40,        // New players (< 20 games)
    "established": 20, // Regular players  
    "expert": 16      // High-rated players (>2000 ELO)
  },
  "provisionalGames": 20,
  "minimumParticipants": 10,
  "teamBased": true,
  "allowDraws": true
}
🔧 Management Commands
Seeding Operations
bash# Seed initial activity types
pnpm seed:activity-types

# Update existing activity types with new data  
pnpm seed:activity-types:update

# Mark unused activity types as inactive
pnpm seed:activity-types:cleanup

# Run all seeding operations
pnpm seed:activity-types:full
Database Operations
bash# Generate new migration
pnpm db:generate -- --name "your-migration-name"

# Apply migrations
pnpm db:push

# Open Drizzle Studio (database GUI)
pnpm db:studio
🧪 Testing
Manual Testing
bash# Test basic functionality
curl http://localhost:3000/api/activity-types

# Test filtering
curl http://localhost:3000/api/activity-types/category/team_sports

# Test search
curl "http://localhost:3000/api/activity-types/search?q=basketball"

# Test individual activity
curl http://localhost:3000/api/activity-types/{publicId}
Expected Response Format
json{
  "status": "success", 
  "data": {
    "activityTypes": [...],
    "total": 16
  }
}
🚨 Troubleshooting
Common Issues
1. TypeScript Errors in Zod Schemas

Make sure you're using the function syntax: (schema) => schema.min(3)
Update drizzle-zod to latest version if needed

2. Migration Errors

Check DATABASE_URL is correctly set
Ensure PostgreSQL is running
Verify user has CREATE permissions

3. Seeding Fails

Check activity-types.seed.ts has all required data
Verify JSON schema validation passes
Ensure no duplicate activity names

4. API Endpoints Return 500

Check server logs for detailed errors
Verify database connection
Ensure all imports are correct

Quick Fixes
bash# Reset and re-setup database
pnpm db:push --force
pnpm seed:activity-types

# Check database connection
pnpm db:studio

# View detailed logs
pnpm start # Check console output
🔄 Next Steps
After implementing ActivityTypes, you can:

Update Activity Creation - Modify activity forms to select from ActivityTypes
Add Skill Definitions - Implement the full skill rating system
Build ELO Engine - Use the ELO settings for calculations
Create Activity Matching - Suggest activities based on user ELO/skills
Add Activity Analytics - Track popular activity types and participation

📝 Migration Notes
If you have existing activities:

The migration adds activity_type_id_new column first
Manually map existing activities to new ActivityTypes
Then enable the foreign key constraint
Finally, drop the old activityTypeId column

This prevents data loss during the transition.
