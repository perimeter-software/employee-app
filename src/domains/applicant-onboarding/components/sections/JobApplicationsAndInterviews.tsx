'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Calendar, Trash2, Info, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useNewApplicantContext } from '../../state/new-applicant-context';
import { OnboardingService } from '../../services/onboarding-service';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import AIInterviewModal from './AIInterviewModal';
import type { ChatMessage } from './AIChatWindow';
import type { ApplicantRecord } from '../../types';

// ---------- Types ----------

interface JobRow {
  jobSlug?: string;
  title?: string;
  venueName?: string;
  companyName?: string;
  applyDate?: string;
  modifiedDate?: string;
  status?: string;
}

interface InterviewRow {
  eventUrl?: string;
  jobSlug?: string;
  venueName?: string;
  companyName?: string;
  jobName?: string;
  eventDate?: string;
  applyDate?: string;
  status?: string;
  isAutoScheduling?: boolean;
  isAwaitingConfirmation?: boolean;
  isAIScreening?: boolean;
  eventType?: string;
}

interface AIInterviewEntry {
  jobSlug?: string;
  venue?: string;
  customer?: string;
  status?: string;
  interviewData?: {
    interviewStartDate?: string;
    interviewEndDate?: string;
    screeningDecision?: string;
    questionsAndAnswers?: ChatMessage[];
  };
}

// ---------- Component ----------

