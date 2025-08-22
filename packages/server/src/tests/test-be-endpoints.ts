// test-backend-endpoints.ts - Test all critical backend endpoints
import 'dotenv/config';

const BASE_URL = 'http://localhost:3001';

interface TestResult {
  endpoint: string;
  method: string;
  status: 'PASS' | 'FAIL';
  responseTime: number;
  details: string;
}

class BackendTester {
  private results: TestResult[] = [];
  private authToken: string | null = null;

  async runAllTests() {
    console.log('🚀 Testing Backend Endpoints\n');
    console.log('=' .repeat(50));

    try {
      await this.testServerHealth();
      await this.testAuthentication();
      await this.testUserEndpoints();
      await this.testDeltaEndpoints();
      await this.testActivityEndpoints();
      
      this.printResults();
    } catch (error) {
      console.error('❌ Test suite failed:', error);
    }
  }

  private async testServerHealth() {
    console.log('\n🏥 Testing Server Health...');
    
    await this.testEndpoint('GET', '/health', null, {
      expectStatus: 200,
      expectFields: ['status', 'timestamp']
    });

    await this.testEndpoint('GET', '/', null, {
      expectStatus: 200,
      expectFields: ['message', 'version']
    });
  }

  private async testAuthentication() {
    console.log('\n🔐 Testing Authentication...');
    
    // Test login
    const loginResult = await this.testEndpoint('POST', '/api/auth/login', {
      email: 'btadirov16@gmail.com',
      password: '1_Pass@hH-app'
    }, {
      expectStatus: 200,
      expectFields: ['status', 'data']
    });

    if (loginResult.status === 'PASS') {
      // Extract token for subsequent tests
      try {
        const response = await fetch(`${BASE_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'btadirov16@gmail@gmail.com',
            password: '1_Pass@hH-app'
          })
        });
        const data = await response.json();
        this.authToken = data.data?.tokens?.accessToken;
        console.log(`   ✅ Auth token obtained: ${this.authToken ? 'Yes' : 'No'}`);
      } catch (error) {
        console.log(`   ❌ Failed to extract auth token`);
      }
    }
  }

  private async testUserEndpoints() {
    console.log('\n👤 Testing User Endpoints...');
    
    if (!this.authToken) {
      console.log('   ⚠️  Skipping user tests - no auth token');
      return;
    }

    // Get user ID first
    const userId = await this.getUserId();
    if (!userId) {
      console.log('   ❌ Could not determine user ID');
      return;
    }

    console.log(`   📝 Testing with user ID: ${userId}`);

    // Test quick stats
    await this.testEndpoint('GET', `/api/users/${userId}/quick-stats`, null, {
      expectStatus: 200,
      headers: { 'Authorization': `Bearer ${this.authToken}` },
      expectFields: ['status', 'data']
    });

    // Test ELO data
    await this.testEndpoint('GET', `/api/users/${userId}/elo`, null, {
      expectStatus: 200,
      headers: { 'Authorization': `Bearer ${this.authToken}` },
      expectFields: ['status', 'data']
    });

    // Test skills data
    await this.testEndpoint('GET', `/api/users/${userId}/skills`, null, {
      expectStatus: 200,
      headers: { 'Authorization': `Bearer ${this.authToken}` },
      expectFields: ['status', 'data']
    });
  }

  private async testDeltaEndpoints() {
    console.log('\n📊 Testing Delta Endpoints...');

    // Test delta health (no auth required)
    await this.testEndpoint('GET', '/api/delta/health', null, {
      expectStatus: 200,
      expectFields: ['status', 'timestamp']
    });

    if (!this.authToken) {
      console.log('   ⚠️  Skipping authenticated delta tests - no auth token');
      return;
    }

    // Test delta status
    await this.testEndpoint('GET', '/api/delta/status', null, {
      expectStatus: 200,
      headers: { 'Authorization': `Bearer ${this.authToken}` },
      expectFields: ['status', 'data']
    });

    // Test delta changes (main polling endpoint)
    await this.testEndpoint('GET', '/api/delta/changes', null, {
      expectStatus: 200,
      headers: { 'Authorization': `Bearer ${this.authToken}` },
      expectFields: ['status', 'data']
    });

    // Test delta changes with query params
    await this.testEndpoint('GET', '/api/delta/changes?forceRefresh=true', null, {
      expectStatus: 200,
      headers: { 'Authorization': `Bearer ${this.authToken}` },
      expectFields: ['status', 'data']
    });

    // Test legacy delta endpoint
    await this.testEndpoint('GET', '/api/deltas', null, {
      expectStatus: [200, 404], // May redirect or not found
      headers: { 'Authorization': `Bearer ${this.authToken}` }
    });
  }

  private async testActivityEndpoints() {
    console.log('\n🏃 Testing Activity Endpoints...');

    // Test activity types (no auth required)
    await this.testEndpoint('GET', '/api/activity-types', null, {
      expectStatus: 200,
      expectFields: ['status', 'data']
    });

    if (!this.authToken) {
      console.log('   ⚠️  Skipping authenticated activity tests - no auth token');
      return;
    }

    // Test activities list
    await this.testEndpoint('GET', '/api/activities', null, {
      expectStatus: 200,
      headers: { 'Authorization': `Bearer ${this.authToken}` },
      expectFields: ['status', 'data']
    });

    // Test user's ELO stats
    await this.testEndpoint('GET', '/api/activities/my-elo-stats', null, {
      expectStatus: 200,
      headers: { 'Authorization': `Bearer ${this.authToken}` },
      expectFields: ['status', 'data']
    });
  }

  private async testEndpoint(
    method: string, 
    path: string, 
    body: any = null, 
    options: {
      expectStatus?: number | number[];
      headers?: Record<string, string>;
      expectFields?: string[];
    } = {}
  ): Promise<TestResult> {
    const startTime = Date.now();
    const url = `${BASE_URL}${path}`;
    
    try {
      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      };

      if (body && method !== 'GET') {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);
      const responseTime = Date.now() - startTime;
      
      let responseData;
      try {
        responseData = await response.json();
      } catch {
        responseData = await response.text();
      }

      // Check status
      const expectedStatuses = Array.isArray(options.expectStatus) 
        ? options.expectStatus 
        : [options.expectStatus || 200];
      
      const statusMatch = expectedStatuses.includes(response.status);
      
      // Check required fields
      let fieldsMatch = true;
      if (options.expectFields && typeof responseData === 'object') {
        fieldsMatch = options.expectFields.every(field => 
          responseData.hasOwnProperty(field)
        );
      }

      const success = statusMatch && fieldsMatch;
      const result: TestResult = {
        endpoint: `${method} ${path}`,
        method,
        status: success ? 'PASS' : 'FAIL',
        responseTime,
        details: success 
          ? `${response.status} (${responseTime}ms)`
          : `Status: ${response.status}, Expected: ${expectedStatuses.join('|')}`
      };

      this.results.push(result);
      
      const icon = success ? '✅' : '❌';
      console.log(`   ${icon} ${method} ${path} - ${result.details}`);
      
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const result: TestResult = {
        endpoint: `${method} ${path}`,
        method,
        status: 'FAIL',
        responseTime,
        details: `Error: ${error instanceof Error ? error.message : 'Unknown'}`
      };
      
      this.results.push(result);
      console.log(`   ❌ ${method} ${path} - ${result.details}`);
      
      return result;
    }
  }

  private async getUserId(): Promise<string | null> {
    try {
      if (!this.authToken) return null;
      
      // Decode JWT to get user ID (simple approach)
      const payload = this.authToken.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      return decoded.userId || decoded.sub || null;
    } catch (error) {
      console.log('   ⚠️  Could not extract user ID from token');
      return null;
    }
  }

  private printResults() {
    console.log('\n📊 TEST RESULTS');
    console.log('=' .repeat(50));

    const passed = this.results.filter(r => r.status === 'PASS');
    const failed = this.results.filter(r => r.status === 'FAIL');

    console.log(`\n🎯 Overall: ${passed.length}/${this.results.length} tests passed`);
    
    if (failed.length > 0) {
      console.log('\n❌ FAILED TESTS:');
      failed.forEach(result => {
        console.log(`   • ${result.endpoint}: ${result.details}`);
      });
    }

    if (passed.length > 0) {
      console.log('\n✅ PASSED TESTS:');
      passed.forEach(result => {
        console.log(`   • ${result.endpoint}: ${result.details}`);
      });
    }

    // Performance summary
    const avgResponseTime = this.results.reduce((sum, r) => sum + r.responseTime, 0) / this.results.length;
    console.log(`\n⚡ Performance: ${avgResponseTime.toFixed(0)}ms average response time`);

    // Next steps
    console.log('\n📋 NEXT STEPS:');
    if (failed.length === 0) {
      console.log('   🎉 All tests passed! Backend is ready for frontend integration.');
      console.log('   📱 Start the frontend: cd packages/client && npm run dev');
      console.log('   🔄 The delta polling should now work correctly.');
    } else if (passed.length >= this.results.length * 0.7) {
      console.log('   💡 Most tests passed. Fix the failing endpoints:');
      failed.forEach(result => {
        if (result.details.includes('ERR_CONNECTION_REFUSED')) {
          console.log(`      🔧 Server not running: npm run dev in packages/server`);
        } else if (result.details.includes('404')) {
          console.log(`      🔗 Missing route: ${result.endpoint}`);
        } else {
          console.log(`      🐛 Debug: ${result.endpoint}`);
        }
      });
    } else {
      console.log('   🔧 Multiple issues detected. Check:');
      console.log('      1. Server is running: npm run dev in packages/server');
      console.log('      2. Database is accessible');
      console.log('      3. Routes are properly configured');
      console.log('      4. Test users exist in database');
    }
  }
}

// Run the tests
const tester = new BackendTester();
tester.runAllTests().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});