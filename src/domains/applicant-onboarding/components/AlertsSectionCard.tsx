'use client';

import { AlertCircle, Clock, Star, Info } from 'lucide-react';

export type AlertType = 'urgent' | 'warning' | 'info' | 'infoalt';

export interface AlertMessage {
  type: AlertType;
  title: string;
  description?: string;
  content?: React.ReactNode;
  action: string;
  func: () => void;
}

interface Props {
  message: AlertMessage;
}

const STYLES: Record<AlertType, { bg: string; borderColor: string; iconColor: string }> = {
  urgent:  { bg: '#fdd1cb', borderColor: '#ef4444', iconColor: '#ef4444' },
  warning: { bg: '#ffe8c3', borderColor: '#f59e0b', iconColor: '#f59e0b' },
  info:    { bg: '#d7e8ff', borderColor: '#3b82f6', iconColor: '#3b82f6' },
  infoalt: { bg: '#dfcaff', borderColor: '#8b5cf6', iconColor: '#8b5cf6' },
};

function AlertIcon({ type, color }: { type: AlertType; color: string }) {
  const cls = 'h-5 w-5 shrink-0';
  if (type === 'urgent') return <AlertCircle className={cls} style={{ color }} />;
  if (type === 'warning') return <Clock className={cls} style={{ color }} />;
  if (type === 'infoalt') return <Star className={cls} style={{ color }} />;
  return <Info className={cls} style={{ color }} />;
}

const AlertsSectionCard: React.FC<Props> = ({ message }) => {
  const { bg, borderColor, iconColor } = STYLES[message.type] ?? STYLES.info;
  return (
    <div
      className="mt-3 flex items-start gap-3 rounded-md p-3 shadow-sm"
      style={{ backgroundColor: bg, borderLeft: `6px solid ${borderColor}` }}
    >
      <AlertIcon type={message.type} color={iconColor} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{message.title}</p>
        {!!message.description && !message.content && (
          <p className="mt-0.5 whitespace-pre-line text-sm text-gray-600">{message.description}</p>
        )}
        {message.content}
      </div>
      <button
        type="button"
        onClick={message.func}
        className="shrink-0 text-xs font-semibold uppercase tracking-wide text-blue-600 hover:text-blue-800 focus:outline-none"
      >
        {message.action}
      </button>
    </div>
  );
};

export default AlertsSectionCard;
