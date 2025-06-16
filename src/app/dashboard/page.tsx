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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/ToggleGroup";
import React from "react";

const DashboardPage: NextPage = () => {
  const { user, error: authError, isLoading: authLoading } = useUser();
  const { data: enhancedUser, isLoading: userLoading } = useCurrentUser();

  // Add state for dashboard view toggle
  const [dashboardView, setDashboardView] = React.useState<
    "monthly" | "weekly" | "calendar"
  >("monthly");

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
        {/* Dashboard View Toggle */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <ToggleGroup
            className="flex gap-0 -space-x-px rounded-sm border overflow-hidden shadow-sm shadow-black/5"
            type="single"
            variant="outline"
            value={dashboardView}
            onValueChange={(value) =>
              value && setDashboardView(value as typeof dashboardView)
            }
          >
            <ToggleGroupItem
              value="monthly"
              className="w-full rounded-none shadow-none focus-visible:z-10 text-base flex items-center justify-center gap-2 relative border-none"
            >
              Monthly
            </ToggleGroupItem>
            <ToggleGroupItem
              value="weekly"
              className="w-full rounded-none shadow-none focus-visible:z-10 text-base flex items-center justify-center gap-2 relative border-none"
            >
              Weekly
            </ToggleGroupItem>
            <ToggleGroupItem
              value="calendar"
              className="w-full rounded-none shadow-none focus-visible:z-10 text-base flex items-center justify-center gap-2 relative border-none"
            >
              Calendar
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Conditional Dashboard Content */}
        {dashboardView === "monthly" && (
          <div className="space-y-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">
                        Total days
                      </p>
                      <p className="text-2xl font-bold text-blue-600">119</p>
                      <p className="text-xs text-red-500 mt-1">
                        ▼ 2 days from previous year
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">
                        Avg monthly
                      </p>
                      <p className="text-2xl font-bold text-green-600">20</p>
                      <p className="text-xs text-red-500 mt-1">
                        ▼ 1.6 days from previous year
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">
                        Best month
                      </p>
                      <p className="text-2xl font-bold text-yellow-600">23</p>
                      <p className="text-xs text-green-600 mt-1">
                        ▲ 2 days from previous year
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">
                        Lowest month
                      </p>
                      <p className="text-2xl font-bold text-red-600">15</p>
                      <p className="text-xs text-red-500 mt-1">
                        ▼ 1.5 days from previous year
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Attendance Trends Bar Chart */}
            <Card>
              <CardContent className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      2025 Attendance Trends
                    </h3>
                    <p className="text-sm text-gray-500">
                      Year-to-date employee attendance (Jan - Jun)
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-green-600 font-medium">
                      Peak: June (23 days)
                    </span>
                    <span className="text-xs text-red-600 font-medium">
                      Low: March (15 days)
                    </span>
                    <span className="text-xs text-blue-600 font-medium">
                      YTD Attendance: 88%
                    </span>
                  </div>
                </div>
                {/* Placeholder for Bar Chart */}
                <div className="w-full h-64 bg-gray-100 flex items-center justify-center rounded">
                  <span className="text-gray-400">[Bar Chart Placeholder]</span>
                </div>
              </CardContent>
            </Card>

            {/* Today's Attendance & Weekly Shift Details */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Today's Attendance */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="text-base">
                    Today&apos;s Attendance
                  </CardTitle>
                  <CardDescription>
                    Live employee check-in status
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Placeholder for attendance list */}
                  <ul className="divide-y divide-gray-200">
                    <li className="py-2 flex justify-between items-center">
                      <span>Olivia Martin</span>
                      <span className="text-xs text-gray-500">
                        Checked in at 08:45 AM
                      </span>
                      <span className="text-xs text-gray-700 font-semibold">
                        8h 30m
                      </span>
                    </li>
                    <li className="py-2 flex justify-between items-center">
                      <span>Jackson Lee</span>
                      <span className="text-xs text-gray-500">
                        Checked in at 09:15 AM
                      </span>
                      <span className="text-xs text-gray-700 font-semibold">
                        7h 45m
                      </span>
                    </li>
                    <li className="py-2 flex justify-between items-center">
                      <span>Isabella Nguyen</span>
                      <span className="text-xs text-gray-500">
                        Checked in at 08:30 AM
                      </span>
                      <span className="text-xs text-gray-700 font-semibold">
                        8h 45m
                      </span>
                    </li>
                    <li className="py-2 flex justify-between items-center">
                      <span>William Kim</span>
                      <span className="text-xs text-gray-500">
                        Not checked in
                      </span>
                      <span className="text-xs text-gray-400">--</span>
                    </li>
                    <li className="py-2 flex justify-between items-center">
                      <span>John Doe</span>
                      <span className="text-xs text-gray-500">
                        Not checked in
                      </span>
                      <span className="text-xs text-gray-400">--</span>
                    </li>
                    <li className="py-2 flex justify-between items-center">
                      <span>Sofia Davis</span>
                      <span className="text-xs text-gray-500">
                        Check in at 08:00 AM
                      </span>
                      <span className="text-xs text-gray-700 font-semibold">
                        9h 15m
                      </span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              {/* Weekly Shift Details Table */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Weekly Shift Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Placeholder for shift details table */}
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm text-left">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="px-4 py-2 font-medium text-gray-600">
                              Date
                            </th>
                            <th className="px-4 py-2 font-medium text-gray-600">
                              Job/Site
                            </th>
                            <th className="px-4 py-2 font-medium text-gray-600">
                              Start - End Time
                            </th>
                            <th className="px-4 py-2 font-medium text-gray-600">
                              Punches
                            </th>
                            <th className="px-4 py-2 font-medium text-gray-600">
                              Total Hours
                            </th>
                            <th className="px-4 py-2 font-medium text-gray-600">
                              Location
                            </th>
                            <th className="px-4 py-2 font-medium text-gray-600">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          <tr>
                            <td className="px-4 py-2">06/05/2025</td>
                            <td className="px-4 py-2">Office</td>
                            <td className="px-4 py-2">
                              08:00 AM to 11:00 AM
                              <br />
                              01:00 PM to 03:00 PM
                            </td>
                            <td className="px-4 py-2">2</td>
                            <td className="px-4 py-2">5 Hours</td>
                            <td className="px-4 py-2">In Geofence</td>
                            <td className="px-4 py-2 text-green-600 font-semibold">
                              Complete
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-2">06/06/2025</td>
                            <td className="px-4 py-2">Warehouse A</td>
                            <td className="px-4 py-2">09:00 AM to 05:30 PM</td>
                            <td className="px-4 py-2">1</td>
                            <td className="px-4 py-2">7.5 Hours</td>
                            <td className="px-4 py-2">In Geofence</td>
                            <td className="px-4 py-2 text-green-600 font-semibold">
                              Complete
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-2">06/07/2025</td>
                            <td className="px-4 py-2">Office</td>
                            <td className="px-4 py-2">08:30 AM to 04:55 PM</td>
                            <td className="px-4 py-2">1</td>
                            <td className="px-4 py-2">8.25 Hours</td>
                            <td className="px-4 py-2 text-red-600">
                              Outside Geofence
                            </td>
                            <td className="px-4 py-2 text-yellow-600 font-semibold">
                              Geofence Violation
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-2">06/05/2025</td>
                            <td className="px-4 py-2">Office</td>
                            <td className="px-4 py-2">08:30 AM to 04:45 PM</td>
                            <td className="px-4 py-2">1</td>
                            <td className="px-4 py-2">8.25 Hours</td>
                            <td className="px-4 py-2">In Geofence</td>
                            <td className="px-4 py-2 text-green-600 font-semibold">
                              Complete
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-2">06/06/2025</td>
                            <td className="px-4 py-2">Warehouse B</td>
                            <td className="px-4 py-2">--</td>
                            <td className="px-4 py-2">0</td>
                            <td className="px-4 py-2">0 Hours</td>
                            <td className="px-4 py-2 text-red-600">
                              Outside Geofence
                            </td>
                            <td className="px-4 py-2 text-red-600 font-semibold">
                              Absent
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-2">06/07/2025</td>
                            <td className="px-4 py-2">Warehouse C</td>
                            <td className="px-4 py-2">10:00 AM to 04:30 PM</td>
                            <td className="px-4 py-2">1</td>
                            <td className="px-4 py-2">6.5 Hours</td>
                            <td className="px-4 py-2 text-red-600">
                              Outside Geofence
                            </td>
                            <td className="px-4 py-2 text-yellow-600 font-semibold">
                              Geofence Violation
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Monthly Insights & Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Monthly Insights & Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                  <span className="font-medium text-gray-700">
                    Productivity Trend
                  </span>
                  <span className="text-gray-500">
                    Your productivity peaked on June with 23-day attendance.
                    Consider scheduling important tasks on similar high-energy
                    days.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                  <span className="font-medium text-gray-700">
                    Geofence Alert
                  </span>
                  <span className="text-gray-500">
                    2 geofence violations detected this month. Review location
                    tracking settings and ensure proper check-in procedures.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                  <span className="font-medium text-gray-700">
                    Goal Progress
                  </span>
                  <span className="text-gray-500">
                    You&apos;re 96% towards your monthly target of 22-25 days.
                    Maintain current pace to exceed expectations.
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        {dashboardView === "weekly" && (
          <div className="space-y-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">
                        Total hours this week
                      </p>
                      <p className="text-2xl font-bold text-blue-600">
                        38.5 hrs
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        ▲ 2.5 hrs from last week
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">
                        Shifts Completed
                      </p>
                      <p className="text-2xl font-bold text-green-600">5</p>
                      <p className="text-xs text-red-500 mt-1">
                        ▼ 3 shifts from last month
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">
                        Absences
                      </p>
                      <p className="text-2xl font-bold text-yellow-600">1</p>
                      <p className="text-xs text-red-500 mt-1">
                        ▲ 1 from last month
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">
                        Geofence Violation
                      </p>
                      <p className="text-2xl font-bold text-red-600">2</p>
                      <p className="text-xs text-red-500 mt-1">New</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Daily Trends Line Chart & Performance Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Daily Trends Line Chart */}
              <Card className="lg:col-span-2">
                <CardContent className="p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Daily Trends
                      </h3>
                      <p className="text-sm text-gray-500">
                        Week of June 1 - June 7, 2025
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-gray-600 font-medium">
                        Total Break Time: 4.32 hrs
                      </span>
                      <span className="text-xs text-blue-600 font-medium">
                        Productivity Score: 92%
                      </span>
                      <span className="text-xs text-yellow-600 font-medium">
                        Efficiency Rating: 88%
                      </span>
                    </div>
                  </div>
                  {/* Placeholder for Line Chart */}
                  <div className="w-full h-64 bg-gray-100 flex items-center justify-center rounded">
                    <span className="text-gray-400">
                      [Line Chart Placeholder]
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Performance Summary */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="text-base">
                    Performance Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">On-time Rate</span>
                    <span className="font-semibold text-green-600">80%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Avg Hours/Day</span>
                    <span className="font-semibold text-blue-600">7.7 hrs</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Violation Rate</span>
                    <span className="font-semibold text-red-600">40%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Attendance Rate</span>
                    <span className="font-semibold text-green-600">86%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Overtime Rate</span>
                    <span className="font-semibold text-blue-600">3.5 hrs</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Weekly Shift Details Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Weekly Shift Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Placeholder for shift details table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm text-left">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 font-medium text-gray-600">
                          Date
                        </th>
                        <th className="px-4 py-2 font-medium text-gray-600">
                          Job/Site
                        </th>
                        <th className="px-4 py-2 font-medium text-gray-600">
                          Start - End Time
                        </th>
                        <th className="px-4 py-2 font-medium text-gray-600">
                          Punches
                        </th>
                        <th className="px-4 py-2 font-medium text-gray-600">
                          Total Hours
                        </th>
                        <th className="px-4 py-2 font-medium text-gray-600">
                          Location
                        </th>
                        <th className="px-4 py-2 font-medium text-gray-600">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      <tr>
                        <td className="px-4 py-2">06/05/2025</td>
                        <td className="px-4 py-2">Office</td>
                        <td className="px-4 py-2">
                          08:00 AM to 11:00 AM
                          <br />
                          01:00 PM to 03:00 PM
                        </td>
                        <td className="px-4 py-2">2</td>
                        <td className="px-4 py-2">5 Hours</td>
                        <td className="px-4 py-2">In Geofence</td>
                        <td className="px-4 py-2 text-green-600 font-semibold">
                          Complete
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2">06/06/2025</td>
                        <td className="px-4 py-2">Warehouse A</td>
                        <td className="px-4 py-2">09:00 AM to 05:30 PM</td>
                        <td className="px-4 py-2">1</td>
                        <td className="px-4 py-2">7.5 Hours</td>
                        <td className="px-4 py-2">In Geofence</td>
                        <td className="px-4 py-2 text-green-600 font-semibold">
                          Complete
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2">06/07/2025</td>
                        <td className="px-4 py-2">Office</td>
                        <td className="px-4 py-2">08:30 AM to 04:55 PM</td>
                        <td className="px-4 py-2">1</td>
                        <td className="px-4 py-2">8.25 Hours</td>
                        <td className="px-4 py-2 text-red-600">
                          Outside Geofence
                        </td>
                        <td className="px-4 py-2 text-yellow-600 font-semibold">
                          Geofence Violation
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2">06/05/2025</td>
                        <td className="px-4 py-2">Office</td>
                        <td className="px-4 py-2">08:30 AM to 04:45 PM</td>
                        <td className="px-4 py-2">1</td>
                        <td className="px-4 py-2">8.25 Hours</td>
                        <td className="px-4 py-2">In Geofence</td>
                        <td className="px-4 py-2 text-green-600 font-semibold">
                          Complete
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2">06/06/2025</td>
                        <td className="px-4 py-2">Warehouse B</td>
                        <td className="px-4 py-2">--</td>
                        <td className="px-4 py-2">0</td>
                        <td className="px-4 py-2">0 Hours</td>
                        <td className="px-4 py-2 text-red-600">
                          Outside Geofence
                        </td>
                        <td className="px-4 py-2 text-red-600 font-semibold">
                          Absent
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2">06/07/2025</td>
                        <td className="px-4 py-2">Warehouse C</td>
                        <td className="px-4 py-2">10:00 AM to 04:30 PM</td>
                        <td className="px-4 py-2">1</td>
                        <td className="px-4 py-2">6.5 Hours</td>
                        <td className="px-4 py-2 text-red-600">
                          Outside Geofence
                        </td>
                        <td className="px-4 py-2 text-yellow-600 font-semibold">
                          Geofence Violation
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Weekly Insights & Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Weekly Insights & Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                  <span className="font-medium text-gray-700">
                    Productivity Trend
                  </span>
                  <span className="text-gray-500">
                    Your productivity peaked on Tuesday with 8.2 hours. Consider
                    scheduling important tasks on similar high-energy days.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                  <span className="font-medium text-gray-700">
                    Geofence Alert
                  </span>
                  <span className="text-gray-500">
                    2 geofence violations detected this week. Review location
                    tracking settings and ensure proper check-in procedures.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                  <span className="font-medium text-gray-700">
                    Goal Progress
                  </span>
                  <span className="text-gray-500">
                    You&apos;re 96% towards your weekly target of 40 hours.
                    Maintain current pace to exceed expectations.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block"></span>
                  <span className="font-medium text-gray-700">
                    Schedule Optimization
                  </span>
                  <span className="text-gray-500">
                    Your Friday performance dropped significantly. Consider
                    lighter workload or schedule adjustments for end-of-week
                    periods.
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        {dashboardView === "calendar" && (
          <div className="space-y-8">
            {/* Stats Cards (same as weekly) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">
                        Total hours this week
                      </p>
                      <p className="text-2xl font-bold text-blue-600">
                        38.5 hrs
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        ▲ 2.5 hrs from last week
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">
                        Shifts Completed
                      </p>
                      <p className="text-2xl font-bold text-green-600">5</p>
                      <p className="text-xs text-red-500 mt-1">
                        ▼ 3 shifts from last month
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">
                        Absences
                      </p>
                      <p className="text-2xl font-bold text-yellow-600">1</p>
                      <p className="text-xs text-red-500 mt-1">
                        ▲ 1 from last month
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">
                        Geofence Violation
                      </p>
                      <p className="text-2xl font-bold text-red-600">2</p>
                      <p className="text-xs text-red-500 mt-1">New</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Attendance Trends Bar Chart */}
            <Card>
              <CardContent className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      2025 Attendance Trends
                    </h3>
                    <p className="text-sm text-gray-500">
                      Year-to-date employee attendance (Jan - Jun)
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-green-600 font-medium">
                      Peak: June (23 days)
                    </span>
                    <span className="text-xs text-red-600 font-medium">
                      Low: March (15 days)
                    </span>
                    <span className="text-xs text-blue-600 font-medium">
                      YTD Attendance: 88%
                    </span>
                  </div>
                </div>
                {/* Placeholder for Bar Chart */}
                <div className="w-full h-64 bg-gray-100 flex items-center justify-center rounded">
                  <span className="text-gray-400">[Bar Chart Placeholder]</span>
                </div>
              </CardContent>
            </Card>

            {/* Today's Attendance & Calendar Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Today's Attendance */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="text-base">
                    Today&apos;s Attendance
                  </CardTitle>
                  <CardDescription>
                    Live employee check-in status
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Placeholder for attendance list */}
                  <ul className="divide-y divide-gray-200">
                    <li className="py-2 flex justify-between items-center">
                      <span>Olivia Martin</span>
                      <span className="text-xs text-gray-500">
                        Checked in at 08:45 AM
                      </span>
                      <span className="text-xs text-gray-700 font-semibold">
                        8h 30m
                      </span>
                    </li>
                    <li className="py-2 flex justify-between items-center">
                      <span>Jackson Lee</span>
                      <span className="text-xs text-gray-500">
                        Checked in at 09:15 AM
                      </span>
                      <span className="text-xs text-gray-700 font-semibold">
                        7h 45m
                      </span>
                    </li>
                    <li className="py-2 flex justify-between items-center">
                      <span>Isabella Nguyen</span>
                      <span className="text-xs text-gray-500">
                        Checked in at 08:30 AM
                      </span>
                      <span className="text-xs text-gray-700 font-semibold">
                        8h 45m
                      </span>
                    </li>
                    <li className="py-2 flex justify-between items-center">
                      <span>William Kim</span>
                      <span className="text-xs text-gray-500">
                        Not checked in
                      </span>
                      <span className="text-xs text-gray-400">--</span>
                    </li>
                    <li className="py-2 flex justify-between items-center">
                      <span>John Doe</span>
                      <span className="text-xs text-gray-500">
                        Not checked in
                      </span>
                      <span className="text-xs text-gray-400">--</span>
                    </li>
                    <li className="py-2 flex justify-between items-center">
                      <span>Sofia Davis</span>
                      <span className="text-xs text-gray-500">
                        Check in at 08:00 AM
                      </span>
                      <span className="text-xs text-gray-700 font-semibold">
                        9h 15m
                      </span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              {/* Calendar Grid Placeholder */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Weekly Shift Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Placeholder for calendar grid */}
                    <div className="w-full h-96 bg-gray-100 flex items-center justify-center rounded">
                      <span className="text-gray-400">
                        [Calendar Grid Placeholder]
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Insights & Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Insights & Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                  <span className="font-medium text-gray-700">
                    Productivity Trend
                  </span>
                  <span className="text-gray-500">
                    Your productivity peaked on June with 23-day attendance.
                    Consider scheduling important tasks on similar high-energy
                    days.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                  <span className="font-medium text-gray-700">
                    Geofence Alert
                  </span>
                  <span className="text-gray-500">
                    2 geofence violations detected this month. Review location
                    tracking settings and ensure proper check-in procedures.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                  <span className="font-medium text-gray-700">
                    Goal Progress
                  </span>
                  <span className="text-gray-500">
                    You&apos;re 96% towards your monthly target of 22-25 days.
                    Maintain current pace to exceed expectations.
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </Layout>
  );
};

export default withAuth(DashboardPage, {
  requireAuth: true,
});
