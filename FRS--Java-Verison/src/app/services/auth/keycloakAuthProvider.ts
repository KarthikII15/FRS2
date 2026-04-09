import { User, UserMembership, AccessScope } from "../../types";
import { apiRequest } from "../http/apiClient";
import { AuthBootstrap, AuthProvider } from "./types";
import { derivePermissionsForScope } from "./permissionUtils";
import keycloak from "./keycloakInstance";

/* ------------------------------------------------------------------ */
/*  Types for bootstrap response                                       */
/* ------------------------------------------------------------------ */

interface ApiUser {
    id: string;
    email: string;
    role: "admin" | "hr";
    name: string;
    department?: string;
    createdAt: string | Date;
}

interface BootstrapResponse {
    user: User | ApiUser;
    memberships: UserMembership[];
    activeScope?: AccessScope | null;
    tenants: AuthBootstrap["catalog"]["tenants"];
    customers: AuthBootstrap["catalog"]["customers"];
    sites: AuthBootstrap["catalog"]["sites"];
    units: AuthBootstrap["catalog"]["units"];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function normalizeUser(user: User | ApiUser): User {
    return {
        ...user,
        password: (user as User).password ?? "",
        createdAt:
            user.createdAt instanceof Date
                ? user.createdAt
                : new Date(user.createdAt),
    };
}

const emptyCatalog = () => ({
    tenants: [] as AuthBootstrap["catalog"]["tenants"],
    customers: [] as AuthBootstrap["catalog"]["customers"],
    sites: [] as AuthBootstrap["catalog"]["sites"],
    units: [] as AuthBootstrap["catalog"]["units"],
});

/* ------------------------------------------------------------------ */
/*  Token refresh interval (Diagram 4: every 30 s, min-validity 60 s) */
/* ------------------------------------------------------------------ */

let refreshInterval: ReturnType<typeof setInterval> | null = null;

// Stored for ROPC token refresh fallback
let _ropcCredentials: { username: string; password: string } | null = null;

/** Notify AuthContext of a refreshed token so React state stays current. */
function dispatchTokenRefreshed(accessToken: string, refreshToken: string) {
    window.dispatchEvent(
        new CustomEvent("ropc-token-refreshed", { detail: { accessToken, refreshToken } })
    );
}

/** Use the stored refresh_token to silently obtain a new access token. */
async function refreshViaRefreshToken(): Promise<boolean> {
    const baseUrl = keycloak.authServerUrl?.replace(/\/$/, "");
    const tokenUrl = `${baseUrl}/realms/${keycloak.realm}/protocol/openid-connect/token`;
    const resp = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: keycloak.clientId!,
            refresh_token: keycloak.refreshToken!,
        }),
    });
    if (!resp.ok) return false;
    const tokens = await resp.json();
    keycloak.token = tokens.access_token;
    keycloak.refreshToken = tokens.refresh_token;
    dispatchTokenRefreshed(tokens.access_token, tokens.refresh_token);
    return true;
}

function startTokenRefreshLoop() {
    stopTokenRefreshLoop();
    refreshInterval = setInterval(async () => {
        try {
            // Try keycloak-js updateToken first; on success it updates keycloak.token
            const refreshed = await keycloak.updateToken(60);
            if (refreshed && keycloak.token && keycloak.refreshToken) {
                // Sync the new token into React state
                dispatchTokenRefreshed(keycloak.token, keycloak.refreshToken);
            }
        } catch {
            // keycloak-js refresh failed — fall back to direct refresh_token grant
            const ok = await refreshViaRefreshToken().catch(() => false);
            if (!ok) {
                // Refresh token also expired — re-auth with stored credentials if available
                if (_ropcCredentials) {
                    try {
                        const baseUrl = keycloak.authServerUrl?.replace(/\/$/, "");
                        const tokenUrl = `${baseUrl}/realms/${keycloak.realm}/protocol/openid-connect/token`;
                        const resp = await fetch(tokenUrl, {
                            method: "POST",
                            headers: { "Content-Type": "application/x-www-form-urlencoded" },
                            body: new URLSearchParams({
                                grant_type: "password",
                                client_id: keycloak.clientId!,
                                username: _ropcCredentials.username,
                                password: _ropcCredentials.password,
                                scope: "openid",
                            }),
                        });
                        if (resp.ok) {
                            const tokens = await resp.json();
                            keycloak.token = tokens.access_token;
                            keycloak.refreshToken = tokens.refresh_token;
                            dispatchTokenRefreshed(tokens.access_token, tokens.refresh_token);
                        } else {
                            _ropcCredentials = null;
                            window.location.reload();
                        }
                    } catch {
                        _ropcCredentials = null;
                        window.location.reload();
                    }
                } else {
                    window.location.reload();
                }
            }
        }
    }, 30_000); // every 30 seconds
}

