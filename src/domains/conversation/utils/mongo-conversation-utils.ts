import type { AiConversation, AiConversationNoId } from "../types";
import { convertToJSON } from "@/lib/utils/mongo-utils";
import { Db } from "mongodb";
import { ObjectId } from "bson";

// Find all AI conversations by userId
export async function findConversationsByUserId(
  db: Db,
  userId: string
): Promise<{ conversations: AiConversation[] }> {
  try {
    // Attempt to find conversations by user ID
    const conversations = await db
      .collection("conversations")
      .find({ userId })
      .toArray();

    // Convert each document to JSON individually
    const convertedConversations = conversations.map(
      (conversation) => convertToJSON(conversation) as AiConversation
    );

    // Return the converted conversations
    return { conversations: convertedConversations };
  } catch (error) {
    console.error("An error occurred:", error);

    // Return an empty array in case of any error
    return { conversations: [] };
  }
}

export async function createConversation(
  db: Db,
  conversation: AiConversationNoId
): Promise<{ conversation: AiConversation | null }> {
  try {
    const result = await db.collection("conversations").insertOne(conversation);

    if (!result.acknowledged) {
      console.error("Failed to insert the document");
      return { conversation: null };
    }

    // Create the AiConversation object by combining the original data with the new _id
    const conversationDocument: AiConversation = {
      _id: result.insertedId.toHexString(),
      ...conversation,
    };

    return { conversation: conversationDocument };
  } catch (error) {
    console.error("An error occurred:", error);
    return { conversation: null };
  }
}

export async function updateConversationById(
  db: Db,
  conversationId: string,
  updates: Partial<AiConversation>
): Promise<{ conversation: AiConversation | null }> {
  updates.updated = new Date().toISOString();
  // Remove _id from updates
  const updatesWithoutId = { ...updates };

  delete updatesWithoutId._id;

  try {
    const result = await db
      .collection("conversations")
      .findOneAndUpdate(
        { _id: new ObjectId(conversationId) },
        { $set: updatesWithoutId },
        { returnDocument: "after" }
      );

    if (!result) {
      console.error("Conversation not found or update failed");
      return { conversation: null };
    }

    const updatedConversation = convertToJSON(result) as AiConversation;
    return { conversation: updatedConversation };
  } catch (error) {
    console.error("An error occurred:", error);
    return { conversation: null };
  }
}

export async function deleteConversationById(
  db: Db,
  conversationId: string
): Promise<{ success: boolean }> {
  try {
    const result = await db
      .collection("conversations")
      .deleteOne({ _id: new ObjectId(conversationId) });

    if (result.deletedCount === 0) {
      console.error("Conversation not found or delete failed");
      return { success: false };
    }

    return { success: true };
  } catch (error) {
    console.error("An error occurred:", error);
    return { success: false };
  }
}
