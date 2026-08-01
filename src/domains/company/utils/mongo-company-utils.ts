import type { Db } from 'mongodb';
import { Company } from '../types';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import { buildTenantImageBase } from '@/lib/utils/tenant-image-base';

export async function findPrimaryCompany(db: Db): Promise<Company | null> {
  try {
    const projection = {
      _id: 1,
      name: 1,
      slug: 1,
      imageUrl: 1,
      timeClockSettings: 1,
      uploadPath: 1,
      companyType: 1,
      attachments: 1,
    };

    const companyDoc = await db
      .collection('company')
      .findOne({ primaryCompany: true }, { projection });

    if (!companyDoc) {
      return null;
    }

    const company = convertToJSON(companyDoc) as Company;

    // Point the tenant asset base at S3 instead of the stored legacy EFS host
    // (`https://images.stadiumpeople.com/sp`). v4 writes uploads only to S3, so
    // the EFS host 404s anything created/updated in v4 (e.g. new venue logos &
    // banners). Every consumer builds `${imageUrl}/${slug}/venues|events/...` or
    // `/users/{id}/photo/...`, so swapping just the base fixes all of them and
    // keeps already-migrated assets working (they exist in S3 too).
    const s3Base = buildTenantImageBase(companyDoc.slug as string | undefined);
    if (s3Base) {
      company.imageUrl = s3Base;
    }

    return company;
  } catch (error) {
    console.error('Error finding primary company:', error);
    return null;
  }
}
