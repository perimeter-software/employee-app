'use client';

import { NextPage } from 'next';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  Calendar,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Receipt,
  Search,
  Upload,
  Grid3x3,
  Table as TableIcon,
  Calendar as CalendarIcon,
} from 'lucide-react';
import Layout from '@/components/layout/Layout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Input } from '@/components/ui/Input';
import { usePageAuth } from '@/domains/shared/hooks/use-page-auth';
import {
  AuthErrorState,
  AuthLoadingState,
  UnauthenticatedState,
} from '@/components/shared/PageProtection';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';
import { useCurrentUser } from '@/domains/user';
import { usePaycheckStubs } from '@/domains/paycheck-stubs';
import { clsxm } from '@/lib/utils';

// Component that uses useSearchParams - must be wrapped in Suspense
const PaycheckStubsPageContent: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'viewed' | 'unviewed'
  >('all');
  const [viewMode, setViewMode] = useState<'card' | 'table' | 'calendar'>('card');

  // Auth check
  const {
    shouldShowContent,
    isLoading: pageAuthLoading,
    error: pageAuthError,
  } = usePageAuth({
    requireAuth: true,
  });

  // Fetch primary company data to check peoIntegration
  const { data: primaryCompany, isLoading: companyLoading } =
    usePrimaryCompany();

  // Get current user data
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();

  // Get applicantId from current user
  const applicantId = currentUser?.applicantId;

  // Fetch paycheck stubs
  const {
    data: paycheckStubsData,
    isLoading: stubsLoading,
    error: stubsError,
  } = usePaycheckStubs(applicantId);

  const getViewStatusBadge = useCallback((viewStatus: string) => {
    const isViewed = viewStatus === 'viewed';
    return (
      <div
        className={clsxm(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
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
    );
  }, []);

  // Filter and search paycheck stubs
  const filteredPaycheckStubs = useMemo(() => {
    if (!paycheckStubsData?.paycheckStubs) return [];

    let filtered = paycheckStubsData.paycheckStubs;

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((stub) => stub.viewStatus === statusFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (stub) =>
          stub.fileName.toLowerCase().includes(query) ||
          stub.employeeID.toLowerCase().includes(query) ||
          stub.batchId.toLowerCase().includes(query) ||
          stub.voucherNumber.toLowerCase().includes(query) ||
          format(new Date(stub.checkDate), 'MMMM d, yyyy')
            .toLowerCase()
            .includes(query)
      );
    }

    return filtered;
  }, [paycheckStubsData?.paycheckStubs, statusFilter, searchQuery]);

  // Handle redirect from query parameter (for email links)
  useEffect(() => {
    const stubId = searchParams.get('stubId');

    if (stubId && paycheckStubsData?.paycheckStubs) {
      // Find the paycheck stub by ID
      const paystub = paycheckStubsData.paycheckStubs.find(
        (stub) => stub._id === stubId
      );

      if (paystub) {
        // Redirect to dedicated PDF viewing page
        router.replace(`/paycheck-stubs/${stubId}`);
      }
    }
  }, [searchParams, paycheckStubsData?.paycheckStubs, router]);

  // Show loading state
  if (pageAuthLoading || companyLoading || userLoading) {
    return <AuthLoadingState />;
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

  // If not Prism, show message that this feature is not available
  if (!isPrism) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Paycheck Stubs</CardTitle>
              <CardDescription>
                This feature is not available for your company.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Paycheck stubs are only available for companies using Prism
                integration.
              </p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const paycheckStubs = paycheckStubsData?.paycheckStubs || [];
  const totalCount = paycheckStubs.length;
  const viewedCount = paycheckStubs.filter(
    (s) => s.viewStatus === 'viewed'
  ).length;
  const unviewedCount = totalCount - viewedCount;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Header Section */}
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Paycheck Stubs</h1>
            <p className="text-gray-600 mt-2">
              Access and manage your paycheck stubs
            </p>
          </div>

          {/* Stats Cards */}
          {!stubsLoading && !stubsError && totalCount > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">
                        Total Stubs
                      </p>
                      <p className="text-xl font-bold text-gray-900 mt-1">
                        {totalCount}
                      </p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <Receipt className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">
                        Viewed
                      </p>
                      <p className="text-xl font-bold text-gray-900 mt-1">
                        {viewedCount}
                      </p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg">
                      <Eye className="w-6 h-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-red-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">
                        Not Viewed
                      </p>
                      <p className="text-xl font-bold text-gray-900 mt-1">
                        {unviewedCount}
                      </p>
                    </div>
                    <div className="p-3 bg-red-50 rounded-lg">
                      <EyeOff className="w-6 h-6 text-red-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Search and Filter Bar */}
          {!stubsLoading && !stubsError && totalCount > 0 && (
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  type="text"
                  placeholder="Search by filename, employee ID, batch ID, voucher number, or date..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-11"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={statusFilter === 'all' ? 'primary' : 'outline'}
                  onClick={() => setStatusFilter('all')}
                  className="h-11"
                >
                  All
                </Button>
                <Button
                  variant={statusFilter === 'viewed' ? 'primary' : 'outline'}
                  onClick={() => setStatusFilter('viewed')}
                  className="h-11"
                  leftIcon={<Eye className="w-4 h-4" />}
                >
                  Viewed
                </Button>
                <Button
                  variant={statusFilter === 'unviewed' ? 'primary' : 'outline'}
                  onClick={() => setStatusFilter('unviewed')}
                  className="h-11"
                  leftIcon={<EyeOff className="w-4 h-4" />}
                >
                  Not Viewed
                </Button>
              </div>
              {/* View Mode Toggle */}
              <div className="flex gap-2 border border-gray-200 rounded-lg p-1">
                <Button
                  variant={viewMode === 'card' ? 'primary' : 'ghost'}
                  onClick={() => setViewMode('card')}
                  className="h-9 px-3"
                  size="sm"
                  leftIcon={<Grid3x3 className="w-4 h-4" />}
                >
                  Card
                </Button>
                <Button
                  variant={viewMode === 'table' ? 'primary' : 'ghost'}
                  onClick={() => setViewMode('table')}
                  className="h-9 px-3"
                  size="sm"
                  leftIcon={<TableIcon className="w-4 h-4" />}
                >
                  Table
                </Button>
                <Button
                  variant={viewMode === 'calendar' ? 'primary' : 'ghost'}
                  onClick={() => setViewMode('calendar')}
                  className="h-9 px-3"
                  size="sm"
                  leftIcon={<CalendarIcon className="w-4 h-4" />}
                >
                  Calendar
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Loading State */}
        {stubsLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <Skeleton className="w-12 h-12 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between">
                    <Skeleton className="h-16 w-24" />
                    <Skeleton className="h-16 w-24" />
                  </div>
                  <Skeleton className="h-10 w-full rounded-md" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Error State */}
        {stubsError && (
          <Card>
            <CardHeader>
              <CardTitle className="text-errorRed">Error</CardTitle>
              <CardDescription>
                Failed to load paycheck stubs. Please try again later.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                {stubsError instanceof Error
                  ? stubsError.message
                  : 'An unknown error occurred'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Paycheck Stubs Grid */}
        {!stubsLoading && !stubsError && (
          <>
            {paycheckStubs.length === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="p-4 bg-gray-100 rounded-full mb-4">
                    <Receipt className="w-12 h-12 text-gray-400" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-2">
                    No Paycheck Stubs Available
                  </h3>
                  <p className="text-gray-500 text-center max-w-md">
                    Your paycheck stubs will appear here once they are
                    available.
                  </p>
                </CardContent>
              </Card>
            ) : filteredPaycheckStubs.length === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="p-4 bg-gray-100 rounded-full mb-4">
                    <Search className="w-12 h-12 text-gray-400" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-2">
                    No Results Found
                  </h3>
                  <p className="text-gray-500 text-center max-w-md">
                    Try adjusting your search or filter criteria.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                    }}
                    className="mt-4"
                  >
                    Clear Filters
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Results Count */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    Showing{' '}
                    <span className="font-semibold">
                      {filteredPaycheckStubs.length}
                    </span>{' '}
                    of <span className="font-semibold">{totalCount}</span>{' '}
                    paycheck stubs
                  </p>
                </div>

                {/* Paycheck Stubs Views */}
                <div className="max-h-[calc(100vh-30rem)] overflow-y-auto pr-2">
                  {viewMode === 'card' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {filteredPaycheckStubs.map((paystub) => {
                      const isViewed = paystub.viewStatus === 'viewed';
                      return (
                        <Card
                          key={paystub._id}
                          className={clsxm(
                            'group relative overflow-hidden transition-all duration-300',
                            'hover:shadow-xl hover:-translate-y-1',
                            'border-2',
                            isViewed
                              ? 'border-gray-200 hover:border-gray-300'
                              : 'border-blue-200 hover:border-blue-300 bg-blue-50/30'
                          )}
                        >
                          {/* Status Indicator Bar */}
                          {!isViewed && (
                            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-blue-400" />
                          )}

                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                <div
                                  className={clsxm(
                                    'p-3 rounded-xl flex-shrink-0',
                                    isViewed
                                      ? 'bg-gray-100 group-hover:bg-gray-200'
                                      : 'bg-blue-100 group-hover:bg-blue-200'
                                  )}
                                >
                                  <FileText
                                    className={clsxm(
                                      'w-6 h-6',
                                      isViewed
                                        ? 'text-gray-600'
                                        : 'text-blue-600'
                                    )}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <CardTitle className="text-xs font-semibold text-gray-900 line-clamp-2 mb-1.5">
                                    {paystub.fileName}
                                  </CardTitle>
                                  <div className="flex flex-col gap-1 text-gray-500">
                                    <div className="flex items-center gap-1.5">
                                      <Upload className="w-3.5 h-3.5 flex-shrink-0" />
                                      <span className="text-xs">
                                        <span className="font-medium">
                                          Uploaded:
                                        </span>{' '}
                                        {format(
                                          new Date(paystub.uploadedAt),
                                          'MMM d, yyyy'
                                        )}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                                      <span className="text-xs">
                                        <span className="font-medium">
                                          Check Date:
                                        </span>{' '}
                                        {format(
                                          new Date(paystub.checkDate),
                                          'MMM d, yyyy'
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex-shrink-0">
                                {getViewStatusBadge(paystub.viewStatus)}
                              </div>
                            </div>
                          </CardHeader>

                          <CardContent className="space-y-4">
                            {/* Employee, Batch, and Voucher Info */}
                            <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
                              <div>
                                <p className="text-xs font-medium text-gray-500 mb-1">
                                  Batch ID
                                </p>
                                <p className="text-xs font-semibold text-gray-900 break-all">
                                  {paystub.batchId}
                                </p>
                              </div>
                              <div className="col-span-2">
                                <p className="text-xs font-medium text-gray-500 mb-1">
                                  Voucher Number
                                </p>
                                <p className="text-xs font-semibold text-gray-900">
                                  {paystub.voucherNumber}
                                </p>
                              </div>
                            </div>

                            {/* View PDF Button */}
                            <Button
                              onClick={() =>
                                router.push(`/paycheck-stubs/${paystub._id}`)
                              }
                              className="w-full h-11 font-medium"
                              variant={isViewed ? 'primary' : 'primary'}
                              leftIcon={<FileText className="w-4 h-4" />}
                              rightIcon={<ChevronRight className="w-4 h-4" />}
                            >
                              View PDF
                            </Button>
                          </CardContent>
                        </Card>
                      );
                      })}
                    </div>
                  )}

                  {viewMode === 'table' && (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50">
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              File Name
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Check Date
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Uploaded
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Batch ID
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Voucher Number
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Status
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredPaycheckStubs.map((paystub) => {
                            const isViewed = paystub.viewStatus === 'viewed';
                            return (
                              <tr
                                key={paystub._id}
                                className={clsxm(
                                  'hover:bg-gray-50 transition-colors',
                                  !isViewed && 'bg-blue-50/30'
                                )}
                              >
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-gray-400" />
                                    <span className="text-sm font-medium text-gray-900">
                                      {paystub.fileName}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                  {format(new Date(paystub.checkDate), 'MMM d, yyyy')}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                  {format(new Date(paystub.uploadedAt), 'MMM d, yyyy')}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 font-mono">
                                  {paystub.batchId}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                  {paystub.voucherNumber}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {getViewStatusBadge(paystub.viewStatus)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <Button
                                    onClick={() =>
                                      router.push(`/paycheck-stubs/${paystub._id}`)
                                    }
                                    variant="primary"
                                    size="sm"
                                    leftIcon={<FileText className="w-4 h-4" />}
                                  >
                                    View
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {viewMode === 'calendar' && (
                    <div className="space-y-4">
                      {/* Group stubs by month */}
                      {(() => {
                        const groupedByMonth = filteredPaycheckStubs.reduce(
                          (acc, stub) => {
                            const monthKey = format(
                              new Date(stub.checkDate),
                              'MMMM yyyy'
                            );
                            if (!acc[monthKey]) {
                              acc[monthKey] = [];
                            }
                            acc[monthKey].push(stub);
                            return acc;
                          },
                          {} as Record<string, typeof filteredPaycheckStubs>
                        );

                        return Object.entries(groupedByMonth)
                          .sort((a, b) => {
                            const dateA = new Date(a[0]);
                            const dateB = new Date(b[0]);
                            return dateB.getTime() - dateA.getTime();
                          })
                          .map(([month, stubs]) => (
                            <Card key={month} className="overflow-hidden">
                              <CardHeader className="bg-gray-50 border-b">
                                <CardTitle className="text-lg">
                                  {month}
                                </CardTitle>
                                <CardDescription>
                                  {stubs.length} paycheck stub{stubs.length !== 1 ? 's' : ''}
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="p-0">
                                <div className="divide-y divide-gray-200">
                                  {stubs
                                    .sort(
                                      (a, b) =>
                                        new Date(b.checkDate).getTime() -
                                        new Date(a.checkDate).getTime()
                                    )
                                    .map((paystub) => {
                                      const isViewed =
                                        paystub.viewStatus === 'viewed';
                                      return (
                                        <div
                                          key={paystub._id}
                                          className={clsxm(
                                            'p-4 hover:bg-gray-50 transition-colors',
                                            !isViewed && 'bg-blue-50/30'
                                          )}
                                        >
                                          <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                              <div
                                                className={clsxm(
                                                  'p-2 rounded-lg flex-shrink-0',
                                                  isViewed
                                                    ? 'bg-gray-100'
                                                    : 'bg-blue-100'
                                                )}
                                              >
                                                <Calendar
                                                  className={clsxm(
                                                    'w-5 h-5',
                                                    isViewed
                                                      ? 'text-gray-600'
                                                      : 'text-blue-600'
                                                  )}
                                                />
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                  <p className="text-sm font-semibold text-gray-900 truncate">
                                                    {paystub.fileName}
                                                  </p>
                                                  {getViewStatusBadge(
                                                    paystub.viewStatus
                                                  )}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
                                                  <span>
                                                    <span className="font-medium">
                                                      Check Date:
                                                    </span>{' '}
                                                    {format(
                                                      new Date(paystub.checkDate),
                                                      'MMM d, yyyy'
                                                    )}
                                                  </span>
                                                  <span>
                                                    <span className="font-medium">
                                                      Batch:
                                                    </span>{' '}
                                                    {paystub.batchId}
                                                  </span>
                                                  <span>
                                                    <span className="font-medium">
                                                      Voucher:
                                                    </span>{' '}
                                                    {paystub.voucherNumber}
                                                  </span>
                                                </div>
                                              </div>
                                            </div>
                                            <Button
                                              onClick={() =>
                                                router.push(
                                                  `/paycheck-stubs/${paystub._id}`
                                                )
                                              }
                                              variant="primary"
                                              size="sm"
                                              leftIcon={
                                                <FileText className="w-4 h-4" />
                                              }
                                            >
                                              View PDF
                                            </Button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              </CardContent>
                            </Card>
                          ));
                      })()}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

// Main page component with Suspense boundary
const PaycheckStubsPage: NextPage = () => {
  return (
    <Suspense
      fallback={
        <Layout>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <Skeleton className="w-12 h-12 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-5 w-3/4" />
                          <Skeleton className="h-4 w-1/2" />
                        </div>
                      </div>
                      <Skeleton className="h-6 w-16 rounded-full" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between">
                      <Skeleton className="h-16 w-24" />
                      <Skeleton className="h-16 w-24" />
                    </div>
                    <Skeleton className="h-10 w-full rounded-md" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </Layout>
      }
    >
      <PaycheckStubsPageContent />
    </Suspense>
  );
};

export default PaycheckStubsPage;
