// app/layout.tsx
import { Inter } from "next/font/google";
import { UserProvider } from "@/components/shared/UserProvider";
import "./globals.css";
import { ReactQueryProvider } from "@/components/shared/ReactQueryProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Employee Portal",
  description: "Employee Portal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className} suppressHydrationWarning={true}>
        <ReactQueryProvider>
          <UserProvider>{children}</UserProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
