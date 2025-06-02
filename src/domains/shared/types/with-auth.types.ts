import { ReactNode } from "react";

export type WithAuthOptions = {
  requireAuth?: boolean;
  fallback?: ReactNode;
};
