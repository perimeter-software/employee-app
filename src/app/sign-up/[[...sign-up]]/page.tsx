import { notFound } from 'next/navigation';
import { SignUp } from '@clerk/nextjs';
import { IS_V4 } from '@/lib/config/auth-mode';

export const dynamic = 'force-dynamic';

export default function SignUpPage() {
  if (!IS_V4) notFound();
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <SignUp />
    </div>
  );
}
