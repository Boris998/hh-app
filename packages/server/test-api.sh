#!/bin/bash

# Sports Activity Platform - Complete cURL API Testing Script
# Usage: ./test_api.sh
# Make sure your server is running on localhost:3000

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# API Configuration
API_BASE="http://localhost:3000/api"
SERVER_BASE="http://localhost:3000"

# Global variables
ACCESS_TOKEN=""
USER_ID=""
ACTIVITY_ID=""
ACTIVITY_TYPE_ID=""

# Helper Functions
print_header() {
    echo -e "\n${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}\n"
}

print_test() {
    echo -e "${YELLOW}Testing: $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}\n"
}

print_error() {
    echo -e "${RED}❌ $1${NC}\n"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Test server health
test_server_health() {
    print_header "SERVER HEALTH CHECK"
    
    print_test "Server root endpoint"
    curl -s -w "\nStatus: %{http_code}\n" \
         "$SERVER_BASE/" || print_error "Server not responding"
    
    print_test "Health check endpoint"
    curl -s -w "\nStatus: %{http_code}\n" \
         "$SERVER_BASE/health" || print_error "Health endpoint failed"
}

# Authentication Tests
test_authentication() {
    print_header "AUTHENTICATION TESTS"
    
    # Test user registration (optional - might fail if user exists)
    print_test "User Registration (optional)"
    REGISTER_RESPONSE=$(curl -s -w "\nSTATUS:%{http_code}" \
        -X POST "$API_BASE/auth/register" \
        -H "Content-Type: application/json" \
        -d '{
            "username": "test_user_'$(date +%s)'",
            "email": "test'$(date +%s)'@example.com",
            "password": "Test123!@#"
        }' 2>/dev/null)
    
    if echo "$REGISTER_RESPONSE" | grep -q "STATUS:201"; then
        print_success "Registration successful"
    else
        print_info "Registration skipped (user might exist)"
    fi
    
    # Test user login with existing user
    print_test "User Login"
    LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" \
        -H "Content-Type: application/json" \
        -d '{
            "email": "btadirov16@gmail.com",
            "password": "1_Pass@hH-app"
        }')
    
    # Extract token and user ID
    ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    USER_ID=$(echo "$LOGIN_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    
    if [[ -n "$ACCESS_TOKEN" && -n "$USER_ID" ]]; then
        print_success "Login successful - Token: ${ACCESS_TOKEN:0:20}..."
        print_info "User ID: $USER_ID"
    else
        print_error "Login failed"
        echo "Response: $LOGIN_RESPONSE"
        exit 1
    fi
    
    # Test token verification
    print_test "Token verification (/auth/me)"
    AUTH_ME_RESPONSE=$(curl -s -w "\nSTATUS:%{http_code}" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        "$API_BASE/auth/me")
    
    if echo "$AUTH_ME_RESPONSE" | grep -q "STATUS:200"; then
        print_success "Token verification successful"
    else
        print_error "Token verification failed"
    fi
}

# Activity Types Tests
test_activity_types() {
    print_header "ACTIVITY TYPES TESTS"
    
    print_test "Get all activity types"
    ACTIVITY_TYPES_RESPONSE=$(curl -s -w "\nSTATUS:%{http_code}" \
        "$API_BASE/activity-types")
    
    if echo "$ACTIVITY_TYPES_RESPONSE" | grep -q "STATUS:200"; then
        print_success "Activity types retrieved"
        # Extract first activity type ID for later use
        ACTIVITY_TYPE_ID=$(echo "$ACTIVITY_TYPES_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        print_info "Sample Activity Type ID: $ACTIVITY_TYPE_ID"
    else
        print_error "Failed to get activity types"
    fi
    
    print_test "Get activity types with skills"
    curl -s -w "\nSTATUS:%{http_code}\n" \
        "$API_BASE/activity-types?includeSkills=true" \
        | head -10
}

# Activities Tests
test_activities() {
    print_header "ACTIVITIES TESTS"
    
    print_test "Get activities list (basic)"
    curl -s -w "\nSTATUS:%{http_code}\n" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        "$API_BASE/activities?page=1&limit=5" \
        | head -10
    
    print_test "Get activities with date filter"
    TOMORROW=$(date -d "+1 day" -Iseconds)
    curl -s -w "\nSTATUS:%{http_code}\n" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        "$API_BASE/activities?page=1&limit=5&dateFrom=$TOMORROW" \
        | head -10
    
    # Create a new activity
    print_test "Create new activity"
    if [[ -n "$ACTIVITY_TYPE_ID" ]]; then
        FUTURE_DATE=$(date -d "+7 days" -Iseconds)
        CREATE_ACTIVITY_RESPONSE=$(curl -s -w "\nSTATUS:%{http_code}" \
            -X POST "$API_BASE/activities" \
            -H "Authorization: Bearer $ACCESS_TOKEN" \
            -H "Content-Type: application/json" \
            -d '{
                "activityTypeId": "'$ACTIVITY_TYPE_ID'",
                "description": "Test Activity via cURL",
                "location": "Test Location",
                "dateTime": "'$FUTURE_DATE'",
                "maxParticipants": 10,
                "isELORated": true
            }')
        
        if echo "$CREATE_ACTIVITY_RESPONSE" | grep -q "STATUS:201"; then
            print_success "Activity created successfully"
            ACTIVITY_ID=$(echo "$CREATE_ACTIVITY_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
            print_info "Activity ID: $ACTIVITY_ID"
        else
            print_error "Failed to create activity"
            echo "Response: $CREATE_ACTIVITY_RESPONSE"
        fi
    else
        print_info "Skipping activity creation - no activity type ID"
    fi
    
    # Get specific activity
    if [[ -n "$ACTIVITY_ID" ]]; then
        print_test "Get specific activity details"
        curl -s -w "\nSTATUS:%{http_code}\n" \
            -H "Authorization: Bearer $ACCESS_TOKEN" \
            "$API_BASE/activities/$ACTIVITY_ID" \
            | head -15
    fi
}

# Users Tests
test_users() {
    print_header "USERS TESTS"
    
    print_test "Get user quick stats"
    curl -s -w "\nSTATUS:%{http_code}\n" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        "$API_BASE/users/$USER_ID/quick-stats" \
        | head -10
    
    print_test "Get user ELO ratings"
    curl -s -w "\nSTATUS:%{http_code}\n" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        "$API_BASE/users/$USER_ID/elo" \
        | head -10
    
    print_test "Get user connection requests"
    curl -s -w "\nSTATUS:%{http_code}\n" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        "$API_BASE/users/connections/requests" \
        | head -10
}

# Invitations Tests
test_invitations() {
    print_header "INVITATIONS TESTS"
    
    print_test "Get user invitations"
    curl -s -w "\nSTATUS:%{http_code}\n" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        "$API_BASE/invitations" \
        | head -10
}

# Delta System Tests
test_delta_system() {
    print_header "DELTA SYSTEM TESTS"
    
    print_test "Delta health check"
    curl -s -w "\nSTATUS:%{http_code}\n" \
        "$API_BASE/delta/health" \
        | head -10
    
    print_test "Get delta changes"
    curl -s -w "\nSTATUS:%{http_code}\n" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        "$API_BASE/delta/changes" \
        | head -15
}

# Skill Ratings Tests
test_skill_ratings() {
    print_header "SKILL RATINGS TESTS"
    
    print_test "Get pending skill ratings"
    curl -s -w "\nSTATUS:%{http_code}\n" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        "$API_BASE/skill-ratings/my-pending" \
        | head -10
}

# Notifications Tests
test_notifications() {
    print_header "NOTIFICATIONS TESTS"
    
    print_test "Get notification count"
    curl -s -w "\nSTATUS:%{http_code}\n" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        "$API_BASE/notifications/count" \
        | head -10
}

# Error Cases Tests
test_error_cases() {
    print_header "ERROR HANDLING TESTS"
    
    print_test "Test without authentication (should fail)"
    curl -s -w "\nSTATUS:%{http_code}\n" \
        "$API_BASE/activities" \
        | head -5
    
    print_test "Test with invalid token (should fail)"
    curl -s -w "\nSTATUS:%{http_code}\n" \
        -H "Authorization: Bearer invalid_token_123" \
        "$API_BASE/activities" \
        | head -5
    
    print_test "Test non-existent endpoint (should 404)"
    curl -s -w "\nSTATUS:%{http_code}\n" \
        "$API_BASE/nonexistent" \
        | head -5
}

# Performance Tests
test_performance() {
    print_header "PERFORMANCE TESTS"
    
    print_test "Response time test - Activities endpoint"
    curl -s -w "\nResponse Time: %{time_total}s\nStatus: %{http_code}\n" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        "$API_BASE/activities?page=1&limit=20" \
        -o /dev/null
    
    print_test "Response time test - Delta changes"
    curl -s -w "\nResponse Time: %{time_total}s\nStatus: %{http_code}\n" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        "$API_BASE/delta/changes" \
        -o /dev/null
}

# Test specific endpoints that were failing
test_problematic_endpoints() {
    print_header "TESTING PREVIOUSLY FAILING ENDPOINTS"
    
    print_test "Activities with dateFrom parameter (was 400)"
    TOMORROW=$(date -d "+1 day" -Iseconds)
    curl -s -w "\nSTATUS:%{http_code}\n" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        "$API_BASE/activities?page=1&limit=5&dateFrom=$TOMORROW" \
        | head -5
    
    print_test "Invitations endpoint (was 404)"
    curl -s -w "\nSTATUS:%{http_code}\n" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        "$API_BASE/invitations" \
        | head -5
    
    print_test "User connections (was 404)"
    curl -s -w "\nSTATUS:%{http_code}\n" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        "$API_BASE/users/connections/requests" \
        | head -5
    
    print_test "Delta health (was 503)"
    curl -s -w "\nSTATUS:%{http_code}\n" \
        "$API_BASE/delta/health" \
        | head -5
}

# Main execution
main() {
    print_header "SPORTS ACTIVITY PLATFORM API TESTING"
    print_info "Testing API at: $API_BASE"
    print_info "Server at: $SERVER_BASE"
    
    # Run all tests in order
    test_server_health
    test_authentication
    test_activity_types
    test_activities
    test_users
    test_invitations
    test_delta_system
    test_skill_ratings
    test_notifications
    test_problematic_endpoints
    test_error_cases
    test_performance
    
    print_header "TESTING COMPLETE"
    print_success "All tests executed. Check output above for any failures."
    
    if [[ -n "$ACCESS_TOKEN" ]]; then
        print_info "Your access token for manual testing:"
        echo "$ACCESS_TOKEN"
    fi
}

# Run the script
main "$@"