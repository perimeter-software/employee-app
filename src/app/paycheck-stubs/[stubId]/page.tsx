'use client';

import { NextPage } from 'next';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Download,
  FileText,
  Calendar,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Upload,
} from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePageAuth } from '@/domains/shared/hooks/use-page-auth';
import {
  AuthErrorState,
  UnauthenticatedState,
} from '@/components/shared/PageProtection';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';
import { useCurrentUser } from '@/domains/user';
import {
  usePaycheckStubs,
  useGetPaycheckStubPresignedUrl,
  useUpdatePaycheckStubViewStatus,
} from '@/domains/paycheck-stubs';
import { clsxm } from '@/lib/utils';

const PaycheckStubViewPage: NextPage = () => {
  const params = useParams();
  const router = useRouter();
  const stubId = params?.stubId as string;

  const [pdfLoadError, setPdfLoadError] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(true);
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);

  // Auth check
  const {
    shouldShowContent,
    isLoading: pageAuthLoading,
    error: pageAuthError,
  } = usePageAuth({
    requireAuth: true,
  });

  // Fetch primary company data to check peoIntegration
  const { data: primaryCompany, isLoading: companyLoading } = usePrimaryCompany();

  // Get current user data
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();

  // Get applicantId from current user
  const applicantId = currentUser?.applicantId;

  // Fetch paycheck stubs
  const {
    data: paycheckStubsData,
    isLoading: stubsLoading,
  } = usePaycheckStubs(applicantId);

  // Mutation to get pre-signed URL
  const getPresignedUrlMutation = useGetPaycheckStubPresignedUrl();

  // Mutation to update view status
  const updateViewStatusMutation = useUpdatePaycheckStubViewStatus();

  // Check if current user is the applicant themselves
  const isApplicantViewing =
    currentUser?.applicantId === applicantId ||
    currentUser?._id === applicantId;

  // Find the specific paycheck stub
  const paystub = paycheckStubsData?.paycheckStubs?.find(
    (stub) => stub._id === stubId
  );

  // Fetch pre-signed URL when paystub is found
  useEffect(() => {
    if (paystub && applicantId && stubId && !presignedUrl) {
      setIsPdfLoading(true);
      getPresignedUrlMutation.mutate(
        {
          applicantId,
          stubId,
        },
        {
          onSuccess: (data) => {
            setPresignedUrl(data.presignedUrl);
            setIsPdfLoading(false);
          },
          onError: () => {
            setPdfLoadError(true);
            setIsPdfLoading(false);
          },
        }
      );
    }
  }, [paystub, applicantId, stubId, presignedUrl]);

  // Update view status when PDF is viewed
  useEffect(() => {
    if (
      paystub &&
      isApplicantViewing &&
      paystub.viewStatus === 'unviewed' &&
      applicantId &&
      !isPdfLoading &&
      presignedUrl
    ) {
      updateViewStatusMutation.mutate({
        applicantId,
        stubId: paystub._id,
        viewStatus: 'viewed',
      });
    }
  }, [
    paystub,
    isApplicantViewing,
    applicantId,
    updateViewStatusMutation,
    isPdfLoading,
    presignedUrl,
  ]);

  const handleDownload = useCallback(() => {
    if (presignedUrl) {
      window.open(presignedUrl, '_blank');
    } else if (paystub?.fileUrl) {
      // Fallback to fileUrl if presigned URL not available
      window.open(paystub.fileUrl, '_blank');
    }
  }, [presignedUrl, paystub]);

  const handleBack = useCallback(() => {
    router.push('/paycheck-stubs');
  }, [router]);

  const handlePdfLoad = useCallback(() => {
    setIsPdfLoading(false);
    setPdfLoadError(false);
  }, []);

  const handlePdfError = useCallback(() => {
    setIsPdfLoading(false);
    setPdfLoadError(true);
  }, []);

  // Show loading state
  if (pageAuthLoading || companyLoading || userLoading || stubsLoading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="space-y-4">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </Layout>
    );
  }

  // Show error state
  if (pageAuthError) {
    return <AuthErrorState error={pageAuthError.message} />;
  }

  // Show not authenticated state
  if (!shouldShowContent) {
    return <UnauthenticatedState />;
  }

  // Check if peoIntegration is Prism
  const isPrism = primaryCompany?.peoIntegration === 'Prism';

  // If not Prism, redirect to paycheck stubs page
  if (!isPrism) {
    router.push('/paycheck-stubs');
    return null;
  }

  // If stub not found
  if (!stubId || (!stubsLoading && !paystub)) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Card className="border-2 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <AlertCircle className="w-16 h-16 text-gray-400 mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Paycheck Stub Not Found
              </h2>
              <p className="text-gray-500 text-center mb-6">
                The paycheck stub you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
              </p>
              <Button onClick={handleBack} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                Back to Paycheck Stubs
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const isViewed = paystub?.viewStatus === 'viewed';

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col h-[calc(100vh-11rem)] max-h-[calc(100vh-11rem)] overflow-hidden">
        {/* Header Section */}
        <div className="mb-4 flex-shrink-0">
          {/* Back Button and Title */}
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
              className="text-gray-600 hover:text-gray-900"
            >
              Back to All Stubs
            </Button>
            <div className="h-6 w-px bg-gray-300" />
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">
                Paycheck Stub
              </h1>
            </div>
          </div>

          {/* Stub Info Card */}
          {paystub && (
            <Card className="bg-gray-50 border-gray-200">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="p-3 bg-white rounded-lg shadow-sm">
                      <FileText className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-semibold text-gray-900 mb-1 truncate">
                        {paystub.fileName}
                      </h2>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1.5">
                          <Upload className="w-4 h-4" />
                          <span>
                            <span className="font-medium">Uploaded:</span>{' '}
                            {format(new Date(paystub.uploadedAt), 'MMM d, yyyy')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" />
                          <span>
                            <span className="font-medium">Check Date:</span>{' '}
                            {format(new Date(paystub.checkDate), 'MMM d, yyyy')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Batch ID:</span>
                          <span className="break-all">{paystub.batchId}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Voucher Number:</span>
                          <span>{paystub.voucherNumber}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className={clsxm(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
                        isViewed
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      )}
                    >
                      {isViewed ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5" />
                      )}
                      <span>{isViewed ? 'Viewed' : 'Not Viewed'}</span>
                    </div>
                    <Button
                      onClick={handleDownload}
                      leftIcon={<Download className="w-4 h-4" />}
                      className="whitespace-nowrap"
                      disabled={!presignedUrl && !paystub?.fileUrl}
                    >
                      Download
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* PDF Viewer Section */}
        <Card className="overflow-hidden flex-1 flex flex-col min-h-0">
          <CardContent className="p-0 flex-1 flex flex-col min-h-0">
            <div className="relative bg-gray-100 flex-1 flex flex-col min-h-0">
              {isPdfLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
                    <p className="text-sm text-gray-600">Loading PDF...</p>
                  </div>
                </div>
              )}

              {pdfLoadError ? (
                <div className="flex items-center justify-center flex-1 p-8">
                  <div className="text-center max-w-md">
                    <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Failed to Load PDF
                    </h3>
                    <p className="text-gray-600 mb-6">
                      We couldn&apos;t load the PDF file. Please try downloading it instead.
                    </p>
                    <Button onClick={handleDownload} leftIcon={<Download className="w-4 h-4" />}>
                      Download PDF
                    </Button>
                  </div>
                </div>
              ) : (
                presignedUrl && (
                  <div className="relative w-full flex-1 flex flex-col min-h-0">
                    <iframe
                      src={presignedUrl}
                      className={clsxm(
                        'w-full flex-1 border-0',
                        isPdfLoading ? 'hidden' : 'block'
                      )}
                      title={`Paycheck Stub - ${paystub?.fileName || 'PDF'}`}
                      onLoad={handlePdfLoad}
                      onError={handlePdfError}
                    />
                    {isPdfLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white">
                        <div className="text-center">
                          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
                          <p className="text-sm text-gray-600">Loading PDF...</p>
                        </div>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default PaycheckStubViewPage;

