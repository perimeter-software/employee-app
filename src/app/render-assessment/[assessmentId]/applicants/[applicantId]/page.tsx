'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileSpreadsheet,
  ClipboardList,
  Download,
  FileText,
} from 'lucide-react';
import {
  PublicPageShell,
  PublicCard,
  useCompanyBranding,
} from '@/components/public/PublicPageShell';
import { outsidePublicFetch } from '@/lib/api/outside-public';

/* ------------------------------------------------------------------ *
 * Public candidate-facing assessment-taking page. Ported from the
 * gignology-v4 /render-assessment route — applicants belong in the
 * employee app, not the admin app. Unauthenticated: every call goes to
 * sp1-api's /outside-public/* endpoints through our own proxy, and
 * identity is proven by the OTP step when the assessment requires it.
 * ------------------------------------------------------------------ */

interface AnswerOption {
  answerText?: string;
}
interface Question {
  _id?: string;
  id?: string;
  text?: string;
  type?: string; // "Multiple Choice" | "True/False" | "Fill-In"
  answers?: AnswerOption[];
  enableScore?: string; // "No" → question doesn't affect the score
}
interface AssessmentDef {
  name?: string;
  assessmentName?: string;
  type?: string; // "Excel" for spreadsheet assessments
  assessmentType?: string; // "Survey" for surveys
  timeLimit?: number; // seconds
  questions?: Question[];
  excelAssessment?: { startingWorkbook?: { filename?: string } };
}
interface LoadData {
  assessment?: AssessmentDef;
  applicant?: { firstName?: string; lastName?: string; email?: string };
  job?: { jobSlug?: string; title?: string; description?: string };
  assessmentStatus?: string;
  requiresOtp?: boolean;
  otpVerified?: boolean;
  otpExpired?: boolean;
  score?: unknown;
  completedAt?: string;
  isSurvey?: boolean;
}

const qid = (q: Question) => (q._id ?? q.id ?? '') as string;
const shuffle = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

