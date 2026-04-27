'use client';

// Ported from stadium-people/.../OverviewSection (635 lines).
// The commented-out "Onboarding" card in the source is intentionally omitted. Mobile app
// promo card is kept but only shown for Employee + Venue company types.
import {
  ChevronRight,
  CircleCheck,
  CircleX,
  Contact as ContactIcon,
  ScanSearch,
  Briefcase,
  ClipboardList,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { clsxm } from '@/lib/utils';
import { useNewApplicantContext } from '../../state/new-applicant-context';
import { useApplicantOverviewInfo } from '../../hooks/use-applicant-overview-info';

const APPLE_STORE_URL =
  'https://apps.apple.com/us/app/gignology-employee-mobile-app/id6467892499';
const GOOGLE_STORE_URL = 'https://play.google.com/store/apps/details?id=com.gigreactcli';

interface Props {
  companyType?: string;
  currentApplicant?: { applicant?: unknown } | null;
}

const OverviewSection: React.FC<Props> = ({ companyType, currentApplicant }) => {
  const { applicant, setActiveStep } = useNewApplicantContext();
  const {
    profileCompletion,
    currentMissingFields,
    requiredProfileFieldNames,
    hasResume,
    isLoadingFiltered,
    resumeDataAvailable,
    totalPendingInterviews,
    canStartAIInterview,
    assessmentLinks,
    recommendedJobCount,
  } = useApplicantOverviewInfo({
    currentApplicant: currentApplicant as { applicant?: import('../../types').ApplicantRecord | null } | null | undefined,
    applicant,
  });

  const showAppPromo = applicant?.status === 'Employee' && companyType === 'Venue';

  return (
    <div className="my-4 flex flex-col gap-4">
      {showAppPromo && (
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 to-sky-400 p-6 text-center text-white shadow-lg">
          <h2 className="mb-2 text-xl font-semibold">Get Our Mobile App</h2>
          <p className="mb-4 text-sm opacity-90">Manage your venues and events on the go</p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={APPLE_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-white/95 px-5 py-3 text-sm font-medium text-gray-800 shadow transition hover:bg-white"
            >
              App Store
            </a>
            <a
              href={GOOGLE_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-white/95 px-5 py-3 text-sm font-medium text-gray-800 shadow transition hover:bg-white"
            >
              Google Play
            </a>
          </div>
        </div>
      )}

      {/* Profile card */}
      <OverviewCard
        onClick={() => setActiveStep(2)}
        iconBg="bg-blue-100"
        icon={<ContactIcon className="h-5 w-5 text-blue-600" />}
        title="Applicant Profile"
        subtitle="Manage your information"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Profile Completion</span>
            <span className="font-medium">{profileCompletion}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
            <div
              className="h-full rounded bg-blue-600 transition-all"
              style={{ width: `${profileCompletion}%` }}
            />
          </div>
          {currentMissingFields.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1 text-xs text-amber-700">
              {currentMissingFields.map((f) => (
                <span key={f}>Missing {requiredProfileFieldNames[f] ?? f}</span>
              ))}
            </div>
          )}
        </div>
      </OverviewCard>

      {/* Resume & skills */}
      <OverviewCard
        onClick={() => setActiveStep(3)}
        iconBg="bg-green-100"
        icon={<ScanSearch className="h-5 w-5 text-green-600" />}
        title="Resume & Skills"
        subtitle="Update your qualifications"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-sm text-gray-500">
            {hasResume ? (
              <CircleCheck className="h-4 w-4 text-green-600" />
            ) : (
              <CircleX className="h-4 w-4 text-red-500" />
            )}
            <span>{hasResume ? 'Resume uploaded' : 'Resume not uploaded'}</span>
          </div>
        </div>
      </OverviewCard>

      {/* Recommended jobs */}
      <OverviewCard
        onClick={() => setActiveStep(4)}
        iconBg="bg-purple-100"
        icon={<ClipboardList className="h-5 w-5 text-purple-600" />}
        title="Recommended Jobs"
        subtitle="Perfect matches for you"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Jobs Found</span>
          {isLoadingFiltered ? (
            <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
          ) : (
            <Badge className="bg-purple-100 text-purple-700">{recommendedJobCount}</Badge>
          )}
        </div>
        {!resumeDataAvailable && (
          <p className="mt-2 text-xs text-amber-700">Resume Info Not Available</p>
        )}
      </OverviewCard>

      {/* Applications & Interviews */}
      <OverviewCard
        onClick={() => setActiveStep(5)}
        iconBg="bg-orange-100"
        icon={<Briefcase className="h-5 w-5 text-orange-600" />}
        title="Applications & Interviews"
        subtitle="Track your progress"
      >
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Applications</span>
            <Badge className="bg-orange-100 text-orange-700">
              {(applicant?.jobs as unknown[] | undefined)?.length ?? 0}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Interviews</span>
            <Badge className="bg-orange-100 text-orange-700">
              {totalPendingInterviews ? `${totalPendingInterviews} Pending` : '0'}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2 pt-1 text-xs text-amber-700">
            {!!(applicant as { availableAutoSchedulingJobs?: unknown[] } | null | undefined)
              ?.availableAutoSchedulingJobs?.length && (
              <span>Interview Scheduling Available</span>
            )}
            {canStartAIInterview && <span>AI Screening Available</span>}
            {!!assessmentLinks?.length && <span>Assessment Available</span>}
          </div>
        </div>
      </OverviewCard>
    </div>
  );
};

interface OverviewCardProps {
  onClick: () => void;
  iconBg: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}
const OverviewCard: React.FC<OverviewCardProps> = ({
  onClick,
  iconBg,
  icon,
  title,
  subtitle,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="text-left transition-transform hover:scale-[1.005]"
  >
    <Card className="border border-gray-200 shadow-sm">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <div
            className={clsxm(
              'flex h-10 w-10 items-center justify-center rounded-lg',
              iconBg
            )}
          >
            {icon}
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900">{title}</div>
            <div className="text-xs text-gray-500">{subtitle}</div>
          </div>
          <ChevronRight className="ml-auto h-4 w-4 text-gray-400" />
        </div>
        {children}
      </CardContent>
    </Card>
  </button>
);

export default OverviewSection;
