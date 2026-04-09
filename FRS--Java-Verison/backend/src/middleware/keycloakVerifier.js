import { createLocalJWKSet, jwtVerify } from "jose";
import { env } from "../config/env.js";

/**
 * Filtered JWKS cache.
 *
 * Keycloak's JWKS includes an RSA-OAEP encryption key (use:"enc") alongside
 * the RS256 signing key (use:"sig"). Jose throws JOSENotSupported / JOSEAlgNotAllowed
 * when it encounters the encryption key during JWT verification.
 *
 * Fix: fetch the JWKS manually, strip encryption keys, build a local key set.
 * Cache it for 5 minutes so we handle Keycloak key rotation without hammering.
 */
let _signingJWKS = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getSigningJWKS() {
    if (_signingJWKS && Date.now() < _cacheExpiry) return _signingJWKS;

    const url = `${env.keycloak.url}/realms/${env.keycloak.realm}/protocol/openid-connect/certs`;
    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) throw new Error(`Failed to fetch JWKS: ${resp.status}`);

        const jwks = await resp.json();
        // Keep only signing keys — drop encryption (use:"enc") and unknown-use keys with non-sig algs
        const signingKeys = (jwks.keys || []).filter(k => !k.use || k.use === 'sig');
        if (signingKeys.length === 0) throw new Error('No signing keys found in Keycloak JWKS');

        _signingJWKS = createLocalJWKSet({ keys: signingKeys });
        _cacheExpiry = Date.now() + CACHE_TTL_MS;
        return _signingJWKS;
    } catch (err) {
        // Network error — use stale cache if available rather than crashing
        if (_signingJWKS) {
            console.warn(`[keycloakVerifier] JWKS fetch failed (${err.message}), using stale cache`);
            // Extend cache briefly so we don't hammer on every request
            _cacheExpiry = Date.now() + 30_000;
            return _signingJWKS;
        }
        // No cache yet — rethrow so the caller returns 503
        throw Object.assign(err, { _jwksFetchFailed: true });
    }
}

/**
 * Verify a Keycloak JWT access token.
 */
export async function verifyKeycloakToken(accessToken) {
    const jwks = await getSigningJWKS();

    // Verify signature + issuer
    const { payload } = await jwtVerify(accessToken, jwks, {
        issuer: env.keycloak.issuer,
    });

    // Soft audience check — Keycloak public clients may omit "aud"
    if (payload.aud !== undefined) {
        const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
        const expected = env.keycloak.audience || "attendance-frontend";
        const allowed = ["account", expected];
        if (!audList.some(a => allowed.includes(a))) {
            throw new Error(`JWT audience mismatch: got [${audList.join(", ")}], expected ${expected}`);
        }
    }

    if (!payload.sub) throw new Error("JWT missing required claim: sub");

    return payload;
}
