import { startOfDay, format } from "date-fns";
import { v4 as uuidv4 } from "uuid";

import type {
  LeaveRequest,
  Punch,
  PunchWithJobInfo,
  PunchWJobInfoDayHours,
} from "@/domains/punch";
import { DisplayJob, GignologyJob } from "@/domains/job";
import { SelectedRange } from "@/domains/shared/types";
import {
  calculateHours,
  giveDayOfWeek,
  isValidDate,
  parseUTCDate,
  toUserTimezone,
} from "./date-utils";
import { hasForgottenToClockOut } from "@/domains/punch/utils/shift-job-utils";

export function processJobPunches(
  jobsWithPunches: (GignologyJob & { punches: Punch[] })[],
  selectedWeek: SelectedRange & { clientWeek: string[] },
  daysOfWeek: string[]
) {
  return jobsWithPunches.map((job) => {
    const daysMap = new Map();

    // Initialize the map with the user's preferred days order
    for (const day of daysOfWeek) {
      daysMap.set(day, {
        day,
        totalHours: 0,
        multiplePunches: false,
        details: [],
        id: uuidv4(),
      });
    }

    // Add the total for each job
    daysMap.set("Total", {
      day: "Total",
      totalHours: 0,
      multiplePunches: false,
      details: [],
      id: uuidv4(),
    });

    if (job.punches && job.punches.length > 0) {
      for (const punch of job.punches) {
        // Parse ISO string dates
        const punchInDate = toUserTimezone(parseUTCDate(punch.timeIn));
        if (!isValidDate(punchInDate)) {
          // console.error(`Invalid timeIn date for punch: ${punch._id}`);
          continue;
        }

        const includeDate = selectedWeek.dates.some((date) => {
          const zonedDate = toUserTimezone(date);
          return (
            startOfDay(punchInDate).getTime() ===
            startOfDay(zonedDate).getTime()
          );
        });

        if (!includeDate) continue;

        const start = punchInDate.toISOString();
        const end = punch.timeOut
          ? toUserTimezone(parseUTCDate(punch.timeOut))
          : new Date();
        if (punch.timeOut && !isValidDate(end)) {
          // console.error(`Invalid timeOut date for punch: ${punch._id}`);
          continue;
        }
        const openPunch = !punch.timeOut;

        const dayString = format(punchInDate, "EEE");

        // Use clientWeek to determine the day
        const day = dayString;
        const hours = calculateHours(start, end.toISOString());

        const totalJobHoursData = daysMap.get("Total");
        totalJobHoursData.totalHours += hours;

        const dayData = daysMap.get(day);
        // Stuff the original punch into the object
        dayData.originalPunch = { ...punch };
        dayData.totalHours += hours;
        const punchDetail = {
          id: punch._id,
          hours: hours,
          originalPunch: { ...punch },
          openPunch,
        };
        dayData.details.push(punchDetail);

        if (dayData.details.length > 1) {
          dayData.multiplePunches = true;
        }
        if (dayData.details.length === 1) {
          // If there's only one punch, include the id in the parent
          dayData.id = punchDetail.id;
        }
      }
    }

    // Ensure all days are included in the result, even if there are no punches
    const processedPunches = Array.from(daysMap.values()).map((dayData) => {
      if (dayData.day !== "Total" && dayData.details.length === 0) {
        return { ...dayData, id: uuidv4() }; // Assign a new ID for days with no punches
      }
      return dayData;
    });
    // console.log('processedPunches', processedPunches);
    return {
      ...job,
      punches: processedPunches,
    };
  });
}

