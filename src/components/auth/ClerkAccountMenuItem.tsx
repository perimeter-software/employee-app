'use client';

/**
 * Dropdown item that opens Clerk's account modal from the existing header user
 * menu — so we don't need a second Clerk avatar in the header. Email
 * management renders natively in the modal (the employeeapp instance enables
 * it), so no custom page is needed.
 *
 * Rendered ONLY when IS_V4 (i.e. inside ClerkProvider), so useClerk is safe.
 */

import { useClerk } from '@clerk/nextjs';
import { Mail } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/DropdownMenu';

export function ClerkAccountMenuItem() {
  const { openUserProfile } = useClerk();
  return (
    <DropdownMenuItem onClick={() => openUserProfile()}>
      <Mail className="w-4 h-4 mr-2" />
      Manage account
    </DropdownMenuItem>
  );
}
