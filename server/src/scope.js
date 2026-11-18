// Who can see which customers / appointments. Agents: their own. Supervisors: their team. Finance/Ops/Admin: all.
import { HttpError } from './auth.js';

export function agentScope(req) {
  if (req.perms.has('customers.view_all')) return {};
  if (req.perms.has('customers.view_team')) return { agent: { supervisorId: req.user.id } };
  if (req.perms.has('customers.view_own')) return { agentId: req.user.id };
  return null;
}

export function requireScope(req) {
  const s = agentScope(req);
  if (!s) throw new HttpError(403, 'You do not have permission to see customers.');
  return s;
}

// Only the owning agent (or someone with company-wide access who can also add customers) may change a customer.
export function canEditCustomer(req, customer) {
  return req.perms.has('customers.create') && (customer.agentId === req.user.id || req.perms.has('customers.view_all'));
}

export function normalisePhone(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('250') && d.length === 12) d = '0' + d.slice(3);
  if (d.length === 9 && d.startsWith('7')) d = '0' + d;
  return d;
}
export const isValidPhone = (p) => /^07[2389]\d{7}$/.test(p);

export function startOf(period) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  if (period === 'month') d.setDate(1);
  return d;
}
