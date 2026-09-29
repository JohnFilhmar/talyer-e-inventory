import LandingPage from './landing-page';
import { getPublicProducts } from '@/lib/public/catalogApi';
import type { PublicProduct } from '@/utils/validators/publicCatalog';

// Regenerated at most once a minute. Set explicitly because a build-time fetch
// that fails must not freeze the page as static with no products.
export const revalidate = 60;

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
