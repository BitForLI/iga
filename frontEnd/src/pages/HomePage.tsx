import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { message } from 'antd';
import { productAPI } from '../api';
import { API_BASE } from '../config/apiEnv';
import { useCart } from '../context/CartContext';
import productImage from '../assets/images/main.png';
import { resolveProductImageUrl } from '../utils/imageUrl';
import { useMaxWidth } from '../hooks/useMediaQuery';
import { useStorePublicSettings } from '../context/StorePublicSettingsContext';
import plusIcon from '../assets/images/加.png';
import minusIcon from '../assets/images/减.png';
import { AppstoreOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import vegetableIcon from '../assets/images/vegetable.png';
import fruitIcon from '../assets/images/fruit.png';
import specialCategoryIcon from '../assets/images/Discount-打折-1.png';
import recommendedCategoryIcon from '../assets/images/推荐.png';
import groceryCategoryIcon from '../assets/images/杂货其他-01.png';
import frozenCategoryIcon from '../assets/images/冷冻食品.png';
import drinkCategoryIcon from '../assets/images/饮料.png';
import dairyCategoryIcon from '../assets/images/DairyProducts,乳制品.png';
import meatCategoryIcon from '../assets/images/肉.png';
import bakeryCategoryIcon from '../assets/images/面包.png';
import pantryCategoryIcon from '../assets/images/Pantry.png';

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
  isWeighingRequired?: boolean;
  defaultExpectedWeightKg?: number;
}

const WEIGHT_STEP_KG = 0.25;
const WEIGHT_MIN_KG = 0.05;

/** 首页商品 / Special 共用：水平居中内容区 */
const HOME_CONTENT_MAX = 'min(1400px, 100%)';
const GRID_GAP = 'clamp(6px, 1.8vw, 22px)';
/** 列数随容器宽度变化；min 控制最小列宽，避免过挤 */
const PRODUCT_AND_SPECIAL_GRID =
  'repeat(auto-fit, minmax(min(100%, clamp(104px, 22vw, 280px)), 1fr))';
/** 主行 chip 高度与图标；宽度由 flex 均分，最小占位用测量值 */
const CATEGORY_CHIP_H_PX = 44;
const CATEGORY_ICON_PX = 17;
const CATEGORY_LABEL_FS = 9;
const CATEGORY_GAP = 6;
/** 「More」按钮估算宽度（含与前一 chip 的 gap） */
const CATEGORY_MORE_CONTROL_PX = 102;
const CATEGORY_CHIP_H_PAD_X = 12;
const CATEGORY_CHIP_ICON_TEXT_GAP = 6;

