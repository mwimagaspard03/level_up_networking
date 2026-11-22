export const APP_ROLES = ['OWNER', 'ADMIN', 'STUDENT'] as const;

export type AppRole = (typeof APP_ROLES)[number];
export type Profile = {
  id: string;
  display_name: string | null;
  role: AppRole;
};

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && APP_ROLES.includes(value as AppRole);
}

export function canInviteRole(actor: AppRole | null, requestedRole: unknown): requestedRole is 'STUDENT' | 'ADMIN' {
  if (requestedRole === 'STUDENT') return actor === 'OWNER' || actor === 'ADMIN';
  if (requestedRole === 'ADMIN') return actor === 'OWNER';
  return false;
}

export function canResendInvitation(actor: AppRole | null, targetRole: unknown): boolean {
  if (actor === 'OWNER') return targetRole === 'STUDENT' || targetRole === 'ADMIN';
  return actor === 'ADMIN' && targetRole === 'STUDENT';
}

export function canChangeRole(actor: AppRole | null, requestedRole: unknown): requestedRole is AppRole {
  return actor === 'OWNER' && isAppRole(requestedRole);
}
