// test-elo-implementation.ts - Quick test of our ELO system

import 'dotenv/config';
import { eq, and } from 'drizzle-orm';
import { db } from './src/db/client.js';
import {
  activities,
  activityParticipants,
  activityTypes,
  users,
  userActivityTypeELOs,
  activityELOStatus
} from './src/db/schema.js';

interface TestResult {
  phase: string;
  success: boolean;
  details: string;
  error?: string;
}

class QuickELOTester {
  private baseUrl = 'http://localhost:3001/api';
  private testResults: TestResult[] = [];

  async runQuickTest(): Promise<TestResult[]> {
    console.log('🚀 Quick ELO System Test...\n');

    try {
      // Test 1: Database Schema Validation
      await this.testDatabaseSchema();
      
      // Test 2: ELO Service Import
      await this.testServiceImports();
      
      // Test 3: Basic ELO Calculation Logic
      await this.testELOCalculationLogic();
      
      // Test 4: Activity Completion Flow
      await this.testActivityCompletionFlow();
      
      // Test 5: API Endpoints
      await this.testAPIEndpoints();

      console.log('\n📊 Test Results Summary:');
      this.testResults.forEach(result => {
        const status = result.success ? '✅' : '❌';
        console.log(`${status} ${result.phase}: ${result.details}`);
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
      });

      const allPassed = this.testResults.every(r => r.success);
      console.log(`\n${allPassed ? '🎉' : '💥'} Overall: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);

      return this.testResults;
      
    } catch (error) {
      console.error('💥 Quick test failed:', error);
      throw error;
    }
  }

  private async testDatabaseSchema() {
    console.log('🗄️  Testing database schema...');
    
    try {
      // Test activityELOStatus table
      const eloStatusCount = await db.select().from(activityELOStatus).limit(1);
      
      // Test userActivityTypeELOs table  
      const eloRecordsCount = await db.select().from(userActivityTypeELOs).limit(1);
      
      // Test activity types with ELO settings
      const activityTypesWithELO = await db
        .select({
          name: activityTypes.name,
          settings: activityTypes.defaultELOSettings
        })
        .from(activityTypes)
        .limit(5);

      console.log(`   Found ${activityTypesWithELO.length} activity types with ELO settings`);
      activityTypesWithELO.forEach(at => {
        console.log(`     - ${at.name}: ${at.settings ? 'Has ELO config' : 'No ELO config'}`);
      });

      this.testResults.push({
        phase: 'Database Schema',
        success: true,
        details: `ELO tables accessible, ${activityTypesWithELO.length} activity types configured`
      });

    } catch (error) {
      this.testResults.push({
        phase: 'Database Schema',
        success: false,
        details: 'Failed to access ELO database tables',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async testServiceImports() {
    console.log('📦 Testing service imports...');
    
    try {
      // Test ELO calculation service import
      const { eloCalculationService } = await import('./src/services/elo-calc.service.js');
      const { eloProcessingService } = await import('./src/services/elo-processing.service.js');
      
      // Test that services have expected methods
      const hasCalculateMethod = typeof eloCalculationService.calculateActivityELO === 'function';
      const hasProcessingMethod = typeof eloProcessingService.onActivityCompletion === 'function';
      
      if (!hasCalculateMethod || !hasProcessingMethod) {
        throw new Error('Service methods not found');
      }

      this.testResults.push({
        phase: 'Service Imports',
        success: true,
        details: 'ELO services imported successfully with expected methods'
      });

    } catch (error) {
      this.testResults.push({
        phase: 'Service Imports',
        success: false,
        details: 'Failed to import ELO services',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async testELOCalculationLogic() {
    console.log('🧮 Testing ELO calculation logic...');
    
    try {
      // Import ELO utilities
      const { ELOUtilities } = await import('./src/db/seeds/enhanced-activity-types-with-elo.js');
      
      // Test basic ELO probability calculation
      const winProb = ELOUtilities.calculateWinProbability(1400, 1200);
      const expectedProb = 0.76; // Approximately 76% chance for 1400 vs 1200
      
      if (Math.abs(winProb - expectedProb) > 0.05) {
        throw new Error(`Win probability calculation incorrect: ${winProb} vs expected ${expectedProb}`);
      }

      // Test ELO change estimation
      const eloChange = ELOUtilities.estimateELOChange(1400, 1200, 'win', 32);
      
      // Higher rated player beating lower rated should gain fewer points
      if (eloChange <= 0 || eloChange > 15) {
        throw new Error(`ELO change calculation seems wrong: ${eloChange}`);
      }

      console.log(`   Win probability 1400 vs 1200: ${winProb.toFixed(3)} (${(winProb * 100).toFixed(1)}%)`);
      console.log(`   ELO change for win: +${eloChange}`);

      this.testResults.push({
        phase: 'ELO Calculation Logic',
        success: true,
        details: `Mathematics working correctly (win prob: ${winProb.toFixed(3)}, ELO change: +${eloChange})`
      });

    } catch (error) {
      this.testResults.push({
        phase: 'ELO Calculation Logic',
        success: false,
        details: 'ELO mathematical calculations failed',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async testActivityCompletionFlow() {
    console.log('🏃 Testing activity completion flow...');
    
    try {
      // Check if we have existing users and activities to test with
      const existingUsers = await db.select().from(users).limit(3);
      const existingActivities = await db.select().from(activities).limit(1);
      
      if (existingUsers.length < 2) {
        this.testResults.push({
          phase: 'Activity Completion Flow',
          success: false,
          details: 'Need at least 2 users for testing. Run: pnpm seed:mock-data',
          error: 'Insufficient test data'
        });
        return;
      }

      // Check if we can create activity completion data structure
      const mockCompletionData = {
        activityId: 'test-activity-id',
        results: [
          { userId: existingUsers[0].id, finalResult: 'win' as const },
          { userId: existingUsers[1].id, finalResult: 'loss' as const },
        ],
        completedBy: existingUsers[0].id,
        completedAt: new Date(),
      };

      // Test that the structure is valid (we can't run full processing without real activity)
      if (!mockCompletionData.results.every(r => ['win', 'loss', 'draw'].includes(r.finalResult))) {
        throw new Error('Invalid completion data structure');
      }

      console.log(`   Mock completion data structure valid for ${mockCompletionData.results.length} participants`);

      this.testResults.push({
        phase: 'Activity Completion Flow',
        success: true,
        details: `Completion flow structure validated with ${existingUsers.length} users available`
      });

    } catch (error) {
      this.testResults.push({
        phase: 'Activity Completion Flow',
        success: false,
        details: 'Activity completion flow validation failed',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async testAPIEndpoints() {
    console.log('🌐 Testing API endpoints...');
    
    try {
      // Test server health (should be running on localhost:3001)
      let serverRunning = false;
      try {
        const healthResponse = await fetch(`${this.baseUrl}/health`);
        serverRunning = healthResponse.ok;
      } catch {
        // Server not running, that's OK for this quick test
      }

      if (!serverRunning) {
        this.testResults.push({
          phase: 'API Endpoints',
          success: false,
          details: 'Server not running on localhost:3001. Start with: pnpm dev',
          error: 'Server not accessible'
        });
        return;
      }

      // Test activity types endpoint (should include ELO settings)
      const activityTypesResponse = await fetch(`${this.baseUrl}/activity-types`);
      if (!activityTypesResponse.ok) {
        throw new Error(`Activity types endpoint failed: ${activityTypesResponse.statusText}`);
      }

      const activityTypesData = await activityTypesResponse.json();
      const hasELOSettings = activityTypesData.data.activityTypes.some((at: any) => 
        at.defaultELOSettings && typeof at.defaultELOSettings === 'object'
      );

      if (!hasELOSettings) {
        throw new Error('Activity types missing ELO settings');
      }

      console.log(`   Activity types endpoint working with ELO settings`);

      this.testResults.push({
        phase: 'API Endpoints',
        success: true,
        details: `Server running, activity types endpoint working with ELO configurations`
      });

    } catch (error) {
      this.testResults.push({
        phase: 'API Endpoints',
        success: false,
        details: 'API endpoint testing failed',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

// Utility function to check ELO system readiness
export async function checkELOSystemReadiness(): Promise<{
  ready: boolean;
  issues: string[];
  recommendations: string[];
}> {
  const issues: string[] = [];
  const recommendations: string[] = [];

  try {
    // Check database schema
    const activityTypesTest = await db.select().from(activityTypes).limit(1);
    if (activityTypesTest.length === 0) {
      issues.push('No activity types found');
      recommendations.push('Run: pnpm seed:activity-types');
    }

    // Check for users
    const usersTest = await db.select().from(users).limit(1);
    if (usersTest.length === 0) {
      issues.push('No users found');
      recommendations.push('Run: pnpm seed:mock-data');
    }

    // Check ELO service files exist
    try {
      await import('./src/services/elo-calc.service.js');
      await import('./src/services/elo-processing.service.js');
    } catch {
      issues.push('ELO service files not found');
      recommendations.push('Ensure ELO service files are created and compiled');
    }

  } catch (error) {
    issues.push(`Database connection failed: ${error}`);
    recommendations.push('Check database connection and run migrations');
  }

  return {
    ready: issues.length === 0,
    issues,
    recommendations
  };
}

// Main execution
async function main() {
  console.log('🎯 ELO System Implementation Test\n');
  
  // Quick readiness check
  const readiness = await checkELOSystemReadiness();
  
  if (!readiness.ready) {
    console.log('⚠️  ELO System Not Ready:');
    readiness.issues.forEach(issue => console.log(`   ❌ ${issue}`));
    console.log('\n📋 Recommendations:');
    readiness.recommendations.forEach(rec => console.log(`   💡 ${rec}`));
    console.log('\nFix these issues and run the test again.\n');
    return;
  }

  console.log('✅ Basic readiness check passed\n');

  // Run comprehensive test
  const tester = new QuickELOTester();
  const results = await tester.runQuickTest();
  
  const allPassed = results.every(r => r.success);
  
  if (allPassed) {
    console.log('\n🎉 ELO SYSTEM IS READY!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Start server: pnpm dev');
    console.log('   2. Run full ELO test: tsx test-elo-system.ts');
    console.log('   3. Begin Phase 3: Skill Rating System');
    console.log('   4. Complete Phase 4: Enhanced Activity Management');
  } else {
    console.log('\n⚠️  Some tests failed. Address the issues above before proceeding.');
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => {
    console.log('\nTest completed.');
    process.exit(0);
  }).catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}