"use client";

import { APIProvider } from "@vis.gl/react-google-maps";

interface GoogleMapProviderProps {
  children: React.ReactNode;
}

export function GoogleMapProvider({ children }: GoogleMapProviderProps) {
  const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!GOOGLE_MAPS_API_KEY) {
    return <>{children}</>;
  }

  // return (
  //   <APIProvider
  //     apiKey={GOOGLE_MAPS_API_KEY}
  //     libraries={["geometry"]}
  //     onLoad={() => console.log("Google Maps API loaded")}
  //   >
  //     {children}
  //   </APIProvider>
  // );

  return <div>{children}</div>;
}
