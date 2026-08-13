'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth/auth-context';
import { DashboardGate } from '@/components/dashboard/DashboardGate';

/**
 * Protected admin area. Every route under /dashboard is gated behind a real
 * authenticated Supabase session resolved to a store membership via /auth/me.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <DashboardGate>{children}</DashboardGate>
    </AuthProvider>
  );
}
