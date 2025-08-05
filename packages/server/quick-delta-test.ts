// quick-delta-test.ts - Fast delta system verification

import 'dotenv/config';

interface TestResult {
  test: string;
  passed: boolean;
  details: string;
  data?: any;
}

class QuickDeltaTest {
  private baseUrl = 'http://localhost:3001/api';
  private results: TestResult[] = [];

  async runTest(): Promise<void> {
    console.log('🚀 Quick Delta System Test\n');

    try {
      await this.testHealthEndpoints();
      await this.testAuthentication();
      await this.testDeltaEndpoints();
      await this.testRealTimeUpdates();
      
      this.printResults();
    } catch (error) {
      console.error('💥 Test failed:', error);
    }
  }

  private async testHealthEndpoints() {
    console.log('🔍 Testing health endpoints...');

    try {
      // Server health
      const healthResponse = await fetch(`${this.baseUrl.replace('/api', '')}/health`);
      const healthData = await healthResponse.json();
      
      this.results.push({
        test: 'Server Health',
        passed: healthResponse.ok && healthData.status === 'healthy',
        details: healthData.status || 'Unknown',
        data: healthData
      });

      // Delta health
      const deltaHealthResponse = await fetch(`${this.baseUrl}/delta/health`);
      const deltaHealthData = await deltaHealthResponse.json();
      
      this.results.push({
        test: 'Delta System Health',
        passed: deltaHealthResponse.ok && deltaHealthData.status === 'healthy',
        details: deltaHealthData.status || 'Unknown',
        data: deltaHealthData
      });

    } catch (error) {
      this.results.push({
        test: 'Health Endpoints',
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : 'Unknown'}`
      });
    }
  }

  private async testAuthentication() {
    console.log('🔐 Testing authentication...');

    try {
      const loginResponse = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'alex@example.com',
          password: 'password123'
        })
      });

      const loginData = await loginResponse.json();
      const token = loginData.data?.tokens?.accessToken;

      this.results.push({
        test: 'User Authentication',
        passed: loginResponse.ok && !!token,
        details: token ? 'Token received' : 'No token',
        data: { hasToken: !!token, userId: loginData.data?.user?.id }
      });

      // Store token for later tests
      (this as any).testToken = token;

    } catch (error) {
      this.results.push({
        test: 'User Authentication',
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : 'Unknown'}`
      });
    }
  }

  private async testDeltaEndpoints() {
    console.log('📊 Testing delta endpoints...');

    const token = (this as any).testToken;
    if (!token) {
      this.results.push({
        test: 'Delta Endpoints',
        passed: false,
        details: 'No auth token available'
      });
      return;
    }

    const headers = { 'Authorization': `Bearer ${token}` };

    try {
      // Test delta status
      const statusResponse = await fetch(`${this.baseUrl}/delta/status`, { headers });
      const statusData = await statusResponse.json();
      
      this.results.push({
        test: 'Delta Status Endpoint',
        passed: statusResponse.ok && statusData.data?.deltaTracking?.enabled,
        details: statusData.data?.deltaTracking?.enabled ? 'Enabled' : 'Disabled',
        data: statusData.data
      });

      // Test delta changes
      const changesResponse = await fetch(`${this.baseUrl}/delta/changes?forceRefresh=true`, { headers });
      const changesData = await changesResponse.json();
      
      this.results.push({
        test: 'Delta Changes Endpoint',
        passed: changesResponse.ok && Array.isArray(changesData.data?.changes),
        details: `${changesData.data?.changes?.length || 0} initial changes`,
        data: { changeCount: changesData.data?.changes?.length || 0 }
      });

      // Test delta reset
      const resetResponse = await fetch(`${this.baseUrl}/delta/reset`, {
        method: 'POST',
        headers
      });
      
      this.results.push({
        test: 'Delta Reset Endpoint',
        passed: resetResponse.ok,
        details: resetResponse.ok ? 'Reset successful' : 'Reset failed'
      });

    } catch (error) {
      this.results.push({
        test: 'Delta Endpoints',
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : 'Unknown'}`
      });
    }
  }

  private async testRealTimeUpdates() {
    console.log('🔄 Testing real-time updates...');

    const token = (this as any).testToken;
    if (!token) {
      this.results.push({
        test: 'Real-time Updates',
        passed: false,
        details: 'No auth token available'
      });
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    try {
      // Get basketball activity type
      const activityTypesResponse = await fetch(`${this.baseUrl}/activity-types`);
      const activityTypesData = await activityTypesResponse.json();
      const basketballType = activityTypesData.data?.activityTypes?.find(
        (at: any) => at.name.toLowerCase().includes('basketball')
      );

      if (!basketballType) {
        this.results.push({
          test: 'Real-time Updates',
          passed: false,
          details: 'No basketball activity type found'
        });
        return;
      }

      // Create activity
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const createResponse = await fetch(`${this.baseUrl}/activities`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          activityTypeId: basketballType.id,
          description: 'Quick Delta Test Activity',
          location: 'Test Court',
          dateTime: tomorrow.toISOString(),
          maxParticipants: 4,
          isELORated: true
        })
      });

      const createData = await createResponse.json();
      const activityId = createData.data?.activity?.id;

      if (!activityId) {
        this.results.push({
          test: 'Real-time Updates',
          passed: false,
          details: 'Failed to create test activity'
        });
        return;
      }

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check for deltas
      const deltasResponse = await fetch(`${this.baseUrl}/delta/changes`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const deltasData = await deltasResponse.json();

      const activityChanges = deltasData.data?.changes?.filter(
        (change: any) => change.entityType === 'activity'
      ) || [];

      this.results.push({
        test: 'Real-time Updates',
        passed: activityChanges.length > 0,
        details: `${activityChanges.length} activity changes detected`,
        data: { 
          activityId, 
          totalChanges: deltasData.data?.changes?.length || 0,
          activityChanges: activityChanges.length
        }
      });

      // Cleanup - delete test activity
      try {
        await fetch(`${this.baseUrl}/activities/${activityId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

    } catch (error) {
      this.results.push({
        test: 'Real-time Updates',
        passed: false,
        details: `Error: ${error instanceof Error ? error.message : 'Unknown'}`
      });
    }
  }

  private printResults() {
    console.log('\n📊 QUICK TEST RESULTS');
    console.log('=' .repeat(40));

    const passed = this.results.filter(r => r.passed);
    const failed = this.results.filter(r => !r.passed);

    console.log(`\n🎯 Overall: ${passed.length}/${this.results.length} tests passed\n`);

    // Show results
    this.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.test}: ${result.details}`);
    });

    // Summary
    if (failed.length === 0) {
      console.log('\n🎉 ALL TESTS PASSED!');
      console.log('✅ Delta system is fully operational');
      console.log('🚀 Ready for frontend integration');
    } else {
      console.log('\n⚠️  SOME TESTS FAILED:');
      failed.forEach(result => {
        console.log(`   • ${result.test}: ${result.details}`);
      });
      
      if (passed.length >= 3) {
        console.log('\n💡 Core functionality appears to work, check failed items');
      } else {
        console.log('\n🔧 Multiple issues detected, review implementation');
      }
    }

    // Next steps
    console.log('\n📋 Next Steps:');
    if (failed.length === 0) {
      console.log('   1. Start frontend development');
      console.log('   2. Implement React Query polling');
      console.log('   3. Add Zustand state management');
    } else {
      console.log('   1. Fix failed tests');
      console.log('   2. Check server logs');
      console.log('   3. Verify database migrations');
      console.log('   4. Run full test suite');
    }
  }
}

// Run test
const tester = new QuickDeltaTest();
tester.runTest().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});