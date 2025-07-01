// NotificationBell.tsx
'use client';

import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  useUserNotifications,
  useNotifications,
} from '@/domains/notification/hooks';
import { usePrimaryCompany } from '@/domains/company/hooks'; // Adjust import path as needed
import { NotificationPopover } from './NotificationPopover';
import { NotificationDetailModal } from './NotificationDetailModal';
import { Notification } from '@/domains/notification/types';

export const NotificationBell = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] =
    useState<Notification | null>(null);
  const { data: notificationData, isLoading } = useUserNotifications();
  const { notifications: localNotifications } = useNotifications();
  const { data: primaryCompany } = usePrimaryCompany();

  // Combine server notifications with local notifications
  const serverNotifications = notificationData?.notifications || [];
  const allNotifications = [...serverNotifications, ...localNotifications];
  const unreadCount = allNotifications.filter(
    (n) => n.status === 'unread'
  ).length;

  const handleNotificationClick = (notification: Notification) => {
    setSelectedNotification(notification);
    setIsOpen(false); // Close popover when opening modal
  };

  const handleCloseModal = () => {
    setSelectedNotification(null);
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="relative"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Bell className="w-5 h-5 text-appPrimary" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        <span className="sr-only">
          Notifications {unreadCount > 0 && `(${unreadCount} unread)`}
        </span>
      </Button>

      <NotificationPopover
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        notifications={allNotifications}
        isLoading={isLoading}
        onNotificationClick={handleNotificationClick}
        primaryCompany={primaryCompany}
      />

      <NotificationDetailModal
        isOpen={!!selectedNotification}
        onClose={handleCloseModal}
        notification={selectedNotification}
        primaryCompany={primaryCompany}
      />
    </div>
  );
};
