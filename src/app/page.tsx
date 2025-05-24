// app/page.tsx
"use client";

import { useUser } from "@auth0/nextjs-auth0";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Image from "next/image";

interface NotificationState {
  message: string;
  level: "info" | "warning" | "error" | "success";
  show: boolean;
}

export default function LoginPage() {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [notification, setNotification] = useState<NotificationState>({
    message: "",
    level: "info",
    show: false,
  });

  useEffect(() => {
    // Handle various URL parameters for notifications
    const expired = searchParams.get("expired");
    const loggedOut = searchParams.get("loggedout");
    const error = searchParams.get("error");

    if (expired) {
      setNotification({
        message: "Please sign in again.",
        level: "warning",
        show: true,
      });
    } else if (loggedOut) {
      setNotification({
        message: "You have successfully logged out.",
        level: "info",
        show: true,
      });
    } else if (error) {
      let message = "Error logging in, try again shortly.";

      if (error === "no-tenant") {
        message = "No active tenant found for your account.";
      } else if (error === "user-not-found") {
        message = "Account not found. Please contact support.";
      }

      setNotification({
        message,
        level: "error",
        show: true,
      });
    }

    // Auto-hide notification after 5 seconds
    if (notification.show) {
      const timer = setTimeout(() => {
        setNotification((prev) => ({ ...prev, show: false }));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, notification.show]);

  // Redirect if user is already authenticated
  useEffect(() => {
    if (user && !isLoading) {
      router.push("/dashboard");
    }
  }, [user, isLoading, router]);

  const handleLogin = () => {
    const returnUrl = searchParams.get("returnUrl") || "/dashboard";
    // v4 uses /auth/login instead of /api/auth/login
    window.location.href = `/auth/login?returnTo=${encodeURIComponent(
      returnUrl
    )}`;
  };

  if (isLoading) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </main>
    );
  }

  return (
    <main>
      {/* Notification Banner */}
      {notification.show && (
        <div
          className={`fixed top-0 left-0 right-0 z-50 p-4 ${
            notification.level === "error"
              ? "bg-red-100 border-red-400 text-red-700"
              : notification.level === "warning"
              ? "bg-yellow-100 border-yellow-400 text-yellow-700"
              : notification.level === "success"
              ? "bg-green-100 border-green-400 text-green-700"
              : "bg-blue-100 border-blue-400 text-blue-700"
          } border-b`}
        >
          <div className="max-w-md mx-auto text-center">
            {notification.message}
          </div>
        </div>
      )}

      <div className="flex flex-col items-center justify-center mt-4 h-screen flex-grow">
        <div className="flex flex-auto flex-col items-center justify-center bg-no-repeat w-full h-full max-h-[932px] max-w-[430px] bg-signin bg-contain">
          <div className="flex flex-col items-center justify-items-center p-4">
            <Image
              src="/images/powered-by-gig-blue.png"
              alt="logo"
              width={300}
              height={100}
              className="w-full h-auto"
              priority
            />
            <div className="flex grow flex-row w-full items-center justify-center mt-1">
              <Button
                onClick={handleLogin}
                variant="primary"
                size="lg"
                className="w-full"
                type="button"
              >
                Proceed To Sign In
              </Button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
