'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiError } from '@/lib/api/client';
import {
  addStorefrontCartItem,
  clearStorefrontCart,
  getStorefrontCart,
  removeStorefrontCartItem,
  updateStorefrontCartItem,
} from '@/lib/api/cart';
import { storefrontApi, storefrontMediaUrlForSlug } from '@/lib/api/storefront';
import { clearGuestToken, getGuestToken, setGuestToken } from './guest-cart';
import type {
  CartView,
  StorefrontNavigation,
  StorefrontStore,
  StorefrontTheme,
} from './types';

/**
 * Storefront context (Phase 19).
 *
 * Loads the REAL store configuration (GET /storefront), theme
 * (GET /storefront/theme) and navigation (GET /storefront/navigation) for the
 * storefront slug and manages the GUEST cart (X-Guest-Token) for that store.
 * Theme colors/fonts are applied as CSS variables on the storefront shell.
 *
 * The store is ALWAYS resolved by the backend from the slug header — a client
 * never supplies a store id.
 */

export interface CartTotals {
  subtotal: number;
  count: number;
}

export interface StorefrontContextValue {
  slug: string;
  store: StorefrontStore | null;
  theme: StorefrontTheme | null;
  navigation: StorefrontNavigation | null;
  /** True while the initial store/theme/navigation load is in flight. */
  loading: boolean;
  /** Store resolution error (unknown/disabled store, network failure). */
  error: string | null;
  /** Re-runs the storefront bootstrap (store/theme/navigation + cart). */
  reload: () => Promise<void>;
  cart: CartView | null;
  cartCount: number;
  cartSubtotal: number;
  cartLoading: boolean;
  refreshCart: () => Promise<void>;
  addToCart: (variantId: string, quantity: number) => Promise<void>;
  updateCartItem: (itemId: string, quantity: number) => Promise<void>;
  removeCartItem: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  /** Resolves a store media id to a displayable image URL (blob proxy). */
  mediaUrl: (mediaId: string) => Promise<string>;
  /** Theme-driven CSS variables applied to the storefront shell. */
  themeVariables: React.CSSProperties;
}

const StorefrontContext = createContext<StorefrontContextValue | undefined>(undefined);

function cartTotals(cart: CartView | null): CartTotals {
  if (!cart) return { subtotal: 0, count: 0 };
  return cart.items.reduce(
    (acc, item) => ({
      subtotal: acc.subtotal + item.unitPrice * item.quantity,
      count: acc.count + item.quantity,
    }),
    { subtotal: 0, count: 0 },
  );
}


