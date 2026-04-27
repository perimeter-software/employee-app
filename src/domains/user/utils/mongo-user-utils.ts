// lib/server/mongoUtils.ts
import { convertToJSON } from '@/lib/utils/mongo-utils';
import { resolveS3LogoUrl } from '@/lib/utils/s3-presigned-url';
import { GignologyJob } from '@/domains/job';
import {
  TenantInfo,
  TenantDocument,
  TenantObjectsIndexed,
} from '@/domains/tenant';
import { EnhancedUser, GignologyUser } from '../types/user.types';
import { ObjectId as ObjectIdFunction, Db } from 'mongodb';

export async function checkUserExistsByEmail(
  db: Db,
  email: string
): Promise<EnhancedUser | undefined> {
  try {
    const userExists = await db.collection('users').findOne(
      { emailAddress: email },
      {
        projection: {
          _id: 1,
          applicantId: 1,
          firstName: 1,
          lastName: 1,
          emailAddress: 1,
          userType: 1,
          employeeType: 1,
          status: 1,
          tenant: 1,
          hideEmployeesDetails: 1,
        },
      }
    );

    return userExists
      ? {
          _id: userExists._id.toHexString(),
          applicantId: userExists.applicantId,
          firstName: userExists.firstName,
          lastName: userExists.lastName,
          emailAddress: userExists.emailAddress,
          userType: userExists.userType,
          employeeType: userExists.employeeType,
          status: userExists.status,
          tenant: userExists.tenant,
          hideEmployeesDetails: !!userExists.hideEmployeesDetails,
        }
      : undefined;
  } catch (e) {
    console.error('Error checking email existence in database:', e);
    return undefined;
  }
}

export async function getUserApplicantJobPipeline(db: Db, email: string) {
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
                firstName: 1,
                lastName: 1,
                email: 1,
                status: 1,
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
      // Filter applicant jobs where jobSlug is a string and handle possible null jobs array
      {
        $addFields: {
          filteredApplicantJobs: {
            $filter: {
              input: { $ifNull: ['$applicantData.jobs', []] },
              as: 'job',
              cond: {
                $and: [
                  { $ne: ['$$job', null] },
                  { $eq: [{ $type: '$$job.jobSlug' }, 'string'] },
                ],
              },
            },
          },
        },
      },
      // Lookup job data with modified shiftJob condition
      {
        $lookup: {
          from: 'jobs',
          let: {
            jobSlugs: {
              $map: {
                input: '$filteredApplicantJobs',
                as: 'job',
                in: '$$job.jobSlug',
              },
            },
            applicantJobs: '$filteredApplicantJobs',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ['$jobSlug', '$$jobSlugs'] },
                    // More flexible condition for shiftJob - convert to string if needed
                    {
                      $or: [
                        { $eq: ['$shiftJob', 'Yes'] },
                        { $eq: [{ $toString: '$shiftJob' }, 'Yes'] },
                        { $eq: ['$shiftJob', true] },
                      ],
                    },
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
                // ADD THE MISSING LOCATION FIELD HERE
                location: 1, // ✅ This was missing!
                // Also add other fields that might be needed
                address: 1,
                venueCity: 1,
                venueState: 1,
                venueZip: 1,
                companyCity: 1,
                companyState: 1,
                zip: 1,
                description: 1,
                startDate: 1,
                endDate: 1,
                // Applicant-specific job info
                status: '$applicantJobInfo.status',
                applicantStatus: '$applicantJobInfo.applicantStatus',
                dateModified: '$applicantJobInfo.dateModified',
                applyDate: '$applicantJobInfo.applyDate',
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
          applicantInfo: {
            firstName: '$applicantData.firstName',
            lastName: '$applicantData.lastName',
            email: '$applicantData.email',
            status: '$applicantData.status',
          },
        },
      },
    ];

    // Add debug logging
    console.log(`Running pipeline for email: ${email}`);

    const result = await db.collection('users').aggregate(pipeline).toArray();

    if (result.length === 0) {
      console.log(`No user found for email: ${email}`);
      return undefined;
    }

    const userWithFilteredJobs = result[0];
    console.log(
      `Found user with ${
        userWithFilteredJobs.jobs ? userWithFilteredJobs.jobs.length : 0
      } jobs`
    );

    // Add more detailed logging if needed
    if (!userWithFilteredJobs.jobs || userWithFilteredJobs.jobs.length === 0) {
      console.log('User applicant ID:', userWithFilteredJobs.applicantId);
      console.log(
        'Filtered applicant jobs:',
        userWithFilteredJobs.filteredApplicantJobs
          ? userWithFilteredJobs.filteredApplicantJobs.length
          : 0
      );
    }

    // Add debug logging to check if location is included
    if (userWithFilteredJobs.jobs && userWithFilteredJobs.jobs.length > 0) {
      userWithFilteredJobs.jobs.forEach((job: GignologyJob, index: number) => {
        console.log(`Job ${index + 1} (${job.title}):`, {
          hasLocation: !!job.location,
          locationData: job.location
            ? {
                locationName: job.location.locationName,
                latitude: job.location.latitude,
                longitude: job.location.longitude,
                hasGeocoordinates: !!job.location.geocoordinates,
              }
            : null,
        });
      });
    }

    const convertedUser = convertToJSON(userWithFilteredJobs) as GignologyUser;
    return convertedUser ? convertedUser : undefined;
  } catch (e) {
    console.error(
      `Error executing user-applicant-job pipeline for ${email}:`,
      e
    );
    return undefined;
  }
}

