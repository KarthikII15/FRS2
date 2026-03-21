export function buildScopeWhere(scope, alias = "") {
  const prefix = alias ? `${alias}.` : "";
  const clauses = [];
  const values = [];

  // tenant_id is always required
  values.push(Number(scope.tenantId));
  clauses.push(`${prefix}tenant_id = $${values.length}`);

  // customer_id, site_id, unit_id: match if set on record, OR if record has NULL
  if (scope.customerId) {
    values.push(Number(scope.customerId));
    clauses.push(`(${prefix}customer_id = $${values.length} OR ${prefix}customer_id IS NULL)`);
  }
  if (scope.siteId) {
    values.push(Number(scope.siteId));
    clauses.push(`(${prefix}site_id = $${values.length} OR ${prefix}site_id IS NULL)`);
  }
  if (scope.unitId) {
    values.push(Number(scope.unitId));
    clauses.push(`(${prefix}unit_id = $${values.length} OR ${prefix}unit_id IS NULL)`);
  }

  return { whereSql: clauses.join(" and "), values };
}