function stopTokenRefreshLoop() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

/* ------------------------------------------------------------------ */
/*  Keycloak Auth Provider                                             */
/* ------------------------------------------------------------------ */

export const keycloakAuthProvider: AuthProvider = {
    /**
     * Initialize Keycloak and fetch memberships from our backend.
     *
     * Flow (Diagram 1 + 2):
     *  1. keycloak.init() — OIDC Auth Code + PKCE
     *  2. GET /api/auth/bootstrap (Bearer JWT)
     *  3. Backend verifies JWT, finds/provisions user, loads memberships
     *  4. Frontend stores AuthSession in Context
     */
    async initialize(_tokens) {
        // Strip stale OAuth callback params (code/state/session_state) from the
        // URL before keycloak.init(). If Keycloak restarted between the redirect
        // and the code exchange, these params are invalid and Keycloak would show
        // its "We are sorry..." error page. Removing them causes keycloak-js to
        // skip the code exchange and perform a fresh login redirect instead.
        const url = new URL(window.location.href);
        if (url.searchParams.has("code") || url.searchParams.has("error")) {
            url.searchParams.delete("code");
            url.searchParams.delete("state");
            url.searchParams.delete("session_state");
            url.searchParams.delete("iss");
            url.searchParams.delete("error");
            url.searchParams.delete("error_description");
            window.history.replaceState({}, "", url.toString());
        }

        try {
            const authenticated = await keycloak.init({
                onLoad: "check-sso",
                checkLoginIframe: false,
                pkceMethod: "S256",
            });

            if (!authenticated || !keycloak.token) {
                return { session: null, catalog: emptyCatalog() };
            }

            // Start the token refresh loop (Diagram 4)
            startTokenRefreshLoop();

            // Fetch memberships + catalog from our backend
            const bootstrap = await apiRequest<BootstrapResponse>(
                "/auth/bootstrap",
                {
                    method: "GET",
                    accessToken: keycloak.token,
                }
            );

            return {
                session: {
                    user: normalizeUser(bootstrap.user),
                    accessToken: keycloak.token,
                    refreshToken: null, // Keycloak manages refresh internally
                    memberships: bootstrap.memberships,
                    activeScope:
                        bootstrap.activeScope ??
                        bootstrap.memberships[0]?.scope ??
                        null,
                },
                catalog: {
                    tenants: bootstrap.tenants,
                    customers: bootstrap.customers,
                    sites: bootstrap.sites,
                    units: bootstrap.units,
                },
            };
        } catch {
            return { session: null, catalog: emptyCatalog() };
        }
    },

    /**
     * Login via Keycloak Direct Grant (ROPC).
     * Posts credentials directly to the token endpoint — no redirect.
     */
    async login(email, password) {
        const baseUrl = keycloak.authServerUrl?.replace(/\/$/, '');
        const tokenUrl = `${baseUrl}/realms/${keycloak.realm}/protocol/openid-connect/token`;
        const response = await fetch(tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "password",
                client_id: keycloak.clientId!,
                username: email,
                password,
                scope: "openid",
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error_description || "Invalid credentials");
        }

        const tokens = await response.json();

        // keycloak.init() was already called during initialize() — can't call again.
        // Directly set the tokens on the already-initialized instance.
        keycloak.token = tokens.access_token;
        keycloak.refreshToken = tokens.refresh_token;

        // Store creds for refresh fallback
        _ropcCredentials = { username: email, password };

        startTokenRefreshLoop();

        const bootstrap = await apiRequest<BootstrapResponse>("/auth/bootstrap", {
            method: "GET",
            accessToken: tokens.access_token,
        });

        return {
            user: normalizeUser(bootstrap.user),
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            memberships: bootstrap.memberships,
            activeScope:
                bootstrap.activeScope ??
                bootstrap.memberships[0]?.scope ??
                null,
        };
    },

    /**
     * Logout (Diagram 5):
     *  1. Stop the refresh interval
     *  2. keycloak.logout({ redirectUri }) — destroys Keycloak session
     *  3. Redirects to app in unauthenticated state
     */
    async logout(_refreshToken) {
        stopTokenRefreshLoop();
        _ropcCredentials = null;
        keycloak.logout({ redirectUri: window.location.origin });
    },

    /** Permission derivation — unchanged, same logic as mock/api modes. */
    derivePermissions: derivePermissionsForScope,
};