export default function RenderAssessmentPage() {
  const params = useParams<{ assessmentId: string; applicantId: string }>();
  const assessmentId = params?.assessmentId as string | undefined;
  const applicantId = params?.applicantId as string | undefined;
  const lsKey = `assessment-${assessmentId}-${applicantId}`;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LoadData | null>(null);

  // OTP
  const [otp, setOtp] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Assessment progression
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [shuffled, setShuffled] = useState<Record<string, AnswerOption[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);

  // Excel
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  // Timer
  const [remaining, setRemaining] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const questionStartRef = useRef<number>(Date.now());

  // Job description modal
  const [jobDescOpen, setJobDescOpen] = useState(false);

  // Branding banner + time's-up modal
  const { name: companyName, bannerUrl: companyBanner } = useCompanyBranding();
  const [timeoutModalOpen, setTimeoutModalOpen] = useState(false);

  const orderKey = `${lsKey}-order`;

  const assessment = data?.assessment;
  const questions = useMemo(() => assessment?.questions ?? [], [assessment]);
  const isExcel = assessment?.type === 'Excel';
  const isSurvey = assessment?.assessmentType === 'Survey' || !!data?.isSurvey;
  const typeLabel = isSurvey ? 'Survey' : 'Assessment';
  const requiresOtp = !!data?.requiresOtp;
  const title = assessment?.name || assessment?.assessmentName || typeLabel;
  const templateFilename = assessment?.excelAssessment?.startingWorkbook?.filename;
  const jobDescription = data?.job?.description;

  const load = useCallback(async () => {
    if (!assessmentId || !applicantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await outsidePublicFetch<{
        success: boolean;
        data?: LoadData;
        error?: string;
      }>(`/assessments/${assessmentId}/applicants/${applicantId}`);
      if (res.success && res.data) {
        setData(res.data);
        setOtpVerified(!!res.data.otpVerified);
        const status = res.data.assessmentStatus;
        if (status === 'Completed' || res.data.score) {
          setComplete(true);
        } else if (status === 'Started') {
          // Resume in-progress attempt from local storage.
          setStarted(true);
          try {
            const saved = JSON.parse(localStorage.getItem(lsKey) || '{}');
            if (saved.answers) setAnswers(saved.answers);
            if (typeof saved.index === 'number') setIndex(saved.index);
          } catch {
            /* ignore */
          }
        }
      } else {
        setError(res.error || 'Assessment or applicant not found');
      }
    } catch (e) {
      setError((e as Error).message || 'Failed to load assessment');
    } finally {
      setLoading(false);
    }
  }, [assessmentId, applicantId, lsKey]);

  useEffect(() => {
    load();
  }, [load]);

  // Shuffle MC options once per loaded assessment; persist the order so a
  // mid-assessment page reload restores the same option ordering (legacy parity).
  useEffect(() => {
    if (!questions.length) return;
    setShuffled((prev) => {
      if (Object.keys(prev).length) return prev;
      const mcIds = questions.filter((q) => q.type === 'Multiple Choice').map(qid);
      try {
        const saved = JSON.parse(localStorage.getItem(orderKey) || 'null') as Record<
          string,
          AnswerOption[]
        > | null;
        if (saved && mcIds.every((id) => Array.isArray(saved[id]))) return saved;
      } catch {
        /* ignore corrupt order cache */
      }
      const next: Record<string, AnswerOption[]> = {};
      for (const q of questions) {
        if (q.type === 'Multiple Choice' && q.answers) next[qid(q)] = shuffle(q.answers);
      }
      try {
        localStorage.setItem(orderKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [questions, orderKey]);

  // Countdown timer (auto-submits on expiry).
  useEffect(() => {
    if (!started || isExcel || complete) return;
    if (!assessment?.timeLimit) return;
    setRemaining((r) => (r == null ? assessment.timeLimit! : r));
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r == null) return r;
        if (r <= 1) {
          clearInterval(t);
          setTimedOut(true);
          setTimeoutModalOpen(true);
          void finishAssessment(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, isExcel, complete, assessment?.timeLimit]);

  const persist = (a: Record<string, string>, i: number) => {
    try {
      localStorage.setItem(lsKey, JSON.stringify({ answers: a, index: i }));
    } catch {
      /* ignore */
    }
  };

  const setAnswer = (q: Question, value: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [qid(q)]: value };
      persist(next, index);
      return next;
    });
  };

  const sendOtp = async () => {
    setSendingOtp(true);
    setOtpError(null);
    try {
      await outsidePublicFetch(
        `/assessments/${assessmentId}/applicants/${applicantId}/send-otp`,
        { method: 'POST' }
      );
      setOtpSent(true);
    } catch (e) {
      setOtpError((e as Error).message || 'Failed to send code');
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp.trim()) return;
    setVerifyingOtp(true);
    setOtpError(null);
    try {
      await outsidePublicFetch(
        `/assessments/${assessmentId}/applicants/${applicantId}/verify-otp`,
        { method: 'POST', body: JSON.stringify({ otp: otp.trim() }) }
      );
      // verify-otp only confirms identity (it does NOT start the assessment
      // or the timer). Show the start page next so the candidate begins when
      // ready — the timer starts on "Begin" (startAssessment), matching legacy.
      setOtpVerified(true);
    } catch (e) {
      setOtpError((e as Error).message || 'Invalid or expired code');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const startAssessment = async () => {
    setStarting(true);
    setError(null);
    try {
      await outsidePublicFetch(
        `/assessments/${assessmentId}/applicants/${applicantId}/start`,
        { method: 'POST' }
      );
      setStarted(true);
      questionStartRef.current = Date.now();
    } catch (e) {
      setError((e as Error).message || 'Failed to start assessment');
    } finally {
      setStarting(false);
    }
  };

  const recordTime = async (q: Question) => {
    const elapsedTime = Math.floor((Date.now() - questionStartRef.current) / 1000);
    try {
      await outsidePublicFetch(
        `/assessments/${assessmentId}/applicants/${applicantId}/answer-time`,
        { method: 'PUT', body: JSON.stringify({ questionId: qid(q), elapsedTime }) }
      );
    } catch {
      /* time tracking is best-effort */
    }
  };

  const finishAssessment = async (auto = false) => {
    setSubmitting(true);
    setError(null);
    try {
      const current = questions[index];
      if (current && !auto) await recordTime(current);
      await outsidePublicFetch(
        `/assessments/${assessmentId}/applicants/${applicantId}/evaluate`,
        {
          method: 'PUT',
          body: JSON.stringify({
            jobSlug: data?.job?.jobSlug,
            answers,
            jobName: data?.job?.title,
          }),
        }
      );
      localStorage.removeItem(lsKey);
      localStorage.removeItem(orderKey);
      setComplete(true);
    } catch (e) {
      setError((e as Error).message || 'Failed to submit assessment');
    } finally {
      setSubmitting(false);
    }
  };

  const next = async () => {
    const current = questions[index];
    if (index === questions.length - 1) {
      await finishAssessment();
      return;
    }
    if (current) await recordTime(current);
    questionStartRef.current = Date.now();
    const ni = index + 1;
    setIndex(ni);
    persist(answers, ni);
  };

  const prev = () => {
    const pi = Math.max(0, index - 1);
    setIndex(pi);
    persist(answers, pi);
  };

  // Fetch a presigned S3 URL for the starting template and trigger a download.
  const downloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const res = await outsidePublicFetch<{ url?: string }>(
        `/assessments/${assessmentId}/template-link`
      );
      if (res?.url) {
        const a = document.createElement('a');
        a.href = res.url;
        a.download = templateFilename || 'assessment-template.xlsx';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        setError('Template is not available.');
      }
    } catch (e) {
      setError((e as Error).message || 'Failed to download template');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const submitExcel = async () => {
    if (!excelFile) return;
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', excelFile);
      await outsidePublicFetch(
        `/assessments/${assessmentId}/applicants/${applicantId}/submit-excel`,
        { method: 'POST', body: fd }
      );
      localStorage.removeItem(lsKey);
      localStorage.removeItem(orderKey);
      setComplete(true);
    } catch (e) {
      setError((e as Error).message || 'Failed to submit file');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- render ----------

  // Shared "View Job Description" affordance (legacy parity) — usable from the
  // intro, Excel, and question screens.
  const jobDescButton = jobDescription ? (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={() => setJobDescOpen(true)}
    >
      <FileText className="h-4 w-4" /> View Job Description
    </Button>
  ) : null;
  const jobDescModal = jobDescription ? (
    <Dialog open={jobDescOpen} onOpenChange={setJobDescOpen}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle>{data?.job?.title || 'Job Description'}</DialogTitle>
        </DialogHeader>
        {/* Job descriptions are rich text from the admin editor. gignology-v4
            styles this with @tailwindcss/typography's `prose`, which this app
            does not install — so the element styles Tailwind's preflight resets
            (lists, headings, spacing) are restored explicitly here. */}
        <div
          className="max-w-none text-sm [&_*]:!text-foreground [&_a]:underline [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-bold [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:mb-1 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_strong]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5"
          dangerouslySetInnerHTML={{ __html: jobDescription }}
        />
      </DialogContent>
    </Dialog>
  ) : null;

  // Time's-up modal (legacy parity) — shown when the timer expires; the answers
  // were auto-submitted. Closing it reveals the completion screen beneath.
  const timeoutModal = (
    <Dialog open={timeoutModalOpen} onOpenChange={setTimeoutModalOpen}>
      <DialogContent className="max-w-sm bg-background">
        <DialogHeader>
          <DialogTitle>Time&apos;s Up!</DialogTitle>
          <DialogDescription>
            Your {typeLabel.toLowerCase()} time has expired. Your answers have been
            automatically submitted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => setTimeoutModalOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (loading) {
    return (
      <PublicPageShell banner={companyBanner}>
        <PublicCard className="flex items-center justify-center gap-3 py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-muted-foreground">Loading assessment…</span>
        </PublicCard>
      </PublicPageShell>
    );
  }

  if (error && !data) {
    return (
      <PublicPageShell banner={companyBanner}>
        <PublicCard className="text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-destructive" />
          <p className="font-medium">{error}</p>
        </PublicCard>
      </PublicPageShell>
    );
  }

  if (complete) {
    return (
      <PublicPageShell banner={companyBanner}>
        <PublicCard className="text-center">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-green-600" />
          <h1 className="text-xl font-semibold">
            {timedOut ? "Time's up" : `${typeLabel} submitted`}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Thank you{data?.applicant?.firstName ? `, ${data.applicant.firstName}` : ''}.{' '}
            {timedOut
              ? 'Your time expired and your answers were submitted.'
              : 'Your responses have been recorded.'}
            {!isSurvey && ' Someone will be in touch with you shortly.'}
          </p>
        </PublicCard>
        {timeoutModal}
      </PublicPageShell>
    );
  }

  // OTP gate
  if (requiresOtp && !otpVerified) {
    return (
      <PublicPageShell banner={companyBanner}>
        <PublicCard>
          <div className="mb-5 text-center">
            <ClipboardList className="mx-auto mb-3 h-10 w-10 text-primary" />
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              We need to verify it&apos;s you before you begin.
            </p>
          </div>
          {!otpSent ? (
            <Button fullWidth onClick={sendOtp} disabled={sendingOtp}>
              {sendingOtp ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Send verification code'
              )}
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Enter the 6-digit code we emailed you
                </Label>
                <Input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  className="text-center text-lg tracking-[0.5em]"
                />
              </div>
              <Button
                fullWidth
                onClick={verifyOtp}
                disabled={verifyingOtp || otp.length < 6}
              >
                {verifyingOtp ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Verify & start'
                )}
              </Button>
              <button
                type="button"
                onClick={sendOtp}
                disabled={sendingOtp}
                className="w-full text-xs text-muted-foreground hover:text-primary"
              >
                {sendingOtp ? 'Resending…' : 'Resend code'}
              </button>
            </div>
          )}
          {otpError && (
            <p className="mt-3 text-center text-sm text-destructive">{otpError}</p>
          )}
        </PublicCard>
      </PublicPageShell>
    );
  }

  // Intro / start — two-column "Assessment Portal" (legacy V3 parity).
  if (!started) {
    const tl = assessment?.timeLimit ?? 0;
    const tlStr = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
    const fullName = [data?.applicant?.firstName, data?.applicant?.lastName]
      .filter(Boolean)
      .join(' ');
    return (
      <PublicPageShell banner={companyBanner} wide>
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="grid md:grid-cols-12">
            {/* Left — portal heading + time allocation */}
            <div className="p-6 sm:p-8 md:col-span-5">
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                {typeLabel} Portal
              </h1>
              {companyName && (
                <p className="mt-1 text-lg font-semibold text-primary">{companyName}</p>
              )}
              <div className="mt-6 border-t pt-6">
                <h2 className="text-xl font-bold text-foreground/90">{title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isExcel
                    ? 'Upload a completed spreadsheet.'
                    : `${questions.length} question${questions.length === 1 ? '' : 's'}.`}
                </p>
                {tl > 0 && (
                  <div className="mt-6">
                    <p className="mb-2 text-sm font-semibold text-primary">
                      Time Allocation
                    </p>
                    <div className="flex items-center gap-3 rounded-lg bg-primary/5 px-4 py-3">
                      <Clock className="h-7 w-7 shrink-0 text-primary" />
                      <span className="text-2xl font-bold tabular-nums">
                        {tlStr}{' '}
                        <span className="text-sm font-medium text-muted-foreground">
                          Minutes
                        </span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right — candidate information + begin */}
            <div className="flex flex-col bg-muted/30 p-6 sm:p-8 md:col-span-7 md:border-l">
              <h3 className="text-lg font-bold">Candidate Information</h3>
              <div className="mt-5 flex-1 space-y-4">
                {fullName && (
                  <div>
                    <p className="text-sm text-muted-foreground">Full Name</p>
                    <p className="font-medium">{fullName}</p>
                  </div>
                )}
                {data?.applicant?.email && (
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="break-all font-medium">{data.applicant.email}</p>
                  </div>
                )}
                {data?.job?.title && (
                  <div>
                    <p className="text-sm text-muted-foreground">Position</p>
                    <p className="font-medium">{data.job.title}</p>
                  </div>
                )}
                {jobDescButton}
              </div>
              <Button
                size="lg"
                fullWidth
                className="mt-6 h-12 bg-gradient-to-r from-sky-500 to-blue-600 text-base hover:from-sky-600 hover:to-blue-700"
                onClick={startAssessment}
                disabled={starting}
              >
                {starting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  `Begin ${typeLabel}`
                )}
              </Button>
              {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            </div>
          </div>
        </div>
        {jobDescModal}
      </PublicPageShell>
    );
  }

  // Excel upload
  if (isExcel) {
    return (
      <PublicPageShell banner={companyBanner}>
        <PublicCard>
          <div className="mb-1 flex items-start justify-between gap-3">
            <h1 className="text-lg font-semibold">{title}</h1>
            {jobDescButton}
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Complete the spreadsheet task and upload your file.
          </p>

          <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Download the Excel template below.</li>
            <li>Complete all required tasks within the file.</li>
            <li>Upload your completed file in the submission section.</li>
            {assessment?.timeLimit ? (
              <li>Submit your work before the timer expires.</li>
            ) : null}
          </ol>

          {templateFilename && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="flex min-w-0 items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-600" />
                <span className="truncate text-sm">{templateFilename}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={downloadTemplate}
                disabled={downloadingTemplate}
              >
                {downloadingTemplate ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Template
              </Button>
            </div>
          )}

          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 hover:bg-muted/40">
            <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm font-medium">
              {excelFile ? excelFile.name : 'Choose your completed file'}
            </span>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <Button
            fullWidth
            className="mt-5"
            onClick={submitExcel}
            disabled={!excelFile || submitting}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit'}
          </Button>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </PublicCard>
        {jobDescModal}
      </PublicPageShell>
    );
  }

  // Question flow
  const q = questions[index];
  const answer = q ? (answers[qid(q)] ?? '') : '';
  const progress = questions.length ? ((index + 1) / questions.length) * 100 : 0;
  const mins = remaining != null ? Math.floor(remaining / 60) : null;
  const secs = remaining != null ? remaining % 60 : null;

  const candidateName = [data?.applicant?.firstName, data?.applicant?.lastName]
    .filter(Boolean)
    .join(' ');

  const optionClass = (selected: boolean) =>
    `flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
      selected
        ? 'border-primary bg-primary/5 ring-1 ring-primary'
        : 'border-border hover:border-primary/40 hover:bg-muted/40'
    }`;
  const isLast = index === questions.length - 1;

  // Keyed by index, not by text: answer options are author-entered and are not
  // guaranteed unique (v4 keys by index for the same reason).
  const renderOptions = (options: string[]) =>
    options.map((opt, i) => (
      <label key={i} className={optionClass(answer === opt)}>
        <input
          type="radio"
          name={qid(q!)}
          value={opt}
          checked={answer === opt}
          onChange={() => setAnswer(q!, opt)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
        />
        <span className="text-[13px] leading-relaxed">{opt}</span>
      </label>
    ));

  return (
    <PublicPageShell banner={companyBanner}>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {/* Header */}
        <div className="border-b p-5 sm:px-6 sm:pb-4 sm:pt-6">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold">{title}</h1>
              {candidateName && (
                <p className="text-xs font-semibold text-primary">for {candidateName}</p>
              )}
            </div>
            {jobDescButton}
          </div>

          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              Question {index + 1} of {questions.length}
            </p>
            <div className="flex items-center gap-3">
              {remaining != null && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                    remaining <= 30
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Clock className="h-3.5 w-3.5" />
                  {mins}:{String(secs).padStart(2, '0')}
                </span>
              )}
              <span className="text-xs font-medium text-muted-foreground">
                {Math.round(progress)}% Complete
              </span>
            </div>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6">
          {q ? (
            <>
              <p className="text-sm font-semibold leading-relaxed">{q.text}</p>
              {q.enableScore === 'No' && !isSurvey && (
                <p className="mt-1.5 text-xs font-medium text-amber-600">
                  This question won&apos;t affect your score
                </p>
              )}

              <div className="mt-4">
                {q.type === 'Multiple Choice' && (
                  <div className="space-y-2">
                    {renderOptions(
                      (shuffled[qid(q)] ?? q.answers ?? []).map((a) => a.answerText ?? '')
                    )}
                  </div>
                )}

                {q.type === 'True/False' && (
                  <div className="space-y-2">{renderOptions(['True', 'False'])}</div>
                )}

                {q.type === 'Fill-In' && (
                  <Textarea
                    value={answer}
                    onChange={(e) => setAnswer(q, e.target.value)}
                    onPaste={(e) => e.preventDefault()}
                    onCut={(e) => e.preventDefault()}
                    placeholder="Type your answer here…"
                    rows={6}
                  />
                )}
              </div>
              {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No questions available.</p>
          )}
        </div>

        {/* Nav bar */}
        {q && (
          <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-5 py-3.5 sm:px-6">
            <Button variant="outline" onClick={prev} disabled={index === 0 || submitting}>
              Previous
            </Button>
            <Button onClick={next} disabled={submitting || !answer} className="min-w-28">
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isLast ? (
                'Submit'
              ) : (
                'Next'
              )}
            </Button>
          </div>
        )}
      </div>
      {jobDescModal}
      {timeoutModal}
    </PublicPageShell>
  );
}
