'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle,
  XCircle,
  Pencil,
  Eye,
  Loader2,
  Save,
  X,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { useNewApplicantContext } from '../../state/new-applicant-context';
import { OnboardingService } from '../../services/onboarding-service';
import FormRenderer, { type DynamicFormData } from './FormRenderer';

// ---------- Types ----------

interface FormMetadata {
  status?: string;
  onboarding?: string;
  visibility?: string;
  minOnboardingStage?: string;
  shortName?: string;
  required?: string;
}

interface DynamicForm {
  id: string;
  name?: string;
  originalFilename?: string;
  createdAt?: string;
  metadata?: FormMetadata;
  form?: DynamicFormData;
}

interface CompletionRecord {
  completedOn: string;
  completedBy: string;
  completedById: string;
}

// ---------- Constants ----------

const ALL_STAGES = ['New', 'ATC', 'Screened', 'Pre-Hire'];

// ---------- Stage filter helper ----------

function getStageFilters(minStage: string): { allowedStages: string[] } {
  const allowedStages: string[] = [];
  let found = false;
  for (const stage of ALL_STAGES) {
    if (stage === minStage) found = true;
    if (found) allowedStages.push(stage);
  }
  return { allowedStages };
}

// ---------- Main Component ----------

const AdditionalForms: React.FC = () => {
  const { applicant, updateApplicantAction, updateButtons } =
    useNewApplicantContext();

  const [selectedForm, setSelectedForm] = useState<DynamicForm | null>(null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoadingFormData, setIsLoadingFormData] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedForms, setCompletedForms] = useState<
    Record<string, CompletionRecord>
  >({});

  // Fetch all dynamic forms
  const { data: allForms = [], isLoading } = useQuery<unknown[]>({
    queryKey: ['dynamicForms'],
    queryFn: () => OnboardingService.getForms(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Filter: active + onboarding, no AdminsOnly (we never branch on admin here), stage check
  const forms = useMemo<DynamicForm[]>(() => {
    if (!Array.isArray(allForms)) return [];
    return (allForms as DynamicForm[]).filter((form) => {
      const isActiveAndOnboarding =
        form.metadata?.status === 'Active' &&
        form.metadata?.onboarding === 'Yes';

      // Skip AdminsOnly forms — applicant portal doesn't have admin context
      if (form.metadata?.visibility === 'AdminsOnly') return false;

      // Stage gate
      let stageAllowed = true;
      const minStage = form.metadata?.minOnboardingStage;
      const applicantStatus = applicant?.applicantStatus as string | undefined;
      if (minStage && applicantStatus) {
        const { allowedStages } = getStageFilters(minStage);
        stageAllowed = allowedStages.includes(applicantStatus);
      }

      return isActiveAndOnboarding && stageAllowed;
    });
  }, [allForms, applicant?.applicantStatus]);

  // Initialise completion state from applicant data
  useEffect(() => {
    if (!applicant || forms.length === 0) return;

    const result: Record<string, CompletionRecord> = {};

    // Check dynamicForms keyed by shortName
    const dynamicForms = applicant.dynamicForms as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (dynamicForms) {
      forms.forEach((form) => {
        const shortName = form.metadata?.shortName;
        if (shortName && dynamicForms[shortName]?.submittedDate) {
          result[form.id] = {
            completedOn: dynamicForms[shortName].submittedDate as string,
            completedBy:
              (dynamicForms[shortName].completedBy as string) || 'Unknown User',
            completedById:
              (dynamicForms[shortName].completedById as string) || '',
          };
        }
      });
    }

    // Backward-compat: check formResponses array
    const formResponsesRaw = applicant.formResponses as
      | Array<Record<string, unknown>>
      | Record<string, unknown>
      | undefined;
    if (formResponsesRaw) {
      const arr = Array.isArray(formResponsesRaw)
        ? formResponsesRaw
        : [formResponsesRaw];
      arr.forEach((response) => {
        if (response?.formId) {
          result[response.formId as string] = {
            completedOn:
              (response.submittedDate as string) || new Date().toISOString(),
            completedBy:
              (response.completedBy as string) ||
              (applicant.firstName && applicant.lastName
                ? `${applicant.firstName} ${applicant.lastName}`
                : 'Unknown User'),
            completedById: (response.completedById as string) || '',
          };
        }
      });
    }

    setCompletedForms(result);
  }, [applicant, forms]);

  // Helper: get applicant display name for completion record
  const getCompletedBy = useCallback((): string => {
    if (applicant?.firstName && applicant?.lastName) {
      return `${applicant.firstName} ${applicant.lastName}`;
    }
    return 'Unknown User';
  }, [applicant]);

  // Check if all required forms are completed
  const areAllRequiredFormsCompleted = useMemo(() => {
    if (isLoading) return false;
    const required = forms.filter((f) => f.metadata?.required === 'Yes');
    if (required.length === 0) return true;
    return required.every((f) => !!completedForms[f.id]);
  }, [forms, completedForms, isLoading]);

  // Drive nav button state
  useEffect(() => {
    updateButtons({
      previous: { show: true, disabled: false },
      next: { show: true, disabled: !areAllRequiredFormsCompleted },
      submit: { show: false, disabled: true },
    });
  }, [areAllRequiredFormsCompleted, updateButtons]);

  // ---------- Fill form dialog ----------

  const handleFillForm = useCallback(
    async (form: DynamicForm) => {
      setSelectedForm(form);
      setIsLoadingFormData(true);
      setIsDialogOpen(true);

      try {
        const shortName = form.metadata?.shortName;
        const dynamicForms = applicant?.dynamicForms as
          | Record<string, Record<string, unknown>>
          | undefined;

        // Prefer existing saved values keyed by shortName
        if (shortName && dynamicForms?.[shortName]) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { submittedDate, completedBy, completedById, ...savedValues } =
            dynamicForms[shortName];
          setFormValues(savedValues as Record<string, unknown>);
          return;
        }

        // Backward-compat: formResponses
        const formResponsesRaw = applicant?.formResponses as
          | Array<Record<string, unknown>>
          | Record<string, unknown>
          | undefined;
        if (formResponsesRaw) {
          const arr = Array.isArray(formResponsesRaw)
            ? formResponsesRaw
            : [formResponsesRaw];
          const existing = arr.find((r) => r?.formId === form.id);
          if (existing?.responses) {
            setFormValues(existing.responses as Record<string, unknown>);
            return;
          }
        }

        // Initialise defaults from form definition
        const initial: Record<string, unknown> = {};
        form.form?.sections?.forEach((section) => {
          section.rows?.forEach((row) => {
            row.columns?.forEach((field) => {
              if (field.id) {
                initial[field.id] = field.defaultValue ?? '';
              }
            });
          });
        });
        setFormValues(initial);
      } finally {
        setIsLoadingFormData(false);
      }
    },
    [applicant]
  );

  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false);
    setSelectedForm(null);
    setFormValues({});
  }, []);

  const handleInputChange = useCallback((id: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handleSubmitForm = useCallback(async () => {
    if (!selectedForm || !applicant?._id) return;

    // Validate required fields
    let missingRequired = false;
    selectedForm.form?.sections?.forEach((section) => {
      section.rows?.forEach((row) => {
        row.columns?.forEach((field) => {
          if (field.required && !formValues[field.id]) {
            missingRequired = true;
          }
        });
      });
    });
    if (missingRequired) {
      toast.error('Please fill all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const shortName = selectedForm.metadata?.shortName;
      const completedBy = getCompletedBy();
      const completedById = (applicant._id as string) || '';
      const submittedDate = new Date().toISOString();

      const formData = {
        ...formValues,
        submittedDate,
        completedBy,
        completedById,
      };

      const currentDynamicForms =
        (applicant.dynamicForms as Record<string, unknown>) ?? {};
      await updateApplicantAction(applicant._id as string, {
        dynamicForms: {
          ...currentDynamicForms,
          ...(shortName ? { [shortName]: formData } : {}),
        },
      });

      setCompletedForms((prev) => ({
        ...prev,
        [selectedForm.id]: {
          completedOn: submittedDate,
          completedBy,
          completedById,
        },
      }));

      toast.success('Form submitted successfully');

      // Generate filled PDF
      try {
        await OnboardingService.generateFilledPdf({
          formId: selectedForm.id,
          applicantId: applicant._id as string,
          formValues: formValues as Record<string, unknown>,
        });
        toast.success('PDF generated and attached to applicant record');
      } catch (pdfErr) {
        const msg = pdfErr instanceof Error ? pdfErr.message : 'Unknown error';
        toast.error(`Error generating PDF: ${msg}`);
      }

      handleCloseDialog();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to submit form: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    selectedForm,
    formValues,
    applicant,
    updateApplicantAction,
    getCompletedBy,
    handleCloseDialog,
  ]);

  // ---------- Render ----------

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">
          Additional Forms
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Please complete the following forms. Required forms must be filled
          before proceeding.
        </p>
      </div>

      {/* Warning banner when required forms are incomplete */}
      {!areAllRequiredFormsCompleted && !isLoading && (
        <div className="flex items-start gap-3 rounded border border-amber-300 bg-amber-50 p-4">
          <span className="text-amber-500 mt-0.5">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              Required Forms Incomplete
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Please complete all required forms before proceeding to the next
              step.
            </p>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 rounded border border-gray-200 bg-gray-50 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && forms.length === 0 && (
        <p className="text-sm text-gray-500 py-8 text-center">
          No additional forms available.
        </p>
      )}

      {/* Form cards */}
      {!isLoading && forms.length > 0 && (
        <ul className="space-y-3">
          {forms.map((form) => {
            const completion = completedForms[form.id];
            const isCompleted = !!completion;
            const isRequired = form.metadata?.required === 'Yes';

            return (
              <li
                key={form.id}
                className={`rounded border-l-4 border border-gray-200 p-4 transition-shadow hover:shadow-md ${
                  isCompleted
                    ? 'border-l-green-500 bg-green-50/30'
                    : 'border-l-red-400'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Icon + title */}
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-8 w-8 flex-shrink-0 text-gray-400" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800 truncate">
                          {form.name ?? 'Form'}
                        </span>
                        {isRequired && (
                          <span className="rounded-full border border-red-300 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                            Required
                          </span>
                        )}
                      </div>
                      {form.createdAt && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(form.createdAt).toLocaleDateString()}
                        </p>
                      )}
                      {isCompleted && (
                        <p className="text-xs text-green-700 mt-1">
                          Completed on{' '}
                          {new Date(
                            completion.completedOn
                          ).toLocaleDateString()}{' '}
                          by {completion.completedBy}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Status badge + action */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {isCompleted ? (
                      <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        <CheckCircle className="h-3 w-3" />
                        Completed
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        <XCircle className="h-3 w-3" />
                        Incomplete
                      </span>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant={isCompleted ? 'outline' : 'default'}
                      onClick={() => handleFillForm(form)}
                      className={
                        isCompleted
                          ? 'border-green-400 text-green-700 hover:bg-green-50'
                          : ''
                      }
                    >
                      {isCompleted ? (
                        <>
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          Review
                        </>
                      ) : (
                        <>
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Fill Form
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Fill Form Dialog */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => !open && handleCloseDialog()}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedForm?.name ?? 'Form'}</DialogTitle>
          </DialogHeader>

          {isLoadingFormData ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                Please fill out all required fields marked with an asterisk (*).
              </p>
              <hr className="border-gray-200" />
              {selectedForm?.form && (
                <FormRenderer
                  formData={selectedForm.form}
                  formValues={formValues}
                  onInputChange={handleInputChange}
                  applicant={applicant as Record<string, unknown> | undefined}
                />
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseDialog}
              disabled={isSubmitting}
            >
              <X className="mr-1 h-4 w-4" />
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmitForm}
              disabled={isLoadingFormData || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Save className="mr-1 h-4 w-4" />
                  Submit Form
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdditionalForms;
