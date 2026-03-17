import React from 'react';
import { Button } from '@/components/ui/Button/Button';
import { Save, Send } from 'lucide-react';

interface FormActionsProps {
  onSaveDraft: () => void;
  onSubmit: () => void;
  isSaving: boolean;
  isSubmitting: boolean;
  disabled?: boolean;
  showDraftSavedIndicator?: boolean;
  lastSavedAt?: Date | null;
}

export const FormActions: React.FC<FormActionsProps> = ({
  onSaveDraft,
  onSubmit,
  isSaving,
  isSubmitting,
  disabled = false,
  showDraftSavedIndicator = false,
  lastSavedAt,
}) => {
  const formatLastSaved = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins === 1) return '1 minute ago';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 mt-8">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Draft indicator */}
        <div className="flex-1">
          {showDraftSavedIndicator && lastSavedAt && (
            <div className="flex items-center text-sm text-gray-600">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              Draft saved {formatLastSaved(lastSavedAt)}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            onClick={onSaveDraft}
            disabled={disabled || isSaving || isSubmitting}
            className="flex items-center space-x-2"
          >
            {isSaving ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Draft</span>
              </>
            )}
          </Button>

          <Button
            onClick={onSubmit}
            disabled={disabled || isSaving || isSubmitting}
            className="flex items-center space-x-2"
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Submitting...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Submit Form</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
