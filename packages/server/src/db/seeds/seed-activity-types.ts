// src/db/seeds/seed-activity-types.ts
import { eq, and, not, inArray } from 'drizzle-orm';
import { db } from '../client.js';
import { activityTypes } from '../schema.js';
import { validateELOSettings, validateSkillCategories } from '../activity-types.schema.js';
import { activityTypesSeedData } from './activity-type.seed.js';

/**
 * Seeds the database with predefined activity types
 * This should be run during initial setup or when new activity types are added
 */
export async function seedActivityTypes() {
  console.log('🌱 Starting ActivityTypes seeding...');
  
  try {
    // Validate all seed data before inserting
    console.log('🔍 Validating seed data...');
    for (const activityType of activityTypesSeedData) {
      // Validate skill categories structure
      validateSkillCategories(activityType.skillCategories);
      
      // Validate ELO settings structure
      validateELOSettings(activityType.defaultELOSettings);
      
      console.log(`✅ Validated: ${activityType.name}`);
    }

    // Check for existing activity types to avoid duplicates
    const existingActivityTypes = await db
      .select({ name: activityTypes.name })
      .from(activityTypes);
    
    const existingNames = new Set(existingActivityTypes.map(at => at.name.toLowerCase()));
    
    // Filter out activity types that already exist
    const newActivityTypes = activityTypesSeedData.filter(
      at => !existingNames.has(at.name.toLowerCase())
    );

    if (newActivityTypes.length === 0) {
      console.log('ℹ️  All activity types already exist in database');
      return;
    }

    console.log(`📥 Inserting ${newActivityTypes.length} new activity types...`);
    
    // Insert new activity types in batches for better performance
    const batchSize = 5;
    for (let i = 0; i < newActivityTypes.length; i += batchSize) {
      const batch = newActivityTypes.slice(i, i + batchSize);
      
      const insertedBatch = await db
        .insert(activityTypes)
        .values(batch)
        .returning({ id: activityTypes.id, name: activityTypes.name });
      
      for (const inserted of insertedBatch) {
        console.log(`✅ Inserted: ${inserted.name} (ID: ${inserted.id})`);
      }
    }

    console.log('🎉 ActivityTypes seeding completed successfully!');
    
    // Log summary
    const totalActivityTypes = await db
      .select({ count: activityTypes.id })
      .from(activityTypes);
    
    console.log(`📊 Total activity types in database: ${totalActivityTypes.length}`);
    
  } catch (error) {
    console.error('❌ Error seeding ActivityTypes:', error);
    throw error;
  }
}

/**
 * Updates existing activity types with new data
 * Useful for updating skill categories or ELO settings
 */
export async function updateActivityTypes() {
  console.log('🔄 Starting ActivityTypes update...');
  
  try {
    for (const seedData of activityTypesSeedData) {
      const existing = await db
        .select()
        .from(activityTypes)
        .where(eq(activityTypes.name, seedData.name))
        .limit(1);
      
      if (existing.length > 0) {
        await db
          .update(activityTypes)
          .set({
            description: seedData.description,
            skillCategories: seedData.skillCategories,
            defaultELOSettings: seedData.defaultELOSettings,
            displayOrder: seedData.displayOrder,
            updatedAt: new Date()
          })
          .where(eq(activityTypes.id, existing[0].id));
        
        console.log(`🔄 Updated: ${seedData.name}`);
      }
    }
    
    console.log('✅ ActivityTypes update completed!');
    
  } catch (error) {
    console.error('❌ Error updating ActivityTypes:', error);
    throw error;
  }
}

/**
 * Remove inactive or deprecated activity types
 */
export async function cleanupActivityTypes() {
  console.log('🧹 Starting ActivityTypes cleanup...');
  
  try {
    // Mark unused activity types as inactive instead of deleting
    // (to preserve referential integrity)
    const seedNames = activityTypesSeedData.map(at => at.name);
    
    const deprecatedTypes = await db
      .update(activityTypes)
      .set({ 
        isActive: false, 
        updatedAt: new Date() 
      })
      .where(and(
        not(inArray(activityTypes.name, seedNames)),
        eq(activityTypes.isActive, true)
      ))
      .returning({ name: activityTypes.name });
    
    if (deprecatedTypes.length > 0) {
      console.log(`📝 Marked ${deprecatedTypes.length} activity types as inactive:`);
      deprecatedTypes.forEach(type => console.log(`  - ${type.name}`));
    } else {
      console.log('ℹ️  No activity types to cleanup');
    }
    
  } catch (error) {
    console.error('❌ Error cleaning up ActivityTypes:', error);
    throw error;
  }
}

// CLI interface for running seeder
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  
  switch (command) {
    case 'seed':
      await seedActivityTypes();
      break;
    case 'update':
      await updateActivityTypes();
      break;
    case 'cleanup':
      await cleanupActivityTypes();
      break;
    case 'full':
      await seedActivityTypes();
      await updateActivityTypes();
      await cleanupActivityTypes();
      break;
    default:
      console.log('Usage: tsx seed-activity-types.ts [seed|update|cleanup|full]');
      process.exit(1);
  }
  
  process.exit(0);
}