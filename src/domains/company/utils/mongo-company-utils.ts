import type { Db } from 'mongodb';
import { Company } from '../types';
import { convertToJSON } from '@/lib/utils/mongo-utils';

export async function findPrimaryCompany(db: Db): Promise<Company | null> {
  try {
    const projection = {
      _id: 1,
      imageUrl: 1,
      timeClockSettings: 1,
    };

    const companyDoc = await db
      .collection('company')
      .findOne({ primaryCompany: true }, { projection });

    if (!companyDoc) {
      return null;
    }

    const company = convertToJSON(companyDoc) as Company;
    return company;
  } catch (error) {
    console.error('Error finding primary company:', error);
    return null;
  }
}
