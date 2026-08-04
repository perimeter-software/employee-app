'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, X, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { useNewApplicantContext } from '../../state/new-applicant-context';
import { type AttachmentFile } from '../../utils/attachment-helpers';
import UploadFileModal from './UploadFileModal';
import BlankBackConfirmModal from './BlankBackConfirmModal';
import type {
  BlankBackPrompt,
  BlankBackSelectionResult,
  OnboardingDocsCompleteness,
} from '../../types';
import { commonStaticAssetUrl } from '@/lib/utils';

// Stored document types are snake-ish identifiers (`US_Passport_Front`). Underscores
// to spaces covers most of them; these are the ones that would read badly.
const DOC_TYPE_LABELS: Record<string, string> = {
  DLPhoto_Front: 'Driver License (Front)',
  DLPhoto_Back: 'Driver License (Back)',
  DD214_Front: 'DD-214 (Front)',
  DD214_Back: 'DD-214 (Back)',
  I_94: 'Form I-94',
  Student_ID_Front: 'Student ID (Front)',
  Student_ID_Back: 'Student ID (Back)',
  US_Passport_Front: 'U.S. Passport (Front)',
  US_Passport_Back: 'U.S. Passport (Back)',
  Onboarding_Documents: 'Onboarding Document',
};

function friendlyDocType(type: string): string {
  if (DOC_TYPE_LABELS[type]) return DOC_TYPE_LABELS[type];
  const label = type.replace(/_/g, ' ').trim();
  if (!label) return 'Uploaded document';
  return label.replace(/\s(Front|Back)$/i, (_m, side: string) => ` (${side})`);
}

