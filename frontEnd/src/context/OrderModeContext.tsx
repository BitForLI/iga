import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

const DELIVERY_INFO_KEY = 'iga_delivery_info';
const ORDER_MODE_KEY = 'iga_order_mode';

export type OrderType = 'Pickup' | 'Delivery';

function getPickupHoursForDay(dayIndex: number): { openHour: number; closeHour: number } {
  if (dayIndex === 6) return { openHour: 8, closeHour: 18 };
  if (dayIndex === 0) return { openHour: 9, closeHour: 18 };
  return { openHour: 7, closeHour: 20 };
}

function pickupWindowEndLocal(slotDate: Date): Date {
  const { closeHour } = getPickupHoursForDay(slotDate.getDay());
  return new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate(), closeHour, 0, 0, 0);
}

function pickupWindowStartLocal(now: Date): Date {
  return new Date(now.getTime() + 60 * 60 * 1000);
}

function isPickupSlotStillValid(slotValue: string): boolean {
  if (!slotValue) return false;
  try {
    const slotDate = new Date(slotValue);
    const now = new Date();
    if (Number.isNaN(slotDate.getTime())) return false;
    if (slotDate <= now) return false;
    if (slotDate < pickupWindowStartLocal(now)) return false;
    const { openHour } = getPickupHoursForDay(slotDate.getDay());
    const wStart = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate(), openHour, 0, 0, 0);
    const wEnd = pickupWindowEndLocal(slotDate);
    if (slotDate < wStart) return false;
    if (slotDate >= wEnd) return false;
    return true;
  } catch {
    return false;
  }
}

function loadOrderMode(): { orderType: OrderType; pickupTimeSlot: string } {
  try {
    const s = localStorage.getItem(ORDER_MODE_KEY);
    if (s) {
      const parsed = JSON.parse(s) as { orderType?: string; pickupTimeSlot?: string };
      const orderType = (parsed?.orderType === 'Delivery' ? 'Delivery' : 'Pickup') as OrderType;
      const pickupTimeSlot = orderType === 'Pickup' && parsed?.pickupTimeSlot && isPickupSlotStillValid(parsed.pickupTimeSlot) ? parsed.pickupTimeSlot : '';
      return { orderType, pickupTimeSlot };
    }
  } catch (_) {}
  return { orderType: 'Pickup', pickupTimeSlot: '' };
}

function saveOrderMode(orderType: OrderType, pickupTimeSlot: string) {
  try {
    localStorage.setItem(ORDER_MODE_KEY, JSON.stringify({ orderType, pickupTimeSlot }));
  } catch (_) {}
}

export interface DeliveryInfo {
  address: string;
  suburb?: string;
  postcode?: string;
  unitNumber?: string;
  contactName?: string;
  contactPhone?: string;
}

function loadDeliveryInfo(): DeliveryInfo {
  try {
    const s = localStorage.getItem(DELIVERY_INFO_KEY);
    if (s) {
      const parsed = JSON.parse(s) as Partial<DeliveryInfo>;
      return { address: parsed?.address ?? '', suburb: parsed?.suburb, postcode: parsed?.postcode, unitNumber: parsed?.unitNumber, contactName: parsed?.contactName, contactPhone: parsed?.contactPhone };
    }
  } catch (_) {}
  return { address: '' };
}

function saveDeliveryInfo(info: DeliveryInfo) {
  try {
    if (info.address?.trim() || info.suburb || info.postcode || info.unitNumber || info.contactName || info.contactPhone) {
      localStorage.setItem(DELIVERY_INFO_KEY, JSON.stringify(info));
    }
  } catch (_) {}
}

interface OrderModeContextType {
  orderType: OrderType;
  setOrderType: (t: OrderType) => void;
  pickupTimeSlot: string;
  setPickupTimeSlot: (v: string) => void;
  deliveryInfo: DeliveryInfo;
  setDeliveryInfo: (v: DeliveryInfo | ((prev: DeliveryInfo) => DeliveryInfo)) => void;
  saveDeliveryAddress: () => void;
}

const OrderModeContext = createContext<OrderModeContextType | undefined>(undefined);

export function OrderModeProvider({ children }: { children: ReactNode }) {
  const loaded = loadOrderMode();
  const [orderType, setOrderType] = useState<OrderType>(loaded.orderType);
  const [pickupTimeSlot, setPickupTimeSlot] = useState<string>(loaded.pickupTimeSlot);
  const [deliveryInfo, setDeliveryInfoState] = useState<DeliveryInfo>(loadDeliveryInfo);

  const setDeliveryInfo = (v: DeliveryInfo | ((prev: DeliveryInfo) => DeliveryInfo)) => {
    setDeliveryInfoState((prev) => (typeof v === 'function' ? v(prev) : v));
  };

  useEffect(() => {
    saveOrderMode(orderType, pickupTimeSlot);
  }, [orderType, pickupTimeSlot]);

  const saveDeliveryAddress = () => {
    saveDeliveryInfo(deliveryInfo);
  };

  return (
    <OrderModeContext.Provider
      value={{
        orderType,
        setOrderType,
        pickupTimeSlot,
        setPickupTimeSlot,
        deliveryInfo,
        setDeliveryInfo,
        saveDeliveryAddress,
      }}
    >
      {children}
    </OrderModeContext.Provider>
  );
}

export function useOrderMode() {
  const context = useContext(OrderModeContext);
  if (!context) {
    throw new Error('useOrderMode must be used within OrderModeProvider');
  }
  return context;
}
