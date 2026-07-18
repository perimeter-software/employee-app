'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, X, FileText, File } from 'lucide-react';
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
import { applicantFileKey, getStaticAssetUrl } from '@/lib/utils';
import { useFileUrl } from '@/lib/hooks/use-file-url';

// Only the shared guide PDFs below still come from the legacy image server;
// applicant files are presigned out of S3 via useFileUrl.
const IMAGE_SERVER = process.env.NEXT_PUBLIC_IMAGE_SERVER ?? '';
const IMAGE_EXTS = ['jpeg', 'jpg', 'png', 'bmp', 'gif', 'webp'];

function getExt(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

const OnboardingGuideModal: React.FC<{ open: boolean; onOpenChange: (v: boolean) => void }> = ({
  open,
  onOpenChange,
}) => {
  const pdfUrl = getStaticAssetUrl(IMAGE_SERVER, 'i-9%20example%20docs.pdf');

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

interface AttachmentCardProps {
  file: AttachmentFile;
  applicantId: string;
  onDelete: () => void;
}

const AttachmentCard: React.FC<AttachmentCardProps> = ({ file, applicantId, onDelete }) => {
  const filename = file.filename ?? file.name ?? '';
  const type = file.type ?? '';
  const ext = file.docType ?? getExt(filename);
  const fileUrl = useFileUrl(
    applicantId && type && filename
      ? applicantFileKey(applicantId, type, filename)
      : null
  );
  const isImage = IMAGE_EXTS.includes(ext);

  return (
    <div className="relative flex flex-col items-center gap-1 rounded border border-gray-200 p-2 w-[130px]">
      <button
        type="button"
        onClick={onDelete}
        className="absolute -right-2 -top-2 rounded-full bg-white p-0.5 shadow hover:bg-gray-100"
        aria-label="Delete attachment"
      >
        <X className="h-4 w-4 text-gray-500" />
      </button>

      <button
        type="button"
        onClick={() => fileUrl && window.open(fileUrl, '_blank')}
        disabled={!fileUrl}
        className="flex flex-col items-center gap-1 hover:opacity-75"
      >
        {isImage && fileUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fileUrl}
            alt={type}
            className="h-[80px] w-full object-cover rounded"
          />
        ) : ext === 'pdf' ? (
          <FileText className="h-[80px] w-[60px] text-red-500" />
        ) : (
          <File className="h-[80px] w-[60px] text-gray-400" />
        )}
      </button>

      <p className="w-full text-center text-xs font-semibold text-gray-700 truncate" title={type}>
        {type.replace(/_/g, ' ')}
      </p>
      <p className="w-full text-center text-xs text-gray-500 truncate" title={filename}>
        {filename}
      </p>
    </div>
  );
};

const UploadID: React.FC = () => {
  const { applicant, updateButtons, updateCurrentFormState, submitRef, updateApplicantAction } =
    useNewApplicantContext();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const applicantId = applicant._id ?? '';
  const rawAttachments = applicant.attachments as AttachmentFile[] | undefined;
  const { complete, validIDs = [], requiredDocuments = [] } = (
    applicant.onboardingDocsComplete as
      | {
          complete?: string;
          validIDs?: string[];
          requiredDocuments?: { type: string; description: string }[];
        }
      | undefined
  ) ?? {};

  const isComplete = complete === 'Yes';
  const validUploadsMessage =
    validIDs.length > 0
      ? `Valid uploads found: ${validIDs.join(', ')}`
      : 'No valid uploads found';

  const visibleAttachments: AttachmentFile[] = useMemo(
    () => (rawAttachments ?? []).filter((f) => f.hidden !== 'Yes'),
    [rawAttachments]
  );

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

  const handleDelete = async (idx: number) => {
    if (deleting) return;
    setDeleting(true);
    try {
      const all = rawAttachments ?? [];
      const updated = all.filter((_, i) => i !== idx);
      await updateApplicantAction(applicantId, { attachments: updated });
    } catch {
      toast.error('Failed to delete attachment. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleUploaded = async (updatedAttachments: AttachmentFile[]) => {
    await updateApplicantAction(applicantId, { attachments: updatedAttachments });
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
            href={getStaticAssetUrl(IMAGE_SERVER, 'How%20to%20Compress%20Your%20Images%20for%20Upload.pdf')}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-blue-600 underline hover:text-blue-800"
          >
            Click here for our image upload guide
          </a>
        </div>
      </div>

      {/* Attachment grid */}
      <div className="flex flex-wrap gap-4 items-start">
        {visibleAttachments.map((file, idx) => (
          <AttachmentCard
            key={`${file.name ?? ''}_${file.type ?? ''}_${idx}`}
            file={file}
            applicantId={applicantId}
            onDelete={() => handleDelete(idx)}
          />
        ))}

        {/* Required empty boxes */}
        {requiredEmptyBoxes.map((box, index) => (
          <div key={`empty-${box.type}-${index}`} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="flex flex-col items-center justify-between gap-2 rounded border-2 border-dashed border-red-400 bg-gray-50 p-2 w-[130px] h-[160px] hover:bg-gray-100"
            >
              <Plus className="h-5 w-5 text-gray-400 mt-1" />
              <span className="text-xs font-semibold text-red-600 text-center leading-tight">
                {box.description}
              </span>
            </button>
            {index < requiredEmptyBoxes.length - 1 && (
              <span className="text-sm font-bold text-gray-500">OR</span>
            )}
          </div>
        ))}

        {/* Add button */}
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="flex items-center justify-center rounded-full bg-blue-600 text-white w-9 h-9 hover:bg-blue-700 self-start mt-1"
          aria-label="Add attachment"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      <UploadFileModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        applicantId={applicantId}
        currentAttachments={rawAttachments ?? []}
        onUploaded={handleUploaded}
        defaultType="Onboarding_Documents"
      />

      <OnboardingGuideModal open={guideOpen} onOpenChange={setGuideOpen} />
    </div>
  );
};

export default UploadID;
