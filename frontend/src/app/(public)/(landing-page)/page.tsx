import LandingPage from './landing-page';
import { getPublicProducts } from '@/lib/public/catalogApi';
import type { PublicProduct } from '@/utils/validators/publicCatalog';

// Rendered per request, not statically. The image build has no backend to
// reach, so a statically generated page was baked with no products and kept
// serving that until a visit after the first minute triggered a regeneration:
// every deploy opened with an empty products section. The catalog fetch keeps
// its own 60 second data cache, so backend load stays bounded.
export const dynamic = 'force-dynamic';

/** The newest listed products; the landing page hides the section if none load. */
const featuredProducts = async (): Promise<PublicProduct[]> => {
  try {
    return (await getPublicProducts({ sort: 'newest', limit: 8 })).data;
  } catch {
    return [];
  }
};

export default async function Page() {
  return <LandingPage products={await featuredProducts()} />;
}
