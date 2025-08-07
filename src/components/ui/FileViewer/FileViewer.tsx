'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { Eye, FileText, File } from 'lucide-react';

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
  imageServer?: string;
  company?: {
    uploadPath?: string;
  };
  onView?: () => void;
  size?: number;
}

const IMAGE_EXTENSIONS = ['jpeg', 'jpg', 'png', 'webp'];

const FileViewer: React.FC<FileViewerProps> = ({
  file,
  currentApplicant,
  imageServer,
  company,
  onView,
  size = 100,
}) => {
  const [usePresigned, setUsePresigned] = useState(true);
  const [filePreviewSrc, setFilePreviewSrc] = useState<string | null>(null);

  // Get file extension from filename
  const getFileExtension = useCallback((filename: string): string => {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  }, []);

  // Generate direct URL for the file
  const getDirectUrl = useCallback(() => {
    if (!imageServer || !currentApplicant?._id) return null;
    
    const filename = file.fileName || file.originalName || file.name;
    const fileType = file.type || 'document';
    
    // Use company uploadPath if available, fallback to 'sp'
    const uploadPath = company?.uploadPath || 'sp';
    
    return `${imageServer}/${uploadPath}/applicants/${currentApplicant._id}/${fileType}/${filename}`;
  }, [imageServer, currentApplicant, file, company]);

  // Get base URL for icon images
  const getBaseImageUrl = useCallback(() => {
    if (!imageServer) return '';
    
    // Extract domain from imageServer and create base URL for static assets
    try {
      const url = new URL(imageServer);
      return `${url.protocol}//${url.hostname}`;
    } catch {
      return imageServer;
    }
  }, [imageServer]);

  // Determine file preview source
  const determineFilePreviewSrc = useCallback((): string | null => {
    const filename = file.fileName || file.originalName || file.name;
    const extension = getFileExtension(filename);
    
    if (IMAGE_EXTENSIONS.includes(extension)) {
      // For images, use direct URL
      return getDirectUrl();
    }

    // For non-image files, show appropriate icon
    const baseUrl = getBaseImageUrl();
    
    switch (extension) {
      case 'pdf':
        return `${baseUrl}/static/pdf-icon.png`;
      case 'docx':
      case 'doc':
        return `${baseUrl}/static/word-icon.png`;
      case 'xlsx':
      case 'xls':
        return `${baseUrl}/static/excel_icon.png`;
      default:
        return null;
    }
  }, [file, getFileExtension, getDirectUrl, getBaseImageUrl]);

  // Handle file opening
  const handleFileOpen = () => {
    const directUrl = getDirectUrl();
    
    if (!directUrl) {
      console.error('Could not generate file URL');
      return;
    }

    if (usePresigned) {
      // For now, just open the direct URL
      // In a real implementation, you might have presigned URLs
      window.open(directUrl, '_blank');
    } else {
      window.open(directUrl, '_blank');
    }

    // Call optional onView callback
    if (onView) {
      onView();
    }
  };

  // Set preview source on mount or when dependencies change
  useEffect(() => {
    const src = determineFilePreviewSrc();
    setFilePreviewSrc(src);
  }, [determineFilePreviewSrc]);

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
        {filePreviewSrc && IMAGE_EXTENSIONS.includes(getFileExtension(file.fileName || file.originalName || file.name)) ? (
          <Image
            src={filePreviewSrc}
            alt={`${file.type || 'File'} preview`}
            width={size/4 * 16} // Convert rem to pixels (assuming 1rem = 16px)
            height={size/4 * 16}
            className="object-cover rounded cursor-pointer border border-gray-200"
            onClick={handleFileOpen}
            onError={() => setUsePresigned(false)}
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
            {new Date(file.uploadedAt || file.createdAt!).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </div>
        )}
        
        {file.fileName && (
          <div className="text-xs text-gray-500 truncate">
            {file.fileName}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileViewer;
