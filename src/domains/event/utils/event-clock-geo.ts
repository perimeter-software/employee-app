import type { Db } from 'mongodb';
import { calculateDistance, isPointInPolygon } from '@/lib/utils';
import type { ApplicantNote } from '@/domains/user/types/applicant.types';

export const METERS_TO_FEET = 3.28084;
export const KM_TO_FEET = 3280.84;

export type GeoFenceData = {
  venueLat: number;
  venueLng: number;
  /** Total allowed radius in meters (geoFenceRadius + graceDistance converted from feet) */
  radiusMeters: number;
  polygon: number[][] | null;
};

/**
 * Resolves geofence data for an event.
 * Prefers event.secondaryLocation; falls back to the venue's primary location.
 * Returns null when no geocoordinates are configured.
 */
export async function resolveEventGeoFence(
  db: Db,
  event: Record<string, unknown>
): Promise<GeoFenceData | null> {
  const secondaryLocation = event.secondaryLocation as
    | Record<string, unknown>
    | undefined;

  if (secondaryLocation?.geocoordinates) {
    const geo = secondaryLocation.geocoordinates as {
      coordinates?: [number, number];
      polygon?: number[][];
    };
    if (!geo.coordinates) return null;
    const [venueLng, venueLat] = geo.coordinates;
    const radius = (secondaryLocation.radius as number) ?? 0;
    const graceDistanceFeet =
      (secondaryLocation.graceDistanceFeet as number) ?? 0;
    return {
      venueLat,
      venueLng,
      radiusMeters: radius + graceDistanceFeet / METERS_TO_FEET,
      polygon: geo.polygon?.length ? geo.polygon : null,
    };
  }

  const venueSlug = event.venueSlug as string | undefined;
  if (!venueSlug) return null;

  const venue = await db
    .collection('venues')
    .findOne({ slug: venueSlug }, { projection: { locations: 1 } });
  if (!venue?.locations?.length) return null;

  const locations = venue.locations as Array<Record<string, unknown>>;
  const primaryLocation =
    locations.find((loc) => loc.primaryLocation === 'Yes') ?? locations[0];
  if (!primaryLocation) return null;

  const geo = primaryLocation.geocoordinates as
    | {
        coordinates?: [number, number];
        geoFenceRadius?: number;
        polygon?: number[][];
      }
    | undefined;
  if (!geo?.coordinates) return null;

  const [venueLng, venueLat] = geo.coordinates;
  const radius = (geo.geoFenceRadius as number) ?? 0;
  const graceDistanceFeet = (primaryLocation.graceDistanceFeet as number) ?? 0;

  return {
    venueLat,
    venueLng,
    radiusMeters: radius + graceDistanceFeet / METERS_TO_FEET,
    polygon: geo.polygon?.length ? geo.polygon : null,
  };
}

/**
 * Checks coordinates against the event geofence, mutates rosterRecord and
 * coordinates in-place, and pushes an applicant note when the employee is
 * outside the fence.
 *
 * Mirrors legacy EventController.logClockInOutCoordinates.
 *
 * @returns true  – inside geofence
 *          false – outside geofence
 *          null  – no geofence configured for this event
 */
export async function processClockCoordinates({
  db,
  coordinates,
  direction,
  event,
  rosterRecord,
  agentFirstName,
  agentLastName,
  createAgent,
  agent,
  applicantNotes,
}: {
  db: Db;
  coordinates: Record<string, unknown>;
  direction: 'in' | 'out';
  event: Record<string, unknown>;
  rosterRecord: Record<string, unknown>;
  agentFirstName: string;
  agentLastName: string;
  createAgent: string;
  agent: string;
  applicantNotes: ApplicantNote[];
}): Promise<boolean | null> {
  const geoFenceData = await resolveEventGeoFence(db, event);
  if (!geoFenceData) return null;

  const { venueLat, venueLng, radiusMeters, polygon } = geoFenceData;
  const userLat = +coordinates.latitude!;
  const userLng = +coordinates.longitude!;

  const distanceKm = calculateDistance(userLat, userLng, venueLat, venueLng);

  const withinGeoFence = polygon
    ? isPointInPolygon(userLat, userLng, polygon)
    : distanceKm * 1000 <= radiusMeters;

  const feetFromVenueCenter = distanceKm * KM_TO_FEET;
  coordinates.feetFromVenueCenter = +feetFromVenueCenter.toFixed(2);

  if (withinGeoFence) {
    rosterRecord.geofence = 'Yes';
  } else {
    rosterRecord.geofence = 'No';
    rosterRecord.flag = 'Yes';
    rosterRecord.flagColor = 'error';
    rosterRecord.flagTooltip = `Clock-${direction} outside the geofence`;

    const geoFenceRadiusFeet = radiusMeters * METERS_TO_FEET;
    const distanceDifferenceFeet = feetFromVenueCenter - geoFenceRadiusFeet;

    applicantNotes.push({
      type: `Clock-${direction} outside of geofence`,
      text: `<p>Event: ${(event.eventUrl as string) ?? ''}
        <blockquote><div>Employee clocked ${direction} from coordinates ${JSON.stringify(coordinates, null, 2)}, <br />
          which is outside of the venue geofence by ${+distanceDifferenceFeet.toFixed(1)} feet: [${venueLng}, ${venueLat}]</div></blockquote></p>
        <p><a href="https://www.google.com/maps?q=${userLat},${userLng}" target="_blank"
        title="See employee's location in Google Maps">See employee's location in Google Maps</a>
        </p>`,
      firstName: agentFirstName,
      lastName: agentLastName,
      userId: createAgent,
      date: new Date(),
    });
  }

  return withinGeoFence;
}
