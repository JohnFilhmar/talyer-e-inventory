'use client';

import React, { useState } from 'react';
import Link from 'next/link';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  category: string;
  inStock: boolean;
}

interface Service {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  price?: string;
}

interface SaleItem {
  id: string;
  title: string;
  description: string;
  discount: string;
  image: string;
  validUntil: string;
}

interface Event {
  id: string;
  title: string;
  date: string;
  description: string;
  image: string;
}

// ============================================================================
// SAMPLE DATA (Replace with actual API data)
// ============================================================================

const SAMPLE_PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Premium Brake Pads Set',
    price: 89.99,
    originalPrice: 119.99,
    image: '/images/products/brake-pads.jpg',
    category: 'Brakes',
    inStock: true,
  },
  {
    id: '2',
    name: 'Synthetic Motor Oil 5W-30',
    price: 45.99,
    image: '/images/products/motor-oil.jpg',
    category: 'Oils & Fluids',
    inStock: true,
  },
  {
    id: '3',
    name: 'High-Performance Air Filter',
    price: 34.99,
    originalPrice: 44.99,
    image: '/images/products/air-filter.jpg',
    category: 'Filters',
    inStock: true,
  },
  {
    id: '4',
    name: 'LED Headlight Bulbs (Pair)',
    price: 79.99,
    image: '/images/products/headlights.jpg',
    category: 'Lighting',
    inStock: false,
  },
  {
    id: '5',
    name: 'Spark Plugs Set (4pc)',
    price: 28.99,
    image: '/images/products/spark-plugs.jpg',
    category: 'Engine',
    inStock: true,
  },
  {
    id: '6',
    name: 'Car Battery 12V 60Ah',
    price: 149.99,
    originalPrice: 179.99,
    image: '/images/products/battery.jpg',
    category: 'Electrical',
    inStock: true,
  },
];

const SAMPLE_SERVICES: Service[] = [
  {
    id: '1',
    name: 'Oil Change',
    description: 'Full synthetic oil change with filter replacement and multi-point inspection.',
    price: 'From $49.99',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
  },
  {
    id: '2',
    name: 'Brake Service',
    description: 'Complete brake inspection, pad replacement, and rotor resurfacing.',
    price: 'From $99.99',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: '3',
    name: 'Engine Diagnostics',
    description: 'Advanced computer diagnostics to identify and troubleshoot engine issues.',
    price: 'From $79.99',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
    ),
  },
  {
    id: '4',
    name: 'Tire Services',
    description: 'Tire rotation, balancing, alignment, and new tire installation.',
    price: 'From $29.99',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
  },
  {
    id: '5',
    name: 'AC Service',
    description: 'Air conditioning inspection, recharge, and repair services.',
    price: 'From $89.99',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: '6',
    name: 'Full Inspection',
    description: 'Comprehensive vehicle inspection covering all major systems.',
    price: 'From $59.99',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
];

const SAMPLE_SALES: SaleItem[] = [
  {
    id: '1',
    title: 'Summer Brake Sale',
    description: 'Get up to 30% off on all brake components. Keep your vehicle safe this summer!',
    discount: '30% OFF',
    image: '/images/sales/brake-sale.jpg',
    validUntil: '2026-02-28',
  },
  {
    id: '2',
    title: 'Oil Change Special',
    description: 'Full synthetic oil change at an unbeatable price. Includes free inspection!',
    discount: '$39.99',
    image: '/images/sales/oil-change.jpg',
    validUntil: '2026-02-15',
  },
];

const SAMPLE_EVENTS: Event[] = [
  {
    id: '1',
    title: 'Car Care Workshop',
    date: '2026-02-15',
    description: 'Learn basic car maintenance tips from our expert mechanics. Free admission!',
    image: '/images/events/workshop.jpg',
  },
  {
    id: '2',
    title: 'Grand Opening Anniversary',
    date: '2026-03-01',
    description: 'Join us for our anniversary celebration with special discounts and giveaways!',
    image: '/images/events/anniversary.jpg',
  },
];

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '#products', label: 'Products' },
  { href: '#services', label: 'Services' },
  { href: '#sales', label: 'Sales' },
  { href: '#about', label: 'About' },
  { href: '#contact', label: 'Contact' },
];

