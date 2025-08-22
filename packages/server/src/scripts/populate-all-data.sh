#!/bin/bash

# scripts/populate-all-data.sh
# Complete database population script

cd "$(dirname "$0")/.." # Go to packages/server directory

echo "🚀 COMPREHENSIVE DATABASE POPULATION"
echo "===================================="
echo ""

echo "📋 What this will create:"
echo "• 11 realistic users (10 regular + 1 admin)"
echo "• 5 sports with ELO configurations"
echo "• 30+ skill definitions (general + sport-specific)"
echo "• 4 teams with members"
echo "• 7 activities (5 completed, 2 upcoming)"
echo "• User connections and friendships"
echo "• Initial ELO ratings based on participation"
echo "• Peer skill ratings for completed activities"
echo "• Chat rooms and messages"
echo "• Delta tracking data"
echo ""

read -p "🤔 Continue with population? (y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "❌ Population cancelled."
    exit 1
fi

echo "🏗️  Starting database population..."
echo ""

# Run the population script
pnpm tsx src/scripts/populate-test-data.ts

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 DATABASE POPULATION SUCCESS!"
    echo "=============================="
    echo ""
    echo "🔑 TEST CREDENTIALS:"
    echo "==================="
    echo "Username: alice_tennis"
    echo "Email: alice@example.com" 
    echo "Password: 1_Pass@hH-app"
    echo ""
    echo "Username: bob_basketball"
    echo "Email: bob@example.com"
    echo "Password: 1_Pass@hH-app"
    echo ""
    echo "Username: admin_user"
    echo "Email: admin@example.com"
    echo "Password: 1_Pass@hH-app"
    echo "Role: admin"
    echo ""
    echo "🚀 READY TO TEST:"
    echo "================="
    echo "1. Start server: pnpm dev"
    echo "2. Open browser: http://localhost:3001"
    echo "3. View database: pnpm db:studio"
    echo "4. Test APIs:"
    echo "   • POST /api/auth/login"
    echo "   • GET /api/activities"
    echo "   • GET /api/users/me/elo-stats"
    echo "   • GET /api/delta/changes"
    echo ""
    echo "📊 Check Drizzle Studio to see all your data!"
else
    echo ""
    echo "❌ DATABASE POPULATION FAILED!"
    echo "============================="
    echo ""
    echo "🔧 Troubleshooting:"
    echo "• Check database connection (DATABASE_URL)"
    echo "• Ensure tables exist: pnpm db:push"
    echo "• Check server logs for specific errors"
    echo "• Try running: pnpm db:studio to inspect database"
    exit 1
fi