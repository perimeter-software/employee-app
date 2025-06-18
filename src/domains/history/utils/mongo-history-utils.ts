import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import { GignologyUser } from '@/domains/user/types/user.types';
import { GignologyJob } from '@/domains/job/types/job.types';

export async function historyUserDataPipeline(db: Db, email: string) {
  try {
    const pipeline = [
      // Match user by email
      {
        $match: { emailAddress: email },
      },
      // Lookup applicant data
      {
        $lookup: {
          from: 'applicants',
          let: { applicantId: '$applicantId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$_id', { $toObjectId: '$$applicantId' }],
                },
              },
            },
            {
              $project: {
                jobs: 1,
              },
            },
          ],
          as: 'applicantData',
        },
      },
      // Unwind applicant data
      {
        $unwind: {
          path: '$applicantData',
          preserveNullAndEmptyArrays: true,
        },
      },
      // Filter applicant jobs where jobSlug is a string
      {
        $addFields: {
          filteredApplicantJobs: {
            $filter: {
              input: '$applicantData.jobs',
              as: 'job',
              cond: {
                $eq: [{ $type: '$$job.jobSlug' }, 'string'],
              },
            },
          },
        },
      },
      // Lookup job data
      {
        $lookup: {
          from: 'jobs',
          let: {
            jobSlugs: {
              $ifNull: [
                {
                  $map: {
                    input: '$filteredApplicantJobs',
                    as: 'job',
                    in: '$$job.jobSlug',
                  },
                },
                [],
              ],
            },
            applicantJobs: '$filteredApplicantJobs',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ['$jobSlug', '$$jobSlugs'] },
                    {
                      $eq: [{ $type: '$shiftJob' }, 'string'],
                    },
                    { $eq: ['$shiftJob', 'Yes'] },
                  ],
                },
              },
            },
            {
              $addFields: {
                applicantJobInfo: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$$applicantJobs',
                        as: 'appJob',
                        cond: {
                          $eq: ['$$appJob.jobSlug', '$jobSlug'],
                        },
                      },
                    },
                    0,
                  ],
                },
              },
            },
            {
              $project: {
                _id: 1,
                title: 1,
                jobId: 1,
                jobSlug: 1,
                companySlug: 1,
                venueSlug: 1,
                jobShiftSettings: 1,
                shifts: 1,
                shiftJob: 1,
                additionalConfig: 1,
                status: '$applicantJobInfo.status',
                applicantStatus: '$applicantJobInfo.applicantStatus',
              },
            },
          ],
          as: 'filteredJobs',
        },
      },
      // Final projection
      {
        $project: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          emailAddress: 1,
          userType: 1,
          employeeType: 1,
          status: 1,
          applicantId: 1,
          jobs: '$filteredJobs',
        },
      },
    ];

    const result = await db.collection('users').aggregate(pipeline).toArray();

    if (result.length === 0) {
      return undefined;
    }

    const userWithFilteredJobs = result[0];
    const convertedUser = convertToJSON(userWithFilteredJobs) as GignologyUser;

    return convertedUser ? convertedUser : undefined;
  } catch (e) {
    console.error('Error executing user-applicant-job pipeline:', e);
    return undefined;
  }
}

export async function attachPunchesToJobs(
  db: Db,
  userId: string,
  applicantId: string,
  jobs: GignologyJob[]
) {
  try {
    // Calculate the start and end of the current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

    // Fetch punches for the user within the current month
    const punches = await db
      .collection('timecards')
      .aggregate([
        {
          $match: {
            userId: new ObjectId(userId),
            applicantId: new ObjectId(applicantId),
            timeIn: {
              $gte: startOfMonth,
              $lte: endOfMonth,
            },
          },
        },
        {
          $project: {
            jobId: 1,
            timeIn: 1,
            timeOut: 1,
            // Add any other relevant punch fields here
          },
        },
        {
          $sort: { timeIn: -1 }, // Sort punches in descending order (most recent first)
        },
      ])
      .toArray();

    // If no punches found, return the original jobs array
    if (punches.length === 0) {
      return jobs;
    }

    // Create a map of jobId to punches for faster lookup
    const punchesMap = punches.reduce((acc, punch) => {
      const jobId = punch.jobId.toString();
      if (!acc[jobId]) {
        acc[jobId] = [];
      }
      acc[jobId].push(punch);
      return acc;
    }, {});

    // Attach punches to each job
    const updatedJobs = jobs.map((job) => {
      const jobPunches = punchesMap[job._id.toString()] || [];
      return {
        ...job,
        punches: jobPunches,
      };
    });

    return updatedJobs;
  } catch (error) {
    console.error('Error attaching punches to jobs:', error);
    return jobs; // Return original jobs array if an error occurs
  }
}
