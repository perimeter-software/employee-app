'use client';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { useNewApplicantContext } from '../state/new-applicant-context';

interface UnsavedChangesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clickDirection: 'next' | 'previous' | null;
}

// Placeholder port of stadium-people UnsavedChangesModal (89 lines).
const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  open,
  onOpenChange,
  clickDirection,
}) => {
  const { onNextStep, onPreviousStep, submitRef } = useNewApplicantContext();

  const discardAndMove = () => {
    onOpenChange(false);
    if (clickDirection === 'next') onNextStep();
    else if (clickDirection === 'previous') onPreviousStep();
  };

  const saveAndMove = async () => {
    await submitRef.current?.();
    onOpenChange(false);
    if (clickDirection === 'next') onNextStep();
    else if (clickDirection === 'previous') onPreviousStep();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>You have unsaved changes</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          Do you want to save your changes before moving to the {clickDirection} step?
        </p>
        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="outline-danger" onClick={discardAndMove}>
            Discard
          </Button>
          <Button onClick={saveAndMove}>Save &amp; continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UnsavedChangesModal;
