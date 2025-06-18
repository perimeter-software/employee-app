import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../Card";
import { Button } from "../Button";
import { TableProps } from "./types";

export function Table<T extends Record<string, unknown>>({
  title,
  description,
  columns,
  data,
  showPagination = true,
  selectable = false,
  className = "",
  emptyMessage = "No data available",
  getRowClassName,
  onRowClick,
  loading = false,
  loadingRows = 5,
}: TableProps<T>) {
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10; // You can make this configurable

  const toggleRowSelection = (index: number) => {
    setSelectedRows((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const toggleAllSelection = () => {
    setSelectedRows((prev) =>
      prev.length === data.length ? [] : data.map((_, index) => index)
    );
  };

  // Pagination logic
  const totalPages = Math.ceil(data.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentData = showPagination ? data.slice(startIndex, endIndex) : data;

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  // Loading skeleton row
  const LoadingRow = ({ index }: { index: number }) => (
    <tr key={`loading-${index}`} className="border-b border-gray-100">
      {selectable && (
        <td className="px-4 py-3">
          <div className="w-4 h-4 bg-gray-200 rounded animate-pulse" />
        </td>
      )}
      {columns.map((column) => (
        <td
          key={String(column.key)}
          className={`px-4 py-3 ${column.className || ""}`}
        >
          <div
            className="h-4 bg-gray-200 rounded animate-pulse"
            style={{ width: `${Math.random() * 40 + 60}%` }}
          />
        </td>
      ))}
    </tr>
  );

  return (
    <Card className={className}>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle className="text-lg">{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {selectable && (
                  <th className="px-4 py-3 font-medium text-gray-600">
                    <input
                      type="checkbox"
                      checked={
                        selectedRows.length === data.length && data.length > 0
                      }
                      onChange={toggleAllSelection}
                      className="rounded border-gray-300"
                      disabled={loading}
                    />
                  </th>
                )}
                {columns.map((column) => (
                  <th
                    key={String(column.key)}
                    className={`px-4 py-3 font-medium text-gray-600 ${
                      column.headerClassName || column.className || ""
                    }`}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                // Show loading skeleton
                Array.from({ length: loadingRows }, (_, index) => (
                  <LoadingRow key={index} index={index} />
                ))
              ) : data.length === 0 ? (
                // Show empty state
                <tr>
                  <td
                    colSpan={columns.length + (selectable ? 1 : 0)}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                // Show actual data
                currentData.map((row, rowIndex) => {
                  const actualIndex = showPagination
                    ? startIndex + rowIndex
                    : rowIndex;
                  const rowClassName = getRowClassName
                    ? getRowClassName(row, actualIndex)
                    : "";
                  const baseRowClassName = "hover:bg-gray-50 transition-colors";
                  const clickableClassName = onRowClick ? "cursor-pointer" : "";

                  return (
                    <tr
                      key={actualIndex}
                      className={`${baseRowClassName} ${clickableClassName} ${rowClassName}`}
                      onClick={() => onRowClick?.(row, actualIndex)}
                    >
                      {selectable && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedRows.includes(actualIndex)}
                            onChange={() => toggleRowSelection(actualIndex)}
                            className="rounded border-gray-300"
                          />
                        </td>
                      )}
                      {columns.map((column) => (
                        <td
                          key={String(column.key)}
                          className={`px-4 py-3 ${column.className || ""}`}
                        >
                          {column.render
                            ? column.render(row[column.key], row, actualIndex)
                            : String(row[column.key] ?? "")}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {showPagination && !loading && data.length > 0 && (
          <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
            <span>
              {selectable
                ? `${selectedRows.length} of ${data.length} row(s) selected.`
                : `Showing ${startIndex + 1} to ${Math.min(
                    endIndex,
                    data.length
                  )} of ${data.length} entries`}
            </span>
            <div className="flex gap-2 items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={goToPrevPage}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="px-2">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {!showPagination && !loading && (
          <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
            <span>
              {selectable
                ? `${selectedRows.length} of ${data.length} row(s) selected.`
                : `${data.length} row(s) total.`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
