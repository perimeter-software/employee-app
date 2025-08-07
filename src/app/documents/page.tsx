'use client';

import { useUser } from '@auth0/nextjs-auth0/client';
import Layout from '@/components/layout/Layout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { Button } from '@/components/ui/Button/Button';
import { FileText, Search, Plus, ChevronDown, File } from 'lucide-react';
import { NextPage } from 'next';
import { usePageAuth } from '@/domains/shared/hooks/use-page-auth';
import {
  AuthErrorState,
  AuthLoadingState,
  UnauthenticatedState,
} from '@/components/shared/PageProtection';
import { useCurrentUser } from '@/domains/user';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { FileDropzone } from '@/components/ui/FileDropzone/FileDropzone';
import { FileViewer } from '@/components/ui/FileViewer';
import {
  useDocuments,
  useUploadDocument,
  Document as ApiDocument,
} from '@/domains/document';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';

interface DocumentUploadData {
  file: File;
  documentName: string;
  category: string;
  description: string;
}

// Document Upload Modal Component
const DocumentUploadModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: DocumentUploadData) => void;
}> = ({ isOpen, onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    documentName: '',
    category: 'Company Document',
    description: '',
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      alert('Please select a file to upload');
      return;
    }

    onSubmit({
      file: selectedFile,
      documentName: formData.documentName || selectedFile.name,
      category: formData.category,
      description: formData.description,
    });

    // Reset form
    setFormData({
      documentName: '',
      category: 'Company Document',
      description: '',
    });
    setSelectedFile(null);
    onClose();
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add New Document</DialogTitle>
          <DialogDescription>
            Upload a new document to the company document library.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* File Upload Area */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Document File *
            </label>
            <FileDropzone
              value={selectedFile}
              onChange={setSelectedFile}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.gif,.webp"
              maxSize={10 * 1024 * 1024} // 10MB
            />
          </div>

          {/* Document Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Document Name *
            </label>
            <input
              type="text"
              value={formData.documentName}
              onChange={(e) =>
                handleInputChange('documentName', e.target.value)
              }
              placeholder="Enter document name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category *
            </label>
            <Select
              value={formData.category}
              onValueChange={(value) => handleInputChange('category', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Company Document">
                  Company Document
                </SelectItem>
                <SelectItem value="HR Document">HR Document</SelectItem>
                <SelectItem value="Financial Document">
                  Financial Document
                </SelectItem>
                <SelectItem value="Technical Document">
                  Technical Document
                </SelectItem>
                <SelectItem value="Marketing Material">
                  Marketing Material
                </SelectItem>
                <SelectItem value="Legal Document">Legal Document</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Enter document description..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Action Buttons */}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="px-6 py-2 border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white"
              disabled={!selectedFile || !formData.documentName}
            >
              Upload Document
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const DocumentsPage: NextPage = () => {
  const { user, error: authError, isLoading: authLoading } = useUser();
  const { isLoading: userLoading, data: currentUserData } = useCurrentUser();

  // Fetch primary company data for uploadPath
  const { data: primaryCompany } = usePrimaryCompany();

  // Setup image server URL based on environment
  const getImageServerUrl = (): string => {
    if (typeof window === 'undefined') return '';

    const hostname = window.location.hostname;
    if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
      return 'https://images.dev.stadiumpeople.com';
    } else if (hostname.includes('stage')) {
      return 'https://images.stage.stadiumpeople.com';
    } else {
      return 'https://images.stadiumpeople.com';
    }
  };

  const imageServerUrl = getImageServerUrl();

  // Auth check
  const {
    shouldShowContent,
    isLoading: pageAuthLoading,
    error: pageAuthError,
  } = usePageAuth({
    requireAuth: true,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Fetch documents from API
  const {
    data: documentsData,
    isLoading: documentsLoading,
    error: documentsError,
  } = useDocuments();
  const uploadDocument = useUploadDocument();

  // Helper function to get file extension from filename
  const getFileExtension = (filename: string): string => {
    return filename.split('.').pop()?.toLowerCase() || '';
  };

  // Helper function to format date
  const formatDate = (date: Date): { date: string; time: string } => {
    const d = new Date(date);
    return {
      date: d.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      }),
      time: d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
    };
  };

  // Transform API documents to display format
  const documents =
    documentsData?.documents?.map((doc: ApiDocument) => {
      const { date, time } = formatDate((doc.createdAt as Date) || new Date());
      const extension = getFileExtension(doc.fileName || '');

      return {
        id: doc.id || doc._id || '',
        name: doc.name,
        createdDate: date,
        createdTime: time,
        type: `${extension.toUpperCase()} Document`,
        fileIcon: extension,
        originalDoc: doc, // Keep reference to original document data
      };
    }) || [];

  // Handle document upload
  const handleDocumentUpload = async (data: DocumentUploadData) => {
    try {
      const formData = new FormData();
      formData.append('file', data.file);
      formData.append('name', data.documentName);
      formData.append('description', data.description);

      await uploadDocument.mutateAsync(formData);
      setIsUploadModalOpen(false);
    } catch (error) {
      console.error('Failed to upload document:', error);
      // You might want to show a toast notification here
    }
  };

  const fileTypeButtons = [
    {
      type: 'PDF',
      icon: FileText,
      bgColor: 'bg-red-100',
      textColor: 'text-red-700',
      borderColor: 'border-red-200',
    },
    {
      type: 'Docx',
      icon: FileText,
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-700',
      borderColor: 'border-blue-200',
    },
    {
      type: 'Xlsx',
      icon: FileText,
      bgColor: 'bg-green-100',
      textColor: 'text-green-700',
      borderColor: 'border-green-200',
    },
    {
      type: 'Zip',
      icon: File,
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-700',
      borderColor: 'border-gray-200',
    },
    {
      type: 'Html',
      icon: FileText,
      bgColor: 'bg-orange-100',
      textColor: 'text-orange-700',
      borderColor: 'border-orange-200',
    },
    {
      type: 'Txt',
      icon: FileText,
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-700',
      borderColor: 'border-gray-200',
    },
    {
      type: 'Rtf',
      icon: FileText,
      bgColor: 'bg-purple-100',
      textColor: 'text-purple-700',
      borderColor: 'border-purple-200',
    },
    {
      type: 'htm',
      icon: FileText,
      bgColor: 'bg-orange-100',
      textColor: 'text-orange-700',
      borderColor: 'border-orange-200',
    },
    {
      type: 'HTM',
      icon: FileText,
      bgColor: 'bg-orange-100',
      textColor: 'text-orange-700',
      borderColor: 'border-orange-200',
    },
  ];

  // Show loading state
  if (authLoading || userLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
          <p className="text-gray-600 font-medium">Loading documents...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (authError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
            <CardDescription>
              {authError.message || 'Something went wrong'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.reload()} fullWidth>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show not authenticated state
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-yellow-600">
              Authentication Required
            </CardTitle>
            <CardDescription>Please log in to access documents</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              fullWidth
              onClick={() => (window.location.href = '/api/auth/login')}
            >
              Log In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Early returns for auth states (after all hooks are called)
  if (pageAuthLoading || authLoading) {
    return <AuthLoadingState />;
  }

  if (pageAuthError || authError) {
    const errorMessage =
      pageAuthError?.message ||
      (authError && typeof authError === 'object' && 'message' in authError
        ? (authError as { message: string }).message
        : 'Authentication error');
    return <AuthErrorState error={errorMessage} />;
  }

  if (!shouldShowContent) {
    return <UnauthenticatedState />;
  }

  // Handle loading state for documents
  if (documentsLoading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          </div>
          <div className="flex justify-center items-center py-12">
            <div className="text-gray-500">Loading documents...</div>
          </div>
        </div>
      </Layout>
    );
  }

  // Handle error state for documents
  if (documentsError) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          </div>
          <div className="flex justify-center items-center py-12">
            <div className="text-red-500">
              Error loading documents: {documentsError.message}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <Button onClick={() => setIsUploadModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Add New Document
          </Button>
        </div>

        {/* File Type Filters */}
        <div className="flex flex-wrap gap-3">
          {fileTypeButtons.map((fileType) => (
            <Button
              key={fileType.type}
              variant="outline"
              className={`${fileType.bgColor} ${fileType.textColor} ${fileType.borderColor} hover:opacity-80`}
            >
              <fileType.icon className="w-4 h-4 mr-2" />
              {fileType.type}
            </Button>
          ))}
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Documents Table */}
        <Card className="bg-white">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-4 px-6 text-sm font-medium text-gray-600 w-8">
                      #
                    </th>
                    <th className="text-left py-4 px-6 text-sm font-medium text-gray-600">
                      <div className="flex items-center space-x-1">
                        <span>Name</span>
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </th>

                    <th className="text-left py-4 px-6 text-sm font-medium text-gray-600">
                      <div className="flex items-center space-x-1">
                        <span>Created Date</span>
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </th>
                    <th className="text-left py-4 px-6 text-sm font-medium text-gray-600">
                      <div className="flex items-center space-x-1">
                        <span>Type</span>
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </th>
                    {/* <th className="text-left py-4 px-6 text-sm font-medium text-gray-600">
                      Actions
                    </th> */}
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document, index) => (
                    <tr
                      key={document.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-4 px-6 text-sm text-gray-900">
                        {index + 1}
                      </td>
                      <td className="py-4 px-6">
                        <FileViewer
                          file={{
                            id:
                              document.originalDoc.id ||
                              document.originalDoc._id,
                            _id: document.originalDoc._id,
                            name: document.originalDoc.name,
                            fileName: document.originalDoc.fileName,
                            originalName: document.originalDoc.originalName,
                            fileType: document.originalDoc.fileType,
                            type: document.originalDoc.type,
                            uploadedAt: document.originalDoc.uploadedAt,
                            createdAt: document.originalDoc.createdAt,
                          }}
                          currentApplicant={{
                            _id:
                              currentUserData?.applicantId || user?.sub || '',
                          }}
                          imageServer={imageServerUrl}
                          company={{
                            uploadPath: primaryCompany?.uploadPath,
                          }}
                          onView={() => {
                            console.log('Viewing document:', document.name);
                          }}
                          size={60}
                        />
                      </td>

                      <td className="py-4 px-6 text-sm text-gray-900">
                        <div>
                          <div>{document.createdDate}</div>
                          <div className="text-gray-500">
                            {document.createdTime}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-900">
                        {document.type}
                      </td>
                      {/* <td className="py-4 px-6">
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-blue-600 border-blue-200 hover:bg-blue-50"
                          >
                            <Info className="w-4 h-4 mr-1" />
                            Info
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-gray-600 border-gray-200 hover:bg-gray-50"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </td> */}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Document Upload Modal */}
        <DocumentUploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onSubmit={handleDocumentUpload}
        />
      </div>
    </Layout>
  );
};

export default DocumentsPage;
