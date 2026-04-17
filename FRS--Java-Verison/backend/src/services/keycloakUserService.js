import { env } from "../config/env.js";

function getKeycloakAdminCredentials() {
  return {
    username: process.env.KEYCLOAK_ADMIN_USER || "admin",
    password: process.env.KEYCLOAK_ADMIN_PASSWORD || "admin",
  };
}

export function buildKeycloakProfile(username, email) {
  const trimmedName = String(username || "").trim();
  const fallbackName = String(email || "User")
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .trim();
  const baseName = trimmedName || fallbackName || "User";
  const parts = baseName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "User";
  const lastName = parts.slice(1).join(" ") || firstName;

  return { firstName, lastName };
}

export function mapRoleToKeycloakRealmRole(role) {
  return ["admin", "super_admin", "site_admin"].includes(String(role || ""))
    ? "admin"
    : "hr";
}

async function getKeycloakAdminToken() {
  const { username, password } = getKeycloakAdminCredentials();
  const response = await fetch(
    `${env.keycloak.url}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username,
        password,
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Failed to authenticate with Keycloak admin API (${response.status}): ${detail}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Keycloak admin API did not return an access token");
  }

  return data.access_token;
}

async function keycloakAdminRequest(path, { method = "GET", body, adminToken } = {}) {
  const token = adminToken || await getKeycloakAdminToken();
  const response = await fetch(`${env.keycloak.url}/admin/realms/${env.keycloak.realm}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  return { response, adminToken: token };
}

export async function findKeycloakUser({ keycloakSub, email, adminToken } = {}) {
  let token = adminToken;

  if (keycloakSub) {
    const byId = await keycloakAdminRequest(`/users/${keycloakSub}`, { adminToken: token });
    token = byId.adminToken;
    if (byId.response.ok) {
      const user = await byId.response.json();
      return { user, adminToken: token };
    }
    if (byId.response.status !== 404) {
      const detail = await byId.response.text().catch(() => "");
      throw new Error(`Failed to fetch Keycloak user ${keycloakSub} (${byId.response.status}): ${detail}`);
    }
  }

  if (!email) {
    return { user: null, adminToken: token || await getKeycloakAdminToken() };
  }

  const byEmail = await keycloakAdminRequest(`/users?email=${encodeURIComponent(email)}&exact=true`, {
    adminToken: token,
  });
  token = byEmail.adminToken;
  if (!byEmail.response.ok) {
    const detail = await byEmail.response.text().catch(() => "");
    throw new Error(`Failed to query Keycloak user by email (${byEmail.response.status}): ${detail}`);
  }

  const users = await byEmail.response.json();
  return { user: users?.[0] ?? null, adminToken: token };
}

export async function ensureKeycloakUserReady({ keycloakSub, email, username, adminToken } = {}) {
  const found = await findKeycloakUser({ keycloakSub, email, adminToken });
  const keycloakUser = found.user;
  const token = found.adminToken;

  if (!keycloakUser?.id) {
    return { keycloakUserId: null, adminToken: token };
  }

  const { firstName, lastName } = buildKeycloakProfile(
    username || keycloakUser.firstName || keycloakUser.username || keycloakUser.email,
    email || keycloakUser.email
  );

  const { response } = await keycloakAdminRequest(`/users/${keycloakUser.id}`, {
    method: "PUT",
    adminToken: token,
    body: {
      username: keycloakUser.username || email,
      email: email || keycloakUser.email,
      firstName,
      lastName,
      enabled: true,
      emailVerified: true,
      requiredActions: [],
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Failed to update Keycloak user ${keycloakUser.id} (${response.status}): ${detail}`);
  }

  return { keycloakUserId: keycloakUser.id, adminToken: token };
}

export async function ensureKeycloakRealmRole({ keycloakUserId, realmRole, adminToken }) {
  if (!keycloakUserId || !realmRole) {
    return { adminToken: adminToken || await getKeycloakAdminToken() };
  }

  let token = adminToken || await getKeycloakAdminToken();
  const roleResponse = await keycloakAdminRequest(`/roles/${encodeURIComponent(realmRole)}`, {
    adminToken: token,
  });
  token = roleResponse.adminToken;

  if (!roleResponse.response.ok) {
    const detail = await roleResponse.response.text().catch(() => "");
    throw new Error(`Failed to load Keycloak role ${realmRole} (${roleResponse.response.status}): ${detail}`);
  }

  const role = await roleResponse.response.json();
  const mappingResponse = await keycloakAdminRequest(`/users/${keycloakUserId}/role-mappings/realm`, {
    method: "POST",
    adminToken: token,
    body: [role],
  });

  if (!mappingResponse.response.ok && mappingResponse.response.status !== 204) {
    const detail = await mappingResponse.response.text().catch(() => "");
    throw new Error(`Failed to assign Keycloak role ${realmRole} (${mappingResponse.response.status}): ${detail}`);
  }

  return { adminToken: token };
}

export async function setKeycloakPassword({ keycloakUserId, password, adminToken }) {
  if (!keycloakUserId || !password) {
    return { adminToken: adminToken || await getKeycloakAdminToken() };
  }

  const { response, adminToken: token } = await keycloakAdminRequest(`/users/${keycloakUserId}/reset-password`, {
    method: "PUT",
    adminToken,
    body: {
      type: "password",
      value: password,
      temporary: false,
    },
  });

  if (!response.ok && response.status !== 204) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Failed to reset Keycloak password (${response.status}): ${detail}`);
  }

  return { adminToken: token };
}

export async function createOrUpdateKeycloakUser({
  email,
  username,
  password,
  realmRole,
}) {
  const token = await getKeycloakAdminToken();
  const found = await findKeycloakUser({ email, adminToken: token });

  if (found.user?.id) {
    const ready = await ensureKeycloakUserReady({
      keycloakSub: found.user.id,
      email,
      username,
      adminToken: found.adminToken,
    });
    const passwordResult = await setKeycloakPassword({
      keycloakUserId: ready.keycloakUserId,
      password,
      adminToken: ready.adminToken,
    });
    await ensureKeycloakRealmRole({
      keycloakUserId: ready.keycloakUserId,
      realmRole,
      adminToken: passwordResult.adminToken,
    });
    return ready.keycloakUserId;
  }

  const { firstName, lastName } = buildKeycloakProfile(username, email);
  const createResponse = await keycloakAdminRequest("/users", {
    method: "POST",
    adminToken: found.adminToken,
    body: {
      username: email,
      email,
      firstName,
      lastName,
      enabled: true,
      emailVerified: true,
      requiredActions: [],
      credentials: [{
        type: "password",
        value: password,
        temporary: false,
      }],
    },
  });

  if (![201, 204].includes(createResponse.response.status)) {
    const detail = await createResponse.response.text().catch(() => "");
    throw new Error(`Keycloak user creation failed (${createResponse.response.status}): ${detail}`);
  }

  const refetched = await findKeycloakUser({ email, adminToken: createResponse.adminToken });
  if (!refetched.user?.id) {
    throw new Error(`Created Keycloak user for ${email}, but could not look it up afterwards`);
  }

  await ensureKeycloakRealmRole({
    keycloakUserId: refetched.user.id,
    realmRole,
    adminToken: refetched.adminToken,
  });

  return refetched.user.id;
}
