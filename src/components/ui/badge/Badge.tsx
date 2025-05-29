import { FC, PropsWithChildren } from "react";
import { clsxm } from "@/lib/utils/class-utils";
import { badgeVariants } from "./config";
import { BadgeProps } from "./types";

export const Badge: FC<PropsWithChildren<BadgeProps>> = ({
  className,
  variant,
  ...props
}) => {
  return (
    <div className={clsxm(badgeVariants({ variant }), className)} {...props} />
  );
};
