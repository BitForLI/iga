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
import { useMaxWidth } from '../hooks/useMediaQuery';
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

/** 名称、分类、单位是否同时包含所有分词（不区分大小写） */
function productMatchesSearchKeyword(p: Product, rawKeyword: string): boolean {
  const keyword = rawKeyword.trim().toLowerCase();
  if (!keyword) return true;
  const nameLower = p.name.toLowerCase();
  const categoryLower = (p.category ?? '').toLowerCase();
  const unitLower = (p.unit ?? '').toLowerCase();
  const words = keyword.split(/\s+/).filter(Boolean);
  return words.every(
    (w) => nameLower.includes(w) || categoryLower.includes(w) || unitLower.includes(w)
  );
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
  const isNarrow = useMaxWidth(768);
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
    const kw = searchKeyword.trim();
    if (!kw) return matchCategory;
    return matchCategory && productMatchesSearchKeyword(p, kw);
  });

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>;
  }

  return (
    <div style={{ padding: isNarrow ? '0.75rem' : '1.5rem', maxWidth: '100%', boxSizing: 'border-box' }}>
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
      {/* 轮换图 - 未选分类且未在搜索时显示 */}
      {!selectedCategory && !searchKeyword.trim() && (
        <HomeCarousel images={[home1, home2, home3]} isNarrow={isNarrow} />
      )}

      {/* Special 横条：未在搜索时显示；搜索时只展示下方匹配结果 */}
      {!selectedCategory && !searchKeyword.trim() && specialProducts.length > 0 && (
        <div style={{ marginBottom: '2.5rem' }}>
          <SpecialProductList
            products={specialProducts}
            onAddCart={addItem}
            productImage={productImage}
            isNarrow={isNarrow}
          />
        </div>
      )}

      {/* 商品网格：选分类或有关键词时展示，仅列出 filtered */}
      {(selectedCategory || searchKeyword.trim()) && (
        <div id="search-results" style={{ scrollMarginTop: '1rem' }}>
          <div
            style={{
              display: 'grid',
              /** 手机：固定 2 列（Coles 式），列变宽而不是变多列挤扁 */
              gridTemplateColumns: isNarrow ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: isNarrow ? '10px' : '1.5rem',
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
                compact={isNarrow}
              />
            ))}
          </div>
          {filtered.length === 0 && <div style={{ textAlign: 'center', color: '#999' }}>No products</div>}
        </div>
      )}
    </div>
  );
}

function HomeCarousel({ images, isNarrow }: { images: string[]; isNarrow: boolean }) {
  const slides = images.map((src, i) => ({ src, alt: `Home ${i + 1}` }));
  const [current, setCurrent] = useState(0);
  const heroH = isNarrow ? 200 : 400;

  return (
    <div
      style={{
        position: 'relative',
        width: isNarrow ? '100%' : 'calc(100% + 6rem)',
        marginLeft: isNarrow ? 0 : '-3rem',
        marginRight: isNarrow ? 0 : '-3rem',
        marginTop: isNarrow ? 0 : '-3rem',
        marginBottom: '2rem',
        borderRadius: 0,
        overflow: 'hidden',
      }}
    >
      <div style={{ minHeight: heroH, backgroundColor: '#4b5563' }}>
        <img src={slides[current].src} alt={slides[current].alt} style={{ width: '100%', height: heroH, objectFit: 'cover' }} />
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
  isNarrow,
}: {
  products: Product[];
  onAddCart: (item: any) => void;
  productImage: string;
  isNarrow: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isNarrow ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: isNarrow ? '10px' : '1rem',
      }}
    >
      {products.map((p) => (
        <SpecialCard
          key={p.id}
          product={p}
          onAddCart={onAddCart}
          productImage={productImage}
          compact={isNarrow}
        />
      ))}
    </div>
  );
}

const titleClampStyle: React.CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  wordBreak: 'break-word',
};

