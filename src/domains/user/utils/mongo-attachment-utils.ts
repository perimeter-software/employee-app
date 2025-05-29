import { Collection, Db, ObjectId as ObjectIdFunction, Filter } from "mongodb";

import { Attachment } from "../types/attachment.types";
import { Applicant } from "../types/applicant.types";
import { convertToJSON } from "@/lib/utils/mongo-utils";

// get user documents (attachments) list by _id
export async function getUserAttachments(
  db: Db,
  _id: string
): Promise<Attachment[]> {
  try {
    const collection = db.collection("applicants") as Collection<Applicant>;
    const query = {
      _id: new ObjectIdFunction(_id),
    } as unknown as Filter<Applicant>;
    const options = { projection: { attachments: 1 } };

    const result = (await collection.findOne(query, options)) as Applicant;
    console.log("getUserDocuments result:", result);

    if (
      result?.attachments &&
      Array.isArray(result.attachments) &&
      result.attachments.length > 0
    ) {
      return result.attachments.map(
        (attachment) => convertToJSON(attachment) as Attachment
      );
    }
  } catch (error) {
    console.error("Error getting user documents:", error);
  }
  return [];
}
