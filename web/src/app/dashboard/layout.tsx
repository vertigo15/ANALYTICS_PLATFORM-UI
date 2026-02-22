'use client';

import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import FreshnessBar from '@/components/layout/FreshnessBar';
import AISidebar from '@/components/ai/AISidebar';
import { useAIStore } from '@/store/ai';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAISidebarOpen } = useAIStore();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1">
        <TopBar />
        <FreshnessBar />
        <main
          className={`flex-1 overflow-y-auto transition-all duration-300 ${
            isAISidebarOpen ? 'mr-[380px]' : ''
          }`}
        >
          {children}
        </main>
      </div>
      <AISidebar />
    </div>
  );
}
