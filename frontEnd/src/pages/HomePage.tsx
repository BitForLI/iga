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
import plusIcon from '../assets/images/加.png';
import minusIcon from '../assets/images/减.png';

interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
  unit: string;
  imageUrl?: string;
  isActive?: boolean;
  wasPrice?: number;
  discountLabel?: string; // "Special" | "30% Off" etc.
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

/** 首页 Special 横条：仅显示后台分类为 Special 的上架商品。 */
function pickSpecialStripProducts(list: Product[]): Product[] {
  const eligible = list.filter((p) => p.isActive !== false && (p.category ?? '').trim().toLowerCase() === 'special');
  return [...eligible]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .slice(0, 5)
    .map((p) => ({
      ...p,
      discountLabel: 'Special',
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
          message.error(`${msg} (${API_BASE})`);
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
            whiteSpace: 'pre-wrap',
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
          <SpecialProductList products={specialProducts} productImage={productImage} isNarrow={isNarrow} />
        </div>
      )}

      {/* 商品网格：选分类或有关键词时展示，仅列出 filtered */}
      {(selectedCategory || searchKeyword.trim()) && (
        <div id="search-results" style={{ scrollMarginTop: '1rem' }}>
          <div
            style={{
              display: 'grid',
              /** 顶对齐：避免同行某一格变高时整行卡片被拉高 */
              alignItems: 'start',
              gridTemplateColumns: isNarrow ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: isNarrow ? '10px' : '1.5rem',
              marginTop: '0.5rem',
            }}
          >
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} productImage={productImage} compact={isNarrow} />
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
  productImage,
  isNarrow,
}: {
  products: Product[];
  productImage: string;
  isNarrow: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        flexWrap: 'wrap',
        alignItems: 'start',
        gap: isNarrow ? '10px' : '1rem',
      }}
    >
      {products.map((p) => (
        <SpecialCard key={p.id} product={p} productImage={productImage} compact={isNarrow} />
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

/** 白底红边「Add to cart」；有货后变为药丸步进器；减到 0 恢复 */
function HomeCartToggle({
  product,
  productImage,
  compact,
}: {
  product: Product;
  productImage: string;
  compact: boolean;
}) {
  const { items, addItem, updateQuantity, removeItem } = useCart();
  const cartQty = items.find((i) => i.productId === product.id)?.quantity ?? 0;
  const stepIconPx = compact ? 14 : 18;
  /** 与加减行同高；红框「Add to cart」与步进器共用此高度 */
  const btnSize = compact ? 28 : 32;

  const base = () => ({
    productId: product.id,
    name: product.name,
    price: product.price,
    imageUrl: product.imageUrl || productImage,
  });

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    addItem({ ...base(), quantity: 1 });
  };

  const handleMinus = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cartQty <= 1) removeItem(product.id);
    else updateQuantity(product.id, cartQty - 1);
  };

  const handlePlus = (e: React.MouseEvent) => {
    e.stopPropagation();
    addItem({ ...base(), quantity: 1 });
  };

  const pillBorder = '1px solid #dc2626';
  /** 与加减按钮同高（border-box），避免 Add↔步进切换时商品卡高度变化 */
  const rowMinH = btnSize;

  if (cartQty === 0) {
    return (
      <div
        style={{
          width: '100%',
          minHeight: rowMinH,
          display: 'flex',
          alignItems: 'center',
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button"
          onClick={handleAdd}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            minHeight: rowMinH,
            boxSizing: 'border-box',
            backgroundColor: '#fff',
            border: pillBorder,
            borderRadius: 9999,
            padding: compact ? '0.04rem 0.45rem' : '0.05rem 0.55rem',
            cursor: 'pointer',
            fontWeight: 700,
            color: '#dc2626',
            fontSize: compact ? '0.7rem' : '0.82rem',
            lineHeight: 1.15,
            opacity: 1,
            whiteSpace: 'nowrap',
          }}
        >
          Add to cart
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        minHeight: rowMinH,
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        columnGap: compact ? '0.28rem' : '0.36rem',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>
        <button
          type="button"
          onClick={handleMinus}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 0,
            width: btnSize,
            height: btnSize,
            boxSizing: 'border-box',
            flexShrink: 0,
          }}
        >
          <img
            src={minusIcon}
            alt=""
            width={stepIconPx}
            height={stepIconPx}
            style={{ width: stepIconPx, height: stepIconPx, objectFit: 'contain', display: 'block' }}
          />
        </button>
      </div>
      <span
        style={{
          minWidth: compact ? 20 : 24,
          textAlign: 'center',
          fontWeight: 700,
          fontSize: compact ? '0.72rem' : '0.8rem',
          color: '#111827',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {cartQty}
      </span>
      <div style={{ display: 'flex', justifyContent: 'flex-start', minWidth: 0 }}>
        <button
          type="button"
          onClick={handlePlus}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 0,
            opacity: 1,
            width: btnSize,
            height: btnSize,
            boxSizing: 'border-box',
            flexShrink: 0,
          }}
        >
          <img
            src={plusIcon}
            alt=""
            width={stepIconPx}
            height={stepIconPx}
            style={{ width: stepIconPx, height: stepIconPx, objectFit: 'contain', display: 'block' }}
          />
        </button>
      </div>
    </div>
  );
}

function SpecialCard({
  product,
  productImage,
  compact = false,
}: {
  product: Product;
  productImage: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        width: compact ? 'calc((100% - 10px) / 2)' : 160,
        flex: compact ? '0 1 calc((100% - 10px) / 2)' : '0 0 160px',
        minWidth: 0,
        alignSelf: 'start',
        backgroundColor: 'white',
        borderRadius: compact ? 6 : 8,
        overflow: 'hidden',
        border: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.2s',
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
        <div
          style={{
            width: '100%',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: compact ? '0.1rem' : '0.14rem',
            marginTop: compact ? '0.12rem' : '0.18rem',
          }}
        >
          <span style={{ fontSize: compact ? '0.9rem' : '1.05rem', fontWeight: 'bold', color: '#dc2626', lineHeight: 1.2 }}>${product.price.toFixed(2)}</span>
          <HomeCartToggle product={product} productImage={productImage} compact={compact} />
        </div>
      </div>
    </div>
  );
}

function ProductCard({
  product,
  productImage,
  compact = false,
}: {
  product: Product;
  productImage: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        width: '100%',
        minWidth: 0,
        alignSelf: 'start',
        border: '1px solid #e5e7eb',
        borderRadius: compact ? '6px' : '8px',
        padding: compact ? '0.4rem' : '0.65rem',
        backgroundColor: 'white',
        transition: 'all 0.2s',
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

      <div style={{ marginTop: compact ? '0.28rem' : '0.4rem', display: 'flex', flexDirection: 'column', gap: compact ? '0.18rem' : '0.24rem' }}>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '0.1rem' : '0.14rem', width: '100%', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.15rem', flexShrink: 0, minWidth: 0, lineHeight: 1.2 }}>
            <span style={{ fontSize: compact ? '0.95rem' : '1.15rem', fontWeight: 'bold', color: '#dc2626' }}>${product.price}</span>
            <span style={{ fontSize: compact ? '0.62rem' : '0.75rem', color: '#999' }}>/{product.unit}</span>
          </div>
          <HomeCartToggle product={product} productImage={productImage} compact={compact} />
        </div>
      </div>
    </div>
  );
}
