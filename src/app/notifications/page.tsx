'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';
import { NextPage } from 'next';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  AuthErrorState,
  AuthLoadingState,
  UnauthenticatedState,
} from '@/components/shared/PageProtection';
import { NotificationDetailModal } from '@/components/shared/NotificationBell/NotificationDetailModal';
import { usePageAuth } from '@/domains/shared/hooks/use-page-auth';
import { usePrimaryCompany } from '@/domains/company/hooks';
import {
  useDeleteNotification,
  useMarkAllAsRead,
  useNotifications,
  useUpdateNotification,
  useNotification,
  useUserNotifications,
} from '@/domains/notification/hooks';
import { useDeepLink } from '@/lib/notifications/use-deep-link';
import { DEEP_LINK_PARAMS } from '@/lib/notifications/deep-links';
import { Notification } from '@/domains/notification/types';
import { Company } from '@/domains/company/types';
import { clsxm } from '@/lib/utils';

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

const stripHtml = (html: string) => {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '');
};

interface NotificationRowProps {
  notification: Notification;
  onNotificationClick: (notification: Notification) => void;
  primaryCompany?: Company;
}

const NotificationRow: React.FC<NotificationRowProps> = ({
  notification,
  onNotificationClick,
  primaryCompany,
}) => {
  const updateMutation = useUpdateNotification(notification._id);
  const deleteMutation = useDeleteNotification(notification._id);
  const { data: notificationData } = useUserNotifications();

  // Get the most up-to-date notification from cache
  const currentNotification = useMemo(() => {
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

  const previewText = stripHtml(currentNotification.body || '');

  const profileImageUrl =
    currentNotification.fromUserId &&
    currentNotification.profileImg &&
    primaryCompany?.imageUrl
      ? `${primaryCompany.imageUrl}/users/${currentNotification.fromUserId}/photo/${currentNotification.profileImg}`
      : '';

  const currentStatus = updateMutation.isPending
    ? updateMutation.variables?.status || currentNotification.status
    : currentNotification.status;

  return (
    <div
      className={clsxm(
        'p-4 sm:p-5 hover:bg-gray-50 cursor-pointer transition-colors',
        currentStatus === 'unread' && 'bg-blue-50/30'
      )}
      onClick={() => onNotificationClick(currentNotification)}
    >
      <div className="flex items-start gap-3">
        {/* Profile Image */}
        <Avatar className="h-9 w-9 flex-shrink-0">
          {profileImageUrl ? (
            <Image
              src={profileImageUrl}
              alt={`${currentNotification.fromFirstName} ${currentNotification.fromLastName}`}
              width={36}
              height={36}
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

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Badge
                variant="secondary"
                className={clsxm(
                  'text-xs',
                  getNotificationTypeColor(currentNotification.msgType)
                )}
              >
                {currentNotification.msgType || 'info'}
              </Badge>
              <span className="text-xs text-gray-500 truncate">
                {formatDistanceToNow(new Date(currentNotification.sendTime), {
                  addSuffix: true,
                })}
              </span>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
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

const NotificationsPageContent: React.FC = () => {
  const {
    shouldShowContent,
    isLoading: pageAuthLoading,
    error: pageAuthError,
  } = usePageAuth({ requireAuth: true });

  const [selectedNotification, setSelectedNotification] =
    useState<Notification | null>(null);

  const { data: notificationData, isLoading } = useUserNotifications();
  const { notifications: localNotifications } = useNotifications();
  const { data: primaryCompany } = usePrimaryCompany();
  const markAllAsReadMutation = useMarkAllAsRead();

  const serverNotifications = useMemo(
    () => notificationData?.notifications || [],
    [notificationData?.notifications]
  );
  const allNotifications = [...serverNotifications, ...localNotifications];
  const unreadCount = allNotifications.filter(
    (n) => n.status === 'unread'
  ).length;

  // Push deep link: gignology://notifications/<id>/details → ?id=<id>
  const {
    values: { [DEEP_LINK_PARAMS.notificationId]: deepLinkId },
    clear: clearDeepLink,
  } = useDeepLink([DEEP_LINK_PARAMS.notificationId]);

  // The notification may not be on the first page of the list (or the list may
  // still be loading), so fall back to fetching it by id.
  const { data: fetchedNotification } = useNotification(deepLinkId ?? '');

  useEffect(() => {
    if (!deepLinkId) return;
    const match =
      serverNotifications.find((n) => n._id === deepLinkId) ??
      fetchedNotification;
    if (!match) return;
    setSelectedNotification(match);
    clearDeepLink();
  }, [deepLinkId, serverNotifications, fetchedNotification, clearDeepLink]);

  if (pageAuthLoading) {
    return <AuthLoadingState />;
  }

  if (pageAuthError) {
    return <AuthErrorState error={pageAuthError.message} />;
  }

  if (!shouldShowContent) {
    return <UnauthenticatedState />;
  }

  return (
    <Layout title="Notifications">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {unreadCount > 0
                ? `${unreadCount} unread notification${
                    unreadCount === 1 ? '' : 's'
                  }`
                : 'You are all caught up.'}
            </p>
          </div>

          {unreadCount > 0 && (
            <Button
              variant="ghost-primary"
              size="sm"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
              className="text-xs flex-shrink-0"
            >
              <CheckCheck className="w-3 h-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        {/* List */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-4 sm:p-5 space-y-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : allNotifications.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Bell className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {allNotifications.map((notification) => (
                <NotificationRow
                  key={notification._id}
                  notification={notification}
                  onNotificationClick={setSelectedNotification}
                  primaryCompany={primaryCompany}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <NotificationDetailModal
        isOpen={!!selectedNotification}
        onClose={() => setSelectedNotification(null)}
        notification={selectedNotification}
        primaryCompany={primaryCompany}
      />
    </Layout>
  );
};

// NotificationsPageContent reads ?id= via useSearchParams
const NotificationsPage: NextPage = () => (
  <Suspense fallback={<AuthLoadingState />}>
    <NotificationsPageContent />
  </Suspense>
);

export default NotificationsPage;
