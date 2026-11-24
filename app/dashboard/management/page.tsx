import Container from '@/src/components/ui/Container';
import ManagementPanel from '@/src/components/dashboard/ManagementPanel';
import { requireRole } from '@/src/lib/auth/guards';
export const dynamic='force-dynamic';
export default async function ManagementPage(){const {profile}=await requireRole(['OWNER','ADMIN']);return <main className="route-main"><Container><p className="eyebrow">ESPACE {profile.role}</p><h1 className="route-title">Centre de gestion</h1><p className="route-lead">Administration des membres et des formations.</p><ManagementPanel role={profile.role}/></Container></main>}