// Find Job by jobId
export async function findJobByjobId(db: Db, jobId: string) {
  let job: GignologyJob | undefined = undefined;

  try {
    console.log('Finding job with jobId:', jobId);

    const jobDoc = await db.collection('jobs').findOne(
      { _id: new ObjectIdFunction(jobId) },
      {
        projection: {
          _id: 1,
          title: 1,
          jobSlug: 1,
          jobId: 1,
          companySlug: 1,
          venueSlug: 1,
          shiftJob: 1,
          shifts: 1,
          additionalConfig: 1,
          location: 1,
        },
      }
    );
    if (jobDoc) {
      console.log('before conversion: ', jobDoc);
      const conversionResult = convertToJSON(jobDoc);
      job = conversionResult as GignologyJob;
      console.log('converted jobdoc: ', conversionResult);
      if (!conversionResult) {
        console.log('MongoDB conversion error');
      }
    }
    if (!job) {
      console.log('Job not found');
    }
  } catch (e) {
    console.log('Error finding job', e);
  }
  return job;
}

export async function getUserType(
  db: Db,
  userId: string
): Promise<string | undefined> {
  try {
    const user = await db.collection('users').findOne(
      { _id: new ObjectIdFunction(userId) },
      {
        projection: {
          _id: 1,
          userType: 1,
        },
      }
    );

    return user?.userType ? user.userType : undefined;
  } catch (e) {
    console.error('Error checking email existence in database:', e);
    return undefined;
  }
}