// ============================================================================
// COMPONENTS
// ============================================================================

/**
 * Navigation Bar Component
 */
const Navbar: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="bg-black text-white sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-yellow-400 rounded-lg flex items-center justify-center">
              <span className="text-black font-bold text-xl">T</span>
            </div>
            <div className="hidden sm:block">
              <span className="text-xl font-bold text-yellow-400">E-Talyer</span>
              <span className="text-xs block text-gray-400">Joemar Motor Parts & Services</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="px-4 py-2 text-sm font-medium hover:text-yellow-400 hover:bg-gray-800 rounded-md transition-colors"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/login"
              className="ml-4 px-4 py-2 bg-yellow-400 text-black font-medium rounded-md hover:bg-yellow-500 transition-colors"
            >
              Sign In
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-md hover:bg-gray-800"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-800">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="block px-4 py-3 text-sm font-medium hover:text-yellow-400 hover:bg-gray-800 rounded-md"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/login"
              className="block mx-4 mt-4 px-4 py-3 bg-yellow-400 text-black font-medium rounded-md text-center hover:bg-yellow-500"
              onClick={() => setMobileMenuOpen(false)}
            >
              Sign In
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
};

/**
 * Hero Section Component
 */
const HeroSection: React.FC = () => (
  <section className="relative bg-black text-white overflow-hidden">
    {/* Background Pattern */}
    <div className="absolute inset-0 opacity-10">
      <div className="absolute inset-0" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23FBBF24' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }} />
    </div>
    
    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        <div className="text-center lg:text-left">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
            Quality <span className="text-yellow-400">Motor Parts</span> & Expert{' '}
            <span className="text-yellow-400">Services</span>
          </h1>
          <p className="mt-6 text-lg text-gray-300 max-w-xl mx-auto lg:mx-0">
            Your one-stop destination for premium automotive parts and professional mechanic services. 
            Keep your vehicle running at its best with E-Talyer.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
            <a
              href="#products"
              className="px-8 py-4 bg-yellow-400 text-black font-semibold rounded-lg hover:bg-yellow-500 transition-colors text-center"
            >
              Shop Parts
            </a>
            <a
              href="#services"
              className="px-8 py-4 border-2 border-yellow-400 text-yellow-400 font-semibold rounded-lg hover:bg-yellow-400 hover:text-black transition-colors text-center"
            >
              Book Service
            </a>
          </div>
          
          {/* Stats */}
          <div className="mt-12 grid grid-cols-3 gap-8">
            <div>
              <div className="text-3xl font-bold text-yellow-400">10K+</div>
              <div className="text-sm text-gray-400">Products</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-yellow-400">5K+</div>
              <div className="text-sm text-gray-400">Happy Customers</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-yellow-400">15+</div>
              <div className="text-sm text-gray-400">Years Experience</div>
            </div>
          </div>
        </div>
        
        {/* Hero Image Placeholder */}
        <div className="relative hidden lg:block">
          <div className="relative w-full h-96 bg-linear-to-br from-yellow-400/20 to-yellow-600/20 rounded-2xl flex items-center justify-center border border-yellow-400/30">
            <svg className="w-32 h-32 text-yellow-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <div className="absolute bottom-4 text-center text-yellow-400/70 text-sm">
              Hero Image Placeholder
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

/**
 * Empty State Component
 */
const EmptyState: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="text-center py-12 px-4 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
    <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
    <h3 className="mt-4 text-lg font-semibold text-gray-700">{title}</h3>
    <p className="mt-2 text-gray-500">{description}</p>
  </div>
);

/**
 * Product Card Component
 */
