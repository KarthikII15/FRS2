-- =============================================================================
-- Migration 014: RBAC (Role-Based Access Control) Schema
-- Date: 2026-04-15
-- =============================================================================
--
-- OVERVIEW
-- --------
-- Introduces a fully normalized RBAC layer on top of the existing frs_user /
-- frs_user_membership tables.  Four new tables are created:
--
--   rbac_permission      Master catalog of every permission code (37 codes)
--   rbac_role            The 3 system roles
--   rbac_role_permission Default permission grants per role (join table)
--   user_role            User → role assignment with optional site scope
--
-- DESIGN DECISIONS
-- ----------------
-- 1. Normalized (Option B), NOT JSONB arrays.
--    FK integrity on permission_code prevents typos; permissions carry metadata
--    (category, is_scope_aware) used by the middleware and admin UI.
--
-- 2. Site-scoping via user_role.fk_site_id:
--      NULL  = global access (super_admin; company-wide hr_manager)
--      value = scoped to that site only (site_admin; site-specific hr_manager)
--
-- 3. scope_type on rbac_role enforces the scoping contract:
--      'global'   – fk_site_id MUST be NULL   (super_admin)
--      'site'     – fk_site_id MUST be set     (site_admin)
--      'flexible' – either is valid             (hr_manager)
--
-- 4. Partial unique indexes (not column UNIQUE) on user_role because PostgreSQL
--    treats NULL != NULL in UNIQUE constraints — without partial indexes a user
--    could have duplicate global role rows.
--
-- 5. Backward compatibility: frs_user.role and frs_user_membership.role check
--    constraints are widened (not replaced) to include the three new values.
--    Existing 'admin' / 'hr' values remain valid during the migration period.
--
-- PERMISSION COUNTS (authoritative, derived from explicit list below)
--   Super Admin : 29  (system·3 + sites·3 + devices·6 + employees·6
--                       + attendance·3 + reports·2 + users·3 + alerts·3)
--
--   NOTE: earlier design docs stated 28 — the correct total is 29.
--   The off-by-one was employees.deactivate, which is new for Super Admin
--   (it was not in the original 23-permission spec) but was not counted in
--   the incremental Q1 correction.
--
--   Site Admin  : 24  (sites·1 + devices·4 + employees·5 + attendance·3
--                       + shifts·3 + leave·2 + reports·2 + users·2 + alerts·2)
--   HR Manager  : 17  (employees·5 + attendance·3 + shifts·3 + leave·2
--                       + reports·2 + workforce·2)
--
-- =============================================================================


