export const ROLES = ['ADMIN', 'SUPERVISOR', 'AGENT', 'FINANCE', 'OPERATIONS', 'TECHNICIAN'];

export const PERMISSIONS = [
  { key: 'users.view', label: 'View users & teams', group: 'Administration' },
  { key: 'users.manage', label: 'Create & edit users', group: 'Administration' },
  { key: 'permissions.manage', label: 'Change permissions', group: 'Administration' },
  { key: 'audit.view', label: 'View audit log', group: 'Administration' },
  { key: 'backups.manage', label: 'Run backups & restore', group: 'Administration' },
  { key: 'customers.create', label: 'Add customers & visits', group: 'Customers' },
  { key: 'customers.view_own', label: 'See own customers', group: 'Customers' },
  { key: 'customers.view_team', label: "See team's customers", group: 'Customers' },
  { key: 'customers.view_all', label: 'See all customers', group: 'Customers' },
  { key: 'payments.record', label: 'Record payment (Txn ID)', group: 'Payments' },
  { key: 'payments.confirm_supervisor', label: 'Confirm payment (supervisor)', group: 'Payments' },
  { key: 'payments.confirm_finance', label: 'Reconfirm payment (finance)', group: 'Payments' },
  { key: 'packages.manage', label: 'Manage packages & prices', group: 'Payments' },
  { key: 'installs.assign', label: 'Assign technicians', group: 'Installations' },
  { key: 'installs.complete', label: 'Complete installations', group: 'Installations' },
  { key: 'inventory.manage', label: 'Manage inventory', group: 'Installations' },
  { key: 'reports.team', label: 'Team reports & exports', group: 'Reports' },
  { key: 'reports.all', label: 'Company-wide reports', group: 'Reports' },
  { key: 'targets.manage_team', label: "Set targets for own team", group: 'Reports' },
  { key: 'targets.manage_all', label: 'Set targets for all agents', group: 'Reports' },
];

export const DEFAULT_MATRIX = {
  ADMIN: PERMISSIONS.map((p) => p.key),
  SUPERVISOR: ['customers.view_team', 'payments.confirm_supervisor', 'reports.team', 'targets.manage_team'],
  AGENT: ['customers.create', 'customers.view_own', 'payments.record'],
  FINANCE: ['customers.view_all', 'payments.confirm_finance', 'packages.manage', 'reports.all'],
  OPERATIONS: ['customers.view_all', 'installs.assign', 'inventory.manage', 'reports.all'],
  TECHNICIAN: ['installs.complete'],
};

// Permissions that can never be removed (prevents admins locking themselves out).
export const LOCKED = { ADMIN: ['users.view', 'users.manage', 'permissions.manage'] };

// Adds default rights for permissions introduced after the database was first seeded,
// without touching permissions an admin has already configured.
export async function ensureNewPermissions(prisma) {
  const known = new Set((await prisma.rolePermission.findMany({ distinct: ['permission'], select: { permission: true } })).map((r) => r.permission));
  if (known.size === 0) return 0; // fresh database: the seed handles it
  const rows = Object.entries(DEFAULT_MATRIX).flatMap(([role, perms]) =>
    perms.filter((p) => !known.has(p)).map((permission) => ({ role, permission })));
  if (rows.length) await prisma.rolePermission.createMany({ data: rows });
  return rows.length;
}
