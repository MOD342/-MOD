import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  Bell,
  Trash2,
  Check,
  MessageSquare,
  Trophy,
  Play,
  Info,
  ShieldAlert,
  CheckCircle,
  Flame,
  Loader2,
  ChevronDown,
  ChevronUp,
  Swords
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { notificationsService, AppNotification } from '../services/notificationsService';
import { useAuth } from '../contexts/AuthContext';
import { formatArabicDistanceToNow } from '../utils/dateFormatter';

interface NotificationsViewProps {
  onBack: () => void;
  onNavigate?: (route: string, params?: any) => void;
}

type NotificationCategory = 'all' | 'social' | 'episodes' | 'system';

export default function NotificationsView({ onBack, onNavigate }: NotificationsViewProps) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<NotificationCategory>('all');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const toggleExpand = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    loadNotifications();
  }, [user]);

  const loadNotifications = async () => {
    setLoading(true);
    let allNotifs: AppNotification[] = [];

    try {
      const globals = await notificationsService.getGlobalNotifications();
      const globalsWithFlag = globals.map((n) => ({ ...n, isGlobal: true, read: true }));
      allNotifs = [...globalsWithFlag];

      if (user) {
        const userNotifs = await notificationsService.getUserNotifications(user.id);
        allNotifs = [...allNotifs, ...userNotifs];
      }

      allNotifs.sort((a, b) => {
        const timeA = a.createdAt?.toMillis
          ? a.createdAt.toMillis()
          : a.createdAt?.toDate
          ? a.createdAt.toDate().getTime()
          : 0;
        const timeB = b.createdAt?.toMillis
          ? b.createdAt.toMillis()
          : b.createdAt?.toDate
          ? b.createdAt.toDate().getTime()
          : 0;
        return timeB - timeA;
      });

      setNotifications(allNotifs);
    } catch (e) {
      console.error('Error loading notifications', e);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (n: AppNotification) => {
    if (!user || n.read || (n as any).isGlobal) return;
    try {
      await notificationsService.markAsRead(user.id, n.id);
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, read: true } : item))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    try {
      const unreadUserNotifs = notifications.filter((n) => !n.read && !(n as any).isGlobal);
      const promises = unreadUserNotifs.map((n) => notificationsService.markAsRead(user.id, n.id));
      await Promise.all(promises);

      setNotifications((prev) =>
        prev.map((n) => (!(n as any).isGlobal ? { ...n, read: true } : n))
      );
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteNotification = async (e: React.MouseEvent, n: AppNotification) => {
    e.stopPropagation();
    if (!user || (n as any).isGlobal) return;
    try {
      await notificationsService.deleteUserNotification(user.id, n.id);
      setNotifications((prev) => prev.filter((item) => item.id !== n.id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearAll = async () => {
    if (!user) return;
    try {
      await notificationsService.clearAllUserNotifications(user.id);
      setNotifications((prev) => prev.filter((n) => (n as any).isGlobal));
      setConfirmClearAll(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotificationClick = async (n: AppNotification) => {
    if (user && !n.read && !(n as any).isGlobal) {
      await handleMarkAsRead(n);
    }

    if (!n.linkTo) return;

    if (n.linkTo === 'rewards') {
      onNavigate?.('rewards');
    } else if (n.linkTo.startsWith('arena_room:')) {
      const code = n.linkTo.split(':')[1] || '';
      onNavigate?.('games', { initialTab: 'games', initialRoomCode: code });
    } else if (n.linkTo === 'games') {
      onNavigate?.('games');
    } else if (n.linkTo === 'tournaments') {
      onNavigate?.('tournaments');
    } else if (n.linkTo === 'suggestions_hub') {
      onNavigate?.('suggestions_hub');
    } else if (n.linkTo === 'leaderboard') {
      onNavigate?.('leaderboard');
    } else if (n.linkTo.startsWith('comment_view')) {
      const parts = n.linkTo.split(':');
      const animeId = parts[1] || n.metadata?.animeId;
      const commentId = parts[2] || n.metadata?.commentId;
      if (animeId) {
        onNavigate?.('anime_comments', { animeId, focusCommentId: commentId });
      }
    } else if (n.linkTo.startsWith('anime_details')) {
      const parts = n.linkTo.split(':');
      const animeId = parts[1] || n.metadata?.animeId;
      if (animeId) {
        onNavigate?.('anime_details', { id: animeId });
      }
    } else if (n.linkTo.startsWith('watch_episode')) {
      const parts = n.linkTo.split(':');
      const animeId = parts[1] || n.metadata?.animeId;
      const epNum = parts[2] || '1';
      if (animeId) {
        onNavigate?.('anime_details', { id: animeId, autoplayEpisode: Number(epNum) });
      }
    } else {
      onNavigate?.('home');
    }
  };

  const getIcon = (type: string, titleText: string) => {
    const isLike = titleText?.includes('إعجاب') || titleText?.includes('عجب');
    if (isLike && type === 'social') {
      return <Flame size={16} className="text-orange-500" />;
    }
    switch (type) {
      case 'tournament':
        return <Trophy size={15} className="text-amber-400" />;
      case 'episode':
        return <Play size={15} className="text-[#FF1744] fill-current" />;
      case 'social':
        return <MessageSquare size={15} className="text-emerald-400" />;
      case 'system':
        return <ShieldAlert size={15} className="text-sky-400" />;
      default:
        return <Info size={15} className="text-zinc-400" />;
    }
  };

  const unreadCount = notifications.filter((n) => !n.read && !(n as any).isGlobal).length;

  const filteredNotifications = notifications.filter((n) => {
    if (activeCategory === 'all') return true;
    if (activeCategory === 'social') return n.type === 'social';
    if (activeCategory === 'episodes') return n.type === 'episode';
    if (activeCategory === 'system')
      return n.type === 'system' || n.type === 'tournament' || (n as any).isGlobal;
    return true;
  });

  const getCategoryCount = (cat: NotificationCategory) => {
    if (cat === 'all') return notifications.length;
    if (cat === 'social') return notifications.filter((n) => n.type === 'social').length;
    if (cat === 'episodes') return notifications.filter((n) => n.type === 'episode').length;
    if (cat === 'system')
      return notifications.filter(
        (n) => n.type === 'system' || n.type === 'tournament' || (n as any).isGlobal
      ).length;
    return 0;
  };

  return (
    <div className="min-h-screen bg-black pb-20 pt-4 font-sans text-right select-none" dir="rtl">
      <div className="max-w-2xl mx-auto px-4">
        {/* Clean Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="w-10 h-10 bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 rounded-xl text-zinc-300 hover:text-white transition flex items-center justify-center cursor-pointer active:scale-95"
              aria-label="الرجوع"
            >
              <ChevronRight size={20} />
            </button>
            <div className="flex items-center gap-2.5">
              <h1 className="text-white font-black text-lg tracking-tight">الإشعارات</h1>
              {unreadCount > 0 && (
                <span className="text-xs font-mono tabular-nums text-zinc-400">
                  · {unreadCount} غير مقروء
                </span>
              )}
            </div>
          </div>

          {user && notifications.length > 0 && (
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-bold text-zinc-200 hover:text-white transition py-2 px-3.5 rounded-xl flex items-center gap-1.5 active:scale-95 cursor-pointer"
                >
                  <CheckCircle size={13} className="text-emerald-400" />
                  <span>قراءة الكل</span>
                </button>
              )}
              {notifications.some((n) => !(n as any).isGlobal) && !confirmClearAll && (
                <button
                  onClick={() => setConfirmClearAll(true)}
                  className="text-xs font-bold text-zinc-400 hover:text-red-400 transition px-2.5 py-2 rounded-xl hover:bg-zinc-900 cursor-pointer"
                >
                  مسح الكل
                </button>
              )}
              {confirmClearAll && (
                <div className="flex items-center gap-1.5 bg-zinc-900 border border-red-500/30 rounded-xl p-1">
                  <button
                    onClick={handleClearAll}
                    className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold cursor-pointer"
                  >
                    تأكيد الحذف
                  </button>
                  <button
                    onClick={() => setConfirmClearAll(false)}
                    className="px-2 py-1 rounded-lg text-zinc-400 hover:text-white text-[11px] font-bold cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Segmented Category Filter Controls */}
        <div className="flex items-center gap-1.5 p-1 bg-zinc-950 border border-white/10 rounded-xl mb-5 overflow-x-auto hide-scrollbar">
          {[
            { id: 'all', label: 'الكل', count: getCategoryCount('all') },
            { id: 'social', label: 'التفاعلات', count: getCategoryCount('social') },
            { id: 'episodes', label: 'الحلقات', count: getCategoryCount('episodes') },
            { id: 'system', label: 'النظام', count: getCategoryCount('system') }
          ].map((tab) => {
            const isSelected = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id as NotificationCategory)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold shrink-0 transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={`text-[11px] font-mono tabular-nums ${
                      isSelected ? 'text-zinc-300' : 'text-zinc-500'
                    }`}
                  >
                    ({tab.count})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Notifications List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-zinc-400" size={22} />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center justify-center border border-white/5 rounded-2xl bg-zinc-950/40">
            <div className="w-12 h-12 rounded-2xl bg-zinc-900/80 border border-white/10 flex items-center justify-center text-zinc-500 mb-3">
              <Bell size={20} />
            </div>
            <p className="text-sm font-bold text-zinc-400">لا توجد إشعارات</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5 border border-white/10 rounded-2xl bg-zinc-950/40 overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              {filteredNotifications.map((n, idx) => {
                const isGlobal = (n as any).isGlobal;
                const isUnread = !n.read && !isGlobal;
                const expanded = !!expandedIds[n.id];
                const notifKey = `${isGlobal ? 'global' : 'user'}-${n.id || idx}-${idx}`;

                return (
                  <motion.div
                    key={notifKey}
                    layoutId={`notif-${notifKey}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.18 }}
                    onClick={() => handleNotificationClick(n)}
                    className={`p-4 transition-colors cursor-pointer flex items-start gap-3.5 group ${
                      isUnread
                        ? 'bg-zinc-900/70 hover:bg-zinc-900'
                        : 'hover:bg-zinc-900/40'
                    }`}
                  >
                    {/* Thumbnail or Icon */}
                    <div className="w-11 h-11 bg-zinc-900 rounded-xl flex items-center justify-center shrink-0 overflow-hidden border border-white/10">
                      {n.imageUrl ? (
                        <img
                          src={n.imageUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        getIcon(n.type, n.title)
                      )}
                    </div>

                    {/* Text Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(e, n.id);
                          }}
                          className={`text-sm font-bold ${
                            expanded ? '' : 'line-clamp-1'
                          } ${
                            isGlobal
                              ? 'text-amber-400'
                              : isUnread
                              ? 'text-white'
                              : 'text-zinc-200'
                          }`}
                        >
                          {n.title}
                        </h4>

                        {/* Quiet inline metadata */}
                        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 shrink-0 font-mono tabular-nums">
                          {isGlobal && <span className="text-amber-400/90 font-sans">إعلان</span>}
                          {!isGlobal && isUnread && (
                            <span className="text-[#FF1744] font-sans font-bold">جديد</span>
                          )}
                          {(isGlobal || isUnread) && <span aria-hidden="true">·</span>}
                          <span className="font-sans">{formatArabicDistanceToNow(n.createdAt)}</span>
                        </div>
                      </div>

                      <p
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(e, n.id);
                        }}
                        className={`text-xs leading-relaxed mt-1 ${
                          isUnread ? 'text-zinc-200' : 'text-zinc-400'
                        } ${expanded ? '' : 'line-clamp-2'}`}
                      >
                        {n.body}
                      </p>

                      {n.linkTo?.startsWith('arena_room:') && (
                        <div className="mt-2.5">
                          <span className="inline-flex items-center gap-1.5 bg-[#FF1744] hover:bg-rose-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition">
                            <Swords size={13} />
                            <span>دخول الحلبة (#{n.linkTo.split(':')[1]})</span>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center gap-1 shrink-0 self-center">
                      {isUnread && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsRead(n);
                          }}
                          className="w-8 h-8 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition flex items-center justify-center cursor-pointer"
                          title="تحديد كمقروء"
                        >
                          <Check size={15} />
                        </button>
                      )}

                      {!isGlobal && (
                        <button
                          onClick={(e) => handleDeleteNotification(e, n)}
                          className="w-8 h-8 hover:bg-red-500/10 rounded-lg text-zinc-500 hover:text-red-400 transition flex items-center justify-center cursor-pointer"
                          title="حذف"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => toggleExpand(e, n.id)}
                        className="w-8 h-8 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition flex items-center justify-center cursor-pointer"
                        title={expanded ? 'تصغير' : 'توسيع'}
                      >
                        {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
