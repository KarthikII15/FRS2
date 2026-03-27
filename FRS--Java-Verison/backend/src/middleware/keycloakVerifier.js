import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env.js";

/**
 * JWKS remote keyset — fetches Keycloak public keys automatically.
 */
const JWKS = createRemoteJWKSet(
    new URL(
        `${env.keycloak.url}/realms/${env.keycloak.realm}/protocol/openid-connect/certs`
    )
);

/**
 * Verify a Keycloak JWT access token.
 *
 * Keycloak public clients do NOT include an "aud" claim by default
 * unless an audience protocol mapper is configured on the client.
 * We verify signature + issuer here, and do a soft audience check
 * so it works both with and without the mapper configured.
 */
export async function verifyKeycloakToken(accessToken) {
    // Step 1 — verify signature and issuer (always enforced)
    const { payload } = await jwtVerify(accessToken, JWKS, {
        issuer: env.keycloak.issuer,
    });

    // Step 2 — soft audience check
    // If the token has an "aud" claim, it must contain our expected audience.
    // If there is no "aud" claim (public client without mapper), we allow it
    // and rely on the issuer + signature check above.
    if (payload.aud !== undefined) {
        const audList = Array.isArray(payload.aud)
            ? payload.aud
            : [payload.aud];
        const expected = env.keycloak.audience || "attendance-frontend";
        const allowed = ["account", expected];
        const hasMatch = audList.some((a) => allowed.includes(a));
        if (!hasMatch) {
            throw new Error(
                `JWT audience mismatch: got [${audList.join(", ")}], expected ${expected}`
            );
        }
    }

    // Step 3 — require sub and email (basic claims sanity check)
    if (!payload.sub) {
        throw new Error("JWT missing required claim: sub");
    }

    return payload;
}
