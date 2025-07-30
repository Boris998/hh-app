import { db } from '../client.js';
import { 
  skillDefinitions, 
  activityTypeSkills, 
  users, 
  userActivityTypeELOs,
  activities,
  activityParticipants 
} from '../schema.js';

export async function verifyMigration() {
  console.log('🔍 Verifying data migration...');
  
  // Check skill definitions
  const skills = await db.select().from(skillDefinitions);
  console.log(`✅ Skill Definitions: ${skills.length}`);
  
  // Check activity-skill relationships
  const relationships = await db.select().from(activityTypeSkills);
  console.log(`✅ Activity-Skill Relationships: ${relationships.length}`);
  
  // Check users
  const allUsers = await db.select().from(users);
  console.log(`✅ Users: ${allUsers.length}`);
  
  // Check ELO records
  const eloRecords = await db.select().from(userActivityTypeELOs);
  console.log(`✅ ELO Records: ${eloRecords.length}`);
  
  // Check activities
  const allActivities = await db.select().from(activities);
  console.log(`✅ Activities: ${allActivities.length}`);
  
  // Check participants
  const participants = await db.select().from(activityParticipants);
  console.log(`✅ Activity Participants: ${participants.length}`);
  
  console.log('\n🎉 Data verification completed!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyMigration().then(() => process.exit(0));
}