export function StorefrontProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [store, setStore] = useState<StorefrontStore | null>(null);
  const [theme, setTheme] = useState<StorefrontTheme | null>(null);
  const [navigation, setNavigation] = useState<StorefrontNavigation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartView | null>(null);
  const [cartLoading, setCartLoading] = useState(false);
  const activeSlug = useRef(slug);

  const loadStorefront = useCallback(async () => {
    activeSlug.current = slug;
    setLoading(true);
    setError(null);
    try {
      const [storeResult, themeResult, navigationResult] = await Promise.all([
        storefrontApi.getStore(slug),
        storefrontApi.getTheme(slug),
        storefrontApi.getNavigation(slug),
      ]);
      if (activeSlug.current !== slug) return;
      setStore(storeResult.data);
      setTheme(themeResult.data);
      setNavigation(navigationResult.data);
    } catch (caught) {
      if (activeSlug.current !== slug) return;
      setStore(null);
      setError(storefrontErrorMessage(caught));
    } finally {
      if (activeSlug.current === slug) {
        setLoading(false);
      }
    }
  }, [slug]);

  const refreshCart = useCallback(async () => {
    const token = getGuestToken(slug);
    if (!token) {
      setCart(null);
      return;
    }
    setCartLoading(true);
    try {
      const cart = await getStorefrontCart(slug, token);
      setCart(cart);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        // The token is unknown/expired server-side — start a fresh guest cart.
        clearGuestToken(slug);
        setCart(null);
      } else {
        // Cart refresh is non-blocking for browsing: keep the last known cart.
        setCart(null);
      }
    } finally {
      setCartLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStorefront();
    void refreshCart();
  }, [loadStorefront, refreshCart]);

  const addToCart = useCallback(
    async (variantId: string, quantity: number) => {
      const result = await addStorefrontCartItem(slug, getGuestToken(slug), {
        variantId,
        quantity,
      });
      setGuestToken(slug, result.guestToken);
      setCart(result);
    },
    [slug],
  );

  const updateCartItem = useCallback(
    async (itemId: string, quantity: number) => {
      const token = getGuestToken(slug);
      if (!token) return;
      const result = await updateStorefrontCartItem(slug, token, itemId, quantity);
      setGuestToken(slug, result.guestToken);
      setCart(result);
    },
    [slug],
  );

  const removeCartItem = useCallback(
    async (itemId: string) => {
      const token = getGuestToken(slug);
      if (!token) return;
      await removeStorefrontCartItem(slug, token, itemId);
      await refreshCart();
    },
    [slug, refreshCart],
  );

  const clearCart = useCallback(async () => {
    const token = getGuestToken(slug);
    if (token) {
      await clearStorefrontCart(slug, token);
    }
    clearGuestToken(slug);
    setCart(null);
  }, [slug]);

  const mediaUrl = useCallback(
    async (mediaId: string) => storefrontMediaUrlForSlug(slug, mediaId),
    [slug],
  );

  const reload = useCallback(async () => {
    await Promise.all([loadStorefront(), refreshCart()]);
  }, [loadStorefront, refreshCart]);

  const themeVariables = useMemo<React.CSSProperties>(() => {
    const config = theme?.config ?? {};
    const primary =
      typeof config.primaryColor === 'string' && config.primaryColor
        ? config.primaryColor
        : '#0f766e';
    const fontFamily =
      typeof config.fontFamily === 'string' && config.fontFamily
        ? config.fontFamily
        : 'system-ui, -apple-system, sans-serif';
    return {
      '--sf-primary': primary,
      '--sf-primary-soft': shadePrimary(primary),
      '--sf-font': fontFamily,
    } as React.CSSProperties;
  }, [theme]);

  const totals = useMemo(() => cartTotals(cart), [cart]);

  const value = useMemo<StorefrontContextValue>(
    () => ({
      slug,
      store,
      theme,
      navigation,
      loading,
      error,
      reload,
      cart,
      cartCount: totals.count,
      cartSubtotal: totals.subtotal,
      cartLoading,
      refreshCart,
      addToCart,
      updateCartItem,
      removeCartItem,
      clearCart,
      mediaUrl,
      themeVariables,
    }),
    [
      slug,
      store,
      theme,
      navigation,
      loading,
      error,
      reload,
      cart,
      totals,
      cartLoading,
      refreshCart,
      addToCart,
      updateCartItem,
      removeCartItem,
      clearCart,
      mediaUrl,
      themeVariables,
    ],
  );

  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>;
}

export function useStorefront(): StorefrontContextValue {
  const context = useContext(StorefrontContext);
  if (!context) {
    throw new Error('useStorefront must be used within a StorefrontProvider.');
  }
  return context;
}

function storefrontErrorMessage(caught: unknown): string {
  if (caught instanceof ApiError) {
    return caught.message;
  }
  return caught instanceof Error ? caught.message : 'Storefront could not be loaded.';
}

/** Builds a light tint of the primary color for soft backgrounds. */
function shadePrimary(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 'rgba(15,118,110,0.12)';
  const value = parseInt(match[1], 16);
  const r = ((value >> 16) & 0xff) + 220;
  const g = ((value >> 8) & 0xff) + 220;
  const b = (value & 0xff) + 220;
  return `rgb(${Math.min(r, 255)}, ${Math.min(g, 255)}, ${Math.min(b, 255)})`;
}
