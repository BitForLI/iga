import React, { useEffect, useRef, useState } from 'react';
import { message } from 'antd';
import { productAPI } from '../api';
import { API_BASE } from '../config/apiEnv';
import { useCart } from '../context/CartContext';
import home1 from '../assets/images/主页.png';
import home2 from '../assets/images/主页2.png';
import home3 from '../assets/images/主页3.png';
import productImage from '../assets/images/main.png';
import { resolveProductImageUrl } from '../utils/imageUrl';
import addCartIcon from '../assets/images/添加购物车.png';
import plusIcon from '../assets/images/加.png';
import minusIcon from '../assets/images/减.png';

interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
  unit: string;
  stockQuantity: number;
  imageUrl?: string;
  isActive?: boolean;
  wasPrice?: number;
  discountLabel?: string; // "Special" | "30% Off" etc.
  weightG?: number; // for per 100g price
}

/** 从 unit 推断克重：kg 按「每千克」价展示每 100g；如 "175g" 则解析克数 */
function deriveWeightGForPer100g(unit: string): number | undefined {
  const u = unit.trim().toLowerCase();
  if (u === 'kg') return 1000;
  const m = u.match(/^([\d.]+)\s*g$/i);
  if (m) return parseFloat(m[1]);
  return undefined;
}

/** 首页 Special 横条：真实库中上架、有库存的前 5 个（名称排序，稳定） */
function pickSpecialStripProducts(list: Product[]): Product[] {
  const eligible = list.filter((p) => p.isActive !== false && p.stockQuantity > 0);
  return [...eligible]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .slice(0, 5)
    .map((p) => ({
      ...p,
      discountLabel: 'Special',
      weightG: deriveWeightGForPer100g(p.unit),
    }));
}

interface HomePageProps {
  selectedCategory: string;
  searchKeyword: string;
}

export function HomePage({ selectedCategory, searchKeyword }: HomePageProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [specialProducts, setSpecialProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const toastOnceRef = useRef(false);
  const { addItem } = useCart();

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setFetchError(null);
        const res = await productAPI.list();
        const raw = Array.isArray(res) ? res : [];
        const list = raw.map((p: Record<string, unknown>) => ({
          id: (p.id ?? p.Id) as number,
          name: (p.name ?? p.Name) as string,
          price: Number(p.price ?? p.Price ?? 0),
          category: (p.category ?? p.Category ?? '') as string,
          unit: (p.unit ?? p.Unit ?? '') as string,
          stockQuantity: Number(p.stockQuantity ?? p.StockQuantity ?? 0),
          imageUrl: (p.imageUrl ?? p.ImageUrl ?? '') as string | undefined,
          isActive: (p.isActive ?? p.IsActive ?? true) as boolean,
        }));
        setProducts(list);
        setSpecialProducts(list.length > 0 ? pickSpecialStripProducts(list) : []);
      } catch (e) {
        const msg = (e as Error)?.message ?? '加载商品失败';
        setFetchError(msg);
        setProducts([]);
        setSpecialProducts([]);
        if (!toastOnceRef.current) {
          toastOnceRef.current = true;
          message.error(`${msg}（请确认后端 ${API_BASE} 已启动）`);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const filtered = products.filter((p) => {
    const matchCategory = !selectedCategory || p.category === selectedCategory;
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return matchCategory;
    const nameLower = p.name.toLowerCase();
    const categoryLower = p.category.toLowerCase();
    const searchWords = keyword.split(/\s+/).filter(Boolean);
    const matchSearch = searchWords.every(
      (sw) => nameLower.includes(sw) || categoryLower.includes(sw)
    );
    return matchCategory && matchSearch;
  });

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>;
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      {fetchError && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 14px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#991b1b',
            fontSize: 14,
          }}
        >
          无法从服务器加载商品：{fetchError}
        </div>
      )}
      {/* 轮换图 - 仅在未选择分类时显示 */}
      {!selectedCategory && (
        <HomeCarousel images={[home1, home2, home3]} />
      )}

      {/* Special 横条：数据库真实商品（上架、有库存，名称排序取前 5） */}
      {!selectedCategory && specialProducts.length > 0 && (
        <div style={{ marginBottom: '2.5rem' }}>
          <SpecialProductList
            products={specialProducts}
            onAddCart={addItem}
            productImage={productImage}
          />
        </div>
      )}

      {/* 商品网格 - 点击分类或输入搜索关键词时展示 */}
      {(selectedCategory || searchKeyword.trim()) && (
        <div id="search-results" style={{ scrollMarginTop: '1rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '1.5rem',
              marginTop: '0.5rem',
            }}
          >
            {filtered.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddCart={addItem}
                productImage={productImage}
                addCartIcon={addCartIcon}
                plusIcon={plusIcon}
                minusIcon={minusIcon}
              />
            ))}
          </div>
          {filtered.length === 0 && <div style={{ textAlign: 'center', color: '#999' }}>No products</div>}
        </div>
      )}
    </div>
  );
}

