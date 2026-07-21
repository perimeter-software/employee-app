'use client';

import { useState } from 'react';
import { PenLine, CheckCircle2 } from 'lucide-react';
import { Label } from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import { useFileUrl } from '@/lib/hooks/use-file-url';
import { applicantFileKey } from '@/lib/utils/image-url-utils';
import SignatureModal from './SignatureModal';

interface DynamicSignatureFieldProps {
  fieldId: string;
  label?: string;
  readOnly?: boolean;
  /** S3 filename of the chosen signature, or '' when unsigned. */
  value: string;
  onChange: (filename: string) => void;
  applicantId: string;
  shortName: string;
  /** applicant.i9Form.signature filename — offered for one-tap reuse. */
  canonicalSignature?: string;
  applicantFirstName?: string;
  applicantLastName?: string;
}

/**
 * A drawn-signature field for dynamic forms (applicant fill), mirroring the
 * onboarding SignatureModal. The signature is drawn on a canvas, uploaded to
 * S3, and stored as a bare FILENAME (never a typed name) at
 * applicants/<id>/signature/<file>.
 *
 * Reuse: when the field is unsigned but the applicant already has a signature
 * on file (their onboarding/I-9 signature), it's offered for one-tap reuse — a
 * fresh draw goes to a PER-FIELD filename so it never overwrites the canonical
 * signature. The per-field naming (dynsig-<shortName>-<fieldId>) also keeps this
 * extensible to multiple signature roles per document (e.g. employee + supervisor).
 */
const perFieldFileName = (shortName: string, fieldId: string) =>
  `dynsig-${`${shortName}-${fieldId}`.replace(/[^a-zA-Z0-9-_]/g, '-')}.png`;

export default function DynamicSignatureField({
  fieldId,
  label,
  readOnly,
  value,
  onChange,
  applicantId,
  shortName,
  canonicalSignature,
  applicantFirstName,
  applicantLastName,
}: DynamicSignatureFieldProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const fileName = perFieldFileName(shortName, fieldId);
  const hasValue = typeof value === 'string' && value.length > 0;
  const offerFile = !hasValue && canonicalSignature ? canonicalSignature : '';

  const chosenUrl = useFileUrl(
    hasValue ? applicantFileKey(applicantId, 'signature', value) : null
  );
  const offerUrl = useFileUrl(
    offerFile ? applicantFileKey(applicantId, 'signature', offerFile) : null
  );

  const canSign = !readOnly && !!applicantId;

  return (
    <div className="space-y-1">
      {label && <Label>{label}</Label>}

      {hasValue ? (
        // A signature is chosen — show it, allow re-sign / clear.
        <div className="space-y-2 rounded-md border border-gray-300 bg-gray-50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            Signed
          </div>
          <div className="flex items-center justify-center rounded border bg-white p-2">
            {chosenUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={chosenUrl} alt="Signature" className="max-h-24" />
            ) : (
              <div className="flex h-16 items-center text-sm text-gray-400">
                Loading signature…
              </div>
            )}
          </div>
          {canSign && (
            <div className="flex gap-4">
              <button
                type="button"
                className="text-sm font-medium text-blue-600 hover:text-blue-800"
                onClick={() => setModalOpen(true)}
              >
                Re-sign
              </button>
              <button
                type="button"
                className="text-sm text-gray-500 hover:text-gray-700"
                onClick={() => onChange('')}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      ) : offerFile ? (
        // Unsigned, but a signature is on file — offer one-tap reuse or a new draw.
        <div className="space-y-2 rounded-md border border-gray-300 bg-gray-50 p-3">
          <p className="text-xs text-gray-500">
            Use the signature you have on file, or draw a new one.
          </p>
          {offerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={offerUrl}
              alt="Signature on file"
              className="max-h-20 bg-white opacity-90"
            />
          )}
          {canSign && (
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => onChange(canonicalSignature as string)}
              >
                Use this signature
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setModalOpen(true)}
              >
                Draw new
              </Button>
            </div>
          )}
        </div>
      ) : (
        // No signature anywhere — prompt to draw.
        <button
          type="button"
          disabled={!canSign}
          onClick={() => setModalOpen(true)}
          className="flex w-full flex-col items-center gap-1.5 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 py-6 text-sm text-gray-500 transition-colors hover:border-blue-400 hover:bg-blue-50/40 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <PenLine className="h-5 w-5" />
          <span className="font-medium">Add your signature</span>
          <span className="text-xs text-gray-400">Tap to sign</span>
        </button>
      )}

      <SignatureModal
        applicantId={applicantId}
        applicantFirstName={applicantFirstName}
        applicantLastName={applicantLastName}
        existingSignature={hasValue ? value : undefined}
        fileName={fileName}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSignatureSaved={(fn) => onChange(fn)}
      />
    </div>
  );
}
