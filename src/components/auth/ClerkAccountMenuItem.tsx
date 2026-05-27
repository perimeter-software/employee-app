'use client';

/**
 * Dropdown item that opens Clerk's account modal (with our custom "Email
 * addresses" tab) from the existing header user menu — so we don't need a
 * second Clerk avatar in the header.
 *
 * Rendered ONLY when IS_V4 (i.e. inside ClerkProvider), so useClerk is safe.
 */

import { createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useClerk } from '@clerk/nextjs';
import { Mail } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { EmailAddressesManager } from '@/components/auth/EmailAddressesManager';

// Track the React roots Clerk mounts our custom page/icon into, so we can
// unmount them cleanly when Clerk tears the page down.
const roots = new WeakMap<HTMLDivElement, Root>();
const mountReact = (el: HTMLDivElement, node: ReactNode) => {
  const root = createRoot(el);
  roots.set(el, root);
  root.render(node);
};
const unmountReact = (el?: HTMLDivElement) => {
  if (!el) return;
  roots.get(el)?.unmount();
  roots.delete(el);
};

const emailCustomPages = [
  {
    label: 'Email addresses',
    mountIcon: (el: HTMLDivElement) =>
      mountReact(el, createElement(Mail, { className: 'h-4 w-4' })),
    unmountIcon: unmountReact,
    mount: (el: HTMLDivElement) =>
      mountReact(el, createElement(EmailAddressesManager)),
    unmount: unmountReact,
  },
];

export function ClerkAccountMenuItem() {
  const { openUserProfile } = useClerk();
  return (
    <DropdownMenuItem
      onClick={() => openUserProfile({ customPages: emailCustomPages })}
    >
      <Mail className="w-4 h-4 mr-2" />
      Manage account
    </DropdownMenuItem>
  );
}
