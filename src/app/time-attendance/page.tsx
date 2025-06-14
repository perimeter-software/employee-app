// app/time-attendance/page.tsx
"use client";

import Layout from "@/components/layout/Layout";
import { TimeTrackerContainer } from "@/domains/punch";

export default function TimeAttendancePage() {
  return (
    <Layout title="Time Attendance">
      <TimeTrackerContainer />
    </Layout>
  );
}
