#!/bin/bash
# ============================================================
# STEP 03 — Write keycloak/realm-export.json
# Run this on the VM (172.20.100.222)
# ⚠️  MUST run BEFORE starting the Keycloak container.
#    Keycloak only imports on its very first boot.
# ============================================================
set -e

VM_IP="172.20.100.222"
PROJECT="/home/administrator/FRS_/FRS--Java-Verison"

echo ""
echo "=================================================="
echo " STEP 03: Writing Keycloak realm-export.json"
echo "=================================================="
echo ""

mkdir -p "$PROJECT/keycloak"

cat > "$PROJECT/keycloak/realm-export.json" << EOF
{
  "realm": "attendance",
  "enabled": true,
  "displayName": "Attendance Intelligence",
  "registrationAllowed": false,
  "loginWithEmailAllowed": true,
  "duplicateEmailsAllowed": false,
  "resetPasswordAllowed": true,
  "editUsernameAllowed": false,
  "bruteForceProtected": false,
  "sslRequired": "none",
  "accessTokenLifespan": 1800,
  "refreshTokenMaxReuse": 0,
  "roles": {
    "realm": [
      { "name": "admin",  "description": "System administrator", "composite": false },
      { "name": "hr",     "description": "HR manager",           "composite": false },
      { "name": "viewer", "description": "Read-only access",     "composite": false }
    ]
  },
  "clients": [
    {
      "clientId": "attendance-frontend",
      "name": "Attendance Frontend",
      "description": "React SPA — public client with PKCE",
      "enabled": true,
      "publicClient": true,
      "standardFlowEnabled": true,
      "implicitFlowEnabled": false,
      "directAccessGrantsEnabled": true,
      "serviceAccountsEnabled": false,
      "protocol": "openid-connect",
      "redirectUris": [
        "http://${VM_IP}:5173/*",
        "http://${VM_IP}:5173",
        "http://localhost:5173/*",
        "http://localhost:5173"
      ],
      "webOrigins": [
        "http://${VM_IP}:5173",
        "http://localhost:5173"
      ],
      "attributes": {
        "pkce.code.challenge.method": "S256",
        "post.logout.redirect.uris": "http://${VM_IP}:5173/*##http://localhost:5173/*"
      },
      "protocolMappers": [
        {
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
        },
        {
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
        },
        {
          "name": "email-mapper",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-usermodel-property-mapper",
          "consentRequired": false,
          "config": {
            "userinfo.token.claim": "true",
            "user.attribute": "email",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "claim.name": "email",
            "jsonType.label": "String"
          }
        },
        {
          "name": "full-name-mapper",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-full-name-mapper",
          "consentRequired": false,
          "config": {
            "id.token.claim": "true",
            "access.token.claim": "true",
            "userinfo.token.claim": "true"
          }
        }
      ]
    },
    {
      "clientId": "attendance-api",
      "name": "Attendance API",
      "description": "Backend resource server — bearer-only",
      "enabled": true,
      "publicClient": false,
      "bearerOnly": true,
      "standardFlowEnabled": false,
      "directAccessGrantsEnabled": false,
      "serviceAccountsEnabled": false,
      "protocol": "openid-connect"
    }
  ],
  "users": [
    {
      "username": "admin@company.com",
      "email": "admin@company.com",
      "firstName": "Admin",
      "lastName": "User",
      "enabled": true,
      "emailVerified": true,
      "credentials": [
        {
          "type": "password",
          "value": "admin123",
          "temporary": false
        }
      ],
      "realmRoles": ["admin"]
    },
    {
      "username": "hr@company.com",
      "email": "hr@company.com",
      "firstName": "HR",
      "lastName": "Manager",
      "enabled": true,
      "emailVerified": true,
      "credentials": [
        {
          "type": "password",
          "value": "hr123",
          "temporary": false
        }
      ],
      "realmRoles": ["hr"]
    }
  ]
}
EOF

echo "   ✅ Written: $PROJECT/keycloak/realm-export.json"
echo ""
echo "   This file includes:"
echo "   • realm: attendance"
echo "   • client: attendance-frontend  (public, PKCE, with audience + role mappers)"
echo "   • client: attendance-api       (bearer-only)"
echo "   • user: admin@company.com / admin123  (role: admin)"
echo "   • user: hr@company.com / hr123        (role: hr)"
echo ""
echo "=================================================="
echo " ✅ STEP 03 COMPLETE"
echo "=================================================="
echo ""
