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
  addItem: (item: CartItem) => void;
  removeItem: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  clear: () => void;
  total: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    const stored = localStorage.getItem('cart');
    return stored ? JSON.parse(stored) : [];
  });

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

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
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clear, total }}>
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
