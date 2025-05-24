import { HTMLAttributes } from "react";
import { VariantProps } from "class-variance-authority";
import { badgeVariants } from "./config";

export type BadgeProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof badgeVariants>;
