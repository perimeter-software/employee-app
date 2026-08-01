"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
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
          buttonVariants({ variant, size, fullWidth, className }),
          loading && "relative"
        )}
        ref={ref}
        disabled={isDisabled}
        {...props}
      >
        {loading && (
          <Loader2 className="absolute h-4 w-4 animate-spin" />
        )}
        <span className={clsxm("inline-flex items-center gap-[inherit]", loading && "opacity-30")}>
          {leftIcon}
          {children}
          {rightIcon}
        </span>
      </Comp>
    );
  }
);

Button.displayName = "Button";
