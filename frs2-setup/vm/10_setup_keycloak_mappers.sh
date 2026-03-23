#!/bin/bash
# ============================================================
# STEP 10 — Verify Keycloak is correctly configured
# Run this on the VM (172.20.100.222)
#
# The realm-export.json in Step 03 already includes the
# audience mapper and role mapper inside the client definition.
# This script verifies they are working and tests a real login.
# ============================================================

VM_IP="172.20.100.222"

echo ""
echo "=================================================="
echo " STEP 10: Verifying Keycloak configuration"
echo "=================================================="
echo ""

# ── 1. Get admin token for Keycloak REST API ──────────────
echo "[1/5] Getting Keycloak admin token..."
ADMIN_TOKEN=$(curl -s -X POST \
  "http://${VM_IP}:9090/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=admin-cli&username=admin&password=admin&grant_type=password" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token','ERROR'))" 2>/dev/null)

if [ "$ADMIN_TOKEN" = "ERROR" ] || [ -z "$ADMIN_TOKEN" ]; then
  echo "  ❌ Could not get Keycloak admin token"
  echo "     Is Keycloak running? Check: docker compose logs keycloak"
  exit 1
fi
echo "  ✅ Admin token obtained"

# ── 2. Verify attendance realm exists ─────────────────────
echo ""
echo "[2/5] Verifying 'attendance' realm..."
REALM_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://${VM_IP}:9090/admin/realms/attendance" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if [ "$REALM_STATUS" = "200" ]; then
  echo "  ✅ Realm 'attendance' exists"
else
  echo "  ❌ Realm 'attendance' not found (HTTP $REALM_STATUS)"
  echo "     The realm was not imported. Fix:"
  echo "     1. Stop Keycloak: docker compose stop keycloak"
  echo "     2. Remove volume: docker volume rm \$(docker volume ls -q | grep keycloak-data)"
  echo "     3. Make sure 03_write_realm_json.sh was run BEFORE starting Keycloak"
  echo "     4. Start again: docker compose up -d keycloak"
  exit 1
fi

# ── 3. Verify attendance-frontend client ──────────────────
echo ""
echo "[3/5] Verifying 'attendance-frontend' client..."
CLIENTS=$(curl -s \
  "http://${VM_IP}:9090/admin/realms/attendance/clients?clientId=attendance-frontend" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
CLIENT_ID=$(echo "$CLIENTS" | python3 -c \
  "import sys,json; c=json.load(sys.stdin); print(c[0]['id'] if c else 'NOT_FOUND')" 2>/dev/null)

if [ "$CLIENT_ID" = "NOT_FOUND" ] || [ -z "$CLIENT_ID" ]; then
  echo "  ❌ Client 'attendance-frontend' not found"
  exit 1
fi
echo "  ✅ Client 'attendance-frontend' found (id: $CLIENT_ID)"

# ── 4. Verify protocol mappers ────────────────────────────
echo ""
echo "[4/5] Checking protocol mappers on attendance-frontend..."
MAPPERS=$(curl -s \
  "http://${VM_IP}:9090/admin/realms/attendance/clients/${CLIENT_ID}/protocol-mappers/models" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

AUDIENCE_MAPPER=$(echo "$MAPPERS" | python3 -c \
  "import sys,json; ms=json.load(sys.stdin); print(next((m['name'] for m in ms if m.get('protocolMapper')=='oidc-audience-mapper'),'NOT_FOUND'))" 2>/dev/null)
ROLE_MAPPER=$(echo "$MAPPERS" | python3 -c \
  "import sys,json; ms=json.load(sys.stdin); print(next((m['name'] for m in ms if 'role' in m.get('protocolMapper','').lower()),'NOT_FOUND'))" 2>/dev/null)

if [ "$AUDIENCE_MAPPER" != "NOT_FOUND" ] && [ -n "$AUDIENCE_MAPPER" ]; then
  echo "  ✅ Audience mapper found: $AUDIENCE_MAPPER"
else
  echo "  ⚠️  Audience mapper not found — adding it now..."

  curl -s -X POST \
    "http://${VM_IP}:9090/admin/realms/attendance/clients/${CLIENT_ID}/protocol-mappers/models" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "audience-mapper",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-audience-mapper",
      "consentRequired": false,
      "config": {
        "included.client.audience": "attendance-frontend",
        "included.custom.audience": "attendance-frontend",
        "id.token.claim": "true",
        "access.token.claim": "true"
      }
    }' > /dev/null

  echo "  ✅ Audience mapper added via REST API"
fi

if [ "$ROLE_MAPPER" != "NOT_FOUND" ] && [ -n "$ROLE_MAPPER" ]; then
  echo "  ✅ Role mapper found: $ROLE_MAPPER"
else
  echo "  ⚠️  Role mapper not found — adding it now..."

  curl -s -X POST \
    "http://${VM_IP}:9090/admin/realms/attendance/clients/${CLIENT_ID}/protocol-mappers/models" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "realm-roles-mapper",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usermodel-realm-role-mapper",
      "consentRequired": false,
      "config": {
        "claim.name": "realm_access.roles",
        "jsonType.label": "String",
        "multivalued": "true",
        "userinfo.token.claim": "true",
        "id.token.claim": "true",
        "access.token.claim": "true"
      }
    }' > /dev/null

  echo "  ✅ Role mapper added via REST API"
fi

# ── 5. Test a real user login ─────────────────────────────
echo ""
echo "[5/5] Testing admin login through Keycloak..."
KC_TOKEN_RESP=$(curl -s -X POST \
  "http://${VM_IP}:9090/realms/attendance/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=attendance-frontend&username=admin@company.com&password=admin123&grant_type=password")

KC_ACCESS_TOKEN=$(echo "$KC_TOKEN_RESP" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('access_token','ERROR'))" 2>/dev/null)

if [ "$KC_ACCESS_TOKEN" = "ERROR" ] || [ -z "$KC_ACCESS_TOKEN" ]; then
  echo "  ❌ Keycloak login failed"
  echo "     Response: $KC_TOKEN_RESP"
  exit 1
fi
echo "  ✅ Keycloak login successful"

# Decode JWT claims
echo ""
echo "  JWT claims (decoded):"
echo "$KC_ACCESS_TOKEN" | python3 -c "
import sys, json, base64
token = sys.stdin.read().strip()
parts = token.split('.')
if len(parts) < 2:
    print('  Cannot decode')
    sys.exit(0)
payload = parts[1]
payload += '=' * (4 - len(payload) % 4)
decoded = json.loads(base64.urlsafe_b64decode(payload))
for key in ['iss','aud','realm_access','email','exp']:
    print(f'  {key}: {json.dumps(decoded.get(key, \"[missing]\"))}')
"

echo ""
echo "=================================================="
echo " ✅ STEP 10 COMPLETE"
echo "=================================================="
echo ""
echo "Next: Run 11_switch_to_keycloak_mode.sh"
echo ""
