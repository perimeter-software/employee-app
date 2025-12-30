// domains/pureblue/hooks/use-pureblue-chatbot.ts

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PureBlueService } from '../services/pureblue-service';
import { useCurrentUser } from '@/domains/user/hooks/use-current-user';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';

export function usePureBlueChatbot() {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const { data: primaryCompany, isLoading: companyLoading } = usePrimaryCompany();
  const [chatbotUrl, setChatbotUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get email from currentUser (EnhancedUser type has email field)
  const userEmail = currentUser?.email || null;
  
  // Get PureBlue config from primary company (required)
  const pureBlueConfig = primaryCompany?.pureBlueConfig;

  const {
    data: authToken,
    isLoading: tokenLoading,
    error: tokenError,
    refetch,
  } = useQuery({
    queryKey: ['pureblue-auth-token', userEmail, pureBlueConfig],
    queryFn: async () => {
      if (!userEmail) {
        throw new Error('User email is required');
      }
      if (!pureBlueConfig) {
        throw new Error('Chatbot not available for this tenant');
      }
      return PureBlueService.getAuthToken(userEmail, pureBlueConfig);
    },
    enabled: !!userEmail && !!pureBlueConfig && !userLoading && !companyLoading,
    staleTime: 50 * 60 * 1000, // 50 minutes (tokens expire in 1 hour)
    gcTime: 60 * 60 * 1000, // 1 hour
    retry: 2,
  });

  useEffect(() => {
    if (!pureBlueConfig) {
      setError('Chatbot not available for this tenant');
      setChatbotUrl(null);
      return;
    }

    if (authToken?.success && authToken?.responseObject?.token) {
      try {
        const token = authToken.responseObject.token;
        const personaSlug = PureBlueService.getPersonaSlug(pureBlueConfig);
        const chatUrl = PureBlueService.getChatUrl(pureBlueConfig);
        const url = `${chatUrl}/chat-auth/external-chat?authToken=${token}&personaSlug=${personaSlug}`;
        setChatbotUrl(url);
        setError(null);
      } catch (configError) {
        setError(configError instanceof Error ? configError.message : 'Chatbot not available for this tenant');
        setChatbotUrl(null);
      }
    } else if (tokenError) {
      setError(tokenError instanceof Error ? tokenError.message : 'Chatbot not available for this tenant');
      setChatbotUrl(null);
    }
  }, [authToken, tokenError, pureBlueConfig]);

  return {
    chatbotUrl,
    isLoading: userLoading || tokenLoading,
    error: error || (tokenError instanceof Error ? tokenError.message : null),
    refetch,
  };
}

