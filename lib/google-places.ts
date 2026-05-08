export interface GooglePlace {
  place_id: string
  name: string
  address: string
  website: string | null
  phone: string | null
  rating: number | null
  reviews: number | null
}

/**
 * Search businesses via Google Places API (New) Text Search.
 * Handles pagination transparently up to maxResults.
 */
export async function searchGooglePlaces(
  query: string,
  apiKey: string,
  maxResults = 20,
): Promise<GooglePlace[]> {
  const places: GooglePlace[] = []
  let pageToken: string | undefined

  do {
    const body: Record<string, unknown> = {
      textQuery: query,
      languageCode: 'fr',
      maxResultCount: Math.min(20, maxResults - places.length),
    }
    if (pageToken) body.pageToken = pageToken

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.websiteUri',
          'places.nationalPhoneNumber',
          'places.rating',
          'places.userRatingCount',
          'nextPageToken',
        ].join(','),
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error((err as any).error?.message ?? `Google Places API error ${res.status}`)
    }

    const data = await res.json()

    for (const p of (data.places ?? []) as any[]) {
      places.push({
        place_id: p.id ?? '',
        name: p.displayName?.text ?? '',
        address: p.formattedAddress ?? '',
        website: p.websiteUri ?? null,
        phone: p.nationalPhoneNumber ?? null,
        rating: typeof p.rating === 'number' ? p.rating : null,
        reviews: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
      })
    }

    pageToken = data.nextPageToken

    // Google requires a short delay between paginated requests
    if (pageToken && places.length < maxResults) {
      await new Promise((r) => setTimeout(r, 2000))
    }
  } while (pageToken && places.length < maxResults)

  return places.slice(0, maxResults)
}
