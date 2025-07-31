#!/bin/bash
# manual-chat-test.sh - Manual testing commands for chat system

BASE_URL="http://localhost:3001/api"

echo "🚀 Manual Chat System Testing Guide"
echo "=================================="

echo ""
echo "1️⃣ STEP 1: Login as first user (alex_player)"
echo "curl -X POST $BASE_URL/auth/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"email\": \"alex@example.com\", \"password\": \"password123\"}'"

echo ""
echo "Copy the accessToken from response and set it:"
echo "export TOKEN1=\"your_access_token_here\""

echo ""
echo "2️⃣ STEP 2: Login as second user (sarah_athlete)"
echo "curl -X POST $BASE_URL/auth/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"email\": \"sarah@example.com\", \"password\": \"password123\"}'"

echo ""
echo "Copy the accessToken from response and set it:"
echo "export TOKEN2=\"your_access_token_here\""

echo ""
echo "3️⃣ STEP 3: Get Basketball activity type ID"
echo "curl -X GET '$BASE_URL/activity-types' | jq '.data.activityTypes[] | select(.name==\"Basketball\") | .id'"

echo ""
echo "Copy the Basketball ID and set it:"
echo "export BASKETBALL_ID=\"your_basketball_id_here\""

echo ""
echo "4️⃣ STEP 4: Create activity as first user"
echo "curl -X POST $BASE_URL/activities \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H \"Authorization: Bearer \$TOKEN1\" \\"
echo "  -d '{"
echo "    \"activityTypeId\": \"'$BASKETBALL_ID'\","
echo "    \"description\": \"Manual Test Basketball Game\","
echo "    \"location\": \"Test Court\","
echo "    \"dateTime\": \"'$(date -d '+1 day' -Iseconds)'\","
echo "    \"maxParticipants\": 6,"
echo "    \"isELORated\": true"
echo "  }'"

echo ""
echo "Copy the activity ID from response and set it:"
echo "export ACTIVITY_ID=\"your_activity_id_here\""

echo ""
echo "5️⃣ STEP 5: Second user joins activity (this should create chat!)"
echo "curl -X POST $BASE_URL/activities/\$ACTIVITY_ID/join \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H \"Authorization: Bearer \$TOKEN2\" \\"
echo "  -d '{\"team\": \"A\", \"message\": \"Ready to play!\"}'"

echo ""
echo "6️⃣ STEP 6: Check if chat room was created"
echo "curl -X GET $BASE_URL/activities/\$ACTIVITY_ID/chat \\"
echo "  -H \"Authorization: Bearer \$TOKEN1\""

echo ""
echo "7️⃣ STEP 7: Send message from first user"
echo "curl -X POST $BASE_URL/activities/\$ACTIVITY_ID/chat/messages \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H \"Authorization: Bearer \$TOKEN1\" \\"
echo "  -d '{\"content\": \"Hey! Ready for basketball?\", \"messageType\": \"text\"}'"

echo ""
echo "8️⃣ STEP 8: Send message from second user"
echo "curl -X POST $BASE_URL/activities/\$ACTIVITY_ID/chat/messages \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H \"Authorization: Bearer \$TOKEN2\" \\"
echo "  -d '{\"content\": \"Absolutely! Let'"'"'s do this!\", \"messageType\": \"text\"}'"

echo ""
echo "9️⃣ STEP 9: Get chat messages"
echo "curl -X GET '$BASE_URL/activities/\$ACTIVITY_ID/chat/messages?limit=10' \\"
echo "  -H \"Authorization: Bearer \$TOKEN1\""

echo ""
echo "🔟 STEP 10: Check unread counts"
echo "curl -X GET $BASE_URL/activities/\$ACTIVITY_ID/chat \\"
echo "  -H \"Authorization: Bearer \$TOKEN2\""

echo ""
echo "1️⃣1️⃣ STEP 11: Mark messages as read"
echo "curl -X POST $BASE_URL/activities/\$ACTIVITY_ID/chat/mark-read \\"
echo "  -H \"Authorization: Bearer \$TOKEN2\""

echo ""
echo "1️⃣2️⃣ STEP 12: Verify unread count is now 0"
echo "curl -X GET $BASE_URL/activities/\$ACTIVITY_ID/chat \\"
echo "  -H \"Authorization: Bearer \$TOKEN2\""

echo ""
echo "🏁 That's it! You've tested the complete chat system."
echo ""
echo "💡 Pro Tips:"
echo "  - Use 'jq' to format JSON responses: curl ... | jq ."
echo "  - Check your database with: pnpm db:studio"
echo "  - Monitor server logs for detailed debugging"