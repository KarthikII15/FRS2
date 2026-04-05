#!/bin/bash

echo "=========================================="
echo "Testing Keycloak Brute Force Protection"
echo "=========================================="
echo ""
echo "This will attempt to login with wrong password 6 times"
echo "to verify brute force protection is working."
echo ""
read -p "Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Test cancelled."
    exit 0
fi

KEYCLOAK_URL="http://172.20.100.222:9090"
REALM="attendance"

echo ""
echo "Attempting logins with wrong password..."

for i in {1..6}; do
    echo -n "Attempt $i: "
    
    RESPONSE=$(curl -s -X POST \
        "$KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=testuser" \
        -d "password=wrongpassword" \
        -d "grant_type=password" \
        -d "client_id=attendance-frontend")
    
    if echo "$RESPONSE" | grep -q "Account is temporarily disabled"; then
        echo "❌ LOCKED (Brute force protection working!)"
        echo ""
        echo "✅ SUCCESS! Brute force protection is active!"
        echo ""
        echo "Account will unlock automatically after 1 minute."
        exit 0
    elif echo "$RESPONSE" | grep -q "Invalid user credentials"; then
        echo "❌ Failed (expected)"
    elif echo "$RESPONSE" | grep -q "error"; then
        echo "❌ Error: $(echo $RESPONSE | grep -o '"error":"[^"]*"')"
    else
        echo "⚠️  Response: $(echo $RESPONSE | head -c 100)"
    fi
    
    sleep 2
done

echo ""
echo "⚠️  WARNING: Account did NOT lock after 6 attempts!"
echo "This might be normal if testing with a non-existent user."
echo ""
echo "To properly test, create a test user in Keycloak first."
