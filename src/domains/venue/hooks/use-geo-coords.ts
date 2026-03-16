import { useState, useEffect } from 'react';

export function useGeoCoords() {
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => { /* permission denied — proceed without geo */ }
    );
  }, []);

  return coords;
}
