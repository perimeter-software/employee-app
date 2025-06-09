"use client";

import React from "react";
import Link from "next/link";

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto py-4 sm:py-6 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col space-y-4 md:flex-row md:justify-between md:items-center md:space-y-0">
          {/* Left side - Copyright */}
          <div className="flex items-center justify-center md:justify-start space-x-2 sm:space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
                <span className="text-white font-bold text-xs">G</span>
              </div>
              <span className="text-xs sm:text-sm text-gray-600">
                © {currentYear} gig·nology. All rights reserved.
              </span>
            </div>
          </div>

          {/* Right side - Links */}
          <div className="flex items-center justify-center md:justify-end space-x-4 sm:space-x-6">
            <Link
              href="/privacy"
              className="text-xs sm:text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-xs sm:text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              href="/help"
              className="text-xs sm:text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Help & Support
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
