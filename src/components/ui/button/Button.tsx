"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { clsxm } from "@/lib/utils/class-utils";
import { ButtonProps } from "./types";
import { buttonVariants } from "./config";

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      asChild = false,
      loading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    const isDisabled = disabled || loading;

    return (
      <Comp
        className={clsxm(
          buttonVariants({ variant, size, fullWidth, className })
        )}
        ref={ref}
        disabled={isDisabled}
        {...props}
      >
        {loading && (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
        )}
        {!loading && leftIcon && leftIcon}
        <span className={loading ? "ml-2" : ""}>{children}</span>
        {!loading && rightIcon && rightIcon}
      </Comp>
    );
  }
);

Button.displayName = "Button";