const OnboardingGuideModal: React.FC<{ open: boolean; onOpenChange: (v: boolean) => void }> = ({
  open,
  onOpenChange,
}) => {
  const pdfUrl = commonStaticAssetUrl('i-9 example docs.pdf');

  // Inline <object> embedding of a PDF only works when the browser has a native
  // PDF viewer. iOS Safari (and Android Chrome) have none: they render a blank
  // area and do NOT fall back to the <object>'s child content, so we can't rely
  // on that fallback to surface a link. Rather than guess from screen size,
  // query the capability directly via navigator.pdfViewerEnabled, and only fall
  // back to a coarse-pointer heuristic on older browsers that lack it.
  const [canEmbedPdf, setCanEmbedPdf] = useState(true);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const supportsInlinePdf = navigator.pdfViewerEnabled;
    if (typeof supportsInlinePdf === 'boolean') {
      setCanEmbedPdf(supportsInlinePdf);
    } else {
      // Older browsers: assume touch/coarse-pointer devices can't embed.
      setCanEmbedPdf(!window.matchMedia('(pointer: coarse)').matches);
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[80vw]">
        <DialogHeader>
          <DialogTitle>Onboarding Documents Upload Guide</DialogTitle>
        </DialogHeader>
        <div className="w-full">
          {canEmbedPdf ? (
            <object data={pdfUrl} type="application/pdf" className="w-full h-[70vh]">
              <p className="text-sm text-gray-600">
                Unable to display PDF.{' '}
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                  Download
                </a>{' '}
                instead.
              </p>
            </object>
          ) : (
            <p className="text-sm text-gray-600 py-4">
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                Open the onboarding documents upload guide (PDF)
              </a>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// The backend names the stored file (it prefixes a timestamp), so a prompt's
// filename may not be byte-identical to what the browser uploaded. A prompt always
// refers to exactly ONE page, so this resolves to a single index — never a
// predicate applied across the list, or a re-upload of the same original filename
// would take its siblings with it. Exact match wins; otherwise the most recently
// added suffix match, which is the page that was just uploaded.
function findPromptAttachmentIndex(all: AttachmentFile[], promptFilename: string): number {
  let looseMatch = -1;
  for (let i = all.length - 1; i >= 0; i -= 1) {
    const name = all[i].filename ?? all[i].name ?? '';
    if (!name) continue;
    if (name === promptFilename) return i;
    if (looseMatch < 0 && promptFilename.endsWith(name)) looseMatch = i;
  }
  return looseMatch;
}

const UploadID: React.FC = () => {
  const {
    applicant,
    updateButtons,
    updateCurrentFormState,
    submitRef,
    updateApplicantAction,
    loadApplicantAction,
  } = useNewApplicantContext();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  // Blank pages the backend wants confirmed, answered one at a time.
  const [blankBackQueue, setBlankBackQueue] = useState<BlankBackPrompt[]>([]);
  // Blank pages with no eligible front on file — informational only.
  const [blankBackNotices, setBlankBackNotices] = useState<BlankBackPrompt[]>([]);
  const compressGuideUrl = commonStaticAssetUrl('How to Compress Your Images for Upload.pdf');

  const applicantId = applicant._id ?? '';
  const rawAttachments = applicant.attachments as AttachmentFile[] | undefined;
  const { complete, validIDs = [], requiredDocuments = [] } =
    (applicant.onboardingDocsComplete as OnboardingDocsCompleteness | undefined) ?? {};

  const isComplete = complete === 'Yes';
  const validUploadsMessage =
    validIDs.length > 0
      ? `Valid uploads found: ${validIDs.join(', ')}`
      : 'No valid uploads found';

  // Applicants only get to see WHICH document types are on file — no previews, no
  // opening, no deleting. One row per distinct type, in upload order.
  const uploadedDocTypes: string[] = useMemo(() => {
    const seen = new Set<string>();
    const types: string[] = [];
    for (const file of rawAttachments ?? []) {
      if (file.hidden === 'Yes') continue;
      const type = file.type ?? '';
      if (!type || seen.has(type)) continue;
      seen.add(type);
      types.push(type);
    }
    return types;
  }, [rawAttachments]);

  // The documents still required come straight from the backend (single source of
  // truth for the I-9 completeness rule); the frontend only renders them.
  const requiredEmptyBoxes = requiredDocuments;

  useEffect(() => {
    updateCurrentFormState({ isDirty: false });
    updateButtons({
      previous: { show: true, disabled: false },
      next: { show: true, disabled: false },
      submit: { show: false, disabled: true },
    });
    submitRef.current = null;

    // Mirror stadium-people: auto-open the guide for applicants who haven't acknowledged yet.
    const ack = applicant.acknowledged as boolean | { date?: string } | undefined;
    const hasAcknowledged = typeof ack === 'object' ? !!ack?.date : !!ack;
    if (!hasAcknowledged && applicant.status !== 'Employee') {
      setGuideOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUploaded = async (updatedAttachments: AttachmentFile[]) => {
    // Classification happens on the save, not the upload — the prompts ride back
    // on the applicant update response.
    const res = await updateApplicantAction(applicantId, { attachments: updatedAttachments });
    const blankBackPrompts = res?.blankBackPrompts ?? [];

    const needsConfirmation = blankBackPrompts.filter((p) => (p.candidates ?? []).length > 0);
    const informational = blankBackPrompts.filter((p) => (p.candidates ?? []).length === 0);
    if (needsConfirmation.length) setBlankBackQueue((q) => [...q, ...needsConfirmation]);
    if (informational.length) setBlankBackNotices((n) => [...n, ...informational]);
  };

  const shiftBlankBackQueue = useCallback(
    () => setBlankBackQueue((q) => q.slice(1)),
    []
  );

  // Confirmed: the backend already moved the file and recomputed completeness, so
  // mirror both locally instead of re-fetching or re-saving the applicant.
  const handleBlankBackConfirmed = (result: BlankBackSelectionResult) => {
    const all = rawAttachments ?? [];
    const idx = findPromptAttachmentIndex(all, result.filename);
    const updated =
      idx < 0 ? all : all.map((f, i) => (i === idx ? { ...f, type: result.type } : f));
    loadApplicantAction({
      attachments: updated,
      ...(result.completeness ? { onboardingDocsComplete: result.completeness } : {}),
    });
    shiftBlankBackQueue();
    toast.success('Thanks — we matched that page to your document.');
  };

  // Declined: the page was not the back of anything they uploaded. Discard it and
  // send them straight back to the upload modal.
  const handleBlankBackDeclined = async (filename: string) => {
    shiftBlankBackQueue();
    const all = rawAttachments ?? [];
    const idx = findPromptAttachmentIndex(all, filename);
    try {
      if (idx >= 0) {
        await updateApplicantAction(applicantId, {
          attachments: all.filter((_, i) => i !== idx),
        });
      }
    } catch {
      toast.error('Failed to discard that page. Please delete it and try again.');
      return;
    }
    setUploadOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className="rounded border p-4 space-y-2">
        <p className={`text-sm font-semibold ${isComplete ? 'text-green-700' : 'text-red-700'}`}>
          {isComplete
            ? 'Onboarding documents are complete.'
            : 'Onboarding documents are incomplete.'}{' '}
          {validUploadsMessage}
        </p>
        <p className="text-sm font-semibold text-gray-700">
          You must upload clear copies of both the front and back of the government-issued
          employment authorization documents that you listed on your I-9 form
        </p>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="block text-sm text-blue-600 underline hover:text-blue-800 text-left"
          >
            Click here for onboarding documents upload guide
          </button>
          <a
            href={compressGuideUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-blue-600 underline hover:text-blue-800"
          >
            Click here for our image upload guide
          </a>
        </div>
      </div>

      {/* Blank pages with no eligible front on file — informational, nothing to confirm */}
      {blankBackNotices.map((notice) => (
        <div
          key={`blank-notice-${notice.filename}`}
          className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-3"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="text-sm text-amber-900">{notice.message}</p>
            <p className="text-xs text-amber-700 break-all">{notice.filename}</p>
          </div>
          <button
            type="button"
            onClick={() =>
              setBlankBackNotices((n) => n.filter((x) => x.filename !== notice.filename))
            }
            className="rounded p-0.5 hover:bg-amber-100"
            aria-label="Dismiss notice"
          >
            <X className="h-4 w-4 text-amber-700" />
          </button>
        </div>
      ))}

      {/* Documents already on file — names only, no previews and no deleting */}
      <div className="rounded border p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Documents you have uploaded</p>
        {uploadedDocTypes.length > 0 ? (
          <ul className="space-y-2">
            {uploadedDocTypes.map((type) => (
              <li
                key={`uploaded-${type}`}
                className="flex items-center gap-2 rounded border border-green-200 bg-green-50 px-3 py-2"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                <span className="text-sm font-medium text-green-900">
                  {friendlyDocType(type)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">You have not uploaded any documents yet.</p>
        )}
      </div>

      {/* Documents still required */}
      {requiredEmptyBoxes.length > 0 && (
        <div className="rounded border p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Still required</p>
          <ul className="space-y-2">
            {requiredEmptyBoxes.map((box, index) => (
              <li key={`empty-${box.type}-${index}`} className="space-y-2">
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  className="flex w-full items-center gap-2 rounded border-2 border-dashed border-red-400 bg-gray-50 px-3 py-2 text-left hover:bg-gray-100"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                  <span className="flex-1 text-sm font-semibold text-red-600">
                    {box.description}
                  </span>
                  <Plus className="h-4 w-4 shrink-0 text-gray-400" />
                </button>
                {index < requiredEmptyBoxes.length - 1 && (
                  <p className="text-center text-xs font-bold text-gray-500">OR</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Add button */}
      <button
        type="button"
        onClick={() => setUploadOpen(true)}
        className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
      >
        <Plus className="h-4 w-4" />
        Upload a document
      </button>

      <UploadFileModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        applicantId={applicantId}
        currentAttachments={rawAttachments ?? []}
        onUploaded={handleUploaded}
        defaultType="Onboarding_Documents"
      />

      <BlankBackConfirmModal
        prompt={blankBackQueue[0] ?? null}
        onConfirmed={handleBlankBackConfirmed}
        onDeclined={handleBlankBackDeclined}
        onDismiss={shiftBlankBackQueue}
      />

      <OnboardingGuideModal open={guideOpen} onOpenChange={setGuideOpen} />
    </div>
  );
};

export default UploadID;
