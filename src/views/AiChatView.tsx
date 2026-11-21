import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Send,
  Award,
  Trash2,
  Copy,
  Check,
  RotateCcw,
  AlertCircle,
  Gamepad2,
  Zap,
  Star,
  Film,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { isStaffEmail } from '../services/moderationService';
import { listService } from '../services/listService';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';

export interface ChatAnimeCard {
  id: string;
  title: string;
  posterUrl: string;
  rating: number | null;
  type: string;
  episodes: number | null;
  year: number | null;
  genres: string[];
  mediaType?: 'anime' | 'manga';
  originLabel?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  animes?: ChatAnimeCard[];
  createdAt?: number;
}

const STARTER_SUGGESTIONS = [
  'رشّح لي أنمي يخطف الأنفاس من أول حلقة',
  'أبغى أنمي قصير ومكتمل بنهاية فخمة',
  'وش رأيك بأقوى آرك شفته في عالم الأنمي؟',
  'أعطني أنمي غموض وتحقيق بمستوى Death Note',
];

const SESSION_KEY = 'otaku_friend_session_v1';

function renderFormattedText(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-black text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export default function AiChatView({
  onBack,
  onNavigate,
  onMangaClick,
}: {
  onBack: () => void;
  onNavigate?: (viewName: string, props?: any) => void;
  onMangaClick?: (id: string) => void;
}) {
  const { user, userData, userRole } = useAuth();
  const display = useDeviceDisplay();

  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState<{ message: string; lastFailedPrompt?: string } | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [favoriteAnimeTitles, setFavoriteAnimeTitles] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const userDisplayName =
    userData?.displayName?.trim() ||
    user?.displayName?.trim() ||
    '';

  const displayLabel = userDisplayName || 'يا صديقي';

  const [chat, setChat] = useState<ChatMessage[]>(() => {
    try {
      // Remove legacy static-history storage so no pre-saved welcome message appears
      localStorage.removeItem('otaku_chat_history');
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((m: any, idx: number) => ({
            id: m.id || `msg-${idx}`,
            sender: m.sender === 'user' ? 'user' : 'bot',
            text: String(m.text || ''),
            animes: Array.isArray(m.animes) ? m.animes : undefined,
            createdAt: m.createdAt,
          }));
        }
      }
    } catch {
      // ignore storage failure
    }
    return [];
  });

  const MIN_LEVEL = 7;
  const userLevel = userData?.level || 1;
  const isStaff =
    userRole === 'owner' ||
    userRole === 'admin' ||
    userRole === 'moderator' ||
    isStaffEmail(user?.email);
  const isUnlocked = userLevel >= MIN_LEVEL || isStaff;

  // Load a lightweight taste snapshot from user's anime library (non-blocking)
  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;
    let active = true;
    listService
      .getAnimeEntries(uid)
      .then((entries) => {
        if (!active || !Array.isArray(entries)) return;
        const prioritized = [...entries]
          .sort((a, b) => {
            const aFav = a.isFavorite ? 2 : a.status === 'watching' || a.status === 'completed' ? 1 : 0;
            const bFav = b.isFavorite ? 2 : b.status === 'watching' || b.status === 'completed' ? 1 : 0;
            return bFav - aFav || (b.score || 0) - (a.score || 0);
          })
          .map((e) => e.title)
          .filter(Boolean)
          .slice(0, 8);
        setFavoriteAnimeTitles(prioritized);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.id]);

  // Persist current live conversation across quick navigation to anime details and back
  useEffect(() => {
    try {
      if (chat.length === 0) {
        sessionStorage.removeItem(SESSION_KEY);
      } else {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(chat.slice(-24)));
      }
    } catch {
      // ignore storage quota errors
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat, loading, errorState]);

  // Auto-grow textarea height smoothly up to 4 lines
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [msg]);

  const sendPrompt = async (rawText: string, isRetry = false) => {
    const cleanText = rawText.trim().slice(0, 1200);
    if (!cleanText || loading || !isUnlocked) return;

    setErrorState(null);
    setConfirmClear(false);

    let historyForApi: ChatMessage[];
    if (isRetry) {
      historyForApi = chat;
    } else {
      const userEntry: ChatMessage = {
        id: `u-${Date.now()}`,
        sender: 'user',
        text: cleanText,
        createdAt: Date.now(),
      };
      historyForApi = [...chat, userEntry];
      setChat(historyForApi);
      setMsg('');
    }

    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          userName: userDisplayName,
          userLevel,
          favoriteAnimes: favoriteAnimeTitles,
          messages: historyForApi.slice(-14).map((m) => ({
            sender: m.sender,
            text: m.text,
          })),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success || !data.text) {
        setErrorState({
          message: data.message || 'تعذر وصول الرسالة الآن، جرّب إرسالها مرة ثانية.',
          lastFailedPrompt: cleanText,
        });
      } else {
        setChat((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            sender: 'bot',
            text: String(data.text),
            animes: Array.isArray(data.animes) ? data.animes : [],
            createdAt: Date.now(),
          },
        ]);
      }
    } catch {
      setErrorState({
        message: 'انقطع الاتصال مؤقتاً. تأكد من الإنترنت وأعد المحاولة.',
        lastFailedPrompt: cleanText,
      });
    } finally {
      setLoading(false);
    }
  };

  const clearChatHistory = () => {
    setChat([]);
    setErrorState(null);
    setConfirmClear(false);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {}
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsgId(id);
      setTimeout(() => setCopiedMsgId((curr) => (curr === id ? null : curr)), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const openCardDetails = (card: ChatAnimeCard) => {
    if (!card?.id) return;
    if (card.mediaType === 'manga') {
      if (onMangaClick) {
        onMangaClick(card.id);
      } else if (onNavigate) {
        onNavigate('manga_details', { id: card.id });
      }
      return;
    }
    if (onNavigate) {
      onNavigate('anime_details', { id: card.id });
    }
  };

  const progressPercent = Math.min(100, Math.round((userLevel / MIN_LEVEL) * 100));
  const showEmptyStarterStage = chat.length === 0 && !loading;

  return (
    <div
      className="h-[calc(var(--vv-height,100dvh)-var(--safe-top,0px)-var(--safe-bottom,0px))] w-full bg-[#09090b] text-white flex flex-col overflow-hidden"
      id="ai_chat_view_container"
      dir="rtl"
    >
      {/* Clean Minimal Top Header */}
      <header className="shrink-0 bg-[#0d0d11]/95 backdrop-blur-md border-b border-zinc-800/80 px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            id="chat_back_btn"
            type="button"
            onClick={onBack}
            aria-label="رجوع"
            className="min-w-[44px] min-h-[44px] rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 flex items-center justify-center text-zinc-200 transition cursor-pointer shrink-0"
          >
            <ChevronRight size={20} />
          </button>

          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#FF1744] to-rose-500 flex items-center justify-center text-white shrink-0 shadow-md shadow-[#FF1744]/20">
            <Sparkles size={18} />
          </div>

          <div className="min-w-0">
            <h1 className="font-black text-sm sm:text-base text-white truncate leading-tight">
              صديقك الأوتاكو
            </h1>
            <p className="text-[11px] text-zinc-400 truncate">
              {userDisplayName ? `يدردش مع ${userDisplayName}` : 'دردشة أنمي حرة وترشيحات فورية'}
            </p>
          </div>
        </div>

        {isUnlocked && chat.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            {confirmClear ? (
              <div className="flex items-center gap-1 bg-zinc-900 border border-rose-500/40 rounded-xl p-1">
                <button
                  type="button"
                  onClick={clearChatHistory}
                  className="min-h-[36px] px-2.5 rounded-lg bg-rose-600 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap"
                >
                  تأكيد البدء من جديد
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="min-h-[36px] px-2 text-zinc-400 hover:text-white text-[11px] font-bold cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                aria-label="محادثة جديدة"
                className="min-h-[44px] px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
              >
                <Trash2 size={15} />
                {!display.isCoverScreen && <span>محادثة جديدة</span>}
              </button>
            )}
          </div>
        )}
      </header>

      {/* Main Content */}
      {!isUnlocked ? (
        <div className="flex-1 overflow-y-auto flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-md bg-[#111115] border border-zinc-800 rounded-2xl p-6 text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#FF1744]/10 border border-[#FF1744]/25 flex items-center justify-center text-[#FF1744]">
              <Award size={30} />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-black text-white">صديقك الأوتاكو يفتح عند المستوى {MIN_LEVEL}</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                ارفع مستواك بالمشاركة في التعليقات وتحديات ساحة الأوتاكو لتفتح الدردشة الحرة والترشيحات السريعة.
              </p>
            </div>

            <div className="bg-zinc-950 border border-zinc-800/80 p-4 rounded-xl space-y-2.5 text-right">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-zinc-400">مستواك الحالي</span>
                <span className="text-white tabular-nums">
                  المستوى {userLevel} / {MIN_LEVEL}
                </span>
              </div>
              <div className="w-full bg-zinc-900 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#FF1744] h-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {onNavigate && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => onNavigate('games')}
                  className="min-h-[44px] px-4 rounded-xl bg-[#FF1744] hover:bg-rose-600 text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Gamepad2 size={16} />
                  <span>ساحة الأوتاكو</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('level_perks')}
                  className="min-h-[44px] px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Zap size={16} />
                  <span>خريطة الامتيازات</span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 w-full max-w-4xl mx-auto flex flex-col">
          {/* Messages Stream */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3.5 sm:px-6 py-4 space-y-5">
            {/* In-Chat Starter Welcome & Quick Prompts (vanishes permanently on 1st message) */}
            {showEmptyStarterStage && (
              <div className="min-h-full flex flex-col items-center justify-center py-6">
                <div className="w-full max-w-xl space-y-6 text-center">
                  <div className="space-y-2.5">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-[#FF1744] to-rose-500 flex items-center justify-center text-white shadow-lg shadow-[#FF1744]/20">
                      <Sparkles size={26} />
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white">
                      {userDisplayName ? `هلا ${userDisplayName}!` : 'هلا بك يا صاحبي!'}
                    </h2>
                    <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-md mx-auto">
                      سولف معي عن أي أنمي أو شخصية أو نظرية تخطر ببالك، ولو تبغى ترشيح بعطيك العمل ومعه بطاقته تدخل عليها فوراً.
                    </p>
                  </div>

                  <div
                    className={`grid gap-2.5 text-right ${
                      display.isCoverScreen ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
                    }`}
                  >
                    {STARTER_SUGGESTIONS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => sendPrompt(prompt)}
                        className="min-h-[48px] p-3.5 rounded-2xl bg-[#121217] hover:bg-[#1a1a22] border border-zinc-800 hover:border-[#FF1744]/50 text-xs sm:text-[13px] font-bold text-zinc-200 hover:text-white transition text-right cursor-pointer leading-relaxed"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Real Conversation Bubbles */}
            {chat.map((c) => {
              const isUser = c.sender === 'user';
              return (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`flex items-start gap-2.5 ${
                      display.isCoverScreen ? 'max-w-[94%]' : 'max-w-[88%] sm:max-w-[80%]'
                    }`}
                  >
                    {!isUser && (
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#FF1744]/20 to-rose-500/10 border border-[#FF1744]/30 shrink-0 flex items-center justify-center text-[#FF1744] mt-0.5">
                        <Sparkles size={15} />
                      </div>
                    )}

                    <div className="space-y-2.5 min-w-0 flex-1">
                      <div
                        className={`px-4 py-3 text-[13px] sm:text-sm leading-relaxed rounded-2xl whitespace-pre-wrap break-words ${
                          isUser
                            ? 'bg-[#FF1744] text-white rounded-tl-sm font-medium'
                            : 'bg-[#131318] text-zinc-100 border border-zinc-800/90 rounded-tr-sm'
                        }`}
                      >
                        {renderFormattedText(c.text)}
                      </div>

                      {/* Interactive Anime Recommendation Cards */}
                      {!isUser && Array.isArray(c.animes) && c.animes.length > 0 && (
                        <div
                          className={`grid gap-2.5 ${
                            c.animes.length > 1 && !display.isCoverScreen
                              ? 'grid-cols-1 sm:grid-cols-2'
                              : 'grid-cols-1'
                          }`}
                        >
                          {c.animes.map((anime) => (
                            <button
                              key={`${c.id}-${anime.id}`}
                              type="button"
                              onClick={() => openCardDetails(anime)}
                              className="group w-full min-h-[84px] bg-[#111116] hover:bg-[#191922] border border-zinc-800 hover:border-[#FF1744]/60 rounded-2xl p-2.5 flex items-center gap-3 text-right transition cursor-pointer"
                            >
                              <div className="w-14 h-20 rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 shrink-0 flex items-center justify-center">
                                {anime.posterUrl ? (
                                  <img
                                    src={anime.posterUrl}
                                    alt={anime.title}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  />
                                ) : (
                                  <Film size={20} className="text-zinc-600" />
                                )}
                              </div>

                              <div className="min-w-0 flex-1 space-y-1">
                                <h4 className="text-xs sm:text-sm font-black text-white group-hover:text-[#FF1744] transition-colors line-clamp-1">
                                  {anime.title}
                                </h4>

                                <div className="flex items-center flex-wrap gap-1.5 text-[11px] text-zinc-400 tabular-nums">
                                  {anime.rating && (
                                    <span className="inline-flex items-center gap-0.5 text-amber-400 font-bold">
                                      <Star size={11} className="fill-amber-400" />
                                      <span>{anime.rating.toFixed(1)}</span>
                                    </span>
                                  )}
                                  {anime.rating && <span aria-hidden="true">·</span>}
                                  <span>{anime.originLabel || anime.type}</span>
                                  {anime.episodes && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span>{anime.episodes} {anime.mediaType === 'manga' ? 'فصل' : 'حلقة'}</span>
                                    </>
                                  )}
                                  {anime.year && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span>{anime.year}</span>
                                    </>
                                  )}
                                </div>

                                {anime.genres && anime.genres.length > 0 && (
                                  <p className="text-[11px] text-zinc-500 truncate">
                                    {anime.genres.join(' · ')}
                                  </p>
                                )}

                                <div className="pt-0.5 flex items-center gap-1 text-[11px] font-bold text-[#FF1744]">
                                  <span>
                                    {anime.mediaType === 'manga'
                                      ? (anime.originLabel ? `اقرأ الـ${anime.originLabel}` : 'فتح صفحة القراءة')
                                      : 'فتح صفحة الأنمي'}
                                  </span>
                                  <ChevronLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" />
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {!isUser && (
                        <div className="flex items-center gap-2 px-1">
                          <button
                            type="button"
                            onClick={() => handleCopy(c.id, c.text)}
                            className="min-h-[36px] px-2 rounded-lg text-[11px] font-bold text-zinc-400 hover:text-white hover:bg-zinc-900 flex items-center gap-1 transition cursor-pointer"
                          >
                            {copiedMsgId === c.id ? (
                              <>
                                <Check size={12} className="text-emerald-400" />
                                <span className="text-emerald-400">تم النسخ</span>
                              </>
                            ) : (
                              <>
                                <Copy size={12} />
                                <span>نسخ</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 bg-[#131318] border border-zinc-800/90 px-4 py-3 rounded-2xl rounded-tr-sm text-xs font-bold text-zinc-300">
                  <Loader2 size={14} className="text-[#FF1744] animate-spin" />
                  <span>يكتب لك الآن...</span>
                </div>
              </div>
            )}

            {errorState && (
              <div className="bg-rose-950/30 border border-rose-500/30 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 text-xs text-rose-200 leading-relaxed">
                  <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                  <span>{errorState.message}</span>
                </div>
                {errorState.lastFailedPrompt && (
                  <button
                    type="button"
                    onClick={() => sendPrompt(errorState.lastFailedPrompt!, true)}
                    disabled={loading}
                    className="min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition cursor-pointer disabled:opacity-40"
                  >
                    <RotateCcw size={13} />
                    <span>إعادة المحاولة</span>
                  </button>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Pinned Auto-Growing Composer */}
          <div className="shrink-0 bg-[#0d0d11] border-t border-zinc-800/80 p-2.5 sm:p-3.5">
            <div className="flex items-end gap-2 bg-zinc-950 border border-zinc-800 focus-within:border-zinc-600 rounded-2xl p-1.5 pr-3.5 transition-colors">
              <textarea
                ref={textareaRef}
                rows={1}
                value={msg}
                maxLength={1200}
                onChange={(e) => setMsg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendPrompt(msg);
                  }
                }}
                placeholder={
                  userDisplayName ? `اسأل أو فضفض يا ${displayLabel}...` : 'اكتب رسالتك هنا...'
                }
                disabled={loading}
                className="flex-1 min-h-[44px] max-h-32 py-2.5 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none disabled:opacity-50 resize-none leading-relaxed"
              />
              <button
                type="button"
                onClick={() => sendPrompt(msg)}
                disabled={loading || !msg.trim()}
                aria-label="إرسال"
                className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-[#FF1744] hover:bg-rose-600 flex items-center justify-center text-white shrink-0 transition disabled:opacity-40 cursor-pointer"
              >
                <Send size={17} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
