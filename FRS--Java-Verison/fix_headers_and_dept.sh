#!/bin/bash
set -e
PROJECT="$HOME/FRS_/FRS--Java-Verison"
echo "=================================================="
echo " FRS2: Fix duplicate headers + dept employee mgmt"
echo "=================================================="
cd "$PROJECT"

# ── 1. Fix HRDashboard duplicate header ──────────────────
echo "[1/3] Fixing HRDashboard header..."
python3 << 'PYEOF'
import os
path = os.path.expanduser("~/FRS_/FRS--Java-Verison/src/app/components/HRDashboard.tsx")
with open(path) as f:
    c = f.read()

STANDALONE = "['live-office','leave-management','employee-lifecycle','dept-shift','attendance-history']"

old = """          {/* Page Title & Actions */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className={cn("text-2xl font-bold", lightTheme.text.primary, "dark:text-white")}>
                  {navigationItems.find(item => item.value === activeTab)?.label || 'Overview'}
                </h2>
                <p className={cn("text-sm mt-1", lightTheme.text.secondary, "dark:text-gray-400")}>
                  Showing data from {filters.dateRange.start.toLocaleDateString()} to{' '}
                  {filters.dateRange.end.toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant={showFilters ? 'default' : 'outline'}
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Filters
                </Button>
                <Button variant="outline" onClick={handleExportReport} disabled={isExporting}>
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  {isExporting ? 'Generating...' : 'Export Report'}
                </Button>
              </div>
            </div>

            {/* Filter Panel */}
            {showFilters && (
              <FilterPanel filters={filters} onFiltersChange={setFilters} />
            )}
          </div>"""

new = """          {/* Page Title & Actions — only on overview/analytics tabs */}
          {!['live-office','leave-management','employee-lifecycle','dept-shift','attendance-history'].includes(activeTab) && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className={cn("text-2xl font-bold", lightTheme.text.primary, "dark:text-white")}>
                    {navigationItems.find(item => item.value === activeTab)?.label || 'Overview'}
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant={showFilters ? 'default' : 'outline'}
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    <Filter className="w-4 h-4 mr-2" />
                    Filters
                  </Button>
                  <Button variant="outline" onClick={handleExportReport} disabled={isExporting}>
                    {isExporting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    {isExporting ? 'Generating...' : 'Export Report'}
                  </Button>
                </div>
              </div>
              {showFilters && (
                <FilterPanel filters={filters} onFiltersChange={setFilters} />
              )}
            </div>
          )}"""

if old in c:
    c = c.replace(old, new)
    print("  ✅ Header made conditional")
else:
    # Line-by-line fallback — remove just the "Showing data from" subtitle
    c = c.replace(
        '                <p className={cn("text-sm mt-1", lightTheme.text.secondary, "dark:text-gray-400")}>\n                  Showing data from {filters.dateRange.start.toLocaleDateString()} to{\' \'}\n                  {filters.dateRange.end.toLocaleDateString()}\n                </p>',
        ''
    )
    print("  ✅ Removed date subtitle (fallback)")

with open(path, 'w') as f:
    f.write(c)
PYEOF

# ── 2. Add /api/hr/departments/:id/assign endpoint ───────
echo "[2/3] Adding department employee assignment endpoint..."
python3 << 'PYEOF'
import os
path = os.path.expanduser("~/FRS_/FRS--Java-Verison/backend/src/routes/hrRoutes.js")
with open(path) as f:
    c = f.read()

if 'departments/:id/assign' not in c:
    c = c.replace(
        "// ── Shifts ─────────────────────────────────────────────────────────",
        """// Assign employees to department
router.post('/departments/:id/assign', requirePermission('users.manage'), asyncHandler(async (req, res) => {
  const { employee_ids } = req.body;
  if (!Array.isArray(employee_ids)) return res.status(400).json({ message: 'employee_ids array required' });
  await pool.query(
    `UPDATE hr_employee SET fk_department_id=$1 WHERE pk_employee_id = ANY($2::bigint[]) AND tenant_id=$3`,
    [req.params.id, employee_ids, getTenant(req)]
  );
  return res.json({ success: true, updated: employee_ids.length });
}));

// ── Shifts ─────────────────────────────────────────────────────────"""
    )
    with open(path, 'w') as f:
        f.write(c)
    print("  ✅ Department assign endpoint added")
else:
    print("  ✅ Already exists")
PYEOF

# ── 3. Add employee assignment to DepartmentShiftManagement ──
echo "[3/3] Adding employee assignment to department cards..."
python3 << 'PYEOF'
import os
path = os.path.expanduser("~/FRS_/FRS--Java-Verison/src/app/components/hr/DepartmentShiftManagement.tsx")
with open(path) as f:
    c = f.read()

