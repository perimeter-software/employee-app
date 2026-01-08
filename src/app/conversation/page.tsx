// /app/conversation/page.tsx
'use client';

import { useEffect, useRef } from 'react';
import Layout from '@/components/layout/Layout';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePureBlueChatbot } from '@/domains/pureblue';
import { usePageAuth } from '@/domains/shared/hooks/use-page-auth';
import {
  AuthErrorState,
  AuthLoadingState,
  UnauthenticatedState,
} from '@/components/shared/PageProtection';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button/Button';
import { useCurrentUser } from '@/domains/user';

const ChatConversationPage = () => {
  const hasLoggedActivity = useRef(false);
  
  // Auth check
  const {
    shouldShowContent,
    isLoading: authLoading,
    error: authError,
  } = usePageAuth({
    requireAuth: true,
  });

  // Get current user for logging
  const { data: currentUser } = useCurrentUser();

  // Get PureBlue chatbot URL
  const {
    chatbotUrl,
    isLoading: chatbotLoading,
    error: chatbotError,
    refetch,
  } = usePureBlueChatbot();

  // Log "Ask a Question" activity when chatbot is successfully loaded
  useEffect(() => {
    if (
      chatbotUrl &&
      !chatbotLoading &&
      !chatbotError &&
      currentUser &&
      !hasLoggedActivity.current
    ) {
      hasLoggedActivity.current = true;
      
      const logAskQuestionActivity = async () => {
        try {
          const { logActivity, createActivityLogData } = await import('@/lib/services/activity-logger');
          const agentName = currentUser.name || 
            `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || 
            currentUser.email || 
            'Employee';
          
          await logActivity(
            createActivityLogData(
              'Ask a Question',
              `${agentName} accessed the "Ask a Question" chatbot`,
              {
                applicantId: currentUser.applicantId,
                userId: currentUser._id,
                agent: agentName,
                details: {
                  chatbotUrl: chatbotUrl,
                  accessTime: new Date().toISOString(),
                },
              }
            )
          );
        } catch (error) {
          // Don't fail page load if logging fails
          console.error('Error logging "Ask a Question" activity:', error);
        }
      };

      logAskQuestionActivity();
    }
  }, [chatbotUrl, chatbotLoading, chatbotError, currentUser]);

  // Early returns for auth states
  if (authLoading) {
    return <AuthLoadingState />;
  }

  if (authError) {
    return <AuthErrorState error={authError.message} />;
  }

  if (!shouldShowContent) {
    return <UnauthenticatedState />;
  }

  // Loading state while getting chatbot URL
  if (chatbotLoading) {
    return (
      <Layout>
        <div className="flex h-[calc(100vh-12rem)] items-center justify-center">
          <div className="text-center space-y-4">
            <Skeleton className="h-12 w-64 mx-auto" />
            <Skeleton className="h-4 w-48 mx-auto" />
            <p className="text-sm text-gray-500 mt-4">Loading chatbot...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Error state
  if (chatbotError || !chatbotUrl) {
    return (
      <Layout>
        <div className="flex h-[calc(100vh-12rem)] items-center justify-center">
          <div className="text-center space-y-4 max-w-md mx-auto px-4">
            <div className="flex justify-center">
              <AlertCircle className="h-12 w-12 text-red-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-800">
              Unable to Load Chatbot
            </h2>
            <p className="text-gray-600">
              {chatbotError ||
                'Failed to initialize chatbot. Please try again.'}
            </p>
            <Button
              onClick={() => refetch()}
              variant="primary"
              className="mt-4"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  // Render chatbot iframe
  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-12rem)]">
        {/* Header */}
        <div className="border-b border-gray-200 p-4 bg-white">
          <h1 className="text-xl font-semibold text-gray-800">
            Ask a Question
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Get instant answers from our AI assistant
          </p>
        </div>

        {/* Chatbot Iframe */}
        <div className="flex-1 relative overflow-hidden">
          <iframe
            src={chatbotUrl}
            className="w-full h-full border-0"
            title="PureBlue Chatbot"
            allow="microphone; camera"
            style={{
              minHeight: '600px',
            }}
          />
        </div>
      </div>
    </Layout>
  );
};

export default ChatConversationPage;
