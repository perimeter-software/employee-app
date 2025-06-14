"use client";

import React, { ReactNode, useState } from "react";
import Head from "next/head";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { clsxm } from "@/lib/utils";

interface LayoutProps {
  children: ReactNode;
  className?: string;
  showFooter?: boolean;
  // SEO Props
  title?: string;
  description?: string;
  keywords?: string;
  canonical?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  twitterCard?: "summary" | "summary_large_image" | "app" | "player";
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  noindex?: boolean;
  nofollow?: boolean;
  schema?: object;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  className,
  showFooter = true,
  // SEO Props with defaults
  title = "Employee Portal",
  description = "Manage your work schedule, track time, and stay connected with your team through our comprehensive employee portal.",
  keywords = "employee portal, time tracking, work schedule, team management, productivity",
  canonical,
  ogTitle,
  ogDescription,
  ogImage = "/images/og-default.png",
  ogType = "website",
  twitterCard = "summary_large_image",
  twitterTitle,
  twitterDescription,
  twitterImage,
  noindex = false,
  nofollow = false,
  schema,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  // Generate full title
  const fullTitle =
    title === "Employee Portal" ? title : `${title} | Employee Portal`;

  // Use props or fallback to defaults
  const metaTitle = ogTitle || fullTitle;
  const metaDescription = ogDescription || description;
  const metaImage = twitterImage || ogImage;

  // Generate robots content
  const robotsContent = [
    noindex ? "noindex" : "index",
    nofollow ? "nofollow" : "follow",
  ].join(", ");

  return (
    <>
      <Head>
        {/* Basic Meta Tags */}
        <title>{fullTitle}</title>
        <meta name="description" content={description} />
        <meta name="keywords" content={keywords} />
        <meta name="robots" content={robotsContent} />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />

        {/* Canonical URL */}
        {canonical && <link rel="canonical" href={canonical} />}

        {/* Open Graph Tags */}
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:type" content={ogType} />
        <meta property="og:site_name" content="Employee Portal" />
        {canonical && <meta property="og:url" content={canonical} />}

        {/* Twitter Card Tags */}
        <meta name="twitter:card" content={twitterCard} />
        <meta name="twitter:title" content={twitterTitle || metaTitle} />
        <meta
          name="twitter:description"
          content={twitterDescription || metaDescription}
        />
        <meta name="twitter:image" content={metaImage} />

        {/* Favicon and Icons */}
        <link rel="icon" href="/favicon.ico" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16.png"
        />
        <link rel="manifest" href="/site.webmanifest" />

        {/* Additional Meta Tags for PWA */}
        <meta name="theme-color" content="#3B82F6" />
        <meta name="application-name" content="Employee Portal" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Employee Portal" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />

        {/* Structured Data */}
        {schema && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        )}

        {/* Preconnect to external domains for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </Head>

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
    </>
  );
};

export default Layout;