function HomeCarousel({ images }: { images: string[] }) {
  const slides = images.map((src, i) => ({ src, alt: `Home ${i + 1}` }));
  const [current, setCurrent] = useState(0);

  return (
    <div style={{ position: 'relative', width: 'calc(100% + 6rem)', marginLeft: '-3rem', marginRight: '-3rem', marginTop: '-3rem', marginBottom: '2rem', borderRadius: 0, overflow: 'hidden' }}>
      <div style={{ minHeight: '400px', backgroundColor: '#4b5563' }}>
        <img src={slides[current].src} alt={slides[current].alt} style={{ width: '100%', height: '400px', objectFit: 'cover' }} />
      </div>
      <button
        onClick={() => setCurrent((c) => (c === 0 ? slides.length - 1 : c - 1))}
        style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.4)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}
      >
        ‹
      </button>
      <button
        onClick={() => setCurrent((c) => (c === slides.length - 1 ? 0 : c + 1))}
        style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.4)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}
      >
        ›
      </button>
    </div>
  );
}

function SpecialProductList({
  products,
  onAddCart,
  productImage,
}: {
  products: Product[];
  onAddCart: (item: any) => void;
  productImage: string;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem' }}>
      {products.map((p) => (
        <SpecialCard key={p.id} product={p} onAddCart={onAddCart} productImage={productImage} />
      ))}
    </div>
  );
}

function SpecialCard({ product, onAddCart, productImage }: { product: Product; onAddCart: (item: any) => void; productImage: string }) {
  const per100g = product.weightG ? `$${(product.price / (product.weightG / 100)).toFixed(2)} per 100g` : '';

  return (
    <div style={{ width: '100%', backgroundColor: 'white', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
      {product.discountLabel && (
        <div style={{ backgroundColor: '#dc2626', color: 'white', padding: '0.35rem', fontSize: '0.75rem', fontWeight: 'bold', textAlign: 'center' }}>{product.discountLabel}</div>
      )}
      <div style={{ padding: '0.75rem', flex: 1 }}>
        <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.5rem' }}>
          <img src={resolveProductImageUrl(product.imageUrl, productImage)} alt={product.name} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
        </div>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem', lineHeight: 1.2 }}>{product.name}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
          {product.wasPrice != null && (
            <span style={{ backgroundColor: '#fef08a', padding: '0.15rem 0.35rem', borderRadius: '4px', fontSize: '0.75rem', textDecoration: 'line-through' }}>was ${product.wasPrice.toFixed(2)}</span>
          )}
          <span style={{ marginLeft: 'auto', color: '#9ca3af', fontSize: '0.9rem', cursor: 'pointer' }} title="Add to favourites">♡</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>${product.price.toFixed(2)}</span>
          {per100g && <span style={{ fontSize: '0.7rem', color: '#666' }}>{per100g}</span>}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddCart({ productId: product.id, name: product.name, price: product.price, quantity: 1, imageUrl: product.imageUrl || productImage });
          }}
          style={{ width: '100%', padding: '0.5rem', border: '1px solid #dc2626', backgroundColor: 'white', color: '#dc2626', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.875rem' }}
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
}

function ProductCard({
  product,
  onAddCart,
  productImage,
  addCartIcon,
  plusIcon,
  minusIcon,
}: {
  product: Product;
  onAddCart: (item: any) => void;
  productImage: string;
  addCartIcon: string;
  plusIcon: string;
  minusIcon: string;
}) {
  const [quantity, setQuantity] = useState(1);

  const handleAddToCart = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onAddCart({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity,
      imageUrl: product.imageUrl || productImage,
    });
    setQuantity(1);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleAddToCart}
      onKeyDown={(e) => e.key === 'Enter' && handleAddToCart()}
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '1rem',
        backgroundColor: 'white',
        transition: 'all 0.2s',
        cursor: 'pointer',
      }}
      onMouseOver={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
      }}
    >
      {/* 商品图 - 使用 main 模板图片 */}
      <div
        style={{
          width: '100%',
          height: '120px',
          borderRadius: '6px',
          marginBottom: '0.75rem',
          overflow: 'hidden',
        }}
      >
        <img
          src={resolveProductImageUrl(product.imageUrl, productImage)}
          alt={product.name}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </div>

      <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{product.name}</h3>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#dc2626' }}>${product.price}</span>
        <span style={{ fontSize: '0.875rem', color: '#999' }}>/{product.unit}</span>
      </div>

      {/* 数量选择 + 添加购物车 - 同一行，加减与数字贴近 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setQuantity(Math.max(1, quantity - 1)); }}
              style={{
              backgroundColor: 'transparent',
              border: 'none',
              width: '24px',
              height: '24px',
              padding: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img src={minusIcon} alt="Minus" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
          </button>
          <span style={{ minWidth: '24px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.9rem' }}>{quantity}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setQuantity(quantity + 1); }}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              width: '24px',
              height: '24px',
              padding: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img src={plusIcon} alt="Plus" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
          </button>
        </div>
        <button
          type="button"
          onClick={handleAddToCart}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img src={addCartIcon} alt="Add to cart" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
        </button>
      </div>
    </div>
  );
}
