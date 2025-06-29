import { Inter } from 'next/font/google';
import './globals.css';
import { UserProvider } from '@/components/shared/UserProvider';
import { ReactQueryProvider } from '@/components/shared/ReactQueryProvider';
import { AuthErrorBoundary } from '@/components/shared/AuthErrorBoundary';
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Employee Portal',
  description: 'Employee Portal',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className} suppressHydrationWarning={true}>
        <AuthErrorBoundary>
          <ReactQueryProvider>
            <UserProvider>
              {children}

              <Toaster
                position="top-right"
                toastOptions={{
                  style: {
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '16px',
                    fontSize: '14px',
                    fontWeight: '500',
                  },
                  className: 'sonner-toast',
                }}
                richColors
                closeButton
                expand={true}
                duration={4000}
              />
            </UserProvider>
          </ReactQueryProvider>
        </AuthErrorBoundary>
      </body>
    </html>
  );
}
