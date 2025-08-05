# run-delta-tests.sh - Complete delta system testing script

#!/bin/bash

echo "🚀 Delta System Testing Suite"
echo "============================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
BASE_URL="http://localhost:3001"
TEST_DIR="delta-tests"

# Create test directory
mkdir -p $TEST_DIR

echo -e "\n${BLUE}Step 1: Health Checks${NC}"
echo "====================="

# Test 1: Server health
echo "🔍 Testing server health..."
curl -s "$BASE_URL/health" | jq '.' > $TEST_DIR/health.json
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Server is running${NC}"
else
    echo -e "${RED}❌ Server is not running - start with 'npm run dev'${NC}"
    exit 1
fi

# Test 2: Delta system health
echo "🔍 Testing delta system health..."
curl -s "$BASE_URL/api/delta/health" | jq '.' > $TEST_DIR/delta-health.json
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Delta system is healthy${NC}"
else
    echo -e "${RED}❌ Delta system health check failed${NC}"
fi

echo -e "\n${BLUE}Step 2: Authentication Setup${NC}"
echo "============================"

# Login test users
echo "🔐 Logging in test users..."

# User 1: Alex
USER1_TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "alex@example.com", "password": "password123"}' | \
  jq -r '.data.tokens.accessToken // empty')


if [ -n "$USER1_TOKEN" ]; then
    echo -e "${GREEN}✅ User1 (Alex) authenticated${NC}"
    echo "$USER1_TOKEN" > $TEST_DIR/user1_token.txt
else
    echo -e "${RED}❌ User1 authentication failed${NC}"
    exit 1
fi

# User 2: Sarah
USER2_TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "sarah@example.com", "password": "password123"}' | \
  jq -r '.data.tokens.accessToken // empty')

if [ -n "$USER2_TOKEN" ]; then
    echo -e "${GREEN}✅ User2 (Sarah) authenticated${NC}"
    echo "$USER2_TOKEN" > $TEST_DIR/user2_token.txt
else
    echo -e "${RED}❌ User2 authentication failed${NC}"
    exit 1
fi

echo -e "\n${BLUE}Step 3: Delta API Testing${NC}"
echo "======================="

# Test delta status for user1
echo "📊 Testing delta status endpoint..."
curl -s -H "Authorization: Bearer $USER1_TOKEN" \
  "$BASE_URL/api/delta/status" | jq '.' > $TEST_DIR/delta-status-user1.json

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Delta status endpoint working${NC}"
else
    echo -e "${RED}❌ Delta status endpoint failed${NC}"
fi

# Test initial delta changes for user1
echo "🔄 Testing initial delta changes..."
curl -s -H "Authorization: Bearer $USER1_TOKEN" \
  "$BASE_URL/api/delta/changes?forceRefresh=true" | jq '.' > $TEST_DIR/initial-deltas-user1.json

INITIAL_CHANGES=$(cat $TEST_DIR/initial-deltas-user1.json | jq -r '.data.changes | length')
echo "📋 Initial changes for User1: $INITIAL_CHANGES"

echo -e "\n${BLUE}Step 4: Activity Creation & Delta Generation${NC}"
echo "=========================================="

# Get Basketball activity type
echo "🏀 Getting Basketball activity type..."
BASKETBALL_ID=$(curl -s "$BASE_URL/api/activity-types" | \
  jq -r '.data.activityTypes[] | select(.name | test("Basketball"; "i")) | .id')

if [ -n "$BASKETBALL_ID" ]; then
    echo -e "${GREEN}✅ Basketball activity type found: $BASKETBALL_ID${NC}"
else
    echo -e "${RED}❌ Basketball activity type not found${NC}"
    exit 1
fi

# Create activity as User1
echo "📝 Creating basketball activity..."
TOMORROW=$(date -v+1d +%Y-%m-%dT%H:%M:%S)
ACTIVITY_DATA=$(curl -s -X POST "$BASE_URL/api/activities" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -d "{
    \"activityTypeId\": \"$BASKETBALL_ID\",
    \"description\": \"Delta Test Basketball Game\",
    \"location\": \"Test Court\",
    \"dateTime\": \"$TOMORROW\",
    \"maxParticipants\": 4,
    \"isELORated\": true
  }")

ACTIVITY_ID=$(echo "$ACTIVITY_DATA" | jq -r '.data.activity.id // empty')

