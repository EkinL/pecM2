import { handleLocationLookupPost } from '../department/route';

export async function POST(request: Request) {
  return handleLocationLookupPost(request, '/api/location/country');
}
