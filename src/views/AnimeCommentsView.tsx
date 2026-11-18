import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRight, Loader2, MessageCircle, Send, EyeOff, AlertCircle, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getComments, addComment } from '../services/animeInteractionService';
import { notificationsService } from '../services/notificationsService';
import { clientCache } from '../utils/clientCache';
import AnimeCommentItem from '../components/AnimeCommentItem';
import PullToRefresh from '../components/PullToRefresh';

interface AnimeCommentsViewProps {
  animeId: string;
  focusCommentId?: string;
  onBack: () => void;
  onAnimeClick?: (id: string) => void;
  onUserClick?: (userId: string) => void;
}

export default function AnimeCommentsView({ animeId, focusCommentId, onBack, onAnimeClick, onUserClick }: AnimeCommentsViewProps) {
  const { user, signIn, userData } = useAuth();
  const [anime, setAnime] = useState<any>(null);
  const [loadingAnime, setLoadingAnime] = useState(true);
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentsError, setCommentsError] = useState(false);
  const [visibleCount, setVisibleCount] = useState(25);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  // New Comment Form state
  const [newComment, setNewComment] = useState('');
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const loadComments = async () => {
    if (!animeId) return;
    try {
      setCommentsError(false);
      setLoadingComments(true);
      const data = await getComments(animeId);
      setComments(data);
    } catch (err) {
      console.error('Error fetching comments:', err);
      setCommentsError(true);
    } finally {
      setLoadingComments(false);
    }
  };

  useEffect(() => {
    if (!animeId) return;

    const fetchAnime = async () => {
      try {
        setLoadingAnime(true);
        const cached =
          clientCache.get<any>(`client_anime_details_v8_${animeId}`) ||
          clientCache.get<any>(`client_anime_details_${animeId}`);
        if (cached) {
          setAnime(cached);
          setLoadingAnime(false);
        }
        await clientCache.fetchWithRevalidate(
          `client_anime_details_v8_${animeId}`,
          `/api/anime/details/${animeId}`,
          (data: any) => {
            setAnime(data);
          }
        );
      } catch (err) {
        console.error('Error fetching anime details for comments view:', err);
      } finally {
        setLoadingAnime(false);
      }
    };

    void fetchAnime();
    void loadComments();
  }, [animeId]);

  useEffect(() => {
    if (comments.length > 0 && focusCommentId) {
      setVisibleCount((prev) => Math.max(prev, comments.length));
      const timer = setTimeout(() => {
        const el = document.getElementById(`comment-${focusCommentId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('bg-[#FF1744]/15', 'rounded-xl', 'p-2.5', 'border', 'border-[#FF1744]/30', 'transition-all', 'duration-500');
          setTimeout(() => {
            el.classList.remove('bg-[#FF1744]/15', 'border-[#FF1744]/30');
          }, 3000);
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [comments, focusCommentId]);

  const parseMentionsAndNotify = async (text: string, currentAnimeId: string, commentId: string, currentUserId: string, animeTitle: string) => {
    const words = text.match(/@[^\s]+/g);
    if (!words) return;

    const uniqueTags = Array.from(new Set(words)).map(w => w.substring(1).trim()).slice(0, 5);

    for (const tag of uniqueTags) {
      try {
        const qUsers = query(collection(db, 'users'), where('displayName', '==', tag));
        const resSnap = await getDocs(qUsers);
        if (!resSnap.empty) {
          const targetUserId = resSnap.docs[0].id;
          if (targetUserId !== currentUserId) {
            await notificationsService.createUserNotification(targetUserId, {
              title: '🏷️ تمت الإشارة إليك!',
              body: `${user?.displayName || 'متابع'} أشار إليك في تعليق بـ "${animeTitle}": "${text.substring(0, 50)}..."`,
              type: 'social',
              linkTo: `comment_view:${currentAnimeId}:${commentId}`,
              metadata: {
                animeId: currentAnimeId,
                commentId
              }
            });
          }
        }
      } catch (e) {
        console.error('Error seeking tagged user', e);
      }
    }
  };

  const handleAddComment = async (e: any, parentCommentId?: string, replyText?: string, replySpoiler?: boolean) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!user || !anime) return;

    if (userData?.isMuted) {
      setFormNotice('تم تقييد حسابك من الكتابة والنشر بواسطة الإدارة');
      return;
    }
    if ((userData?.level || 1) < 2) {
      setFormNotice('تحتاج للوصول إلى المستوى 2 على الأقل للمشاركة في التعليقات');
      return;
    }

    const isReply = !!parentCommentId;
    const textToSubmit = isReply ? replyText : newComment;
    const spoilerFlag = isReply ? replySpoiler : isSpoiler;

    if (!textToSubmit || !textToSubmit.trim()) return;

    setFormNotice(null);
    setSubmittingComment(true);
    try {
      const commentPayload: any = {
        animeId: anime._id,
        userId: user.id,
        userDisplayName: user.displayName || 'مستخدم',
        userPhotoUrl: user.photoURL || undefined,
        text: textToSubmit,
        isSpoiler: spoilerFlag,
        likes: 0,
        dislikes: 0,
        equippedAvatar: userData?.equippedAvatar || null,
        equippedFrame: userData?.equippedFrame || null,
        equippedAura: userData?.equippedAura || null,
        equippedCommentCard: userData?.equippedCommentCard || null,
        equippedTitle: userData?.equippedTitle || null,
        equippedBadge: userData?.equippedBadge || null
      };

      if (isReply) {
        commentPayload.parentCommentId = parentCommentId;
      }

      const newId = await addComment(commentPayload);

      import('../services/gamificationService').then(({ incrementInteraction }) => {
        incrementInteraction(user.id, 'comment');
      });

      if (isReply) {
        const parentComment = comments.find(c => c.id === parentCommentId);
        if (parentComment && parentComment.userId !== user.id) {
          await notificationsService.createUserNotification(parentComment.userId, {
            title: '💬 رد جديد على تعليقك!',
            body: `${user.displayName || 'متابع'} رد على تعليقك في أنمي "${anime.title}": "${textToSubmit.substring(0, 50)}..."`,
            type: 'social',
            linkTo: `comment_view:${anime._id}:${newId}`,
            metadata: {
              animeId: anime._id,
              commentId: newId
            }
          });
        }
      }

      await parseMentionsAndNotify(textToSubmit, anime._id, newId, user.id, anime.title);

      if (!isReply) {
        setNewComment('');
        setIsSpoiler(false);
      }

      const updated = await getComments(anime._id);
      setComments(updated);
    } catch (err) {
      console.error(err);
      setFormNotice('حدث خطأ أثناء نشر التعليق، حاول مجدداً');
    } finally {
      setSubmittingComment(false);
    }
  };

  const mainComments = useMemo(() => comments.filter(c => !c.parentCommentId), [comments]);
  const visibleMainComments = useMemo(() => mainComments.slice(0, visibleCount), [mainComments, visibleCount]);

  return (
    <PullToRefresh onRefresh={loadComments}>
      <div className="min-h-screen bg-black text-white pb-28 font-sans selection:bg-[#FF1744]/50 text-right" dir="rtl" id="anime_comments_screen">
        {/* Top Navigation */}
        <div className="sticky top-0 bg-black/90 backdrop-blur-md z-40 border-b border-neutral-900 pb-3 pt-4 px-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onBack}
              className="w-9 h-9 bg-[#1E1E1E] rounded-xl flex items-center justify-center text-neutral-300 hover:text-white transition hover:bg-neutral-800 shrink-0 cursor-pointer"
            >
              <ArrowRight size={18} />
            </button>

            {anime ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={anime.posterUrl}
                  alt={anime.title}
                  className="w-8 h-10 object-cover rounded-lg shrink-0 border border-neutral-800"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0">
                  <h2
                    onClick={() => onAnimeClick?.(anime._id)}
                    className="text-xs font-black line-clamp-1 text-white hover:text-[#FF1744] transition cursor-pointer"
                  >
                    {anime.title}
                  </h2>
                  <p className="text-[11px] text-neutral-400 font-bold">نقاش وتعليقات الأعضاء</p>
                </div>
              </div>
            ) : (
              <div className="h-4 w-28 bg-neutral-900 rounded" />
            )}
          </div>

          <div className="flex items-center gap-1.5 text-neutral-300 text-xs font-bold shrink-0 tabular-nums">
            <MessageCircle size={14} className="text-[#FF1744]" />
            <span>{comments.length}</span>
          </div>
        </div>

        {loadingAnime && !anime ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="animate-spin text-[#FF1744]" size={24} />
            <p className="text-neutral-400 text-xs font-bold">جاري تحميل النقاشات...</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-white text-xs font-black select-none tabular-nums">
                النقاشات ({mainComments.length})
              </h4>
            </div>

            {commentsError && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-right min-w-0">
                  <AlertCircle size={17} className="text-rose-400 shrink-0" />
                  <p className="text-xs font-bold text-white truncate">تعذر تحميل التعليقات</p>
                </div>
                <button
                  onClick={loadComments}
                  className="min-h-[36px] px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shrink-0 cursor-pointer"
                >
                  إعادة المحاولة
                </button>
              </div>
            )}

            {loadingComments ? (
              <div className="flex justify-center py-10">
                <Loader2 className="animate-spin text-neutral-500" size={20} />
              </div>
            ) : mainComments.length === 0 ? (
              <div className="text-center py-12 text-neutral-400 font-bold bg-[#141418] text-xs rounded-2xl border border-neutral-800/80">
                كن أول من يعلق ويبدأ النقاش حول هذا العمل
              </div>
            ) : (
              <div className="space-y-1 pb-8">
                {visibleMainComments.map((comment, cIdx) => {
                  const commentReplies = comments
                    .filter(c => c.parentCommentId === comment.id)
                    .sort((a, b) => {
                      const timeA = a.createdAt?.seconds || (a.createdAt instanceof Date ? a.createdAt.getTime() / 1000 : 0) || 0;
                      const timeB = b.createdAt?.seconds || (b.createdAt instanceof Date ? b.createdAt.getTime() / 1000 : 0) || 0;
                      return timeA - timeB;
                    });
                  return (
                    <AnimeCommentItem
                      key={`${comment.id || cIdx}-${cIdx}`}
                      comment={comment}
                      user={user}
                      onReply={(c: any) => setNewComment(`@${c.userDisplayName} `)}
                      onDeleteLocally={(id: string) => setComments(prev => prev.filter(c => c.id !== id))}
                      replies={commentReplies}
                      onAddReply={(parentId: string, text: string, spoiler: boolean) => handleAddComment(null, parentId, text, spoiler)}
                      onUserClick={onUserClick}
                    />
                  );
                })}

                {mainComments.length > visibleCount && (
                  <div className="pt-4 flex justify-center">
                    <button
                      onClick={() => setVisibleCount(prev => prev + 25)}
                      className="min-h-[40px] px-5 bg-[#121218] hover:bg-[#1a1a24] border border-white/10 rounded-xl text-xs font-black text-neutral-200 transition flex items-center gap-2 cursor-pointer"
                    >
                      <span>عرض تعليقات أقدم ({mainComments.length - visibleCount}+)</span>
                      <ChevronDown size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bottom Fixed Comment Form bar */}
        {!loadingAnime && (
          <div
            className="fixed bottom-0 left-0 right-0 max-w-3xl mx-auto px-4 pt-2 bg-gradient-to-t from-black via-black/95 to-transparent z-40"
            style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 1rem)' }}
          >
            {user ? (
              <form onSubmit={(e) => handleAddComment(e)} className="flex flex-col gap-1.5 w-full">
                {formNotice && (
                  <div className="text-[11px] text-rose-300 bg-rose-500/15 border border-rose-500/30 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5">
                    <AlertCircle size={13} />
                    <span>{formNotice}</span>
                  </div>
                )}
                {isSpoiler && (
                  <div className="text-[11px] text-amber-300 bg-amber-500/15 border border-amber-500/25 px-3 py-1 rounded-xl self-start font-bold inline-flex items-center gap-1.5">
                    <EyeOff size={12} />
                    <span>سيتم نشر هذا التعليق كحرق للأحداث</span>
                  </div>
                )}
                <div className="bg-[#12161E]/95 border border-neutral-800 px-2.5 py-1.5 rounded-2xl flex items-center justify-between gap-2.5 shadow-[0_-8px_32px_rgba(0,0,0,0.8)] w-full">
                  <button
                    type="button"
                    title="تنبيه حرق"
                    onClick={() => setIsSpoiler(!isSpoiler)}
                    className={`p-2 rounded-xl transition shrink-0 flex items-center justify-center cursor-pointer ${isSpoiler ? 'text-amber-400 bg-amber-500/15 border border-amber-500/25' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'}`}
                  >
                    <EyeOff size={16} />
                  </button>

                  <input
                    type="text"
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder={
                      userData?.isMuted
                        ? "تم تقييد حسابك من النشر والتعليق"
                        : (userData?.level || 1) < 2
                          ? "المستوى 2 مطلوب على الأقل للتعليق"
                          : "اكتب تعليقاً... (للإشارة استخدم @اسمه)"
                    }
                    className="flex-1 bg-transparent text-white text-xs py-2 focus:outline-none placeholder-neutral-500 font-sans text-right disabled:opacity-50 font-bold"
                    dir="rtl"
                    disabled={submittingComment || userData?.isMuted || (userData?.level || 1) < 2}
                  />

                  <button
                    type="submit"
                    disabled={!newComment.trim() || submittingComment || userData?.isMuted || (userData?.level || 1) < 2}
                    className="w-9 h-9 rounded-xl bg-[#FF1744] hover:bg-red-600 disabled:opacity-35 text-white flex items-center justify-center transition shrink-0 shadow-md cursor-pointer"
                  >
                    {submittingComment ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} className="transform rotate-180" />
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="bg-[#12161E]/95 border border-neutral-800 px-3 py-2.5 rounded-2xl flex items-center justify-between gap-3 shadow-[0_-8px_32px_rgba(0,0,0,0.8)] w-full">
                <span className="text-neutral-300 text-xs font-bold px-1">تسجيل الدخول مطلوب للمشاركة في التعليقات</span>
                <button
                  onClick={() => signIn('login')}
                  className="bg-[#FF1744] hover:bg-red-600 text-white font-black px-4 py-2 rounded-xl text-xs cursor-pointer transition shadow-md shrink-0"
                >
                  سجل الدخول
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
