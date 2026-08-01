'use client';

import React, { useState, useCallback } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { Eye, FileText, File } from 'lucide-react';
import { applicantFileKey } from '@/lib/utils';
import { useFileUrl } from '@/lib/hooks/use-file-url';

interface FileViewerProps {
  file: {
    id?: string;
    _id?: string;
    name: string;
    fileName?: string;
    originalName?: string;
    fileType?: string;
    type?: string;
    uploadedAt?: Date;
    createdAt?: Date;
  };
  currentApplicant?: {
    _id: string;
  };
  onView?: () => void;
  size?: number;
}

const IMAGE_EXTENSIONS = ['jpeg', 'jpg', 'png', 'webp'];

const FileViewer: React.FC<FileViewerProps> = ({
  file,
  currentApplicant,
  onView,
  size = 100,
}) => {
  const [imgError, setImgError] = useState(false);

  // Get file extension from filename
  const getFileExtension = useCallback((filename: string): string => {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  }, []);

  const filename = file.fileName || file.originalName || file.name;
  const fileUrl = useFileUrl(
    currentApplicant?._id
      ? applicantFileKey(currentApplicant._id, file.type || 'document', filename)
      : null
  );

  // Only images get a preview; every other type renders a lucide icon below.
  const isImage = IMAGE_EXTENSIONS.includes(getFileExtension(filename));
  const filePreviewSrc = isImage && !imgError ? fileUrl : null;

  // Handle file opening
  const handleFileOpen = () => {
    if (!fileUrl) return;

    window.open(fileUrl, '_blank');

    // Call optional onView callback
    if (onView) {
      onView();
    }
  };

  const getFileIcon = useCallback(() => {
    const filename = file.fileName || file.originalName || file.name;
    const extension = getFileExtension(filename);

    if (IMAGE_EXTENSIONS.includes(extension)) {
      return <File className="h-4 w-4" />;
    }

    switch (extension) {
      case 'pdf':
        return <FileText className="h-4 w-4 text-red-600" />;
      case 'docx':
      case 'doc':
        return <FileText className="h-4 w-4 text-blue-600" />;
      case 'xlsx':
      case 'xls':
        return <FileText className="h-4 w-4 text-green-600" />;
      default:
        return <File className="h-4 w-4" />;
    }
  }, [file, getFileExtension]);

  return (
    <div className="flex items-center space-x-3">
      {/* File preview/icon */}
      <div className="flex-shrink-0">
        {filePreviewSrc ? (
          <Image
            src={filePreviewSrc}
            alt={`${file.type || 'File'} preview`}
            width={(size / 4) * 16} // Convert rem to pixels (assuming 1rem = 16px)
            height={(size / 4) * 16}
            className="object-cover rounded cursor-pointer border border-gray-200"
            onClick={handleFileOpen}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded border border-gray-200">
            {getFileIcon()}
          </div>
        )}
      </div>

      {/* File details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-900 font-medium truncate">
            {file.name}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFileOpen}
            className="flex-shrink-0"
          >
            <Eye className="w-4 h-4 mr-1" />
            View
          </Button>
        </div>

        {(file.uploadedAt || file.createdAt) && (
          <div className="text-xs text-gray-500 mt-1">
            {new Date(file.uploadedAt || file.createdAt!).toLocaleDateString(
              'en-US',
              {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              }
            )}
          </div>
        )}

        {file.fileName && (
          <div className="text-xs text-gray-500 truncate">{file.fileName}</div>
        )}
      </div>
    </div>
  );
};

export default FileViewer;
