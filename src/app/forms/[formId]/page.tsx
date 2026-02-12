'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FormRenderer } from '@/domains/forms/components/FormRenderer/FormRenderer';
import { EmployeeSelector } from '@/domains/forms/components/EmployeeSelector/EmployeeSelector';
import { FormActions } from '@/domains/forms/components/FormActions/FormActions';
import { useFormData } from '@/domains/forms/hooks/useFormData';
import { useFormSubmission } from '@/domains/forms/hooks/useFormSubmission';
import { useForm } from '@/domains/forms/hooks/use-form';
import { useFormWithEmployeeData } from '@/domains/forms/hooks/use-form-with-employee-data';
import { getAllFieldsFromSections } from '@/domains/forms/utils/formMapper';
import Layout from '@/components/layout/Layout';
import { usePageAuth } from '@/domains/shared/hooks/use-page-auth';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button/Button';

export default function FormFillerPage() {
  const params = useParams();
  const router = useRouter();
  const formId = params.formId as string;

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  usePageAuth({ requireAuth: true });

  const { data: form, isLoading: isLoadingForm, isError: isFormError, error: formError } = useForm(formId);
  const {
    data: employeeData,
    isLoading: isLoadingEmployee,
    isError: isEmployeeDataError,
    error: employeeDataError,
  } = useFormWithEmployeeData(formId, selectedEmployeeId ?? undefined);

  const fields = form ? getAllFieldsFromSections(form.formData?.form?.sections || []) : [];

  // Stable empty object so useFormData's effect doesn't run every render when no employee data
  const emptyPreFilled = useMemo(() => ({}), []);

  const {
    formValues,
    errors,
    setFieldValue,
    setFormValues,
    validateAllFields,
    resetDirty,
  } = useFormData({
    initialValues: employeeData?.preFilledValues ?? emptyPreFilled,
    fields,
  });

  // Sync form values and draft metadata when employee data loads or changes
  useEffect(() => {
    if (employeeData?.preFilledValues) {
      setFormValues(employeeData.preFilledValues);
      if (employeeData.existingResponse?._metadata?.lastSavedAt) {
        setLastSavedAt(new Date(employeeData.existingResponse._metadata.lastSavedAt));
      }
    }
  }, [employeeData, setFormValues]);

  const handleDraftSaved = useCallback(() => {
    setLastSavedAt(new Date());
    resetDirty();
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  }, [resetDirty]);

  const handleSubmitSuccess = useCallback(() => {
    alert('Form submitted successfully!');
    router.push('/forms');
  }, [router]);

  const { isSaving, isSubmitting, error: submissionError, saveDraft, submitForm } = useFormSubmission({
    formId,
    employeeId: selectedEmployeeId || '',
    onDraftSaved: handleDraftSaved,
    onSubmitSuccess: handleSubmitSuccess,
  });

  const handleEmployeeSelect = useCallback((employeeId: string) => {
    setSelectedEmployeeId(employeeId);
  }, []);

  const handleSaveDraft = useCallback(async () => {
    if (!selectedEmployeeId) {
      alert('Please select an employee first');
      return;
    }
    await saveDraft(formValues);
  }, [selectedEmployeeId, formValues, saveDraft]);

  const handleSubmit = useCallback(async () => {
    if (!selectedEmployeeId) {
      alert('Please select an employee first');
      return;
    }
    const validationResult = validateAllFields(true);
    if (!validationResult.isValid) {
      alert('Please fix the validation errors before submitting');
      return;
    }
    await submitForm(formValues);
  }, [selectedEmployeeId, formValues, validateAllFields, submitForm]);

  const errorMessage =
    (isFormError && formError instanceof Error ? formError.message : null) ||
    (isEmployeeDataError && employeeDataError instanceof Error ? employeeDataError.message : null);

  return (
    <Layout title={form?.name || 'Fill Form'} description="Fill out a form for an employee">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/forms">
          <Button variant="ghost" className="mb-6 flex items-center space-x-2">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Forms</span>
          </Button>
        </Link>

        {isLoadingForm && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading form...</p>
          </div>
        )}

        {errorMessage && !isLoadingForm && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-red-800">Error</h3>
                <p className="text-red-700">{errorMessage}</p>
              </div>
            </div>
          </div>
        )}

        {!isLoadingForm && !errorMessage && form && (
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h1 className="text-2xl font-bold text-gray-900">{form.name}</h1>
              {form.formData?.form?.subtitle && (
                <p className="mt-2 text-gray-600">{form.formData.form.subtitle}</p>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <EmployeeSelector
                selectedEmployeeId={selectedEmployeeId}
                onEmployeeSelect={handleEmployeeSelect}
                disabled={isLoadingEmployee || isSaving || isSubmitting}
              />
            </div>

            {showSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 font-medium">Draft saved successfully!</p>
              </div>
            )}

            {submissionError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">{submissionError}</p>
              </div>
            )}

            {isLoadingEmployee && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading employee data...</p>
              </div>
            )}

            {selectedEmployeeId && !isLoadingEmployee && employeeData && (
              <>
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="mb-4 p-3 bg-blue-50 rounded-md">
                    <p className="text-sm text-blue-800">
                      <strong>Filling form for:</strong> {employeeData.employee.firstName}{' '}
                      {employeeData.employee.lastName}
                      {employeeData.existingResponse?._metadata?.status === 'draft' && (
                        <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                          Draft in Progress
                        </span>
                      )}
                      {employeeData.existingResponse?._metadata?.status === 'submitted' && (
                        <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          Already Submitted
                        </span>
                      )}
                    </p>
                  </div>

                  <FormRenderer
                    formData={form.formData}
                    formValues={formValues}
                    errors={errors}
                    onFieldChange={setFieldValue}
                  />
                </div>

                <FormActions
                  onSaveDraft={handleSaveDraft}
                  onSubmit={handleSubmit}
                  isSaving={isSaving}
                  isSubmitting={isSubmitting}
                  disabled={!selectedEmployeeId}
                  showDraftSavedIndicator={!!lastSavedAt}
                  lastSavedAt={lastSavedAt}
                />
              </>
            )}

            {!selectedEmployeeId && !isLoadingEmployee && (
              <div className="text-center py-12 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-gray-600">Please select an employee to begin filling the form.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
