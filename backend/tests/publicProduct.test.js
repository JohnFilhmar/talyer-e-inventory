import { toPublicProduct, publicStockStatus } from '../src/utils/publicProduct.js';

describe('toPublicProduct', () => {
  const doc = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Brake Pad',
    description: 'Front pad',
    brand: 'Yamaha',
    productModel: 'BP-1',
    costPrice: 100,
    profitMargin: 50,
    sellingPrice: 150,
    sku: 'PROD-000001',
    specifications: { material: 'ceramic' },
    category: { _id: '507f1f77bcf86cd799439012', name: 'Brakes', code: 'BRK', color: '#000' },
    motorcycleModels: [
      { _id: '507f1f77bcf86cd799439013', make: 'Honda', model: 'Click 125i', yearFrom: 2018, yearTo: 2023, code: 'X' },
    ],
    images: [
      { url: 'http://x/a.jpg', isPrimary: false, _id: 'i1' },
      { url: 'http://x/b.jpg', isPrimary: true, _id: 'i2' },
    ],
  };

  it('keeps only the allow-listed fields', () => {
    expect(Object.keys(toPublicProduct(doc)).sort()).toEqual([
      '_id', 'brand', 'category', 'description', 'images', 'motorcycleModels',
      'name', 'primaryImage', 'productModel', 'sellingPrice',
    ]);
  });

  it('strips nested fields that are not listed', () => {
    const out = toPublicProduct(doc);
    expect(out.category).toEqual({ _id: '507f1f77bcf86cd799439012', name: 'Brakes' });
    expect(out.motorcycleModels[0]).toEqual({
      _id: '507f1f77bcf86cd799439013', make: 'Honda', model: 'Click 125i', yearFrom: 2018, yearTo: 2023,
    });
    expect(out.images).toEqual([
      { url: 'http://x/a.jpg', isPrimary: false },
      { url: 'http://x/b.jpg', isPrimary: true },
    ]);
  });

  it('picks the primary image, else the first, else null', () => {
    expect(toPublicProduct(doc).primaryImage).toBe('http://x/b.jpg');
    expect(toPublicProduct({ ...doc, images: [{ url: 'http://x/a.jpg' }] }).primaryImage).toBe('http://x/a.jpg');
    expect(toPublicProduct({ ...doc, images: [] }).primaryImage).toBeNull();
  });

  it('fills absent optional text with empty strings and an unpopulated category with null', () => {
    const out = toPublicProduct({ _id: 'a', name: 'X', sellingPrice: 1, category: '507f1f77bcf86cd799439012' });
    expect(out).toMatchObject({
      description: '', brand: '', productModel: '', category: null,
      motorcycleModels: [], images: [], primaryImage: null,
    });
  });
});

describe('publicStockStatus', () => {
  it('reads available stock, not raw quantity', () => {
    expect(publicStockStatus({ quantity: 5, reservedQuantity: 5, reorderPoint: 2 })).toBe('out-of-stock');
    expect(publicStockStatus({ quantity: 5, reservedQuantity: 3, reorderPoint: 2 })).toBe('low-stock');
    expect(publicStockStatus({ quantity: 10, reservedQuantity: 0, reorderPoint: 2 })).toBe('in-stock');
    expect(publicStockStatus({ quantity: 0, reservedQuantity: 0, reorderPoint: 0 })).toBe('out-of-stock');
  });
});
