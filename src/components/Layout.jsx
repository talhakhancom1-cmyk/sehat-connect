import React from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import PartnerCredit from '@/components/PartnerCredit';

export default function Layout({ children, role = 'patient', title }) {
  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <Sidebar role={role} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto scrollbar-thin pb-24 lg:pb-6">
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