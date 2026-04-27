'use client';

import { UserProvider as Auth0Provider } from '@auth0/nextjs-auth0/client';
import { ClerkProvider } from '@clerk/nextjs';
import { FC, PropsWithChildren } from 'react';
import { IS_V4 } from '@/lib/config/auth-mode';

const UserProvider: FC<PropsWithChildren> = ({ children }) => {
  if (IS_V4) {
    return <ClerkProvider>{children}</ClerkProvider>;
  }
  return <Auth0Provider>{children}</Auth0Provider>;
};

export default UserProvider;
