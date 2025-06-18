// /app/conversations/page.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Skeleton } from '@/components/ui/Skeleton';
import { Input } from '@/components/ui/Input/Input';
import { Button } from '@/components/ui/Button/Button';
import {
  useConversations,
  useCreateConversation,
} from '@/domains/conversation/hooks/conversation';
import { AiConversation, AiMessage } from '@/domains/conversation/types';
import { withAuth } from '@/domains/shared';

const ChatConversationPage = () => {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const company = 'Company';

  // Using the hook correctly
  const {
    data: conversationsData,
    isLoading: conversationsLoading,
    error: conversationsError,
  } = useConversations();

  // Create conversation mutation hook
  const createConversation = useCreateConversation();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load messages from the first conversation if available
  useEffect(() => {
    if (
      conversationsData?.conversations &&
      conversationsData.conversations.length > 0
    ) {
      const firstConversation = conversationsData.conversations[0];
      setMessages(firstConversation.messages || []);
      setConversationId(firstConversation.id || firstConversation._id || null);
    }
  }, [conversationsData]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    setIsLoading(true);
    const newMessage: AiMessage = {
      role: 'user',
      content: inputValue.trim(),
      created: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      const newConversationData: Partial<AiConversation> = {
        messages: [newMessage],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        title:
          inputValue.trim().slice(0, 30) +
          (inputValue.trim().length > 30 ? '...' : ''),
      };

      // Use the create conversation hook
      const createdConversation =
        await createConversation.mutateAsync(newConversationData);

      setConversationId(
        createdConversation.id || createdConversation._id || null
      );

      // Simulate response
      setTimeout(() => {
        const responseMessage: AiMessage = {
          role: 'assistant',
          content:
            'This is a simulated response. Implement your chat API here.',
          created: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, responseMessage]);
        setIsTyping(false);
        setIsLoading(false);
      }, 1000);
    } catch (error) {
      console.error('Error creating conversation:', error);
      setIsTyping(false);
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (conversationsLoading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          {/* Header Skeleton */}
          <div className="border-b border-gray-200 p-4">
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>

          {/* Messages Container Skeleton */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="flex justify-start">
                <Skeleton className="h-16 w-64 rounded-lg" />
              </div>
            ))}
            {[...Array(2)].map((_, index) => (
              <div key={`right-${index}`} className="flex justify-end">
                <Skeleton className="h-16 w-64 rounded-lg" />
              </div>
            ))}
          </div>

          {/* Input Area Skeleton */}
          <div className="border-t border-gray-200 p-4">
            <div className="flex space-x-2">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-10 rounded-lg" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (conversationsError) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="text-center">
            <p className="text-red-500">Error loading conversations:</p>
            <p className="text-gray-600">{conversationsError.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Retry
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Header */}
        <div className="border-b border-gray-200 p-4">
          <h1 className="text-xl font-semibold text-gray-800">
            Chat with {company}
          </h1>
          {conversationsData?.conversations && (
            <p className="text-sm text-gray-500">
              {conversationsData.conversations.length} conversation(s) available
            </p>
          )}
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !isTyping && (
            <div className="text-center text-gray-500 mt-8">
              <p>No messages yet. Start a conversation!</p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-800'
                }`}
              >
                <p className="text-sm">{message.content}</p>
                <p className="text-xs mt-1 opacity-70">
                  {formatTime(new Date(message.created || new Date()))}
                </p>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-gray-200 text-gray-800 max-w-xs lg:max-w-md px-4 py-2 rounded-lg">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex space-x-2">
            <Input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              disabled={isLoading}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              loading={isLoading}
              rightIcon={<Send size={20} />}
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default withAuth(ChatConversationPage, {
  requireAuth: true,
});
