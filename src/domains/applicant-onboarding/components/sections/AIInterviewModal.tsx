'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import AIChatWindow, { type ChatMessage, type ChatButton } from './AIChatWindow';
import { OnboardingService } from '../../services/onboarding-service';
import type { ApplicantRecord } from '../../types';

const AI_INTERVIEWS_FIRST_MESSAGE =
  "Hey there! Let us know if you're ready to begin!";
const AI_INTERVIEWS_LAST_MESSAGE =
  "Thank you for completing the screening. We will review your answers and get back to you shortly.";

const MSG = {
  startScheduling:
    "Thank you for answering Screening questions. Based on your successful score, we would like to invite you to a phone interview with us.",
  startSchedulingAlt: "Hello again! You can schedule a meeting with one of our recruiters now.",
  availableOptions: "You may select from any of the dates listed below.",
  noRecruiterAvailable:
    "Sorry, none of our recruiters is available this week, but you can tell us when you're available and we'll contact you if a meeting could be arranged.",
  suggestTimes:
    "Please enter up to three dates and times at which you're available for an interview, starting from tomorrow, and we'll attempt to schedule a meeting for you. The dates must be within the next 7 days.",
  userSelectDifferentTime: "I want to suggest a different time",
  interviewScheduled:
    "Thank you. Your interview has been scheduled. A recruiter will call you at the time you selected. You don't need to come on site unless otherwise instructed. Please make sure you've provided us with a working phone number so we can reach you.",
  finishedSuggesting: "Thank you. We'll let you know if the meeting could be arranged.",
  areYouSure: "Are you sure you want to schedule a meeting at this date?",
  userYes: "Yes",
  userNo: "No",
  userOther: "Other",
  userGoBackToSlots: "I changed my mind, let me select a date",
};

interface TimeSlot {
  startDate: string;
  userId?: string;
}

export interface AIInterviewModalProps {
  open: boolean;
  onClose: () => void;
  applicant: Partial<ApplicantRecord>;
  history?: ChatMessage[];
  jobSlug: string;
  onAddMessage: (data: ChatMessage, isLast: boolean) => void;
  onEnableAutoScheduling: (jobSlug: string, suggestedSlots?: unknown) => void;
  onCreateInterview: (jobSlug: string, interviewData: unknown) => void;
  interviewEndDate?: string;
  onPressUpdateInfo?: () => void;
  onPressBackToHome?: () => void;
  onAutoScreened?: () => void;
  isScheduleOnly?: boolean;
}

