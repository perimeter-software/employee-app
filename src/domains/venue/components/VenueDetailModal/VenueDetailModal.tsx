'use client';

import React, { useState, useEffect } from 'react';
import { MapPin, Building2, Mail, ChevronDown, ChevronUp, X, Paperclip } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { baseInstance } from '@/lib/api/instance';
import { VenueMap } from '../VenueMap';
import { VenueVideo } from '../VenueVideo';
import { venueBadge, stripHtml, DESCRIPTION_LIMIT } from '../../utils';
import type { VenueWithStatus } from '../../types';

type Props = {
  venue: VenueWithStatus;
  imageBaseUrl?: string;
  open: boolean;
  onClose: () => void;
  onStatusChange: (slug: string, newStatus: string) => void;
  readOnly?: boolean;
};

export const VenueDetailModal = ({
  venue: initialVenue,
  imageBaseUrl,
  open,
  onClose,
  onStatusChange,
  readOnly = false,
}: Props) => {
  const [descExpanded, setDescExpanded] = useState(false);
  const [bannerError, setBannerError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['venue-detail', initialVenue.slug],
    queryFn: async () => {
      const res = await baseInstance.get<VenueWithStatus>(`venues/${initialVenue.slug}`);
      if (!res.success || !res.data) throw new Error('Failed to fetch venue detail');
      return res.data;
    },
    enabled: open,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Merge detail fields in but keep the live userVenueStatus from the list
  const venue = detail
    ? { ...detail, userVenueStatus: initialVenue.userVenueStatus }
    : initialVenue;

  const bannerUrl =
    imageBaseUrl && venue.bannerUrl && !bannerError
      ? `${imageBaseUrl}/${venue.slug}/venues/banner/${venue.bannerUrl}`
      : null;

  const fullLogoUrl =
    imageBaseUrl && venue.logoUrl && !logoError
      ? `${imageBaseUrl}/${venue.slug}/venues/logo/${venue.logoUrl}`
      : null;

  const description = stripHtml(venue.description);
  const descTooLong = description.length > DESCRIPTION_LIMIT;
  const contact = venue.venueContact1;
  const contactInitials =
    contact && (contact.firstName || contact.lastName)
      ? `${contact.firstName?.[0] ?? ''}${contact.lastName?.[0] ?? ''}`
      : null;

  useEffect(() => {
    setDescExpanded(false);
    setBannerError(false);
    setLogoError(false);
  }, [initialVenue.slug]);

  const handleRequest = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/venues/${venue.slug}/request`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json.message || 'Failed to submit request'); return; }
      toast.success('Request submitted! An Event Manager will review and contact you once approved.');
      onStatusChange(venue.slug, 'Pending');
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/venues/${venue.slug}/request`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json.message || 'Failed to cancel request'); return; }
      toast.success('Request cancelled.');
      onStatusChange(venue.slug, '');
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Banner */}
        <div className="relative h-40 bg-zinc-200 flex-shrink-0">
          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bannerUrl} alt="" className="w-full h-full object-cover" onError={() => setBannerError(true)} />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-appPrimary/20 to-appPrimary/5" />
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Logo overlay */}
          <div className="absolute -bottom-7 left-4 w-16 h-16 rounded-xl border-2 border-white bg-white shadow-md overflow-hidden flex items-center justify-center">
            {fullLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fullLogoUrl} alt={venue.name} className="w-full h-full object-contain" onError={() => setLogoError(true)} />
            ) : (
              <Building2 className="w-8 h-8 text-zinc-300" />
            )}
          </div>
        </div>

        {/* Scrollable body — stopPropagation prevents react-remove-scroll's document-level
            wheel handler from receiving events that would trigger a Node.contains(null) error */}
        <div
          className="overflow-y-auto flex-1 pt-10 pb-6 px-5 space-y-5"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <DialogHeader className="text-left space-y-1 pb-0">
            <div className="flex items-start justify-between gap-2">
              <DialogTitle className="text-lg font-bold text-slate-900 leading-tight">
                {venue.name}
              </DialogTitle>
              {venueBadge(venue.userVenueStatus)}
            </div>
            {(venue.address || venue.city) && (
              <div className="flex items-start gap-1 text-sm text-slate-500">
                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-appPrimary" />
                <span>{[venue.address, venue.city, venue.state, venue.zip].filter(Boolean).join(', ')}</span>
              </div>
            )}
          </DialogHeader>

          {/* Action buttons — hidden for read-only (Client) view */}
          {!readOnly && venue.userVenueStatus === '' && (
            <Button className="w-full bg-appPrimary text-white hover:bg-appPrimary/90" onClick={handleRequest} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Request Venue'}
            </Button>
          )}

          {!readOnly && venue.userVenueStatus === 'Pending' && (
            <div className="space-y-2">
              <div className="flex items-center justify-center py-2 px-4 rounded-md bg-amber-50 border border-amber-200">
                <span className="text-sm font-medium text-amber-700">Pending Request</span>
              </div>
              <Button variant="outline" className="w-full" onClick={handleCancel} disabled={submitting}>
                {submitting ? 'Cancelling…' : 'Cancel Request'}
              </Button>
            </div>
          )}

          {!readOnly && venue.userVenueStatus === 'StaffingPool' && (
            <div className="space-y-2">
              <div className="flex items-center justify-center py-2 px-4 rounded-md bg-emerald-50 border border-emerald-200">
                <span className="text-sm font-medium text-emerald-700">You are in the Staffing Pool</span>
              </div>
              <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50" onClick={handleCancel} disabled={submitting}>
                {submitting ? 'Leaving…' : 'Leave Venue'}
              </Button>
            </div>
          )}

          {/* Description skeleton */}
          {detailLoading && !venue.description && (
            <div className="space-y-2">
              <div className="h-4 bg-zinc-100 rounded animate-pulse w-24" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-3 bg-zinc-100 rounded animate-pulse" />
              ))}
            </div>
          )}

          {/* Description */}
          {description && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-1.5">Description</h4>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                {descTooLong && !descExpanded ? `${description.slice(0, DESCRIPTION_LIMIT)}…` : description}
              </p>
              {descTooLong && (
                <button
                  type="button"
                  onClick={() => setDescExpanded((p) => !p)}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-appPrimary hover:underline"
                >
                  {descExpanded ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Show more</>}
                </button>
              )}
            </div>
          )}

          {/* Contact person */}
          {contact?.fullName && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Contact Person</h4>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-appPrimary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-appPrimary">{contactInitials || '?'}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{contact.fullName}</p>
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 text-xs text-appPrimary hover:underline mt-0.5">
                      <Mail className="w-3 h-3" />
                      {contact.email}
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Map */}
          {venue.location?.coordinates && (
            <VenueMap coordinates={venue.location.coordinates} />
          )}

          {/* Videos */}
          {venue.videoUrls && venue.videoUrls.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Videos</h4>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {venue.videoUrls.map((url, i) => (
                  <VenueVideo key={i} url={url} />
                ))}
              </div>
            </div>
          )}

          {/* Attachments */}
          {venue.otherUrls && venue.otherUrls.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Attachments</h4>
              <ul className="space-y-1.5">
                {venue.otherUrls.map((filename) => (
                  <li key={filename}>
                    <a
                      href={`${imageBaseUrl}/${venue.slug}/venues/other/${filename}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-appPrimary hover:underline"
                    >
                      <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{filename}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
