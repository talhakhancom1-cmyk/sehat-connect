import React from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import PartnerCredit from '@/components/PartnerCredit';
import ImpersonationBanner from '@/components/ImpersonationBanner';
import { useAuth } from '@/lib/AuthContext';

export default function Layout({ children, role = 'patient', title }) {
  const { user } = useAuth();
  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <Sidebar role={role} />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Impersonation banner — shown when admin is impersonating a user */}
        <ImpersonationBanner user={user} />
        <TopBar />
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto scrollbar-thin pb-24 lg:pb-6 min-h-0">
          {title && <h1 className="text-xl font-bold text-foreground mb-4">{title}</h1>}
          {children}
          <div className="mt-8 lg:hidden flex justify-center">
            <PartnerCredit align="center" />
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav role={role} />
    </div>
  );
}