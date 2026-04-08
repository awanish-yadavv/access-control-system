import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import Sidebar from '@/components/ui/Sidebar';
import Topbar from '@/components/ui/Topbar';

const DashboardLayout = async ({ children }: { children: React.ReactNode }) => {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  // Non-SYSTEM users belong in their tenant space, not the system dashboard
  if (session.user.userType !== 'SYSTEM' && session.user.tenantId) {
    redirect(`/${session.user.tenantId}`);
  }

  return (
    <div className="grid min-h-screen [grid-template-rows:56px_1fr] [grid-template-columns:220px_1fr] [grid-template-areas:'nav_header'_'nav_main']">
      <Sidebar userType={session.user.userType} email={session.user.email} />
      <Topbar />
      <main className="[grid-area:main] p-7 overflow-y-auto flex flex-col gap-6 bg-background">
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;
