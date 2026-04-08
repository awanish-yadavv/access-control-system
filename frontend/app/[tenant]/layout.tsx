import { getServerSession } from 'next-auth/next';
import { redirect, notFound } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import TenantSidebar from '@/components/ui/TenantSidebar';
import TenantTopbar from '@/components/ui/TenantTopbar';

interface Tenant {
  id: string;
  name: string;
  status: 'active' | 'suspended' | 'inactive';
}

const TenantLayout = async ({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) => {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const { tenant: tenantId } = await params;

  // TENANT users can only access their own tenant space
  if (session.user.userType === 'TENANT' && session.user.tenantId !== tenantId) {
    redirect(`/${session.user.tenantId}`);
  }
  // CUSTOMER users are similarly scoped
  if (session.user.userType === 'CUSTOMER' && session.user.tenantId !== tenantId) {
    redirect(`/${session.user.tenantId}`);
  }

  // Fetch tenant info server-side
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5001';
  let tenant: Tenant | null = null;
  try {
    const res = await fetch(`${BACKEND_URL}/api/tenants/${tenantId}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cache: 'no-store',
    });
    if (res.status === 404) notFound();
    if (res.ok) {
      const json = await res.json();
      tenant = json.data as Tenant;
    }
  } catch {
    notFound();
  }

  if (!tenant) notFound();

  const isSystemViewing = session.user.userType === 'SYSTEM';

  return (
    <div className="grid min-h-screen [grid-template-rows:56px_1fr] [grid-template-columns:220px_1fr] [grid-template-areas:'nav_header'_'nav_main'] print:[grid-template-columns:1fr] print:[grid-template-rows:1fr] print:[grid-template-areas:'main']">
      <div className="print:hidden [grid-area:nav] row-span-2">
        <TenantSidebar
          tenantId={tenantId}
          tenantName={tenant.name}
          userType={session.user.userType}
          email={session.user.email}
          isSystemViewing={isSystemViewing}
        />
      </div>
      <div className="print:hidden [grid-area:header]">
        <TenantTopbar tenantName={tenant.name} tenantStatus={tenant.status} />
      </div>
      <main className="[grid-area:main] p-7 print:p-0 overflow-y-auto flex flex-col gap-6 bg-background print:bg-white">
        {children}
      </main>
    </div>
  );
};

export default TenantLayout;