// TODO adjust as necessary when timeoff gets implemented
export function processTimeoff(
  timeOffRequests: LeaveRequest[],
  daysOfWeek: string[]
) {
  const timeoffMap = new Map();

  // Initialize the map
  timeoffMap.set("Timeoff", {
    day: "Timeoff",
    hours: 0,
    type: "",
    id: uuidv4(),
    details: [],
  });
  for (const day of daysOfWeek) {
    timeoffMap.set(day, {
      day,
      hours: 0,
      type: "",
      id: uuidv4(),
      details: [],
      multiplePunches: false,
    });
  }
  timeoffMap.set("Total", {
    day: "Total",
    hours: 0,
    type: "",
    id: uuidv4(),
    details: [],
  });

  if (timeOffRequests && timeOffRequests.length > 0) {
    for (const timeoff of timeOffRequests) {
      const start = toUserTimezone(
        parseUTCDate(timeoff.leaveRequest.startDate)
      );
      const end = toUserTimezone(parseUTCDate(timeoff.leaveRequest.endDate));
      const dayString = format(start, "EEE");
      const timeoffDay = dayString;
      const hours = calculateHours(start.toISOString(), end.toISOString());

      const totaltimeoffData = timeoffMap.get("Total");
      totaltimeoffData.hours += hours;

      const timeoffData = timeoffMap.get(timeoffDay);
      // Stuff the original timeoff into the object
      timeoffData.originalTimeoff = { ...timeoff };
      timeoffData.type = timeoff.leaveRequest.leaveRequestType;
      timeoffData.hours += hours;

      const punchDetail = {
        id: timeoff._id || uuidv4(),
        hours: hours,
        type: timeoff.leaveRequest.leaveRequestType,
      };
      timeoffData.details.push(punchDetail);

      if (timeoffData.details.length > 1) {
        timeoffData.multiplePunches = true;
      } else {
        // If there's only one timeoff entry, include the id in the parent
        timeoffData.id = punchDetail.id;
      }
    }
  }

  return Array.from(timeoffMap.values());
}

export function calculateTotals(
  displayJobs: DisplayJob[],
  displayTimeoff: LeaveRequest[],
  daysOfWeek: string[]
) {
  const totalMap = new Map();

  totalMap.set("Totals", { day: "Totals", hours: 0, id: uuidv4() });
  for (const day of daysOfWeek) {
    totalMap.set(day, { day, hours: 0, id: uuidv4() });
  }
  totalMap.set("Total", { day: "Total", hours: 0, id: uuidv4() });

  // Calculate totals from job punches
  for (const job of displayJobs) {
    for (const punch of job.punches) {
      const day = punch.day;
      const hours = punch.totalHours;
      const totalData = totalMap.get(day);
      totalData.hours += hours;
    }
  }

  // Add time off hours to totals
  for (const timeoff of displayTimeoff) {
    if (timeoff.day === "Timeoff" || timeoff.day === "Total") continue;

    const day = timeoff.day;
    const hours = timeoff.hours;
    const totalData = totalMap.get(day);
    totalData.hours += hours;
    const totalOfTotals = totalMap.get("Total");
    totalOfTotals.hours += hours;
  }

  return Array.from(totalMap.values());
}

export function processHistoricalPunches(
  authedUserJobs: GignologyJob[],
  currentTime: string
): PunchWJobInfoDayHours[] {
  // Loop through the jobs, checking to make sure the job has punches and create an array of punchWithJobInfo
  const punches: PunchWithJobInfo[] | [] = authedUserJobs?.flatMap((job) => {
    if (!Array.isArray(job.punches)) {
      return [];
    }
    return job.punches.map((punch: Punch) => {
      console.log(
        "history processing function forgotten?",
        hasForgottenToClockOut(job, punch, currentTime)
      );
      return {
        ...punch,
        shiftSlug: punch.shiftSlug || job.jobSlug,
        jobInfo: {
          _id: job._id,
          title: job.title,
          jobSlug: job.jobSlug,
          address: job.address || "",
          companyCity: job.companyCity || "",
          companyState: job.companyState || "",
          zip: job.zip || 0,
          additionalConfig: job.additionalConfig,
        },
        missingClockOut: hasForgottenToClockOut(job, punch, currentTime),
      };
    });
  });

  // Loop through the punches and add the day of the week and the hours worked
  if (punches?.length) {
    const processedPunches = punches.map((punch) => {
      const start = toUserTimezone(parseUTCDate(punch.timeIn));
      const end = punch.timeOut
        ? toUserTimezone(parseUTCDate(punch.timeOut))
        : new Date();
      const day = giveDayOfWeek(start.getDay());
      const hours = calculateHours(start.toISOString(), end.toISOString());
      return { ...punch, day, hours };
    });

    return processedPunches;
  }
  return [];
}

export async function parseFormDataWithFile(request: Request): Promise<{
  fields: Record<string, string>;
  file: File | null;
}> {
  const formData = await request.formData();

  const fields: Record<string, string> = {};
  let file: File | null = null;

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      file = value;
    } else {
      fields[key] = value;
    }
  }

  return { fields, file };
}