function SpecialCard({
  product,
  onAddCart,
  productImage,
  compact = false,
}: {
  product: Product;
  onAddCart: (item: any) => void;
  productImage: string;
  compact?: boolean;
}) {
  const per100g = product.weightG ? `$${(product.price / (product.weightG / 100)).toFixed(2)} per 100g` : '';

  return (
    <div
      style={{
        width: '100%',
        minWidth: 0,
        backgroundColor: 'white',
        borderRadius: compact ? 6 : 8,
        overflow: 'hidden',
        border: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {product.discountLabel && (
        <div
          style={{
            flexShrink: 0,
            backgroundColor: '#dc2626',
            color: 'white',
            padding: compact ? '0.18rem 0.25rem' : '0.28rem 0.35rem',
            fontSize: compact ? '0.6rem' : '0.72rem',
            fontWeight: 'bold',
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          {product.discountLabel}
        </div>
      )}
      {/* 仅商品图为正方形 */}
      <div
        style={{
          width: '100%',
          aspectRatio: '1',
          backgroundColor: '#f9fafb',
          borderRadius: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src={resolveProductImageUrl(product.imageUrl, productImage)}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
      <div style={{ padding: compact ? '0.35rem' : '0.5rem', display: 'flex', flexDirection: 'column', gap: compact ? '0.25rem' : '0.35rem' }}>
        <h3
          style={{
            ...titleClampStyle,
            fontSize: compact ? '0.68rem' : '0.8rem',
            fontWeight: 'bold',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {product.name}
        </h3>
        {product.wasPrice != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
            <span style={{ backgroundColor: '#fef08a', padding: '0.08rem 0.2rem', borderRadius: '4px', fontSize: '0.6rem', textDecoration: 'line-through' }}>was ${product.wasPrice.toFixed(2)}</span>
            {!compact && (
              <span style={{ marginLeft: 'auto', color: '#9ca3af', fontSize: '0.75rem', cursor: 'pointer' }} title="Add to favourites">♡</span>
            )}
          </div>
        )}
        {/* 价格 + 副价 与 Add to Cart 同一行 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
            <span style={{ fontSize: compact ? '0.9rem' : '1.05rem', fontWeight: 'bold' }}>${product.price.toFixed(2)}</span>
            {per100g && <span style={{ fontSize: compact ? '0.52rem' : '0.6rem', color: '#666', lineHeight: 1.2 }}>{per100g}</span>}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddCart({ productId: product.id, name: product.name, price: product.price, quantity: 1, imageUrl: product.imageUrl || productImage });
            }}
            style={{
              flexShrink: 0,
              padding: compact ? '0.28rem 0.45rem' : '0.35rem 0.55rem',
              border: '1px solid #dc2626',
              backgroundColor: 'white',
              color: '#dc2626',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: compact ? '0.6rem' : '0.72rem',
              lineHeight: 1.2,
            }}
          >
            Add to Cart
          </button>
        </div>
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
  compact = false,
}: {
  product: Product;
  onAddCart: (item: any) => void;
  productImage: string;
  addCartIcon: string;
  plusIcon: string;
  minusIcon: string;
  compact?: boolean;
}) {
  const [quantity, setQuantity] = useState(1);
  const addPx = compact ? 26 : 32;
  const stepPx = compact ? 18 : 20;

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
        width: '100%',
        minWidth: 0,
        border: '1px solid #e5e7eb',
        borderRadius: compact ? '6px' : '8px',
        padding: compact ? '0.4rem' : '0.65rem',
        backgroundColor: 'white',
        transition: 'all 0.2s',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxSizing: 'border-box',
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
      {/* 仅商品图为正方形 */}
      <div
        style={{
          width: '100%',
          aspectRatio: '1',
          borderRadius: '6px',
          overflow: 'hidden',
          backgroundColor: '#f3f4f6',
        }}
      >
        <img
          src={resolveProductImageUrl(product.imageUrl, productImage)}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </div>

      <div style={{ marginTop: compact ? '0.35rem' : '0.5rem', display: 'flex', flexDirection: 'column', gap: compact ? '0.3rem' : '0.4rem' }}>
        <h3
          style={{
            ...titleClampStyle,
            fontSize: compact ? '0.75rem' : '0.95rem',
            fontWeight: 'bold',
            margin: 0,
            lineHeight: 1.25,
          }}
        >
          {product.name}
        </h3>

        {/* 价格 | 数量 | 购物车 同一行 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: compact ? '0.25rem' : '0.4rem',
            width: '100%',
            minWidth: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.15rem', flexShrink: 0 }}>
            <span style={{ fontSize: compact ? '0.95rem' : '1.15rem', fontWeight: 'bold', color: '#dc2626' }}>${product.price}</span>
            <span style={{ fontSize: compact ? '0.62rem' : '0.75rem', color: '#999' }}>/{product.unit}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '0.12rem' : '0.2rem', flexShrink: 0 }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setQuantity(Math.max(1, quantity - 1));
              }}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                width: compact ? 22 : 26,
                height: compact ? 22 : 26,
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img src={minusIcon} alt="Minus" style={{ width: stepPx, height: stepPx, objectFit: 'contain' }} />
            </button>
            <span style={{ minWidth: compact ? 18 : 22, textAlign: 'center', fontWeight: 'bold', fontSize: compact ? '0.78rem' : '0.88rem' }}>{quantity}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setQuantity(quantity + 1);
              }}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                width: compact ? 22 : 26,
                height: compact ? 22 : 26,
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img src={plusIcon} alt="Plus" style={{ width: stepPx, height: stepPx, objectFit: 'contain' }} />
            </button>
            <button
              type="button"
              onClick={handleAddToCart}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                padding: 0,
                marginLeft: compact ? '0.1rem' : '0.2rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img src={addCartIcon} alt="Add to cart" style={{ width: addPx, height: addPx, objectFit: 'contain' }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
