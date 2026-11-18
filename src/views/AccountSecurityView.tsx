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
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { isStaffEmail } from '../services/moderationService';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';
import ThemeModeSelector from '../components/ThemeModeSelector';

interface AccountSecurityViewProps {
  onBack: () => void;
  onOpenAppearance?: () => void;
  onLogout?: () => void;
}

export default function AccountSecurityView({
  onBack,
  onOpenAppearance,
  onLogout,
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
  } = useAuth();
  const display = useDeviceDisplay();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [identityBusy, setIdentityBusy] = useState(false);
  const [identityMsg, setIdentityMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityMessage, setSecurityMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [openSection, setOpenSection] = useState<'none' | 'email' | 'password'>('none');
  const [newEmailInput, setNewEmailInput] = useState('');
  const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState('');
  const [showPassFields, setShowPassFields] = useState(false);

  const [clearingCache, setClearingCache] = useState(false);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);

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

  if (!user) {
    return (
      <div
        className="min-h-[var(--vv-height,100dvh)] bg-[#07070b] text-white pb-24 font-sans text-right"
        dir="rtl"
      >
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
                <p className="text-xs text-neutral-400 truncate">مظهر التطبيق وإعدادات الحساب</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 pt-5 space-y-5">
          <ThemeModeSelector />

          <div className="max-w-md mx-auto bg-[#101016] border border-white/10 rounded-3xl p-6 text-center space-y-4 shadow-xl">
            <Lock size={30} className="mx-auto text-neutral-500" />
            <div className="space-y-1">
              <h2 className="text-base font-black text-white">إعدادات الحساب والأمان</h2>
              <p className="text-xs text-neutral-400">سجل دخولك لإدارة الهوية، الأمان، ومزامنة مكتبتك.</p>
            </div>
            <div className="space-y-2.5 pt-1">
              <button
                onClick={signInWithGoogleAdaptive}
                className="w-full min-h-[44px] bg-white text-black font-black text-xs rounded-xl cursor-pointer hover:bg-neutral-200 transition border border-white/15"
              >
                تسجيل الدخول عبر Google
              </button>
              <button
                onClick={() => signIn('login')}
                className="w-full min-h-[44px] bg-[#181822] border border-white/10 text-white font-bold text-xs rounded-xl cursor-pointer hover:bg-[#20202d] transition"
              >
                الدخول بالبريد وكلمة المرور
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

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
              <p className="text-xs text-neutral-400 truncate">المظهر، الهوية، الأمان، والخصوصية</p>
            </div>
          </div>

          {onOpenAppearance && (
            <button
              onClick={onOpenAppearance}
              className="min-h-[42px] px-3.5 rounded-xl bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/30 text-purple-300 text-xs font-black flex items-center gap-1.5 transition shrink-0 cursor-pointer"
            >
              <Paintbrush size={15} />
              <span>تخصيص الملف</span>
            </button>
          )}
        </div>
      </header>

      <main
        className="max-w-5xl mx-auto px-4 pt-5 grid grid-cols-1 lg:grid-cols-2 gap-5 items-start"
        style={display.isBookPosture ? { gap: 'var(--fold-hinge-gap, 24px)' } : undefined}
      >
        {/* Global App Theme Mode Selector (Light / Dark / AMOLED / Auto) */}
        <div className="lg:col-span-2">
          <ThemeModeSelector />
        </div>

        {/* Account Connection Banner */}
        <section className="lg:col-span-2 bg-[#101016] border border-white/[0.08] rounded-2xl p-4 flex items-center justify-between gap-3">
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
                {isCloudAccount ? 'حساب سحابي محفوظ' : 'حساب محلي مؤقت'}
              </h2>
              <p className="text-xs text-neutral-400 truncate mt-0.5">
                {isCloudAccount
                  ? 'مكتبتك وإنجازاتك محفوظة تلقائياً في السحابة.'
                  : 'اربط حسابك بجوجل لحفظ تقدمك عند تغيير الجهاز.'}
              </p>
            </div>
          </div>
          {!isCloudAccount && (
            <button
              onClick={signInWithGoogleAdaptive}
              className="min-h-[40px] px-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black shrink-0 cursor-pointer transition"
            >
              ربط الآن
            </button>
          )}
        </section>

        {/* Section 1: Display Name & @Username */}
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

        {/* Section 2: Email & Verification */}
        <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <Mail size={17} className="text-sky-400 shrink-0" />
              <h2 className="text-sm font-black text-white">البريد الإلكتروني وتوثيق الحساب</h2>
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

          {/* Collapsible Change Email */}
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

            {/* Collapsible Change Password */}
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

        {/* Section 3: Privacy Toggles */}
        <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-white/[0.06] pb-3">
            <ShieldCheck size={17} className="text-sky-400 shrink-0" />
            <h2 className="text-sm font-black text-white">الخصوصية</h2>
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
                  className="w-full min-h-[56px] flex items-center justify-between gap-3 bg-[#08080c] hover:bg-white/[0.03] border border-white/[0.06] rounded-xl px-3.5 py-2.5 text-right transition cursor-pointer"
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

        {/* Section 4: Data & Session */}
        <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-3">
          <h2 className="text-sm font-black text-white border-b border-white/[0.06] pb-3">البيانات والجلسة</h2>

          {cacheMessage && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 size={15} className="shrink-0" />
              <span>{cacheMessage}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleClearCache}
            disabled={clearingCache}
            className="w-full min-h-[44px] bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-amber-300 rounded-xl px-4 text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            {clearingCache ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            <span>تفريغ البيانات المؤقتة (الكاش)</span>
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full min-h-[44px] bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 rounded-xl px-4 text-xs font-black flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <LogOut size={15} />
            <span>تسجيل الخروج من الحساب</span>
          </button>
        </section>
      </main>
    </div>
  );
}