if [ -n "$ACTIVITY_ID" ]; then
    echo -e "${GREEN}✅ Activity created: $ACTIVITY_ID${NC}"
    echo "$ACTIVITY_DATA" > $TEST_DIR/created-activity.json
else
    echo -e "${RED}❌ Activity creation failed${NC}"
    echo "$ACTIVITY_DATA" | jq '.'
    exit 1
fi

# User2 joins activity
echo "🤝 User2 joining activity..."
JOIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/activities/$ACTIVITY_ID/join" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER2_TOKEN" \
  -d '{"team": "A", "message": "Ready for delta testing!"}')

echo "$JOIN_RESPONSE" > $TEST_DIR/user2-join.json

if echo "$JOIN_RESPONSE" | jq -e '.status == "success"' > /dev/null; then
    echo -e "${GREEN}✅ User2 joined activity${NC}"
else
    echo -e "${RED}❌ User2 join failed${NC}"
    echo "$JOIN_RESPONSE" | jq '.'
fi

echo -e "\n${BLUE}Step 5: Delta Change Detection${NC}"
echo "============================="

# Wait for delta processing
echo "⏳ Waiting for delta processing..."
sleep 2

# Check for new deltas on User1
echo "🔍 Checking User1 deltas after activity join..."
curl -s -H "Authorization: Bearer $USER1_TOKEN" \
  "$BASE_URL/api/delta/changes" | jq '.' > $TEST_DIR/deltas-after-join-user1.json

NEW_CHANGES_USER1=$(cat $TEST_DIR/deltas-after-join-user1.json | jq -r '.data.changes | length')
echo "📊 New changes for User1: $NEW_CHANGES_USER1"

# Check for new deltas on User2
echo "🔍 Checking User2 deltas after joining..."
curl -s -H "Authorization: Bearer $USER2_TOKEN" \
  "$BASE_URL/api/delta/changes" | jq '.' > $TEST_DIR/deltas-after-join-user2.json

NEW_CHANGES_USER2=$(cat $TEST_DIR/deltas-after-join-user2.json | jq -r '.data.changes | length')
echo "📊 New changes for User2: $NEW_CHANGES_USER2"

echo -e "\n${BLUE}Step 6: ELO Delta Testing${NC}"
echo "======================="

# Complete the activity to trigger ELO calculation
echo "🏁 Completing activity to trigger ELO calculation..."
COMPLETE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/activities/$ACTIVITY_ID/complete" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER1_TOKEN" \
  -d "{
    \"results\": [
      {\"userId\": \"$(curl -s -H "Authorization: Bearer $USER1_TOKEN" "$BASE_URL/api/auth/me" | jq -r '.data.user.id')\", \"finalResult\": \"win\"},
      {\"userId\": \"$(curl -s -H "Authorization: Bearer $USER2_TOKEN" "$BASE_URL/api/auth/me" | jq -r '.data.user.id')\", \"finalResult\": \"loss\"}
    ]
  }")

echo "$COMPLETE_RESPONSE" > $TEST_DIR/activity-completion.json

ELO_PROCESSED=$(echo "$COMPLETE_RESPONSE" | jq -r '.data.eloProcessing.resultsCalculated // false')
echo "🎯 ELO processing result: $ELO_PROCESSED"

# Wait for ELO processing
echo "⏳ Waiting for ELO processing..."
sleep 3

# Check for ELO deltas
echo "📈 Checking for ELO delta changes..."

# User1 ELO deltas
curl -s -H "Authorization: Bearer $USER1_TOKEN" \
  "$BASE_URL/api/delta/changes" | jq '.' > $TEST_DIR/elo-deltas-user1.json

ELO_CHANGES_USER1=$(cat $TEST_DIR/elo-deltas-user1.json | jq -r '.data.changes | length')

# User2 ELO deltas
curl -s -H "Authorization: Bearer $USER2_TOKEN" \
  "$BASE_URL/api/delta/changes" | jq '.' > $TEST_DIR/elo-deltas-user2.json

ELO_CHANGES_USER2=$(cat $TEST_DIR/elo-deltas-user2.json | jq -r '.data.changes | length')

echo "📊 ELO changes - User1: $ELO_CHANGES_USER1, User2: $ELO_CHANGES_USER2"

echo -e "\n${BLUE}Step 7: Polling Performance Test${NC}"
echo "==============================="

