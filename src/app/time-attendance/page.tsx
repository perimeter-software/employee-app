// app/time-attendance/page.tsx
"use client";

import Layout from "@/components/layout/Layout";
import { TimeTrackerContainer } from "@/domains/punch";
import { withAuth } from "@/domains/shared";

function TimeAttendancePage() {
  return (
    <Layout title="Time Attendance">
      <TimeTrackerContainer />
    </Layout>
  );
}

export default withAuth(TimeAttendancePage, {
  requireAuth: true,
});
