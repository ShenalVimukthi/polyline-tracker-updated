import { decode, encode } from '@googlemaps/polyline-codec';

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Decodes Google encoded polyline to array of lat/lng coordinates
 */
export function decodePolyline(encodedPolyline: string): LatLng[] {
  const decoded = decode(encodedPolyline, 5);
  return decoded.map(([lat, lng]) => ({ lat, lng }));
}

/**
 * Encodes array of lat/lng coordinates to Google encoded polyline
 */
export function encodePolyline(points: LatLng[]): string {
  const coordinates: [number, number][] = points.map(p => [p.lat, p.lng]);
  return encode(coordinates, 5);
}

/**
 * Calculates time between each point based on total duration
 */
export function calculateTimePerPoint(
  totalDurationMinutes: number,
  numberOfPoints: number
): number {
  // Return time in milliseconds per point
  return (totalDurationMinutes * 60 * 1000) / numberOfPoints;
}

/**
 * Format time in hours and minutes
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}