const ProductCard: React.FC<{ product: Product }> = ({ product }) => (
  <div className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-shadow border border-gray-100 group">
    {/* Image */}
    <div className="relative h-48 bg-gray-100 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-br from-gray-100 to-gray-200 flex items-center justify-center">
        <svg className="w-16 h-16 text-gray-300 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      {product.originalPrice && (
        <span className="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
          SALE
        </span>
      )}
      {!product.inStock && (
        <span className="absolute top-3 right-3 bg-gray-800 text-white text-xs font-bold px-2 py-1 rounded">
          OUT OF STOCK
        </span>
      )}
    </div>
    
    {/* Content */}
    <div className="p-4">
      <span className="text-xs font-medium text-yellow-600 uppercase tracking-wide">{product.category}</span>
      <h3 className="mt-1 text-lg font-semibold text-black line-clamp-2">{product.name}</h3>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xl font-bold text-black">${product.price.toFixed(2)}</span>
        {product.originalPrice && (
          <span className="text-sm text-gray-400 line-through">${product.originalPrice.toFixed(2)}</span>
        )}
      </div>
      <button
        disabled={!product.inStock}
        className={`mt-4 w-full py-2 rounded-lg font-medium transition-colors ${
          product.inStock
            ? 'bg-yellow-400 text-black hover:bg-yellow-500'
            : 'bg-gray-200 text-gray-500 cursor-not-allowed'
        }`}
      >
        {product.inStock ? 'Add to Cart' : 'Out of Stock'}
      </button>
    </div>
  </div>
);

/**
 * Featured Products Section
 */
const FeaturedProductsSection: React.FC<{ products: Product[] }> = ({ products }) => (
  <section id="products" className="py-16 lg:py-24 bg-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <h2 className="text-3xl lg:text-4xl font-bold text-black">
          Featured <span className="text-yellow-500">Products</span>
        </h2>
        <p className="mt-4 text-gray-600 max-w-2xl mx-auto">
          Browse our selection of quality motor parts from trusted brands. 
          Everything you need to keep your vehicle in top condition.
        </p>
      </div>
      
      {products.length > 0 ? (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link
              href="/products"
              className="inline-flex items-center px-6 py-3 border-2 border-black text-black font-semibold rounded-lg hover:bg-black hover:text-white transition-colors"
            >
              View All Products
              <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </>
      ) : (
        <EmptyState
          title="No Featured Products Yet"
          description="We're updating our inventory. Check back soon for amazing deals on quality motor parts!"
        />
      )}
    </div>
  </section>
);

/**
 * Services Section
 */
const ServicesSection: React.FC<{ services: Service[] }> = ({ services }) => (
  <section id="services" className="py-16 lg:py-24 bg-gray-50">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <h2 className="text-3xl lg:text-4xl font-bold text-black">
          Our <span className="text-yellow-500">Services</span>
        </h2>
        <p className="mt-4 text-gray-600 max-w-2xl mx-auto">
          Professional automotive services by certified mechanics. 
          We treat every vehicle with the care it deserves.
        </p>
      </div>
      
      {services.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service) => (
            <div
              key={service.id}
              className="bg-white rounded-xl p-6 shadow-md hover:shadow-xl transition-all border border-gray-100 group hover:-translate-y-1"
            >
              <div className="w-14 h-14 bg-yellow-100 rounded-xl flex items-center justify-center text-yellow-600 group-hover:bg-yellow-400 group-hover:text-black transition-colors">
                {service.icon}
              </div>
              <h3 className="mt-4 text-xl font-semibold text-black">{service.name}</h3>
              <p className="mt-2 text-gray-600 text-sm">{service.description}</p>
              {service.price && (
                <p className="mt-4 text-yellow-600 font-semibold">{service.price}</p>
              )}
              <button className="mt-4 text-sm font-medium text-black hover:text-yellow-600 inline-flex items-center">
                Book Now
                <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Services Coming Soon"
          description="We're preparing our service offerings. Stay tuned for expert automotive services!"
        />
      )}
    </div>
  </section>
);

