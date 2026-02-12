'use client';

import React, { useState } from 'react';
import { FormsListHeader, type FormsViewMode } from '@/domains/forms/components/FormsList/FormsListHeader';
import { FormCard } from '@/domains/forms/components/FormsList/FormCard';
import { FormsTable } from '@/domains/forms/components/FormsList/FormsTable';
import Layout from '@/components/layout/Layout';
import { usePageAuth } from '@/domains/shared/hooks/use-page-auth';
import { useFormsList } from '@/domains/forms/hooks/use-forms-list';

export default function FormsPage() {
  usePageAuth({ requireAuth: true });

  const [viewMode, setViewMode] = useState<FormsViewMode>('card');
  const { data: forms = [], isLoading, isError, error } = useFormsList();

  const errorMessage =
    isError && error instanceof Error
      ? error.message
      : isError
      ? 'Failed to load forms'
      : null;

  return (
    <Layout title="Forms" description="Fill out forms for employees">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <FormsListHeader
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading forms...</p>
          </div>
        )}

        {/* Error State */}
        {errorMessage && !isLoading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-800">{errorMessage}</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !errorMessage && forms.length === 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
            <p className="text-gray-600 text-lg">No forms available at this time.</p>
            <p className="text-gray-500 text-sm mt-2">
              Please check back later or contact your administrator.
            </p>
          </div>
        )}

        {/* Forms Content: Card or Table view */}
        {!isLoading && !errorMessage && forms.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-600">
                Showing <span className="font-semibold">{forms.length}</span> form
                {forms.length !== 1 ? 's' : ''}
              </p>
            </div>
            {viewMode === 'card' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {forms.map((form) => (
                  <FormCard key={form._id} form={form} />
                ))}
              </div>
            )}
            {viewMode === 'table' && (
              <FormsTable forms={forms} />
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