const AIInterviewModal: React.FC<AIInterviewModalProps> = ({
  open,
  onClose,
  applicant,
  history,
  jobSlug,
  onAddMessage,
  onEnableAutoScheduling,
  onCreateInterview,
  interviewEndDate,
  onPressUpdateInfo,
  onPressBackToHome,
  onAutoScreened,
  isScheduleOnly = false,
}) => {
  const [textValue, setTextValue] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);

  const [localHistory, setLocalHistory] = useState<ChatMessage[]>([]);
  const localHistoryRef = useRef<ChatMessage[]>([]);
  const [interviewFinished, setInterviewFinished] = useState(false);
  const [interviewSchedulingFinished, setInterviewSchedulingFinished] = useState(false);
  const [isSchedulingInterview, setIsSchedulingInterview] = useState(false);
  const [isSuggestingSlots, setIsSuggestingSlots] = useState(false);
  const [suggestedDatetimes, setSuggestedDatetimes] = useState<unknown>(null);
  const [selectedAvailabilityDate, setSelectedAvailabilityDate] = useState<string | null>(null);
  const [selectedAvailabilitySlot, setSelectedAvailabilitySlot] = useState<TimeSlot | null>(null);
  const [availabilitySlots, setAvailabilitySlots] = useState<Record<string, TimeSlot[]> | undefined>(undefined);
  const isWaitingForAIResponseRef = useRef(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const applicantId = applicant._id as string | undefined;

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      listRef.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }, []);

  const pushNewMessage = useCallback(
    ({
      message,
      isAnswer,
      onUpdate,
      questionNumber = 0,
      isFollowUp = false,
      followUpNumber = 'NONE',
      isLast = false,
    }: {
      message: string;
      isAnswer: boolean;
      onUpdate?: (() => void) | null;
      questionNumber?: number;
      isFollowUp?: boolean;
      followUpNumber?: string;
      isLast?: boolean;
    }): ChatMessage => {
      const messageData: ChatMessage = {
        type: 'other',
        index: localHistoryRef.current.length,
        message,
        timestamp: new Date().toISOString(),
        isAnswer,
        isFollowUp,
        followUpNumber,
        questionNumber,
      } as ChatMessage;

      setLocalHistory((lh) => [...lh, messageData]);
      localHistoryRef.current = [...localHistoryRef.current, messageData];

      if (applicantId) {
        OnboardingService.pushAIInterviewMessage(applicantId, {
          jobSlug,
          data: messageData,
          isLast,
        })
          .then(() => {
            onAddMessage(messageData, isLast);
            onUpdate?.();
          })
          .catch(() => {
            toast.error('Failed to save message.');
          });
      }

      scrollToBottom();
      return messageData;
    },
    [applicantId, jobSlug, onAddMessage, scrollToBottom]
  );

  const handleFinishInterview = useCallback(() => {
    pushNewMessage({
      message: AI_INTERVIEWS_LAST_MESSAGE,
      isAnswer: false,
      isLast: true,
    });
  }, [pushNewMessage]);

  const handleFinishInterviewScheduling = useCallback(() => {
    pushNewMessage({
      message: MSG.interviewScheduled,
      isAnswer: false,
      isLast: true,
    });
    setInterviewFinished(true);
  }, [pushNewMessage]);

  const handleFinishInterviewSuggestion = useCallback(() => {
    pushNewMessage({
      message: MSG.finishedSuggesting,
      isAnswer: false,
      isLast: true,
    });
    setInterviewFinished(true);
  }, [pushNewMessage]);

  const handleStartSuggestingDifferentTime = useCallback(() => {
    pushNewMessage({ message: MSG.suggestTimes, isAnswer: false });
    setSelectedAvailabilityDate(null);
    setSelectedAvailabilitySlot(null);
    setInterviewFinished(false);
    setSuggestedDatetimes(null);
    setIsSuggestingSlots(true);
  }, [pushNewMessage]);

  const handleRequestSuggestingDifferentTime = useCallback(() => {
    pushNewMessage({
      message: MSG.userSelectDifferentTime,
      isAnswer: true,
      onUpdate: handleStartSuggestingDifferentTime,
    });
  }, [handleStartSuggestingDifferentTime, pushNewMessage]);

  const handleStartDateSelection = useCallback(
    (slots: Record<string, TimeSlot[]>) => {
      const availableDays = Object.keys(slots);
      pushNewMessage({
        message: !availableDays.length ? MSG.noRecruiterAvailable : MSG.availableOptions,
        isAnswer: false,
        onUpdate: !availableDays.length ? handleStartSuggestingDifferentTime : undefined,
      });
    },
    [handleStartSuggestingDifferentTime, pushNewMessage]
  );

  const handleSelectTimeSlot = useCallback(
    (slot: TimeSlot) => {
      const dateLabel = selectedAvailabilityDate
        ? format(new Date(`${selectedAvailabilityDate}T12:00:00.000Z`), 'EEE MM/dd')
        : '';
      const timeLabel = format(new Date(slot.startDate), 'hh:mm aa');

      pushNewMessage({
        message: `${dateLabel} at ${timeLabel}`,
        isAnswer: true,
        onUpdate: () => {
          pushNewMessage({
            message: `You selected ${dateLabel} at ${timeLabel}. ${MSG.areYouSure}`,
            isAnswer: false,
          });
          setSelectedAvailabilitySlot(slot);
        },
      });
    },
    [pushNewMessage, selectedAvailabilityDate]
  );

  const handleCancelTimeSlot = useCallback(() => {
    pushNewMessage({
      message: MSG.userNo,
      isAnswer: true,
      onUpdate: () => {
        if (availabilitySlots) handleStartDateSelection(availabilitySlots);
      },
    });
  }, [availabilitySlots, handleStartDateSelection, pushNewMessage]);

  const handleConfirmTimeSlot = useCallback(() => {
    pushNewMessage({ message: MSG.userYes, isAnswer: true });

    if (!applicantId || !selectedAvailabilitySlot) return;

    setIsLoadingSchedule(true);
    OnboardingService.createScreeningInterview({
      jobSlug,
      applicantId,
      eventDate: selectedAvailabilitySlot.startDate,
      recruiterUserId: selectedAvailabilitySlot.userId,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
      .then((res) => {
        const interviewObject = (res as Record<string, unknown>)?.interviewObject;
        onCreateInterview(jobSlug, interviewObject);
        setTimeout(() => handleFinishInterviewScheduling(), 150);
      })
      .catch(() => toast.error('Failed to schedule interview.'))
      .finally(() => setIsLoadingSchedule(false));

    setInterviewSchedulingFinished(true);
    setSelectedAvailabilityDate(null);
    setSelectedAvailabilitySlot(null);
    setIsSchedulingInterview(false);
    setIsSuggestingSlots(false);
    setSuggestedDatetimes(null);
  }, [
    applicantId,
    handleFinishInterviewScheduling,
    jobSlug,
    onCreateInterview,
    pushNewMessage,
    selectedAvailabilitySlot,
  ]);

  const handleCancelSuggestion = useCallback(() => {
    pushNewMessage({
      message: MSG.userNo,
      isAnswer: true,
      onUpdate: () => {
        setSuggestedDatetimes(null);
        pushNewMessage({ message: MSG.suggestTimes, isAnswer: false });
        setSelectedAvailabilityDate(null);
        setSelectedAvailabilitySlot(null);
        setInterviewFinished(false);
        setSuggestedDatetimes(null);
        setIsSuggestingSlots(true);
      },
    });
  }, [pushNewMessage]);

  const handleConfirmSuggestion = useCallback(() => {
    pushNewMessage({ message: MSG.userYes, isAnswer: true });

    if (!applicantId) return;

    setIsLoadingSchedule(true);
    OnboardingService.suggestScreeningInterview({
      jobSlug,
      applicantId,
      suggestions: suggestedDatetimes,
    })
      .then(() => {
        onEnableAutoScheduling(jobSlug, suggestedDatetimes);
        setTimeout(() => handleFinishInterviewSuggestion(), 100);
      })
      .catch(() => toast.error('Failed to submit suggestion.'))
      .finally(() => setIsLoadingSchedule(false));

    setInterviewSchedulingFinished(true);
    setSelectedAvailabilityDate(null);
    setSelectedAvailabilitySlot(null);
    setIsSchedulingInterview(false);
    setIsSuggestingSlots(false);
    setSuggestedDatetimes(null);
  }, [
    applicantId,
    handleFinishInterviewSuggestion,
    jobSlug,
    onEnableAutoScheduling,
    pushNewMessage,
    suggestedDatetimes,
  ]);

  const handleGoBackToTimeSlots = useCallback(() => {
    pushNewMessage({
      message: MSG.userGoBackToSlots,
      isAnswer: true,
      onUpdate: () => {
        setSelectedAvailabilityDate(null);
        setSelectedAvailabilitySlot(null);
        setInterviewFinished(false);
        setIsSuggestingSlots(false);
        setSuggestedDatetimes(null);
        if (availabilitySlots) handleStartDateSelection(availabilitySlots);
      },
    });
  }, [availabilitySlots, handleStartDateSelection, pushNewMessage]);

  const fetchAvailability = useCallback(() => {
    setIsLoadingSchedule(true);
    OnboardingService.getJobAvailability(jobSlug)
      .then((res) => {
        const slots = ((res as Record<string, unknown>)?.data as Record<string, unknown>)
          ?.timeSlots as Record<string, TimeSlot[]> ?? {};
        setAvailabilitySlots(slots);
        handleStartDateSelection(slots);
      })
      .catch(() => {})
      .finally(() => setIsLoadingSchedule(false));
  }, [handleStartDateSelection, jobSlug]);

  const onPushNextQuestion = useCallback(() => {
    if (!applicantId) return;
    setIsLoadingConversation(true);
    OnboardingService.processAIInterviewConversation(applicantId, jobSlug, {
      messageArray: localHistoryRef.current.map((msg) => ({
        role: msg.isAnswer ? 'user' : 'assistant',
        content: msg.message,
        isFollowUp: msg.isFollowUp || false,
        followUpNumber: msg.followUpNumber || 'NONE',
        questionNumber: msg.questionNumber || 0,
      })),
    })
      .then((res) => {
        isWaitingForAIResponseRef.current = false;
        const data = res as Record<string, unknown> | undefined;
        if (!data) {
          toast.error('Error loading next question. Please try again later.');
          return;
        }
        const newQuestionHistory = (data.messages as Array<Record<string, unknown>>) ?? [];
        const explanation = data.explanation as string | undefined;

        if (
          explanation === 'Screening Complete' ||
          (newQuestionHistory.length &&
            newQuestionHistory[newQuestionHistory.length - 1]?.content === 'Screening Complete')
        ) {
          if (data.shouldAllowInterviewScheduling && data.screeningFinalDecision !== 'Screened') {
            onEnableAutoScheduling(jobSlug);
            setTimeout(() => {
              pushNewMessage({ message: MSG.startScheduling, isAnswer: false, isLast: true });
              setIsSchedulingInterview(true);
              fetchAvailability();
            }, 150);
          } else {
            handleFinishInterview();
            setInterviewFinished(true);
            if (data.screeningFinalDecision === 'Screened') {
              onAutoScreened?.();
            }
          }
        } else {
          for (let i = newQuestionHistory.length - 1; i >= 0; i--) {
            const q = newQuestionHistory[i];
            if (q.role === 'assistant') {
              pushNewMessage({
                message: q.content as string,
                isAnswer: false,
                isFollowUp: q.isFollowUp as boolean,
                followUpNumber: (q.followUpNumber as string) || 'NONE',
                questionNumber: (q.questionNumber as number) || 0,
              });
              return;
            }
          }
          toast.error('Error loading next question. Please try again later.');
        }
      })
      .catch(() => {
        isWaitingForAIResponseRef.current = false;
        toast.error('Error loading next question. Please try again later.');
      })
      .finally(() => setIsLoadingConversation(false));
  }, [
    applicantId,
    fetchAvailability,
    handleFinishInterview,
    jobSlug,
    onAutoScreened,
    onEnableAutoScheduling,
    pushNewMessage,
  ]);

  useEffect(() => {
    const hist = history ?? [];
    if (!hist.length) {
      if (isScheduleOnly) {
        onEnableAutoScheduling(jobSlug);
        setTimeout(() => {
          pushNewMessage({ message: MSG.startSchedulingAlt, isAnswer: false, isLast: true });
          setIsSchedulingInterview(true);
          fetchAvailability();
        }, 150);
      } else {
        pushNewMessage({ message: AI_INTERVIEWS_FIRST_MESSAGE, isAnswer: false });
      }
    } else {
      setLocalHistory([...hist]);
      localHistoryRef.current = [...hist];
      if (interviewEndDate) {
        setInterviewFinished(true);
      } else if (hist[hist.length - 1]?.isAnswer) {
        isWaitingForAIResponseRef.current = true;
        onPushNextQuestion();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [localHistory.length, isLoadingConversation, scrollToBottom]);

  useEffect(() => {
    if (interviewFinished) scrollToBottom();
  }, [interviewFinished, scrollToBottom]);

  // ---------- Scheduling button logic ----------

  const [firstLevelButtons, secondLevelButtons] = useMemo<
    [ChatButton[] | null, ChatButton[] | null]
  >(() => {
    if (isLoadingConversation || isLoadingSchedule) return [null, null];
    if (!isSchedulingInterview) return [null, null];

    if (isSuggestingSlots) {
      if (suggestedDatetimes) {
        return [
          [
            { label: 'No', value: 'No', selected: false, onClick: handleCancelSuggestion },
            { label: 'Yes', value: 'Yes', selected: false, onClick: handleConfirmSuggestion },
          ],
          [],
        ];
      }
      if (availabilitySlots && Object.keys(availabilitySlots).length) {
        return [
          [
            {
              label: 'I changed my mind, let me select a time slot',
              value: 'go-back',
              selected: false,
              onClick: handleGoBackToTimeSlots,
            },
          ],
          [],
        ];
      }
      return [[], []];
    }

    if (selectedAvailabilitySlot) {
      return [
        [
          {
            label: 'No',
            value: 'No',
            selected: false,
            onClick: () => {
              setSelectedAvailabilityDate(null);
              setSelectedAvailabilitySlot(null);
              setInterviewFinished(false);
              handleCancelTimeSlot();
            },
          },
          { label: 'Yes', value: 'Yes', selected: false, onClick: handleConfirmTimeSlot },
        ],
        [],
      ];
    }

    if (availabilitySlots != null) {
      const dayKeys = Object.keys(availabilitySlots).sort();
      const firstRow: ChatButton[] = dayKeys.map((day) => ({
        label: format(new Date(`${day}T12:00:00.000Z`), 'EEE MM/dd'),
        value: day,
        selected: selectedAvailabilityDate === day,
        onClick: () => setSelectedAvailabilityDate(day),
      }));

      firstRow.push({
        label: MSG.userOther,
        value: MSG.userOther,
        selected: selectedAvailabilityDate === MSG.userOther,
        onClick: () => setSelectedAvailabilityDate(MSG.userOther),
      });

      const secondRow: ChatButton[] = [];
      if (selectedAvailabilityDate) {
        if (selectedAvailabilityDate === MSG.userOther) {
          secondRow.push({
            label: MSG.userSelectDifferentTime,
            value: MSG.userOther,
            selected: false,
            onClick: handleRequestSuggestingDifferentTime,
          });
        } else {
          const slots = [...(availabilitySlots[selectedAvailabilityDate] ?? [])].sort((a, b) =>
            a.startDate < b.startDate ? -1 : 1
          );
          slots.forEach((slot) => {
            secondRow.push({
              label: format(new Date(slot.startDate), 'hh:mm aa'),
              value: slot.startDate,
              selected: false,
              onClick: () => handleSelectTimeSlot(slot),
            });
          });
        }
      }

      return [firstRow, secondRow];
    }

    return [null, null];
  }, [
    availabilitySlots,
    handleCancelSuggestion,
    handleCancelTimeSlot,
    handleConfirmSuggestion,
    handleConfirmTimeSlot,
    handleGoBackToTimeSlots,
    handleRequestSuggestingDifferentTime,
    handleSelectTimeSlot,
    isLoadingConversation,
    isLoadingSchedule,
    isSchedulingInterview,
    isSuggestingSlots,
    selectedAvailabilityDate,
    selectedAvailabilitySlot,
    suggestedDatetimes,
  ]);

  const sendLocked =
    interviewFinished ||
    interviewSchedulingFinished ||
    (isSchedulingInterview && !isSuggestingSlots) ||
    (isSchedulingInterview && isSuggestingSlots && suggestedDatetimes != null);

  const onPressSend = () => {
    if (!textValue.trim()) return;

    if (isSuggestingSlots) {
      const val = textValue;
      setTextValue('');
      pushNewMessage({
        message: val,
        isAnswer: true,
        onUpdate: () => {
          if (!applicantId) return;
          setIsLoadingConversation(true);
          OnboardingService.suggestAIInterviewSlots(applicantId, jobSlug, {
            message: val,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          })
            .then((res) => {
              isWaitingForAIResponseRef.current = false;
              const data = (res as Record<string, unknown>)?.data as
                | Record<string, unknown>
                | undefined;
              if (data?.success) {
                setSuggestedDatetimes(data.suggestions);
                pushNewMessage({ message: data.message as string, isAnswer: false });
              } else if (data?.message) {
                pushNewMessage({ message: data.message as string, isAnswer: false });
              } else {
                toast.error('Error processing suggestion. Please try again.');
              }
            })
            .catch(() => toast.error('Error processing suggestion. Please try again.'))
            .finally(() => setIsLoadingConversation(false));
        },
      });
      return;
    }

    if (isWaitingForAIResponseRef.current) return;

    const hist = localHistoryRef.current;
    const questionNumber = hist[Math.max(hist.length - 1, 0)]?.questionNumber ?? 0;
    const val = textValue;
    setTextValue('');
    isWaitingForAIResponseRef.current = true;
    pushNewMessage({
      message: val,
      isAnswer: true,
      questionNumber,
      onUpdate: () => onPushNextQuestion(),
    });
  };

  const onPressKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !interviewFinished) onPressSend();
  };

  const handleClose = () => {
    if (interviewFinished) {
      onClose();
    } else {
      setConfirmClose(true);
    }
  };

  const firstName = applicant.firstName as string | undefined;
  const lastName = applicant.lastName as string | undefined;
  const initials = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 flex-shrink-0">
            <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center text-gray-700 font-semibold text-sm flex-shrink-0">
              {initials}
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                {firstName ?? ''} {lastName ?? ''}
              </p>
            </div>
          </div>

          {/* Chat window */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <AIChatWindow
              firstName={firstName}
              lastName={lastName}
              items={localHistory}
              interviewFinished={interviewFinished}
              onPressUpdateInfo={onPressUpdateInfo}
              onPressBackToHome={onPressBackToHome}
              listRef={listRef}
              isLoadingResponse={isLoadingConversation || isLoadingSchedule}
              firstLevelButtons={firstLevelButtons}
              secondLevelButtons={secondLevelButtons}
            />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 flex-shrink-0">
            <Input
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={onPressKey}
              placeholder="Type a new message here"
              disabled={sendLocked}
              maxLength={600}
              className="flex-1"
            />
            <button
              type="button"
              aria-label="Send message"
              onClick={onPressSend}
              disabled={sendLocked}
              className="text-gray-500 hover:text-blue-600 disabled:opacity-40"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm close dialog */}
      {confirmClose && (
        <Dialog open={confirmClose} onOpenChange={(o) => !o && setConfirmClose(false)}>
          <DialogContent className="max-w-sm">
            <p className="font-semibold text-gray-900 mb-1">
              {isSchedulingInterview ? 'Leaving Interview Scheduling' : 'Leaving Interview'}
            </p>
            <p className="text-sm text-gray-600 mb-4">
              {isSchedulingInterview
                ? "You haven't finished scheduling an interview yet. Are you sure you want to quit?"
                : "You haven't finished the AI Screening yet. Are you sure you want to quit? You can resume the interview later."}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setConfirmClose(false);
                  onClose();
                }}
              >
                Leave
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default AIInterviewModal;
