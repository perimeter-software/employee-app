import { Inter } from "next/font/google";
import "./globals.css";
import { UserProvider } from "@/components/shared/UserProvider";
import { ReactQueryProvider } from "@/components/shared/ReactQueryProvider";
import { Toaster } from "sonner";
import { GoogleMapProvider } from "@/components/shared/GoogleMapProvider/GoogleMapProvider";

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
          <UserProvider>
            <GoogleMapProvider>
              {children}

              <Toaster
                position="top-right"
                toastOptions={{
                  style: {
                    background: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    padding: "16px",
                    fontSize: "14px",
                    fontWeight: "500",
                  },
                  className: "sonner-toast",
                }}
                richColors
                closeButton
                expand={true}
                duration={4000}
              />
            </GoogleMapProvider>
          </UserProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