-- =============================================================================
-- SECTION 1: NEW TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- rbac_permission  – master catalog of every permission code in the system
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rbac_permission (
  pk_permission_id  SERIAL        PRIMARY KEY,

  permission_code   VARCHAR(80)   NOT NULL UNIQUE,
  -- Dot-notation: <resource>.<action>  e.g. 'devices.reboot', 'attendance.correct_request'
  -- This code is the string used in requirePermission() middleware calls.

  category          VARCHAR(40)   NOT NULL,
  -- Used to group permissions in the admin UI sidebar.
  -- Values: 'system', 'sites', 'devices', 'employees', 'attendance',
  --         'shifts', 'leave', 'reports', 'users', 'alerts', 'workforce'

  display_name      VARCHAR(120)  NOT NULL,
  -- Human-readable label shown in the role management UI.

  description       TEXT,

  is_scope_aware    BOOLEAN       NOT NULL DEFAULT TRUE,
  -- TRUE  : when a user has a site-scoped role assignment (fk_site_id IS NOT NULL),
  --         the application layer MUST add WHERE site_id = ? to queries for this
  --         resource.  Applies to employees, attendance, devices, reports, etc.
  -- FALSE : permission operates system-wide regardless of role scope.
  --         Applies to system config, user management, site CRUD, and
  --         any permission that is inherently global in meaning.

  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rbac_perm_category ON rbac_permission(category);
-- permission_code already has a UNIQUE index from the column constraint.


-- -----------------------------------------------------------------------------
-- rbac_role  – the 3 system roles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rbac_role (
  pk_role_id    SERIAL        PRIMARY KEY,

  role_name     VARCHAR(50)   NOT NULL UNIQUE,
  -- Values: 'super_admin', 'site_admin', 'hr_manager'
  -- (Extensible: future custom roles can be added with is_system = FALSE)

  display_name  VARCHAR(100)  NOT NULL,
  description   TEXT,

  scope_type    VARCHAR(20)   NOT NULL DEFAULT 'flexible'
                CHECK (scope_type IN ('global', 'site', 'flexible')),
  -- 'global'   : user_role.fk_site_id must be NULL  — super_admin
  -- 'site'     : user_role.fk_site_id must be set   — site_admin
  -- 'flexible' : either is valid                     — hr_manager
  -- Enforcement is at the application layer (service + constraint below).

  is_system     BOOLEAN       NOT NULL DEFAULT TRUE,
  -- System roles (is_system = TRUE) cannot be deleted via the API.
  -- This protects the 3 seed roles from accidental removal.

  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


-- -----------------------------------------------------------------------------
-- rbac_role_permission  – default permission grants per role
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rbac_role_permission (
  fk_role_id        INT   NOT NULL REFERENCES rbac_role(pk_role_id)
                          ON DELETE CASCADE,
  -- Cascade: if a non-system role is deleted, its permission grants are removed.

  fk_permission_id  INT   NOT NULL REFERENCES rbac_permission(pk_permission_id)
                          ON DELETE CASCADE,
  -- Cascade: if a permission is retired from the catalog, role grants are cleaned up.

  PRIMARY KEY (fk_role_id, fk_permission_id)
);

CREATE INDEX IF NOT EXISTS idx_rrp_role ON rbac_role_permission(fk_role_id);
CREATE INDEX IF NOT EXISTS idx_rrp_perm ON rbac_role_permission(fk_permission_id);


-- -----------------------------------------------------------------------------
-- user_role  – user → role assignment with optional site scope
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_role (
  pk_user_role_id  BIGSERIAL     PRIMARY KEY,

  fk_user_id       BIGINT        NOT NULL
                   REFERENCES frs_user(pk_user_id) ON DELETE CASCADE,
  -- Cascade: deleting a user removes all their role assignments.

  fk_role_id       INT           NOT NULL
                   REFERENCES rbac_role(pk_role_id) ON DELETE RESTRICT,
  -- Restrict: you cannot delete a role that still has active user assignments.

  fk_site_id       BIGINT
                   REFERENCES frs_site(pk_site_id) ON DELETE SET NULL,
  -- NULL  = global scope (no site restriction)
  -- value = permissions apply only within this site
  --
  -- Rules by scope_type (enforced at app layer):
  --   'global'   → must be NULL
  --   'site'     → must be non-NULL
  --   'flexible' → either is valid

  granted_by       BIGINT
                   REFERENCES frs_user(pk_user_id) ON DELETE SET NULL,
  -- The user who created this role assignment (audit trail).
  -- NULL = bootstrapped / system-seeded.

  granted_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ,
  -- NULL = never expires.
  -- Set for temporary/contractor access (checked at every request).

  is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
  -- Soft-delete: set FALSE to revoke without losing history.

  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ⚠️  IMPORTANT: PostgreSQL treats NULL != NULL in standard UNIQUE constraints.
--     A plain UNIQUE(fk_user_id, fk_role_id, fk_site_id) would allow two rows
--     with the same user+role+NULL (= duplicate global assignments).
--     We use two partial unique indexes instead:

-- Prevents duplicate global (non-site-scoped) role assignments per user
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_role_global
  ON user_role(fk_user_id, fk_role_id)
  WHERE fk_site_id IS NULL
    AND is_active   = TRUE;

-- Prevents duplicate site-scoped role assignments per user+site
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_role_site
  ON user_role(fk_user_id, fk_role_id, fk_site_id)
  WHERE fk_site_id IS NOT NULL
    AND is_active   = TRUE;

-- Hot-path index: every authenticated request resolves active roles for user N
CREATE INDEX IF NOT EXISTS idx_user_role_user_active
  ON user_role(fk_user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_user_role_site
  ON user_role(fk_site_id);


-- =============================================================================
-- SECTION 2: WIDEN EXISTING ROLE CHECK CONSTRAINTS (backward compatible)
-- =============================================================================

-- frs_user.role
-- Original constraint allowed only ('admin', 'hr').
-- We widen it to include the three RBAC roles while keeping legacy values valid.
DO $$ BEGIN
  ALTER TABLE frs_user DROP CONSTRAINT IF EXISTS frs_user_role_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE frs_user
  ADD CONSTRAINT frs_user_role_check
  CHECK (role IN ('admin', 'hr', 'super_admin', 'site_admin', 'hr_manager'));

-- frs_user_membership.role
-- Same pattern — legacy memberships still work; new RBAC roles are also accepted.
DO $$ BEGIN
  ALTER TABLE frs_user_membership DROP CONSTRAINT IF EXISTS frs_user_membership_role_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE frs_user_membership
  ADD CONSTRAINT frs_user_membership_role_check
  CHECK (role IN ('admin', 'hr', 'super_admin', 'site_admin', 'hr_manager'));


-- =============================================================================
-- SECTION 3: SEED  rbac_permission  (37 permission codes)
-- =============================================================================

INSERT INTO rbac_permission (permission_code, category, display_name, is_scope_aware) VALUES

  -- ── System (3) ─────────────────────────────────────────────────────────────
  -- is_scope_aware = FALSE: system config is inherently global; never filtered
  -- by site even if the caller has a site-scoped role.
  ('system.settings.read',       'system',     'View System Settings',                FALSE),
  ('system.settings.write',      'system',     'Edit System Settings',                FALSE),
  ('system.audit.read',          'system',     'View Audit Logs',                     FALSE),

  -- ── Sites (3) ──────────────────────────────────────────────────────────────
  -- sites.read is FALSE: a site_admin reads their own site — the scoping comes
  -- from the role assignment (fk_site_id), not a data-layer WHERE clause.
  -- sites.write / sites.delete are super_admin-only global operations.
  ('sites.read',                 'sites',      'View Sites',                          FALSE),
  ('sites.write',                'sites',      'Create / Edit Sites',                 FALSE),
  ('sites.delete',               'sites',      'Delete Sites',                        FALSE),

  -- ── Devices (6) ────────────────────────────────────────────────────────────
  -- is_scope_aware = TRUE: device queries must be filtered to the user's site
  -- when a site-scoped role is active.
  -- provision/decommission are FALSE because they are tenant-level lifecycle
  -- operations that should never be limited to one site's data.
  ('devices.read',               'devices',    'View Devices',                        TRUE),
  ('devices.write',              'devices',    'Add / Edit Devices',                  TRUE),
  ('devices.reboot',             'devices',    'Reboot Devices',                      TRUE),
  ('devices.configure',          'devices',    'Configure Device Settings',           TRUE),
  ('devices.provision',          'devices',    'Provision New Devices',               FALSE),
  ('devices.decommission',       'devices',    'Decommission Devices',                FALSE),

  -- ── Employees (6) ──────────────────────────────────────────────────────────
  -- employees.delete is hard-delete (permanent record removal) — only super_admin.
  -- employees.deactivate is soft-disable — site_admin and hr_manager.
  -- bulk operations always respect the caller's site scope when is_scope_aware=TRUE.
  ('employees.read',             'employees',  'View Employees',                      TRUE),
  ('employees.write',            'employees',  'Add / Edit Employees',                TRUE),
  ('employees.delete',           'employees',  'Permanently Delete Employees',        TRUE),
  ('employees.deactivate',       'employees',  'Deactivate Employees (soft disable)', TRUE),
  ('employees.bulk_import',      'employees',  'Bulk Import Employees',               TRUE),
  ('employees.bulk_assign',      'employees',  'Bulk Assign Employees to Site/Shift', TRUE),

  -- ── Attendance (4) ─────────────────────────────────────────────────────────
  -- attendance.correct      = direct overwrite, super_admin only.
  -- attendance.correct_request = submits a correction for approval;
  --   site_admin approves requests from hr_manager and vice versa.
  ('attendance.read',            'attendance', 'View Attendance Records',             TRUE),
  ('attendance.write',           'attendance', 'Record Attendance',                   TRUE),
  ('attendance.correct',         'attendance', 'Directly Correct Attendance Records', TRUE),
  ('attendance.correct_request', 'attendance', 'Submit Attendance Correction Request',TRUE),

  -- ── Shifts (3) ─────────────────────────────────────────────────────────────
  ('shifts.read',                'shifts',     'View Shift Definitions',              TRUE),
  ('shifts.write',               'shifts',     'Create / Edit Shifts',                TRUE),
  ('shifts.assign',              'shifts',     'Assign Shifts to Employees',          TRUE),

  -- ── Leave (2) ──────────────────────────────────────────────────────────────
  ('leave.read',                 'leave',      'View Leave Requests',                 TRUE),
  ('leave.write',                'leave',      'Approve / Reject Leave Requests',     TRUE),

  -- ── Reports (2) ────────────────────────────────────────────────────────────
  ('reports.generate',           'reports',    'Generate Reports',                    TRUE),
  ('reports.export',             'reports',    'Export Reports',                      TRUE),

  -- ── Users (3) ──────────────────────────────────────────────────────────────
  -- is_scope_aware = FALSE: user management is not a site-filtered operation.
  -- The application layer enforces "site_admin can only create hr_managers for
  -- their own site" through business logic, not a WHERE site_id clause.
  ('users.read',                 'users',      'View Users',                          FALSE),
  ('users.write',                'users',      'Create / Edit Users',                 FALSE),
  ('users.roles.manage',         'users',      'Assign / Revoke Roles',               FALSE),

  -- ── Alerts (3) ─────────────────────────────────────────────────────────────
  -- alerts.read / alerts.acknowledge are scope-aware (site-filtered).
  -- alerts.configure is global (configures system-wide alert rule definitions).
  ('alerts.read',                'alerts',     'View Alerts',                         TRUE),
  ('alerts.acknowledge',         'alerts',     'Acknowledge Alerts',                  TRUE),
  ('alerts.configure',           'alerts',     'Configure Alert Rules',               FALSE),

  -- ── Workforce Config (2 — HR Manager specific) ─────────────────────────────
  ('breaks.configure',           'workforce',  'Configure Break Rules',               TRUE),
  ('overtime.configure',         'workforce',  'Configure Overtime Rules',            TRUE)

ON CONFLICT (permission_code) DO NOTHING;
-- ON CONFLICT DO NOTHING: idempotent — safe to re-run the migration.


-- =============================================================================
-- SECTION 4: SEED  rbac_role  (3 system roles)
-- =============================================================================

INSERT INTO rbac_role (role_name, display_name, description, scope_type, is_system) VALUES

  ('super_admin',
   'Super Admin',
   'Full system access across all sites and tenants. '
   'Role assignment must be global (fk_site_id = NULL). '
   'Only role with hard-delete, provisioning, and role-management permissions.',
   'global',
   TRUE),

  ('site_admin',
   'Site Admin',
   'Full management of one assigned site: devices, employees, shifts, leave, '
   'attendance, and HR user creation. '
   'Role assignment must include a specific site (fk_site_id IS NOT NULL). '
   'Cannot create/delete sites, provision/decommission devices, or manage other site admins.',
   'site',
   TRUE),

  ('hr_manager',
   'HR Manager',
   'Employee lifecycle and attendance management. No access to devices, sites, '
   'system settings, or user management. '
   'Can be assigned globally (all sites) or scoped to a single site.',
   'flexible',
   TRUE)

ON CONFLICT (role_name) DO NOTHING;


-- =============================================================================
-- SECTION 5: SEED  rbac_role_permission
-- =============================================================================

-- ── Super Admin: 29 permissions ──────────────────────────────────────────────
--
--   system     (3): settings.read, settings.write, audit.read
--   sites      (3): read, write, delete
--   devices    (6): read, write, reboot, configure, provision, decommission
--   employees  (6): read, write, delete, deactivate, bulk_import, bulk_assign
--   attendance (3): read, write, correct          ← direct correct (not request)
--   reports    (2): generate, export
--   users      (3): read, write, roles.manage
--   alerts     (3): read, acknowledge, configure
--   ─────────────────────────────────────────────
--   Total      29
--
INSERT INTO rbac_role_permission (fk_role_id, fk_permission_id)
SELECT r.pk_role_id, p.pk_permission_id
FROM   rbac_role r
CROSS  JOIN rbac_permission p
WHERE  r.role_name = 'super_admin'
AND    p.permission_code IN (
  -- system (3)
  'system.settings.read',
  'system.settings.write',
  'system.audit.read',
  -- sites (3)
  'sites.read',
  'sites.write',
  'sites.delete',
  -- devices (6)
  'devices.read',
  'devices.write',
  'devices.reboot',
  'devices.configure',
  'devices.provision',
  'devices.decommission',
  -- employees (6) — all employee permissions including hard-delete
  'employees.read',
  'employees.write',
  'employees.delete',
  'employees.deactivate',
  'employees.bulk_import',
  'employees.bulk_assign',
  -- attendance (3) — direct correct, not request
  'attendance.read',
  'attendance.write',
  'attendance.correct',
  -- reports (2)
  'reports.generate',
  'reports.export',
  -- users (3) — full user + role management
  'users.read',
  'users.write',
  'users.roles.manage',
  -- alerts (3) — all alert permissions
  'alerts.read',
  'alerts.acknowledge',
  'alerts.configure'
)
ON CONFLICT DO NOTHING;


-- ── Site Admin: 24 permissions ───────────────────────────────────────────────
--
--   sites      (1): read                    ← own site only (enforced by scope)
--   devices    (4): read, write, reboot, configure
--                                            ← no provision/decommission
--   employees  (5): read, write, deactivate, bulk_import, bulk_assign
--                                            ← no hard-delete
--   attendance (3): read, write, correct_request
--                                            ← submits request, no direct correct
--   shifts     (3): read, write, assign
--   leave      (2): read, write
--   reports    (2): generate, export
--   users      (2): read, write              ← can create hr_managers for own site
--                                               cannot manage roles
--   alerts     (2): read, acknowledge        ← no configure
--   ─────────────────────────────────────────
--   Total      24
--
INSERT INTO rbac_role_permission (fk_role_id, fk_permission_id)
SELECT r.pk_role_id, p.pk_permission_id
FROM   rbac_role r
CROSS  JOIN rbac_permission p
WHERE  r.role_name = 'site_admin'
AND    p.permission_code IN (
  -- sites (1)
  'sites.read',
  -- devices (4) — daily operations; no lifecycle ops
  'devices.read',
  'devices.write',
  'devices.reboot',
  'devices.configure',
  -- employees (5) — soft-disable + bulk; no hard-delete
  'employees.read',
  'employees.write',
  'employees.deactivate',
  'employees.bulk_import',
  'employees.bulk_assign',
  -- attendance (3) — correction via request, not direct
  'attendance.read',
  'attendance.write',
  'attendance.correct_request',
  -- shifts (3)
  'shifts.read',
  'shifts.write',
  'shifts.assign',
  -- leave (2)
  'leave.read',
  'leave.write',
  -- reports (2)
  'reports.generate',
  'reports.export',
  -- users (2)
  'users.read',
  'users.write',
  -- alerts (2)
  'alerts.read',
  'alerts.acknowledge'
)
ON CONFLICT DO NOTHING;


-- ── HR Manager: 17 permissions ───────────────────────────────────────────────
--
--   employees  (5): read, write, deactivate, bulk_import, bulk_assign
--                                            ← no delete, no device/site/user access
--   attendance (3): read, write, correct_request
--   shifts     (3): read, write, assign
--   leave      (2): read, write
--   reports    (2): generate, export
--   workforce  (2): breaks.configure, overtime.configure
--   ─────────────────────────────────────────
--   Total      17
--
--   NOTE: scope depends on user_role.fk_site_id:
--     NULL  → sees employees/attendance across ALL sites
--     value → sees employees/attendance only within that one site
--
INSERT INTO rbac_role_permission (fk_role_id, fk_permission_id)
SELECT r.pk_role_id, p.pk_permission_id
FROM   rbac_role r
CROSS  JOIN rbac_permission p
WHERE  r.role_name = 'hr_manager'
AND    p.permission_code IN (
  -- employees (5)
  'employees.read',
  'employees.write',
  'employees.deactivate',
  'employees.bulk_import',
  'employees.bulk_assign',
  -- attendance (3) — correction via request only
  'attendance.read',
  'attendance.write',
  'attendance.correct_request',
  -- shifts (3)
  'shifts.read',
  'shifts.write',
  'shifts.assign',
  -- leave (2)
  'leave.read',
  'leave.write',
  -- reports (2)
  'reports.generate',
  'reports.export',
  -- workforce config (2) — HR-only policy levers
  'breaks.configure',
  'overtime.configure'
)
ON CONFLICT DO NOTHING;


-- =============================================================================
-- SECTION 6: SAMPLE user_role ASSIGNMENTS
-- =============================================================================
-- These are reference examples showing all four scoping patterns.
-- They are wrapped in a DO block and only execute if the referenced
-- user IDs (1–4) and site IDs (4, 7) actually exist in your database.
-- In production, use the /api/admin/users/:id/roles API instead.
-- =============================================================================

DO $$
BEGIN

  -- 1. Super Admin: User 1, global (no site restriction)
  --    scope_type = 'global' → fk_site_id must be NULL
  IF EXISTS (SELECT 1 FROM frs_user WHERE pk_user_id = 1) THEN
    INSERT INTO user_role (fk_user_id, fk_role_id, fk_site_id, granted_by)
    SELECT 1, r.pk_role_id, NULL, NULL
    FROM   rbac_role r
    WHERE  r.role_name = 'super_admin'
    ON CONFLICT DO NOTHING;
  END IF;

  -- 2. Site Admin: User 2, scoped to Site 4
  --    scope_type = 'site' → fk_site_id must be non-NULL
  --    User 2 can ONLY see/manage resources where site_id = 4
  IF EXISTS (SELECT 1 FROM frs_user WHERE pk_user_id = 2)
  AND EXISTS (SELECT 1 FROM frs_site WHERE pk_site_id = 4) THEN
    INSERT INTO user_role (fk_user_id, fk_role_id, fk_site_id, granted_by)
    SELECT 2, r.pk_role_id, 4, 1
    FROM   rbac_role r
    WHERE  r.role_name = 'site_admin'
    ON CONFLICT DO NOTHING;
  END IF;

  -- 3. HR Manager: User 3, company-wide (no site restriction)
  --    scope_type = 'flexible', fk_site_id = NULL
  --    User 3 sees employees/attendance across ALL sites
  IF EXISTS (SELECT 1 FROM frs_user WHERE pk_user_id = 3) THEN
    INSERT INTO user_role (fk_user_id, fk_role_id, fk_site_id, granted_by)
    SELECT 3, r.pk_role_id, NULL, 1
    FROM   rbac_role r
    WHERE  r.role_name = 'hr_manager'
    ON CONFLICT DO NOTHING;
  END IF;

  -- 4. HR Manager: User 4, scoped to Site 7 only
  --    scope_type = 'flexible', fk_site_id = 7
  --    User 4 sees employees/attendance ONLY where site_id = 7
  IF EXISTS (SELECT 1 FROM frs_user WHERE pk_user_id = 4)
  AND EXISTS (SELECT 1 FROM frs_site WHERE pk_site_id = 7) THEN
    INSERT INTO user_role (fk_user_id, fk_role_id, fk_site_id, granted_by)
    SELECT 4, r.pk_role_id, 7, 1
    FROM   rbac_role r
    WHERE  r.role_name = 'hr_manager'
    ON CONFLICT DO NOTHING;
  END IF;

END $$;


-- =============================================================================
-- SECTION 7: RUNTIME QUERY REFERENCE (not executed — for documentation)
-- =============================================================================
--
-- The auth middleware resolves a user's full permission set with this query:
--
--   SELECT
--     ur.fk_site_id,                       -- NULL = global, value = site-scoped
--     r.role_name,
--     r.scope_type,
--     array_agg(p.permission_code) AS permissions
--   FROM   user_role ur
--   JOIN   rbac_role r             ON r.pk_role_id       = ur.fk_role_id
--   JOIN   rbac_role_permission rp ON rp.fk_role_id      = r.pk_role_id
--   JOIN   rbac_permission p       ON p.pk_permission_id = rp.fk_permission_id
--   WHERE  ur.fk_user_id = $1
--     AND  ur.is_active  = TRUE
--     AND  (ur.expires_at IS NULL OR ur.expires_at > NOW())
--   GROUP BY ur.fk_site_id, r.role_name, r.scope_type;
--
-- Returns one row per scope context.  An HR Manager with both a global and a
-- site-scoped assignment returns two rows — both are loaded into req.auth.
--
-- =============================================================================
-- END OF MIGRATION 014
-- =============================================================================
