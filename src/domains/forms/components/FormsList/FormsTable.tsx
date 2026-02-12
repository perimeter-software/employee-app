import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button/Button';
import { FileText, ArrowRight } from 'lucide-react';
import { FormListItem } from '@/domains/forms/types/form.types';
import { clsxm } from '@/lib/utils';

interface FormsTableProps {
  forms: FormListItem[];
}

export const FormsTable: React.FC<FormsTableProps> = ({ forms }) => {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full border-collapse bg-white">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Title
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden md:table-cell">
              Subtitle
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider hidden sm:table-cell">
              Audience
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {forms.map((form) => (
            <tr
              key={form._id}
              className={clsxm(
                'hover:bg-gray-50 transition-colors',
                'bg-white'
              )}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-900">
                    {form.name}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {form.title || '—'}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell max-w-xs truncate">
                {form.subtitle || '—'}
              </td>
              <td className="px-4 py-3">
                <span
                  className={clsxm(
                    'inline-flex items-center px-2 py-1 rounded text-xs font-medium',
                    form.metadata?.status === 'Active'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-gray-50 text-gray-700'
                  )}
                >
                  {form.metadata?.status ?? '—'}
                </span>
              </td>
              <td className="px-4 py-3 hidden sm:table-cell">
                {form.metadata?.audience ? (
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700">
                    {form.metadata.audience}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <Link href={`/forms/${form._id}`}>
                  <Button
                    variant="primary"
                    size="sm"
                    className="inline-flex items-center gap-1.5"
                    leftIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Fill Form
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
