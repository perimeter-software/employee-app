'use client';

import { format, isToday } from 'date-fns';
import { useMemo } from 'react';
import DOMPurify from 'dompurify';

export interface ChatMessage {
  index: number;
  message: string;
  isAnswer: boolean;
  timestamp: string;
  isFollowUp?: boolean;
  followUpNumber?: string;
  questionNumber?: number;
  type?: string;
}

export interface ChatButton {
  label: string;
  value: string;
  selected: boolean;
  onClick: () => void;
}

interface ProcessedItem {
  isDateLabel: boolean;
  message: string;
  isAnswer?: boolean;
  isFollowUp?: boolean;
  questionNumber?: number;
  followUpNumber?: string;
  timeString?: string;
  index?: number;
}

interface AIChatWindowProps {
  firstName?: string;
  lastName?: string;
  items: ChatMessage[];
  interviewFinished: boolean;
  onPressUpdateInfo?: () => void;
  onPressBackToHome?: () => void;
  listRef: React.RefObject<HTMLDivElement | null>;
  isLoadingResponse?: boolean;
  firstLevelButtons?: ChatButton[] | null;
  secondLevelButtons?: ChatButton[] | null;
}

const getBotAvatarSrc = () => {
  const imageServer = process.env.NEXT_PUBLIC_IMAGE_SERVER ?? '';
  return imageServer
    ? `${imageServer}/common/static/aiChatbotProfilePicture.png`
    : '/static/aiChatbotProfilePicture.png';
};

const AIChatWindow: React.FC<AIChatWindowProps> = ({
  firstName,
  lastName,
  items,
  interviewFinished,
  onPressUpdateInfo,
  onPressBackToHome,
  listRef,
  isLoadingResponse = false,
  firstLevelButtons,
  secondLevelButtons,
}) => {
  const processedItems = useMemo<ProcessedItem[]>(() => {
    const result: ProcessedItem[] = [];
    const sorted = [...items].sort((a, b) => a.index - b.index);
    let lastDateStr: string | null = null;

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const d = new Date(item.timestamp);
      const dateStr = format(d, 'yyyy-MM-dd');

      if (lastDateStr !== dateStr) {
        result.push({
          isDateLabel: true,
          message: isToday(d) ? 'TODAY' : format(d, 'PPPp'),
        });
        lastDateStr = dateStr;
      }

      result.push({
        isDateLabel: false,
        isAnswer: item.isAnswer,
        isFollowUp: item.isFollowUp,
        questionNumber: item.questionNumber,
        followUpNumber: item.followUpNumber,
        timeString: format(d, 'p'),
        message: item.message,
        index: i,
      });
    }
    return result;
  }, [items]);

  return (
    <div
      ref={listRef}
      className="flex flex-col overflow-y-auto flex-1 pb-4 px-2 min-h-0"
    >
      {processedItems.map((item, idx) => {
        if (item.isDateLabel) {
          return (
            <p
              key={idx}
              className="text-center text-xs font-medium text-gray-500 my-3"
            >
              {item.message}
            </p>
          );
        }

        const isLast = idx === processedItems.length - 1;

        return (
          <ChatMessageBubble
            key={idx}
            item={item}
            firstName={firstName}
            lastName={lastName}
            isLast={isLast}
            interviewFinished={interviewFinished}
            onPressUpdateInfo={onPressUpdateInfo}
            onPressBackToHome={onPressBackToHome}
            firstLevelButtons={isLast ? firstLevelButtons : null}
            secondLevelButtons={isLast ? secondLevelButtons : null}
          />
        );
      })}

      {isLoadingResponse && (
        <div className="flex items-end gap-2 pt-4">
          <BotAvatar />
          <div className="bg-blue-600 text-white rounded-2xl rounded-bl-none px-4 py-2">
            <LoadingDots />
          </div>
        </div>
      )}
    </div>
  );
};

// ---------- Message Bubble ----------

interface BubbleProps {
  item: ProcessedItem;
  firstName?: string;
  lastName?: string;
  isLast: boolean;
  interviewFinished: boolean;
  onPressUpdateInfo?: () => void;
  onPressBackToHome?: () => void;
  firstLevelButtons?: ChatButton[] | null;
  secondLevelButtons?: ChatButton[] | null;
}

const ChatMessageBubble: React.FC<BubbleProps> = ({
  item,
  firstName,
  lastName,
  isLast,
  interviewFinished,
  onPressUpdateInfo,
  onPressBackToHome,
  firstLevelButtons,
  secondLevelButtons,
}) => {
  const isUser = item.isAnswer;
  const initials =
    `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();

  if (isUser) {
    return (
      <div className="flex justify-end items-end gap-2 pt-4">
        <div
          className="bg-gray-100 text-gray-800 rounded-2xl rounded-br-none px-4 py-2 max-w-[60%] text-sm [&>div]:inline [&>p]:inline"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(item.message ?? ''),
          }}
        />
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-400 flex items-center justify-center text-white text-sm font-medium">
          {initials}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-end gap-2 pt-4">
        <BotAvatar />
        <div className="flex flex-col gap-1 max-w-[60%]">
          <div
            className="bg-blue-600 text-white rounded-2xl rounded-bl-none px-4 py-2 text-sm [&>div]:inline [&>p]:inline"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(item.message ?? ''),
            }}
          />
          {isLast && interviewFinished && (
            <div className="flex gap-2 mt-1">
              {onPressUpdateInfo && (
                <button
                  type="button"
                  onClick={onPressUpdateInfo}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  UPDATE PROFILE
                </button>
              )}
              {onPressUpdateInfo && onPressBackToHome && (
                <span className="text-xs text-gray-400">|</span>
              )}
              {onPressBackToHome && (
                <button
                  type="button"
                  onClick={onPressBackToHome}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  BACK TO HOME
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {!!firstLevelButtons?.length && (
        <div className="flex flex-wrap gap-2 pt-3 pl-12">
          {firstLevelButtons.map((btn, i) => (
            <button
              key={i}
              type="button"
              onClick={btn.onClick}
              className={`rounded-full px-4 py-1.5 text-sm text-white transition-colors ${
                btn.selected ? 'bg-green-600' : 'bg-blue-800 hover:bg-blue-700'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}

      {!!secondLevelButtons?.length && (
        <div className="flex flex-wrap gap-2 pt-2 pl-12">
          {secondLevelButtons.map((btn, i) => (
            <button
              key={i}
              type="button"
              onClick={btn.onClick}
              className={`rounded-full px-4 py-1.5 text-sm text-white transition-colors ${
                btn.selected ? 'bg-green-600' : 'bg-blue-800 hover:bg-blue-700'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
};

// ---------- Bot Avatar ----------

const BotAvatar: React.FC = () => (
  <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-gray-200">
    <img
      src={getBotAvatarSrc()}
      alt="AI Bot"
      className="w-full h-full object-cover"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  </div>
);

// ---------- Loading Dots ----------

const LoadingDots: React.FC = () => (
  <div className="flex gap-1 py-1">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="w-2 h-2 rounded-full bg-white animate-bounce"
        style={{ animationDelay: `${i * 0.15}s` }}
      />
    ))}
  </div>
);

export default AIChatWindow;
