'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import DOMPurify from 'dompurify';
import Image from 'next/image';
import { MapPin, ChevronDown, ArrowUpDown, Filter } from 'lucide-react';
import { useNewApplicantContext } from '../../state/new-applicant-context';
import {
  useOnboardingVenues,
  usePrimaryOnboardingCompany,
} from '../../hooks/use-company-venues';
import { Button } from '@/components/ui/Button';

// ---------- Constants ----------

const sortValues = {
  DISTANCE: 'distance',
  RELEVANCE: 'weightedScore',
} as const;

type SortValue = (typeof sortValues)[keyof typeof sortValues];

const filterValues = {
  NONE: '',
  DISTANCE: 'distance',
} as const;

type FilterValue = (typeof filterValues)[keyof typeof filterValues];

const milesToMeters = (miles: number) => miles * 1609.344;

// ---------- Star Rating ----------

const ScoreStars: React.FC<{ score: number }> = ({ score }) => {
  const filled = Math.round(score * 5);
  return (
    <div className="flex gap-0.5" title={`Score: ${(score * 100).toFixed(2)}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          className={`h-4 w-4 ${i <= filled ? 'text-yellow-400' : 'text-gray-300'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
};

// ---------- Job Card ----------

interface JobResult {
  _id: string;
  title?: string;
  description?: string;
  venueSlug?: string;
  venueName?: string;
  venueCity?: string;
  venueState?: string;
  companySlug?: string;
  companyCity?: string;
  companyState?: string;
  jobLocation?: string;
  weightedScore?: number;
  logoUrl?: string;
}

const JobCard: React.FC<{
  job: JobResult;
  companyType: string;
  isEven: boolean;
  clientDomain: string | null;
}> = ({ job, companyType, isEven, clientDomain }) => {
  const [showMore, setShowMore] = useState(false);
  const isVenue = companyType === 'Venue';

  const city = isVenue ? job.venueCity : job.companyCity;
  const state = isVenue ? job.venueState : job.companyState;
  const entityName = isVenue ? job.venueName : job.companySlug;

  const rawDescription = job.description ?? '';
  const safeDescription =
    typeof window !== 'undefined'
      ? DOMPurify.sanitize(rawDescription)
      : rawDescription;
  const truncatedHtml =
    !showMore && safeDescription.length > 250
      ? `${safeDescription.substring(0, 250)}…`
      : safeDescription;

  console.log('clientDomain', clientDomain);

  return (
    <div
      className={`flex items-start justify-between gap-4 p-4 ${isEven ? 'bg-gray-50' : 'bg-white'}`}
    >
      {/* Logo */}
      <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
        {job.logoUrl &&
        (job.logoUrl.startsWith('http://') ||
          job.logoUrl.startsWith('https://') ||
          job.logoUrl.startsWith('/')) ? (
          <Image
            src={job.logoUrl}
            alt={entityName ?? ''}
            width={48}
            height={48}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-sm font-bold text-gray-400 uppercase">
            {entityName?.charAt(0) ?? '?'}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm">{job.title}</p>
        {entityName && (
          <p className="text-sm font-medium text-gray-700">{entityName}</p>
        )}
        {(city || state) && (
          <p className="flex items-center gap-1 text-xs text-red-500 mt-0.5">
            <MapPin className="h-3 w-3" />
            {[city, state].filter(Boolean).join(', ')}
          </p>
        )}
        {job.weightedScore != null && (
          <div className="mt-1">
            <ScoreStars score={job.weightedScore} />
          </div>
        )}
        {safeDescription && (
          <div className="mt-2 text-xs text-gray-600">
            <span dangerouslySetInnerHTML={{ __html: truncatedHtml }} />
            {safeDescription.length > 250 && (
              <button
                type="button"
                onClick={() => setShowMore(!showMore)}
                className="ml-1 text-gray-400 uppercase text-[10px] font-medium hover:text-gray-600"
              >
                {showMore ? 'Show Less' : 'Show More...'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Apply */}
      <div className="flex-shrink-0">
        <a
          href={`${clientDomain ?? ''}/jobs/apply/id/${job._id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button type="button" variant="danger" size="sm">
            Apply
          </Button>
        </a>
      </div>
    </div>
  );
};

// ---------- Dropdown hook for click-outside ----------

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return { open, setOpen, ref };
}

// ---------- Main Component ----------

const RecommendedJobs: React.FC = () => {
  const { applicant, updateButtons, updateCurrentFormState, submitRef } =
    useNewApplicantContext();
  const { data: company } = usePrimaryOnboardingCompany();
  const { data: venues } = useOnboardingVenues(!!applicant?._id);

  const { data: clientDomainData } = useQuery({
    queryKey: ['applicant-onboarding', 'client-domain'],
    queryFn: async () => {
      const { data } = await axios.get(
        '/api/applicant-onboarding/client-domain'
      );
      return data as { clientDomain: string | null };
    },
    staleTime: Infinity,
  });
  const clientDomain = clientDomainData?.clientDomain ?? null;

  const companyType =
    company?.settings?.companyType ?? company?.companyType ?? 'Venue';
  const canChangeDistanceFilter = companyType !== 'Venue';

  const [sortBy, setSortBy] = useState<SortValue>(sortValues.RELEVANCE);
  const [filterBy, setFilterBy] = useState<FilterValue>(filterValues.NONE);
  const [filterDistanceInput, setFilterDistanceInput] = useState('100');
  const [geoPreference, setGeoPreference] = useState('Anywhere');
  const [geoRadius, setGeoRadius] = useState<number | null>(null);

  const sortDropdown = useDropdown();
  const filterDropdown = useDropdown();

  useEffect(() => {
    updateCurrentFormState({ isDirty: false });
    updateButtons({
      previous: { show: true, disabled: false },
      next: { show: true, disabled: false },
      submit: { show: false, disabled: true },
    });
    submitRef.current = null;
  }, [updateButtons, updateCurrentFormState, submitRef]);

  const queryBody = {
    orderBy: sortBy,
    order: sortBy === 'distance' ? 'asc' : 'desc',
    geoPreference,
    ...(geoRadius ? { geoRadius } : {}),
  };

  const { data: jobsData, isLoading } = useQuery({
    queryKey: [
      'applicant-onboarding',
      'recommended-jobs',
      applicant?._id,
      queryBody,
    ],
    queryFn: async () => {
      const { data } = await axios.post(
        `/api/applicant-onboarding/applicants/${applicant!._id}/search`,
        queryBody
      );
      if (data?.data?.length && companyType === 'Venue' && venues) {
        const imageServer = process.env.NEXT_PUBLIC_IMAGE_SERVER;
        const uploadPath = company?.uploadPath;
        return {
          ...data,
          data: data.data.map((job: JobResult) => {
            const venueSlug = job.venueSlug ?? '';
            const venue = venues[venueSlug] as
              | { logoUrl?: string; name?: string }
              | undefined;
            const rawLogoUrl = venue?.logoUrl;
            const logoUrl =
              imageServer && uploadPath && venueSlug && rawLogoUrl
                ? `${imageServer}/${uploadPath}/${venueSlug}/venues/logo/${rawLogoUrl}`
                : undefined;
            return {
              ...job,
              logoUrl,
              venueName: venue?.name ?? job.venueName,
            };
          }),
        };
      }
      return data;
    },
    enabled: !!applicant?._id,
    gcTime: 0,
  });

  const handleApplyFilter = () => {
    if (filterBy === filterValues.DISTANCE) {
      const miles = parseInt(filterDistanceInput, 10);
      if (!isNaN(miles) && miles > 0) {
        setGeoPreference('Radius');
        setGeoRadius(milesToMeters(miles));
      }
    } else {
      setGeoPreference('Anywhere');
      setGeoRadius(null);
    }
    filterDropdown.setOpen(false);
  };

  const jobs: JobResult[] = jobsData?.data ?? [];
  const noResume = jobsData?.message === 'Applicant do not have Resume data';

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-medium text-gray-700">
          Our AI has found the following recommended jobs:
        </p>

        <div className="flex gap-2">
          {/* Filter button — non-Venue companies only */}
          {canChangeDistanceFilter && (
            <div className="relative" ref={filterDropdown.ref}>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => filterDropdown.setOpen(!filterDropdown.open)}
              >
                <Filter className="h-3.5 w-3.5" />
                Filter By
                <ChevronDown className="h-3 w-3" />
              </Button>
              {filterDropdown.open && (
                <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="filterBy"
                        value={filterValues.NONE}
                        checked={filterBy === filterValues.NONE}
                        onChange={() => setFilterBy(filterValues.NONE)}
                      />
                      None
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="filterBy"
                        value={filterValues.DISTANCE}
                        checked={filterBy === filterValues.DISTANCE}
                        onChange={() => setFilterBy(filterValues.DISTANCE)}
                      />
                      Distance
                    </label>
                    {filterBy === filterValues.DISTANCE && (
                      <div className="ml-5 flex items-center gap-1">
                        <input
                          type="number"
                          value={filterDistanceInput}
                          onChange={(e) =>
                            setFilterDistanceInput(
                              e.target.value.replace(/[^0-9]/g, '')
                            )
                          }
                          className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                          placeholder="Miles"
                          min={1}
                        />
                        <span className="text-xs text-gray-500">miles</span>
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    fullWidth
                    className="mt-3"
                    onClick={handleApplyFilter}
                  >
                    Apply
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Sort button */}
          <div className="relative" ref={sortDropdown.ref}>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => sortDropdown.setOpen(!sortDropdown.open)}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              Sort By
              <ChevronDown className="h-3 w-3" />
            </Button>
            {sortDropdown.open && (
              <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="sortBy"
                      value={sortValues.DISTANCE}
                      checked={sortBy === sortValues.DISTANCE}
                      onChange={() => {
                        setSortBy(sortValues.DISTANCE);
                        sortDropdown.setOpen(false);
                      }}
                    />
                    Distance
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="sortBy"
                      value={sortValues.RELEVANCE}
                      checked={sortBy === sortValues.RELEVANCE}
                      onChange={() => {
                        setSortBy(sortValues.RELEVANCE);
                        sortDropdown.setOpen(false);
                      }}
                    />
                    Relevance Score
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Jobs list */}
      <div className="rounded border border-gray-200 overflow-y-auto max-h-[600px]">
        {noResume && (
          <p className="p-4 text-center text-sm font-medium text-red-500">
            This function requires uploading a resume
          </p>
        )}

        {isLoading && (
          <div className="flex justify-center items-center p-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        )}

        {!isLoading && !noResume && jobs.length === 0 && (
          <p className="p-4 text-center text-sm text-gray-500">
            {canChangeDistanceFilter && geoPreference === 'Radius'
              ? 'No jobs found near your location. Try increasing the max distance filter.'
              : 'No jobs found'}
          </p>
        )}

        {jobs.map((job, index) => (
          <JobCard
            key={`${job._id ?? index}_job`}
            job={job}
            companyType={companyType}
            isEven={index % 2 === 1}
            clientDomain={clientDomain}
          />
        ))}
      </div>
    </div>
  );
};

export default RecommendedJobs;
