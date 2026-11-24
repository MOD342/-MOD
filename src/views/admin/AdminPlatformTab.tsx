import React, { useState } from "react";
import {
  Trash2,
  AlertTriangle,
  Search,
  RefreshCw,
  Sliders,
  Coins,
  Sparkles,
  Server,
  Wrench,
  EyeOff,
  Pin,
  Zap,
  PlayCircle,
  MessageCircle,
  Tv,
  ShieldCheck,
  BookOpen,
  LayoutTemplate,
  Layers,
  Eye,
  Plus,
  Minus,
  Check
} from "lucide-react";
import { useAdminDashboard } from "./AdminDashboardContext";
import { useDeviceDisplay } from "../../hooks/useDeviceDisplay";
import RewardedVideoAdModal from "../../components/RewardedVideoAdModal";
import type { BannerStyle, DualHomeConfig } from "../../types/platformConfig";

const BannerShapePreview: React.FC<{ styleId: BannerStyle; accent: "anime" | "manga" }> = ({ styleId, accent }) => {
  const accentBg = accent === "manga" ? "bg-amber-400" : "bg-[#FF1744]";
  const accentSoft = accent === "manga" ? "bg-amber-400/20 border-amber-400/50" : "bg-[#FF1744]/20 border-[#FF1744]/50";

  if (styleId === "classic") {
    return (
      <div className="w-full h-16 rounded-lg bg-zinc-900 border border-zinc-800 relative overflow-hidden p-2 flex flex-col justify-between">
        <div className={`absolute inset-y-0 left-0 w-3/5 opacity-35 ${accent === "manga" ? "bg-gradient-to-r from-amber-500/60 to-transparent" : "bg-gradient-to-r from-rose-500/60 to-transparent"}`} />
        <div />
        <div className="relative z-10 space-y-1">
          <div className="w-8 h-1 rounded bg-white/45" />
          <div className="w-16 h-1.5 rounded bg-white/90" />
        </div>
        <div className="relative z-10 flex items-center justify-center gap-1 pt-0.5">
          <div className={`w-4 h-0.5 rounded-full ${accentBg}`} />
          <div className="w-1.5 h-0.5 rounded-full bg-white/30" />
          <div className="w-1.5 h-0.5 rounded-full bg-white/30" />
        </div>
      </div>
    );
  }
  if (styleId === "split") {
    return (
      <div className="w-full h-16 rounded-lg bg-zinc-900 border border-zinc-800 relative overflow-hidden p-2 flex items-center gap-2.5">
        <div className={`absolute inset-0 opacity-25 ${accent === "manga" ? "bg-gradient-to-tr from-amber-500/50 via-transparent to-transparent" : "bg-gradient-to-tr from-rose-500/50 via-transparent to-transparent"}`} />
        <div className={`relative z-10 w-8 h-12 rounded-md border shrink-0 ${accentSoft}`} />
        <div className="relative z-10 flex-1 space-y-1.5 min-w-0">
          <div className="w-9 h-1 rounded bg-white/45" />
          <div className="w-16 h-1.5 rounded bg-white/90" />
          <div className="w-12 h-1 rounded bg-white/35" />
        </div>
      </div>
    );
  }
  if (styleId === "glass") {
    return (
      <div className="w-full h-16 rounded-lg bg-zinc-950 border border-zinc-800 relative overflow-hidden px-1.5 py-1 flex items-center justify-center gap-1.5">
        <div className="w-6 h-10 rounded-md bg-zinc-800/80 border border-zinc-700/70 opacity-50 shrink-0" />
        <div className={`w-9 h-13 rounded-lg border relative overflow-hidden shrink-0 ${accentSoft}`}>
          <div className="absolute bottom-0 inset-x-0 h-4 bg-black/65 border-t border-white/15 p-0.5 flex flex-col justify-center gap-0.5">
            <div className="w-6 h-1 rounded bg-white/85" />
            <div className="w-4 h-0.5 rounded bg-white/40" />
          </div>
        </div>
        <div className="w-6 h-10 rounded-md bg-zinc-800/80 border border-zinc-700/70 opacity-50 shrink-0" />
      </div>
    );
  }
  return (
    <div className="w-full h-16 rounded-lg bg-zinc-900 border border-zinc-800 relative overflow-hidden p-1.5 flex flex-col justify-between gap-1">
      <div className={`absolute inset-x-0 top-0 h-9 opacity-25 ${accent === "manga" ? "bg-gradient-to-r from-amber-500/50 to-transparent" : "bg-gradient-to-r from-rose-500/50 to-transparent"}`} />
      <div className="relative z-10 space-y-1 px-1 pt-0.5">
        <div className="w-8 h-1 rounded bg-white/45" />
        <div className="w-14 h-1.5 rounded bg-white/90" />
      </div>
      <div className="relative z-10 flex items-center justify-center gap-1">
        <div className={`relative w-4 h-5 rounded border overflow-hidden ${accentSoft}`}>
          <div className={`absolute bottom-0 inset-x-0 h-0.5 ${accentBg}`} />
        </div>
        <div className="w-4 h-5 rounded bg-zinc-800 border border-zinc-700 opacity-60" />
        <div className="w-4 h-5 rounded bg-zinc-800 border border-zinc-700 opacity-60" />
        <div className="w-4 h-5 rounded bg-zinc-800 border border-zinc-700 opacity-60" />
      </div>
    </div>
  );
};

