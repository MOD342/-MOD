import React from "react";
import { Search, BellRing, Send } from "lucide-react";

import { useAdminDashboard } from "./AdminDashboardContext";
import { useDeviceDisplay } from "../../hooks/useDeviceDisplay";

export const AdminBroadcastTab: React.FC = () => {
  const display = useDeviceDisplay();
  const {
    workspace,
    notifTitle,
    setNotifTitle,
    notifBody,
    setNotifBody,
    notifType,
    setNotifType,
    notifImageUrl,
    setNotifImageUrl,
    notifTargetChoice,
    setNotifTargetChoice,
    notifTargetUid,
    setNotifTargetUid,
    interactiveLinkChoice,
    setInteractiveLinkChoice,
    animeSearchQuery,
    setAnimeSearchQuery,
    animeSuggestions,
    setAnimeSuggestions,
    isSearchingAnime,
    selectedNotifAnime,
    setSelectedNotifAnime,
    isSendingNotif,
    handleSendNotification,
    canAccessBroadcast
  } = useAdminDashboard();

  return (
    <>
        {workspace === 'broadcast' && canAccessBroadcast && (
          <div
            className={`grid grid-cols-1 ${display.isBookPosture ? 'md:grid-cols-2' : 'lg:grid-cols-3'} gap-5`}
            style={display.isBookPosture ? { gap: 'var(--fold-hinge-gap, 28px)' } : undefined}
          >
            {/* Composer Form */}
            <div className={`${display.isBookPosture ? '' : 'lg:col-span-2'} bg-[#121215] border border-zinc-800/80 rounded-2xl p-4 sm:p-5 space-y-4`}>
              <div className="border-b border-zinc-800/80 pb-3">
                <h2 className="text-sm font-black text-white">إرسال إشعار تفاعلي</h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  بث تنبيه لجميع المستخدمين أو لعضو محدد مع إمكانية ربطه بأنمي أو صفحة داخلية
                </p>
              </div>

              {/* Target Audience */}
              <div className={`grid ${display.isCoverScreen ? 'grid-cols-1' : 'grid-cols-2'} gap-2 bg-zinc-950 p-1.5 rounded-xl border border-zinc-800`}>
                <button
                  type="button"
                  onClick={() => setNotifTargetChoice('all')}
                  className={`min-h-[44px] px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                    notifTargetChoice === 'all' ? 'bg-[#FF1744] text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  بث عام لجميع الأعضاء
                </button>
                <button
                  type="button"
                  onClick={() => setNotifTargetChoice('specific')}
                  className={`min-h-[44px] px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                    notifTargetChoice === 'specific' ? 'bg-[#FF1744] text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  إرسال لعضو محدد
                </button>
              </div>

              {notifTargetChoice === 'specific' && (
                <div>
                  <label className="block text-[11px] text-zinc-400 font-bold mb-1">معرّف المستلم (@username أو UID)</label>
                  <input
                    type="text"
                    value={notifTargetUid}
                    onChange={e => setNotifTargetUid(e.target.value)}
                    placeholder="اكتب اسم المستخدم أو الـ UID..."
                    className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 font-bold mb-1">عنوان الإشعار</label>
                  <input
                    type="text"
                    value={notifTitle}
                    onChange={e => setNotifTitle(e.target.value)}
                    placeholder="مثال: حلقة جديدة متوفرة الآن"
                    className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 font-bold mb-1">تصنيف الإشعار</label>
                  <select
                    value={notifType}
                    onChange={e => setNotifType(e.target.value)}
                    className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-zinc-600"
                  >
                    <option value="system">تنبيه نظام</option>
                    <option value="episode">حلقة جديدة</option>
                    <option value="anime">أنمي جديد</option>
                    <option value="tournament">بطولة وفعاليات</option>
                    <option value="reward">مكافآت وجوائز</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 font-bold mb-1">محتوى الإشعار</label>
                <textarea
                  rows={3}
                  value={notifBody}
                  onChange={e => setNotifBody(e.target.value)}
                  placeholder="اكتب نص الإشعار..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-zinc-600 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 font-bold mb-1">وجهة الانتقال عند النقر</label>
                  <select
                    value={interactiveLinkChoice}
                    onChange={e => {
                      setInteractiveLinkChoice(e.target.value as any);
                      setSelectedNotifAnime(null);
                      setAnimeSearchQuery('');
                      setAnimeSuggestions([]);
                    }}
                    className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-zinc-600"
                  >
                    <option value="none">بدون انتقال</option>
                    <option value="anime">صفحة أنمي محدد</option>
                    <option value="rewards">صفحة الجوائز والمكافآت</option>
                    <option value="games">ساحة الألعاب</option>
                    <option value="leaderboard">قائمة المتصدرين</option>
                    <option value="community">منتدى المجتمع</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 font-bold mb-1">رابط صورة مرفقة (اختياري)</label>
                  <input
                    type="text"
                    value={notifImageUrl}
                    onChange={e => setNotifImageUrl(e.target.value)}
                    placeholder="https://..."
                    dir="ltr"
                    className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600"
                  />
                </div>
              </div>

              {/* Working Anime Search Linker */}
              {interactiveLinkChoice === 'anime' && (
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 space-y-2.5">
                  <label className="block text-[11px] text-zinc-300 font-bold">
                    ابحث عن الأنمي لربط الإشعار به (بالعربية أو الإنجليزية)
                  </label>
                  {!selectedNotifAnime ? (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input
                          type="text"
                          value={animeSearchQuery}
                          onChange={e => setAnimeSearchQuery(e.target.value)}
                          placeholder="اكتب اسم الأنمي..."
                          className="w-full min-h-[44px] bg-zinc-900 border border-zinc-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600"
                        />
                      </div>

                      {animeSearchQuery.trim().length >= 2 && (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-h-48 overflow-y-auto divide-y divide-zinc-800/60">
                          {isSearchingAnime ? (
                            <div className="py-4 text-center text-xs text-zinc-400">جاري البحث...</div>
                          ) : animeSuggestions.length > 0 ? (
                            animeSuggestions.map((a, idx) => (
                              <button
                                type="button"
                                key={`notif-sug-${a._id || idx}-${idx}`}
                                onClick={() => {
                                  setSelectedNotifAnime(a);
                                  setAnimeSearchQuery(a.title);
                                  setAnimeSuggestions([]);
                                }}
                                className="w-full min-h-[52px] p-2.5 hover:bg-zinc-800 flex items-center gap-2.5 text-right cursor-pointer transition"
                              >
                                <img
                                  src={a.posterUrl}
                                  alt=""
                                  referrerPolicy="no-referrer"
                                  className="w-8 h-11 rounded object-cover shrink-0 bg-zinc-950"
                                />
                                <span className="text-xs font-bold text-white truncate">{a.title}</span>
                              </button>
                            ))
                          ) : (
                            <div className="py-4 text-center text-xs text-zinc-500">لا توجد نتائج مطابقة</div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-zinc-900 border border-emerald-500/30 p-2.5 rounded-xl">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={selectedNotifAnime.posterUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-9 h-12 rounded object-cover shrink-0"
                        />
                        <span className="text-xs font-bold text-emerald-400 truncate">{selectedNotifAnime.title}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedNotifAnime(null);
                          setAnimeSearchQuery('');
                        }}
                        className="min-h-[44px] px-3 text-xs text-rose-400 font-bold cursor-pointer hover:text-rose-300"
                      >
                        تغيير
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={handleSendNotification}
                disabled={
                  isSendingNotif ||
                  !notifTitle.trim() ||
                  !notifBody.trim() ||
                  (interactiveLinkChoice === 'anime' && !selectedNotifAnime)
                }
                className="w-full min-h-[48px] bg-[#FF1744] hover:bg-rose-600 disabled:opacity-40 text-white font-black py-3 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Send size={14} />
                <span>{isSendingNotif ? 'جاري الإرسال...' : 'إرسال الإشعار الآن'}</span>
              </button>
            </div>

            {/* Live Notification Card Preview */}
            <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-4 sm:p-5 space-y-4 h-fit">
              <div className="border-b border-zinc-800/80 pb-3">
                <h3 className="text-sm font-black text-white">معاينة حية للإشعار</h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">كيف سيظهر الإشعار في صفحة إشعارات العضو</p>
              </div>

              <div className="bg-[#141414] border border-neutral-800 rounded-2xl p-3.5 flex items-start gap-3">
                {notifImageUrl || selectedNotifAnime?.posterUrl ? (
                  <img
                    src={notifImageUrl || selectedNotifAnime?.posterUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-11 h-14 rounded-xl object-cover shrink-0 bg-neutral-900 border border-neutral-800"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-[#FF1744]/10 border border-[#FF1744]/20 flex items-center justify-center text-[#FF1744] shrink-0">
                    <BellRing size={18} />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white truncate">
                      {notifTitle.trim() || 'عنوان الإشعار يظهر هنا'}
                    </span>
                    <span className="text-[10px] text-[#FF1744] font-bold shrink-0">جديد · الآن</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed line-clamp-3">
                    {notifBody.trim() || 'محتوى الرسالة التنبيهية سيظهر هنا بنفس تنسيق صفحة الإشعارات.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
    </>
  );
};
