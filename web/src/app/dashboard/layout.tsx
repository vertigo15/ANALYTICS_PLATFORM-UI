'use client';

import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';
import FreshnessBar from '@/components/layout/FreshnessBar';
import AISidebar from '@/components/ai/AISidebar';
import { useAIStore } from '@/store/ai';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAISidebarOpen, sidebarWidth } = useAIStore();
  const isOnline = useOnlineStatus();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        {!isOnline && (
          <div className="flex items-center justify-center gap-2 bg-amber-500 text-white text-sm font-medium py-2 px-4 z-50">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none"
              viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            You are offline. Data may be stale.
          </div>
        )}
        <TopBar />
        <FreshnessBar />
        <main
          className="flex-1 overflow-y-auto transition-all duration-300"
          style={{ marginRight: isAISidebarOpen ? \`\${sidebarWidth}px\` : '0' }}
        >
          {children}
        </main>
      </div>
      <AISidebar />
    </div>
  );
}