export async function checkUserMasterEmail(
  userDb: Db,
  dbTenant: Db,
  email: string
): Promise<{
  success: boolean;
  message: string;
  tenant?: TenantInfo;
  availableTenants?: string[];
  availableTenantObjects?: TenantInfo[];
}> {
  try {
    if (!email) {
      return {
        success: false,
        message: 'Missing email!',
      };
    }

    const Users = userDb.collection('users');
    const Tenants = dbTenant.collection<TenantDocument>('tenants');

    const result = await Users.findOne({ emailAddress: email.toLowerCase() });

    if (!result) {
      return {
        success: false,
        message: `Email ${email} not found!`,
      };
    }

    // Check the result.tenants array
    if (!result.tenants || !Array.isArray(result.tenants)) {
      return {
        success: false,
        message: 'Invalid user data structure',
      };
    }

    if (result.tenants.length === 0) {
      return {
        success: false,
        message: 'Tenants not found',
      };
    }

    if (result.tenants.length === 1) {
      if (result.tenants[0].status !== 'Active') {
        console.log('email exists for employee app', email);
        return {
          success: false,
          message: 'No active tenant found',
        };
      }

      const tenantObject = await Tenants.findOne({
        $or: [
          {
            clientDomain: result.tenants[0]?.url,
          },
          {
            additionalDomains: result.tenants[0]?.url,
          },
        ],
      });

      return {
        success: true,
        tenant: {
          _id: result.tenants[0]?._id ? result.tenants[0]._id.toString() : '',
          url: result.tenants[0].url,
          status: result.tenants[0].status,
          clientName: tenantObject?.clientName || '',
          type: tenantObject?.type || 'Venue',
          lastLoginDate: result.tenants[0].lastLoginDate,
          tenantLogo: await resolveS3LogoUrl(tenantObject?.tenantLogo),
          dbName: tenantObject?.dbName,
          peoIntegration: tenantObject?.peoIntegration || 'Helm',
          clientDomain: tenantObject?.clientDomain,
        },
        message: 'Email exists!',
      };
    }

    if (result.tenants.length > 1) {
      // Find the most recent active tenant
      const mostRecentActiveTenant = result.tenants.reduce<TenantInfo | null>(
        (latest, current) => {
          if (current.status !== 'Active') {
            return latest;
          }

          if (!latest || latest.status !== 'Active') {
            return current;
          }

          const latestDate = latest.lastLoginDate
            ? new Date(latest.lastLoginDate)
            : new Date(0);
          const currentDate = current.lastLoginDate
            ? new Date(current.lastLoginDate)
            : new Date(0);
          return currentDate > latestDate ? current : latest;
        },
        null
      );

      const activeTenants = result.tenants.filter(
        (item: TenantInfo) => item.status === 'Active'
      );

      const tenantObjectsIndexed: TenantObjectsIndexed = {};
      const tenantDocs = await Tenants.find({
        $or: [
          {
            clientDomain: {
              $in: activeTenants.map((tn: TenantInfo) => tn.url),
            },
          },
          {
            additionalDomains: {
              $in: activeTenants.map((tn: TenantInfo) => tn.url),
            },
          },
        ],
      }).toArray();

      const resolvedLogos = await Promise.all(
        tenantDocs.map((tn) => resolveS3LogoUrl(tn.tenantLogo))
      );

      tenantDocs.forEach((tn, idx) => {
        const tenantLogo = resolvedLogos[idx];
        if (tn.clientDomain) {
          tenantObjectsIndexed[tn.clientDomain] = {
            clientName: tn.clientName,
            type: tn.type,
            tenantLogo,
            clientDomain: tn.clientDomain,
            additionalDomains: tn.additionalDomains,
            dbName: tn.dbName,
            peoIntegration: tn.peoIntegration,
          };
        }
        if (tn.additionalDomains) {
          tn.additionalDomains.forEach((dom) => {
            if (dom) {
              tenantObjectsIndexed[dom] = {
                clientName: tn.clientName,
                type: tn.type,
                tenantLogo,
                clientDomain: tn.clientDomain,
                additionalDomains: tn.additionalDomains,
                dbName: tn.dbName,
                peoIntegration: tn.peoIntegration,
              };
            }
          });
        }
      });

      // Update lastLoginDate for most recent active tenant
      if (mostRecentActiveTenant?.url) {
        await Users.updateOne(
          {
            emailAddress: email.toLowerCase(),
            'tenants.url': mostRecentActiveTenant.url,
          },
          { $set: { 'tenants.$.lastLoginDate': new Date().toISOString() } }
        );
      }

      const availableTenantObjects = activeTenants
        .filter(
          (item: TenantInfo) =>
            item.status === 'Active' &&
            tenantObjectsIndexed[item.url]?.clientName
        )
        .map((item: TenantInfo) => ({
          _id: item._id ? item._id.toString() : '',
          url: item.url,
          status: item.status,
          clientName: tenantObjectsIndexed[item.url]?.clientName || '',
          type: tenantObjectsIndexed[item.url]?.type || 'Venue',
          lastLoginDate: item.lastLoginDate,
          tenantLogo: tenantObjectsIndexed[item.url]?.tenantLogo,
          dbName: tenantObjectsIndexed[item.url]?.dbName || '',
          peoIntegration:
            tenantObjectsIndexed[item.url]?.peoIntegration || 'Helm',
          clientDomain: tenantObjectsIndexed[item.url]?.clientDomain,
        }));

      const availableTenants = result.tenants
        .filter(
          (item: TenantInfo) =>
            item.status === 'Active' && item.url !== mostRecentActiveTenant?.url
        )
        .map(
          (item: TenantInfo) =>
            `${item.url.includes('localhost') ? 'http' : 'https'}://${item.url}`
        );

      if (mostRecentActiveTenant) {
        return {
          success: true,
          tenant: {
            _id: mostRecentActiveTenant._id
              ? mostRecentActiveTenant._id.toString()
              : '',
            url: mostRecentActiveTenant.url,
            status: mostRecentActiveTenant.status,
            dbName:
              tenantObjectsIndexed[mostRecentActiveTenant.url]?.dbName || '',
            clientName:
              tenantObjectsIndexed[mostRecentActiveTenant.url]?.clientName ||
              '',
            type:
              tenantObjectsIndexed[mostRecentActiveTenant.url]?.type || 'Venue',
            lastLoginDate: mostRecentActiveTenant.lastLoginDate,
            tenantLogo:
              tenantObjectsIndexed[mostRecentActiveTenant.url]?.tenantLogo,
            peoIntegration:
              tenantObjectsIndexed[mostRecentActiveTenant.url]
                ?.peoIntegration || 'Helm',
            clientDomain:
              tenantObjectsIndexed[mostRecentActiveTenant.url]?.clientDomain,
          },
          availableTenants,
          availableTenantObjects,
          message:
            'Email exists with multiple tenants. Returning most recently logged in active tenant.',
        };
      } else {
        return {
          success: false,
          message: 'No active tenants found for this email.',
        };
      }
    }

    // This should never be reached, but included for completeness
    return {
      success: false,
      message: 'Invalid state',
    };
  } catch (err: unknown) {
    console.error('Error in checkUserMasterEmail:', err);
    const errorMessage =
      err instanceof Error ? err.message : 'Internal server error';
    return {
      success: false,
      message: errorMessage,
    };
  }
}

