"use client";

import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

export function LoadingState() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Skeleton className="h-96 w-full max-w-md mx-auto" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
