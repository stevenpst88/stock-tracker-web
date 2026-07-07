import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  return (
    <div className="flex h-screen">
      <Sidebar userEmail={session.user.email ?? undefined} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
