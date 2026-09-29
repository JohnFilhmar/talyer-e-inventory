/**
 * The catalog listing's query, in the snake_case the page URL uses. The data
 * layer maps it to the backend's own parameter names.
 */
export interface CatalogQuery {
  search?: string;
  category?: string;
  motorcycle_model?: string;
  sort?: string;
  page?: number;
  limit?: number;
}
