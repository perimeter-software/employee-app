'use client';

import { useEffect, useState } from 'react';
import { createOutsidePublicClient } from '@/lib/api/outside-public';

const IMG_SERVER = process.env.NEXT_PUBLIC_IMAGE_SERVER ?? '';

interface PrimaryCompany {
  name?: string;
  slug?: string;
  bannerUrl?: string;
  imageUrl?: string;
  uploadPath?: string;
}

export interface CompanyBranding {
  name: string;
  bannerUrl: string | null;
}

/**
 * Tenant branding for the unauthenticated candidate pages. Mirrors the source
 * gignology-v4 uses for its public pages (primary-company doc + image CDN).
 * Branding is non-critical — failures leave the page unbranded rather than
 * blocking the flow.
 */
export function useCompanyBranding(tenantDb: string): CompanyBranding {
  const [branding, setBranding] = useState<CompanyBranding>({
    name: '',
    bannerUrl: null,
  });

  useEffect(() => {
    if (!tenantDb) return;
    let cancelled = false;

    createOutsidePublicClient(tenantDb)<{ data?: PrimaryCompany } & PrimaryCompany>(
      '/companies/primary'
    )
      .then((res) => {
        if (cancelled) return;
        const company = (res?.data ?? res) as PrimaryCompany;
        let bannerUrl: string | null = null;
        if (company?.bannerUrl && company?.slug) {
          const base =
            company.imageUrl ||
            (company.uploadPath ? `${IMG_SERVER}/${company.uploadPath}` : IMG_SERVER);
          bannerUrl = `${base}/company/${company.slug}/banner/${company.bannerUrl}`;
        }
        setBranding({ name: company?.name ?? '', bannerUrl });
      })
      .catch(() => {
        /* branding is non-critical */
      });

    return () => {
      cancelled = true;
    };
  }, [tenantDb]);

  return branding;
}

interface PublicPageShellProps {
  banner?: string | null;
  /** Widen the content column (used by the assessment intro screen). */
  wide?: boolean;
  children: React.ReactNode;
}

/**
 * Page chrome shared by the public candidate pages: tenant banner, centered
 * content column, and the powered-by footer.
 */
export function PublicPageShell({ banner, wide, children }: PublicPageShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {banner && (
        <a href="/" className="block" aria-label="Home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={banner} alt="" className="w-full" />
        </a>
      )}

      <div
        className={`mx-auto w-full flex-1 px-4 py-6 sm:py-10 ${
          wide ? 'max-w-4xl' : 'max-w-2xl'
        }`}
      >
        {children}
      </div>

      <div className="flex justify-center bg-[#222] px-5 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/powered-by-gig-blue.png"
          alt="powered by gignology"
          className="h-12 w-auto"
        />
      </div>
    </div>
  );
}

/** Plain content card used across the public pages. */
export function PublicCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border bg-card p-6 shadow-sm sm:p-8 ${className}`}>
      {children}
    </div>
  );
}
