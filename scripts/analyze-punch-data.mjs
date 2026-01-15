#!/usr/bin/env node
/**
 * Database Analysis Script for Employee Punch Data
 * 
 * This script analyzes punch data in the database to help debug
 * month/week/day view issues in the Employee Time Attendance table.
 * 
 * Usage:
 *   node scripts/analyze-punch-data.mjs [startDate] [endDate] [jobId] [shiftSlug]
 * 
 * Example:
 *   node scripts/analyze-punch-data.mjs 2026-01-14 2026-01-14
 */

// Load environment variables from .env file
import 'dotenv/config';

import { MongoClient, ObjectId } from 'mongodb';
import { parseISO, startOfDay, endOfDay, format } from 'date-fns';

const MONGODB_CONNECTION_STRING = process.env.MONGODB_CONNECTION_STRING;
const DEFAULT_DB_NAME = process.env.DEFAULT_TENANT_DB_NAME || 'stadiumpeople';

if (!MONGODB_CONNECTION_STRING) {
  console.error('❌ MONGODB_CONNECTION_STRING environment variable is required');
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
const startDateArg = args[0] || new Date().toISOString().split('T')[0];
const endDateArg = args[1] || startDateArg;
const jobIdArg = args[2];
const shiftSlugArg = args[3];

async function analyzePunchData() {
  let client;
  
  try {
    console.log('🔗 Connecting to MongoDB...');
    client = await MongoClient.connect(MONGODB_CONNECTION_STRING, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    
    const db = client.db(DEFAULT_DB_NAME);
    
    // Parse dates - match the frontend/backend pattern:
    // 1. Parse the date string as a date in local time
    // 2. Use startOfDay/endOfDay to normalize to local midnight
    // 3. Convert to ISO string (which will be in UTC)
    const startDateLocal = startOfDay(parseISO(startDateArg));
    startDateLocal.setHours(0, 0, 0, 0);
    const endDateLocal = endOfDay(parseISO(endDateArg));
    endDateLocal.setHours(23, 59, 59, 999);
    
    // Convert to ISO strings for MongoDB query (same as frontend/backend)
    const startDateISO = startDateLocal.toISOString();
    const endDateISO = endDateLocal.toISOString();
    
    console.log('\n📊 Analysis Parameters:');
    console.log('  Input Start Date:', startDateArg);
    console.log('  Input End Date:', endDateArg);
    console.log('  Local Start Date:', format(startDateLocal, 'yyyy-MM-dd HH:mm:ss'));
    console.log('  Local End Date:', format(endDateLocal, 'yyyy-MM-dd HH:mm:ss'));
    console.log('  UTC Start Date (for query):', startDateISO);
    console.log('  UTC End Date (for query):', endDateISO);
    console.log('  Job ID:', jobIdArg || 'All jobs');
    console.log('  Shift Slug:', shiftSlugArg || 'All shifts');
    console.log('');
    
    // Build query - match the backend API exactly
    const query = {
      type: 'punch',
      timeIn: {
        $ne: null,
        $gte: startDateISO,
        $lte: endDateISO,
      },
    };
    
    if (jobIdArg) {
      try {
        query.jobId = new ObjectId(jobIdArg);
      } catch {
        query.jobId = jobIdArg; // Try as string if ObjectId fails
      }
    }
    
    if (shiftSlugArg && shiftSlugArg !== 'all') {
      query.shiftSlug = shiftSlugArg;
    }
    
    console.log('🔍 Query:', JSON.stringify(query, null, 2));
    console.log('');
    
    // Fetch punches with lookups
    const punches = await db
      .collection('timecard')
      .aggregate([
        {
          $match: query,
        },
        {
          $addFields: {
            userIdObjectId: {
              $cond: {
                if: { $eq: [{ $type: '$userId' }, 'string'] },
                then: { $toObjectId: '$userId' },
                else: '$userId',
              },
            },
            applicantIdObjectId: {
              $cond: {
                if: { $eq: [{ $type: '$applicantId' }, 'string'] },
                then: { $toObjectId: '$applicantId' },
                else: '$applicantId',
              },
            },
            jobIdObjectId: {
              $cond: {
                if: { $eq: [{ $type: '$jobId' }, 'string'] },
                then: { $toObjectId: '$jobId' },
                else: '$jobId',
              },
            },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'userIdObjectId',
            foreignField: '_id',
            as: 'user',
          },
        },
        {
          $lookup: {
            from: 'applicants',
            localField: 'applicantIdObjectId',
            foreignField: '_id',
            as: 'applicant',
          },
        },
        {
          $lookup: {
            from: 'jobs',
            localField: 'jobIdObjectId',
            foreignField: '_id',
            as: 'job',
          },
        },
        {
          $unwind: {
            path: '$user',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: '$applicant',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: '$job',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            userId: 1,
            applicantId: 1,
            jobId: 1,
            timeIn: 1,
            timeOut: 1,
            status: 1,
            shiftSlug: 1,
            shiftName: 1,
            employeeName: {
              $concat: [
                { $ifNull: ['$applicant.firstName', ''] },
                ' ',
                { $ifNull: ['$applicant.lastName', ''] },
              ],
            },
            employeeEmail: {
              $ifNull: ['$applicant.email', '$user.emailAddress', ''],
            },
            jobTitle: { $ifNull: ['$job.title', ''] },
            jobSite: { $ifNull: ['$job.venueName', '$job.title', ''] },
            location: { $ifNull: ['$job.venueName', '$job.location.name', ''] },
          },
        },
        {
          $sort: {
            timeIn: -1,
          },
        },
      ])
      .toArray();
    
    console.log(`✅ Found ${punches.length} punches\n`);
    
    if (punches.length === 0) {
      console.log('⚠️  No punches found for the specified criteria.');
      console.log('\n💡 Suggestions:');
      console.log('  1. Check if the date range is correct');
      console.log('  2. Verify jobId and shiftSlug if specified');
      console.log('  3. Check if timeIn values are within the date range');
      console.log('  4. Verify timezone handling (dates should be in UTC)');
      return;
    }
    
    // Group by date for analysis
    const punchesByDate = {};
    const punchesByJob = {};
    const punchesByShift = {};
    
    punches.forEach((punch) => {
      const punchDate = new Date(punch.timeIn);
      const dateKey = format(punchDate, 'yyyy-MM-dd');
      
      // Group by date
      if (!punchesByDate[dateKey]) {
        punchesByDate[dateKey] = [];
      }
      punchesByDate[dateKey].push(punch);
      
      // Group by job
      const jobKey = punch.jobTitle || punch.jobId || 'Unknown';
      if (!punchesByJob[jobKey]) {
        punchesByJob[jobKey] = [];
      }
      punchesByJob[jobKey].push(punch);
      
      // Group by shift
      const shiftKey = punch.shiftName || punch.shiftSlug || 'No Shift';
      if (!punchesByShift[shiftKey]) {
        punchesByShift[shiftKey] = [];
      }
      punchesByShift[shiftKey].push(punch);
    });
    
    // Display results
    console.log('📅 Punches by Date:');
    Object.keys(punchesByDate)
      .sort()
      .forEach((date) => {
        console.log(`  ${date}: ${punchesByDate[date].length} punches`);
      });
    console.log('');
    
    console.log('💼 Punches by Job:');
    Object.keys(punchesByJob)
      .sort()
      .forEach((job) => {
        console.log(`  ${job}: ${punchesByJob[job].length} punches`);
      });
    console.log('');
    
    console.log('⏰ Punches by Shift:');
    Object.keys(punchesByShift)
      .sort()
      .forEach((shift) => {
        console.log(`  ${shift}: ${punchesByShift[shift].length} punches`);
      });
    console.log('');
    
    // Show sample punches
    console.log('📋 Sample Punches (first 5):');
    punches.slice(0, 5).forEach((punch, index) => {
      console.log(`\n  Punch ${index + 1}:`);
      console.log(`    ID: ${punch._id}`);
      console.log(`    Employee: ${punch.employeeName || 'Unknown'} (${punch.employeeEmail || 'No email'})`);
      console.log(`    Job: ${punch.jobTitle || 'Unknown'} (${punch.jobId})`);
      console.log(`    Shift: ${punch.shiftName || punch.shiftSlug || 'No shift'}`);
      console.log(`    Time In: ${punch.timeIn} (${format(new Date(punch.timeIn), 'yyyy-MM-dd HH:mm:ss')})`);
      console.log(`    Time Out: ${punch.timeOut || 'Still clocked in'}`);
      console.log(`    Status: ${punch.status || 'N/A'}`);
    });
    
    // Timezone analysis
    console.log('\n🌍 Timezone Analysis:');
    const timeInTimes = punches.map((p) => new Date(p.timeIn));
    const minTime = new Date(Math.min(...timeInTimes.map((t) => t.getTime())));
    const maxTime = new Date(Math.max(...timeInTimes.map((t) => t.getTime())));
    console.log(`  Earliest Time In: ${format(minTime, 'yyyy-MM-dd HH:mm:ss')} (UTC)`);
    console.log(`  Latest Time In: ${format(maxTime, 'yyyy-MM-dd HH:mm:ss')} (UTC)`);
    console.log(`  Query Start (UTC): ${startDateISO}`);
    console.log(`  Query End (UTC): ${endDateISO}`);
    console.log(`  Query Start (Local): ${format(startDateLocal, 'yyyy-MM-dd HH:mm:ss')}`);
    console.log(`  Query End (Local): ${format(endDateLocal, 'yyyy-MM-dd HH:mm:ss')}`);
    
    // Check for date mismatches
    const dayViewDate = format(startDateLocal, 'yyyy-MM-dd');
    const dayViewPunches = punchesByDate[dayViewDate] || [];
    console.log(`\n📊 Day View Analysis (${dayViewDate}):`);
    console.log(`  Expected: Punches for ${dayViewDate} (local date)`);
    console.log(`  Found: ${dayViewPunches.length} punches`);
    
    // Show which punches match the query
    if (punches.length > 0) {
      console.log(`\n  ✅ All ${punches.length} punch(es) fall within the query range`);
      punches.forEach((punch, idx) => {
        const punchTime = new Date(punch.timeIn);
        const isInRange = punchTime >= new Date(startDateISO) && punchTime <= new Date(endDateISO);
        console.log(`    Punch ${idx + 1}: ${punchTime.toISOString()} - ${isInRange ? '✅ IN RANGE' : '❌ OUT OF RANGE'}`);
      });
    }
    
    if (dayViewPunches.length === 0 && punches.length > 0) {
      console.log('\n  ⚠️  WARNING: Day view is empty but other views have data!');
      console.log('  This suggests a date filtering issue.');
      console.log('\n  Possible causes:');
      console.log('    1. Date range calculation mismatch between frontend and backend');
      console.log('    2. Timezone conversion issues');
      console.log('    3. Date normalization problems (startOfDay/endOfDay)');
    }
    
    console.log('\n✅ Analysis complete!');
    
  } catch (error) {
    console.error('❌ Error analyzing punch data:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Run the analysis
analyzePunchData().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
