'use client';

import React, { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Trash2, Mail, MailOpen } from 'lucide-react';
import { Notification } from '@/domains/notification/types';
import { Company } from '@/domains/company/types';
import {
  useUpdateNotification,
  useDeleteNotification,
  useUserNotifications,
} from '@/domains/notification/hooks';
import { clsxm } from '@/lib/utils';

interface NotificationDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  notification: Notification | null;
  primaryCompany?: Company;
}

export const NotificationDetailModal: React.FC<
  NotificationDetailModalProps
> = ({ isOpen, onClose, notification, primaryCompany }) => {
  const updateMutation = useUpdateNotification(notification?._id || '');
  const deleteMutation = useDeleteNotification(notification?._id || '');
  const { data: notificationData } = useUserNotifications();

  // Get the most up-to-date notification from cache
  const currentNotification = useMemo(() => {
    if (!notification?._id || !notificationData?.notifications) {
      return notification;
    }

    // Find the updated notification in the cache
    const updatedNotification = notificationData.notifications.find(
      (n) => n._id === notification._id
    );

    return updatedNotification || notification;
  }, [notification, notificationData?.notifications]);

  if (!currentNotification) return null;

  const handleMarkAsRead = () => {
    if (currentNotification.status === 'unread') {
      updateMutation.mutate({ status: 'read' });
    }
  };

  const handleMarkAsUnread = () => {
    if (currentNotification.status === 'read') {
      updateMutation.mutate({ status: 'unread' });
    }
  };

  const handleDelete = () => {
    deleteMutation.mutate(undefined, {
      onSuccess: () => {
        onClose(); // Close modal after successful deletion
      },
    });
  };

  const getNotificationTypeColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'success':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'system':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  // Helper function to safely render HTML content
  const createMarkup = (html: string) => {
    return { __html: html };
  };

  // Use body field directly since that's where the content is
  const bodyContent = currentNotification.body || '';

  // Generate profile image URL
  const profileImageUrl =
    currentNotification.fromUserId &&
    currentNotification.profileImg &&
    primaryCompany?.imageUrl
      ? `${primaryCompany.imageUrl}/users/${currentNotification.fromUserId}/photo/${currentNotification.profileImg}`
      : '';

  // Get current status (reactive to cache updates and pending mutations)
  const currentStatus = updateMutation.isPending
    ? updateMutation.variables?.status || currentNotification.status
    : currentNotification.status;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                {profileImageUrl ? (
                  <Image
                    src={profileImageUrl}
                    alt={`${currentNotification.fromFirstName} ${currentNotification.fromLastName}`}
                    width={32}
                    height={32}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-medium">
                    {currentNotification.fromFirstName?.[0]}
                    {currentNotification.fromLastName?.[0]}
                  </div>
                )}
              </Avatar>
              <div>
                <h3 className="font-semibold text-gray-900">
                  {currentNotification.fromFirstName}{' '}
                  {currentNotification.fromLastName}
                </h3>
                <p className="text-sm text-gray-500">
                  {formatDistanceToNow(new Date(currentNotification.sendTime), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Subject */}
          <div>
            <h4 className="font-medium text-gray-900 mb-2">
              {currentNotification.subject}
            </h4>
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className={clsxm(
                  'text-xs border',
                  getNotificationTypeColor(currentNotification.msgType)
                )}
              >
                {currentNotification.msgType || 'info'}
              </Badge>
              {currentStatus === 'unread' && (
                <Badge variant="outline" className="text-xs">
                  Unread
                </Badge>
              )}
            </div>
          </div>

          {/* Body - Render HTML content */}
          <div className="space-y-2">
            <div
              className="text-gray-600 leading-relaxed prose prose-sm max-w-none"
              dangerouslySetInnerHTML={createMarkup(bodyContent)}
              style={{
                // Additional styles for better HTML rendering
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
              }}
            />
          </div>

          {/* Message Type */}
          {currentNotification.msgType && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Message Type:</span>{' '}
                {currentNotification.msgType}
              </p>
              {currentNotification.msgTemplate && (
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium">Template:</span>{' '}
                  {currentNotification.msgTemplate}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between items-center pt-4 border-t">
            <Button
              variant="ghost-danger"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
              {currentStatus === 'unread' ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleMarkAsRead}
                  disabled={updateMutation.isPending}
                >
                  <MailOpen className="w-4 h-4 mr-2" />
                  {updateMutation.isPending ? 'Marking...' : 'Mark as Read'}
                </Button>
              ) : (
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={handleMarkAsUnread}
                  disabled={updateMutation.isPending}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  {updateMutation.isPending ? 'Marking...' : 'Mark as Unread'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
