import { createContext, useContext, useState, type ReactNode } from 'react';

export interface CartItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  selectedUnit?: string;
  imageUrl?: string;
  /** 称重商品：预估 kg；非称重勿设 */
  isWeighingRequired?: boolean;
  expectedWeightKg?: number;
}

function lineAmount(item: CartItem): number {
  const p = Number(item.price);
  const priceOk = Number.isFinite(p) ? p : 0;
  if (item.isWeighingRequired || item.selectedUnit?.toLowerCase() === 'kg') {
    const w = Number(item.expectedWeightKg);
    return priceOk * (Number.isFinite(w) && w > 0 ? w : 0);
  }
  const q = Number(item.quantity);
  return priceOk * (Number.isFinite(q) && q > 0 ? q : 0);
}

interface CartContextType {
  items: CartItem[];
  /** 购物车中所有商品件数之和（含同一 SKU 多件） */
  totalQuantity: number;
  addItem: (item: CartItem) => void;
  removeItem: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  updateExpectedWeightKg: (productId: number, kg: number) => void;
  clear: () => void;
  total: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function parseCartFromStorage(raw: string | null): CartItem[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row: unknown): CartItem | null => {
        if (!row || typeof row !== 'object') return null;
        const x = row as Record<string, unknown>;
        const productId = Number(x.productId ?? x.ProductId);
        const qty = Number(x.quantity ?? x.Quantity);
        if (!Number.isFinite(productId) || productId <= 0) return null;
        const isWeighing = Boolean(x.isWeighingRequired ?? x.IsWeighingRequired);
        const selectedUnit = typeof (x.selectedUnit ?? x.SelectedUnit) === 'string'
          ? String(x.selectedUnit ?? x.SelectedUnit)
          : undefined;
        let expectedWeightKg = Number(x.expectedWeightKg ?? x.ExpectedWeightKg);
        const quantity = Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 0;
        if (isWeighing) {
          if (!Number.isFinite(expectedWeightKg) || expectedWeightKg <= 0) {
            expectedWeightKg = quantity > 0 ? quantity : 1;
          }
          return {
            productId,
            name: String(x.name ?? x.Name ?? ''),
            price: Number.isFinite(Number(x.price ?? x.Price)) ? Number(x.price ?? x.Price) : 0,
            quantity: 1,
            selectedUnit,
            imageUrl: typeof x.imageUrl === 'string' ? x.imageUrl : undefined,
            isWeighingRequired: true,
            expectedWeightKg,
          };
        }
        if (quantity <= 0) return null;
        return {
          productId,
          name: String(x.name ?? x.Name ?? ''),
          price: Number.isFinite(Number(x.price ?? x.Price)) ? Number(x.price ?? x.Price) : 0,
          quantity,
          selectedUnit,
          imageUrl: typeof x.imageUrl === 'string' ? x.imageUrl : undefined,
        };
      })
      .filter((i): i is CartItem => i !== null);
  } catch {
    try {
      localStorage.removeItem('cart');
    } catch {
      /* ignore */
    }
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => parseCartFromStorage(localStorage.getItem('cart')));

  const total = items.reduce((sum, item) => sum + lineAmount(item), 0);
  const totalQuantity = items.reduce((sum, item) => {
    if (item.isWeighingRequired) return sum + 1;
    const q = Number(item.quantity);
    return sum + (Number.isFinite(q) && q > 0 ? q : 0);
  }, 0);

  const addItem = (newItem: CartItem) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === newItem.productId);
      let updated: CartItem[];
      if (existing && existing.isWeighingRequired && newItem.isWeighingRequired) {
        if ((existing.selectedUnit ?? '').toLowerCase() !== (newItem.selectedUnit ?? '').toLowerCase()) {
          updated = prev.map((i) => (i.productId === newItem.productId ? newItem : i));
        } else {
        const w1 = Number(existing.expectedWeightKg ?? 0);
        const w2 = Number(newItem.expectedWeightKg ?? 0);
        const nw = (Number.isFinite(w1) ? w1 : 0) + (Number.isFinite(w2) ? w2 : 0);
        updated = prev.map((i) =>
          i.productId === newItem.productId
            ? { ...i, expectedWeightKg: nw > 0 ? nw : i.expectedWeightKg, imageUrl: i.imageUrl || newItem.imageUrl }
            : i
        );
        }
      } else if (existing && !existing.isWeighingRequired && !newItem.isWeighingRequired) {
        if ((existing.selectedUnit ?? '').toLowerCase() !== (newItem.selectedUnit ?? '').toLowerCase()) {
          updated = prev.map((i) => (i.productId === newItem.productId ? newItem : i));
        } else {
        updated = prev.map((i) =>
          i.productId === newItem.productId
            ? { ...i, quantity: i.quantity + newItem.quantity, imageUrl: i.imageUrl || newItem.imageUrl }
            : i
        );
        }
      } else if (!existing) {
        updated = [...prev, newItem];
      } else {
        updated = [...prev, newItem];
      }
      localStorage.setItem('cart', JSON.stringify(updated));
      return updated;
    });
  };

  const removeItem = (productId: number) => {
    setItems((prev) => {
      const updated = prev.filter((i) => i.productId !== productId);
      localStorage.setItem('cart', JSON.stringify(updated));
      return updated;
    });
  };

  const updateQuantity = (productId: number, quantity: number) => {
    setItems((prev) => {
      const updated =
        quantity <= 0
          ? prev.filter((i) => i.productId !== productId)
          : prev.map((i) => (i.productId === productId ? { ...i, quantity } : i));
      localStorage.setItem('cart', JSON.stringify(updated));
      return updated;
    });
  };

  const updateExpectedWeightKg = (productId: number, kg: number) => {
    setItems((prev) => {
      const updated =
        kg <= 0
          ? prev.filter((i) => i.productId !== productId)
          : prev.map((i) => (i.productId === productId ? { ...i, expectedWeightKg: kg, quantity: 1 } : i));
      localStorage.setItem('cart', JSON.stringify(updated));
      return updated;
    });
  };

  const clear = () => {
    setItems([]);
    localStorage.removeItem('cart');
  };

  return (
    <CartContext.Provider
      value={{ items, totalQuantity, addItem, removeItem, updateQuantity, updateExpectedWeightKg, clear, total }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
}
