import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setUnauthorizedHandler } from './api';
import type { Family, FamilySummary, User } from './types';

interface SessionValue {
  user: User | null;
  loadingUser: boolean;
  families: FamilySummary[];
  family: Family | null;
  familyId: string | null;
  setFamilyId: (id: string) => void;
  scope: { scope: 'family' | 'individual'; userId?: string };
  setScope: (s: { scope: 'family' | 'individual'; userId?: string }) => void;
  scopeQuery: string;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<unknown>;
}

const Ctx = createContext<SessionValue | null>(null);

function readStored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStored(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* storage unavailable */ }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: User | null }>('/auth/session').then((r) => r.user),
    staleTime: 60_000,
  });
  const user = me.data ?? null;

  useEffect(() => {
    setUnauthorizedHandler(() => { qc.setQueryData(['me'], null); });
  }, [qc]);

  const familiesQ = useQuery({
    queryKey: ['families'],
    queryFn: () => api.get<{ families: FamilySummary[] }>('/families').then((r) => r.families),
    enabled: Boolean(user),
  });
  const families = familiesQ.data ?? [];

  const [familyId, setFamilyIdState] = useState<string | null>(() => readStored('los.family'));
  const activeId = families.find((f) => f.id === familyId)?.id ?? families[0]?.id ?? null;
  const setFamilyId = (id: string) => { setFamilyIdState(id); writeStored('los.family', id); setScope({ scope: 'family' }); };

  const familyQ = useQuery({
    queryKey: ['family', activeId],
    queryFn: () => api.get<{ family: Family }>(`/families/${activeId}`).then((r) => r.family),
    enabled: Boolean(activeId),
  });

  const [scope, setScope] = useState<{ scope: 'family' | 'individual'; userId?: string }>({ scope: 'family' });
  const scopeQuery = scope.scope === 'family' ? 'scope=family' : `scope=individual${scope.userId ? `&userId=${scope.userId}` : ''}`;

  const value = useMemo<SessionValue>(() => ({
    user, loadingUser: me.isLoading, families, family: familyQ.data ?? null, familyId: activeId, setFamilyId,
    scope, setScope, scopeQuery,
    signOut: async () => { await api.post('/auth/logout').catch(() => {}); qc.clear(); qc.setQueryData(['me'], null); },
    refreshUser: () => me.refetch(),
  }), [user, me.isLoading, families, familyQ.data, activeId, scope, scopeQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}

export const canWrite = (role?: string) => role === 'owner' || role === 'admin' || role === 'member';
export const isAdmin = (role?: string) => role === 'owner' || role === 'admin';
