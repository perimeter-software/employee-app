export type ClockInCoordinates = Omit<
  GigLocation,
  "latitude" | "longitude" | "accuracy"
> & {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export type Location = {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
};

export type GigLocation = Location & {
  feetFromVenueCenter: number | null;
};

export type Coordinates = number[];

export type GeoCoordinates = {
  coordinates: Coordinates;
  geoFenceRadius: number;
  type: string;
};

export type JobLocation = {
  locationName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  longitude: number;
  latitude: number;
  radius: number;
  modifiedDate: string;
  locationSlug: string;
  geocoordinates: GeoCoordinates;
  graceDistanceFeet: number;
};
