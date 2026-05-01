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
import { getRequiredEmptyBoxes, type AttachmentFile } from '../../utils/attachment-helpers';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';
import UploadFileModal from './UploadFileModal';

const IMAGE_SERVER = process.env.NEXT_PUBLIC_IMAGE_SERVER ?? '';
// Common/shared static assets live at /common on the same image host.
// Mirrors stadium-people's getCommonBaseImageUrl which replaces the uploadPath with /common.
const COMMON_BASE = `${IMAGE_SERVER}/common`;
const IMAGE_EXTS = ['jpeg', 'jpg', 'png', 'bmp', 'gif', 'webp'];

function getExt(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

function getDirectUrl(uploadPath: string, applicantId: string, type: string, filename: string): string {
  return `${IMAGE_SERVER}/${uploadPath}/applicants/${applicantId}/${type}/${filename}`;
}

const OnboardingGuideModal: React.FC<{ open: boolean; onOpenChange: (v: boolean) => void }> = ({
  open,
  onOpenChange,
}) => {
  const pdfUrl = `${COMMON_BASE}/static/i-9%20example%20docs.pdf`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[80vw]">
        <DialogHeader>
          <DialogTitle>Onboarding Documents Upload Guide</DialogTitle>
        </DialogHeader>
        <div className="w-full">
          <object
            data={pdfUrl}
            type="application/pdf"
            className="w-full h-[70vh]"
          >
            <p className="text-sm text-gray-600">
              Unable to display PDF.{' '}
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                Download
              </a>{' '}
              instead.
            </p>
          </object>
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
  uploadPath: string;
  onDelete: () => void;
}

const AttachmentCard: React.FC<AttachmentCardProps> = ({ file, applicantId, uploadPath, onDelete }) => {
  const filename = file.filename ?? file.name ?? '';
  const type = file.type ?? '';
  const ext = file.docType ?? getExt(filename);
  const directUrl = getDirectUrl(uploadPath, applicantId, type, filename);
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
        onClick={() => window.open(directUrl, '_blank')}
        className="flex flex-col items-center gap-1 hover:opacity-75"
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={directUrl}
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
  const { data: company } = usePrimaryCompany();
  const uploadPath = company?.uploadPath ?? 'sp';

  const [uploadOpen, setUploadOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const applicantId = applicant._id ?? '';
  const rawAttachments = applicant.attachments as AttachmentFile[] | undefined;
  const { complete, validIDs = [] } = (
    applicant.onboardingDocsComplete as
      | { complete?: string; validIDs?: string[] }
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

  const requiredEmptyBoxes = useMemo(
    () => getRequiredEmptyBoxes(visibleAttachments),
    [visibleAttachments]
  );

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
            href={`${COMMON_BASE}/static/How%20to%20Compress%20Your%20Images%20for%20Upload.pdf`}
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
            uploadPath={uploadPath}
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
