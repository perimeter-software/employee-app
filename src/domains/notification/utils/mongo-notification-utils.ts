import { convertToJSON } from '@/lib/utils/mongo-utils';
import { ObjectId, type Db, type UpdateResult } from 'mongodb';
import { Notification } from '../types';

export async function findNotificationsByUserId(
  db: Db,
  userId: string
): Promise<Notification[]> {
  let notifications: Notification[] = [];

  try {
    const notificationDocs = await db
      .collection('notifications')
      .aggregate([
        {
          $match: {
            'recipient.userId': userId,
            status: { $ne: 'deleted' },
          },
        },
        {
          $sort: { sendTime: -1 },
        },
      ])
      .toArray();

    notifications = notificationDocs.reduce(
      (acc: Notification[], notificationDoc) => {
        const conversionResult = convertToJSON(notificationDoc);
        if (conversionResult) {
          acc.push(conversionResult as Notification);
        }
        return acc;
      },
      []
    );
  } catch (e) {
    console.error('Error finding notifications:', e);
  }

  return notifications;
}

export async function updateNotification(
  db: Db,
  id: string,
  body: Partial<Notification>
): Promise<UpdateResult<Notification>> {
  if (!id) {
    throw new Error('Invalid Id or Id not found');
  }

  if (!body) {
    throw new Error('Invalid body to update request');
  }

  if (body._id) {
    delete body._id;
  }

  const Notifications = db.collection('notifications');

  try {
    const result: UpdateResult<Notification> = await Notifications.updateOne(
      { _id: new ObjectId(id) },
      { $set: body },
      { upsert: false }
    );

    return result;
  } catch (error) {
    console.error('Error updating notification:', error);
    throw error;
  }
}

export async function findNotificationById(
  db: Db,
  notificationId: string
): Promise<Notification | null> {
  try {
    const notificationDoc = await db
      .collection('notifications')
      .findOne({ _id: new ObjectId(notificationId) });

    if (!notificationDoc) {
      return null;
    }

    const notification = convertToJSON(notificationDoc) as Notification;
    return notification;
  } catch (error) {
    console.error('Error finding notification by ID:', error);
    return null;
  }
}

export async function markAllUnreadNotificationsAsRead(
  db: Db,
  userId: string
): Promise<UpdateResult<Notification[]>> {
  if (!userId) {
    throw new Error('Invalid user ID');
  }

  const Notifications = db.collection('notifications');

  try {
    const result: UpdateResult<Notification[]> = await Notifications.updateMany(
      {
        'recipient.userId': userId,
        $and: [{ status: { $eq: 'unread' } }, { status: { $ne: 'deleted' } }],
      },
      { $set: { status: 'read' } },
      { upsert: false }
    );

    return result;
  } catch (error) {
    console.error('Error updating notifications:', error);
    throw error;
  }
}

export async function createNotification(
  db: Db,
  notificationData: Omit<Notification, '_id' | 'sendTime'>
): Promise<Notification | null> {
  if (!notificationData) {
    throw new Error('Invalid notification data');
  }

  const Notifications = db.collection('notifications');

  try {
    const notificationDoc = {
      ...notificationData,
      sendTime: new Date(),
      _id: new ObjectId(),
    };

    const result = await Notifications.insertOne(notificationDoc);

    if (!result.insertedId) {
      return null;
    }

    const insertedDoc = await Notifications.findOne({
      _id: result.insertedId,
    });

    if (!insertedDoc) {
      return null;
    }

    const notification = convertToJSON(insertedDoc) as Notification;
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
}
