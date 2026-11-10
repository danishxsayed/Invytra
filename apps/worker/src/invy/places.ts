/*
 * Google Places API (New), Text Search: businesses for a phrase ("restaurants in Koramangala,
 * Bangalore"), 20 per page, up to 3 pages per phrase. Server-side key: GOOGLE_MAPS_API_KEY.
 * Never log the key.
 */

export interface Place {
  placeId: string;
  name: string;
  category: string | null;
  address: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  website: string | null;
  mapsUrl: string | null;
  rating: number | null;
  reviews: number | null;
  businessStatus: string | null;
}

export class PlacesError extends Error {}

const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.websiteUri",
  "places.internationalPhoneNumber",
  "places.nationalPhoneNumber",
  "places.googleMapsUri",
  "places.primaryTypeDisplayName",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "nextPageToken",
].join(",");

type Raw = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  websiteUri?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  googleMapsUri?: string;
  primaryTypeDisplayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
};

export interface PlacesSearch {
  /** One page of businesses for a phrase; `next` continues it (null = no more). */
  search(query: string, pageToken?: string | null): Promise<{ places: Place[]; next: string | null }>;
}

export class GooglePlaces implements PlacesSearch {
  constructor(
    private readonly key: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async search(query: string, pageToken?: string | null): Promise<{ places: Place[]; next: string | null }> {
    const res = await this.fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.key, "x-goog-fieldmask": FIELDS },
      body: JSON.stringify({ textQuery: query, pageSize: 20, languageCode: "en", ...(pageToken ? { pageToken } : {}) }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => null)) as { places?: Raw[]; nextPageToken?: string; error?: { message?: string; status?: string } } | null;
    if (!res.ok) {
      const msg = body?.error?.message ?? `HTTP ${res.status}`;
      if (res.status === 403 || res.status === 401) throw new PlacesError(`Google Maps refused the key (${msg.slice(0, 160)}). Check GOOGLE_MAPS_API_KEY and that Places API (New) is enabled.`);
      if (res.status === 429) throw new PlacesError("Google Maps is limiting requests right now. Try again in a minute.");
      throw new PlacesError(`Google Maps search failed (${msg.slice(0, 160)}).`);
    }
    const places = (body?.places ?? [])
      .filter((p) => p.id && p.displayName?.text && typeof p.location?.latitude === "number" && typeof p.location?.longitude === "number")
      .map(
        (p): Place => ({
          placeId: p.id!,
          name: p.displayName!.text!,
          category: p.primaryTypeDisplayName?.text ?? null,
          address: p.formattedAddress ?? null,
          lat: p.location!.latitude!,
          lng: p.location!.longitude!,
          phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
          website: p.websiteUri ?? null,
          mapsUrl: p.googleMapsUri ?? null,
          rating: p.rating ?? null,
          reviews: p.userRatingCount ?? null,
          businessStatus: p.businessStatus ?? null,
        }),
      );
    return { places, next: body?.nextPageToken ?? null };
  }
}

export function placesFromEnv(env: NodeJS.ProcessEnv = process.env): PlacesSearch | null {
  const key = env.GOOGLE_MAPS_API_KEY?.trim();
  return key ? new GooglePlaces(key) : null;
}
