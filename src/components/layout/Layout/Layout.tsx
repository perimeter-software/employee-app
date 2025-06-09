"use client";

import React, { ReactNode, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { clsxm } from "@/lib/utils";

interface LayoutProps {
  children: ReactNode;
  className?: string;
  showFooter?: boolean;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  className,
  showFooter = true,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <div className={clsxm("min-h-screen bg-white flex flex-col", className)}>
      {/* Sidebar */}
      <Sidebar isOpen={isMobileMenuOpen} onClose={closeMobileMenu} />

      {/* Main Content Area */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        {/* Header */}
        <Header onMobileMenuToggle={toggleMobileMenu} />

        {/* Main Content */}
        <main className="flex-1">
          <div className="py-4 px-4 sm:px-6 lg:py-6 lg:px-8">{children}</div>
        </main>

        {/* Footer */}
        {showFooter && <Footer />}
      </div>
    </div>
  );
};

export default Layout;