/**
 * Update the lastLoginDate for a specific tenant in a user's tenants array, using the user's email address.
 */
export async function updateTenantLastLoginDate(
  userDb: Db,
  email: string,
  tenantUrl: string
) {
  await userDb
    .collection('users')
    .updateOne(
      { emailAddress: email.toLowerCase(), 'tenants.url': tenantUrl },
      { $set: { 'tenants.$.lastLoginDate': new Date().toISOString() } }
    );
}

/**
 * Find applicant in a specific tenant database identified by dbName.
 *
 * Used when the tenant is known upfront (e.g. passed via URL param) so we can skip
 * the expensive cross-tenant scan in findApplicantAndTenantsByEmail.
 */
export async function findApplicantInTenantByDbName(
  dbName: string,
  email: string
): Promise<{
  applicantId: string;
  tenants: TenantInfo[];
  applicantInfo: {
    firstName?: string;
    lastName?: string;
    email: string;
    status?: string;
    employmentStatus?: string;
    applicantStatus?: string;
    acknowledgedDate?: string | null;
  };
} | null> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const { mongoConn } = await import('@/lib/db/mongodb');
    const { dbTenant } = await mongoConn();

    const tenantDoc = await dbTenant
      .collection<TenantDocument>('tenants')
      .findOne({ dbName });
    if (!tenantDoc) return null;

    const { db } = await mongoConn(dbName);
    const applicant = await db.collection('applicants').findOne(
      { email: normalizedEmail },
      {
        projection: {
          _id: 1,
          email: 1,
          firstName: 1,
          lastName: 1,
          status: 1,
          employmentStatus: 1,
          applicantStatus: 1,
          acknowledged: 1,
        },
      }
    );

    if (!applicant) return null;

    const tenantInfo: TenantInfo = {
      _id: tenantDoc._id?.toString() || '',
      url: tenantDoc.clientDomain || '',
      status: 'active',
      clientName: tenantDoc.clientName,
      type: tenantDoc.type || '',
      dbName: tenantDoc.dbName,
      peoIntegration: tenantDoc.peoIntegration,
      tenantLogo: await resolveS3LogoUrl(tenantDoc.tenantLogo),
      clientDomain: tenantDoc.clientDomain,
    };

    return {
      applicantId: applicant._id.toString(),
      tenants: [tenantInfo],
      applicantInfo: {
        firstName: applicant.firstName,
        lastName: applicant.lastName,
        email: applicant.email,
        status: applicant.status,
        employmentStatus: applicant.employmentStatus,
        applicantStatus: applicant.applicantStatus,
        acknowledgedDate: applicant.acknowledged?.date
          ? new Date(applicant.acknowledged.date).toISOString()
          : null,
      },
    };
  } catch (error) {
    console.error(`Error finding applicant in tenant ${dbName}:`, error);
    return null;
  }
}