/**
 * Sales & Promotions Section
 */
const SalesSection: React.FC<{ sales: SaleItem[] }> = ({ sales }) => (
  <section id="sales" className="py-16 lg:py-24 bg-black text-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <span className="inline-block px-4 py-1 bg-red-500 text-white text-sm font-bold rounded-full mb-4">
          HOT DEALS
        </span>
        <h2 className="text-3xl lg:text-4xl font-bold">
          Current <span className="text-yellow-400">Sales</span> & Promotions
        </h2>
        <p className="mt-4 text-gray-400 max-w-2xl mx-auto">
          Do not miss out on these limited-time offers. Save big on quality parts and services!
        </p>
      </div>
      
      {sales.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-8">
          {sales.map((sale) => (
            <div
              key={sale.id}
              className="relative bg-linear-to-br from-gray-800 to-gray-900 rounded-2xl overflow-hidden group"
            >
              <div className="absolute top-4 right-4 bg-red-500 text-white font-bold px-4 py-2 rounded-lg text-lg">
                {sale.discount}
              </div>
              <div className="p-8">
                <div className="w-full h-40 bg-linear-to-br from-yellow-400/20 to-yellow-600/10 rounded-xl flex items-center justify-center mb-6">
                  <svg className="w-20 h-20 text-yellow-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-white">{sale.title}</h3>
                <p className="mt-2 text-gray-400">{sale.description}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Valid until: {new Date(sale.validUntil).toLocaleDateString()}
                  </span>
                  <button className="px-4 py-2 bg-yellow-400 text-black font-semibold rounded-lg hover:bg-yellow-500 transition-colors">
                    Shop Now
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 px-4 bg-gray-800/50 rounded-xl border-2 border-dashed border-gray-700">
          <svg className="w-16 h-16 mx-auto text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-gray-300">No Active Promotions</h3>
          <p className="mt-2 text-gray-500">Check back soon for exciting deals and discounts!</p>
        </div>
      )}
    </div>
  </section>
);

/**
 * Events Section
 */
const EventsSection: React.FC<{ events: Event[] }> = ({ events }) => (
  <section id="events" className="py-16 lg:py-24 bg-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <h2 className="text-3xl lg:text-4xl font-bold text-black">
          Upcoming <span className="text-yellow-500">Events</span>
        </h2>
        <p className="mt-4 text-gray-600 max-w-2xl mx-auto">
          Join us for workshops, celebrations, and community events. 
          Learn, connect, and save!
        </p>
      </div>
      
      {events.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-8">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex flex-col md:flex-row bg-gray-50 rounded-2xl overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className="md:w-1/3 h-48 md:h-auto bg-linear-to-br from-yellow-400/20 to-yellow-600/20 flex items-center justify-center">
                <svg className="w-16 h-16 text-yellow-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="p-6 flex-1">
                <div className="inline-flex items-center px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium mb-3">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {new Date(event.date).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </div>
                <h3 className="text-xl font-bold text-black">{event.title}</h3>
                <p className="mt-2 text-gray-600">{event.description}</p>
                <button className="mt-4 text-yellow-600 font-semibold hover:text-yellow-700 inline-flex items-center">
                  Learn More
                  <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No Upcoming Events"
          description="We're planning some exciting events. Subscribe to our newsletter to stay informed!"
        />
      )}
    </div>
  </section>
);

/**
 * About Section
 */
const AboutSection: React.FC = () => (
  <section id="about" className="py-16 lg:py-24 bg-gray-50">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <h2 className="text-3xl lg:text-4xl font-bold text-black">
            About <span className="text-yellow-500">E-Talyer</span>
          </h2>
          <p className="mt-6 text-gray-600 leading-relaxed">
            For over 15 years, E-Talyer has been the trusted name in automotive parts and services. 
            What started as a small family-owned shop has grown into a comprehensive automotive center, 
            serving thousands of satisfied customers.
          </p>
          <p className="mt-4 text-gray-600 leading-relaxed">
            We pride ourselves on offering quality parts from trusted brands, competitive prices, 
            and expert service from certified mechanics who treat every vehicle as their own.
          </p>
          
          <div className="mt-8 grid grid-cols-2 gap-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-yellow-400 rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h4 className="font-semibold text-black">Quality Guaranteed</h4>
                <p className="text-sm text-gray-500">Premium parts from trusted brands</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-yellow-400 rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h4 className="font-semibold text-black">Fast Service</h4>
                <p className="text-sm text-gray-500">Quick turnaround times</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-yellow-400 rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <h4 className="font-semibold text-black">Expert Team</h4>
                <p className="text-sm text-gray-500">Certified mechanics</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-yellow-400 rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h4 className="font-semibold text-black">Fair Prices</h4>
                <p className="text-sm text-gray-500">Competitive & transparent</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Image Placeholder */}
        <div className="relative">
          <div className="w-full h-96 bg-linear-to-br from-gray-200 to-gray-300 rounded-2xl flex items-center justify-center">
            <svg className="w-24 h-24 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div className="absolute -bottom-6 -right-6 bg-yellow-400 text-black p-6 rounded-xl shadow-xl">
            <div className="text-3xl font-bold">15+</div>
            <div className="text-sm">Years of Service</div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

/**
 * Contact Section
 */
const ContactSection: React.FC = () => (
  <section id="contact" className="py-16 lg:py-24 bg-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <h2 className="text-3xl lg:text-4xl font-bold text-black">
          Get in <span className="text-yellow-500">Touch</span>
        </h2>
        <p className="mt-4 text-gray-600 max-w-2xl mx-auto">
          Have questions? Need a quote? We are here to help. 
          Reach out through any of these channels.
        </p>
      </div>
      
      <div className="grid lg:grid-cols-2 gap-12">
        {/* Contact Info */}
        <div className="space-y-6">
          <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
            <div className="w-12 h-12 bg-yellow-400 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold text-black">Visit Us</h4>
              <p className="text-gray-600">123 Auto Street, Motor City</p>
              <p className="text-gray-600">State, Country 12345</p>
            </div>
          </div>
          
          <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
            <div className="w-12 h-12 bg-yellow-400 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold text-black">Call Us</h4>
              <p className="text-gray-600">+1 (555) 123-4567</p>
              <p className="text-gray-600">Mon-Sat: 8am - 6pm</p>
            </div>
          </div>
          
          <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
            <div className="w-12 h-12 bg-yellow-400 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold text-black">Email Us</h4>
              <p className="text-gray-600">info@E-Talyer.com</p>
              <p className="text-gray-600">support@E-Talyer.com</p>
            </div>
          </div>
          
          {/* Social Links */}
          <div className="flex gap-4 pt-4">
            <a href="#" className="w-10 h-10 bg-black text-white rounded-lg flex items-center justify-center hover:bg-yellow-400 hover:text-black transition-colors">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            </a>
            <a href="#" className="w-10 h-10 bg-black text-white rounded-lg flex items-center justify-center hover:bg-yellow-400 hover:text-black transition-colors">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
            </a>
            <a href="#" className="w-10 h-10 bg-black text-white rounded-lg flex items-center justify-center hover:bg-yellow-400 hover:text-black transition-colors">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
            </a>
          </div>
        </div>
        
        {/* Map Placeholder */}
        <div className="relative h-96 bg-gray-200 rounded-2xl overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <p className="mt-4 text-gray-500">Map Placeholder</p>
            <p className="text-sm text-gray-400">Replace with Google Maps embed</p>
          </div>
        </div>
      </div>
    </div>
  </section>
);

/**
 * Newsletter Section
 */
const NewsletterSection: React.FC = () => (
  <section className="py-16 bg-yellow-400">
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
      <h2 className="text-2xl lg:text-3xl font-bold text-black">
        Subscribe to Our Newsletter
      </h2>
      <p className="mt-2 text-black/70">
        Get the latest deals, news, and automotive tips delivered to your inbox.
      </p>
      <form className="mt-6 flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
        <input
          type="email"
          placeholder="Enter your email"
          className="flex-1 px-4 py-3 rounded-lg border-2 border-black/20 focus:border-black focus:outline-none"
        />
        <button
          type="submit"
          className="px-6 py-3 bg-black text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors"
        >
          Subscribe
        </button>
      </form>
    </div>
  </section>
);

/**
 * Footer Component
 */
const Footer: React.FC = () => (
  <footer className="bg-black text-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {/* Brand */}
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-yellow-400 rounded-lg flex items-center justify-center">
              <span className="text-black font-bold text-xl">T</span>
            </div>
            <div>
              <span className="text-xl font-bold text-yellow-400">E-Talyer</span>
            </div>
          </div>
          <p className="mt-4 text-gray-400 text-sm">
            Your trusted partner for quality motor parts and expert automotive services since 2010.
          </p>
        </div>
        
        {/* Quick Links */}
        <div>
          <h4 className="font-semibold text-yellow-400 mb-4">Quick Links</h4>
          <ul className="space-y-2">
            <li><a href="#products" className="text-gray-400 hover:text-white text-sm">Products</a></li>
            <li><a href="#services" className="text-gray-400 hover:text-white text-sm">Services</a></li>
            <li><a href="#sales" className="text-gray-400 hover:text-white text-sm">Sales & Offers</a></li>
            <li><a href="#about" className="text-gray-400 hover:text-white text-sm">About Us</a></li>
          </ul>
        </div>
        
        {/* Customer Service */}
        <div>
          <h4 className="font-semibold text-yellow-400 mb-4">Customer Service</h4>
          <ul className="space-y-2">
            <li><a href="#contact" className="text-gray-400 hover:text-white text-sm">Contact Us</a></li>
            <li><a href="#" className="text-gray-400 hover:text-white text-sm">FAQs</a></li>
            <li><a href="#" className="text-gray-400 hover:text-white text-sm">Shipping Info</a></li>
            <li><a href="#" className="text-gray-400 hover:text-white text-sm">Returns Policy</a></li>
          </ul>
        </div>
        
        {/* Business Hours */}
        <div>
          <h4 className="font-semibold text-yellow-400 mb-4">Business Hours</h4>
          <ul className="space-y-2 text-sm text-gray-400">
            <li className="flex justify-between">
              <span>Mon - Fri:</span>
              <span>8:00 AM - 6:00 PM</span>
            </li>
            <li className="flex justify-between">
              <span>Saturday:</span>
              <span>9:00 AM - 4:00 PM</span>
            </li>
            <li className="flex justify-between">
              <span>Sunday:</span>
              <span>Closed</span>
            </li>
          </ul>
        </div>
      </div>
      
      {/* Bottom */}
      <div className="mt-12 pt-8 border-t border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-4">
        <p className="text-gray-400 text-sm">
          © {new Date().getFullYear()} E-Talyer. All rights reserved.
        </p>
        <div className="flex gap-6 text-sm">
          <a href="#" className="text-gray-400 hover:text-white">Privacy Policy</a>
          <a href="#" className="text-gray-400 hover:text-white">Terms of Service</a>
        </div>
      </div>
    </div>
  </footer>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function LandingPage() {
  // In a real app, these would come from API calls or props
  // Set to empty arrays to test fallback states
  const [products] = useState<Product[]>(SAMPLE_PRODUCTS);
  const [services] = useState<Service[]>(SAMPLE_SERVICES);
  const [sales] = useState<SaleItem[]>(SAMPLE_SALES);
  const [events] = useState<Event[]>(SAMPLE_EVENTS);

  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <FeaturedProductsSection products={products} />
      <ServicesSection services={services} />
      <SalesSection sales={sales} />
      <EventsSection events={events} />
      <AboutSection />
      <ContactSection />
      <NewsletterSection />
      <Footer />
    </div>
  );
}

export default LandingPage;