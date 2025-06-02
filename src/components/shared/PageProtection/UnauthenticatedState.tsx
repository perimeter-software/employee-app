import { Lock } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import Image from "next/image";

export const UnauthenticatedState = ({
  title = "Authentication Required",
  message = "Please log in to access this content",
  returnUrl,
}: {
  title?: string;
  message?: string;
  returnUrl?: string;
}) => (
  <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50 flex items-center justify-center p-4 relative overflow-hidden">
    {/* Background decorative elements */}
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute -top-40 -left-40 w-80 h-80 bg-gradient-to-br from-yellow-200/30 to-orange-200/20 rounded-full blur-3xl"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-gradient-to-br from-orange-200/30 to-red-200/20 rounded-full blur-3xl"></div>
    </div>

    <div className="relative bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-8 max-w-md w-full">
      <div className="flex flex-col items-center space-y-6">
        {/* Logo/Icon */}
        <div className="relative">
          <div className="w-20 h-20 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg">
            <Lock className="w-10 h-10 text-white" />
          </div>
          <div className="absolute -inset-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-3xl blur-lg"></div>
        </div>

        {/* App logo */}
        <div className="bg-gradient-to-r from-altMutedBackground to-white p-4 rounded-xl shadow-inner border border-altPrimary/20">
          <Image
            src="/images/powered-by-gig-blue.png"
            alt="Company Logo"
            width={200}
            height={60}
            className="w-full h-auto max-w-[180px]"
            priority
          />
        </div>

        {/* Content */}
        <div className="text-center space-y-3">
          <h2 className="text-xl font-semibold text-yellow-600">{title}</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{message}</p>
        </div>

        {/* Action button */}
        <div className="w-full">
          <Button
            onClick={() => {
              const loginUrl = returnUrl
                ? `/api/auth/login?returnTo=${encodeURIComponent(returnUrl)}`
                : "/api/auth/login";
              window.location.href = loginUrl;
            }}
            className="w-full flex items-center justify-center bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-medium py-3 px-6 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
          >
            <Lock className="w-4 h-4 mr-2" />
            Sign In to Continue
          </Button>
        </div>

        {/* Security badge */}
        <div className="flex items-center justify-center space-x-2 text-xs text-gray-500">
          <div className="w-3 h-3 bg-green-500/20 rounded-full flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
          </div>
          <span>Secured with enterprise authentication</span>
        </div>
      </div>
    </div>
  </div>
);
