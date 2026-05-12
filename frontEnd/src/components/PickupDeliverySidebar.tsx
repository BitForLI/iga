import { useRightDrawer, DRAWER_MS } from '../hooks/useRightDrawer';
import { CloseOutlined } from '@ant-design/icons';
import pickupIcon from '../assets/images/自提点.png';
import { useOrderMode } from '../context/OrderModeContext';
import { FulfillmentOptionsForm } from './FulfillmentOptionsForm';

const MAPBOX_TOKEN_RAW = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;
const MAPBOX_TOKEN =
  typeof MAPBOX_TOKEN_RAW === 'string' && MAPBOX_TOKEN_RAW.trim() ? MAPBOX_TOKEN_RAW.trim() : undefined;

/** Re-export for legacy imports from `PickupDeliverySidebar`. */
export { DELIVERY_SUBURBS } from './FulfillmentOptionsForm';

export function PickupDeliverySidebar({ compact = false }: { compact?: boolean }) {
  const iconPx = compact ? 24 : 32;
  const { panelMounted, panelEnter, closePanel, onPanelTransitionEnd, toggleFromTrigger } = useRightDrawer();
  const { orderType } = useOrderMode();

  const deliveryMapboxScroll =
    orderType === 'Delivery' && MAPBOX_TOKEN
      ? { overflowY: 'visible' as const, overflowX: 'visible' as const }
      : { overflowY: 'auto' as const, overflowX: 'hidden' as const };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: compact ? 0 : 6 }}>
        <button
          onClick={toggleFromTrigger}
          title="Pickup / Delivery"
          type="button"
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: compact ? 2 : 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: iconPx,
            minHeight: iconPx,
          }}
        >
          <img
            src={pickupIcon}
            alt="Pickup/Delivery"
            style={{ width: iconPx, height: iconPx, objectFit: 'contain', display: 'block' }}
          />
        </button>
        {!compact && (
          <span style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1, whiteSpace: 'nowrap' }}>
            {orderType === 'Pickup' ? 'Pickup' : 'Delivery'}
          </span>
        )}
      </div>

      {panelMounted && (
        <div
          onTransitionEnd={onPanelTransitionEnd}
          style={{
            position: 'fixed',
            right: 0,
            top: 0,
            width: 'min(420px, 100vw)',
            maxWidth: '100%',
            height: '100dvh',
            backgroundColor: 'white',
            boxShadow: '-2px 0 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            transform: panelEnter ? 'translate3d(0,0,0)' : 'translate3d(100%,0,0)',
            transition: `transform ${DRAWER_MS}ms ease-out`,
            willChange: 'transform',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem 1.25rem',
              borderBottom: '1px solid #e5e7eb',
            }}
          >
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0, color: '#0a0a0a' }}>Where would you like to shop?</h2>
            <button
              type="button"
              onClick={closePanel}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '0.25rem',
                color: '#6b7280',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CloseOutlined style={{ fontSize: '1.25rem' }} />
            </button>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              ...deliveryMapboxScroll,
              padding: '1rem 1.25rem',
            }}
          >
            <FulfillmentOptionsForm variant="sidebar" active={panelMounted} onSidebarClose={closePanel} />
          </div>
        </div>
      )}

      {panelMounted && (
        <div
          aria-hidden
          onClick={closePanel}
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.3)',
            zIndex: 999,
            opacity: panelEnter ? 1 : 0,
            transition: `opacity ${DRAWER_MS}ms ease-out`,
          }}
        />
      )}
    </>
  );
}
