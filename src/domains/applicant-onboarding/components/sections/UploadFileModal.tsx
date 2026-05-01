'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { FileDropzone } from '@/components/ui/FileDropzone';
import type { AttachmentFile } from '../../utils/attachment-helpers';

const MAX_FILE_SIZE_DEFAULT = 3 * 1024 * 1024;
const MAX_FILE_SIZE_OTHER = 10 * 1024 * 1024;

interface UploadFileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicantId: string;
  currentAttachments: AttachmentFile[];
  onUploaded: (updatedAttachments: AttachmentFile[]) => Promise<void>;
  defaultType?: string;
}

const UploadFileModal: React.FC<UploadFileModalProps> = ({
  open,
  onOpenChange,
  applicantId,
  currentAttachments,
  onUploaded,
  defaultType,
}) => {
  const [attachmentTypes, setAttachmentTypes] = useState<string[]>([]);
  const [attachmentType, setAttachmentType] = useState<string>('');
  const [attachmentTitle, setAttachmentTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    axios
      .get('/api/applicant-onboarding/dropdowns/attachmentTypes')
      .then((res) => {
        const types = res.data?.data?.arrayValue ?? res.data?.data ?? res.data;
        if (Array.isArray(types)) {
          setAttachmentTypes(types);
          if (defaultType && types.includes(defaultType)) {
            setAttachmentType(defaultType);
          }
        }
      })
      .catch(() => {});
  }, [open, defaultType]);

  const handleClose = () => {
    setAttachmentType('');
    setAttachmentTitle('');
    setFile(null);
    onOpenChange(false);
  };

  const handleUpload = async () => {
    if (!attachmentType) {
      toast.error('Please select an Attachment Type');
      return;
    }
    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }

    const maxSize = attachmentType === 'Other' ? MAX_FILE_SIZE_OTHER : MAX_FILE_SIZE_DEFAULT;
    if (file.size > maxSize) {
      toast.error(
        `File size too large. Maximum is ${attachmentType === 'Other' ? '10MB' : '3MB'}.`
      );
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);

      const uploadRes = await axios.post(
        `/api/applicant-onboarding/applicants/${applicantId}/upload/${attachmentType}`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      const fileExt = file.name.split('.').pop() ?? '';
      let newAtt: AttachmentFile = {
        title: attachmentTitle || file.name,
        type: attachmentType,
        docType: fileExt,
        filename: file.name,
        name: file.name,
        uploadDate: new Date().toISOString(),
      };

      if (uploadRes.data?.recognition) {
        newAtt = { ...newAtt, ...uploadRes.data };
      }

      const updatedAttachments = [...currentAttachments, newAtt];
      await onUploaded(updatedAttachments);
      toast.success('Attachment has been uploaded!');
      handleClose();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
      if (e.response?.status === 413) {
        toast.error('File size too large. Please choose a smaller file.');
      } else if (e.response?.status === 415) {
        toast.error('Invalid file type. Please choose a different file.');
      } else {
        toast.error(e.response?.data?.message ?? 'Failed to upload file. Please try again.');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload File</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Attachment Type</Label>
            <Select value={attachmentType} onValueChange={setAttachmentType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type…" />
              </SelectTrigger>
              <SelectContent>
                {attachmentTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Name or Title (optional)</Label>
            <Input
              value={attachmentTitle}
              onChange={(e) => setAttachmentTitle(e.target.value)}
              placeholder="Defaults to filename"
              disabled={uploading}
            />
          </div>

          <div
            onClick={() => {
              if (!attachmentType) toast.error('You need to select an Attachment Type first');
            }}
          >
            <FileDropzone
              value={file}
              onChange={setFile}
              disabled={!attachmentType || uploading}
              accept=".pdf,.txt,.png,.bmp,.jpeg,.jpg,.doc,.docx"
              maxSize={attachmentType === 'Other' ? MAX_FILE_SIZE_OTHER : MAX_FILE_SIZE_DEFAULT}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={uploading || !attachmentType || !file}>
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UploadFileModal;