const JobApplicationsAndInterviews: React.FC = () => {
  const {
    applicant,
    updateButtons,
    updateCurrentFormState,
    submitRef,
    loadApplicantAction,
    setActiveStep,
    setApplicantSteps,
  } = useNewApplicantContext();

  const [isAiChatbotModalOpen, setIsAiChatbotModalOpen] = useState(false);
  const [aiChatbotScheduleInterviewEvent, setAiChatbotScheduleInterviewEvent] =
    useState<InterviewRow | null>(null);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const [interviewPreview, setInterviewPreview] = useState<InterviewRow | null>(
    null
  );
  const [interviewToDelete, setInterviewToDelete] =
    useState<InterviewRow | null>(null);
  const [assessmentLinks, setAssessmentLinks] = useState<string[]>([]);
  const [initialAvailableInterviewList, setInitialAvailableInterviewList] =
    useState<unknown[] | null>(null);
  const [initialAvailableAssessmentLinks, setInitialAvailableAssessmentLinks] =
    useState<string[] | null>(null);
  const [
    assessmentInterviewInvitationModalOpen,
    setAssessmentInterviewInvitationModalOpen,
  ] = useState(false);
  const [assessmentCanAutoSchedule, setAssessmentCanAutoSchedule] =
    useState(false);

  useEffect(() => {
    updateCurrentFormState({ isDirty: false });
    updateButtons({
      previous: { show: true, disabled: false },
      next: { show: true, disabled: false },
      submit: { show: false, disabled: true },
    });
    submitRef.current = null;
  }, [updateButtons, updateCurrentFormState, submitRef]);

  // ---------- Fetch auto assessment info ----------

  useEffect(() => {
    if (!applicant?._id) return;
    OnboardingService.getJobAutoAssessmentLink(applicant._id as string)
      .then((res) => {
        const data = res as Record<string, unknown>;
        const links = (data?.assessmentLinks as string[]) ?? [];
        const jobsWithScheduling =
          data?.jobsWithAvailableInterviewScheduling as unknown[] | undefined;

        let shouldOpenModal = false;
        let shouldAllowSchedule = false;

        if (initialAvailableAssessmentLinks != null) {
          if (initialAvailableAssessmentLinks.length > links.length)
            shouldOpenModal = true;
        }
        setInitialAvailableAssessmentLinks(links);
        setAssessmentLinks(links);

        if (jobsWithScheduling != null) {
          if (
            initialAvailableInterviewList != null &&
            initialAvailableInterviewList.length < jobsWithScheduling.length
          ) {
            shouldOpenModal = true;
            shouldAllowSchedule = true;

            const newApplicant = { ...applicant };
            const existing =
              (applicant?.availableAutoSchedulingJobs as unknown[]) ?? [];
            const notDuped = (
              jobsWithScheduling as Array<{ jobSlug?: string }>
            ).filter(
              (asJb) =>
                !existing.find(
                  (aiJb: unknown) =>
                    (aiJb as { jobSlug?: string }).jobSlug === asJb.jobSlug
                )
            );
            (
              newApplicant as Record<string, unknown>
            ).availableAutoSchedulingJobs = [...existing, ...notDuped];
            loadApplicantAction(newApplicant as Partial<ApplicantRecord>, true);
          }
          setInitialAvailableInterviewList(jobsWithScheduling);
        }

        if (shouldOpenModal) {
          setAssessmentInterviewInvitationModalOpen(true);
          setAssessmentCanAutoSchedule(shouldAllowSchedule);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicant?._id]);

  // ---------- Derived data ----------

  const jobs = (applicant?.jobs as JobRow[] | undefined) ?? [];

  const firstAvailableAIInterview = useMemo<
    AIInterviewEntry | undefined
  >(() => {
    return ((applicant?.aiInterviews as AIInterviewEntry[]) ?? [])[0];
  }, [applicant?.aiInterviews]);

  const canStartAIInterview =
    !!firstAvailableAIInterview &&
    !firstAvailableAIInterview?.interviewData?.interviewEndDate &&
    (applicant.applicantStatus === 'New' ||
      applicant.applicantStatus === 'ATC') &&
    !((applicant.interviews as unknown[]) ?? []).length;

  const allInterviews = useMemo<InterviewRow[]>(() => {
    const jobsWithAutoScheduling: Array<{
      jobSlug?: string;
      venueName?: string;
      companyName?: string;
      title?: string;
      suggestedInterviewSlots?: unknown;
    }> =
      (applicant?.availableAutoSchedulingJobs as typeof jobsWithAutoScheduling) ??
      [];

    const aiInterview = (
      (applicant?.aiInterviews as AIInterviewEntry[]) ?? []
    ).find((int) => !!int.interviewData?.interviewEndDate);

    const base: InterviewRow[] = jobsWithAutoScheduling.map((jb) => ({
      venueName: jb.venueName,
      companyName: jb.companyName,
      jobName: jb.title,
      applyDate: '',
      status: 'Pending',
      isAutoScheduling: true,
      isAwaitingConfirmation: !!(jb.suggestedInterviewSlots as unknown[])
        ?.length,
      jobSlug: jb.jobSlug,
    }));

    const scheduled = (applicant?.interviews as InterviewRow[]) ?? [];

    if (aiInterview) {
      return [
        ...base,
        ...scheduled,
        {
          venueName: aiInterview.venue,
          companyName: aiInterview.customer,
          jobName: 'AI Chatbot screening',
          applyDate: aiInterview.interviewData?.interviewEndDate,
          status: aiInterview.status,
          isAIScreening: true,
        },
      ];
    }

    return [...base, ...scheduled];
  }, [
    applicant?.aiInterviews,
    applicant?.availableAutoSchedulingJobs,
    applicant?.interviews,
  ]);

  // ---------- Action handlers ----------

  const handleAddInterviewMessage = useCallback(
    (messageData: ChatMessage, isLast: boolean) => {
      const newApplicant = { ...applicant } as Record<string, unknown>;
      const aiInterviews = [
        ...((applicant?.aiInterviews as AIInterviewEntry[]) ?? []),
      ];
      const idx = aiInterviews.findIndex((int) => !int.status);
      if (idx >= 0) {
        if (!aiInterviews[idx].interviewData) {
          aiInterviews[idx] = {
            ...aiInterviews[idx],
            interviewData: {
              screeningDecision: undefined,
              screeningDecisionUserId: undefined,
              interviewStartDate: new Date().toISOString(),
              interviewEndDate: undefined,
              score: undefined,
              questionsAndAnswers: [],
            } as never,
          };
        }
        aiInterviews[idx] = {
          ...aiInterviews[idx],
          interviewData: {
            ...aiInterviews[idx].interviewData!,
            questionsAndAnswers: [
              ...(aiInterviews[idx].interviewData?.questionsAndAnswers ?? []),
              messageData,
            ],
            ...(isLast ? { interviewEndDate: new Date().toISOString() } : {}),
          },
          ...(isLast ? { status: 'Pending' } : {}),
        };
      }
      newApplicant.aiInterviews = aiInterviews;
      loadApplicantAction(newApplicant as Partial<ApplicantRecord>, true);
    },
    [applicant, loadApplicantAction]
  );

  const handleEnableAutoScheduling = useCallback(
    (jobSlug: string, suggestedInterviewSlots?: unknown) => {
      const newApplicant = { ...applicant } as Record<string, unknown>;
      const applicantJobs = (applicant?.jobs as JobRow[]) ?? [];
      const existing =
        (applicant?.availableAutoSchedulingJobs as Array<
          JobRow & { suggestedInterviewSlots?: unknown }
        >) ?? [];
      let updated = [...existing];

      const currentJob = applicantJobs.find((jb) => jb.jobSlug === jobSlug);
      if (!currentJob) return;

      const inList = existing.find((jb) => jb.jobSlug === jobSlug);
      if (inList) {
        if (suggestedInterviewSlots) {
          updated = updated.map((jb) =>
            jb.jobSlug === jobSlug ? { ...jb, suggestedInterviewSlots } : jb
          );
        }
      } else if (suggestedInterviewSlots) {
        updated.push({ ...currentJob, suggestedInterviewSlots });
      } else {
        updated.push(currentJob);
      }

      newApplicant.availableAutoSchedulingJobs = updated;
      loadApplicantAction(newApplicant as Partial<ApplicantRecord>, true);
    },
    [applicant, loadApplicantAction]
  );

  const handleCreateInterview = useCallback(
    (jobSlug: string, interviewData: unknown) => {
      const newApplicant = { ...applicant } as Record<string, unknown>;
      const existing =
        (applicant?.availableAutoSchedulingJobs as Array<{
          jobSlug?: string;
        }>) ?? [];
      const interviews = [...((applicant?.interviews as InterviewRow[]) ?? [])];

      newApplicant.availableAutoSchedulingJobs = existing.filter(
        (jb) => jb.jobSlug !== jobSlug
      );
      interviews.push(interviewData as InterviewRow);
      newApplicant.interviews = interviews;
      loadApplicantAction(newApplicant as Partial<ApplicantRecord>, true);
    },
    [applicant, loadApplicantAction]
  );

  const handleCancelInterview = useCallback(
    async (row: InterviewRow) => {
      if (row.eventUrl) {
        try {
          await OnboardingService.cancelScreeningInterview(
            applicant._id as string,
            row.eventUrl
          );
          toast.success('Interview canceled successfully');
          const newApplicant = { ...applicant } as Record<string, unknown>;
          const interviews = (
            (applicant?.interviews as InterviewRow[]) ?? []
          ).filter((int) => int.eventUrl !== row.eventUrl);
          const evnt = ((applicant?.interviews as InterviewRow[]) ?? []).find(
            (int) => int.eventUrl === row.eventUrl
          );
          if (evnt?.jobSlug) {
            const job = ((applicant?.jobs as JobRow[]) ?? []).find(
              (jb) => jb.jobSlug === evnt.jobSlug
            );
            if (job) {
              newApplicant.availableAutoSchedulingJobs = [
                ...((applicant?.availableAutoSchedulingJobs as unknown[]) ??
                  []),
                job,
              ];
            }
          }
          newApplicant.interviews = interviews;
          loadApplicantAction(newApplicant as Partial<ApplicantRecord>, true);
        } catch {
          toast.error('Failed to cancel interview.');
        }
      }

      if (row.isAwaitingConfirmation && row.jobSlug) {
        try {
          await OnboardingService.cancelScreeningSuggestion(
            applicant._id as string,
            row.jobSlug
          );
          toast.success('Interview canceled successfully');
          const newApplicant = { ...applicant } as Record<string, unknown>;
          newApplicant.availableAutoSchedulingJobs = (
            (applicant?.availableAutoSchedulingJobs as Array<{
              jobSlug?: string;
              suggestedInterviewSlots?: unknown;
            }>) ?? []
          ).map((jb) =>
            jb.jobSlug === row.jobSlug
              ? { ...jb, suggestedInterviewSlots: null }
              : jb
          );
          loadApplicantAction(newApplicant as Partial<ApplicantRecord>, true);
        } catch {
          toast.error('Failed to cancel interview suggestion.');
        }
      }

      setInterviewToDelete(null);
    },
    [applicant, loadApplicantAction]
  );

  const handleAutoScreened = () => {
    setIsAiChatbotModalOpen(false);
    setTimeout(() => setIsOnboardingModalOpen(true), 500);
  };

  const handlePressUpdateInfo = () => {
    setIsAiChatbotModalOpen(false);
    setActiveStep(1);
  };

  const handlePressBackToHome = () => {
    setIsAiChatbotModalOpen(false);
    window.location.href = '/';
  };

  const startOnboarding = () => {
    setIsOnboardingModalOpen(false);
    setApplicantSteps(undefined, 'Screened', false, true);
    loadApplicantAction(
      { ...applicant, applicantStatus: 'Screened' } as Partial<ApplicantRecord>,
      true
    );
  };

  // ---------- Render ----------

  const showAIScreeningButton = canStartAIInterview && !assessmentLinks.length;
  const showAssessmentButton = !canStartAIInterview && !!assessmentLinks.length;
  const showInterviewList = !canStartAIInterview && !assessmentLinks.length;

  return (
    <>
      {/* Applications */}
      <div className="space-y-1 mb-4">
        <p className="text-xs text-gray-500 font-medium px-1">
          Application List
        </p>
        <div className="rounded border border-gray-200">
          {jobs.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400 bg-gray-50">
              No Data
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {jobs.map((job, i) => (
                <ApplicationRow key={i} row={job} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Interviews */}
      <div className="space-y-1">
        <p className="text-xs text-gray-500 font-medium px-1">Interview List</p>

        {showAIScreeningButton && (
          <div className="rounded border border-gray-200 flex items-center justify-center py-10">
            <Button
              type="button"
              onClick={() => setIsAiChatbotModalOpen(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Take AI Chatbot Screening Now
            </Button>
          </div>
        )}

        {showAssessmentButton && (
          <div className="rounded border border-gray-200 flex items-center justify-center py-10">
            <Button
              type="button"
              onClick={() => window.open(assessmentLinks[0], '_blank')}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Start Pre-Screening Assessment
            </Button>
          </div>
        )}

        {showInterviewList && (
          <div className="rounded border border-gray-200">
            {allInterviews.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400 bg-gray-50">
                No Data
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {allInterviews.map((interview, i) => (
                  <InterviewRow
                    key={i}
                    row={interview}
                    onPressSchedule={() =>
                      setAiChatbotScheduleInterviewEvent(interview)
                    }
                    onPressInfo={() => setInterviewPreview(interview)}
                    onPressCancel={() => setInterviewToDelete(interview)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* AI Chatbot screening modal */}
      {isAiChatbotModalOpen && firstAvailableAIInterview && (
        <AIInterviewModal
          open={isAiChatbotModalOpen}
          onClose={() => setIsAiChatbotModalOpen(false)}
          applicant={applicant as Partial<ApplicantRecord>}
          history={firstAvailableAIInterview.interviewData?.questionsAndAnswers}
          jobSlug={firstAvailableAIInterview.jobSlug ?? ''}
          onAddMessage={handleAddInterviewMessage}
          onEnableAutoScheduling={handleEnableAutoScheduling}
          onCreateInterview={handleCreateInterview}
          interviewEndDate={
            firstAvailableAIInterview.interviewData?.interviewEndDate
          }
          onPressUpdateInfo={handlePressUpdateInfo}
          onPressBackToHome={handlePressBackToHome}
          onAutoScreened={handleAutoScreened}
        />
      )}

      {/* Schedule interview modal (from interview list) */}
      {aiChatbotScheduleInterviewEvent && (
        <AIInterviewModal
          open={!!aiChatbotScheduleInterviewEvent}
          onClose={() => setAiChatbotScheduleInterviewEvent(null)}
          applicant={applicant as Partial<ApplicantRecord>}
          jobSlug={aiChatbotScheduleInterviewEvent.jobSlug ?? ''}
          onAddMessage={() => {}}
          onEnableAutoScheduling={handleEnableAutoScheduling}
          onCreateInterview={handleCreateInterview}
          onPressUpdateInfo={handlePressUpdateInfo}
          onPressBackToHome={handlePressBackToHome}
          onAutoScreened={handleAutoScreened}
          isScheduleOnly
        />
      )}

      {/* Interview detail preview */}
      {interviewPreview && (
        <InterviewPreviewModal
          interview={interviewPreview}
          onClose={() => setInterviewPreview(null)}
        />
      )}

      {/* Cancel interview confirmation */}
      {interviewToDelete && (
        <Dialog
          open={!!interviewToDelete}
          onOpenChange={(o) => !o && setInterviewToDelete(null)}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Cancel Interview</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600">
              Are you sure you want to cancel this interview?
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setInterviewToDelete(null)}
              >
                No
              </Button>
              <Button
                // variant="destructive"
                onClick={() => handleCancelInterview(interviewToDelete)}
              >
                Yes, Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Post-screening onboarding prompt */}
      {isOnboardingModalOpen && (
        <Dialog
          open={isOnboardingModalOpen}
          onOpenChange={(o) => !o && setIsOnboardingModalOpen(false)}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Congratulations!</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600">
              Your pre-screening submission has been approved. Do you want to
              start the onboarding process now?
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsOnboardingModalOpen(false)}
              >
                Later
              </Button>
              <Button onClick={startOnboarding}>Start Onboarding</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Assessment + available interview invitation */}
      {assessmentInterviewInvitationModalOpen && (
        <Dialog
          open={assessmentInterviewInvitationModalOpen}
          onOpenChange={(o) => {
            if (!o) {
              setAssessmentInterviewInvitationModalOpen(false);
              setAssessmentCanAutoSchedule(false);
            }
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Interview Available</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600">
              {assessmentCanAutoSchedule
                ? 'Great news! You can now schedule an interview. Check the Interview List to proceed.'
                : 'You have completed an assessment. Your results are being reviewed.'}
            </p>
            <DialogFooter>
              <Button
                onClick={() => {
                  setAssessmentInterviewInvitationModalOpen(false);
                  setAssessmentCanAutoSchedule(false);
                }}
              >
                OK
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

// ---------- Application Row ----------

const ApplicationRow: React.FC<{ row: JobRow }> = ({ row }) => {
  const date = row.applyDate || row.modifiedDate;
  const displayName = row.venueName ?? row.companyName ?? '';

  return (
    <li className="grid grid-cols-3 items-center px-4 py-2.5 text-sm bg-gray-50 hover:bg-gray-100">
      <span className="font-medium text-gray-800">{displayName}</span>
      <span className="text-center text-gray-600">{row.title ?? ''}</span>
      <span className="text-right text-gray-500 text-xs">
        {date ? format(new Date(date), 'MM/dd/yyyy') : ''}
      </span>
    </li>
  );
};

// ---------- Interview Row ----------

interface InterviewRowProps {
  row: InterviewRow;
  onPressSchedule: () => void;
  onPressInfo: () => void;
  onPressCancel: () => void;
}

const InterviewRow: React.FC<InterviewRowProps> = ({
  row,
  onPressSchedule,
  onPressInfo,
  onPressCancel,
}) => {
  const displayName = row.venueName ?? row.companyName ?? '';
  const canCancel =
    !row.isAIScreening &&
    (row.eventType === 'Screening Interview' || row.isAwaitingConfirmation);
  const canInfo = !row.isAIScreening && !row.isAwaitingConfirmation;

  return (
    <li className="grid grid-cols-4 items-center px-4 py-2.5 text-sm">
      <span className="font-medium text-gray-800 truncate">
        {displayName}
      </span>
      <span className="text-center text-gray-600 truncate">
        {row.jobName ?? ''}
      </span>
      <span className="text-center text-gray-500 text-xs">
        {row.isAutoScheduling && !row.isAwaitingConfirmation && 'Pending'}
        {row.isAutoScheduling &&
          row.isAwaitingConfirmation &&
          'Awaiting Confirmation'}
        {!row.isAutoScheduling && (row.eventDate || row.applyDate)
          ? format(new Date((row.eventDate || row.applyDate)!), 'MM/dd/yyyy')
          : null}
      </span>
      <div className="flex items-center justify-end gap-3">
        {row.isAutoScheduling && !row.isAwaitingConfirmation && (
          <Button
            type="button"
            size="sm"
            onClick={onPressSchedule}
            className="bg-green-600 hover:bg-green-700 text-white text-xs h-7 px-2"
          >
            <Calendar className="w-4 h-4 mr-1" />
            Schedule Now
          </Button>
        )}
        {(!row.isAutoScheduling || row.isAwaitingConfirmation) && (
          <>
            <button
              type="button"
              onClick={onPressInfo}
              disabled={!canInfo}
              title={canInfo ? 'Interview Info' : ''}
              className="text-blue-400 hover:text-blue-600 disabled:opacity-30"
            >
              <Info className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={onPressCancel}
              disabled={!canCancel}
              title={canCancel ? 'Cancel Interview' : ''}
              className="text-red-400 hover:text-red-600 disabled:opacity-30"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </li>
  );
};

// ---------- Interview Preview Modal ----------

const InterviewPreviewModal: React.FC<{
  interview: InterviewRow;
  onClose: () => void;
}> = ({ interview, onClose }) => (
  <Dialog open onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Interview Details</DialogTitle>
      </DialogHeader>
      <div className="space-y-2 text-sm">
        {(interview.venueName || interview.companyName) && (
          <div>
            <span className="font-medium text-gray-700">Company: </span>
            <span className="text-gray-600">
              {interview.venueName ?? interview.companyName}
            </span>
          </div>
        )}
        {interview.jobName && (
          <div>
            <span className="font-medium text-gray-700">Position: </span>
            <span className="text-gray-600">{interview.jobName}</span>
          </div>
        )}
        {interview.eventDate && (
          <div>
            <span className="font-medium text-gray-700">Date: </span>
            <span className="text-gray-600">
              {format(new Date(interview.eventDate), 'PPPp')}
            </span>
          </div>
        )}
        {interview.status && (
          <div>
            <span className="font-medium text-gray-700">Status: </span>
            <span className="text-gray-600">{interview.status}</span>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button onClick={onClose}>Close</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default JobApplicationsAndInterviews;
