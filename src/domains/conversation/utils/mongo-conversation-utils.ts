// src/domains/conversation/utils/mongo-conversation-utils.ts
import type { AiConversation } from '../types';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import { Db } from 'mongodb';
import { ObjectId } from 'bson';

export async function getAllConversions(
  db: Db,
  userId: string
): Promise<{ conversations: AiConversation[] }> {
  try {
    const conversations = await db
      .collection('conversations')
      .find({ userId })
      .sort({ created: -1 })
      .limit(1)
      .toArray();

    // Convert each document to JSON individually
    const convertedConversations = conversations.map(
      (conversation) => convertToJSON(conversation) as AiConversation
    );

    // Return the converted conversations
    return { conversations: convertedConversations };
  } catch (error) {
    console.error('An error occurred:', error);

    // Return an empty array in case of any error
    return { conversations: [] };
  }
}

export async function createConversation(
  db: Db,
  conversation: AiConversation
): Promise<AiConversation | null> {
  try {
    const insertResult = await db.collection('conversations').insertOne({
      ...conversation,
      _id: conversation._id ? new ObjectId(conversation._id) : undefined,
    });

    if (!insertResult.insertedId) {
      throw new Error('Failed to insert conversation');
    }

    const result = await db
      .collection('conversations')
      .findOne({ _id: insertResult.insertedId });

    if (!result) {
      throw new Error('Failed to retrieve inserted conversation');
    }

    return convertToJSON(result) as AiConversation;
  } catch (error) {
    console.error('An error occurred:', error);
    return null;
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
      .collection('conversations')
      .findOneAndUpdate(
        { _id: new ObjectId(conversationId) },
        { $set: updatesWithoutId },
        { returnDocument: 'after' }
      );

    if (!result) {
      console.error('Conversation not found or update failed');
      return { conversation: null };
    }

    const updatedConversation = convertToJSON(result) as AiConversation;
    return { conversation: updatedConversation };
  } catch (error) {
    console.error('An error occurred:', error);
    return { conversation: null };
  }
}

export async function deleteConversationById(
  db: Db,
  conversationId: string
): Promise<{ success: boolean }> {
  try {
    const result = await db
      .collection('conversations')
      .deleteOne({ _id: new ObjectId(conversationId) });

    if (result.deletedCount === 0) {
      console.error('Conversation not found or delete failed');
      return { success: false };
    }

    return { success: true };
  } catch (error) {
    console.error('An error occurred:', error);
    return { success: false };
  }
}
