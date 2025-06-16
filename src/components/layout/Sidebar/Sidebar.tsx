"use client";

// components/layout/Sidebar.tsx

import React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Clock,
  FileText,
  LayoutGrid,
  CalendarClock,
  MessageCircleQuestion,
  X,
} from "lucide-react";
import { clsxm } from "@/lib/utils";
import { Button } from "@/components/ui/Button/Button";

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  current?: boolean;
}

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen = true, onClose }) => {
  const pathname = usePathname();

  const navigation: NavigationItem[] = [
    {
      name: "Time & Attendance",
      href: "/time-attendance",
      icon: Clock,
      current:
        pathname === "/time-attendance" ||
        pathname.startsWith("/time-attendance"),
    },
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: LayoutGrid,
      current: pathname === "/dashboard",
    },
    {
      name: "Paid Time Off",
      href: "/pto",
      icon: CalendarClock,
      current: pathname === "/pto" || pathname.startsWith("/pto"),
    },
    {
      name: "Ask a Question",
      href: "/conversation",
      icon: MessageCircleQuestion,
      current:
        pathname === "/conversation" || pathname.startsWith("/conversation"),
    },
    {
      name: "Documents",
      href: "/documents",
      icon: FileText,
      current: pathname === "/documents" || pathname.startsWith("/documents"),
    },
  ];

  const handleLinkClick = () => {
    // Close mobile menu when a link is clicked
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-75 transition-opacity lg:hidden z-40"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={clsxm(
          "fixed inset-y-0 left-0 z-50 w-64 bg-zinc-50 shadow-xl transition-transform duration-300 ease-in-out",
          // Desktop: always visible
          "lg:translate-x-0",
          // Mobile: slide in/out based on isOpen
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo Section */}
        <div className="flex items-center justify-between h-16 lg:h-24 px-6">
          <div className="flex items-center space-x-2">
            <Image
              src="/images/powered-by-gig-blue.png"
              alt="gig·nology"
              width={160}
              height={48}
              className="object-contain"
            />
          </div>

          {/* Mobile close button */}
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
              <span className="sr-only">Close menu</span>
            </Button>
          )}
        </div>

        {/* Navigation */}
        <nav className="mt-3 px-4">
          <ul className="space-y-2">
            {navigation.map((item) => (
              <li key={item.name}>
                <Link
                  href={item.href}
                  onClick={handleLinkClick}
                  className={clsxm(
                    "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                    item.current
                      ? "bg-appPrimary text-white"
                      : "text-zinc-700 hover:bg-gray-50 hover:text-zinc-900"
                  )}
                >
                  <item.icon
                    className={clsxm(
                      "mr-3 h-5 w-5 flex-shrink-0",
                      item.current
                        ? "text-white"
                        : "text-zinc-400 group-hover:text-zinc-500"
                    )}
                  />
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  );
};

export default Sidebar;
