export type VenueContact = {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
};

export type VenueWithStatus = {
  _id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  bannerUrl?: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  distanceInMiles?: number;
  userVenueStatus: string;
  venueContact1?: VenueContact;
  location?: { coordinates?: [number, number] }; // [longitude, latitude]
  otherUrls?: string[];
};
