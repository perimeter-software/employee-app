import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../Card";
import { Button } from "../Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../Select";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
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
  pageSize: initialPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
}: TableProps<T>) {
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(initialPageSize);
  const [sortColumn, setSortColumn] = useState<keyof T | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Reset to page 1 when page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage, sortColumn, sortDirection]);

  const toggleRowSelection = (index: number) => {
    setSelectedRows((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  // Sorting logic
  const sortedData = useMemo(() => {
    if (!sortColumn) return data;

    const column = columns.find((col) => col.key === sortColumn);
    if (!column || column.sortable === false) return data;

    return [...data].sort((a, b) => {
      // Use custom sort function if provided
      if (column.sortFn) {
        return sortDirection === "asc" 
          ? column.sortFn(a, b) 
          : column.sortFn(b, a);
      }

      // Default sorting logic
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      // Handle null/undefined values
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      // Handle different data types
      if (typeof aValue === "string" && typeof bValue === "string") {
        const comparison = aValue.localeCompare(bValue, undefined, { 
          numeric: true, 
          sensitivity: "base" 
        });
        return sortDirection === "asc" ? comparison : -comparison;
      }

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
      }

      if (aValue instanceof Date && bValue instanceof Date) {
        return sortDirection === "asc" 
          ? aValue.getTime() - bValue.getTime()
          : bValue.getTime() - aValue.getTime();
      }

      // Fallback: convert to string and compare
      const aStr = String(aValue);
      const bStr = String(bValue);
      const comparison = aStr.localeCompare(bStr, undefined, { 
        numeric: true, 
        sensitivity: "base" 
      });
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [data, sortColumn, sortDirection, columns]);

  // Handle column header click for sorting
  const handleSort = (columnKey: keyof T) => {
    const column = columns.find((col) => col.key === columnKey);
    // Skip if column is explicitly marked as non-sortable
    if (column?.sortable === false) return;

    if (sortColumn === columnKey) {
      // Toggle direction if clicking the same column
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Set new column and default to ascending
      setSortColumn(columnKey);
      setSortDirection("asc");
    }
  };

  // Toggle all selection (uses sorted data)
  const toggleAllSelection = () => {
    setSelectedRows((prev) =>
      prev.length === sortedData.length 
        ? [] 
        : sortedData.map((_, index) => index)
    );
  };

  // Pagination logic (apply to sorted data)
  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentData = showPagination 
    ? sortedData.slice(startIndex, endIndex) 
    : sortedData;

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
                        selectedRows.length === sortedData.length && sortedData.length > 0
                      }
                      onChange={toggleAllSelection}
                      className="rounded border-gray-300"
                      disabled={loading}
                      aria-label="Select all rows"
                      title="Select all rows"
                    />
                  </th>
                )}
                {columns.map((column, index) => {
                  const isSortable = column.sortable !== false;
                  const isSorted = sortColumn === column.key;
                  const isAscending = sortDirection === "asc";

                  // Calculate aria-sort value - must be a literal string, not an expression
                  let ariaSortValue: "ascending" | "descending" | "none";
                  if (isSorted) {
                    if (isAscending) {
                      ariaSortValue = "ascending";
                    } else {
                      ariaSortValue = "descending";
                    }
                  } else {
                    ariaSortValue = "none";
                  }

                  // Calculate aria-label value
                  let ariaLabelValue: string | undefined;
                  if (isSortable) {
                    if (isSorted) {
                      const direction = isAscending ? "descending" : "ascending";
                      ariaLabelValue = `Sort by ${column.header} ${direction}`;
                    } else {
                      ariaLabelValue = `Sort by ${column.header}`;
                    }
                  }

                  const thProps: React.ThHTMLAttributes<HTMLTableCellElement> = {
                    className: `px-4 py-3 font-medium text-gray-600 ${
                      column.headerClassName || column.className || ""
                    } ${
                      isSortable ? "cursor-pointer hover:bg-gray-100 select-none" : ""
                    }`,
                    onClick: () => isSortable && handleSort(column.key),
                    "aria-sort": ariaSortValue,
                    tabIndex: isSortable ? 0 : undefined,
                    onKeyDown: (e) => {
                      if (isSortable && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        handleSort(column.key);
                      }
                    },
                  };

                  if (ariaLabelValue) {
                    thProps["aria-label"] = ariaLabelValue;
                  }

                  return (
                    <th key={String(column.key)+index.toString()} {...thProps}>
                      <div className="flex items-center gap-2">
                        <span>{column.header}</span>
                        {isSortable && (
                          <span className="inline-flex items-center">
                            {isSorted ? (
                              isAscending ? (
                                <ArrowUp className="h-4 w-4 text-gray-600" />
                              ) : (
                                <ArrowDown className="h-4 w-4 text-gray-600" />
                              )
                            ) : (
                              <ArrowUpDown className="h-4 w-4 text-gray-400" />
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                // Show loading skeleton
                Array.from({ length: loadingRows }, (_, index) => (
                  <LoadingRow key={index} index={index} />
                ))
              ) : sortedData.length === 0 ? (
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
                            aria-label={`Select row ${actualIndex + 1}`}
                            title={`Select row ${actualIndex + 1}`}
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

        {showPagination && !loading && sortedData.length > 0 && (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mt-4 text-sm text-gray-600">
            <div className="flex items-center gap-4">
              <span>
                {selectable
                  ? `${selectedRows.length} of ${sortedData.length} row(s) selected.`
                  : `Showing ${startIndex + 1} to ${Math.min(
                      endIndex,
                      sortedData.length
                    )} of ${sortedData.length} entries`}
              </span>
              <div className="flex items-center gap-2">
                <label htmlFor="page-size-select" className="text-gray-500">
                  Rows per page:
                </label>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={(value) => setItemsPerPage(Number(value))}
                >
                  <SelectTrigger
                    id="page-size-select"
                    className="h-8 w-[70px]"
                    aria-label="Select number of rows per page"
                    title="Select number of rows per page"
                  >
                    <SelectValue placeholder={itemsPerPage.toString()} />
                  </SelectTrigger>
                  <SelectContent>
                    {pageSizeOptions.map((size) => (
                      <SelectItem key={size} value={size.toString()}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
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
                ? `${selectedRows.length} of ${sortedData.length} row(s) selected.`
                : `${sortedData.length} row(s) total.`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
