import { createContext, useContext, useState, type ReactNode } from 'react';

export interface CartItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
}

interface CartContextType {
  items: CartItem[];
  /** 购物车中所有商品件数之和（含同一 SKU 多件） */
  totalQuantity: number;
  addItem: (item: CartItem) => void;
  removeItem: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
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
        const quantity = Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 0;
        if (quantity <= 0) return null;
        return {
          productId,
          name: String(x.name ?? x.Name ?? ''),
          price: Number.isFinite(Number(x.price ?? x.Price)) ? Number(x.price ?? x.Price) : 0,
          quantity,
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

  const total = items.reduce((sum, item) => {
    const p = Number(item.price);
    const q = Number(item.quantity);
    const line = (Number.isFinite(p) ? p : 0) * (Number.isFinite(q) && q > 0 ? q : 0);
    return sum + line;
  }, 0);
  const totalQuantity = items.reduce((sum, item) => {
    const q = Number(item.quantity);
    return sum + (Number.isFinite(q) && q > 0 ? q : 0);
  }, 0);

  const addItem = (newItem: CartItem) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === newItem.productId);
      const updated = existing
        ? prev.map((i) =>
            i.productId === newItem.productId
              ? { ...i, quantity: i.quantity + newItem.quantity, imageUrl: i.imageUrl || newItem.imageUrl }
              : i
          )
        : [...prev, newItem];
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

  const clear = () => {
    setItems([]);
    localStorage.removeItem('cart');
  };

  return (
    <CartContext.Provider value={{ items, totalQuantity, addItem, removeItem, updateQuantity, clear, total }}>
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
