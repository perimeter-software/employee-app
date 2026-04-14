'use client';

// Structural port of stadium-people UploadID. Full source uses a file dropzone to
// upload identity documents (List A / List B+C combinations) to S3 and records URLs
// on the applicant. This port shows the list of existing uploads and uses the
// employee-app FileDropzone for new uploads; wire the upload endpoint separately.
import { useEffect } from 'react';
import { useNewApplicantContext } from '../../state/new-applicant-context';
import { StubBanner } from './_StepScaffold';
import { FileDropzone } from '@/components/ui/FileDropzone/FileDropzone';

const UploadID: React.FC = () => {
  const { applicant, updateButtons, updateCurrentFormState, submitRef } = useNewApplicantContext();
  const uploads =
    (applicant?.idUploads as Array<{ name?: string; url?: string }> | undefined) ?? [];

  useEffect(() => {
    updateCurrentFormState({ isDirty: false });
    updateButtons({
      previous: { show: true, disabled: false },
      next: { show: true, disabled: false },
      submit: { show: false, disabled: true },
    });
    submitRef.current = null;
  }, [updateButtons, updateCurrentFormState, submitRef]);

  return (
    <div className="space-y-4">
      <StubBanner note="S3 upload endpoint wiring pending; existing uploads are read-only below." />
      <FileDropzone
        onDrop={() => {
          /* TODO: POST to upload endpoint, then PUT applicant.idUploads */
        }}
      />
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Uploaded Documents</h3>
        {uploads.length === 0 && <p className="text-xs text-gray-500">None yet.</p>}
        <ul className="divide-y divide-gray-100 text-sm">
          {uploads.map((u, i) => (
            <li key={i} className="py-2">
              {u.url ? (
                <a className="text-blue-600 hover:underline" href={u.url} target="_blank" rel="noreferrer">
                  {u.name ?? u.url}
                </a>
              ) : (
                u.name ?? '—'
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default UploadID;
