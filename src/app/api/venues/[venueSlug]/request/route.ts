import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type {
  ApplicantCollectionDoc,
  AuthenticatedRequest,
} from '@/domains/user/types';
import { emailService } from '@/lib/services/email-service';
import { escapeHtml } from '@/lib/utils/format-utils';
import { getApplicantId } from '@/domains/venue/utils/mongo-venue-utils';
import { logActivity, createActivityLogData } from '@/lib/services/activity-logger';
import { buildEmailFromTemplate } from '@/lib/services/email-template-service';
import { enqueueFirebaseTopicJob } from '@/lib/services/firebase-queue';
import { getVenueTopics, getEventTopics } from '@/domains/venue/utils/venue-topic-utils';

const TEMPLATE_NAMES = {
  venueRequest: 'Employee Venue Request',
  venueRemoval: 'Employee Venue Removal',
};

// POST — request to join a venue (adds Pending entry to applicant's venues array)
async function requestVenueHandler(
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) {
  try {
    const params = (await context?.params) as { venueSlug: string } | undefined;
    const venueSlug = params?.venueSlug;

    if (!venueSlug) {
      return NextResponse.json(
        { success: false, message: 'Venue slug is required' },
        { status: 400 }
      );
    }

    const user = request.user;
    const applicantId = getApplicantId(user);

    if (!applicantId || !ObjectId.isValid(applicantId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid applicant session' },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(request);

    // Check venue exists and is active — include contact fields for the notification email
    const venue = await db.collection('venues').findOne(
      { slug: venueSlug },
      {
        projection: {
          _id: 1,
          name: 1,
          status: 1,
          venueContact1: 1,
          venueContact2: 1,
        },
      }
    );

    if (!venue || venue.status !== 'Active') {
      return NextResponse.json(
        { success: false, message: 'Venue not found or inactive' },
        { status: 404 }
      );
    }

    // Check applicant doesn't already have a non-Locked entry for this venue
    const applicantDoc = await db
      .collection('applicants')
      .findOne(
        { _id: new ObjectId(applicantId) },
        { projection: { venues: 1, firstName: 1, lastName: 1, email: 1 } }
      );

    const existing = (applicantDoc?.venues ?? []).find(
      (v: { venueSlug: string; status: string }) => v.venueSlug === venueSlug
    );

    if (existing && existing.status !== 'Locked') {
      return NextResponse.json(
        {
          success: false,
          message: 'You already have a request for this venue',
        },
        { status: 409 }
      );
    }

    const agentName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.name ||
      user.email ||
      'Employee';

    const newEntry = {
      venueSlug,
      status: 'Pending',
      agent: agentName,
      dateModified: new Date().toISOString(),
    };

    // If there's a Locked entry, replace it; otherwise push a new one
    if (existing?.status === 'Locked') {
      await db.collection('applicants').updateOne(
        { _id: new ObjectId(applicantId) },
        {
          $set: {
            'venues.$[elem].status': 'Pending',
            'venues.$[elem].dateModified': newEntry.dateModified,
          },
        },
        { arrayFilters: [{ 'elem.venueSlug': venueSlug }] }
      );
    } else {
      await db
        .collection<ApplicantCollectionDoc>('applicants')
        .updateOne(
          { _id: new ObjectId(applicantId) },
          { $push: { venues: newEntry } }
        );
    }

    await logActivity(
      db,
      createActivityLogData(
        'Venue Request',
        `${agentName} requested to join venue ${venueSlug}`,
        {
          applicantId,
          agent: agentName,
          details: { venueSlug, newEntry },
        }
      )
    );

    // Send notification email to venue contacts
    const contactEmails = [
      venue.venueContact1?.email,
      venue.venueContact2?.email,
    ].filter((e): e is string => Boolean(e?.trim()));

    if (contactEmails.length > 0) {
      const venueName = venue.name ?? venueSlug;

      // Try template first; fall back to hardcoded HTML
      const built = await buildEmailFromTemplate(
        db,
        TEMPLATE_NAMES.venueRequest,
        {
          applicant: applicantDoc as Record<string, unknown>,
          venue: venue as Record<string, unknown>,
        }
      );

      const subject = built?.subject ?? `New Venue Request — ${venueName}`;
      const html =
        built?.html ??
        [
          '<div style="font-family:\'Segoe UI\',Tahoma,Geneva,Verdana,sans-serif; max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">',
          '<div style="background:#0d9488; color:#fff; padding:14px 20px; font-size:18px; font-weight:600;">New venue request</div>',
          '<div style="padding:20px;">',
          '<p style="margin:0 0 16px; color:#374151; font-size:14px;">An employee has submitted a request to join your venue.</p>',
          '<table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:20px; border:1px solid #e5e7eb; border-radius:6px;">',
          '<tr style="background:#f9fafb;"><td colspan="2" style="padding:10px 14px; font-weight:600; color:#374151; border-bottom:1px solid #e5e7eb;">Request details</td></tr>',
          `<tr><td style="padding:10px 14px; color:#6b7280; width:120px; border-bottom:1px solid #f3f4f6;">Employee</td><td style="padding:10px 14px; color:#111827; border-bottom:1px solid #f3f4f6;">${escapeHtml(agentName)}</td></tr>`,
          `<tr><td style="padding:10px 14px; color:#6b7280;">Venue</td><td style="padding:10px 14px; color:#111827;">${escapeHtml(venueName)}</td></tr>`,
          '</table>',
          '<p style="margin:0; color:#6b7280; font-size:13px;">Please log in to the admin portal to review this request.</p>',
          '</div>',
          '<div style="padding:12px 20px; background:#f9fafb; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">This is an automated notification from the Employee App.</div>',
          '</div>',
        ].join('');

      for (const to of contactEmails) {
        try {
          await emailService.sendEmail({ to, subject, html });
        } catch (emailErr) {
          console.error(
            '[Venue Request] Error sending notification to',
            to,
            emailErr
          );
        }
      }
    }

    // Push Firebase topic jobs (fire-and-forget; errors must not block the response)
    try {
      const topicRecs = getVenueTopics(venueSlug, 'Pending');
      if (topicRecs.length > 0) {
        const userDoc = await db
          .collection('users')
          .findOne(
            { applicantId },
            { projection: { userDeviceToken: 1 } }
          );
        const fcmToken = userDoc?.userDeviceToken as string | undefined;
        if (fcmToken) {
          for (const rec of topicRecs) {
            await enqueueFirebaseTopicJob({
              jobType: rec.action === 'delete' ? 'unsubscribe' : 'subscribe',
              topicName: rec.topic,
              fcmTokens: [fcmToken],
            });
          }
        }
      }
    } catch (queueErr) {
      console.error('[Venue Request] Error enqueuing Firebase topic job:', queueErr);
    }

    return NextResponse.json(
      { success: true, message: 'Venue request submitted' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error requesting venue:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE — cancel a pending request OR leave a StaffingPool venue (mirrors changeVenue status=Delete)
async function cancelVenueRequestHandler(
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) {
  try {
    const params = (await context?.params) as { venueSlug: string } | undefined;
    const venueSlug = params?.venueSlug;

    if (!venueSlug) {
      return NextResponse.json(
        { success: false, message: 'Venue slug is required' },
        { status: 400 }
      );
    }

    const user = request.user;
    const applicantId = getApplicantId(user);

    if (!applicantId || !ObjectId.isValid(applicantId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid applicant session' },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(request);

    // Read the current entry to know its status before removing
    const applicantDoc = await db
      .collection('applicants')
      .findOne(
        { _id: new ObjectId(applicantId) },
        { projection: { venues: 1, firstName: 1, lastName: 1, email: 1 } }
      );

    const existing = (applicantDoc?.venues ?? []).find(
      (v: { venueSlug: string; status: string }) => v.venueSlug === venueSlug
    );

    if (!existing || existing.status === 'Locked') {
      return NextResponse.json(
        { success: false, message: 'No removable venue entry found' },
        { status: 404 }
      );
    }

    // Remove the venue entry from the applicant
    const result = await db
      .collection<ApplicantCollectionDoc>('applicants')
      .updateOne(
        { _id: new ObjectId(applicantId) },
        {
          $pull: { venues: { venueSlug } } as Record<string, unknown>,
        }
      );

    if (result.modifiedCount === 0) {
      return NextResponse.json(
        { success: false, message: 'No venue entry found to remove' },
        { status: 404 }
      );
    }

    const agentName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.name ||
      user.email ||
      'Employee';

    const action =
      existing.status === 'StaffingPool' ? 'Venue Leave' : 'Venue Request Cancel';

    await logActivity(
      db,
      createActivityLogData(
        action,
        `${agentName} ${existing.status === 'StaffingPool' ? 'left' : 'cancelled request for'} venue ${venueSlug}`,
        {
          applicantId,
          agent: agentName,
          details: { venueSlug, previousStatus: existing.status },
        }
      )
    );

    // For StaffingPool removals, mirror changeVenue status=Delete side effects
    let futureEvents: { _id: ObjectId; applicants: { id: string }[] }[] = [];
    if (existing.status === 'StaffingPool') {
      // Remove applicant from future events at this venue
      try {
        futureEvents = (await db
          .collection('events')
          .find(
            {
              'applicants.id': applicantId,
              venueSlug,
              eventDate: { $gt: new Date() },
            },
            { projection: { _id: 1, applicants: 1 } }
          )
          .toArray()) as typeof futureEvents;

        for (const event of futureEvents) {
          const updatedApplicants = (
            event.applicants as { id: string }[]
          ).filter((a) => a.id !== applicantId);
          await db
            .collection('events')
            .updateOne(
              { _id: event._id },
              {
                $set: {
                  applicants: updatedApplicants,
                  modifiedDate: new Date(),
                },
              }
            );
        }
      } catch (evtErr) {
        console.error(
          '[Venue Remove] Error removing applicant from events:',
          evtErr
        );
      }

      // Send venueRemoval notification email to the employee
      const recipientEmail = user.email;
      if (recipientEmail) {
        try {
          const venue = await db
            .collection('venues')
            .findOne({ slug: venueSlug }, { projection: { _id: 1, name: 1 } });
          const venueName = venue?.name ?? venueSlug;

          // Try template first; fall back to hardcoded HTML
          const built = await buildEmailFromTemplate(
            db,
            TEMPLATE_NAMES.venueRemoval,
            {
              applicant: applicantDoc as Record<string, unknown>,
              venue: venue as Record<string, unknown>,
            }
          );

          const subject =
            built?.subject ?? `You have been removed from ${venueName}`;
          const html =
            built?.html ??
            [
              '<div style="font-family:\'Segoe UI\',Tahoma,Geneva,Verdana,sans-serif; max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">',
              '<div style="background:#0d9488; color:#fff; padding:14px 20px; font-size:18px; font-weight:600;">Venue removal notification</div>',
              '<div style="padding:20px;">',
              `<p style="margin:0 0 12px; color:#374151; font-size:14px;">You have been removed from the staffing pool for <strong>${escapeHtml(venueName)}</strong>.</p>`,
              '<p style="margin:0; color:#6b7280; font-size:13px;">If you believe this was a mistake, please contact your event manager.</p>',
              '</div>',
              '<div style="padding:12px 20px; background:#f9fafb; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">This is an automated notification from the Employee App.</div>',
              '</div>',
            ].join('');

          await emailService.sendEmail({ to: recipientEmail, subject, html });
        } catch (emailErr) {
          console.error(
            '[Venue Remove] Error sending removal email:',
            emailErr
          );
        }
      }
    }

    // Push Firebase topic unsubscribe jobs (fire-and-forget)
    try {
      const topicRecs = getVenueTopics(venueSlug, existing.status === 'StaffingPool' ? 'Delete' : existing.status);
      const eventTopics = existing.status === 'StaffingPool'
        ? futureEvents.flatMap((evt) => getEventTopics(evt._id.toString()))
        : [];
      const allTopics = [...topicRecs, ...eventTopics];

      if (allTopics.length > 0) {
        const userDoc = await db
          .collection('users')
          .findOne(
            { applicantId },
            { projection: { userDeviceToken: 1 } }
          );
        const fcmToken = userDoc?.userDeviceToken as string | undefined;
        if (fcmToken) {
          for (const rec of allTopics) {
            await enqueueFirebaseTopicJob({
              jobType: rec.action === 'delete' ? 'unsubscribe' : 'subscribe',
              topicName: rec.topic,
              fcmTokens: [fcmToken],
            });
          }
        }
      }
    } catch (queueErr) {
      console.error('[Venue Remove] Error enqueuing Firebase topic job:', queueErr);
    }

    const message =
      existing.status === 'StaffingPool'
        ? 'Successfully left venue'
        : 'Venue request cancelled';

    return NextResponse.json({ success: true, message }, { status: 200 });
  } catch (error) {
    console.error('Error removing venue:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const POST = withEnhancedAuthAPI(requestVenueHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});

export const DELETE = withEnhancedAuthAPI(cancelVenueRequestHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});
