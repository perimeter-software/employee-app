import { Loader2, Shield } from "lucide-react";

// Enhanced Loading component
export const AuthLoadingState = ({
  message = "Checking authentication...",
  title = "Authenticating",
}: {
  message?: string;
  title?: string;
}) => (
  <div className="min-h-screen bg-gradient-to-br from-appBackground via-altMutedBackground to-altPrimaryBackground flex items-center justify-center relative overflow-hidden">
    {/* Background decorative elements */}
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute -top-40 -left-40 w-80 h-80 bg-gradient-to-br from-appPrimary/20 to-altPrimary/10 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-gradient-to-br from-appSecondary/20 to-altSecondary/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
    </div>

    <div className="relative bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-8 max-w-md w-full mx-4">
      <div className="flex flex-col items-center space-y-6">
        {/* Animated shield icon */}
        <div className="relative">
          <div className="w-20 h-20 bg-gradient-to-br from-appPrimary to-altPrimary rounded-2xl flex items-center justify-center shadow-lg">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <div className="absolute -inset-2 bg-gradient-to-r from-appPrimary/20 to-altPrimary/20 rounded-3xl blur-lg animate-pulse"></div>
        </div>

        {/* Loading spinner */}
        <div className="relative">
          <Loader2 className="w-12 h-12 text-appPrimary animate-spin" />
          <div className="absolute inset-0 w-12 h-12 border-4 border-appPrimary/20 rounded-full"></div>
        </div>

        {/* Text content */}
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-altText">{title}</h2>
          <p className="text-altText/70 text-sm">{message}</p>
        </div>

        {/* Progress indicators */}
        <div className="flex space-x-2">
          <div className="w-2 h-2 bg-appPrimary rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-appPrimary rounded-full animate-bounce delay-75"></div>
          <div className="w-2 h-2 bg-appPrimary rounded-full animate-bounce delay-150"></div>
        </div>
      </div>
    </div>
  </div>
);
