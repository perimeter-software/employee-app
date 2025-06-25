'use client';

import React, { useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { CheckCheck, Trash2, X, Bell } from 'lucide-react';
import { Notification } from '@/domains/notification/types';
import { Company } from '@/domains/company/types';
import {
  useMarkAllAsRead,
  useUpdateNotification,
  useDeleteNotification,
  useUserNotifications,
} from '@/domains/notification/hooks';
import { clsxm } from '@/lib/utils';

interface NotificationPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: Notification[];
  isLoading: boolean;
  onNotificationClick: (notification: Notification) => void;
  primaryCompany?: Company;
}

export const NotificationPopover: React.FC<NotificationPopoverProps> = ({
  isOpen,
  onClose,
  notifications,
  isLoading,
  onNotificationClick,
  primaryCompany,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const markAllAsReadMutation = useMarkAllAsRead();

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleMarkAllAsRead = () => {
    markAllAsReadMutation.mutate();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">Notifications</h3>
        <div className="flex items-center gap-2">
          {notifications.some((n) => n.status === 'unread') && (
            <Button
              variant="ghost-primary"
              size="sm"
              onClick={handleMarkAllAsRead}
              disabled={markAllAsReadMutation.isPending}
              className="text-xs"
            >
              <CheckCheck className="w-3 h-3 mr-1" />
              Mark all read
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} className="p-1">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification._id}
                notification={notification}
                onNotificationClick={onNotificationClick}
                primaryCompany={primaryCompany}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface NotificationItemProps {
  notification: Notification;
  onNotificationClick: (notification: Notification) => void;
  primaryCompany?: Company;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onNotificationClick,
  primaryCompany,
}) => {
  const updateMutation = useUpdateNotification(notification._id);
  const deleteMutation = useDeleteNotification(notification._id);
  const { data: notificationData } = useUserNotifications();

  // Get the most up-to-date notification from cache
  const currentNotification = React.useMemo(() => {
    if (!notificationData?.notifications) return notification;

    const updatedNotification = notificationData.notifications.find(
      (n) => n._id === notification._id
    );

    return updatedNotification || notification;
  }, [notification, notificationData?.notifications]);

  const handleMarkAsRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentNotification.status === 'unread') {
      updateMutation.mutate({ status: 'read' });
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteMutation.mutate();
  };

  const handleClick = () => {
    onNotificationClick(currentNotification);
  };

  const getNotificationTypeColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'system':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  // Helper function to strip HTML tags for preview
  const stripHtml = (html: string) => {
    if (!html) return '';
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  const bodyText = currentNotification.body || '';
  const previewText = stripHtml(bodyText);

  // Generate profile image URL using primaryCompany
  const profileImageUrl =
    currentNotification.fromUserId &&
    currentNotification.profileImg &&
    primaryCompany?.imageUrl
      ? `${primaryCompany.imageUrl}/users/${currentNotification.fromUserId}/photo/${currentNotification.profileImg}`
      : '';

  // Get current status (reactive to cache updates)
  const currentStatus = updateMutation.isPending
    ? updateMutation.variables?.status || currentNotification.status
    : currentNotification.status;

  return (
    <div
      className={clsxm(
        'p-4 hover:bg-gray-50 cursor-pointer transition-colors',
        currentStatus === 'unread' && 'bg-blue-50/30'
      )}
      onClick={handleClick}
    >
      <div className="flex items-start gap-3">
        {/* Profile Image */}
        <Avatar className="h-8 w-8 flex-shrink-0">
          {profileImageUrl ? (
            <Image
              src={profileImageUrl}
              alt={`${currentNotification.fromFirstName} ${currentNotification.fromLastName}`}
              width={32}
              height={32}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-medium">
              {currentNotification.fromFirstName?.[0]}
              {currentNotification.fromLastName?.[0]}
            </div>
          )}
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-gray-900 truncate">
              {currentNotification.subject}
            </p>
            {currentStatus === 'unread' && (
              <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
            )}
          </div>

          <p className="text-sm text-gray-600 line-clamp-2 mb-2">
            {previewText}
          </p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className={clsxm(
                  'text-xs',
                  getNotificationTypeColor(currentNotification.msgType)
                )}
              >
                {currentNotification.msgType || 'info'}
              </Badge>
              <span className="text-xs text-gray-500">
                {formatDistanceToNow(new Date(currentNotification.sendTime), {
                  addSuffix: true,
                })}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {currentStatus === 'unread' && (
                <Button
                  variant="ghost-primary"
                  size="xs"
                  onClick={handleMarkAsRead}
                  disabled={updateMutation.isPending}
                  className="p-1"
                  title="Mark as read"
                >
                  <CheckCheck className="w-3 h-3" />
                </Button>
              )}
              <Button
                variant="ghost-danger"
                size="xs"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="p-1"
                title="Delete notification"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
