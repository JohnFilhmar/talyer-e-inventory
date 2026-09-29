/**
 * Makes a product image URL loadable: full URLs pass through, and legacy
 * relative `/uploads/...` paths get the backend origin prepended.
 *
 * @param url an image URL as stored on the product
 * @returns a URL the browser or `next/image` can fetch
 */
export const resolveImageUrl = (url: string): string => {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/uploads/')) {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
    return `${backendUrl}${url}`;
  }
  return url;
};
