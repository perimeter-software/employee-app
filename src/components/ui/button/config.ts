import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary:
          "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg focus:ring-blue-500 active:bg-blue-800",
        secondary:
          "bg-gray-600 text-white hover:bg-gray-700 hover:shadow-lg focus:ring-gray-500 active:bg-gray-800",
        outline:
          "border-2 border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400 focus:ring-blue-500 active:bg-gray-100",
        ghost:
          "text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus:ring-gray-500 active:bg-gray-200",
        danger:
          "bg-red-600 text-white hover:bg-red-700 hover:shadow-lg focus:ring-red-500 active:bg-red-800",
        success:
          "bg-green-600 text-white hover:bg-green-700 hover:shadow-lg focus:ring-green-500 active:bg-green-800",
      },
      size: {
        xs: "px-2.5 py-1.5 text-xs gap-1",
        sm: "px-3 py-2 text-sm gap-1.5",
        md: "px-4 py-2.5 text-base gap-2",
        lg: "px-6 py-3 text-lg gap-2.5",
        xl: "px-8 py-4 text-xl gap-3",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
  }
);
