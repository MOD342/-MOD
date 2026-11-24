import React from "react";
import {
  ShieldAlert,
  UserX,
  Users,
  Activity,
  MessageSquare,
  BellRing,
  Lightbulb,
  Sliders,
  Crown,
  ChevronLeft,
  Pin,
  Gift,
  Coins,
  Layers,
  LayoutTemplate
} from "lucide-react";
import { useAdminDashboard } from "./AdminDashboardContext";
import { useDeviceDisplay } from "../../hooks/useDeviceDisplay";

export const AdminOverviewTab: React.FC = () => {
  const display = useDeviceDisplay();
  const {
    workspace,
    setWorkspace,
    setModSubTab,
    setCommSubTab,
    setPlatformSubTab,
    suggestionsList,
    promoCodesList,
    pinnedAnimeList,
    hiddenAnimeList,
    setRecStatusFilter,
    sliderLimit,
    animeBannerStyle,
    mangaBannerLimit,
    mangaBannerStyle,
    dualHomeConfig,
    adStatsData,
    canAccessPlatform,
    canAccessBroadcast,
    statsMetrics
  } = useAdminDashboard();

  const todayKey = new Date().toISOString().split("T")[0];
  const todayAdViews = adStatsData?.dailyViews?.[todayKey] || 0;

  return (
    <>
      {workspace === "overview" && (
        <div className="space-y-6">
          {/* Primary KPI Grid */}
          <div className={`grid ${display.isCoverScreen ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-4"} gap-3.5`}>
            <button
              onClick={() => {
                setWorkspace("community");
                setCommSubTab("members");
              }}
              className="min-h-[96px] bg-[#121215] hover:bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 text-right transition cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-zinc-400">إجمالي الأعضاء</span>
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Users size={17} />
                </div>
              </div>
              <div className="text-2xl font-black text-white tabular-nums">{statsMetrics.totalUsers}</div>
              <div className="text-[11px] text-zinc-500 mt-1 flex items-center justify-between tabular-nums">
                <span>متوسط المستوى: {statsMetrics.avgLevel}</span>
                <ChevronLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" />
              </div>
            </button>

            <button
              onClick={() => {
                setWorkspace("moderation");
                setModSubTab("reports");
              }}
              className="min-h-[96px] bg-[#121215] hover:bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 text-right transition cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-zinc-400">البلاغات المعلّقة</span>
                <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
                  <ShieldAlert size={17} />
                </div>
              </div>
              <div className="text-2xl font-black text-white tabular-nums">{statsMetrics.pendingReports}</div>
              <div className="text-[11px] text-zinc-500 mt-1 flex items-center justify-between tabular-nums">
                <span>تمت معالجة {statsMetrics.resolvedReports} بلاغ</span>
                <ChevronLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" />
              </div>
            </button>

            <button
              onClick={() => {
                setWorkspace("moderation");
                setModSubTab("recommendations");
                setRecStatusFilter("pending");
              }}
              className="min-h-[96px] bg-[#121215] hover:bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 text-right transition cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-zinc-400">توصيات بانتظار الاعتماد</span>
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <Lightbulb size={17} />
                </div>
              </div>
              <div className="text-2xl font-black text-white tabular-nums">{statsMetrics.pendingRecs}</div>
              <div className="text-[11px] text-zinc-500 mt-1 flex items-center justify-between tabular-nums">
                <span>{statsMetrics.approvedRecs} توصية معتمدة</span>
                <ChevronLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" />
              </div>
            </button>

            <button
              onClick={() => {
                setWorkspace("moderation");
                setModSubTab("suggestions");
              }}
              className="min-h-[96px] bg-[#121215] hover:bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 text-right transition cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-zinc-400">التذاكر والشكاوى</span>
                <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                  <MessageSquare size={17} />
                </div>
              </div>
              <div className="text-2xl font-black text-white tabular-nums">{suggestionsList.length}</div>
              <div className="text-[11px] text-zinc-500 mt-1 flex items-center justify-between">
                <span>رسائل وتذاكر الأعضاء</span>
                <ChevronLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" />
              </div>
            </button>
          </div>

          {/* Two-Column Actionable Summary (Foldable Book-Posture Safe) */}
          <div
            className="grid grid-cols-1 lg:grid-cols-3 gap-5"
            style={display.isBookPosture ? { gap: "var(--fold-hinge-gap, 24px)" } : undefined}
          >
            {/* Quick Access Grid */}
            <div className="lg:col-span-2 bg-[#121215] border border-zinc-800/80 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                <h2 className="text-sm font-black text-white flex items-center gap-2">
                  <Activity size={16} className="text-[#FF1744]" />
                  <span>الوصول السريع والإعدادات</span>
                </h2>
                <span className="text-[11px] text-zinc-500 font-bold">مزامنة فورية</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {canAccessPlatform && (
                  <button
                    onClick={() => {
                      setWorkspace("platform");
                      setPlatformSubTab("links_ads");
                    }}
                    className="min-h-[64px] flex items-center justify-between p-3.5 rounded-xl bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/20 transition cursor-pointer text-right"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                        <Coins size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">إعدادات الإعلانات وادعم التطبيق</div>
                        <div className="text-[11px] text-amber-300/90 mt-0.5 tabular-nums truncate">
                          مشاهدات اليوم: {todayAdViews} · الكلي: {(adStatsData?.totalViews || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <ChevronLeft size={16} className="text-zinc-500 shrink-0" />
                  </button>
                )}

                {canAccessPlatform && (
                  <button
                    onClick={() => {
                      setWorkspace("platform");
                      setPlatformSubTab("slider");
                    }}
                    className="min-h-[64px] flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 transition cursor-pointer text-right"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#FF1744]/10 text-[#FF1744] flex items-center justify-center shrink-0">
                        <LayoutTemplate size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">البانرات والسلايدر (أنمي ومانجا)</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5 tabular-nums truncate">
                          أنمي: {sliderLimit || 5} شرائح ({animeBannerStyle || "classic"}) · مانجا: {mangaBannerLimit || 5} شرائح ({mangaBannerStyle || "split"})
                        </div>
                      </div>
                    </div>
                    <ChevronLeft size={16} className="text-zinc-500 shrink-0" />
                  </button>
                )}

                {canAccessPlatform && (
                  <button
                    onClick={() => {
                      setWorkspace("platform");
                      setPlatformSubTab("homes");
                    }}
                    className="min-h-[64px] flex items-center justify-between p-3.5 rounded-xl bg-purple-500/5 hover:bg-purple-500/10 border border-purple-500/20 transition cursor-pointer text-right"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                        <Layers size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">الشاشتان الرئيسيتان والأقسام</div>
                        <div className="text-[11px] text-purple-300/90 mt-0.5 truncate">
                          الافتراضي: {dualHomeConfig?.defaultVisitorHome === "manga" ? "المانجا والمانهوا" : "الأنمي"} ·{" "}
                          {dualHomeConfig?.enableAnimeHome !== false && dualHomeConfig?.enableMangaHome !== false
                            ? "كلا الشاشتين مفعّلتان"
                            : dualHomeConfig?.enableMangaHome === false
                            ? "الأنمي فقط"
                            : "المانجا فقط"}
                        </div>
                      </div>
                    </div>
                    <ChevronLeft size={16} className="text-zinc-500 shrink-0" />
                  </button>
                )}

                {canAccessBroadcast && (
                  <button
                    onClick={() => setWorkspace("broadcast")}
                    className="min-h-[64px] flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 transition cursor-pointer text-right"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
                        <BellRing size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">إرسال إشعار عام أو خاص</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5 truncate">مع ربط مباشر بأي أنمي أو قسم</div>
                      </div>
                    </div>
                    <ChevronLeft size={16} className="text-zinc-500 shrink-0" />
                  </button>
                )}

                <button
                  onClick={() => {
                    setWorkspace("community");
                    setCommSubTab("roles");
                  }}
                  className="min-h-[64px] flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 transition cursor-pointer text-right"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-400 flex items-center justify-center shrink-0">
                      <Crown size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">طاقم الإشراف والرتب</div>
                      <div className="text-[11px] text-zinc-400 mt-0.5 tabular-nums truncate">
                        {statsMetrics.totalStaff} مشرفين ومديرين
                      </div>
                    </div>
                  </div>
                  <ChevronLeft size={16} className="text-zinc-500 shrink-0" />
                </button>

                <button
                  onClick={() => {
                    setWorkspace("community");
                    setCommSubTab("bans");
                  }}
                  className="min-h-[64px] flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 transition cursor-pointer text-right"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center shrink-0">
                      <UserX size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">سجل الحظر والقيود</div>
                      <div className="text-[11px] text-zinc-400 mt-0.5 tabular-nums truncate">
                        {statsMetrics.totalBans} محظور · {statsMetrics.mutedCount} مكتوم
                      </div>
                    </div>
                  </div>
                  <ChevronLeft size={16} className="text-zinc-500 shrink-0" />
                </button>

                <button
                  onClick={() => {
                    setWorkspace("community");
                    setCommSubTab("promos");
                  }}
                  className="min-h-[64px] flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 transition cursor-pointer text-right"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                      <Gift size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">أكواد الهدايا والإهداء الجماعي</div>
                      <div className="text-[11px] text-zinc-400 mt-0.5 tabular-nums truncate">
                        {promoCodesList.filter(p => p.active).length} كود نشط · {pinnedAnimeList.length} أنمي مثبت · {hiddenAnimeList.length} مخفي
                      </div>
                    </div>
                  </div>
                  <ChevronLeft size={16} className="text-zinc-500 shrink-0" />
                </button>
              </div>

              {/* Economy & Activity Summary Bar */}
              <div className={`grid ${display.isCoverScreen ? "grid-cols-1" : "grid-cols-3"} gap-3 pt-2`}>
                <div className="bg-zinc-950/70 border border-zinc-800/70 rounded-xl p-3">
                  <span className="text-[11px] text-zinc-500 font-bold block">الكوينز المتداولة</span>
                  <span className="text-sm font-black text-amber-400 mt-0.5 block tabular-nums">
                    {statsMetrics.totalCoins.toLocaleString()}
                  </span>
                </div>
                <div className="bg-zinc-950/70 border border-zinc-800/70 rounded-xl p-3">
                  <span className="text-[11px] text-zinc-500 font-bold block">مجموع نقاط الخبرة</span>
                  <span className="text-sm font-black text-sky-400 mt-0.5 block tabular-nums">
                    {statsMetrics.totalXP.toLocaleString()} XP
                  </span>
                </div>
                <div className="bg-zinc-950/70 border border-zinc-800/70 rounded-xl p-3">
                  <span className="text-[11px] text-zinc-500 font-bold block">أعلى مستوى مسجل</span>
                  <span className="text-sm font-black text-emerald-400 mt-0.5 block tabular-nums">
                    Lvl {statsMetrics.maxLevel}
                  </span>
                </div>
              </div>
            </div>

            {/* Level Distribution Card */}
            <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="border-b border-zinc-800/80 pb-3 flex items-center justify-between">
                <h2 className="text-sm font-black text-white">توزيع مستويات الأعضاء</h2>
                <span className="text-xs text-zinc-500 font-bold tabular-nums">{statsMetrics.totalUsers} عضو</span>
              </div>

              <div className="space-y-3.5 text-xs">
                {[
                  { label: "مبتدئ (1 - 5)", count: statsMetrics.segments.starter, color: "bg-rose-500" },
                  { label: "نشط (6 - 15)", count: statsMetrics.segments.regular, color: "bg-amber-500" },
                  { label: "خبير (16 - 30)", count: statsMetrics.segments.veteran, color: "bg-sky-500" },
                  { label: "نخبة (30+)", count: statsMetrics.segments.elite, color: "bg-emerald-500" }
                ].map((seg, i) => {
                  const pct = Math.round((seg.count / Math.max(1, statsMetrics.totalUsers)) * 100);
                  return (
                    <div key={i} className="space-y-1.5">
                      <div className="flex justify-between text-xs tabular-nums">
                        <span className="text-zinc-400 font-semibold">{seg.label}</span>
                        <span className="text-zinc-200 font-bold">
                          {seg.count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
                        <div className={`h-full ${seg.color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
