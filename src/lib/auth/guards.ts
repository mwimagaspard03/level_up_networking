import 'server-only';
import { redirect } from 'next/navigation';
import { getRequestIdentity } from './server';
import type { AppRole } from './roles';

export async function requireRole<const Roles extends readonly AppRole[]>(allowed: Roles) {
  const identity = await getRequestIdentity();
  const profile = identity.profile;
  if (!profile) return redirect('/login?next=%2Fdashboard');
  if (!allowed.some((role) => role === profile.role)) return redirect('/dashboard');
  return { ...identity, profile: { ...profile, role: profile.role as Roles[number] } };
}
