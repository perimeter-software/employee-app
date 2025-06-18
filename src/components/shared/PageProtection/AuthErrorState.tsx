import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";

// Enhanced Error component
export const AuthErrorState = ({
  error,
  onRetry,
  showHomeButton = true,
}: {
  error: string;
  onRetry?: () => void;
  showHomeButton?: boolean;
}) => (
  <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 flex items-center justify-center p-4 relative overflow-hidden">
    {/* Background decorative elements */}
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute -top-40 -left-40 w-80 h-80 bg-gradient-to-br from-red-200/30 to-orange-200/20 rounded-full blur-3xl"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-gradient-to-br from-orange-200/30 to-yellow-200/20 rounded-full blur-3xl"></div>
    </div>

    <div className="relative bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-8 max-w-md w-full">
      <div className="flex flex-col items-center space-y-6">
        {/* Error icon */}
        <div className="relative">
          <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg">
            <AlertCircle className="w-10 h-10 text-white" />
          </div>
          <div className="absolute -inset-2 bg-gradient-to-r from-red-500/20 to-orange-500/20 rounded-3xl blur-lg"></div>
        </div>

        {/* Content */}
        <div className="text-center space-y-3">
          <h2 className="text-xl font-semibold text-red-600">
            Authentication Error
          </h2>
          <p className="text-gray-600 text-sm leading-relaxed">{error}</p>
        </div>

        {/* Action buttons */}
        <div className="w-full space-y-3">
          <Button
            onClick={onRetry || (() => (window.location.href = "/auth/login"))}
            className="w-full bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white font-medium py-3 px-6 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Login Again
          </Button>

          {showHomeButton && (
            <Button
              onClick={() => (window.location.href = "/")}
              variant="outline"
              className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 py-3 px-6 rounded-xl transition-all duration-300"
            >
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          )}
        </div>

        {/* Help text */}
        <div className="text-center">
          <p className="text-xs text-gray-500">
            If this issue persists, please contact support
          </p>
        </div>
      </div>
    </div>
  </div>
);
