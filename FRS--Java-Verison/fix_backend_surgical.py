import os

repo_path = "backend/src/repositories/liveRepository.js"
route_path = "backend/src/routes/liveRoutes.js"

# --- Repository Fix ---
with open(repo_path, "r") as f:
    repo_lines = f.readlines()

# Remove any previous broken getHourlyActivity attempts
clean_repo = []
skip = False
for line in repo_lines:
    if "async getHourlyActivity" in line: skip = True
    if not skip: clean_repo.append(line)
    if skip and line.strip() == "}": skip = False

if clean_repo[-1].strip() == "}": clean_repo.pop()

repo_method = """
  async getHourlyActivity() {
    const tz = await this.getSiteTimezone();
    const query = `
      WITH hours AS (
        SELECT generate_series(
          date_trunc('hour', NOW() AT TIME ZONE $1) - INTERVAL '23 hours',
          date_trunc('hour', NOW() AT TIME ZONE $1),
          '1 hour'::interval
        ) AS hr
      )
      SELECT 
        to_char(h.hr, 'HH24:00') as label,
        COUNT(a.pk_attendance_id)::int as value
      FROM hours h
      LEFT JOIN attendance_record a ON date_trunc('hour', a.check_in AT TIME ZONE $1) = h.hr
      GROUP BY h.hr
      ORDER BY h.hr ASC;
    `;
    const { pool } = await import("../db/pool.js");
    const { rows } = await pool.query(query, [tz]);
    return rows;
  }
}
"""
with open(repo_path, "w") as f:
    f.writelines(clean_repo)
    f.write(repo_method)

# --- Routes Fix ---
with open(route_path, "r") as f:
    route_lines = f.readlines()

clean_route = [l for l in route_lines if "getHourlyActivity" not in l and "activity/hourly" not in l and "EOF" not in l]

final_route = []
for line in clean_route:
    if "getSiteTimezone," in line:
        final_route.append(line.replace("getSiteTimezone,", "getSiteTimezone, getHourlyActivity,"))
    elif "export { router as liveRoutes };" in line:
        final_route.append('\nrouter.get("/activity/hourly", requirePermission("analytics.read"), asyncHandler(async (req, res) => {\n')
        final_route.append('  const data = await getHourlyActivity();\n')
        final_route.append('  return res.json({ data });\n')
        final_route.append('}));\n\n')
        final_route.append(line)
    else:
        final_route.append(line)

with open(route_path, "w") as f:
    f.writelines(final_route)

print("Backend files surgically repaired.")
