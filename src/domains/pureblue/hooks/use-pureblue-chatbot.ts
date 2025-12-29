// domains/pureblue/hooks/use-pureblue-chatbot.ts

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PureBlueService } from '../services/pureblue-service';
import { useCurrentUser } from '@/domains/user/hooks/use-current-user';

export function usePureBlueChatbot() {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const [chatbotUrl, setChatbotUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  console.log('currentUser', currentUser);

  // Get email from currentUser (EnhancedUser type has email field)
  const userEmail = currentUser?.email || null;

  const {
    data: authToken,
    isLoading: tokenLoading,
    error: tokenError,
    refetch,
  } = useQuery({
    queryKey: ['pureblue-auth-token', userEmail],
    queryFn: async () => {
      if (!userEmail) {
        throw new Error('User email is required');
      }
      return PureBlueService.getAuthToken(userEmail);
    },
    enabled: !!userEmail && !userLoading,
    staleTime: 50 * 60 * 1000, // 50 minutes (tokens expire in 1 hour)
    gcTime: 60 * 60 * 1000, // 1 hour
    retry: 2,
  });

  useEffect(() => {
    if (authToken?.success && authToken?.responseObject?.token) {
      const token = authToken.responseObject.token;
      const personaSlug = process.env.NEXT_PUBLIC_PUREBLUE_PERSONA_SLUG;
      if (!personaSlug) {
        setError('NEXT_PUBLIC_PUREBLUE_PERSONA_SLUG environment variable is not set');
        setChatbotUrl(null);
        return;
      }
      const chatUrl = PureBlueService.getChatUrl();
      const url = `${chatUrl}/chat-auth/external-chat?authToken=${token}&personaSlug=${personaSlug}`;
      setChatbotUrl(url);
      setError(null);
    } else if (tokenError) {
      setError(tokenError instanceof Error ? tokenError.message : 'Failed to load chatbot');
      setChatbotUrl(null);
    }
  }, [authToken, tokenError]);

  return {
    chatbotUrl,
    isLoading: userLoading || tokenLoading,
    error: error || (tokenError instanceof Error ? tokenError.message : null),
    refetch,
  };
}

