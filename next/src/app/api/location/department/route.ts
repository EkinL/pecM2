import { NextResponse } from 'next/server';
import { trackExternalFetch, withApiMetrics } from '../../../observability/metrics';

const normalizeCountryCode = (value: unknown) => {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : '';
};

const normalizeCountryLabel = (value: unknown) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

export const handleLocationLookupPost = async (request: Request, routeLabel: string) =>
  withApiMetrics(routeLabel, 'POST', async () => {
    try {
      const body = await request.json();
      const lat = typeof body?.lat === 'number' ? body.lat : Number(body?.lat);
      const lng = typeof body?.lng === 'number' ? body.lng : Number(body?.lng);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return NextResponse.json({ error: 'Coordonnees invalides.' }, { status: 400 });
      }

      const response = await trackExternalFetch('openstreetmap', 'nominatim_reverse', () =>
        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
            lat,
          )}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`,
          {
            headers: {
              'User-Agent': 'pecm2-1/1.0 (token-pricing)',
            },
          },
        ),
      );

      if (!response.ok) {
        return NextResponse.json({ error: 'Geocodage indisponible.' }, { status: 502 });
      }

      const data = await response.json();
      const countryCode = normalizeCountryCode(data?.address?.country_code);
      const countryLabel = normalizeCountryLabel(data?.address?.country);

      if (!countryCode || !countryLabel) {
        return NextResponse.json({ error: 'Pays non detecte.' }, { status: 404 });
      }

      return NextResponse.json({
        countryCode,
        countryLabel: `${countryLabel} (${countryCode})`,
      });
    } catch (error) {
      console.error('Erreur reverse geocoding', error);
      return NextResponse.json({ error: 'Erreur geocodage.' }, { status: 500 });
    }
  });

export async function POST(request: Request) {
  return handleLocationLookupPost(request, '/api/location/department');
}