echo "⚡ Testing polling performance..."

# Test multiple rapid polls
for i in {1..5}; do
    START_TIME=$(date +%s%3N)
    curl -s -H "Authorization: Bearer $USER1_TOKEN" \
      "$BASE_URL/api/delta/changes" > /dev/null
    END_TIME=$(date +%s%3N)
    RESPONSE_TIME=$((END_TIME - START_TIME))
    echo "Poll $i: ${RESPONSE_TIME}ms"
    sleep 0.5
done

echo -e "\n${BLUE}Step 8: Results Summary${NC}"
echo "====================="

echo -e "\n📋 TEST RESULTS:"
echo "================="

# Server Health
if [ -f "$TEST_DIR/health.json" ]; then
    echo -e "${GREEN}✅ Server Health: OK${NC}"
else
    echo -e "${RED}❌ Server Health: FAILED${NC}"
fi

# Delta System Health
if [ -f "$TEST_DIR/delta-health.json" ]; then
    DELTA_STATUS=$(cat $TEST_DIR/delta-health.json | jq -r '.status // "unknown"')
    if [ "$DELTA_STATUS" = "healthy" ]; then
        echo -e "${GREEN}✅ Delta System Health: OK${NC}"
    else
        echo -e "${RED}❌ Delta System Health: $DELTA_STATUS${NC}"
    fi
fi

# Authentication
if [ -n "$USER1_TOKEN" ] && [ -n "$USER2_TOKEN" ]; then
    echo -e "${GREEN}✅ User Authentication: OK${NC}"
else
    echo -e "${RED}❌ User Authentication: FAILED${NC}"
fi

# Activity Creation
if [ -n "$ACTIVITY_ID" ]; then
    echo -e "${GREEN}✅ Activity Creation: OK${NC}"
else
    echo -e "${RED}❌ Activity Creation: FAILED${NC}"
fi

# Delta Change Detection
if [ "$NEW_CHANGES_USER1" -gt 0 ] || [ "$NEW_CHANGES_USER2" -gt 0 ]; then
    echo -e "${GREEN}✅ Delta Change Detection: OK (User1: $NEW_CHANGES_USER1, User2: $NEW_CHANGES_USER2)${NC}"
else
    echo -e "${YELLOW}⚠️  Delta Change Detection: No changes detected${NC}"
fi

# ELO Processing
if [ "$ELO_PROCESSED" = "true" ]; then
    echo -e "${GREEN}✅ ELO Processing: OK${NC}"
else
    echo -e "${RED}❌ ELO Processing: FAILED${NC}"
fi

# ELO Delta Updates
if [ "$ELO_CHANGES_USER1" -gt 0 ] || [ "$ELO_CHANGES_USER2" -gt 0 ]; then
    echo -e "${GREEN}✅ ELO Delta Updates: OK (User1: $ELO_CHANGES_USER1, User2: $ELO_CHANGES_USER2)${NC}"
else
    echo -e "${YELLOW}⚠️  ELO Delta Updates: No ELO deltas detected${NC}"
fi

echo -e "\n📁 Test files saved in: $TEST_DIR/"
echo "🔍 Review JSON files for detailed responses"

# Overall status
TOTAL_TESTS=6
PASSED_TESTS=0

[ -f "$TEST_DIR/health.json" ] && ((PASSED_TESTS++))
[ "$DELTA_STATUS" = "healthy" ] && ((PASSED_TESTS++))
[ -n "$USER1_TOKEN" ] && [ -n "$USER2_TOKEN" ] && ((PASSED_TESTS++))
[ -n "$ACTIVITY_ID" ] && ((PASSED_TESTS++))
[ "$NEW_CHANGES_USER1" -gt 0 ] || [ "$NEW_CHANGES_USER2" -gt 0 ] && ((PASSED_TESTS++))
[ "$ELO_PROCESSED" = "true" ] && ((PASSED_TESTS++))

echo -e "\n🎯 OVERALL RESULT: $PASSED_TESTS/$TOTAL_TESTS tests passed"

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED! Delta system is fully operational!${NC}"
    exit 0
elif [ $PASSED_TESTS -ge 4 ]; then
    echo -e "${YELLOW}⚠️  Most tests passed, but some issues detected. Check logs.${NC}"
    exit 1
else
    echo -e "${RED}❌ Multiple test failures. Debug required.${NC}"
    exit 1
fi