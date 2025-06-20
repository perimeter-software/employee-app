import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary:
          "bg-appPrimary text-white hover:bg-appPrimary/80 hover:shadow-lg focus:ring-appPrimary active:bg-appPrimary/80",
        secondary:
          "bg-gray-600 text-white hover:bg-gray-700 hover:shadow-lg focus:ring-gray-500 active:bg-gray-800",
        outline:
          "border-2 border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400 focus:ring-blue-500 active:bg-gray-100",
        "outline-primary":
          "border-2 border-appPrimary bg-white text-appPrimary hover:bg-appPrimary/5 hover:border-appPrimary/80 focus:ring-appPrimary active:bg-appPrimary/10",
        "outline-secondary":
          "border-2 border-gray-600 bg-white text-gray-600 hover:bg-gray-600/5 hover:border-gray-700 focus:ring-gray-500 active:bg-gray-600/10",
        "outline-danger":
          "border-2 border-red-600 bg-white text-red-600 hover:bg-red-600/5 hover:border-red-700 focus:ring-red-500 active:bg-red-600/10",
        "outline-success":
          "border-2 border-green-600 bg-white text-green-600 hover:bg-green-600/5 hover:border-green-700 focus:ring-green-500 active:bg-green-600/10",
        ghost:
          "text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus:ring-gray-500 active:bg-gray-200",
        "ghost-primary":
          "text-appPrimary hover:bg-appPrimary/10 hover:text-appPrimary focus:ring-appPrimary active:bg-appPrimary/20",
        "ghost-secondary":
          "text-gray-600 hover:bg-gray-100 hover:text-gray-700 focus:ring-gray-500 active:bg-gray-200",
        "ghost-danger":
          "text-red-600 hover:bg-red-50 hover:text-red-700 focus:ring-red-500 active:bg-red-100",
        "ghost-success":
          "text-green-600 hover:bg-green-50 hover:text-green-700 focus:ring-green-500 active:bg-green-100",
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
