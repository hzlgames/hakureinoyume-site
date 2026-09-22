'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../../../lib/auth-client';
import type { AccountState } from '../../../lib/music-types';
import { announceAccountChange, ApiError, errorMessage, fetchJson } from './api';

const defaultAccount: AccountState = { siteAuthenticated: false, neteaseAuthenticated: false, profile: null };
type QrState = { key: string; ticket: string; qrimg: string; status: 'waiting' | 'scanned' | 'error'; message: string };

export function useMusicAccount() {
  const { data: session, isPending } = useSession();
  const [account, setAccount] = useState(defaultAccount);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [qr, setQr] = useState<QrState | null>(null);
  const [message, setMessage] = useState('');
  const accountRequest = useRef(0);
  const qrGeneration = useRef(0);
  const qrController = useRef<AbortController | null>(null);
  const qrTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const stopQr = useCallback(() => {
    qrGeneration.current++;
    qrController.current?.abort();
    if (qrTimer.current) clearTimeout(qrTimer.current);
  }, []);
  const closeQr = useCallback(() => {
    stopQr(); setQr(null); setIsConnecting(false);
  }, [stopQr]);
  const refresh = useCallback(async () => {
    const request = ++accountRequest.current;
    setIsRefreshing(true);
    try {
      const data = await fetchJson<AccountState>('/api/music/me');
      if (!mounted.current || request !== accountRequest.current) return null;
      setAccount(data);
      if (!data.siteAuthenticated || data.neteaseAuthenticated) closeQr();
      setMessage(data.expired ? '网易云登录已过期，请重新扫码连接。' : data.degraded ? '网易云暂时无法验证账号，稍后会自动重试。' : '');
      return data;
    } catch (error) {
      if (mounted.current && request === accountRequest.current) setMessage(errorMessage(error));
      return null;
    } finally {
      if (mounted.current && request === accountRequest.current) setIsRefreshing(false);
    }
  }, [closeQr]);
  const invalidateAccount = useCallback(() => { accountRequest.current++; }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; invalidateAccount(); stopQr(); };
  }, [stopQr, invalidateAccount]);
  const siteUserId = session?.user.id;
  useEffect(() => {
    if (isPending) return;
    // Synchronize the separately stored NetEase identity with the external site session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    closeQr();
    // Clear private data as soon as the site identity changes, before any request.
    setAccount(siteUserId ? { ...defaultAccount, siteAuthenticated: true, siteUserId } : defaultAccount);
    void refresh();
    return invalidateAccount;
  }, [siteUserId, isPending, refresh, closeQr, invalidateAccount]);
  useEffect(() => {
    const visibleRefresh = () => { if (document.visibilityState === 'visible') void refresh(); };
    const storage = (event: StorageEvent) => { if (event.key === 'hakurei-music-account-change') visibleRefresh(); };
    window.addEventListener('focus', visibleRefresh);
    window.addEventListener('online', visibleRefresh);
    window.addEventListener('storage', storage);
    window.addEventListener('music-account-change', visibleRefresh);
    document.addEventListener('visibilitychange', visibleRefresh);
    const timer = setInterval(visibleRefresh, 60000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', visibleRefresh);
      window.removeEventListener('online', visibleRefresh);
      window.removeEventListener('storage', storage);
      window.removeEventListener('music-account-change', visibleRefresh);
      document.removeEventListener('visibilitychange', visibleRefresh);
    };
  }, [refresh]);
  const handleExpiry = useCallback((error: unknown) => {
    if (!(error instanceof ApiError)) return false;
    if (error.code === 'site_login_required') {
      accountRequest.current++;
      setAccount(defaultAccount); closeQr(); setMessage('本站登录已过期，请重新登录。');
      return true;
    }
    if (error.code !== 'netease_login_required') return false;
    accountRequest.current++;
    setAccount(current => ({ ...current, neteaseAuthenticated: false, profile: null, expired: true }));
    setMessage('网易云登录已过期，请重新扫码连接。');
    return true;
  }, [closeQr]);

  const startQr = useCallback(async () => {
    if (!account.siteAuthenticated) { setMessage('请先登录本站，再连接网易云。'); return; }
    stopQr();
    const generation = qrGeneration.current;
    const controller = new AbortController();
    qrController.current = controller;
    const current = () => mounted.current && generation === qrGeneration.current && !controller.signal.aborted;
    setQr(null); setIsConnecting(true); setMessage('');
    let failures = 0;
    const schedule = (action: () => void, delay: number) => {
      if (current()) qrTimer.current = setTimeout(action, delay);
    };
    const generate = async () => {
      if (!current()) return;
      setIsConnecting(true); setQr(null);
      try {
        const data = await fetchJson<{ key: string; ticket: string; qrimg: string }>('/api/music/login/qr/start', {
          method: 'POST', body: '{}', signal: controller.signal
        });
        if (!current()) return;
        if (!data.key || !data.qrimg) throw new Error('二维码生成失败，请重试。');
        failures = 0;
        const next: QrState = { ...data, status: 'waiting', message: '使用网易云音乐 App 扫码，随后在手机上确认。' };
        setQr(next); setIsConnecting(false);
        schedule(() => void poll(next), 1400);
      } catch (error) {
        if (!current()) return;
        setIsConnecting(false); setMessage(errorMessage(error));
        handleExpiry(error);
      }
    };
    const poll = async (active: QrState) => {
      if (!current()) return;
      // A serial timer prevents overlapping checks and resumes after transient failures.
      if (document.visibilityState === 'hidden') { schedule(() => void poll(active), 1500); return; }
      try {
        const data = await fetchJson<{ code: number; message?: string }>('/api/music/login/qr/check', {
          method: 'POST', body: JSON.stringify({ key: active.key, ticket: active.ticket }), signal: controller.signal
        });
        if (!current()) return;
        failures = 0;
        if (data.code === 803) {
          setQr(null); setMessage('网易云已连接。');
          await refresh();
          announceAccountChange();
          return;
        }
        if (data.code === 800) {
          setQr(null); setIsConnecting(true); setMessage('二维码已过期，正在自动更新。');
          schedule(() => void generate(), 600); return;
        }
        if (data.code !== 801 && data.code !== 802) throw new Error(data.message || '扫码状态暂时不可用，正在重试。');
        setQr({ ...active, status: data.code === 802 ? 'scanned' : 'waiting', message: data.code === 802 ? '已扫码，请在手机上确认登录。' : active.message });
        schedule(() => void poll(active), 1800);
      } catch (error) {
        if (!current()) return;
        if (handleExpiry(error)) { closeQr(); return; }
        failures++;
        setQr({ ...active, status: 'error', message: `${errorMessage(error)} 正在重试…` });
        schedule(() => void poll(active), Math.min(1500 * 2 ** failures, 10000));
      }
    };
    await generate();
  }, [account.siteAuthenticated, stopQr, refresh, handleExpiry, closeQr]);
  const disconnect = useCallback(async () => {
    accountRequest.current++;
    closeQr(); setIsDisconnecting(true);
    try {
      await fetchJson('/api/music/logout', { method: 'POST', body: '{}' });
      accountRequest.current++;
      setAccount(current => ({ ...current, neteaseAuthenticated: false, profile: null, expired: false }));
      setMessage('已断开网易云。'); announceAccountChange();
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setIsDisconnecting(false); }
  }, [closeQr]);
  const visibleAccount = !isPending && !siteUserId ? defaultAccount
    : !isPending && account.siteAuthenticated && account.siteUserId !== siteUserId
      ? { ...defaultAccount, siteAuthenticated: true, siteUserId }
      : account;
  return { account: visibleAccount, qr, isRefreshing, isConnecting, isDisconnecting, message, refresh, startQr, closeQr, disconnect, handleExpiry };
}
