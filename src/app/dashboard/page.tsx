"use client";

import { useUser } from "@auth0/nextjs-auth0";
import Layout from "@/components/layout/Layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button/Button";
import {
  Building2,
  Users,
  Calendar,
  FileText,
  Activity,
  Clock,
  MapPin,
  TrendingUp,
  User,
} from "lucide-react";
import Image from "next/image";
import { NextPage } from "next";
import { withAuth } from "@/domains/shared";
import { useCurrentUser } from "@/domains/user";

const DashboardPage: NextPage = () => {
  const { user, error: authError, isLoading: authLoading } = useUser();
  const { data: enhancedUser, isLoading: userLoading } = useCurrentUser();

  // Show loading state
  if (authLoading || userLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
          <p className="text-gray-600 font-medium">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (authError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
            <CardDescription>
              {authError.message || "Something went wrong"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.reload()} fullWidth>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show not authenticated state
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-yellow-600">
              Authentication Required
            </CardTitle>
            <CardDescription>
              Please log in to access your dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild fullWidth>
              <a href="/auth/login">Log In</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Use enhanced user data if available, fallback to basic user data
  const displayUser =
    enhancedUser ||
    (user as { name?: string; given_name?: string; email: string });

  const quickActions = [
    {
      icon: Clock,
      label: "Time Tracking",
      color: "bg-blue-500",
      href: "/timecard",
    },
    {
      icon: Calendar,
      label: "Schedule",
      color: "bg-green-500",
      href: "/schedule",
    },
    {
      icon: FileText,
      label: "Documents",
      color: "bg-purple-500",
      href: "/documents",
    },
    { icon: Users, label: "Team", color: "bg-orange-500", href: "/team" },
  ];

  const stats = [
    {
      label: "Hours This Week",
      value: "32.5",
      icon: Clock,
      color: "text-blue-600",
    },
    {
      label: "Tasks Completed",
      value: "12",
      icon: Activity,
      color: "text-green-600",
    },
    {
      label: "Team Members",
      value: "8",
      icon: Users,
      color: "text-purple-600",
    },
    {
      label: "Projects Active",
      value: "3",
      icon: TrendingUp,
      color: "text-orange-600",
    },
  ];

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Current Tenant Info */}
        {enhancedUser?.tenant && (
          <Card className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {enhancedUser.tenant.tenantLogo ? (
                    <Image
                      src={enhancedUser.tenant.tenantLogo}
                      alt="tenant logo"
                      width={48}
                      height={48}
                      className="rounded-lg object-cover bg-white/20 p-1"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                      <Building2 className="w-6 h-6" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-xl font-semibold">
                      {enhancedUser.tenant.clientName}
                    </h3>
                    <p className="text-blue-100">
                      <MapPin className="w-4 h-4 inline mr-1" />
                      {enhancedUser.tenant.url}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className="bg-white/20 text-white border-white/30"
                >
                  {enhancedUser.tenant.type}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <Card
              key={index}
              className="bg-white hover:shadow-md transition-shadow"
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      {stat.label}
                    </p>
                    <p className="text-2xl font-bold text-gray-900">
                      {stat.value}
                    </p>
                  </div>
                  <div className={`p-3 rounded-full bg-gray-100 ${stat.color}`}>
                    <stat.icon className="w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <div>
          <h3 className="text-xl font-semibold text-gray-900 mb-6">
            Quick Actions
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action, index) => (
              <Card
                key={index}
                className="bg-white hover:shadow-md transition-all cursor-pointer group"
              >
                <CardContent className="p-6 text-center">
                  <div
                    className={`w-12 h-12 ${action.color} rounded-lg mx-auto mb-4 flex items-center justify-center group-hover:scale-110 transition-transform`}
                  >
                    <action.icon className="w-6 h-6 text-white" />
                  </div>
                  <p className="font-medium text-gray-900">{action.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* User Information */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <User className="w-5 h-5" />
                <span>User Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Email
                  </label>
                  <p className="text-gray-900">{displayUser.email}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Name
                  </label>
                  <p className="text-gray-900">{displayUser.name}</p>
                </div>
                {enhancedUser?._id && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      User ID
                    </label>
                    <p className="text-gray-900 font-mono text-sm">
                      {enhancedUser._id}
                    </p>
                  </div>
                )}
                {enhancedUser?.applicantId && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Applicant ID
                    </label>
                    <p className="text-gray-900 font-mono text-sm">
                      {enhancedUser.applicantId}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Debug Information - Only show in development */}
          {process.env.NODE_ENV === "development" && (
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="text-gray-700">
                  Debug Information
                </CardTitle>
                <CardDescription>Development mode only</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-sm text-gray-600 mb-2">
                      Auth0 User Data
                    </h4>
                    <pre className="bg-gray-800 text-white p-3 rounded text-xs overflow-auto max-h-48">
                      {JSON.stringify(user, null, 2)}
                    </pre>
                  </div>
                  {enhancedUser && (
                    <div>
                      <h4 className="font-semibold text-sm text-gray-600 mb-2">
                        Enhanced User Data
                      </h4>
                      <pre className="bg-gray-800 text-white p-3 rounded text-xs overflow-auto max-h-48">
                        {JSON.stringify(enhancedUser, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default withAuth(DashboardPage, {
  requireAuth: true,
});
