'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, Library, Home as HomeIcon, Settings } from 'lucide-react';

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 sm:top-0 sm:w-64 sm:bottom-0 sm:right-auto bg-white/95 dark:bg-[#0A0A0A]/95 sm:bg-white sm:dark:bg-black backdrop-blur-lg border-t sm:border-t-0 sm:border-r border-black/10 dark:border-white/10 shadow-[0_-8px_30px_rgb(0,0,0,0.04)] sm:shadow-none pb-safe sm:pb-24 z-40 transition-colors duration-300">
      <div className="flex justify-around items-center h-16 sm:flex-col sm:h-full sm:justify-start sm:gap-2 sm:p-6 sm:items-start pt-2 sm:pt-10">
        <Link 
          href="/" 
          className={`flex flex-col sm:flex-row items-center sm:items-center sm:justify-start w-full h-full sm:h-auto transition-all sm:px-4 sm:py-3 sm:rounded-xl ${pathname === '/' ? 'text-[#7C3AED] sm:bg-[#7C3AED]/10 font-bold' : 'text-gray-500 hover:text-black dark:hover:text-white sm:hover:bg-black/5 sm:dark:hover:bg-white/5 hover:scale-105 active:scale-95'}`}
        >
          <HomeIcon size={24} className="sm:mr-4 shrink-0" />
          <span className="text-[10px] sm:text-sm mt-1 sm:mt-0 font-bold">Home</span>
        </Link>
        <Link 
          href="/search" 
          className={`flex flex-col sm:flex-row items-center sm:items-center sm:justify-start w-full h-full sm:h-auto transition-all sm:px-4 sm:py-3 sm:rounded-xl ${pathname === '/search' ? 'text-[#7C3AED] sm:bg-[#7C3AED]/10 font-bold' : 'text-gray-500 hover:text-black dark:hover:text-white sm:hover:bg-black/5 sm:dark:hover:bg-white/5 hover:scale-105 active:scale-95'}`}
        >
          <Search size={24} className="sm:mr-4 shrink-0" />
          <span className="text-[10px] sm:text-sm mt-1 sm:mt-0 font-bold">Search</span>
        </Link>
        <Link 
          href="/library" 
          className={`flex flex-col sm:flex-row items-center sm:items-center sm:justify-start w-full h-full sm:h-auto transition-all sm:px-4 sm:py-3 sm:rounded-xl ${pathname.startsWith('/library') ? 'text-[#7C3AED] sm:bg-[#7C3AED]/10 font-bold' : 'text-gray-500 hover:text-black dark:hover:text-white sm:hover:bg-black/5 sm:dark:hover:bg-white/5 hover:scale-105 active:scale-95'}`}
        >
          <Library size={24} className="sm:mr-4 shrink-0" />
          <span className="text-[10px] sm:text-sm mt-1 sm:mt-0 font-bold">Library</span>
        </Link>
        <Link 
          href="/settings" 
          className={`flex flex-col sm:flex-row items-center sm:items-center sm:justify-start w-full h-full sm:h-auto transition-all sm:px-4 sm:py-3 sm:rounded-xl ${pathname === '/settings' ? 'text-[#7C3AED] sm:bg-[#7C3AED]/10 font-bold' : 'text-gray-500 hover:text-black dark:hover:text-white sm:hover:bg-black/5 sm:dark:hover:bg-white/5 hover:scale-105 active:scale-95'}`}
        >
          <Settings size={24} className="sm:mr-4 shrink-0" />
          <span className="text-[10px] sm:text-sm mt-1 sm:mt-0 font-bold">Settings</span>
        </Link>
      </div>
    </nav>
  );
}
