"use client";

import React from "react";
import { Card } from "@/components/ui/Card";

interface ErrorStateProps {
  error?: string | Error | null;
  title?: string;
  description?: string;
}

export function ErrorState({
  error,
  title = "Error",
  description,
}: ErrorStateProps) {
  const errorMessage =
    error instanceof Error ? error.message : error || "Something went wrong";

  return (
    <div className="max-w-6xl mx-auto">
      <Card className="p-6">
        <div className="text-center text-red-600">
          <h3 className="text-lg font-semibold mb-2">{title}</h3>
          <p className="text-sm">{description || errorMessage}</p>
        </div>
      </Card>
    </div>
  );
}
