// test-all-endpoints.ts - Comprehensive API Endpoint Testing

import 'dotenv/config';

interface TestResult {
  endpoint: string;
  method: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  statusCode?: number;
  responseTime?: number;
  error?: string;
  data?: any;
}

class EndpointTester {
  private baseUrl = 'http://localhost:3001/api';
  private testResults: TestResult[] = [];
  private authTokens: { [key: string]: string } = {};

  async runAllTests(): Promise<TestResult[]> {
    console.log('🚀 Starting Comprehensive Endpoint Testing...\n');

    try {
      // Phase 1: Authentication & Setup
      await this.testAuthentication();
      
      // Phase 2: Core Activity System
      await this.testActivitySystem();
      
      // Phase 3: Skill Rating Endpoints
      await this.testSkillRatingEndpoints();
      
      // Phase 4: Matchmaking Endpoints
      await this.testMatchmakingEndpoints();
      
      // Phase 5: ELO System Endpoints
      await this.testELOEndpoints();
      
      // Phase 6: Admin Endpoints
      await this.testAdminEndpoints();

      this.printTestSummary();
      return this.testResults;
      
    } catch (error) {
      console.error('💥 Test suite failed:', error);
      throw error;
    }
  }

  private async testAuthentication() {
    console.log('🔐 Testing Authentication Endpoints...');

    // Test user registration
    await this.testEndpoint({
      endpoint: '/auth/register',
      method: 'POST',
      body: {
        username: `testuser_${Date.now()}`,
        email: `test_${Date.now()}@example.com`,
        password: 'password123'
      },
      expectedStatus: 201,
      description: 'User Registration'
    });

    // Test user login with existing user
    const loginResponse = await this.testEndpoint({
      endpoint: '/auth/login',
      method: 'POST', 
      body: {
        email: 'john.doe@example.com', // Assuming this exists from seed data
        password: 'password123'
      },
      expectedStatus: 200,
      description: 'User Login'
    });

    if (loginResponse.status === 'PASS' && loginResponse.data?.data?.tokens?.accessToken) {
      this.authTokens.user1 = loginResponse.data.data.tokens.accessToken;
      console.log('✅ Got auth token for user1');
    }

    // Get second user token
    const login2Response = await this.testEndpoint({
      endpoint: '/auth/login',
      method: 'POST',
      body: {
        email: 'jane.smith@example.com', // Assuming this exists
        password: 'password123'
      },
      expectedStatus: 200,
      description: 'Second User Login'
    });

    if (login2Response.status === 'PASS' && login2Response.data?.data?.tokens?.accessToken) {
      this.authTokens.user2 = login2Response.data.data.tokens.accessToken;
      console.log('✅ Got auth token for user2');
    }
  }