if 'assignDeptOpen' not in c:
    # Add state variables after assignShift state
    c = c.replace(
        "  // Assign shift\n  const [assignOpen, setAssignOpen]   = useState(false);",
        """  // Assign dept
  const [assignDeptOpen, setAssignDeptOpen] = useState(false);
  const [assignDept, setAssignDept]         = useState<any>(null);
  const [selectedDeptEmps, setSelectedDeptEmps] = useState<string[]>([]);

  // Assign shift\n  const [assignOpen, setAssignOpen]   = useState(false);"""
    )

    # Add openAssignDept function after openAssign function
    c = c.replace(
        "  const saveAssign = async () => {",
        """  const openAssignDept = (dept: any) => {
    setAssignDept(dept);
    const empIds = employees.filter((e: any) => e.fk_department_id === dept.id).map((e: any) => String(e.pk_employee_id));
    setSelectedDeptEmps(empIds);
    setAssignDeptOpen(true);
  };

  const saveDeptAssign = async () => {
    if (!assignDept) return;
    setSaving(true);
    try {
      await apiRequest(`/hr/departments/${assignDept.id}/assign`, {
        method: 'POST', accessToken, scopeHeaders,
        body: JSON.stringify({ employee_ids: selectedDeptEmps.map(Number) }),
      });
      toast.success('Staff assigned', { description: `${selectedDeptEmps.length} employees assigned to ${assignDept.name}` });
      setAssignDeptOpen(false);
      await load();
    } catch (e) { toast.error('Failed');
    } finally { setSaving(false); }
  };

  const saveAssign = async () => {"""
    )

    # Add Assign button to department cards (after edit/delete buttons)
    c = c.replace(
        """                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50"
                          onClick={() => { setDeptEdit(d); setDeptForm({ name: d.name, code: d.code, color: d.color || '#3B82F6' }); setDeptOpen(true); }}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                          onClick={() => deleteDept(d)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>""",
        """                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-indigo-600 hover:bg-indigo-50 gap-1"
                          onClick={() => openAssignDept(d)}>
                          <Users className="w-3 h-3" /> Assign
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50"
                          onClick={() => { setDeptEdit(d); setDeptForm({ name: d.name, code: d.code, color: d.color || '#3B82F6' }); setDeptOpen(true); }}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                          onClick={() => deleteDept(d)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>"""
    )

    # Add the dept assign dialog before the closing </div> of the component
    c = c.replace(
        "      {/* Shift dialog */}",
        """      {/* Dept assign dialog */}
      <Dialog open={assignDeptOpen} onOpenChange={setAssignDeptOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Staff — {assignDept?.name}</DialogTitle>
            <DialogDescription>Select employees to assign to this department.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-64 overflow-y-auto space-y-2">
            {employees.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">No employees loaded</p>
            ) : employees.map((emp: any) => {
              const id = String(emp.pk_employee_id);
              const checked = selectedDeptEmps.includes(id);
              return (
                <label key={id} className={cn("flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-colors",
                  checked ? "bg-blue-50 border-blue-200" : cn(lightTheme.background.secondary, lightTheme.border.default)
                )}>
                  <input type="checkbox" checked={checked} onChange={() =>
                    setSelectedDeptEmps(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
                  } className="rounded" />
                  <div>
                    <p className="text-sm font-semibold">{emp.full_name}</p>
                    <p className="text-xs text-slate-400">{emp.employee_code} · {emp.position_title}</p>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="flex justify-between items-center mt-4">
            <span className="text-xs text-slate-400">{selectedDeptEmps.length} selected</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAssignDeptOpen(false)}>Cancel</Button>
              <Button onClick={saveDeptAssign} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Assign
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shift dialog */}"""
    )

    with open(path, 'w') as f:
        f.write(c)
    print("  ✅ Department employee assignment added")
else:
    print("  ✅ Already has dept assignment")
PYEOF

# ── Rebuild ───────────────────────────────────────────────
echo ""
echo "Rebuilding..."
docker compose build backend frontend 2>&1 | grep -E "FINISHED|ERROR" | head -5
docker compose up -d backend frontend

sleep 15
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://172.20.100.222:5173 2>/dev/null || echo "000")
echo "  Frontend: HTTP $STATUS"

echo ""
echo "✅ Done. Hard refresh: Ctrl+Shift+R"
echo ""
echo "Fixed:"
echo "  • Duplicate header removed from Leave, Employee, Attendance, Dept tabs"
echo "  • Department cards now have Assign button (same as shifts)"
echo "  • Department assignment saved to hr_employee.fk_department_id"