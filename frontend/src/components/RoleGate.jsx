import { useRole } from '@/lib/useRole';

// Conditionally render children based on the current user's portal role.
// <RoleGate allow={['patient']}>...</RoleGate> — renders fallback (default null)
// for any role not in `allow`. Use to hide actions a role/consent doesn't permit.
export default function RoleGate({ allow, children, fallback = null }) {
  const { role } = useRole();
  if (!Array.isArray(allow) || !allow.includes(role)) return fallback;
  return children;
}