/**
 * Find applicant and tenant(s) by searching applicants collection across all tenants
 *
 * Note: Applicant _id IS the applicantId
 * Applicant structure:
 * - _id: ObjectId (this is the applicantId)
 * - email: string (not emailAddress)
 * - firstName, lastName: string
 * - status: string (e.g., "Employee")
 * - employmentStatus: string (e.g., "Active")
 *
 * IMPORTANT: An applicant can exist in multiple tenants!
 * This function returns ALL tenants where the applicant exists.
 * This is a generic function that can be used for any applicant-based functionality.
 */
export async function findApplicantAndTenantsByEmail(email: string): Promise<{
  applicantId: string; // This is the _id from applicants collection
  tenants: TenantInfo[];
  applicantInfo: {
    firstName?: string;
    lastName?: string;
    email: string;
    status?: string;
    employmentStatus?: string;
    applicantStatus?: string;
    acknowledgedDate?: string | null;
  };
} | null> {
  try {
    const normalizedEmail = email.toLowerCase().trim();

    // Get all tenants
    const { mongoConn } = await import('@/lib/db/mongodb');
    const { dbTenant } = await mongoConn();
    const Tenants = dbTenant.collection<TenantDocument>('tenants');
    const tenants = await Tenants.find({}).toArray();

    const foundTenants: TenantInfo[] = [];

    let applicantInfo: {
      firstName?: string;
      lastName?: string;
      email: string;
      status?: string;
      employmentStatus?: string;
      applicantStatus?: string;
      acknowledgedDate?: string | null;
    } | null = null;
    let applicantId: string | null = null;

    // Search each tenant's applicants collection
    for (const tenant of tenants) {
      if (!tenant.dbName) continue;

      try {
        const { db } = await mongoConn(tenant.dbName);

        // Find applicant by email
        const Applicants = db.collection('applicants');
        const applicant = await Applicants.findOne(
          { email: normalizedEmail },
          {
            projection: {
              _id: 1,
              email: 1,
              firstName: 1,
              lastName: 1,
              status: 1,
              employmentStatus: 1,
              applicantStatus: 1,
              acknowledged: 1,
            },
          }
        );

        if (applicant) {
          // Store applicant info (should be same across tenants, but use first found)
          if (!applicantInfo) {
            applicantInfo = {
              firstName: applicant.firstName,
              lastName: applicant.lastName,
              email: applicant.email,
              status: applicant.status,
              employmentStatus: applicant.employmentStatus,
              applicantStatus: applicant.applicantStatus,
              acknowledgedDate: applicant.acknowledged?.date
                ? new Date(applicant.acknowledged.date).toISOString()
                : null,
            };
            applicantId = applicant._id.toString();
          }

          // Add tenant where applicant exists (convert TenantDocument to TenantInfo)
          if (tenant.dbName) {
            foundTenants.push({
              _id: tenant._id?.toString() || '',
              url: tenant.clientDomain || '',
              status: 'active', // Default status for tenants
              clientName: tenant.clientName,
              type: tenant.type || '',
              dbName: tenant.dbName,
              peoIntegration: tenant.peoIntegration,
              tenantLogo: await resolveS3LogoUrl(tenant.tenantLogo),
            });
          }
        }
      } catch (error) {
        console.warn(`Failed to check tenant ${tenant.dbName}:`, error);
        continue;
      }
    }

    // If no tenants found, return null
    if (foundTenants.length === 0 || !applicantId || !applicantInfo) {
      return null;
    }

    // Return tenants in the order they were found (consistent with user tenant handling)
    // Users don't sort tenants, so applicants shouldn't either
    return {
      applicantId,
      tenants: foundTenants,
      applicantInfo,
    };
  } catch (error) {
    console.error('Error finding applicant and tenants:', error);
    return null;
  }
}
