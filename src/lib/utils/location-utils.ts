// import { systemNotification } from "../../stores";

import { ClockInCoordinates, GigLocation, Location } from '@/domains/job';

// const ERROR_MESSAGES = {
//   LOCATION_PERMISSION:
//     "Please enable location services in your browser settings and refresh the page.",
//   LOCATION_UNAVAILABLE:
//     "Unable to retrieve your location. Please check your connection or try again later.",
//   LOCATION_TIMEOUT:
//     "The request to get your location took too long. Please try again.",
//   LOCATION_GENERIC:
//     "An error occurred while trying to get your location. Please try again.",
// };

export const checkLocationPermission = async () => {
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const result = await navigator.permissions.query({
        name: 'geolocation',
      });
      return result.state;
    } catch (error) {
      console.error('Error checking geolocation permission:', error);
      return 'error';
    }
  }
  return 'unknown';
};

export const getCurrentPosition = async (): Promise<Location> => {
  console.log('Checking location permission...');
  const permissionStatus = await checkLocationPermission();

  if (permissionStatus === 'denied') {
    throw new Error(
      'Location permission is denied. Please enable it in your browser settings and refresh the page.'
    );
  }

  return new Promise((resolve, reject) => {
    console.log('Requesting current geolocation...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('Geolocation success:', position);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude || null,
          altitudeAccuracy: position.coords.altitudeAccuracy || null,
          heading: position.coords.heading || null,
          speed: position.coords.speed || null,
        });
      },
      (error) => {
        console.error('Geolocation error:', error);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error('User denied the request for Geolocation.'));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error('Location information is unavailable.'));
            break;
          case error.TIMEOUT:
            reject(new Error('The request to get user location timed out.'));
            break;
          default:
            reject(new Error('An unknown error occurred.'));
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 8000, // Wait for up to 8 seconds
        maximumAge: 0, // Ensure fresh location
      }
    );
  });
};

export async function handleLocationServices(): Promise<{
  locationInfo: Location | null;
}> {
  console.log('Starting handleLocationServices');
  let locationInfo: Location | null = null;

  try {
    console.log('Attempting to get the current position...');
    locationInfo = await getCurrentPosition();
    console.log('Location successfully retrieved:', locationInfo);
  } catch (error) {
    console.error('Error in handleLocationServices:', error);

    // Handle different kinds of errors based on the error message or code
    // if (error instanceof Error) {
    //   if (error.message.includes("User denied the request for Geolocation.")) {
    //     systemNotification.add(ERROR_MESSAGES.LOCATION_PERMISSION, "error");
    //   } else if (
    //     error.message.includes("Location information is unavailable")
    //   ) {
    //     systemNotification.add(ERROR_MESSAGES.LOCATION_UNAVAILABLE, "error");
    //   } else if (
    //     error.message.includes("The request to get user location timed out")
    //   ) {
    //     systemNotification.add(ERROR_MESSAGES.LOCATION_TIMEOUT, "error");
    //   } else {
    //     systemNotification.add(ERROR_MESSAGES.LOCATION_GENERIC, "error");
    //   }
    // }
  }

  console.log('Finishing handleLocationServices', { locationInfo });
  return { locationInfo };
}

export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in km
  return distance;
};

export const parseClockInCoordinates = (
  clockInCoordinates: string | GigLocation
): ClockInCoordinates | null => {
  let coordinates: GigLocation;

  if (typeof clockInCoordinates === 'string') {
    try {
      coordinates = JSON.parse(clockInCoordinates);
    } catch (e) {
      console.error('Invalid JSON format for clockInCoordinates:', e);
      return null;
    }
  } else {
    coordinates = clockInCoordinates;
  }

  if (!isValidClockInCoordinates(coordinates)) {
    return null;
  }

  return {
    latitude: coordinates.latitude!,
    longitude: coordinates.longitude!,
    accuracy: coordinates.accuracy!,
    altitude: coordinates.altitude,
    altitudeAccuracy: coordinates.altitudeAccuracy,
    speed: coordinates.speed,
    heading: coordinates.heading,
    feetFromVenueCenter: coordinates.feetFromVenueCenter,
  };
};

export const isValidClockInCoordinates = (
  coordinates: GigLocation
): coordinates is Required<
  Pick<GigLocation, 'latitude' | 'longitude' | 'accuracy'>
> &
  GigLocation => {
  return (
    typeof coordinates.latitude === 'number' &&
    typeof coordinates.longitude === 'number' &&
    typeof coordinates.accuracy === 'number' &&
    !isNaN(coordinates.latitude) &&
    !isNaN(coordinates.longitude) &&
    !isNaN(coordinates.accuracy) &&
    coordinates.latitude !== 0 &&
    coordinates.longitude !== 0 &&
    Math.abs(coordinates.latitude) <= 90 && // Valid latitude range
    Math.abs(coordinates.longitude) <= 180 // Valid longitude range
  );
};

// Debug utility to help identify coordinate accuracy issues
export const debugCoordinates = (
  userCoords: { latitude: number; longitude: number; accuracy?: number },
  jobCoords: { latitude: number; longitude: number },
  locationDescription?: string
) => {
  console.group(
    `🗺️ Coordinate Debug ${locationDescription ? `- ${locationDescription}` : ''}`
  );

  console.log('User coordinates:', {
    latitude: userCoords.latitude,
    longitude: userCoords.longitude,
    accuracy: userCoords.accuracy ? `±${userCoords.accuracy}m` : 'unknown',
    mapsLink: `https://maps.google.com/?q=${userCoords.latitude},${userCoords.longitude}`,
  });

  console.log('Job site coordinates:', {
    latitude: jobCoords.latitude,
    longitude: jobCoords.longitude,
    mapsLink: `https://maps.google.com/?q=${jobCoords.latitude},${jobCoords.longitude}`,
  });

  const distance = calculateDistance(
    userCoords.latitude,
    userCoords.longitude,
    jobCoords.latitude,
    jobCoords.longitude
  );

  console.log(
    'Distance:',
    `${distance.toFixed(2)} km (${(distance * 1000).toFixed(0)} meters)`
  );

  // Check if coordinates look reasonable for Austin area
  const austinLat = 30.2672;
  const austinLon = -97.7431;
  const distanceFromAustin = calculateDistance(
    userCoords.latitude,
    userCoords.longitude,
    austinLat,
    austinLon
  );

  if (distanceFromAustin > 100) {
    console.warn(
      `⚠️ User coordinates seem far from Austin (${distanceFromAustin.toFixed(0)}km away)`
    );
  }

  const jobDistanceFromAustin = calculateDistance(
    jobCoords.latitude,
    jobCoords.longitude,
    austinLat,
    austinLon
  );
  if (jobDistanceFromAustin > 100) {
    console.warn(
      `⚠️ Job coordinates seem far from Austin (${jobDistanceFromAustin.toFixed(0)}km away)`
    );
  }

  console.groupEnd();
};
