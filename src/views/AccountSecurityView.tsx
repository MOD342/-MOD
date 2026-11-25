import React, { useEffect, useState } from 'react';
import {
  ChevronRight,
  ShieldCheck,
  Mail,
  KeyRound,
  Lock,
  User,
  CheckCircle2,
  AlertCircle,
  Send,
  Edit2,
  Eye,
  EyeOff,
  LogOut,
  Trash2,
  Paintbrush,
  ChevronDown,
  Loader2,
  Cloud,
  HardDrive,
  Info,
  AlertTriangle,
  X,
  SlidersHorizontal,
  Database,
  Wifi,
  ChevronLeft,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { isStaffEmail } from '../services/moderationService';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';
import ThemeModeSelector from '../components/ThemeModeSelector';
import DefaultHomeSelector from '../components/DefaultHomeSelector';
import { getDataSaverEnabled, setDataSaverEnabled, reopenOnboarding } from '../utils/appPreferences';

interface AccountSecurityViewProps {
  onBack: () => void;
  onOpenAppearance?: () => void;
  onLogout?: () => void;
  onOpenLegal?: (section: 'about' | 'privacy' | 'terms' | 'data_safety') => void;
}

export default function AccountSecurityView({
  onBack,
  onOpenAppearance,
  onLogout,
  onOpenLegal,
}: AccountSecurityViewProps) {
  const {
    user,
    userData,
    userRole,
    logout,
    signIn,
    signInWithGoogleAdaptive,
    sendVerificationEmail,
    refreshUserVerification,
    changeUserEmail,
    changeUserPassword,
    sendPasswordReset,
    deleteUserAccount,
  } = useAuth();
  const display = useDeviceDisplay();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [identityBusy, setIdentityBusy] = useState(false);
  const [identityMsg, setIdentityMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityMessage, setSecurityMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [settingsTab, setSettingsTab] = useState<'app' | 'account' | 'privacy'>('app');
  const [openSection, setOpenSection] = useState<'none' | 'email' | 'password'>('none');
  const [newEmailInput, setNewEmailInput] = useState('');
  const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState('');
  const [showPassFields, setShowPassFields] = useState(false);

  const [clearingCache, setClearingCache] = useState(false);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [dataSaver, setDataSaver] = useState<boolean>(() => getDataSaverEnabled());

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePasswordInput, setDeletePasswordInput] = useState('');
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (userData || user) {
      setDisplayName(userData?.displayName || user?.displayName || '');
      setUsername(userData?.username || '');
    }
  }, [userData, user]);

  const isCloudAccount = Boolean(
    user && !user.id.startsWith('otaku_guest_') && user.providerIds?.[0] !== 'custom'
  );

  const privacySettings = userData?.privacySettings || {
    showStats: true,
    showHistory: true,
    showStore: true,
  };

  const handleUpdateIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || identityBusy) return;
    setIdentityMsg(null);

    const cleanDisplayName = displayName.trim();
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

    if (!cleanDisplayName) {
      setIdentityMsg({ type: 'error', text: 'يرجى كتابة الاسم المعروض.' });
      return;
    }

    setIdentityBusy(true);
    try {
      const updates: Record<string, any> = {};
      const now = Date.now();

      if (cleanDisplayName !== (userData?.displayName || user.displayName)) {
        const lastChange = userData?.lastDisplayNameChange || 0;
        const daysSince = (now - lastChange) / (1000 * 60 * 60 * 24);
        if (lastChange !== 0 && daysSince < 30) {
          setIdentityMsg({
            type: 'error',
            text: `يمكنك تعديل الاسم المعروض بعد ${Math.ceil(30 - daysSince)} يوم.`,
          });
          setIdentityBusy(false);
          return;
        }
        updates.displayName = cleanDisplayName;
        updates.lastDisplayNameChange = now;
      }

      if (cleanUsername && cleanUsername !== (userData?.username || '')) {
        if (cleanUsername.length < 3) {
          setIdentityMsg({ type: 'error', text: 'يجب أن يتكون المُعرّف من 3 أحرف إنجليزية أو أرقام على الأقل.' });
          setIdentityBusy(false);
          return;
        }
        const lastChange = userData?.lastUsernameChange || 0;
        const daysSince = (now - lastChange) / (1000 * 60 * 60 * 24);
        if (lastChange !== 0 && daysSince < 105) {
          setIdentityMsg({
            type: 'error',
            text: `تعديل المُعرّف متاح بعد ${Math.ceil(105 - daysSince)} يوم.`,
          });
          setIdentityBusy(false);
          return;
        }

        const userNameRef = doc(db, 'usernames', cleanUsername);
        const nameSnap = await getDoc(userNameRef);
        if (nameSnap.exists() && nameSnap.data().id !== user.id) {
          setIdentityMsg({ type: 'error', text: 'هذا المُعرّف محجوز مسبقاً، اختر غيره.' });
          setIdentityBusy(false);
          return;
        }

        await setDoc(userNameRef, { id: user.id });
        if (userData?.username) {
          await deleteDoc(doc(db, 'usernames', userData.username)).catch(() => {});
        }
        updates.username = cleanUsername;
        updates.lastUsernameChange = now;
      }

      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, 'users', user.id), updates);
        setUsername(cleanUsername || username);
        setIdentityMsg({ type: 'success', text: 'تم حفظ بيانات الحساب بنجاح.' });
      } else {
        setIdentityMsg({ type: 'success', text: 'البيانات محدثة بالفعل.' });
      }
    } catch {
      setIdentityMsg({ type: 'error', text: 'تعذر حفظ التغييرات حالياً، حاول مرة أخرى.' });
    } finally {
      setIdentityBusy(false);
    }
  };

  const handleTogglePrivacy = async (field: 'showStats' | 'showStore' | 'showHistory') => {
    if (!user) return;
    try {
      const next = {
        ...privacySettings,
        [field]: privacySettings[field] === false,
      };
      await updateDoc(doc(db, 'users', user.id), { privacySettings: next });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendVerification = async () => {
    setSecurityLoading(true);
    setSecurityMessage(null);
    try {
      const res = await sendVerificationEmail();
      setSecurityMessage({ type: res.success ? 'success' : 'error', text: res.message });
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleCheckVerification = async () => {
    setSecurityLoading(true);
    setSecurityMessage(null);
    try {
      const ok = await refreshUserVerification();
      setSecurityMessage(
        ok
          ? { type: 'success', text: 'تم التحقق من تفعيل بريدك الإلكتروني بنجاح.' }
          : {
              type: 'error',
              text: 'لم يتم تأكيد البريد بعد؛ افتح رابط التفعيل المرسل لبريدك ثم تحقق مجدداً.',
            }
      );
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleEmailChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmailInput.trim()) {
      setSecurityMessage({ type: 'error', text: 'يرجى كتابة البريد الإلكتروني الجديد.' });
      return;
    }
    setSecurityLoading(true);
    setSecurityMessage(null);
    try {
      const res = await changeUserEmail(newEmailInput.trim(), emailCurrentPassword);
      setSecurityMessage({ type: res.success ? 'success' : 'error', text: res.message });
      if (res.success) {
        setNewEmailInput('');
        setEmailCurrentPassword('');
        setOpenSection('none');
      }
    } finally {
      setSecurityLoading(false);
    }
  };

  const handlePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPasswordInput || newPasswordInput.length < 6) {
      setSecurityMessage({ type: 'error', text: 'كلمة المرور الجديدة يجب أن تكون 6 خانات على الأقل.' });
      return;
    }
    if (newPasswordInput !== confirmNewPasswordInput) {
      setSecurityMessage({ type: 'error', text: 'كلمتا المرور غير متطابقتين.' });
      return;
    }
    setSecurityLoading(true);
    setSecurityMessage(null);
    try {
      const res = await changeUserPassword(currentPasswordInput, newPasswordInput);
      setSecurityMessage({ type: res.success ? 'success' : 'error', text: res.message });
      if (res.success) {
        setCurrentPasswordInput('');
        setNewPasswordInput('');
        setConfirmNewPasswordInput('');
        setOpenSection('none');
      }
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleResetPasswordByEmail = async () => {
    setSecurityLoading(true);
    setSecurityMessage(null);
    try {
      const res = await sendPasswordReset(user?.email || undefined);
      setSecurityMessage({ type: res.success ? 'success' : 'error', text: res.message });
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleClearCache = async () => {
    if (clearingCache) return;
    setClearingCache(true);
    setCacheMessage(null);
    try {
      const { clientCache } = await import('../utils/clientCache');
      clientCache.clear();
      sessionStorage.clear();
      localStorage.removeItem('animeHistory');
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      const isStaff =
        Boolean(auth.currentUser) &&
        (isStaffEmail(auth.currentUser?.email) ||
          userRole === 'admin' ||
          userRole === 'owner' ||
          userRole === 'moderator');
      if (isStaff && auth.currentUser) {
        const token = await auth.currentUser.getIdToken().catch(() => '');
        if (token) {
          await fetch('/api/cache/clear', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
      }
      setCacheMessage('تم تفريغ الملفات المؤقتة بنجاح.');
    } catch {
      setCacheMessage('تعذر تفريغ بعض البيانات المؤقتة.');
    } finally {
      setClearingCache(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    if (onLogout) onLogout();
    else onBack();
  };

  const hasPasswordProvider = Boolean(user?.providerIds?.includes('password'));

  const handleConfirmDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deletingAccount || !deleteConfirmChecked) return;
    setDeleteError(null);
    if (hasPasswordProvider && !deletePasswordInput.trim()) {
      setDeleteError('يرجى إدخال كلمة المرور الحالية لتأكيد الحذف النهائي.');
      return;
    }

    setDeletingAccount(true);
    try {
      const res = await deleteUserAccount(deletePasswordInput || undefined);
      if (res.success) {
        setShowDeleteModal(false);
        setDeletePasswordInput('');
        setDeleteConfirmChecked(false);
        if (onLogout) onLogout();
        else onBack();
      } else {
        setDeleteError(res.message);
      }
    } finally {
      setDeletingAccount(false);
    }
  };

  const settingsTabs = [
    { id: 'app' as const, label: 'إعدادات التطبيق', icon: SlidersHorizontal },
    { id: 'account' as const, label: 'الحساب والأمان', icon: User },
    { id: 'privacy' as const, label: 'الخصوصية والجلسة', icon: Lock },
  ];

  return (
    <div
      className="min-h-[var(--vv-height,100dvh)] bg-[#07070b] text-white pb-24 font-sans text-right"
      dir="rtl"
    >
      {/* Clean Sticky Header */}
      <header className="sticky top-0 z-40 bg-[#07070b]/90 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onBack}
              className="w-11 h-11 rounded-xl bg-[#111118] hover:bg-[#191923] border border-white/10 flex items-center justify-center text-white transition cursor-pointer shrink-0"
              aria-label="رجوع"
            >
              <ChevronRight size={20} />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-black text-white truncate">الإعدادات</h1>
              <p className="text-xs text-neutral-400 truncate">تنظيم كامل لإعدادات التطبيق والحساب</p>
            </div>
          </div>

          {user && onOpenAppearance && (
            <button
              onClick={onOpenAppearance}
              className="min-h-[42px] px-3.5 rounded-xl bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/30 text-purple-300 text-xs font-black flex items-center gap-1.5 transition shrink-0 cursor-pointer"
            >
              <Paintbrush size={15} />
              <span>تخصيص الملف</span>
            </button>
          )}
        </div>

        {/* Organized Settings Category Tabs */}
        <div className="max-w-5xl mx-auto px-4 pb-3">
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#101016] border border-white/[0.08] rounded-xl">
            {settingsTabs.map((tab) => {
              const Icon = tab.icon;
              const active = settingsTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSettingsTab(tab.id)}
                  className={`min-h-[44px] px-2.5 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    active
                      ? 'bg-[#FF1744] text-white shadow-md'
                      : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon size={14} className="shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-5 space-y-5">
        {/* ==================== TAB 1: APP SETTINGS ==================== */}
        {settingsTab === 'app' && (
          <div className="space-y-5">
            <ThemeModeSelector />

            <DefaultHomeSelector
              onReopenOnboarding={() => {
                reopenOnboarding();
              }}
            />

            {/* Performance & Storage */}
            <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-3.5">
              <div className="flex items-center gap-2 border-b border-white/[0.06] pb-3">
                <Database size={17} className="text-amber-400 shrink-0" />
                <div>
                  <h2 className="text-sm font-black text-white">الأداء والبيانات المؤقتة</h2>
                  <p className="text-[11px] text-neutral-400 mt-0.5">التحكم في استهلاك الإنترنت وتنظيف الملفات المؤقتة</p>
                </div>
              </div>

              {cacheMessage && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 size={15} className="shrink-0" />
                  <span>{cacheMessage}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  const next = !dataSaver;
                  setDataSaver(next);
                  setDataSaverEnabled(next);
                }}
                className="w-full min-h-[60px] flex items-center justify-between gap-3 bg-[#08080c] hover:bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-right transition cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                    <Wifi size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-white">وضع توفير البيانات</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5 leading-snug">
                      ضغط صور صفحات المانجا وتقليل التحميل المسبق والتحديث بالخلفية
                    </div>
                  </div>
                </div>
                <div
                  className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                    dataSaver ? 'bg-emerald-500' : 'bg-neutral-700'
                  }`}
                >
                  <span
                    className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-all ${
                      dataSaver ? 'left-0.5' : 'right-0.5'
                    }`}
                  />
                </div>
              </button>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#08080c] border border-white/[0.06] rounded-xl px-4 py-3">
                <div className="min-w-0">
                  <div className="text-xs font-black text-white">مسح الذاكرة المؤقتة (الكاش)</div>
                  <div className="text-[11px] text-neutral-400 mt-0.5">
                    إزالة البيانات المخزنة مؤقتاً لتحديث القوائم وحل بطء التحميل
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearCache}
                  disabled={clearingCache}
                  className="min-h-[42px] px-4 bg-amber-500/12 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {clearingCache ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  <span>تفريغ الكاش</span>
                </button>
              </div>
            </section>

            {/* Unified Legal & About Card */}
            {onOpenLegal && (
              <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-4 sm:p-5">
                <button
                  type="button"
                  onClick={() => onOpenLegal('about')}
                  className="w-full min-h-[48px] flex items-center justify-between gap-3 text-right cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/12 border border-purple-500/25 flex items-center justify-center text-purple-400 shrink-0">
                      <Info size={18} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-black text-white group-hover:text-purple-300 transition">حول التطبيق والسياسات</h2>
                      <p className="text-[11px] text-neutral-400 mt-0.5 truncate">
                        نبذة عن المنصة، سياسة الخصوصية، اتفاقية الاستخدام، وأمان البيانات
                      </p>
                    </div>
                  </div>
                  <ChevronLeft size={18} className="text-neutral-500 group-hover:text-white transition shrink-0" />
                </button>
              </section>
            )}
          </div>
        )}

        {/* ==================== TAB 2: ACCOUNT & SECURITY ==================== */}
        {settingsTab === 'account' && (
          !user ? (
            <div className="max-w-lg mx-auto bg-[#101016] border border-white/10 rounded-3xl p-6 sm:p-7 text-center space-y-5 shadow-xl">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#FF1744]/12 border border-[#FF1744]/30 flex items-center justify-center text-[#FF1744]">
                <User size={26} />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-base font-black text-white">تسجيل الدخول وإدارة الحساب</h2>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  سجل دخولك لإدارة اسمك ومعرّفك، وتوثيق بريدك الإلكتروني، ومزامنة مكتبتك عبر جميع أجهزتك.
                </p>
              </div>
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={signInWithGoogleAdaptive}
                  className="w-full min-h-[46px] bg-white hover:bg-neutral-100 text-black font-black text-xs rounded-xl cursor-pointer transition flex items-center justify-center gap-2"
                >
                  <span>المتابعة عبر Google</span>
                </button>
                <button
                  type="button"
                  onClick={() => signIn('login')}
                  className="w-full min-h-[46px] bg-[#FF1744] hover:bg-[#e1143c] text-white font-black text-xs rounded-xl cursor-pointer transition"
                >
                  تسجيل الدخول بالبريد وكلمة المرور
                </button>
              </div>
            </div>
          ) : (
            <div
              className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start"
              style={display.isBookPosture ? { gap: 'var(--fold-hinge-gap, 24px)' } : undefined}
            >
              {/* Account Connection & Appearance Shortcut Banner */}
              <section className="lg:col-span-2 bg-[#101016] border border-white/[0.08] rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                      isCloudAccount
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                    }`}
                  >
                    {isCloudAccount ? <Cloud size={20} /> : <HardDrive size={20} />}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-black text-white truncate">
                      {isCloudAccount ? 'حساب سحابي متزامن' : 'حساب محلي مؤقت'}
                    </h2>
                    <p className="text-xs text-neutral-400 truncate mt-0.5">
                      {isCloudAccount
                        ? 'مكتبتك وإنجازاتك محفوظة تلقائياً في السحابة.'
                        : 'اربط حسابك بجوجل لحفظ تقدمك عند تغيير الجهاز.'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isCloudAccount && (
                    <button
                      type="button"
                      onClick={signInWithGoogleAdaptive}
                      className="min-h-[42px] px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black shrink-0 cursor-pointer transition"
                    >
                      ربط بحساب Google
                    </button>
                  )}
                  {onOpenAppearance && (
                    <button
                      type="button"
                      onClick={onOpenAppearance}
                      className="min-h-[42px] px-3.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-bold text-neutral-200 flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <Paintbrush size={14} className="text-pink-400" />
                      <span>تخصيص الصورة والغلاف</span>
                    </button>
                  )}
                </div>
              </section>

              {/* Global Security Feedback */}
              {securityMessage && (
                <div
                  className={`lg:col-span-2 p-3.5 rounded-2xl border text-xs font-bold flex items-start gap-2.5 leading-relaxed ${
                    securityMessage.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}
                >
                  {securityMessage.type === 'success' ? (
                    <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  )}
                  <span>{securityMessage.text}</span>
                </div>
              )}

              {/* Identity Form */}
              <form
                onSubmit={handleUpdateIdentity}
                className="bg-[#101016] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-4"
              >
                <div className="flex items-center gap-2 border-b border-white/[0.06] pb-3">
                  <User size={17} className="text-purple-400 shrink-0" />
                  <h2 className="text-sm font-black text-white">بيانات الهوية</h2>
                </div>

                {identityMsg && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                      identityMsg.type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-red-500/10 border-red-500/30 text-red-300'
                    }`}
                  >
                    {identityMsg.type === 'success' ? (
                      <CheckCircle2 size={16} className="shrink-0" />
                    ) : (
                      <AlertCircle size={16} className="shrink-0" />
                    )}
                    <span>{identityMsg.text}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-300 block">الاسم المعروض</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="اكتب اسمك..."
                    className="w-full min-h-[44px] bg-[#08080c] border border-white/10 focus:border-purple-500 rounded-xl px-3.5 text-sm text-white outline-none transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-300 block">مُعرّف الحساب (@Username)</label>
                  <div className="flex items-center min-h-[44px] bg-[#08080c] border border-white/10 focus-within:border-purple-500 rounded-xl overflow-hidden transition">
                    <span className="px-3.5 text-neutral-400 font-mono text-sm bg-white/[0.03] h-full flex items-center border-l border-white/[0.06]">
                      @
                    </span>
                    <input
                      type="text"
                      dir="ltr"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                      placeholder="otaku_user"
                      className="flex-1 bg-transparent px-3.5 text-sm text-white font-mono outline-none text-left"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={identityBusy}
                  className="w-full min-h-[44px] bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-black rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {identityBusy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  <span>حفظ الاسم والمُعرّف</span>
                </button>
              </form>

              {/* Email & Password Security */}
              <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
                  <div className="flex items-center gap-2">
                    <Mail size={17} className="text-sky-400 shrink-0" />
                    <h2 className="text-sm font-black text-white">البريد الإلكتروني وكلمة المرور</h2>
                  </div>
                  {user.emailVerified ? (
                    <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-400">
                      <CheckCircle2 size={14} /> موثق
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-black text-amber-400">
                      <AlertCircle size={14} /> غير مؤكد
                    </span>
                  )}
                </div>

                <div className="bg-[#08080c] border border-white/[0.06] rounded-xl px-3.5 py-3 flex items-center justify-between gap-2">
                  <span className="text-xs text-neutral-400 font-bold shrink-0">البريد الحالي</span>
                  <span className="text-xs sm:text-sm font-mono font-bold text-white truncate select-all" dir="ltr">
                    {user.email || 'غير مرتبط ببريد'}
                  </span>
                </div>

                {!user.emailVerified && user.email && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={securityLoading}
                      onClick={handleSendVerification}
                      className="min-h-[44px] bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-black rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {securityLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                      <span>إرسال رابط التأكيد</span>
                    </button>
                    <button
                      type="button"
                      disabled={securityLoading}
                      onClick={handleCheckVerification}
                      className="min-h-[44px] bg-[#181822] hover:bg-[#222230] border border-white/10 disabled:opacity-50 text-emerald-400 text-xs font-black rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <CheckCircle2 size={15} />
                      <span>تحقق من التفعيل</span>
                    </button>
                  </div>
                )}

                <div className="border-t border-white/[0.06] pt-3 space-y-3">
                  <button
                    type="button"
                    onClick={() => setOpenSection(openSection === 'email' ? 'none' : 'email')}
                    className="w-full min-h-[44px] flex items-center justify-between px-3 rounded-xl bg-[#08080c] hover:bg-white/[0.04] border border-white/[0.06] text-xs font-black text-neutral-200 transition cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Edit2 size={14} className="text-purple-400" />
                      <span>تغيير البريد الإلكتروني</span>
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-neutral-400 transition-transform ${openSection === 'email' ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {openSection === 'email' && (
                    <form onSubmit={handleEmailChangeSubmit} className="space-y-3 pt-1">
                      <input
                        type="email"
                        required
                        dir="ltr"
                        value={newEmailInput}
                        onChange={(e) => setNewEmailInput(e.target.value)}
                        placeholder="new-email@example.com"
                        className="w-full min-h-[44px] bg-[#08080c] border border-white/10 focus:border-purple-500 rounded-xl px-3.5 text-sm text-white font-mono outline-none text-left"
                      />
                      <div className="relative">
                        <input
                          type={showPassFields ? 'text' : 'password'}
                          dir="ltr"
                          value={emailCurrentPassword}
                          onChange={(e) => setEmailCurrentPassword(e.target.value)}
                          placeholder="كلمة المرور الحالية"
                          className="w-full min-h-[44px] bg-[#08080c] border border-white/10 focus:border-purple-500 rounded-xl px-3.5 pl-11 text-sm text-white outline-none text-right"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassFields(!showPassFields)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1 cursor-pointer"
                        >
                          {showPassFields ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <button
                        type="submit"
                        disabled={securityLoading}
                        className="w-full min-h-[44px] bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-black rounded-xl transition cursor-pointer"
                      >
                        {securityLoading ? 'جاري الحفظ...' : 'تأكيد تغيير البريد'}
                      </button>
                    </form>
                  )}

                  <button
                    type="button"
                    onClick={() => setOpenSection(openSection === 'password' ? 'none' : 'password')}
                    className="w-full min-h-[44px] flex items-center justify-between px-3 rounded-xl bg-[#08080c] hover:bg-white/[0.04] border border-white/[0.06] text-xs font-black text-neutral-200 transition cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <KeyRound size={14} className="text-[#FF1744]" />
                      <span>تغيير كلمة المرور</span>
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-neutral-400 transition-transform ${openSection === 'password' ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {openSection === 'password' && (
                    <form onSubmit={handlePasswordChangeSubmit} className="space-y-3 pt-1">
                      <div className="relative">
                        <input
                          type={showPassFields ? 'text' : 'password'}
                          dir="ltr"
                          value={currentPasswordInput}
                          onChange={(e) => setCurrentPasswordInput(e.target.value)}
                          placeholder="كلمة المرور الحالية"
                          className="w-full min-h-[44px] bg-[#08080c] border border-white/10 focus:border-[#FF1744] rounded-xl px-3.5 pl-11 text-sm text-white outline-none text-right"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassFields(!showPassFields)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1 cursor-pointer"
                        >
                          {showPassFields ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <input
                          type={showPassFields ? 'text' : 'password'}
                          required
                          dir="ltr"
                          value={newPasswordInput}
                          onChange={(e) => setNewPasswordInput(e.target.value)}
                          placeholder="كلمة المرور الجديدة"
                          className="w-full min-h-[44px] bg-[#08080c] border border-white/10 focus:border-[#FF1744] rounded-xl px-3.5 text-sm text-white outline-none text-right"
                        />
                        <input
                          type={showPassFields ? 'text' : 'password'}
                          required
                          dir="ltr"
                          value={confirmNewPasswordInput}
                          onChange={(e) => setConfirmNewPasswordInput(e.target.value)}
                          placeholder="تأكيد كلمة المرور"
                          className="w-full min-h-[44px] bg-[#08080c] border border-white/10 focus:border-[#FF1744] rounded-xl px-3.5 text-sm text-white outline-none text-right"
                        />
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          type="submit"
                          disabled={securityLoading}
                          className="flex-1 min-h-[44px] bg-[#FF1744] hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-black rounded-xl transition cursor-pointer"
                        >
                          {securityLoading ? 'جاري التغيير...' : 'حفظ كلمة المرور الجديدة'}
                        </button>
                        <button
                          type="button"
                          disabled={securityLoading}
                          onClick={handleResetPasswordByEmail}
                          className="min-h-[44px] px-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-sky-400 text-xs font-bold transition cursor-pointer"
                        >
                          إرسال رابط استعادة
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </section>
            </div>
          )
        )}

        {/* ==================== TAB 3: PRIVACY & SESSION ==================== */}
        {settingsTab === 'privacy' && (
          !user ? (
            <div className="max-w-lg mx-auto bg-[#101016] border border-white/10 rounded-3xl p-6 text-center space-y-4">
              <ShieldCheck size={30} className="mx-auto text-emerald-400" />
              <div className="space-y-1">
                <h2 className="text-base font-black text-white">الخصوصية والجلسة</h2>
                <p className="text-xs text-neutral-400">سجل دخولك للتحكم في ظهور ملفك الشخصي وإحصائياتك للآخرين.</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => signIn('login')}
                  className="min-h-[44px] px-5 bg-[#FF1744] hover:bg-[#e1143c] text-white text-xs font-black rounded-xl cursor-pointer transition"
                >
                  تسجيل الدخول
                </button>
                {onOpenLegal && (
                  <button
                    type="button"
                    onClick={() => onOpenLegal('privacy')}
                    className="min-h-[44px] px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-emerald-400 text-xs font-bold rounded-xl cursor-pointer transition"
                  >
                    سياسة الخصوصية
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div
              className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start"
              style={display.isBookPosture ? { gap: 'var(--fold-hinge-gap, 24px)' } : undefined}
            >
              {/* Privacy Toggles */}
              <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center gap-2 border-b border-white/[0.06] pb-3">
                  <ShieldCheck size={17} className="text-sky-400 shrink-0" />
                  <div>
                    <h2 className="text-sm font-black text-white">ظهور البيانات والملف</h2>
                    <p className="text-[11px] text-neutral-400 mt-0.5">تحكم فيما يراه الآخرون عند زيارة حسابك</p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {[
                    {
                      field: 'showStats' as const,
                      title: 'إحصائيات المكتبة',
                      desc: 'السماح للآخرين برؤية أعداد قوائمك وتصنيفاتك المفضلة',
                    },
                    {
                      field: 'showHistory' as const,
                      title: 'المستوى والكوينز',
                      desc: 'عرض مستواك ورصيد الكوينز والحماس على صفحتك للعامة',
                    },
                    {
                      field: 'showStore' as const,
                      title: 'المقتنيات والمظهر',
                      desc: 'إظهار الإطارات والألقاب والهالات المجهزة للآخرين',
                    },
                  ].map((item) => {
                    const enabled = privacySettings[item.field] !== false;
                    return (
                      <button
                        key={item.field}
                        type="button"
                        onClick={() => handleTogglePrivacy(item.field)}
                        className="w-full min-h-[60px] flex items-center justify-between gap-3 bg-[#08080c] hover:bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-right transition cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-black text-white">{item.title}</div>
                          <div className="text-[11px] text-neutral-400 mt-0.5 leading-snug">{item.desc}</div>
                        </div>
                        <div
                          className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                            enabled ? 'bg-emerald-500' : 'bg-neutral-700'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-all ${
                              enabled ? 'left-0.5' : 'right-0.5'
                            }`}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Session & Danger Zone */}
              <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-white/[0.06] pb-3">
                  <LogOut size={17} className="text-rose-400 shrink-0" />
                  <div>
                    <h2 className="text-sm font-black text-white">الجلسة وإغلاق الحساب</h2>
                    <p className="text-[11px] text-neutral-400 mt-0.5">تسجيل الخروج من هذا الجهاز أو حذف الحساب</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full min-h-[46px] bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-100 rounded-xl px-4 text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <LogOut size={15} />
                  <span>تسجيل الخروج من الحساب</span>
                </button>

                <div className="pt-3 border-t border-red-500/20 space-y-2.5">
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    يمكنك حذف حسابك وجميع قوائمك وبياناتك الشخصية المخزنة سحابياً نهائياً في أي وقت.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setDeletePasswordInput('');
                      setDeleteConfirmChecked(false);
                      setShowDeleteModal(true);
                    }}
                    className="w-full min-h-[46px] bg-red-600/15 hover:bg-red-600/25 border border-red-500/35 text-red-400 rounded-xl px-4 text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer"
                    id="btn_open_delete_account_modal"
                  >
                    <Trash2 size={15} />
                    <span>حذف الحساب والبيانات نهائياً</span>
                  </button>
                </div>
              </section>
            </div>
          )
        )}
      </main>

      {/* Permanent Account Deletion Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
          dir="rtl"
        >
          <form
            onSubmit={handleConfirmDeleteAccount}
            className="relative w-full max-w-md bg-[#0f0f15] border border-red-500/30 rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl text-right"
          >
            <button
              type="button"
              onClick={() => !deletingAccount && setShowDeleteModal(false)}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white flex items-center justify-center absolute top-4 left-4 cursor-pointer"
              aria-label="إغلاق"
            >
              <X size={15} />
            </button>

            <div className="flex items-center gap-2.5 text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">تأكيد حذف الحساب نهائياً</h3>
                <p className="text-[11px] text-neutral-400">هذا الإجراء دائم ولا يمكن التراجع عنه</p>
              </div>
            </div>

            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-200 leading-relaxed space-y-1">
              <p className="font-black">سيتم مسح البيانات التالية فوراً:</p>
              <ul className="list-disc pr-5 text-[11px] text-red-200/90 space-y-0.5">
                <li>سجل الدخول والبريد الإلكتروني المرتبط بالحساب</li>
                <li>قوائم الأنمي والمانجا، المفضلات، التنبيهات، والمقتنيات</li>
                <li>الاسم المعروض وحجز المعرّف (@Username)</li>
              </ul>
            </div>

            {hasPasswordProvider && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-300 block">
                  كلمة المرور الحالية للتأكيد
                </label>
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={deletePasswordInput}
                  onChange={(e) => setDeletePasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[44px] bg-[#07070b] border border-white/10 focus:border-red-500 rounded-xl px-3.5 text-sm text-white outline-none text-left"
                />
              </div>
            )}

            <label className="flex items-start gap-2.5 bg-[#07070b] border border-white/10 rounded-xl p-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={deleteConfirmChecked}
                onChange={(e) => setDeleteConfirmChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-red-600 shrink-0"
              />
              <span className="text-xs font-bold text-neutral-300 leading-snug">
                أدرك أن جميع بياناتي وقوائمي ستُحذف نهائياً ولا يمكن استعادتها لاحقاً.
              </span>
            </label>

            {deleteError && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs font-bold text-red-300">
                {deleteError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={deletingAccount}
                onClick={() => setShowDeleteModal(false)}
                className="min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-neutral-200 text-xs font-black transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={deletingAccount || !deleteConfirmChecked}
                className="min-h-[44px] rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-45 text-white text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {deletingAccount ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                <span>{deletingAccount ? 'جاري الحذف...' : 'حذف نهائي'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
