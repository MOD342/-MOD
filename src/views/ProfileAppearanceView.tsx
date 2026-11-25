import React, { useMemo, useState } from 'react';
import {
  ChevronRight,
  Paintbrush,
  LayoutGrid,
  Image as ImageIcon,
  ShieldCheck,
  Trophy,
  Award,
  MessageSquare,
  CheckCircle2,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import {
  STORE_ITEMS_SORTED,
  getAvatarShapeClass,
  getAvatarSizeClass,
  isBadgeUnlocked,
  isTitleUnlocked,
} from '../data/storeItems';

interface ProfileAppearanceViewProps {
  onBack: () => void;
  onNavigateToStore?: () => void;
}

export default function ProfileAppearanceView({
  onBack,
  onNavigateToStore,
}: ProfileAppearanceViewProps) {
  const { user, userData } = useAuth();
  const [activeTab, setActiveTab] = useState<'layout' | 'avatar' | 'badges' | 'cards'>('layout');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const equipped = useMemo(() => {
    return {
      banner: STORE_ITEMS_SORTED.find((i) => i.id === userData?.equippedBanner),
      avatar: STORE_ITEMS_SORTED.find((i) => i.id === userData?.equippedAvatar),
      frame: STORE_ITEMS_SORTED.find((i) => i.id === userData?.equippedFrame),
      aura: STORE_ITEMS_SORTED.find((i) => i.id === userData?.equippedAura),
      commentCard: STORE_ITEMS_SORTED.find((i) => i.id === userData?.equippedCommentCard),
      title: STORE_ITEMS_SORTED.find((i) => i.id === userData?.equippedTitle),
      badge: STORE_ITEMS_SORTED.find((i) => i.id === userData?.equippedBadge),
    };
  }, [userData]);

  const ownedItems = useMemo(() => {
    const purchasedIds: string[] = Array.isArray(userData?.purchasedItems)
      ? userData.purchasedItems
      : [];
    return STORE_ITEMS_SORTED.filter((i) => purchasedIds.includes(i.id));
  }, [userData?.purchasedItems]);

  const unlockedTitles = useMemo(
    () => STORE_ITEMS_SORTED.filter((i) => i.type === 'title' && isTitleUnlocked(i, userData)),
    [userData]
  );

  const unlockedBadges = useMemo(
    () => STORE_ITEMS_SORTED.filter((i) => i.type === 'badge' && isBadgeUnlocked(i.id, userData)),
    [userData]
  );

  const ownedAvatars = ownedItems.filter((i) => i.type === 'avatar');
  const ownedFrames = ownedItems.filter((i) => i.type === 'frame');
  const ownedAuras = ownedItems.filter((i) => i.type === 'aura');
  const ownedBanners = ownedItems.filter((i) => i.type === 'banner');
  const ownedCommentCards = ownedItems.filter((i) => i.type === 'comment_card');

  const avatarAlignment = userData?.avatarAlignment || 'right';
  const bannerSize = userData?.bannerSize || 'normal';
  const avatarSize = userData?.avatarSize || 'normal';
  const avatarShape = userData?.avatarShape || equipped.frame?.avatarShape || 'circle';
  const avatarShapeClass = getAvatarShapeClass(avatarShape);
  const avatarSizePreviewClass = getAvatarSizeClass(avatarSize, 'preview');

  const bannerHeightPreview =
    bannerSize === 'compact' ? 'h-20' : bannerSize === 'cinematic' ? 'h-32' : 'h-24';
  const previewMarginTopClass =
    avatarSize === 'xlarge' ? '-mt-14' : avatarSize === 'large' ? '-mt-12' : avatarSize === 'compact' ? '-mt-8' : '-mt-10';

  const avatarImg =
    equipped.avatar?.img ||
    user?.photoURL ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id || 'Felix'}`;

  const updateField = async (payload: Record<string, any>, tag: string) => {
    if (!user) return;
    setSavingKey(tag);
    try {
      await updateDoc(doc(db, 'users', user.id), payload);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingKey(null);
    }
  };

  const tabs = [
    { id: 'layout' as const, label: 'التخطيط والغلاف', icon: LayoutGrid },
    { id: 'avatar' as const, label: 'الصورة والإطار والهالة', icon: ImageIcon },
    { id: 'badges' as const, label: 'الألقاب والأوسمة', icon: Trophy },
    { id: 'cards' as const, label: 'بطاقات التعليق', icon: MessageSquare },
  ];

  return (
    <div
      className="min-h-[var(--vv-height,100dvh)] bg-[#07070b] text-white pb-24 font-sans text-right"
      dir="rtl"
    >
      {/* Header */}
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
              <h1 className="text-base sm:text-lg font-black text-white flex items-center gap-2 truncate">
                <Paintbrush size={17} className="text-pink-400 shrink-0" />
                <span>تخصيص الهوية والمظهر</span>
              </h1>
              <p className="text-xs text-neutral-400 truncate">عاين التغييرات مباشرة على بطاقتك</p>
            </div>
          </div>

          {onNavigateToStore && (
            <button
              onClick={onNavigateToStore}
              className="min-h-[42px] px-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-black flex items-center gap-1.5 transition shrink-0 cursor-pointer"
            >
              <ShoppingBag size={15} />
              <span>المتجر</span>
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-5 space-y-5">
        {/* Live Interactive Preview Card */}
        <section className="theme-keep-dark rounded-2xl overflow-hidden border border-white/10 bg-[#0d0d13] shadow-2xl">
          <div className={`relative ${bannerHeightPreview} w-full bg-[#060609] transition-all duration-300 overflow-hidden`}>
            {equipped.banner?.img ? (
              <img
                src={equipped.banner.img}
                alt="غلاف الحساب"
                className={`w-full h-full object-cover ${equipped.banner.imageStyle || ''}`}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-tr from-[#090910] via-[#1c1030]/60 to-[#090910]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d13] via-black/30 to-transparent" />
            {savingKey && (
              <span className="absolute top-2.5 left-2.5 bg-black/75 border border-white/10 text-emerald-300 text-[11px] font-bold px-2.5 py-1 rounded-lg">
                تم الحفظ
              </span>
            )}
          </div>

          <div
            className={`px-4 pb-4 ${previewMarginTopClass} relative z-10 flex flex-col transition-all duration-300 ${
              avatarAlignment === 'center'
                ? 'items-center text-center'
                : avatarAlignment === 'left'
                ? 'items-end text-left'
                : 'items-start text-right'
            }`}
          >
            <div className="relative mb-2">
              {equipped.aura && (
                <div
                  className={`absolute -inset-2 ${avatarShapeClass} pointer-events-none opacity-90 ${equipped.aura.auraStyle || ''} bg-gradient-to-tr ${equipped.aura.auraGradient || 'from-purple-500/40 to-amber-500/40'} blur-[4px]`}
                />
              )}
              <div className={`${avatarSizePreviewClass} ${avatarShapeClass} border-4 border-[#0d0d13] bg-black overflow-hidden relative z-10 transition-all duration-300`}>
                <img
                  src={avatarImg}
                  alt=""
                  referrerPolicy="no-referrer"
                  className={`w-full h-full object-cover ${equipped.avatar?.imageStyle || ''}`}
                />
              </div>
              {equipped.frame?.frameStyle && (
                <div
                  className={`absolute inset-[-4px] pointer-events-none z-20 ${equipped.frame.frameStyle} ${avatarShapeClass}`}
                />
              )}
            </div>

            <div className="space-y-1">
              <div
                className={`flex items-center gap-1.5 flex-wrap ${
                  avatarAlignment === 'center'
                    ? 'justify-center'
                    : avatarAlignment === 'left'
                    ? 'justify-end'
                    : 'justify-start'
                }`}
              >
                <span className={`text-sm font-black ${equipped.title ? equipped.title.color : 'text-white'}`}>
                  {userData?.displayName || user?.displayName || 'أوتاكو'}
                </span>
                {equipped.title && (
                  <span className="text-[11px] font-bold text-neutral-300">· {equipped.title.name}</span>
                )}
                {equipped.badge?.icon &&
                  React.createElement(equipped.badge.icon, {
                    size: 13,
                    className: equipped.badge.color || 'text-amber-400',
                  })}
              </div>

              {activeTab === 'cards' && (
                <div
                  className={`mt-2 p-2.5 rounded-xl border text-xs text-neutral-200 max-w-sm ${
                    equipped.commentCard?.commentCardStyle || 'bg-black/60 border-white/10'
                  }`}
                >
                  <span className="text-[11px] text-neutral-400 block mb-0.5">معاينة بطاقة التعليق:</span>
                  أفضل حلقة هذا الموسم بدون منازع!
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Sub-Navigation Tabs */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
          {tabs.map((tab) => {
            const IconComp = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[42px] px-3.5 rounded-xl text-xs font-black flex items-center gap-1.5 whitespace-nowrap shrink-0 border transition cursor-pointer ${
                  active
                    ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                    : 'bg-[#101016] text-neutral-400 hover:text-white border-white/[0.08]'
                }`}
              >
                <IconComp size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Layout & Covers */}
        {activeTab === 'layout' && (
          <div className="space-y-4">
            <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-4 sm:p-5 space-y-5">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <h2 className="text-sm font-black text-white">تخصيص الصورة الشخصية والغلاف</h2>
                <span className="text-[11px] font-bold text-neutral-400">تطبيق فوري على الملف</span>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-300 block">حجم الصورة الشخصية</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'compact', label: 'مدمج' },
                    { id: 'normal', label: 'قياسي' },
                    { id: 'large', label: 'كبير' },
                    { id: 'xlarge', label: 'كبير جداً' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateField({ avatarSize: opt.id }, 'avatarSize')}
                      className={`min-h-[44px] rounded-xl border text-xs font-black transition cursor-pointer ${
                        avatarSize === opt.id
                          ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                          : 'bg-[#08080c] border-white/[0.08] text-neutral-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-300 block">شكل الصورة الشخصية</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { id: 'circle', label: 'دائرة', previewClass: 'rounded-full' },
                    { id: 'squircle', label: 'مربع دائري', previewClass: 'rounded-[26%]' },
                  ].map((opt) => {
                    const isSelected = avatarShape === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateField({ avatarShape: opt.id }, 'avatarShape')}
                        className={`min-h-[48px] px-3.5 rounded-xl border text-xs font-black flex items-center justify-center gap-2.5 transition cursor-pointer ${
                          isSelected
                            ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                            : 'bg-[#08080c] border-white/[0.08] text-neutral-400 hover:text-white'
                        }`}
                      >
                        <span
                          className={`w-5 h-5 border-2 shrink-0 ${opt.previewClass} ${
                            isSelected ? 'border-purple-300 bg-purple-500/30' : 'border-neutral-500 bg-white/5'
                          }`}
                        />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-300 block">موقع الصورة الشخصية</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'right', label: 'اليمين' },
                    { id: 'center', label: 'المنتصف' },
                    { id: 'left', label: 'اليسار' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateField({ avatarAlignment: opt.id }, 'avatarAlignment')}
                      className={`min-h-[44px] rounded-xl border text-xs font-black transition cursor-pointer ${
                        avatarAlignment === opt.id
                          ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                          : 'bg-[#08080c] border-white/[0.08] text-neutral-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-300 block">ارتفاع الغلاف</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'compact', label: 'مدمج' },
                    { id: 'normal', label: 'قياسي' },
                    { id: 'cinematic', label: 'سينمائي' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateField({ bannerSize: opt.id }, 'bannerSize')}
                      className={`min-h-[44px] rounded-xl border text-xs font-black transition cursor-pointer ${
                        bannerSize === opt.id
                          ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                          : 'bg-[#08080c] border-white/[0.08] text-neutral-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-white">أغلفة الخلفية ({ownedBanners.length})</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <button
                  onClick={() => updateField({ equippedBanner: null }, 'equippedBanner')}
                  className={`h-20 rounded-xl border text-xs font-black flex items-center justify-center cursor-pointer transition ${
                    !userData?.equippedBanner
                      ? 'border-purple-500 bg-purple-600/15 text-purple-300'
                      : 'border-white/[0.08] bg-[#08080c] text-neutral-400 hover:text-white'
                  }`}
                >
                  الغلاف الأساسي
                </button>
                {ownedBanners.map((item) => {
                  const active = userData?.equippedBanner === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => updateField({ equippedBanner: item.id }, 'equippedBanner')}
                      className={`h-20 rounded-xl overflow-hidden border relative cursor-pointer transition ${
                        active ? 'border-purple-500 ring-2 ring-purple-500/30' : 'border-white/[0.08]'
                      }`}
                    >
                      <img src={item.img} alt={item.name} className={`w-full h-full object-cover ${item.imageStyle || ''}`} />
                      <div className="absolute inset-x-0 bottom-0 bg-black/75 px-2 py-1 text-[11px] font-bold text-white truncate">
                        {item.name}
                      </div>
                      {active && <CheckCircle2 size={16} className="absolute top-1.5 left-1.5 text-purple-400 drop-shadow" />}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* Tab 2: Avatars, Frames, Auras */}
        {activeTab === 'avatar' && (
          <div className="space-y-4">
            {/* Avatars */}
            <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-4 space-y-3">
              <h2 className="text-sm font-black text-white">الصور الرمزية ({ownedAvatars.length})</h2>
              <div className="flex gap-2.5 overflow-x-auto pb-1 hide-scrollbar snap-x snap-mandatory">
                <button
                  onClick={() => updateField({ equippedAvatar: null }, 'equippedAvatar')}
                  className={`snap-start shrink-0 w-16 h-16 rounded-xl border text-[11px] font-black flex items-center justify-center text-center px-1 cursor-pointer transition ${
                    !userData?.equippedAvatar
                      ? 'border-pink-500 bg-pink-500/15 text-pink-300'
                      : 'border-white/[0.08] bg-[#08080c] text-neutral-400'
                  }`}
                >
                  الافتراضية
                </button>
                {ownedAvatars.map((item) => {
                  const active = userData?.equippedAvatar === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => updateField({ equippedAvatar: item.id }, 'equippedAvatar')}
                      className={`snap-start shrink-0 w-16 h-16 rounded-xl overflow-hidden border relative cursor-pointer transition ${
                        active ? 'border-pink-500 ring-2 ring-pink-500/30' : 'border-white/[0.08]'
                      }`}
                    >
                      <img src={item.img} alt={item.name} className={`w-full h-full object-cover ${item.imageStyle || ''}`} />
                      {active && (
                        <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                          <CheckCircle2 size={18} className="text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Frames */}
            <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-4 space-y-3">
              <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                <ShieldCheck size={16} className="text-amber-400" />
                <span>الإطارات ({ownedFrames.length})</span>
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                <button
                  onClick={() => updateField({ equippedFrame: null }, 'equippedFrame')}
                  className={`min-h-[68px] p-2 rounded-xl border text-xs font-black cursor-pointer transition ${
                    !userData?.equippedFrame
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                      : 'border-white/[0.08] bg-[#08080c] text-neutral-400'
                  }`}
                >
                  بدون إطار
                </button>
                {ownedFrames.map((item) => {
                  const active = userData?.equippedFrame === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => updateField({ equippedFrame: item.id }, 'equippedFrame')}
                      className={`min-h-[68px] p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 cursor-pointer transition ${
                        active
                          ? 'border-amber-500 bg-amber-500/15 text-white'
                          : 'border-white/[0.08] bg-[#08080c] text-neutral-300'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full ${item.frameStyle}`} />
                      <span className="text-[11px] font-bold truncate max-w-full">{item.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Auras */}
            <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-4 space-y-3">
              <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                <Sparkles size={16} className="text-purple-400" />
                <span>الهالات المضيئة ({ownedAuras.length})</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <button
                  onClick={() => updateField({ equippedAura: null }, 'equippedAura')}
                  className={`min-h-[54px] p-2.5 rounded-xl border text-xs font-black cursor-pointer transition ${
                    !userData?.equippedAura
                      ? 'border-purple-500 bg-purple-500/15 text-purple-300'
                      : 'border-white/[0.08] bg-[#08080c] text-neutral-400'
                  }`}
                >
                  الافتراضية
                </button>
                {ownedAuras.map((item) => {
                  const active = userData?.equippedAura === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => updateField({ equippedAura: item.id }, 'equippedAura')}
                      className={`min-h-[54px] p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition ${
                        active
                          ? 'border-purple-500 bg-purple-500/15 text-white'
                          : 'border-white/[0.08] bg-[#08080c] text-neutral-300'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full shrink-0 bg-gradient-to-tr ${
                          item.auraGradient || 'from-purple-500 to-amber-500'
                        }`}
                      />
                      <span className="text-xs font-bold truncate">{item.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* Tab 3: Titles & Badges */}
        {activeTab === 'badges' && (
          <div className="space-y-4">
            <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-4 space-y-3">
              <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                <Trophy size={16} className="text-purple-400" />
                <span>الألقاب المفتوحة ({unlockedTitles.length})</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <button
                  onClick={() => updateField({ equippedTitle: null }, 'equippedTitle')}
                  className={`min-h-[46px] px-3 rounded-xl border text-xs font-black cursor-pointer transition ${
                    !userData?.equippedTitle
                      ? 'border-purple-500 bg-purple-500/15 text-purple-300'
                      : 'border-white/[0.08] bg-[#08080c] text-neutral-400'
                  }`}
                >
                  بدون لقب
                </button>
                {unlockedTitles.map((item) => {
                  const active = userData?.equippedTitle === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => updateField({ equippedTitle: item.id }, 'equippedTitle')}
                      className={`min-h-[46px] px-3 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition ${
                        active
                          ? 'border-purple-500 bg-purple-500/15 text-white'
                          : 'border-white/[0.08] bg-[#08080c] text-neutral-300'
                      }`}
                    >
                      {item.icon && <item.icon size={13} className="shrink-0" />}
                      <span className="truncate">{item.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-4 space-y-3">
              <h2 className="text-sm font-black text-white flex items-center gap-1.5">
                <Award size={16} className="text-amber-400" />
                <span>الأوسمة والشارات ({unlockedBadges.length})</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <button
                  onClick={() => updateField({ equippedBadge: null }, 'equippedBadge')}
                  className={`min-h-[46px] px-3 rounded-xl border text-xs font-black cursor-pointer transition ${
                    !userData?.equippedBadge
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                      : 'border-white/[0.08] bg-[#08080c] text-neutral-400'
                  }`}
                >
                  بدون وسام
                </button>
                {unlockedBadges.map((item) => {
                  const active = userData?.equippedBadge === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => updateField({ equippedBadge: item.id }, 'equippedBadge')}
                      className={`min-h-[46px] px-3 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition ${
                        active
                          ? 'border-amber-500 bg-amber-500/15 text-white'
                          : 'border-white/[0.08] bg-[#08080c] text-neutral-300'
                      }`}
                    >
                      {item.icon &&
                        React.createElement(item.icon, {
                          size: 13,
                          className: item.color || 'text-amber-400',
                        })}
                      <span className="truncate">{item.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* Tab 4: Comment Cards */}
        {activeTab === 'cards' && (
          <section className="bg-[#101016] border border-white/[0.08] rounded-2xl p-4 space-y-3">
            <h2 className="text-sm font-black text-white flex items-center gap-1.5">
              <MessageSquare size={16} className="text-sky-400" />
              <span>بطاقات التعليق ({ownedCommentCards.length})</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                onClick={() => updateField({ equippedCommentCard: null }, 'equippedCommentCard')}
                className={`min-h-[56px] px-4 rounded-xl border text-xs font-black text-right flex items-center justify-between cursor-pointer transition ${
                  !userData?.equippedCommentCard
                    ? 'border-sky-500 bg-sky-500/15 text-sky-300'
                    : 'border-white/[0.08] bg-[#08080c] text-neutral-400'
                }`}
              >
                <span>البطاقة الكلاسيكية</span>
                {!userData?.equippedCommentCard && <CheckCircle2 size={16} />}
              </button>
              {ownedCommentCards.map((item) => {
                const active = userData?.equippedCommentCard === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => updateField({ equippedCommentCard: item.id }, 'equippedCommentCard')}
                    className={`min-h-[56px] px-4 rounded-xl border text-right flex items-center justify-between gap-2 cursor-pointer transition ${
                      item.commentCardStyle || 'bg-[#08080c]'
                    } ${active ? 'ring-2 ring-sky-500 border-sky-400' : 'border-white/10'}`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-black text-white truncate">{item.name}</div>
                      <div className="text-[11px] text-neutral-300 truncate">{item.desc}</div>
                    </div>
                    {active && <CheckCircle2 size={16} className="text-sky-400 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {ownedCommentCards.length === 0 && onNavigateToStore && (
              <button
                onClick={onNavigateToStore}
                className="w-full min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-neutral-300 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <ShoppingBag size={14} className="text-amber-400" />
                <span>اقتناء بطاقات تعليق من المتجر</span>
              </button>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