  private async testActivitySystem() {
    console.log('\n🏃 Testing Core Activity System...');

    // Test activity types
    await this.testEndpoint({
      endpoint: '/activity-types',
      method: 'GET',
      expectedStatus: 200,
      description: 'Get Activity Types'
    });

    // Test activity creation
    const createActivityResponse = await this.testEndpoint({
      endpoint: '/activities',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.authTokens.user1}` },
      body: {
        activityTypeId: await this.getActivityTypeId('Tennis'),
        description: 'Test Tennis Match for API Testing',
        location: 'Test Court',
        dateTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
        maxParticipants: 2,
        isELORated: true
      },
      expectedStatus: 201,
      description: 'Create Activity'
    });

    // Store activity ID for later tests
    if (createActivityResponse.status === 'PASS') {
      this.testActivityId = createActivityResponse.data?.data?.activity?.id;
      console.log(`✅ Created test activity: ${this.testActivityId}`);
    }

    // Test joining activity
    if (this.testActivityId && this.authTokens.user2) {
      await this.testEndpoint({
        endpoint: `/activities/${this.testActivityId}/join`,
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.authTokens.user2}` },
        body: {},
        expectedStatus: 200,
        description: 'Join Activity'
      });
    }

    // Test get activities
    await this.testEndpoint({
      endpoint: '/activities',
      method: 'GET',
      expectedStatus: 200,
      description: 'Get All Activities'
    });

    // Test get specific activity
    if (this.testActivityId) {
      await this.testEndpoint({
        endpoint: `/activities/${this.testActivityId}`,
        method: 'GET',
        expectedStatus: 200,
        description: 'Get Specific Activity'
      });
    }
  }

  private async testSkillRatingEndpoints() {
    console.log('\n📊 Testing Skill Rating Endpoints...');

    if (!this.testActivityId || !this.authTokens.user1) {
      console.log('⚠️  Skipping skill rating tests - missing activity or auth');
      return;
    }

    // First complete the activity to enable skill ratings
    await this.testEndpoint({
      endpoint: `/activities/${this.testActivityId}/complete`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.authTokens.user1}` },
      body: {
        results: [
          { userId: await this.getUserId(this.authTokens.user1), finalResult: 'win' },
          { userId: await this.getUserId(this.authTokens.user2), finalResult: 'loss' }
        ],
        processELOImmediately: true
      },
      expectedStatus: 200,
      description: 'Complete Activity for Skill Rating'
    });

    // Wait for ELO processing
    await this.sleep(2000);

    // Test get pending skill ratings
    await this.testEndpoint({
      endpoint: `/skill-ratings/activity/${this.testActivityId}/pending`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.authTokens.user1}` },
      expectedStatus: 200,
      description: 'Get Pending Skill Ratings'
    });

    // Test submit skill ratings
    await this.testEndpoint({
      endpoint: '/skill-ratings',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.authTokens.user1}` },
      body: {
        activityId: this.testActivityId,
        ratedUserId: await this.getUserId(this.authTokens.user2),
        ratings: [
          {
            skillDefinitionId: await this.getSkillDefinitionId('forehand'),
            ratingValue: 8,
            confidence: 4,
            comment: 'Great forehand technique!'
          }
        ],
        isAnonymous: false
      },
      expectedStatus: 201,
      description: 'Submit Skill Ratings'
    });

    // Test get user's skill summary
    await this.testEndpoint({
      endpoint: '/skill-ratings/my-skills',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.authTokens.user2}` },
      expectedStatus: 200,
      description: 'Get My Skills Summary'
    });

    // Test get activity skill ratings status
    await this.testEndpoint({
      endpoint: `/skill-ratings/activity/${this.testActivityId}/status`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.authTokens.user1}` },
      expectedStatus: 200,
      description: 'Get Activity Rating Status'
    });

    // Test get user skill summary (public view)
    const user2Id = await this.getUserId(this.authTokens.user2);
    if (user2Id) {
      await this.testEndpoint({
        endpoint: `/skill-ratings/user/${user2Id}/summary`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.authTokens.user1}` },
        expectedStatus: 200,
        description: 'Get User Skill Summary'
      });
    }
  }

  private async testMatchmakingEndpoints() {
    console.log('\n🎯 Testing Matchmaking Endpoints...');

    if (!this.authTokens.user1) {
      console.log('⚠️  Skipping matchmaking tests - missing auth');
      return;
    }

    const tennisTypeId = await this.getActivityTypeId('Tennis');
    if (!tennisTypeId) {
      console.log('⚠️  Skipping matchmaking tests - Tennis activity type not found');
      return;
    }

    // Test find players
    await this.testEndpoint({
      endpoint: '/matchmaking/find-players',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.authTokens.user1}` },
      body: {
        activityTypeId: tennisTypeId,
        eloTolerance: 300,
        maxResults: 10,
        includeConnections: true,
        avoidRecentOpponents: false
      },
      expectedStatus: [200, 400], // 400 is OK if no ELO data
      description: 'Find Recommended Players'
    });

    // Test get recommended activities
    await this.testEndpoint({
      endpoint: '/matchmaking/recommended-activities',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.authTokens.user1}` },
      query: { limit: '5' },
      expectedStatus: 200,
      description: 'Get Recommended Activities'
    });

    // Test create optimized activity
    await this.testEndpoint({
      endpoint: '/matchmaking/create-optimized-activity',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.authTokens.user1}` },
      body: {
        activityTypeId: tennisTypeId,
        description: 'Optimized Tennis Match',
        location: 'Smart Court',
        dateTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        maxParticipants: 2
      },
      expectedStatus: 201,
      description: 'Create Optimized Activity'
    });

    // Test personalized feed
    await this.testEndpoint({
      endpoint: '/matchmaking/personalized-feed',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.authTokens.user1}` },
      query: { limit: '10' },
      expectedStatus: 200,
      description: 'Get Personalized Feed'
    });

    // Test team balancing (if we have an activity with multiple participants)
    if (this.testActivityId) {
      await this.testEndpoint({
        endpoint: `/matchmaking/preview-balance/${this.testActivityId}`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.authTokens.user1}` },
        query: { teamCount: '2' },
        expectedStatus: [200, 400], // 400 is OK if insufficient participants
        description: 'Preview Team Balance'
      });
    }

    // Test user compatibility
    const user2Id = await this.getUserId(this.authTokens.user2);
    if (user2Id) {
      await this.testEndpoint({
        endpoint: `/matchmaking/compatibility/${user2Id}`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.authTokens.user1}` },
        query: { activityTypeId: tennisTypeId },
        expectedStatus: [200, 400], // 400 is OK if no ELO data
        description: 'Check User Compatibility'
      });
    }
  }

  private async testELOEndpoints() {
    console.log('\n🏆 Testing ELO System Endpoints...');

    if (!this.authTokens.user1) {
      console.log('⚠️  Skipping ELO tests - missing auth');
      return;
    }

    // Test get user's ELO stats
    await this.testEndpoint({
      endpoint: '/activities/my-elo-stats',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${this.authTokens.user1}` },
      expectedStatus: 200,
      description: 'Get My ELO Stats'
    });

    // Test ELO leaderboard
    const tennisTypeId = await this.getActivityTypeId('Tennis');
    if (tennisTypeId) {
      await this.testEndpoint({
        endpoint: `/activities/elo-leaderboard/${tennisTypeId}`,
        method: 'GET',
        query: { limit: '10' },
        expectedStatus: 200,
        description: 'Get ELO Leaderboard'
      });
    }

    // Test ELO status for activity
    if (this.testActivityId) {
      await this.testEndpoint({
        endpoint: `/activities/${this.testActivityId}/elo-status`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.authTokens.user1}` },
        expectedStatus: 200,
        description: 'Get Activity ELO Status'
      });
    }
  }

  private async testAdminEndpoints() {
    console.log('\n👑 Testing Admin Endpoints...');

    // Try to get admin token
    const adminLoginResponse = await this.testEndpoint({
      endpoint: '/auth/login',
      method: 'POST',
      body: {
        email: 'admin@example.com', // Assuming admin user exists
        password: 'password123'
      },
      expectedStatus: [200, 401], // 401 is OK if admin doesn't exist
      description: 'Admin Login'
    });

    let adminToken = null;
    if (adminLoginResponse.status === 'PASS' && adminLoginResponse.data?.data?.tokens?.accessToken) {
      adminToken = adminLoginResponse.data.data.tokens.accessToken;
    }

    if (adminToken) {
      // Test skill rating statistics
      await this.testEndpoint({
        endpoint: '/skill-ratings/statistics',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        expectedStatus: 200,
        description: 'Get Skill Rating Statistics (Admin)'
      });

      // Test suspicious patterns
      await this.testEndpoint({
        endpoint: '/skill-ratings/suspicious-patterns',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        expectedStatus: 200,
        description: 'Get Suspicious Patterns (Admin)'
      });

      // Test matchmaking statistics
      await this.testEndpoint({
        endpoint: '/matchmaking/statistics',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        expectedStatus: 200,
        description: 'Get Matchmaking Statistics (Admin)'
      });
    } else {
      console.log('⚠️  Skipping admin tests - no admin access');
    }
  }

  private async testEndpoint(config: {
    endpoint: string;
    method: string;
    headers?: Record<string, string>;
    body?: any;
    query?: Record<string, string>;
    expectedStatus?: number | number[];
    description: string;
  }): Promise<TestResult> {
    const startTime = Date.now();
    let url = `${this.baseUrl}${config.endpoint}`;
    
    if (config.query) {
      const queryString = new URLSearchParams(config.query).toString();
      url += `?${queryString}`;
    }

    try {
      const fetchConfig: RequestInit = {
        method: config.method,
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
      };

      if (config.body && config.method !== 'GET') {
        fetchConfig.body = JSON.stringify(config.body);
      }

      const response = await fetch(url, fetchConfig);
      const responseTime = Date.now() - startTime;
      
      let data = null;
      try {
        data = await response.json();
      } catch {
        // Response might not be JSON
      }

      const expectedStatuses = Array.isArray(config.expectedStatus) 
        ? config.expectedStatus 
        : [config.expectedStatus || 200];

      const isSuccess = expectedStatuses.includes(response.status);
      
      const result: TestResult = {
        endpoint: config.endpoint,
        method: config.method,
        status: isSuccess ? 'PASS' : 'FAIL',
        statusCode: response.status,
        responseTime,
        data,
        error: isSuccess ? undefined : `Expected ${expectedStatuses}, got ${response.status}`,
      };

      const statusIcon = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${statusIcon} ${config.description}: ${response.status} (${responseTime}ms)`);

      if (result.status === 'FAIL' && data?.error) {
        console.log(`   Error: ${data.error}`);
      }

      this.testResults.push(result);
      return result;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const result: TestResult = {
        endpoint: config.endpoint,
        method: config.method,
        status: 'FAIL',
        responseTime,
        error: error instanceof Error ? error.message : String(error),
      };

      console.log(`❌ ${config.description}: FAILED (${responseTime}ms)`);
      console.log(`   Error: ${result.error}`);

      this.testResults.push(result);
      return result;
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private testActivityId: string | null = null;

  private async getActivityTypeId(name: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/activity-types`);
      const data = await response.json();
      const activityType = data.data?.activityTypes?.find((at: any) => at.name === name);
      return activityType?.id || null;
    } catch {
      return null;
    }
  }

  private async getUserId(token: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      return data.data?.user?.id || null;
    } catch {
      return null;
    }
  }

  private async getSkillDefinitionId(skillName: string): Promise<string | null> {
    // This would need to be implemented based on your skill definitions
    // For now, return a mock ID
    return 'mock-skill-id';
  }

  private printTestSummary() {
    console.log('\n📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(60));

    const passed = this.testResults.filter(r => r.status === 'PASS');
    const failed = this.testResults.filter(r => r.status === 'FAIL');
    const skipped = this.testResults.filter(r => r.status === 'SKIP');

    console.log(`\n🎯 Overall Results: ${passed.length}/${this.testResults.length} passed`);
    console.log(`   ✅ Passed: ${passed.length}`);
    console.log(`   ❌ Failed: ${failed.length}`);
    console.log(`   ⏭️  Skipped: ${skipped.length}`);

    if (failed.length > 0) {
      console.log('\n❌ FAILED ENDPOINTS:');
      failed.forEach(result => {
        console.log(`   ${result.method} ${result.endpoint} - ${result.statusCode} (${result.error})`);
      });
    }

    console.log('\n📈 PERFORMANCE METRICS:');
    const avgResponseTime = this.testResults
      .filter(r => r.responseTime)
      .reduce((sum, r) => sum + (r.responseTime || 0), 0) / this.testResults.length;
    
    console.log(`   Average Response Time: ${Math.round(avgResponseTime)}ms`);
    
    const slowestEndpoints = this.testResults
      .filter(r => r.responseTime && r.responseTime > 1000)
      .sort((a, b) => (b.responseTime || 0) - (a.responseTime || 0));
    
    if (slowestEndpoints.length > 0) {
      console.log(`   Slow Endpoints (>1s):`);
      slowestEndpoints.slice(0, 3).forEach(r => {
        console.log(`     ${r.method} ${r.endpoint}: ${r.responseTime}ms`);
      });
    }

    console.log('\n🏆 ENDPOINT COVERAGE:');
    const endpointCategories = {
      'Authentication': this.testResults.filter(r => r.endpoint.startsWith('/auth')),
      'Activities': this.testResults.filter(r => r.endpoint.startsWith('/activities')),
      'Skill Ratings': this.testResults.filter(r => r.endpoint.startsWith('/skill-ratings')),
      'Matchmaking': this.testResults.filter(r => r.endpoint.startsWith('/matchmaking')),
      'Admin': this.testResults.filter(r => r.endpoint.includes('statistics') || r.endpoint.includes('suspicious')),
    };

    Object.entries(endpointCategories).forEach(([category, results]) => {
      const categoryPassed = results.filter(r => r.status === 'PASS').length;
      console.log(`   ${category}: ${categoryPassed}/${results.length} passed`);
    });

    const successRate = (passed.length / this.testResults.length) * 100;
    console.log(`\n🎊 Overall Success Rate: ${successRate.toFixed(1)}%`);

    if (successRate >= 90) {
      console.log('🌟 EXCELLENT! Your API is working great!');
    } else if (successRate >= 75) {
      console.log('👍 GOOD! Most endpoints are working well.');
    } else if (successRate >= 50) {
      console.log('⚠️  NEEDS WORK! Several endpoints need attention.');
    } else {
      console.log('🚨 CRITICAL! Many endpoints are failing.');
    }
  }
}

// Main execution
async function main() {
  console.log('🧪 COMPREHENSIVE API ENDPOINT TESTING');
  console.log('Testing all phases of the sports activity platform API\n');

  const tester = new EndpointTester();
  
  try {
    const results = await tester.runAllTests();
    
    console.log('\n✨ Testing Complete!');
    console.log('Check the summary above for detailed results.');
    
  } catch (error) {
    console.error('\n💥 Testing failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => {
    console.log('\n🏁 All endpoint testing completed!');
    process.exit(0);
  });
}

export { EndpointTester };