/** 单行展示所需最小宽度（图标 + 间距 + 标签全宽 + 内边距），用于决定主行放几个、其余进 More */
function measureCategoryChipMinWidthPx(label: string): number {
  if (typeof document === 'undefined') {
    return 44 + label.length * 6;
  }
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return 44 + label.length * 6;
  ctx.font = `600 ${CATEGORY_LABEL_FS}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const textW = ctx.measureText(label).width;
  return (
    Math.ceil(
      CATEGORY_ICON_PX +
        CATEGORY_CHIP_ICON_TEXT_GAP +
        textW +
        CATEGORY_CHIP_H_PAD_X
    ) + 4
  );
}

const CART_BTN = 'clamp(26px, 6.5vw, 38px)';
const CART_ICON = 'clamp(13px, 3.2vw, 20px)';
const CART_FS = 'clamp(0.66rem, 1.9vw, 0.88rem)';

function defaultEstKgForProduct(p: Pick<Product, 'defaultExpectedWeightKg'>): number {
  const d = Number(p.defaultExpectedWeightKg ?? 0);
  return Number.isFinite(d) && d > 0 ? Math.round(d * 1000) / 1000 : 1;
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

/** Aligned with admin product categories; empty value = all products */
const HOME_CATEGORIES: { label: string; value: string; icon?: string }[] = [
  { label: 'All Products', value: '' },
  { label: 'Special', value: 'Special', icon: specialCategoryIcon },
  { label: 'Recommended', value: 'Recommended', icon: recommendedCategoryIcon },
  { label: 'Vegetables', value: 'Vegetables', icon: vegetableIcon },
  { label: 'Fruit', value: 'Fruit', icon: fruitIcon },
  { label: 'Grocery', value: 'Grocery', icon: groceryCategoryIcon },
  { label: 'Frozen', value: 'Frozen', icon: frozenCategoryIcon },
  { label: 'Drink', value: 'Drink', icon: drinkCategoryIcon },
  { label: 'Dairy', value: 'Dairy', icon: dairyCategoryIcon },
  { label: 'Meat', value: 'Meat', icon: meatCategoryIcon },
  { label: 'Bakery', value: 'Bakery', icon: bakeryCategoryIcon },
  { label: 'Pantry', value: 'Pantry', icon: pantryCategoryIcon },
];

const HOME_CATEGORY_CHIP_MIN_WIDTHS = HOME_CATEGORIES.map((c) => measureCategoryChipMinWidthPx(c.label));

/** 主行在「均分宽度」下最多能直接展示几个；其余进 More（保证单行、不按字母断行） */
function computeVisibleMainCount(containerWidth: number, total: number, chipMinWidths: number[]): number {
  const g = CATEGORY_GAP;
  const M = CATEGORY_MORE_CONTROL_PX;
  if (containerWidth <= 0 || total <= 0) return 1;

  const maxMinAll = Math.max(...chipMinWidths);
  const wcIfAll = (containerWidth - (total - 1) * g) / total;
  if (wcIfAll >= maxMinAll) return total;

  for (let n = total - 1; n >= 1; n--) {
    const need = Math.max(...chipMinWidths.slice(0, n));
    const wc = (containerWidth - n * g - M) / n;
    if (wc >= need) return n;
  }
  return 1;
}

function CategoryChipButton({
  cat,
  selectedCategory,
  onSelectCategory,
  chipMinWidthPx,
  rowLayout,
}: {
  cat: (typeof HOME_CATEGORIES)[number];
  selectedCategory: string;
  onSelectCategory: (v: string) => void;
  chipMinWidthPx: number;
  rowLayout: 'equal' | 'intrinsic';
}) {
  const isSelected = cat.value === '' ? !selectedCategory : selectedCategory === cat.value;
  return (
    <button
      type="button"
      onClick={() => {
        if (cat.value === '') onSelectCategory('');
        else onSelectCategory(selectedCategory === cat.value ? '' : cat.value);
      }}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: CATEGORY_CHIP_ICON_TEXT_GAP,
        boxSizing: 'border-box',
        width: rowLayout === 'equal' ? '100%' : chipMinWidthPx,
        minWidth: rowLayout === 'equal' ? 0 : chipMinWidthPx,
        height: CATEGORY_CHIP_H_PX,
        padding: '5px 6px',
        borderRadius: 10,
        border: isSelected ? '2px solid #dc2626' : '1px solid #e5e7eb',
        backgroundColor: isSelected ? '#fef2f2' : 'white',
        color: isSelected ? '#dc2626' : '#374151',
        fontWeight: 600,
        fontSize: CATEGORY_LABEL_FS,
        cursor: 'pointer',
        lineHeight: 1.15,
        textAlign: 'left',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        wordBreak: 'normal',
        overflowWrap: 'normal',
      }}
    >
      {cat.icon ? (
        <img
          src={cat.icon}
          alt=""
          style={{
            width: CATEGORY_ICON_PX,
            height: CATEGORY_ICON_PX,
            objectFit: 'contain',
            flexShrink: 0,
          }}
        />
      ) : (
        <AppstoreOutlined
          style={{
            fontSize: CATEGORY_ICON_PX,
            color: isSelected ? '#dc2626' : '#6b7280',
            flexShrink: 0,
          }}
        />
      )}
      <span
        style={{
          minWidth: 0,
          flex: rowLayout === 'equal' ? 1 : '0 1 auto',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          wordBreak: 'normal',
          overflowWrap: 'normal',
        }}
      >
        {cat.label}
      </span>
    </button>
  );
}

function HomeCategoryBar({
  selectedCategory,
  onSelectCategory,
  compact: _compact,
}: {
  selectedCategory: string;
  onSelectCategory: (v: string) => void;
  /** @deprecated 布局已统一为单行 + More；保留 prop 避免调用处改动 */
  compact: boolean;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const total = HOME_CATEGORIES.length;
  const [visibleMain, setVisibleMain] = useState(total);
  const [moreExpanded, setMoreExpanded] = useState(false);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const update = () => {
      const w = el.offsetWidth;
      if (w <= 0) return;
      const n = computeVisibleMainCount(w, total, HOME_CATEGORY_CHIP_MIN_WIDTHS);
      setVisibleMain(Math.max(1, Math.min(n, total)));
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [total]);

  const hidden = React.useMemo(() => HOME_CATEGORIES.slice(visibleMain), [visibleMain]);
  const hasHidden = hidden.length > 0;

  useEffect(() => {
    if (!hasHidden) {
      setMoreExpanded(false);
      return;
    }
    if (hidden.some((c) => c.value === selectedCategory)) setMoreExpanded(true);
  }, [selectedCategory, hasHidden, hidden]);

  const moreFilterActive =
    hasHidden && hidden.some((c) => c.value === selectedCategory);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: HOME_CONTENT_MAX,
        margin: '0 auto 1.5rem',
        padding: 'clamp(0.4rem, 1.2vw, 0.6rem) 0',
        boxSizing: 'border-box',
      }}
    >
      <div
        ref={measureRef}
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
          alignItems: 'stretch',
          gap: CATEGORY_GAP,
          width: '100%',
          minHeight: CATEGORY_CHIP_H_PX + 4,
        }}
      >
        {HOME_CATEGORIES.slice(0, visibleMain).map((cat, idx) => (
          <div
            key={cat.label}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'stretch',
            }}
          >
            <CategoryChipButton
              cat={cat}
              selectedCategory={selectedCategory}
              onSelectCategory={onSelectCategory}
              chipMinWidthPx={HOME_CATEGORY_CHIP_MIN_WIDTHS[idx]!}
              rowLayout="equal"
            />
          </div>
        ))}
        {hasHidden && (
          <button
            type="button"
            onClick={() => setMoreExpanded((e) => !e)}
            aria-expanded={moreExpanded}
            style={{
              flex: '0 0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              height: CATEGORY_CHIP_H_PX,
              padding: '0 10px',
              borderRadius: 10,
              border: moreFilterActive && !moreExpanded ? '2px solid #fca5a5' : '1px solid #e5e7eb',
              background: moreFilterActive && !moreExpanded ? '#fff7ed' : '#fafafa',
              color: '#374151',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {moreExpanded ? <UpOutlined style={{ fontSize: 12 }} /> : <DownOutlined style={{ fontSize: 12 }} />}
            {moreExpanded ? 'Show less' : 'More'}
          </button>
        )}
      </div>

      {hasHidden && moreExpanded && (
        <div
          style={{
            width: '100%',
            marginTop: 10,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'nowrap',
              gap: CATEGORY_GAP,
              maxWidth: '100%',
              overflowX: 'auto',
              overflowY: 'hidden',
              paddingBottom: 4,
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'thin',
            }}
          >
            {hidden.map((cat, idx) => {
              const ord = visibleMain + idx;
              return (
                <div key={cat.label} style={{ flex: '0 0 auto' }}>
                  <CategoryChipButton
                    cat={cat}
                    selectedCategory={selectedCategory}
                    onSelectCategory={onSelectCategory}
                    chipMinWidthPx={HOME_CATEGORY_CHIP_MIN_WIDTHS[ord]!}
                    rowLayout="intrinsic"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** 首页 Special 横条：优先显示后台分类为 Special 的商品；未配置前回退显示前 5 个上架商品，避免整块消失。 */
function pickSpecialStripProducts(list: Product[]): Product[] {
  const active = list.filter((p) => p.isActive !== false);
  const special = active.filter((p) => (p.category ?? '').trim().toLowerCase() === 'special');
  const eligible = special.length > 0 ? special : active;
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
  onSelectCategory: (category: string) => void;
  searchKeyword: string;
}

export function HomePage({ selectedCategory, onSelectCategory, searchKeyword }: HomePageProps) {
  const isNarrow = useMaxWidth(768);
  const { settings: storeSettings } = useStorePublicSettings();
  const heroSlideUrls = React.useMemo(() => {
    const raw = storeSettings?.homeCarouselImageUrls?.filter((u) => u?.trim()) ?? [];
    return raw
      .map((u) => resolveProductImageUrl(u.trim(), ''))
      .filter((src): src is string => Boolean(src));
  }, [storeSettings?.homeCarouselImageUrls]);
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
          isWeighingRequired: Boolean(p.isWeighingRequired ?? p.IsWeighingRequired),
          defaultExpectedWeightKg:
            p.defaultExpectedWeightKg != null || p.DefaultExpectedWeightKg != null
              ? Number(p.defaultExpectedWeightKg ?? p.DefaultExpectedWeightKg ?? 0)
              : undefined,
        }));
        setProducts(list);
        setSpecialProducts(list.length > 0 ? pickSpecialStripProducts(list) : []);
      } catch (e) {
        const msg = (e as Error)?.message ?? 'Failed to load products';
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
    <div style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
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
          Could not load products from the server: {fetchError}
        </div>
      )}
      {/* Hero carousel：仅展示后台配置的图，无配置则不显示 */}
      {!selectedCategory && !searchKeyword.trim() && heroSlideUrls.length > 0 && (
        <HomeCarousel images={heroSlideUrls} isNarrow={isNarrow} />
      )}

      <div
        style={{
          width: '100%',
          maxWidth: HOME_CONTENT_MAX,
          marginLeft: 'auto',
          marginRight: 'auto',
          boxSizing: 'border-box',
        }}
      >
        {/* 分类：窄屏首行 6 个 + More；宽屏流体列数；名称不省略可换行 */}
        <HomeCategoryBar selectedCategory={selectedCategory} onSelectCategory={onSelectCategory} compact={isNarrow} />

        {/* Special 横条：未在搜索时显示；搜索时只展示下方匹配结果 */}
        {!selectedCategory && !searchKeyword.trim() && specialProducts.length > 0 && (
          <div style={{ marginBottom: 'clamp(1.25rem, 4vw, 2.5rem)' }}>
            <SpecialProductList products={specialProducts} productImage={productImage} />
          </div>
        )}

        {/* 商品网格：选分类或有关键词时展示，仅列出 filtered */}
        {(selectedCategory || searchKeyword.trim()) && (
          <div id="search-results" style={{ scrollMarginTop: '1rem' }}>
            <div
              style={{
                display: 'grid',
                alignItems: 'start',
                gridTemplateColumns: PRODUCT_AND_SPECIAL_GRID,
                gap: GRID_GAP,
                marginTop: '0.5rem',
                width: '100%',
              }}
            >
              {filtered.map((product) => (
                <ProductCard key={product.id} product={product} productImage={productImage} />
              ))}
            </div>
            {filtered.length === 0 && <div style={{ textAlign: 'center', color: '#999' }}>No products</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function HomeCarousel({ images, isNarrow }: { images: string[]; isNarrow: boolean }) {
  const slides = images.map((src, i) => ({ src, alt: `Home ${i + 1}` }));
  const [current, setCurrent] = useState(0);
  const heroH = isNarrow ? 200 : 400;
  const multi = slides.length > 1;

  useEffect(() => {
    setCurrent((c) => (images.length === 0 ? 0 : Math.min(c, images.length - 1)));
  }, [images.length]);

  if (slides.length === 0) return null;

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
      {multi && (
        <>
          <button
            type="button"
            onClick={() => setCurrent((c) => (c === 0 ? slides.length - 1 : c - 1))}
            style={{
              position: 'absolute',
              left: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'rgba(0,0,0,0.4)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.25rem',
            }}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setCurrent((c) => (c === slides.length - 1 ? 0 : c + 1))}
            style={{
              position: 'absolute',
              right: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'rgba(0,0,0,0.4)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.25rem',
            }}
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}

function SpecialProductList({ products, productImage }: { products: Product[]; productImage: string }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: PRODUCT_AND_SPECIAL_GRID,
        alignItems: 'start',
        gap: GRID_GAP,
        width: '100%',
        maxWidth: '100%',
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      {products.map((p) => (
        <SpecialCard key={p.id} product={p} productImage={productImage} />
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
function HomeCartToggle({ product, productImage }: { product: Product; productImage: string }) {
  const { items, addItem, updateQuantity, removeItem, updateExpectedWeightKg } = useCart();
  const line = items.find((i) => i.productId === product.id);
  const cartQty = line?.quantity ?? 0;
  const estKg =
    product.isWeighingRequired && line?.isWeighingRequired
      ? Number(line.expectedWeightKg ?? defaultEstKgForProduct(product))
      : 0;

  const base = () => ({
    productId: product.id,
    name: product.name,
    price: product.price,
    imageUrl: product.imageUrl || productImage,
  });

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (product.isWeighingRequired) {
      addItem({
        ...base(),
        quantity: 1,
        isWeighingRequired: true,
        expectedWeightKg: defaultEstKgForProduct(product),
      });
    } else {
      addItem({ ...base(), quantity: 1 });
    }
  };

  const handleMinus = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (product.isWeighingRequired && line?.isWeighingRequired) {
      const w = estKg - WEIGHT_STEP_KG;
      if (w < WEIGHT_MIN_KG - 1e-9) removeItem(product.id);
      else updateExpectedWeightKg(product.id, Math.round(w * 1000) / 1000);
      return;
    }
    if (cartQty <= 1) removeItem(product.id);
    else updateQuantity(product.id, cartQty - 1);
  };

  const handlePlus = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (product.isWeighingRequired) {
      if (line?.isWeighingRequired) {
        updateExpectedWeightKg(product.id, Math.round((estKg + WEIGHT_STEP_KG) * 1000) / 1000);
      } else {
        addItem({
          ...base(),
          quantity: 1,
          isWeighingRequired: true,
          expectedWeightKg: defaultEstKgForProduct(product),
        });
      }
      return;
    }
    addItem({ ...base(), quantity: 1 });
  };

  const pillBorder = '1px solid #dc2626';
  const rowMinH = CART_BTN;

  const inCartWeighing = Boolean(product.isWeighingRequired && line?.isWeighingRequired && estKg > 0);
  const inCartCount = product.isWeighingRequired ? (inCartWeighing ? 1 : 0) : cartQty;

  if (inCartCount === 0) {
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
            padding: 'clamp(0.04rem, 0.5vw, 0.08rem) clamp(0.38rem, 1.5vw, 0.6rem)',
            cursor: 'pointer',
            fontWeight: 700,
            color: '#dc2626',
            fontSize: CART_FS,
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
        columnGap: 'clamp(0.22rem, 1vw, 0.4rem)',
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
            width: CART_BTN,
            height: CART_BTN,
            boxSizing: 'border-box',
            flexShrink: 0,
          }}
        >
          <img
            src={minusIcon}
            alt=""
            style={{ width: CART_ICON, height: CART_ICON, objectFit: 'contain', display: 'block' }}
          />
        </button>
      </div>
      <span
        style={{
          minWidth: 'clamp(18px, 5vw, 28px)',
          textAlign: 'center',
          fontWeight: 700,
          fontSize: CART_FS,
          color: '#111827',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {product.isWeighingRequired ? `${estKg.toFixed(2)} kg` : cartQty}
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
            width: CART_BTN,
            height: CART_BTN,
            boxSizing: 'border-box',
            flexShrink: 0,
          }}
        >
          <img
            src={plusIcon}
            alt=""
            style={{ width: CART_ICON, height: CART_ICON, objectFit: 'contain', display: 'block' }}
          />
        </button>
      </div>
    </div>
  );
}

function SpecialCard({ product, productImage }: { product: Product; productImage: string }) {
  return (
    <div
      style={{
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        alignSelf: 'start',
        backgroundColor: 'white',
        borderRadius: 'clamp(6px, 1.2vw, 10px)',
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
            padding: 'clamp(0.2rem, 0.9vw, 0.38rem) clamp(0.28rem, 1vw, 0.5rem)',
            fontSize: 'clamp(0.62rem, 1.7vw, 0.84rem)',
            fontWeight: 'bold',
            textAlign: 'center',
            lineHeight: 1.2,
            letterSpacing: '0.06em',
          }}
        >
          {product.discountLabel}
        </div>
      )}
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
      <div
        style={{
          padding: 'clamp(0.3rem, 1.3vw, 0.55rem)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(0.18rem, 1vw, 0.35rem)',
        }}
      >
        <h3
          style={{
            ...titleClampStyle,
            fontSize: 'clamp(0.64rem, 2vw, 0.88rem)',
            fontWeight: 'bold',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {product.name}
        </h3>
        {product.wasPrice != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
            <span
              style={{
                backgroundColor: '#fef08a',
                padding: '0.08rem 0.2rem',
                borderRadius: '4px',
                fontSize: 'clamp(0.52rem, 1.4vw, 0.65rem)',
                textDecoration: 'line-through',
              }}
            >
              was ${product.wasPrice.toFixed(2)}
            </span>
            <span
              style={{
                marginLeft: 'auto',
                color: '#9ca3af',
                fontSize: 'clamp(0.62rem, 1.6vw, 0.78rem)',
                cursor: 'pointer',
              }}
              title="Add to favourites"
            >
              ♡
            </span>
          </div>
        )}
        <div
          style={{
            width: '100%',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(0.08rem, 0.8vw, 0.16rem)',
            marginTop: 'clamp(0.08rem, 0.8vw, 0.16rem)',
          }}
        >
          {product.isWeighingRequired ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.15rem', flexWrap: 'wrap', lineHeight: 1.2 }}>
              <span style={{ fontSize: 'clamp(0.82rem, 2.5vw, 1.08rem)', fontWeight: 'bold', color: '#dc2626' }}>
                ${product.price.toFixed(2)}
              </span>
              <span style={{ fontSize: 'clamp(0.58rem, 1.6vw, 0.74rem)', color: '#999' }}>/kg</span>
            </div>
          ) : (
            <span style={{ fontSize: 'clamp(0.82rem, 2.5vw, 1.08rem)', fontWeight: 'bold', color: '#dc2626', lineHeight: 1.2 }}>
              ${product.price.toFixed(2)}
            </span>
          )}
          <HomeCartToggle product={product} productImage={productImage} />
        </div>
      </div>
    </div>
  );
}

function ProductCard({ product, productImage }: { product: Product; productImage: string }) {
  return (
    <div
      style={{
        width: '100%',
        minWidth: 0,
        alignSelf: 'start',
        border: '1px solid #e5e7eb',
        borderRadius: 'clamp(6px, 1.2vw, 10px)',
        padding: 'clamp(0.32rem, 1.4vw, 0.65rem)',
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
      <div
        style={{
          width: '100%',
          aspectRatio: '1',
          borderRadius: 'clamp(5px, 1vw, 8px)',
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

      <div
        style={{
          marginTop: 'clamp(0.22rem, 1.1vw, 0.42rem)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(0.12rem, 1vw, 0.26rem)',
        }}
      >
        <h3
          style={{
            ...titleClampStyle,
            fontSize: 'clamp(0.68rem, 2.1vw, 0.98rem)',
            fontWeight: 'bold',
            margin: 0,
            lineHeight: 1.25,
          }}
        >
          {product.name}
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.08rem, 0.8vw, 0.16rem)', width: '100%', minWidth: 0 }}>
          {product.isWeighingRequired ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.15rem', flexShrink: 0, minWidth: 0, lineHeight: 1.2 }}>
              <span style={{ fontSize: 'clamp(0.86rem, 2.6vw, 1.15rem)', fontWeight: 'bold', color: '#dc2626' }}>
                ${product.price.toFixed(2)}
              </span>
              <span style={{ fontSize: 'clamp(0.58rem, 1.6vw, 0.78rem)', color: '#999' }}>/kg</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.15rem', flexShrink: 0, minWidth: 0, lineHeight: 1.2 }}>
              <span style={{ fontSize: 'clamp(0.86rem, 2.6vw, 1.15rem)', fontWeight: 'bold', color: '#dc2626' }}>${product.price}</span>
              <span style={{ fontSize: 'clamp(0.58rem, 1.6vw, 0.78rem)', color: '#999' }}>/{product.unit}</span>
            </div>
          )}
          <HomeCartToggle product={product} productImage={productImage} />
        </div>
      </div>
    </div>
  );
}
