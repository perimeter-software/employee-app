import React from 'react';
import { ClipboardList, Grid3x3, Table as TableIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button/Button';

export type FormsViewMode = 'card' | 'table';

interface FormsListHeaderProps {
  viewMode?: FormsViewMode;
  onViewModeChange?: (mode: FormsViewMode) => void;
}

export const FormsListHeader: React.FC<FormsListHeaderProps> = ({
  viewMode = 'card',
  onViewModeChange,
}) => {
  return (
    <div className="mb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center space-x-3">
            <ClipboardList className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Forms</h1>
          </div>
          <p className="mt-2 text-gray-600">
            Select a form to fill out for an employee. You can save your progress and come back later.
          </p>
        </div>
        {onViewModeChange && (
          <div className="flex gap-2 border border-gray-200 rounded-lg p-1 self-start sm:self-auto">
            <Button
              variant={viewMode === 'card' ? 'primary' : 'ghost'}
              onClick={() => onViewModeChange('card')}
              className="h-9 px-3"
              size="sm"
              leftIcon={<Grid3x3 className="w-4 h-4" />}
            >
              Card
            </Button>
            <Button
              variant={viewMode === 'table' ? 'primary' : 'ghost'}
              onClick={() => onViewModeChange('table')}
              className="h-9 px-3"
              size="sm"
              leftIcon={<TableIcon className="w-4 h-4" />}
            >
              Table
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
