'use client';

import { UserProvider as Auth0Provider } from '@auth0/nextjs-auth0/client';
import { FC, PropsWithChildren } from 'react';

const UserProvider: FC<PropsWithChildren> = ({ children }) => {
  return <Auth0Provider>{children}</Auth0Provider>;
};

export default UserProvider;
