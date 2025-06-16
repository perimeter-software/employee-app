"use client";

import * as React from "react";
import { Upload, Paperclip, X } from "lucide-react";
import { clsxm } from "@/lib/utils";
import { Button } from "@/components/ui/Button/Button";

export interface FileDropzoneProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: File | null;
  onChange?: (file: File | null) => void;
  accept?: string;
  maxSize?: number; // in bytes
  error?: string;
  disabled?: boolean;
}

export const FileDropzone = React.forwardRef<HTMLDivElement, FileDropzoneProps>(
  (
    {
      value,
      onChange,
      accept = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.gif,.webp",
      maxSize = 10 * 1024 * 1024, // 10MB default
      error,
      disabled = false,
      className,
      ...props
    },
    ref
  ) => {
    const [dragActive, setDragActive] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const handleDrag = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "dragenter" || e.type === "dragover") {
        setDragActive(true);
      } else if (e.type === "dragleave") {
        setDragActive(false);
      }
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files && files[0]) {
        handleFile(files[0]);
      }
    };

    const handleFile = (file: File) => {
      if (file.size > maxSize) {
        // You might want to show an error message here
        console.error("File is too large");
        return;
      }

      onChange?.(file);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    };

    const handleRemove = () => {
      onChange?.(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    };

    return (
      <div
        ref={ref}
        className={clsxm(
          "relative",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        {...props}
      >
        <div
          className={clsxm(
            "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
            dragActive
              ? "border-blue-400 bg-blue-50"
              : value
              ? "border-green-400 bg-green-50"
              : error
              ? "border-red-400 bg-red-50"
              : "border-gray-300 hover:border-gray-400",
            disabled && "hover:border-gray-300"
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            onChange={handleChange}
            accept={accept}
            className="hidden"
            disabled={disabled}
          />

          {value ? (
            <div className="space-y-2">
              <Paperclip className="w-8 h-8 text-green-600 mx-auto" />
              <p className="text-sm font-medium text-green-800">{value.name}</p>
              <p className="text-xs text-green-600">
                {(value.size / 1024 / 1024).toFixed(2)} MB
              </p>
              {!disabled && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRemove}
                >
                  Remove File
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="w-8 h-8 text-gray-400 mx-auto" />
              <p className="text-sm text-gray-600">
                <span className="font-medium">Click to upload</span> or drag and
                drop
              </p>
              <p className="text-xs text-gray-500">
                {accept.split(",").join(", ")}
              </p>
              {!disabled && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => inputRef.current?.click()}
                >
                  Choose File
                </Button>
              )}
            </div>
          )}

          {error && (
            <p className="mt-2 text-sm text-red-600 flex items-center justify-center gap-1">
              <X className="w-4 h-4" />
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }
);

FileDropzone.displayName = "FileDropzone";
