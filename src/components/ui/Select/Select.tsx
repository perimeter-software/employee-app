"use client";

import * as React from "react";
import { ChevronDown, Check } from "lucide-react";
import { clsxm } from "@/lib/utils/class-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  children: React.ReactNode;
}

interface SelectTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

interface SelectContentProps {
  children: React.ReactNode;
}

interface SelectItemProps {
  value: string;
  children: React.ReactNode;
  onSelect?: () => void;
}

interface SelectValueProps {
  placeholder?: string;
}

const SelectContext = React.createContext<{
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
}>({});

const Select = ({
  value,
  onValueChange,
  placeholder,
  children,
}: SelectProps) => {
  return (
    <SelectContext.Provider value={{ value, onValueChange, placeholder }}>
      <DropdownMenu>{children}</DropdownMenu>
    </SelectContext.Provider>
  );
};

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children, ...props }, ref) => (
    <DropdownMenuTrigger asChild>
      <button
        ref={ref}
        className={clsxm(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>
    </DropdownMenuTrigger>
  )
);
SelectTrigger.displayName = "SelectTrigger";

const SelectContent = ({ children }: SelectContentProps) => (
  <DropdownMenuContent className="min-w-[8rem]">{children}</DropdownMenuContent>
);

const SelectItem = ({ value, children, onSelect }: SelectItemProps) => {
  const context = React.useContext(SelectContext);
  const isSelected = context.value === value;

  return (
    <DropdownMenuItem
      onClick={() => {
        context.onValueChange?.(value);
        onSelect?.();
      }}
      className="relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        {isSelected && <Check className="h-4 w-4" />}
      </span>
      {children}
    </DropdownMenuItem>
  );
};

const SelectValue = ({ placeholder }: SelectValueProps) => {
  const context = React.useContext(SelectContext);
  return (
    <span>
      {context.value || context.placeholder || placeholder || "Select..."}
    </span>
  );
};

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
