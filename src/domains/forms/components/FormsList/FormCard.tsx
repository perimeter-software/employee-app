import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button/Button';
import { FileText, ArrowRight } from 'lucide-react';
import { FormListItem } from '@/domains/forms/types/form.types';

interface FormCardProps {
  form: FormListItem;
}

export const FormCard: React.FC<FormCardProps> = ({ form }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <FileText className="w-6 h-6 text-blue-600" />
            <h3 className="text-xl font-semibold text-gray-900">{form.name}</h3>
          </div>
          
          {form.title && form.title !== form.name && (
            <p className="text-gray-600 mb-2">{form.title}</p>
          )}
          
          {form.subtitle && (
            <p className="text-sm text-gray-500 mb-4">{form.subtitle}</p>
          )}

          <div className="flex items-center space-x-4 text-sm text-gray-500">
            {form.metadata?.audience && (
              <span className="inline-flex items-center px-2 py-1 bg-blue-50 text-blue-700 rounded">
                {form.metadata.audience}
              </span>
            )}
            {form.metadata?.required === 'Yes' && (
              <span className="inline-flex items-center px-2 py-1 bg-red-50 text-red-700 rounded">
                Required
              </span>
            )}
            {form.metadata?.status && (
              <span
                className={`inline-flex items-center px-2 py-1 rounded ${
                  form.metadata.status === 'Active'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-gray-50 text-gray-700'
                }`}
              >
                {form.metadata.status}
              </span>
            )}
          </div>
        </div>

        <div className="ml-4">
          <Link href={`/forms/${form._id}`}>
            <Button className="flex items-center space-x-2">
              <span>Fill Form</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};