export const AdminPlatformTab: React.FC = () => {
  const display = useDeviceDisplay();
  const [isPreviewingAd, setIsPreviewingAd] = useState(false);

  const {
    role,
    workspace,
    platformSubTab,
    setPlatformSubTab,
    pinnedAnimeList,
    setPinnedAnimeList,
    hiddenAnimeList,
    setHiddenAnimeList,
    curationSearchQuery,
    setCurationSearchQuery,
    curationSearchResults,
    isSearchingCurationAnime,
    pinEpisodeInput,
    setPinEpisodeInput,
    sliderLimit,
    setSliderLimit,
    sliderSeason,
    setSliderSeason,
    sliderMode,
    setSliderMode,
    animeBannerStyle,
    setAnimeBannerStyle,
    customSliderAnime,
    setCustomSliderAnime,
    sliderSearchQuery,
    setSliderSearchQuery,
    sliderSearchResults,
    setSliderSearchResults,
    isSearchingSliderAnime,
    sliderSpeed,
    setSliderSpeed,
    globalAnnouncement,
    setGlobalAnnouncement,
    mangaBannerStyle,
    setMangaBannerStyle,
    mangaBannerLimit,
    setMangaBannerLimit,
    mangaSliderMode,
    setMangaSliderMode,
    customMangaBanner,
    setCustomMangaBanner,
    mangaBannerSearchQuery,
    setMangaBannerSearchQuery,
    mangaBannerSearchResults,
    setMangaBannerSearchResults,
    isSearchingMangaBanner,
    mangaBannerSpeed,
    setMangaBannerSpeed,
    mangaAnnouncement,
    setMangaAnnouncement,
    dualHomeConfig,
    setDualHomeConfig,
    bannerStyleOptions,
    helpTelegramUrl,
    setHelpTelegramUrl,
    groupTelegramUrl,
    setGroupTelegramUrl,
    donateTelegramUrl,
    setDonateTelegramUrl,
    monetizationMode,
    setMonetizationMode,
    directLinkUrl,
    setDirectLinkUrl,
    backupDirectLinkUrl,
    setBackupDirectLinkUrl,
    videoAdUrl,
    setVideoAdUrl,
    vastTagUrl,
    setVastTagUrl,
    admobRewardedId,
    setAdmobRewardedId,
    scriptCode,
    setScriptCode,
    requireClickVerification,
    setRequireClickVerification,
    adCooldownSeconds,
    setAdCooldownSeconds,
    stayTime,
    setStayTime,
    adRewardCoins,
    setAdRewardCoins,
    adRewardXp,
    setAdRewardXp,
    adDailyLimit,
    setAdDailyLimit,
    customAdsList,
    setCustomAdsList,
    newAdSponsor,
    setNewAdSponsor,
    newAdTitle,
    setNewAdTitle,
    newAdBannerUrl,
    setNewAdBannerUrl,
    newAdTargetUrl,
    setNewAdTargetUrl,
    newAdButtonText,
    setNewAdButtonText,
    adStatsData,
    isSavingSettings,
    queueStatus,
    queueTaskName,
    setQueueTaskName,
    queueTaskData,
    setQueueTaskData,
    isSubmittingQueueTask,
    expandedJobId,
    setExpandedJobId,
    confirmResetModal,
    setConfirmResetModal,
    isResettingAll,
    confirmFactoryWipeModal,
    setConfirmFactoryWipeModal,
    isFactoryWiping,
    notify,
    saveAnimeCuration,
    saveSliderSettings,
    cacheStats,
    isUpdatingCacheMode,
    handleToggleServerCacheMode,
    handlePurgeRamCacheNow,
    handleAddQueueJob,
    handleClearQueueLogs,
    isPurgingAllCaches,
    handlePurgeAllSystemCaches,
    handleResetAllAccounts,
    handleFactoryWipeForLaunch,
    canAccessPlatform
  } = useAdminDashboard();

  const todayKey = new Date().toISOString().split("T")[0];

  return (
    <>
      {workspace === "platform" && canAccessPlatform && (
        <div className="space-y-5">
          {/* Sub-Tabs Selector (>= 44px touch targets, horizontally scrollable on mobile) */}
          <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar bg-[#121215] border border-zinc-800/80 p-1.5 rounded-2xl">
            <button
              type="button"
              onClick={() => setPlatformSubTab("slider")}
              className={`min-h-[44px] flex items-center gap-2 px-4 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                platformSubTab === "slider" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              <LayoutTemplate size={15} className="text-[#FF1744]" />
              <span>البانرات والسلايدر</span>
            </button>

            <button
              type="button"
              onClick={() => setPlatformSubTab("homes")}
              className={`min-h-[44px] flex items-center gap-2 px-4 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                platformSubTab === "homes" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              <Layers size={15} className="text-purple-400" />
              <span>الشاشتان الرئيسيتان</span>
            </button>

            <button
              type="button"
              onClick={() => setPlatformSubTab("links_ads")}
              className={`min-h-[44px] flex items-center gap-2 px-4 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                platformSubTab === "links_ads" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              <Coins size={15} className="text-amber-400" />
              <span>الإعلانات والروابط</span>
            </button>

            <button
              type="button"
              onClick={() => setPlatformSubTab("curation")}
              className={`min-h-[44px] flex items-center gap-2 px-4 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                platformSubTab === "curation" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              <Pin size={15} className="text-emerald-400" />
              <span>تثبيت وإخفاء الأنميات</span>
            </button>

            {(role === "owner" || role === "admin") && (
              <>
                <button
                  type="button"
                  onClick={() => setPlatformSubTab("queue")}
                  className={`min-h-[44px] flex items-center gap-2 px-4 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    platformSubTab === "queue" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Server size={15} className="text-sky-400" />
                  <span>مهام السحب (Queue)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPlatformSubTab("maintenance")}
                  className={`min-h-[44px] flex items-center gap-2 px-4 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    platformSubTab === "maintenance" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Wrench size={15} className="text-rose-400" />
                  <span>الصيانة والأداء</span>
                </button>
              </>
            )}
          </div>

          {/* ============================================================
              SUB-TAB 1: DUAL BANNERS & SLIDERS (ANIME + MANGA)
             ============================================================ */}
          {platformSubTab === "slider" && (
            <div className="space-y-5">
              {/* SECTION A: ANIME HOME BANNER */}
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-4 sm:p-5 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[#FF1744]/15 text-[#FF1744] flex items-center justify-center shrink-0">
                      <Tv size={18} />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-white">١. البانر السينمائي — رئيسية الأنمي</h2>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        تحكم كامل في شكل البانر، مصدر الشرائح، العدد (1 إلى 10)، والرسالة الإعلانية
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#FF1744]/15 text-[#FF1744] tabular-nums">
                    {sliderLimit} شرائح · {sliderSpeed}ث
                  </span>
                </div>

                {/* Anime Banner Style Visual Picker */}
                <div className="space-y-2">
                  <label className="block text-xs text-zinc-300 font-black">شكل البانر السينمائي للأنمي</label>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {(bannerStyleOptions || []).map((opt: any) => {
                      const active = animeBannerStyle === opt.id;
                      return (
                        <button
                          key={`anime-style-${opt.id}`}
                          type="button"
                          onClick={() => setAnimeBannerStyle(opt.id)}
                          className={`p-2.5 rounded-xl border text-right transition cursor-pointer flex flex-col gap-2 ${
                            active
                              ? "bg-[#FF1744]/10 border-[#FF1744] shadow-[0_0_0_1px_rgba(255,23,68,0.4)]"
                              : "bg-zinc-950/70 border-zinc-800 hover:border-zinc-700"
                          }`}
                        >
                          <BannerShapePreview styleId={opt.id} accent="anime" />
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-black text-white">{opt.label}</span>
                            {active && <Check size={14} className="text-[#FF1744] shrink-0" />}
                          </div>
                          <span className="text-[10px] text-zinc-400 leading-snug">{opt.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div>
                    <label className="block text-xs text-zinc-400 font-bold mb-1.5">محتوى بانر الأنمي</label>
                    <select
                      value={sliderMode}
                      onChange={e => setSliderMode(e.target.value as any)}
                      className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-white font-bold focus:outline-none focus:border-[#FF1744]"
                    >
                      <option value="best_season">الأفضل هذا الموسم</option>
                      <option value="trending_season">الرائج هذا الموسم</option>
                      <option value="all_time_best">الأفضل على الإطلاق</option>
                      <option value="classic_historical">الأنميات التاريخية</option>
                      <option value="custom">مخصص (اختيار يدوي)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 font-bold mb-1.5">عدد الشرائح (1 - 10)</label>
                    <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-xl p-1 min-h-[44px]">
                      <button
                        type="button"
                        onClick={() => setSliderLimit(Math.max(1, Number(sliderLimit) - 1))}
                        className="w-9 h-9 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 flex items-center justify-center cursor-pointer shrink-0"
                        aria-label="تقليل"
                      >
                        <Minus size={14} />
                      </button>
                      <select
                        value={sliderLimit}
                        onChange={e => setSliderLimit(Math.min(10, Math.max(1, Number(e.target.value))))}
                        className="flex-1 bg-transparent text-center text-xs text-white font-black tabular-nums focus:outline-none cursor-pointer"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                          <option key={n} value={n} className="bg-zinc-900">
                            {n} {n === 1 ? "شريحة" : n === 2 ? "شريحتان" : "شرائح"}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setSliderLimit(Math.min(10, Number(sliderLimit) + 1))}
                        className="w-9 h-9 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 flex items-center justify-center cursor-pointer shrink-0"
                        aria-label="زيادة"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 font-bold mb-1.5">فلتر أنميات الموسم</label>
                    <select
                      value={sliderSeason}
                      onChange={e => setSliderSeason(e.target.value)}
                      className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-white font-bold focus:outline-none focus:border-[#FF1744]"
                    >
                      <option value="auto">تلقائي (الموسم الحالي)</option>
                      <option value="winter">شتاء (Winter)</option>
                      <option value="spring">ربيع (Spring)</option>
                      <option value="summer">صيف (Summer)</option>
                      <option value="fall">خريف (Fall)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 font-bold mb-1.5">سرعة التبديل (ثواني)</label>
                    <input
                      type="number"
                      min={2}
                      max={15}
                      value={sliderSpeed}
                      onChange={e => setSliderSpeed(Number(e.target.value))}
                      className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-white font-bold tabular-nums focus:outline-none focus:border-[#FF1744]"
                    />
                  </div>
                </div>

                {/* Custom Anime Slider Picker */}
                {sliderMode === "custom" && (
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white tabular-nums">
                        الأنميات المختارة لبانر الأنمي ({customSliderAnime.length} / {sliderLimit})
                      </span>
                      {customSliderAnime.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setCustomSliderAnime([])}
                          className="text-xs text-rose-400 font-bold cursor-pointer"
                        >
                          مسح القائمة
                        </button>
                      )}
                    </div>

                    <div className="relative">
                      <Search size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        value={sliderSearchQuery}
                        onChange={e => setSliderSearchQuery(e.target.value)}
                        placeholder="ابحث عن أنمي بالعربية أو الإنجليزية لإضافته للبانر..."
                        className="w-full min-h-[44px] bg-zinc-900 border border-zinc-800 rounded-xl pr-10 pl-3 text-xs text-white focus:outline-none focus:border-[#FF1744]"
                      />
                    </div>

                    {sliderSearchQuery.trim().length >= 2 && (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-h-56 overflow-y-auto divide-y divide-zinc-800/60">
                        {isSearchingSliderAnime ? (
                          <div className="py-4 text-center text-xs text-zinc-400">جاري البحث...</div>
                        ) : sliderSearchResults.length > 0 ? (
                          sliderSearchResults.map((animeItem: any, sIdx: number) => {
                            const animeIdStr = String(animeItem._id || animeItem.mal_id || animeItem.id || sIdx);
                            const alreadyAdded = customSliderAnime.some((a: any) => String(a._id) === animeIdStr);
                            const poster =
                              animeItem.posterUrl ||
                              animeItem.images?.jpg?.large_image_url ||
                              animeItem.images?.jpg?.image_url ||
                              "";
                            const titleStr = animeItem.title || animeItem.title_english || "Anime";
                            return (
                              <button
                                type="button"
                                key={`slider-res-${animeIdStr}-${sIdx}`}
                                onClick={() => {
                                  if (alreadyAdded) return;
                                  if (customSliderAnime.length >= 10) {
                                    notify("الحد الأقصى هو 10 شرائح", "error");
                                    return;
                                  }
                                  setCustomSliderAnime((prev: any[]) => [
                                    ...prev,
                                    {
                                      _id: animeIdStr,
                                      title: titleStr,
                                      posterUrl: poster,
                                      rating: animeItem.rating || animeItem.score || 8.5,
                                      genres: Array.isArray(animeItem.genres)
                                        ? animeItem.genres.map((g: any) => (typeof g === "string" ? g : g.name)).filter(Boolean)
                                        : ["أنمي"]
                                    }
                                  ]);
                                  setSliderSearchQuery("");
                                  setSliderSearchResults([]);
                                }}
                                className="w-full min-h-[52px] p-2.5 hover:bg-zinc-800 flex items-center justify-between gap-2 text-xs cursor-pointer transition text-right"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <img
                                    src={poster}
                                    alt=""
                                    referrerPolicy="no-referrer"
                                    className="w-8 h-11 rounded object-cover shrink-0 bg-zinc-950"
                                  />
                                  <span className="font-bold text-white truncate">{titleStr}</span>
                                </div>
                                <span
                                  className={`text-[11px] px-3 py-1 rounded-lg font-bold shrink-0 ${
                                    alreadyAdded ? "bg-zinc-800 text-zinc-500" : "bg-[#FF1744] text-white"
                                  }`}
                                >
                                  {alreadyAdded ? "مضاف" : "+ إضافة"}
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="py-4 text-center text-xs text-zinc-500">لا توجد نتائج مطابقة</div>
                        )}
                      </div>
                    )}

                    {customSliderAnime.length > 0 && (
                      <div className={`grid ${display.isCoverScreen ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-5"} gap-2.5 pt-1`}>
                        {customSliderAnime.map((item: any, idx: number) => (
                          <div
                            key={`${item._id}-${idx}`}
                            className="theme-keep-dark relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900 aspect-[3/4]"
                          >
                            <img
                              src={item.posterUrl}
                              alt={item.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent flex flex-col justify-end p-2">
                              <span className="absolute top-1.5 right-1.5 bg-yellow-500 text-black text-[10px] font-black px-1.5 py-0.5 rounded tabular-nums">
                                #{idx + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => setCustomSliderAnime((prev: any[]) => prev.filter((_, i) => i !== idx))}
                                className="absolute top-1.5 left-1.5 w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center text-sm cursor-pointer"
                              >
                                ×
                              </button>
                              <span className="text-[11px] font-bold text-white truncate">{item.title}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs text-zinc-400 font-bold mb-1.5">
                    شريط الإعلان العلوي في رئيسية الأنمي (اتركه فارغاً لإخفائه)
                  </label>
                  <textarea
                    rows={2}
                    value={globalAnnouncement}
                    onChange={e => setGlobalAnnouncement(e.target.value)}
                    placeholder="اكتب إعلاناً عاماً ليظهر أعلى رئيسية الأنمي لجميع الزوار..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#FF1744] resize-none"
                  />
                </div>
              </div>

              {/* SECTION B: MANGA & MANHWA HOME BANNER */}
              <div className="bg-[#121215] border border-purple-500/25 rounded-2xl p-4 sm:p-5 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                      <BookOpen size={18} />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-white">٢. البانر السينمائي — رئيسية المانجا والمانهوا</h2>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        تحكم مستقل في شكل بانر القراءة، محتواه (رائج / مانهوا كورية / مانجا / مانها / مخصص)، وعدد الشرائح
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-purple-500/15 text-purple-300 tabular-nums">
                    {mangaBannerLimit} شرائح · {mangaBannerSpeed}ث
                  </span>
                </div>

                {/* Manga Banner Style Visual Picker */}
                <div className="space-y-2">
                  <label className="block text-xs text-zinc-300 font-black">شكل البانر السينمائي للمانجا والمانهوا</label>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {(bannerStyleOptions || []).map((opt: any) => {
                      const active = mangaBannerStyle === opt.id;
                      return (
                        <button
                          key={`manga-style-${opt.id}`}
                          type="button"
                          onClick={() => setMangaBannerStyle(opt.id)}
                          className={`p-2.5 rounded-xl border text-right transition cursor-pointer flex flex-col gap-2 ${
                            active
                              ? "bg-purple-500/10 border-purple-500 shadow-[0_0_0_1px_rgba(168,85,247,0.4)]"
                              : "bg-zinc-950/70 border-zinc-800 hover:border-zinc-700"
                          }`}
                        >
                          <BannerShapePreview styleId={opt.id} accent="manga" />
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-black text-white">{opt.label}</span>
                            {active && <Check size={14} className="text-purple-400 shrink-0" />}
                          </div>
                          <span className="text-[10px] text-zinc-400 leading-snug">{opt.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs text-zinc-400 font-bold mb-1.5">مصدر محتوى بانر المانجا</label>
                    <select
                      value={mangaSliderMode}
                      onChange={e => setMangaSliderMode(e.target.value as any)}
                      className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-white font-bold focus:outline-none focus:border-purple-500"
                    >
                      <option value="trending">الرائج الآن (جميع الأصول)</option>
                      <option value="latest">أحدث الفصول المضافة</option>
                      <option value="manhwa_kr">مانهوا كورية مميزة (KR)</option>
                      <option value="manga_jp">مانجا يابانية مميزة (JP)</option>
                      <option value="manhua_cn">مانها صينية مميزة (CN)</option>
                      <option value="custom">مخصص (اختيار يدوي)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 font-bold mb-1.5">عدد شرائح بانر المانجا (1 - 10)</label>
                    <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-xl p-1 min-h-[44px]">
                      <button
                        type="button"
                        onClick={() => setMangaBannerLimit(Math.max(1, Number(mangaBannerLimit) - 1))}
                        className="w-9 h-9 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 flex items-center justify-center cursor-pointer shrink-0"
                        aria-label="تقليل"
                      >
                        <Minus size={14} />
                      </button>
                      <select
                        value={mangaBannerLimit}
                        onChange={e => setMangaBannerLimit(Math.min(10, Math.max(1, Number(e.target.value))))}
                        className="flex-1 bg-transparent text-center text-xs text-white font-black tabular-nums focus:outline-none cursor-pointer"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                          <option key={n} value={n} className="bg-zinc-900">
                            {n} {n === 1 ? "شريحة" : n === 2 ? "شريحتان" : "شرائح"}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setMangaBannerLimit(Math.min(10, Number(mangaBannerLimit) + 1))}
                        className="w-9 h-9 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 flex items-center justify-center cursor-pointer shrink-0"
                        aria-label="زيادة"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 font-bold mb-1.5">سرعة تبديل بانر المانجا (ث)</label>
                    <input
                      type="number"
                      min={2}
                      max={15}
                      value={mangaBannerSpeed}
                      onChange={e => setMangaBannerSpeed(Number(e.target.value))}
                      className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-white font-bold tabular-nums focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                {/* Custom Manga/Manhwa Picker */}
                {mangaSliderMode === "custom" && (
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white tabular-nums">
                        الأعمال المختارة لبانر المانجا ({customMangaBanner.length} / {mangaBannerLimit})
                      </span>
                      {customMangaBanner.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setCustomMangaBanner([])}
                          className="text-xs text-rose-400 font-bold cursor-pointer"
                        >
                          مسح القائمة
                        </button>
                      )}
                    </div>

                    <div className="relative">
                      <Search size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        value={mangaBannerSearchQuery}
                        onChange={e => setMangaBannerSearchQuery(e.target.value)}
                        placeholder="ابحث عن مانجا أو مانهوا لإضافتها إلى البانر..."
                        className="w-full min-h-[44px] bg-zinc-900 border border-zinc-800 rounded-xl pr-10 pl-3 text-xs text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    {mangaBannerSearchQuery.trim().length >= 2 && (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-h-56 overflow-y-auto divide-y divide-zinc-800/60">
                        {isSearchingMangaBanner ? (
                          <div className="py-4 text-center text-xs text-zinc-400">جاري البحث في مكتبة المانجا...</div>
                        ) : mangaBannerSearchResults.length > 0 ? (
                          mangaBannerSearchResults.map((mItem: any, mIdx: number) => {
                            const idStr = String(mItem._id || mItem.mangadexId || mIdx);
                            const alreadyAdded = customMangaBanner.some((a: any) => String(a._id) === idStr);
                            const poster = mItem.posterUrl || "";
                            const titleStr = mItem.title || "Manga";
                            return (
                              <button
                                type="button"
                                key={`manga-res-${idStr}-${mIdx}`}
                                onClick={() => {
                                  if (alreadyAdded) return;
                                  if (customMangaBanner.length >= 10) {
                                    notify("الحد الأقصى هو 10 شرائح", "error");
                                    return;
                                  }
                                  setCustomMangaBanner((prev: any[]) => [
                                    ...prev,
                                    {
                                      _id: idStr,
                                      title: titleStr,
                                      posterUrl: poster,
                                      rating: mItem.rating || undefined,
                                      originLabel: mItem.originLabel || "مانجا",
                                      chaptersCount: mItem.chaptersCount || null,
                                      status: mItem.status || "",
                                      genres: Array.isArray(mItem.genres) ? mItem.genres.slice(0, 3) : ["مانجا"],
                                    }
                                  ]);
                                  setMangaBannerSearchQuery("");
                                  setMangaBannerSearchResults([]);
                                }}
                                className="w-full min-h-[52px] p-2.5 hover:bg-zinc-800 flex items-center justify-between gap-2 text-xs cursor-pointer transition text-right"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <img
                                    src={poster}
                                    alt=""
                                    referrerPolicy="no-referrer"
                                    className="w-8 h-11 rounded object-cover shrink-0 bg-zinc-950"
                                  />
                                  <div className="min-w-0">
                                    <span className="font-bold text-white truncate block">{titleStr}</span>
                                    <span className="text-[10px] text-purple-300 font-bold">
                                      {mItem.originLabel || "مانجا"}
                                    </span>
                                  </div>
                                </div>
                                <span
                                  className={`text-[11px] px-3 py-1 rounded-lg font-bold shrink-0 ${
                                    alreadyAdded ? "bg-zinc-800 text-zinc-500" : "bg-purple-600 text-white"
                                  }`}
                                >
                                  {alreadyAdded ? "مضاف" : "+ إضافة"}
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="py-4 text-center text-xs text-zinc-500">لا توجد نتائج مطابقة</div>
                        )}
                      </div>
                    )}

                    {customMangaBanner.length > 0 && (
                      <div className={`grid ${display.isCoverScreen ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-5"} gap-2.5 pt-1`}>
                        {customMangaBanner.map((item: any, idx: number) => (
                          <div
                            key={`${item._id}-${idx}`}
                            className="theme-keep-dark relative rounded-xl overflow-hidden border border-purple-500/30 bg-zinc-900 aspect-[3/4]"
                          >
                            <img
                              src={item.posterUrl}
                              alt={item.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent flex flex-col justify-end p-2">
                              <span className="absolute top-1.5 right-1.5 bg-purple-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded tabular-nums">
                                #{idx + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => setCustomMangaBanner((prev: any[]) => prev.filter((_, i) => i !== idx))}
                                className="absolute top-1.5 left-1.5 w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center text-sm cursor-pointer"
                              >
                                ×
                              </button>
                              <span className="text-[11px] font-bold text-white truncate">{item.title}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs text-zinc-400 font-bold mb-1.5">
                    شريط الإعلان العلوي في رئيسية المانجا والمانهوا (اتركه فارغاً لإخفائه)
                  </label>
                  <textarea
                    rows={2}
                    value={mangaAnnouncement}
                    onChange={e => setMangaAnnouncement(e.target.value)}
                    placeholder="اكتب إعلاناً أو تنبيهاً ليظهر أعلى شاشة المانجا والمانهوا..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-purple-500 resize-none"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={saveSliderSettings}
                disabled={isSavingSettings}
                className="w-full min-h-[48px] bg-[#FF1744] hover:bg-rose-600 text-white font-black rounded-xl text-sm transition cursor-pointer shadow-lg shadow-[#FF1744]/20"
              >
                {isSavingSettings ? "جاري الحفظ والمزامنة..." : "حفظ ونشر إعدادات البانرات للشاشتين"}
              </button>
            </div>
          )}

          {/* ============================================================
              SUB-TAB 1B: DUAL HOME SCREENS CONTROL
             ============================================================ */}
          {platformSubTab === "homes" && (
            <div className="space-y-5">
              {/* Main Dual-Home Toggles & Default Landing */}
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-4 sm:p-5 space-y-5">
                <div className="border-b border-zinc-800/80 pb-3">
                  <h2 className="text-sm font-black text-white">إدارة الشاشتين الرئيسيتين (الأنمي والمانجا)</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    تحديد الشاشة الافتراضية للزوار الجدد، وتفعيل أو إيقاف أي من الشاشتين وأقسامهما الداخلية لحظياً
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  {/* Default Visitor Home */}
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-2.5">
                    <span className="text-xs font-black text-white block">الشاشة الافتراضية للزوار الجدد</span>
                    <p className="text-[11px] text-zinc-400">تُطبق لمن لم يحدد شاشة مفضلة من جهازه بعد</p>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        disabled={!dualHomeConfig.enableAnimeHome}
                        onClick={() =>
                          setDualHomeConfig((prev: DualHomeConfig) => ({ ...prev, defaultVisitorHome: "anime" }))
                        }
                        className={`min-h-[42px] rounded-xl text-xs font-black border transition cursor-pointer disabled:opacity-40 ${
                          dualHomeConfig.defaultVisitorHome === "anime"
                            ? "bg-[#FF1744]/15 border-[#FF1744] text-white"
                            : "bg-zinc-900 border-zinc-800 text-zinc-400"
                        }`}
                      >
                        رئيسية الأنمي
                      </button>
                      <button
                        type="button"
                        disabled={!dualHomeConfig.enableMangaHome}
                        onClick={() =>
                          setDualHomeConfig((prev: DualHomeConfig) => ({ ...prev, defaultVisitorHome: "manga" }))
                        }
                        className={`min-h-[42px] rounded-xl text-xs font-black border transition cursor-pointer disabled:opacity-40 ${
                          dualHomeConfig.defaultVisitorHome === "manga"
                            ? "bg-purple-500/15 border-purple-500 text-white"
                            : "bg-zinc-900 border-zinc-800 text-zinc-400"
                        }`}
                      >
                        رئيسية المانجا
                      </button>
                    </div>
                  </div>

                  {/* Enable Anime Home Switch */}
                  <label className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-3 cursor-pointer">
                    <div>
                      <span className="text-xs font-black text-white flex items-center gap-1.5">
                        <Tv size={15} className="text-[#FF1744]" />
                        <span>تفعيل شاشة الأنمي</span>
                      </span>
                      <span className="text-[11px] text-zinc-400 block mt-1">
                        إظهار رئيسية الأنمي والحلقات والجدول
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={dualHomeConfig.enableAnimeHome}
                      onChange={e => {
                        const checked = e.target.checked;
                        if (!checked && !dualHomeConfig.enableMangaHome) {
                          notify("يجب أن تبقى شاشة رئيسية واحدة على الأقل مفعلة", "error");
                          return;
                        }
                        setDualHomeConfig((prev: DualHomeConfig) => ({
                          ...prev,
                          enableAnimeHome: checked,
                          defaultVisitorHome: !checked ? "manga" : prev.defaultVisitorHome,
                        }));
                      }}
                      className="w-5 h-5 accent-[#FF1744] rounded cursor-pointer shrink-0"
                    />
                  </label>

                  {/* Enable Manga Home Switch */}
                  <label className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-3 cursor-pointer">
                    <div>
                      <span className="text-xs font-black text-white flex items-center gap-1.5">
                        <BookOpen size={15} className="text-purple-400" />
                        <span>تفعيل شاشة المانجا والمانهوا</span>
                      </span>
                      <span className="text-[11px] text-zinc-400 block mt-1">
                        إتاحة التبديل عبر شعار أوتاكو MOD لرئيسية المانجا
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={dualHomeConfig.enableMangaHome}
                      onChange={e => {
                        const checked = e.target.checked;
                        if (!checked && !dualHomeConfig.enableAnimeHome) {
                          notify("يجب أن تبقى شاشة رئيسية واحدة على الأقل مفعلة", "error");
                          return;
                        }
                        setDualHomeConfig((prev: DualHomeConfig) => ({
                          ...prev,
                          enableMangaHome: checked,
                          defaultVisitorHome: !checked ? "anime" : prev.defaultVisitorHome,
                        }));
                      }}
                      className="w-5 h-5 accent-purple-500 rounded cursor-pointer shrink-0"
                    />
                  </label>
                </div>

                {/* Section Visibility Controls Side-by-Side */}
                <div
                  className="grid grid-cols-1 lg:grid-cols-2 gap-4"
                  style={display.isBookPosture ? { gap: "var(--fold-hinge-gap, 24px)" } : undefined}
                >
                  {/* Anime Home Sections */}
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2 border-b border-zinc-800 pb-2.5">
                      <Eye size={15} className="text-[#FF1744]" />
                      <h3 className="text-xs font-black text-white">أقسام شاشة الأنمي الرئيسية</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(
                        [
                          { key: "continueWatching", label: "استكمال المشاهدة" },
                          { key: "latestEpisodes", label: "أحدث الحلقات" },
                          { key: "trending", label: "الأكثر رواجاً" },
                          { key: "currentSeason", label: "أنميات الموسم الحالي" },
                          { key: "topAnime", label: "الأعلى تقييماً" },
                          { key: "movies", label: "أفلام الأنمي" },
                          { key: "schedule", label: "جدول البث الأسبوعي" },
                          { key: "quotes", label: "اقتباسات الأنمي اليومية" },
                        ] as const
                      ).map(sec => (
                        <label
                          key={sec.key}
                          className="min-h-[44px] px-3 py-2 rounded-xl bg-zinc-900/70 border border-zinc-800/80 flex items-center justify-between gap-2 cursor-pointer hover:border-zinc-700"
                        >
                          <span className="text-xs font-bold text-zinc-200">{sec.label}</span>
                          <input
                            type="checkbox"
                            checked={dualHomeConfig.animeSections[sec.key]}
                            onChange={e =>
                              setDualHomeConfig((prev: DualHomeConfig) => ({
                                ...prev,
                                animeSections: {
                                  ...prev.animeSections,
                                  [sec.key]: e.target.checked,
                                },
                              }))
                            }
                            className="w-4 h-4 accent-[#FF1744] rounded cursor-pointer shrink-0"
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Manga Home Sections */}
                  <div className="bg-zinc-950 border border-purple-500/20 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2 border-b border-zinc-800 pb-2.5">
                      <Eye size={15} className="text-purple-400" />
                      <h3 className="text-xs font-black text-white">أقسام شاشة المانجا والمانهوا</h3>
                    </div>
                    <div className="space-y-2">
                      {(
                        [
                          { key: "continueReading", label: "استكمال القراءة" },
                          { key: "trending", label: "الأكثر قراءة ورواجاً" },
                          { key: "latestCatalog", label: "أحدث الفصول والكتالوج الموحد" },
                        ] as const
                      ).map(sec => (
                        <label
                          key={sec.key}
                          className="min-h-[46px] px-3.5 py-2.5 rounded-xl bg-zinc-900/70 border border-zinc-800/80 flex items-center justify-between gap-2 cursor-pointer hover:border-purple-500/40"
                        >
                          <span className="text-xs font-bold text-zinc-200">{sec.label}</span>
                          <input
                            type="checkbox"
                            checked={dualHomeConfig.mangaSections[sec.key]}
                            onChange={e =>
                              setDualHomeConfig((prev: DualHomeConfig) => ({
                                ...prev,
                                mangaSections: {
                                  ...prev.mangaSections,
                                  [sec.key]: e.target.checked,
                                },
                              }))
                            }
                            className="w-4 h-4 accent-purple-500 rounded cursor-pointer shrink-0"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={saveSliderSettings}
                  disabled={isSavingSettings}
                  className="w-full min-h-[48px] bg-[#FF1744] hover:bg-rose-600 text-white font-black rounded-xl text-sm transition cursor-pointer shadow-lg shadow-[#FF1744]/20"
                >
                  {isSavingSettings ? "جاري الحفظ والمزامنة..." : "حفظ ونشر إعدادات الشاشتين الرئيسيتين"}
                </button>
              </div>
            </div>
          )}

          {/* ============================================================
              SUB-TAB 2: ANIME CURATION
             ============================================================ */}
          {platformSubTab === "curation" && (
            <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-4 sm:p-5 space-y-5">
              <div className="border-b border-zinc-800/80 pb-3">
                <h2 className="text-sm font-black text-white">تثبيت وإخفاء الأنميات في الموقع</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  ابحث عن أي أنمي لتثبيته في مقدمة «أحدث الحلقات» أو إخفائه من قوائم العرض الرئيسية
                </p>
              </div>

              {/* Search & Action Bar */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  <div className="md:col-span-2 relative">
                    <Search size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="text"
                      value={curationSearchQuery}
                      onChange={e => setCurationSearchQuery(e.target.value)}
                      placeholder="ابحث عن الأنمي بالعربية أو الإنجليزية..."
                      className="w-full min-h-[44px] bg-zinc-900 border border-zinc-800 rounded-xl pr-10 pl-3 text-xs text-white focus:outline-none focus:border-[#FF1744]"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={pinEpisodeInput}
                      onChange={e => setPinEpisodeInput(e.target.value)}
                      placeholder="وسم الحلقة عند التثبيت (مثال: 12)"
                      className="w-full min-h-[44px] bg-zinc-900 border border-zinc-800 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-[#FF1744]"
                    />
                  </div>
                </div>

                {curationSearchQuery.trim().length >= 2 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-h-60 overflow-y-auto divide-y divide-zinc-800/60">
                    {isSearchingCurationAnime ? (
                      <div className="py-4 text-center text-xs text-zinc-400">جاري البحث...</div>
                    ) : curationSearchResults.length > 0 ? (
                      curationSearchResults.map((animeItem: any, cIdx: number) => {
                        const animeIdStr = String(animeItem._id || animeItem.mal_id || animeItem.id || cIdx);
                        const poster =
                          animeItem.posterUrl ||
                          animeItem.images?.jpg?.large_image_url ||
                          animeItem.images?.jpg?.image_url ||
                          "";
                        const titleStr = animeItem.title || animeItem.title_english || "Anime";
                        const isPinned = pinnedAnimeList.some(p => String(p._id) === animeIdStr);
                        const isHidden = hiddenAnimeList.some(h => String(h._id) === animeIdStr);

                        return (
                          <div
                            key={`curation-res-${animeIdStr}-${cIdx}`}
                            className="p-2.5 hover:bg-zinc-800/60 flex items-center justify-between gap-2 text-xs transition"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <img
                                src={poster}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="w-8 h-11 rounded object-cover shrink-0 bg-zinc-950"
                              />
                              <span className="font-bold text-white truncate">{titleStr}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={isPinned}
                                onClick={() => {
                                  const nextPinned = [
                                    ...pinnedAnimeList,
                                    {
                                      _id: animeIdStr,
                                      title: titleStr,
                                      posterUrl: poster,
                                      pinnedEpisode: pinEpisodeInput.trim() || undefined
                                    }
                                  ];
                                  setPinnedAnimeList(nextPinned);
                                  setPinEpisodeInput("");
                                  setCurationSearchQuery("");
                                  saveAnimeCuration(nextPinned, hiddenAnimeList);
                                }}
                                className="min-h-[38px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-[11px] font-bold cursor-pointer transition"
                              >
                                {isPinned ? "مُثبت" : "تثبيت"}
                              </button>
                              <button
                                type="button"
                                disabled={isHidden}
                                onClick={() => {
                                  const nextHidden = [
                                    ...hiddenAnimeList,
                                    {
                                      _id: animeIdStr,
                                      title: titleStr,
                                      posterUrl: poster
                                    }
                                  ];
                                  setHiddenAnimeList(nextHidden);
                                  setCurationSearchQuery("");
                                  saveAnimeCuration(pinnedAnimeList, nextHidden);
                                }}
                                className="min-h-[38px] px-3 rounded-lg bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/30 disabled:opacity-40 text-rose-300 text-[11px] font-bold cursor-pointer transition"
                              >
                                {isHidden ? "مخفي" : "إخفاء"}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="py-4 text-center text-xs text-zinc-500">لا توجد نتائج مطابقة</div>
                    )}
                  </div>
                )}
              </div>

              {/* Pinned & Hidden Lists Side-by-Side (Book-posture safe) */}
              <div
                className="grid grid-cols-1 lg:grid-cols-2 gap-4"
                style={display.isBookPosture ? { gap: "var(--fold-hinge-gap, 24px)" } : undefined}
              >
                {/* Pinned List */}
                <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                    <span className="text-xs font-black text-emerald-400 flex items-center gap-1.5 tabular-nums">
                      <Pin size={14} />
                      <span>أنميات مثبتة ({pinnedAnimeList.length})</span>
                    </span>
                  </div>
                  {pinnedAnimeList.length === 0 ? (
                    <div className="py-8 text-center text-zinc-500 text-xs">لا توجد أنميات مثبتة حالياً</div>
                  ) : (
                    <div className="space-y-2">
                      {pinnedAnimeList.map((item, idx) => (
                        <div
                          key={`${item._id}-${idx}`}
                          className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={item.posterUrl}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-8 h-11 rounded object-cover shrink-0 bg-zinc-950"
                            />
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-white truncate block">{item.title}</span>
                              <span className="text-[11px] text-emerald-400 font-bold">
                                حلقة: {item.pinnedEpisode || "مُثبت"}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const next = pinnedAnimeList.filter((_, i) => i !== idx);
                              setPinnedAnimeList(next);
                              saveAnimeCuration(next, hiddenAnimeList);
                            }}
                            className="min-h-[38px] px-3 rounded-lg bg-zinc-800 hover:bg-rose-500/20 text-zinc-300 hover:text-rose-400 text-[11px] font-bold cursor-pointer shrink-0"
                          >
                            إلغاء التثبيت
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Hidden List */}
                <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                    <span className="text-xs font-black text-rose-400 flex items-center gap-1.5 tabular-nums">
                      <EyeOff size={14} />
                      <span>أنميات مخفية ({hiddenAnimeList.length})</span>
                    </span>
                  </div>
                  {hiddenAnimeList.length === 0 ? (
                    <div className="py-8 text-center text-zinc-500 text-xs">لا توجد أنميات مخفية حالياً</div>
                  ) : (
                    <div className="space-y-2">
                      {hiddenAnimeList.map((item, idx) => (
                        <div
                          key={`${item._id}-${idx}`}
                          className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={item.posterUrl}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-8 h-11 rounded object-cover shrink-0 bg-zinc-950 opacity-60"
                            />
                            <span className="text-xs font-bold text-zinc-300 truncate">{item.title}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const next = hiddenAnimeList.filter((_, i) => i !== idx);
                              setHiddenAnimeList(next);
                              saveAnimeCuration(pinnedAnimeList, next);
                            }}
                            className="min-h-[38px] px-3 rounded-lg bg-zinc-800 hover:bg-emerald-500/20 text-zinc-300 hover:text-emerald-400 text-[11px] font-bold cursor-pointer shrink-0"
                          >
                            إظهار مجدداً
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================
              SUB-TAB 3: ADS, REWARDS ("ادعم التطبيق") & TELEGRAM LINKS
             ============================================================ */}
          {platformSubTab === "links_ads" && (
            <div className="space-y-5">
              {/* Live Ad Performance Strip */}
              <div className={`grid ${display.isCoverScreen ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-4"} gap-3.5`}>
                <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-4">
                  <span className="text-xs text-zinc-400 font-bold block">مشاهدات اليوم</span>
                  <span className="text-2xl font-black text-amber-400 mt-1 block font-mono tabular-nums">
                    {adStatsData.dailyViews?.[todayKey] || 0}
                  </span>
                  <span className="text-[11px] text-zinc-500 mt-0.5 block">مشاهدة مكتملة اليوم</span>
                </div>
                <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-4">
                  <span className="text-xs text-zinc-400 font-bold block">إجمالي المشاهدات</span>
                  <span className="text-2xl font-black text-white mt-1 block font-mono tabular-nums">
                    {(adStatsData.totalViews || 0).toLocaleString()}
                  </span>
                  <span className="text-[11px] text-zinc-500 mt-0.5 block">منذ التفعيل</span>
                </div>
                <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-4">
                  <span className="text-xs text-zinc-400 font-bold block">كوينز موزعة</span>
                  <span className="text-2xl font-black text-emerald-400 mt-1 block font-mono tabular-nums">
                    {(adStatsData.totalCoinsDistributed || 0).toLocaleString()}
                  </span>
                  <span className="text-[11px] text-zinc-500 mt-0.5 block">شاملة مكافآت السلسلة</span>
                </div>
                <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-4">
                  <span className="text-xs text-zinc-400 font-bold block">خبرة (XP) موزعة</span>
                  <span className="text-2xl font-black text-sky-400 mt-1 block font-mono tabular-nums">
                    {(adStatsData.totalXpDistributed || 0).toLocaleString()}
                  </span>
                  <span className="text-[11px] text-zinc-500 mt-0.5 block">نقاط خبرة مكتسبة</span>
                </div>
              </div>

              {/* Card 1: Opt-In Ad Economy & Behavior ("ادعم التطبيق") */}
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-4 sm:p-5 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                      <Tv size={18} />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-white">إعدادات إعلان «ادعم التطبيق» والمكافآت</h2>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        يظهر للمستخدم اختيارياً عند ضغط زر «ادعم التطبيق» داخل نافذة التطبيق مباشرة
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsPreviewingAd(true)}
                    className="min-h-[42px] px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-amber-500/35 text-amber-300 text-xs font-black flex items-center gap-2 cursor-pointer transition shrink-0"
                  >
                    <PlayCircle size={16} />
                    <span>معاينة الإعلان الآن</span>
                  </button>
                </div>

                {/* Primary Controls Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                  <div className="lg:col-span-2">
                    <label className="block text-xs text-zinc-400 font-bold mb-1.5">طريقة العرض داخل التطبيق</label>
                    <select
                      value={monetizationMode}
                      onChange={e => setMonetizationMode(e.target.value as any)}
                      className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-white font-bold focus:outline-none focus:border-[#FF1744]"
                    >
                      <option value="script">كود إعلان مدمج داخل التطبيق (الأفضل: Native / 300x250)</option>
                      <option value="hybrid">مدمج (كود داخل التطبيق + رابط بديل)</option>
                      <option value="direct_link">رابط راعي مباشر داخل إطار معزول</option>
                      <option value="simulation">بطاقات الرعاة المخصصة</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 font-bold mb-1.5">مدة الإعلان (ث)</label>
                    <input
                      type="number"
                      min={30}
                      max={90}
                      value={stayTime}
                      onChange={e => setStayTime(Number(e.target.value))}
                      className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-white font-bold text-center tabular-nums focus:outline-none focus:border-[#FF1744]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-amber-400 font-bold mb-1.5">مكافأة الكوينز</label>
                    <input
                      type="number"
                      min={5}
                      max={500}
                      value={adRewardCoins}
                      onChange={e => setAdRewardCoins(Number(e.target.value))}
                      className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-amber-400 font-bold text-center tabular-nums focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-sky-400 font-bold mb-1.5">مكافأة XP</label>
                    <input
                      type="number"
                      min={10}
                      max={1000}
                      value={adRewardXp}
                      onChange={e => setAdRewardXp(Number(e.target.value))}
                      className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-sky-400 font-bold text-center tabular-nums focus:outline-none focus:border-sky-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-emerald-400 font-bold mb-1.5">الحد اليومي</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={adDailyLimit}
                      onChange={e => setAdDailyLimit(Number(e.target.value))}
                      className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-emerald-400 font-bold text-center tabular-nums focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>

                {/* Cooldown & Security Policy Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-black text-white block">فاصل الأمان بين كل إعلانين (بالثواني)</span>
                      <span className="text-[11px] text-zinc-400 block mt-0.5">
                        يمنع النقرات الآلية المتكررة لحماية حسابك في الشبكة الإعلانية
                      </span>
                    </div>
                    <input
                      type="number"
                      min={5}
                      max={120}
                      value={adCooldownSeconds}
                      onChange={e => setAdCooldownSeconds(Number(e.target.value))}
                      className="w-20 min-h-[42px] bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 text-xs text-amber-400 font-bold text-center tabular-nums focus:outline-none"
                    />
                  </div>

                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <div>
                      <span className="text-xs font-black text-white block">عرض زر زيارة اختيارية للراعي مع الفيديو</span>
                      <span className="text-[11px] text-zinc-400 block mt-0.5">
                        يُبقي العداد يعمل داخل التطبيق دون إجبار المستخدم على الخروج
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={requireClickVerification}
                      onChange={e => setRequireClickVerification(e.target.checked)}
                      className="w-5 h-5 accent-[#FF1744] rounded cursor-pointer shrink-0"
                    />
                  </label>
                </div>

                {/* Card 2 inside: In-App Ad Code & Video Sources */}
                {(monetizationMode === "script" || monetizationMode === "hybrid") && (
                  <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-4 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs text-amber-400 font-black flex items-center gap-1.5">
                        <ShieldCheck size={15} />
                        <span>كود الإعلان المدمج (HTML / Script — مثل Adsterra NativeBanner أو 300×250)</span>
                      </label>
                      <span className="text-[11px] text-zinc-400">لا تضع كود Popunder هنا لتجنب الإعلانات المنبثقة</span>
                    </div>
                    <textarea
                      rows={4}
                      dir="ltr"
                      value={scriptCode}
                      onChange={e => setScriptCode(e.target.value)}
                      placeholder="<script ...></script><div id='container-...'></div>"
                      className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 text-xs text-white font-mono focus:outline-none focus:border-amber-400 resize-y"
                    />
                  </div>
                )}

                {/* Native Video / VAST / AdMob Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-emerald-400 font-bold mb-1.5">
                      رابط فيديو VAST XML (داخل التطبيق)
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={vastTagUrl || ""}
                      onChange={e => setVastTagUrl?.(e.target.value)}
                      placeholder="https://.../vast.xml"
                      className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-white font-mono focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-emerald-400 font-bold mb-1.5">
                      رابط فيديو MP4 مباشر (اختياري)
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={videoAdUrl || ""}
                      onChange={e => setVideoAdUrl?.(e.target.value)}
                      placeholder="https://.../sponsor-ad.mp4"
                      className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-white font-mono focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-sky-400 font-bold mb-1.5">
                      معرّف AdMob Rewarded للأندرويد APK
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={admobRewardedId || ""}
                      onChange={e => setAdmobRewardedId?.(e.target.value)}
                      placeholder="ca-app-pub-xxxx/xxxx"
                      className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-white font-mono focus:outline-none focus:border-sky-400"
                    />
                  </div>
                </div>

                {/* Direct Smartlinks (for direct_link & hybrid) */}
                {(monetizationMode === "direct_link" || monetizationMode === "hybrid") && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs text-zinc-400 font-bold mb-1.5">
                        رابط Smartlink الأساسي (اختياري)
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={directLinkUrl}
                        onChange={e => setDirectLinkUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-white font-mono focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 font-bold mb-1.5">
                        رابط Smartlink الاحتياطي للتناوب (اختياري)
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={backupDirectLinkUrl}
                        onChange={e => setBackupDirectLinkUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-white font-mono focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Custom Sponsor & Community Ads Builder (when simulation mode is chosen) */}
                {monetizationMode === "simulation" && (
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-4">
                    <div className="border-b border-zinc-800 pb-3">
                      <h3 className="text-xs font-black text-white flex items-center gap-1.5 tabular-nums">
                        <Sparkles size={14} className="text-amber-400" />
                        <span>بطاقات الرعاة والمجتمع المخصصة ({customAdsList.length})</span>
                      </h3>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        أضف بطاقات لقناتك أو فعالياتك داخل التطبيق مع رابط اختياري
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                      <input
                        type="text"
                        value={newAdSponsor}
                        onChange={e => setNewAdSponsor(e.target.value)}
                        placeholder="اسم الراعي أو القسم"
                        className="min-h-[42px] bg-zinc-900 border border-zinc-800 rounded-xl px-3 text-xs text-white focus:outline-none"
                      />
                      <input
                        type="text"
                        value={newAdTitle}
                        onChange={e => setNewAdTitle(e.target.value)}
                        placeholder="نص البطاقة..."
                        className="lg:col-span-2 min-h-[42px] bg-zinc-900 border border-zinc-800 rounded-xl px-3 text-xs text-white focus:outline-none"
                      />
                      <input
                        type="text"
                        dir="ltr"
                        value={newAdBannerUrl}
                        onChange={e => setNewAdBannerUrl(e.target.value)}
                        placeholder="رابط الصورة (اختياري)"
                        className="min-h-[42px] bg-zinc-900 border border-zinc-800 rounded-xl px-3 text-xs text-white focus:outline-none"
                      />
                      <input
                        type="text"
                        dir="ltr"
                        value={newAdTargetUrl}
                        onChange={e => setNewAdTargetUrl(e.target.value)}
                        placeholder="رابط الوجهة (https://...)"
                        className="min-h-[42px] bg-zinc-900 border border-zinc-800 rounded-xl px-3 text-xs text-white focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400 font-bold">نص الزر:</span>
                        <input
                          type="text"
                          value={newAdButtonText}
                          onChange={e => setNewAdButtonText(e.target.value)}
                          placeholder="زيارة الرابط"
                          className="min-h-[38px] bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 text-xs text-white w-36 focus:outline-none"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (!newAdSponsor.trim() || !newAdTitle.trim()) {
                            notify("يرجى كتابة اسم الراعي ونص البطاقة", "error");
                            return;
                          }
                          const nextAds = [
                            ...customAdsList,
                            {
                              id: `ad_${Date.now()}`,
                              sponsor: newAdSponsor.trim(),
                              title: newAdTitle.trim(),
                              bannerUrl: newAdBannerUrl.trim(),
                              targetUrl: newAdTargetUrl.trim(),
                              buttonText: newAdButtonText.trim() || "زيارة الرابط"
                            }
                          ];
                          setCustomAdsList(nextAds);
                          setNewAdSponsor("");
                          setNewAdTitle("");
                          setNewAdBannerUrl("");
                          setNewAdTargetUrl("");
                          notify("تمت إضافة البطاقة — اضغط حفظ بالأسفل لاعتمادها");
                        }}
                        className="min-h-[42px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs cursor-pointer transition"
                      >
                        + إضافة بطاقة
                      </button>
                    </div>

                    {customAdsList.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                        {customAdsList.map((ad, idx) => (
                          <div
                            key={ad.id || idx}
                            className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {ad.bannerUrl && (
                                <img
                                  src={ad.bannerUrl}
                                  alt=""
                                  referrerPolicy="no-referrer"
                                  className="w-11 h-11 rounded-lg object-cover shrink-0 bg-zinc-950"
                                />
                              )}
                              <div className="min-w-0">
                                <span className="text-[11px] font-bold text-amber-400 block truncate">
                                  {ad.sponsor}
                                </span>
                                <p className="text-xs font-bold text-white truncate">{ad.title}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setCustomAdsList(prev => prev.filter((_, i) => i !== idx))}
                              className="w-9 h-9 rounded-lg bg-zinc-950 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 border border-zinc-800 flex items-center justify-center cursor-pointer shrink-0"
                              title="حذف"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Card 2: Official Telegram Channels & Support Links */}
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-2.5 border-b border-zinc-800/80 pb-3">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
                    <MessageCircle size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-white">روابط التواصل والدعم الرسمية</h2>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      الروابط المستخدمة داخل شاشة «مركز الدعم» للتواصل عبر تليجرام
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs text-zinc-400 font-bold mb-1.5">رابط المساعدة والشكاوى</label>
                    <input
                      type="text"
                      dir="ltr"
                      value={helpTelegramUrl}
                      onChange={e => setHelpTelegramUrl(e.target.value)}
                      className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-white font-mono focus:outline-none focus:border-sky-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 font-bold mb-1.5">رابط مجموعة الدردشة</label>
                    <input
                      type="text"
                      dir="ltr"
                      value={groupTelegramUrl}
                      onChange={e => setGroupTelegramUrl(e.target.value)}
                      className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-white font-mono focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 font-bold mb-1.5">رابط تواصل المالك / الرعاية</label>
                    <input
                      type="text"
                      dir="ltr"
                      value={donateTelegramUrl}
                      onChange={e => setDonateTelegramUrl(e.target.value)}
                      className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-xs text-white font-mono focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={saveSliderSettings}
                  disabled={isSavingSettings}
                  className="w-full min-h-[48px] bg-[#FF1744] hover:bg-rose-600 text-white font-black rounded-xl text-sm transition cursor-pointer shadow-lg shadow-[#FF1744]/15"
                >
                  {isSavingSettings ? "جاري حفظ ومزامنة الإعدادات..." : "حفظ إعدادات الإعلانات والروابط"}
                </button>
              </div>
            </div>
          )}

          {/* ============================================================
              SUB-TAB 4: SCRAPER QUEUE
             ============================================================ */}
          {platformSubTab === "queue" && (
            <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-4 sm:p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
                <div>
                  <h2 className="text-sm font-black text-white">محرك مهام السحب والـ Caching</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">جدولة وتحديث بيانات الأنمي والحلقات في الخلفية</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePurgeAllSystemCaches}
                    disabled={isPurgingAllCaches}
                    className="min-h-[42px] px-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-bold cursor-pointer transition"
                  >
                    {isPurgingAllCaches ? "جاري التفريغ..." : "تفريغ الكاش القديم بالكامل"}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearQueueLogs}
                    className="min-h-[42px] px-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold cursor-pointer transition"
                  >
                    مسح السجل
                  </button>
                </div>
              </div>

              <div className={`grid ${display.isCoverScreen ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"} gap-3`}>
                <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 text-center">
                  <span className="text-[11px] text-zinc-500 font-bold block">بالانتظار</span>
                  <span className="text-lg font-black text-zinc-300 tabular-nums">{queueStatus?.stats?.pending || 0}</span>
                </div>
                <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 text-center">
                  <span className="text-[11px] text-amber-400 font-bold block">قيد التنفيذ</span>
                  <span className="text-lg font-black text-amber-400 tabular-nums">{queueStatus?.stats?.active || 0}</span>
                </div>
                <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 text-center">
                  <span className="text-[11px] text-emerald-400 font-bold block">مكتملة</span>
                  <span className="text-lg font-black text-emerald-400 tabular-nums">{queueStatus?.stats?.completed || 0}</span>
                </div>
                <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 text-center">
                  <span className="text-[11px] text-rose-400 font-bold block">فاشلة</span>
                  <span className="text-lg font-black text-rose-400 tabular-nums">{queueStatus?.stats?.failed || 0}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-zinc-950 p-3.5 rounded-xl border border-zinc-800">
                <select
                  value={queueTaskName}
                  onChange={e => setQueueTaskName(e.target.value)}
                  className="min-h-[44px] bg-zinc-900 border border-zinc-800 rounded-xl px-3 text-xs text-white font-bold focus:outline-none"
                >
                  <option value="preWarmDashboard">تحديث الصفحة الرئيسية (preWarmDashboard)</option>
                  <option value="fetchAnimeDetails">سحب تفاصيل أنمي (fetchAnimeDetails)</option>
                  <option value="fetchEpisodeServers">سحب سيرفرات حلقة (fetchEpisodeServers)</option>
                </select>
                <input
                  type="text"
                  disabled={queueTaskName === "preWarmDashboard"}
                  value={queueTaskData}
                  onChange={e => setQueueTaskData(e.target.value)}
                  placeholder={
                    queueTaskName === "preWarmDashboard" ? "لا يتطلب مدخلات" : "أدخل معرّف الأنمي أو الحلقة..."
                  }
                  className="min-h-[44px] bg-zinc-900 border border-zinc-800 rounded-xl px-3 text-xs text-white focus:outline-none disabled:opacity-40"
                />
                <button
                  type="button"
                  onClick={handleAddQueueJob}
                  disabled={isSubmittingQueueTask || (queueTaskName !== "preWarmDashboard" && !queueTaskData.trim())}
                  className="min-h-[44px] bg-[#FF1744] hover:bg-rose-600 disabled:opacity-40 text-white font-bold px-4 rounded-xl text-xs cursor-pointer transition"
                >
                  {isSubmittingQueueTask ? "جاري الإرسال..." : "تشغيل المهمة"}
                </button>
              </div>

              {queueStatus?.jobs?.length > 0 && (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {queueStatus.jobs.map((job: any) => (
                    <div key={job.id} className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 text-xs space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-white">
                          {job.name} <span className="text-zinc-500 font-mono">({job.id})</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[11px] font-bold tabular-nums ${
                              job.status === "completed"
                                ? "text-emerald-400"
                                : job.status === "failed"
                                  ? "text-rose-400"
                                  : "text-amber-400"
                            }`}
                          >
                            {job.status} ({job.progress}%)
                          </span>
                          <button
                            type="button"
                            onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                            className="text-[11px] text-zinc-400 hover:text-white cursor-pointer"
                          >
                            {expandedJobId === job.id ? "إخفاء السجل" : "عرض السجل"}
                          </button>
                        </div>
                      </div>
                      {expandedJobId === job.id && (
                        <pre className="bg-zinc-900 p-2.5 rounded-lg text-[11px] text-zinc-300 font-mono overflow-x-auto text-left">
                          {(job.logs || []).join("\n") || "لا توجد سجلات"}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================================
              SUB-TAB 5: DATABASE MAINTENANCE & PERFORMANCE
             ============================================================ */}
          {platformSubTab === "maintenance" && (
            <div className="space-y-4">
              {/* High-Concurrency Smart RAM Micro-Cache Engine */}
              <div className="bg-[#121215] border border-emerald-500/35 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-black text-emerald-400 flex items-center gap-2">
                        <Zap size={16} />
                        <span>محرك الأداء العالي (Request Coalescing + RAM Cache)</span>
                      </h2>
                      <span className="text-xs font-bold text-zinc-300">
                        · {cacheStats?.mode !== "zero_live" ? "وضع RAM الذكي نشط" : "وضع المباشر الصافي"}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                      يدمج الطلبات المتزامنة في طلب واحد مع ذاكرة RAM مؤقتة على الخادم بدون ملفات تخزين قديمة.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleServerCacheMode("10k_smart_ram")}
                      disabled={isUpdatingCacheMode || cacheStats?.mode !== "zero_live"}
                      className={`min-h-[42px] px-3.5 rounded-xl text-xs font-black transition cursor-pointer ${
                        cacheStats?.mode !== "zero_live"
                          ? "bg-emerald-500 text-black"
                          : "bg-zinc-900 text-zinc-300 hover:text-white border border-zinc-800"
                      }`}
                    >
                      وضع RAM الذكي
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleServerCacheMode("zero_live")}
                      disabled={isUpdatingCacheMode || cacheStats?.mode === "zero_live"}
                      className={`min-h-[42px] px-3.5 rounded-xl text-xs font-black transition cursor-pointer ${
                        cacheStats?.mode === "zero_live"
                          ? "bg-cyan-500 text-black"
                          : "bg-zinc-900 text-zinc-300 hover:text-white border border-zinc-800"
                      }`}
                    >
                      مباشر 100%
                    </button>
                    <button
                      type="button"
                      onClick={handlePurgeRamCacheNow}
                      disabled={isUpdatingCacheMode}
                      className="min-h-[42px] px-3.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 text-xs font-bold cursor-pointer transition"
                    >
                      تفريغ RAM الآن
                    </button>
                  </div>
                </div>

                <div className={`grid ${display.isCoverScreen ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-5"} gap-2.5 pt-1`}>
                  <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3">
                    <div className="text-[11px] text-zinc-400">مفاتيح RAM</div>
                    <div className="text-base font-black text-white mt-0.5 tabular-nums">
                      {cacheStats?.keys ?? 0} <span className="text-[11px] text-zinc-500 font-normal">/ {cacheStats?.maxKeys ?? 300}</span>
                    </div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3">
                    <div className="text-[11px] text-zinc-400">طلبات مدمجة</div>
                    <div className="text-base font-black text-emerald-400 mt-0.5 tabular-nums">
                      {cacheStats?.coalescedSaves ?? 0}
                    </div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3">
                    <div className="text-[11px] text-zinc-400">استجابات RAM</div>
                    <div className="text-base font-black text-cyan-400 mt-0.5 tabular-nums">
                      {cacheStats?.hits ?? 0}
                    </div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3">
                    <div className="text-[11px] text-zinc-400">طلبات جارية</div>
                    <div className="text-base font-black text-amber-400 mt-0.5 tabular-nums">
                      {cacheStats?.inFlightRequests ?? 0}
                    </div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 col-span-2 sm:col-span-1">
                    <div className="text-[11px] text-zinc-400">تخزين القرص</div>
                    <div className="text-base font-black text-emerald-400 mt-0.5 tabular-nums">0</div>
                  </div>
                </div>
              </div>

              {/* Season Reset & Factory Launch Wipe Side-by-Side on wide/book posture */}
              <div
                className="grid grid-cols-1 lg:grid-cols-2 gap-4"
                style={display.isBookPosture ? { gap: "var(--fold-hinge-gap, 24px)" } : undefined}
              >
                {/* Reset Season XP & Coins */}
                <div className="bg-[#121215] border border-amber-500/30 rounded-2xl p-4 sm:p-5 space-y-4 flex flex-col justify-between">
                  <div>
                    <h2 className="text-sm font-black text-amber-400 flex items-center gap-2">
                      <RefreshCw size={16} />
                      <span>تصفير نقاط الخبرة والكوينز لموسم جديد</span>
                    </h2>
                    <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                      يعيد تعيين نقاط الخبرة والمستويات والكوينز وقوائم الأنمي لجميع الحسابات إلى الصفر مع الإبقاء على الحسابات المسجلة.
                    </p>
                  </div>

                  {!confirmResetModal ? (
                    <button
                      type="button"
                      onClick={() => setConfirmResetModal(true)}
                      className="min-h-[44px] px-5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 text-xs font-bold cursor-pointer transition w-fit"
                    >
                      بدء تصفير إحصائيات الموسم...
                    </button>
                  ) : (
                    <div className="bg-zinc-950 border border-amber-500/40 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-bold text-amber-300">
                        هل أنت متأكد؟ سيتم تصفير الكوينز والمستويات لجميع الأعضاء الحاليين.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmResetModal(false)}
                          className="min-h-[40px] px-4 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-bold cursor-pointer"
                        >
                          إلغاء
                        </button>
                        <button
                          type="button"
                          onClick={handleResetAllAccounts}
                          disabled={isResettingAll}
                          className="min-h-[40px] px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black cursor-pointer"
                        >
                          {isResettingAll ? "جاري التصفير..." : "تأكيد التصفير"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Full Factory Wipe for Official Launch */}
                <div className="bg-[#121215] border border-rose-500/40 rounded-2xl p-4 sm:p-5 space-y-4 flex flex-col justify-between">
                  <div>
                    <h2 className="text-sm font-black text-rose-400 flex items-center gap-2">
                      <AlertTriangle size={16} />
                      <span>التنظيف الشامل للإطلاق الرسمي</span>
                    </h2>
                    <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                      يحذف كافة حسابات الأعضاء، التعليقات، التذاكر، التوصيات، والكاشات لتهيئة المنصة من جديد عند الإطلاق.
                    </p>
                  </div>

                  {!confirmFactoryWipeModal ? (
                    <button
                      type="button"
                      onClick={() => setConfirmFactoryWipeModal(true)}
                      className="min-h-[44px] px-5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/50 text-rose-300 text-xs font-black cursor-pointer transition flex items-center gap-2 w-fit"
                    >
                      <Trash2 size={14} />
                      <span>تنظيف شامل للمنصة والخوادم...</span>
                    </button>
                  ) : (
                    <div className="bg-zinc-950 border border-rose-500/50 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-black text-rose-400">
                        تحذير نهائي: لا يمكن التراجع عن هذا الإجراء!
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmFactoryWipeModal(false)}
                          disabled={isFactoryWiping}
                          className="min-h-[40px] px-4 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-bold cursor-pointer"
                        >
                          إلغاء
                        </button>
                        <button
                          type="button"
                          onClick={handleFactoryWipeForLaunch}
                          disabled={isFactoryWiping}
                          className="min-h-[40px] px-5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black cursor-pointer flex items-center gap-1.5"
                        >
                          <Trash2 size={14} />
                          <span>{isFactoryWiping ? "جاري التنظيف..." : "تأكيد الحذف الشامل"}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Live Admin Ad Preview Modal */}
          <RewardedVideoAdModal
            isOpen={isPreviewingAd}
            onClose={() => setIsPreviewingAd(false)}
            onRewardEarned={() => notify("اكتملت معاينة الإعلان بنجاح داخل التطبيق!")}
            monetization={{
              mode: monetizationMode,
              directLinkUrl,
              backupDirectLinkUrl,
              videoAdUrl,
              vastTagUrl,
              admobRewardedId,
              scriptCode,
              requireClickVerification,
              cooldownSeconds: adCooldownSeconds,
              stayTime: Math.max(30, Number(stayTime) || 30),
              rewardCoins: adRewardCoins,
              rewardXp: adRewardXp,
              dailyLimit: adDailyLimit,
              customAds: customAdsList
            }}
            watchedToday={0}
            streakStep={5}
            streakBonusCoins={100}
          />
        </div>
      )}
    </>
  );
};
