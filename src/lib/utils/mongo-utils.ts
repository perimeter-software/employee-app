import "server-only"; // This will cause build errors if imported on client
import { BSON, ObjectId as ObjectIdFunction, Document } from "mongodb";
import { WithId } from "mongodb";

export function convertToJSON(
  doc: WithId<Document> | Document | null
): object | null {
  if (doc === null) {
    return null;
  }

  const bsonBuffer = BSON.serialize(doc);
  const result = BSON.deserialize(bsonBuffer);

  function convertIdRecursively(obj: Record<string, unknown>): unknown {
    if (Array.isArray(obj)) {
      return obj.map(convertIdRecursively);
    } else if (typeof obj === "object" && obj !== null) {
      Object.keys(obj).forEach((key) => {
        if (obj[key] instanceof ObjectIdFunction) {
          obj[key] = obj[key].toString();
        } else {
          obj[key] = convertIdRecursively(obj[key] as Record<string, unknown>);
        }
      });
    }
    return obj;
  }

  return convertIdRecursively(result as Record<string, unknown>) as
    | object
    | null;
}
