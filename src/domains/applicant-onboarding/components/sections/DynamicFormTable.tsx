'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

// A dynamic-form `table` field. Column definitions come from the extracted
// field.columns ({header,key,type}); the filled value is an array of row objects
// keyed by each column's key. Extraction leaves rows[] empty, so we seed one
// empty row and let the applicant Add Row. Stored verbatim under the table
// field's single id in dynamicForms. Mirrors the v4 DynamicFormTable so both
// apps produce the same value shape the shared validator + BE PDF read.
export interface TableColumn {
  header?: string | null;
  key?: string | null;
  type?: string | null;
}

export type TableRow = Record<string, string>;

interface DynamicFormTableProps {
  columns: TableColumn[] | undefined | null;
  value: unknown;
  onChange: (rows: TableRow[]) => void;
  readOnly?: boolean;
}

const colKey = (c: TableColumn, i: number) => c.key || c.header || `col${i + 1}`;

export function DynamicFormTable({ columns, value, onChange, readOnly }: DynamicFormTableProps) {
  const cols: TableColumn[] =
    Array.isArray(columns) && columns.length > 0 ? columns : [{ header: 'Value', key: 'value' }];
  const keys = cols.map(colKey);

  const rows: TableRow[] = Array.isArray(value) ? (value as TableRow[]) : [];
  const emptyRow = (): TableRow => Object.fromEntries(keys.map((k) => [k, '']));
  const displayRows = rows.length > 0 ? rows : [emptyRow()];

  const setCell = (rowIdx: number, key: string, v: string) => {
    onChange(displayRows.map((r, i) => (i === rowIdx ? { ...r, [key]: v } : r)));
  };
  const addRow = () => onChange([...displayRows, emptyRow()]);
  const removeRow = (rowIdx: number) => onChange(displayRows.filter((_, i) => i !== rowIdx));

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th
                key={i}
                className="border border-gray-200 bg-gray-50 px-2 py-1 text-left text-xs font-medium text-gray-600"
              >
                {c.header || c.key || `Column ${i + 1}`}
              </th>
            ))}
            {!readOnly && <th className="w-9 border border-gray-200 bg-gray-50" />}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {keys.map((k, i) => (
                <td key={i} className="border border-gray-200 p-0">
                  <Input
                    className="h-8 rounded-none border-0"
                    value={row?.[k] ?? ''}
                    disabled={readOnly}
                    onChange={(e) => setCell(rowIdx, k, e.target.value)}
                  />
                </td>
              ))}
              {!readOnly && (
                <td className="border border-gray-200 p-0 text-center align-middle">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => removeRow(rowIdx)}
                    disabled={displayRows.length <= 1}
                    aria-label="Remove row"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-gray-400" />
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addRow}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add Row
        </Button>
      )}
    </div>
  );
}
