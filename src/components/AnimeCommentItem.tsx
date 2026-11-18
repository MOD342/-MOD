import React, { useState } from "react";
import {
  ThumbsUp,
  ThumbsDown,
  Copy,
  Flag,
  EyeOff,
  Edit2,
  Loader2,
  Check,
  Trash2,
  MoreVertical,
  MessageSquare,
  AtSign,
} from "lucide-react";
import { updateCommentInteraction } from "../services/animeInteractionService";
import { incrementInteraction } from "../services/gamificationService";
import { db } from "../firebase";
import { doc, updateDoc, increment } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { moderationService, isStaffEmail } from "../services/moderationService";
import { notificationsService } from "../services/notificationsService";
import { STORE_ITEMS_SORTED, getAvatarShapeClass } from "../data/storeItems";
import ViewportPortal from "./ViewportPortal";

export default function AnimeCommentItem({
  comment,
  user,
  onDeleteLocally,
  replies = [],
  onAddReply,
  isReply = false,
  onUserClick,
}: any) {
  const { userRole } = useAuth();
  const [isRevealed, setIsRevealed] = useState(!comment.isSpoiler);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(comment.text);
  const [editedSpoiler, setEditedSpoiler] = useState(
    comment.isSpoiler || false,
  );
  const [savingEdit, setSavingEdit] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<{
    text: string;
    tone: "ok" | "error";
  } | null>(null);

  // States for replies
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySpoiler, setReplySpoiler] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [showRepliesDropdown, setShowRepliesDropdown] = useState(false);

  const showToast = (text: string, tone: "ok" | "error" = "ok") => {
    setFeedbackToast({ text, tone });
    setTimeout(() => {
      setFeedbackToast((prev) => (prev?.text === text ? null : prev));
    }, 2400);
  };

  const handleAddReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || submittingReply || !onAddReply) return;
    setSubmittingReply(true);
    try {
      await onAddReply(comment.id, replyText, replySpoiler);
      setReplyText("");
      setReplySpoiler(false);
      setShowReplyForm(false);
      setShowRepliesDropdown(true);
    } catch (err) {
      console.error(err);
      showToast("تعذر إرسال الرد، حاول مجدداً", "error");
    } finally {
      setSubmittingReply(false);
    }
  };

  const renderCommentText = (text: string) => {
    if (!text) return "";
    const parts = text.split(/(@[^\s]+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        return (
          <span
            key={i}
            onClick={() => {
              navigator.clipboard?.writeText(part + " ").catch(() => {});
              showToast(`تم نسخ ${part}`);
            }}
            className="text-[#FF1744] font-bold bg-[#FF1744]/10 px-1 py-0.5 rounded text-xs inline-block mx-0.5 cursor-pointer hover:bg-[#FF1744]/20 transition-colors"
            title="نسخ المعرّف"
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  // Reporting System States
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reporting, setReporting] = useState(false);

  // Mod Deletion States
  const [showModDeleteModal, setShowModDeleteModal] = useState(false);
  const [modDeleteReason, setModDeleteReason] = useState("");
  const [deletingAsMod, setDeletingAsMod] = useState(false);

  // local optimistic state for interactions
  const [likes, setLikes] = useState(comment.likes || 0);
  const [dislikes, setDislikes] = useState(comment.dislikes || 0);
  const [userVote, setUserVote] = useState<"like" | "dislike" | null>(null);

  const activeAvatar = STORE_ITEMS_SORTED.find(
    (i) => i.id === comment.equippedAvatar,
  );
  const activeFrame = STORE_ITEMS_SORTED.find(
    (i) => i.id === comment.equippedFrame,
  );
  const activeAura = STORE_ITEMS_SORTED.find(
    (i) => i.id === comment.equippedAura,
  );
  const activeCommentCard = STORE_ITEMS_SORTED.find(
    (i) => i.id === comment.equippedCommentCard,
  );
  const activeTitle = STORE_ITEMS_SORTED.find(
    (i) => i.id === comment.equippedTitle,
  );
  const activeBadge = STORE_ITEMS_SORTED.find(
    (i) => i.id === comment.equippedBadge,
  );

  const handleLike = async () => {
    if (!user) return;
    const isNewLike = userVote !== "like";
    const newLikes = isNewLike ? likes + 1 : likes - 1;
    let newDislikes = dislikes;
    if (userVote === "dislike") newDislikes -= 1;
    setLikes(newLikes);
    setDislikes(newDislikes);
    setUserVote(isNewLike ? "like" : null);
    await updateCommentInteraction(comment.id, {
      likes: newLikes,
      dislikes: newDislikes,
    });
    if (isNewLike) {
      await incrementInteraction(comment.userId, "like");
      if (user.id !== comment.userId) {
        await notificationsService.createUserNotification(comment.userId, {
          title: "👍 إعجاب جديد بتعليقك",
          body: `أُعجب ${user.displayName || "أحد الأعضاء"} بتعليقك: "${comment.text.slice(0, 40)}${comment.text.length > 40 ? "..." : ""}"`,
          type: "social",
          linkTo: `anime_details:${comment.animeId}`,
          metadata: {
            animeId: comment.animeId,
            commentId: comment.id,
          },
        });
      }
    } else {
      try {
        const uRef = doc(db, "users", comment.userId);
        await updateDoc(uRef, { likesReceived: increment(-1) });
      } catch {}
    }
  };

  const handleDislike = async () => {
    if (!user) return;
    const isNewDislike = userVote !== "dislike";
    const newDislikes = isNewDislike ? dislikes + 1 : dislikes - 1;
    let newLikes = likes;
    if (userVote === "like") newLikes -= 1;
    setDislikes(newDislikes);
    setLikes(newLikes);
    setUserVote(isNewDislike ? "dislike" : null);
    await updateCommentInteraction(comment.id, {
      likes: newLikes,
      dislikes: newDislikes,
    });

    if (isNewDislike && user.id !== comment.userId) {
      await notificationsService.createUserNotification(comment.userId, {
        title: "تفاعل جديد مع تعليقك",
        body: `تفاعل ${user.displayName || "أحد الأعضاء"} بعدم إعجاب مع تعليقك: "${comment.text.slice(0, 40)}${comment.text.length > 40 ? "..." : ""}"`,
        type: "social",
        linkTo: `anime_details:${comment.animeId}`,
        metadata: {
          animeId: comment.animeId,
          commentId: comment.id,
        },
      });
    }
  };

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    await updateCommentInteraction(comment.id, {
      text: editedText,
      isSpoiler: editedSpoiler,
    });
    comment.text = editedText;
    comment.isSpoiler = editedSpoiler;
    setIsEditing(false);
    setSavingEdit(false);
    showToast("تم حفظ التعديل");
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(comment.text).catch(() => {});
    setCopied(true);
    setShowDropdown(false);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMention = () => {
    navigator.clipboard
      ?.writeText(`@${comment.userDisplayName} `)
      .catch(() => {});
    setShowDropdown(false);
    showToast(`تم نسخ @${comment.userDisplayName}`);
  };

  const handleDelete = async () => {
    await moderationService.deleteComment(comment.id);
    if (onDeleteLocally) onDeleteLocally(comment.id);
    setConfirmDelete(false);
    setShowDropdown(false);
  };

  const handleModDeleteConfirm = async () => {
    if (!modDeleteReason.trim()) return;
    setDeletingAsMod(true);
    try {
      const displayReason = modDeleteReason.startsWith("آخر:")
        ? modDeleteReason.replace("آخر:", "")
        : modDeleteReason;

      await moderationService.deleteComment(comment.id);

      await notificationsService.createUserNotification(comment.userId, {
        title: "تمت إزالة تعليقك بواسطة الإدارة",
        body: `تم إزالة تعليقك: "${comment.text.slice(0, 30)}${comment.text.length > 30 ? "..." : ""}"\nالسبب: ${displayReason}`,
        type: "system",
        linkTo: `anime_details:${comment.animeId}`,
      });

      if (onDeleteLocally) onDeleteLocally(comment.id);
      setShowModDeleteModal(false);
    } catch (e) {
      console.error(e);
      showToast("حدث خطأ أثناء محاولة الحذف", "error");
    } finally {
      setDeletingAsMod(false);
    }
  };

  const handleSendReport = async () => {
    if (!reportReason.trim()) return;
    setReporting(true);
    try {
      const finalReason = reportReason.startsWith("آخر:")
        ? reportReason.replace("آخر:", "")
        : reportReason;
      await moderationService.reportContent(comment.id, "comment", finalReason, {
        contentText: comment.text || "",
        authorId: comment.userId || "",
        authorName: comment.userDisplayName || "عضو",
        animeId: comment.animeId || "",
      });
      setShowReportModal(false);
      setReportReason("");
      showToast("تم إرسال الإبلاغ للإدارة");
    } catch (e) {
      console.error(e);
      showToast("تعذر إرسال الإبلاغ", "error");
    } finally {
      setReporting(false);
    }
  };

  const isMod =
    userRole === "owner" ||
    userRole === "admin" ||
    userRole === "moderator" ||
    isStaffEmail(user?.email);

  const getArabicRelativeTime = () => {
    if (!comment.createdAt) return "الآن";
    const date = comment.createdAt.toDate
      ? comment.createdAt.toDate()
      : new Date(comment.createdAt);
    const diff = Date.now() - date.getTime();
    const sec = Math.floor(diff / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);

    if (day > 0) {
      return day === 1 ? "قبل يوم" : day === 2 ? "قبل يومين" : `منذ ${day} يوم`;
    }
    if (hr > 0) {
      return hr === 1 ? "منذ ساعة" : hr === 2 ? "قبل ساعتين" : `منذ ${hr} ساعة`;
    }
    if (min > 0) {
      return min === 1
        ? "منذ دقيقة"
        : min === 2
          ? "منذ دقيقتين"
          : `منذ ${min} دقيقة`;
    }
    return "الآن";
  };

  return (
    <div
      className={`font-sans relative transition-colors ${
        activeCommentCard
          ? `my-1.5 p-3 rounded-xl ${activeCommentCard.commentCardStyle || "border border-purple-500/35 bg-purple-950/15"}`
          : "py-2.5 border-b border-neutral-800/50"
      }`}
      dir="rtl"
      id={`comment-${comment.id}`}
    >
      {/* Inline subtle feedback banner */}
      {feedbackToast && (
        <div
          className={`mb-2 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center justify-between ${
            feedbackToast.tone === "error"
              ? "bg-red-500/15 text-red-300 border border-red-500/25"
              : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"
          }`}
        >
          <span>{feedbackToast.text}</span>
        </div>
      )}

      {/* Compact Single-Line Meta Header */}
      <div className="flex justify-between items-center gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div
            onClick={() => onUserClick?.(comment.userId)}
            className="relative shrink-0 cursor-pointer hover:opacity-85 active:scale-95 transition-all"
            title="عرض الملف الشخصي"
          >
            {activeAura && (
              <div
                className={`absolute -inset-1 rounded-full pointer-events-none z-0 opacity-80 ${activeAura.auraStyle || ""} bg-gradient-to-tr ${activeAura.auraGradient || "from-purple-500/40 to-amber-500/40"} blur-[2px]`}
              />
            )}
            <div className="relative z-10 w-8 h-8 rounded-full overflow-hidden border border-neutral-800/60 bg-neutral-900 flex items-center justify-center">
              <img
                src={
                  activeAvatar?.img ||
                  comment.userPhotoUrl ||
                  "https://api.dicebear.com/7.x/avataaars/svg?seed=" +
                    comment.userId
                }
                className={`w-full h-full object-cover ${activeAvatar?.imageStyle || ""}`}
                alt={comment.userDisplayName || "عضو"}
                referrerPolicy="no-referrer"
              />
            </div>
            {activeFrame && (
              <div
                className={`absolute inset-0 z-20 ${getAvatarShapeClass(activeFrame.avatarShape)} pointer-events-none ${activeFrame.frameStyle}`}
              />
            )}
          </div>

          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span
              onClick={() => onUserClick?.(comment.userId)}
              className={`font-bold text-[13px] truncate ${activeTitle ? activeTitle.color : "text-neutral-200"} cursor-pointer hover:text-[#FF1744] transition-colors`}
              title="عرض الملف الشخصي"
            >
              {comment.userDisplayName}
            </span>
            {activeBadge && (
              <span
                className="inline-flex items-center justify-center shrink-0"
                title={activeBadge.name}
              >
                {React.createElement(activeBadge.icon, {
                  size: 11,
                  className: activeBadge.color,
                })}
              </span>
            )}
            {activeTitle && (
              <span className={`text-[11px] font-bold shrink-0 ${activeTitle.color}`}>
                · {activeTitle.name}
              </span>
            )}
          </div>
        </div>

        {/* Timestamp */}
        <div className="flex items-center gap-2 shrink-0">
          {activeCommentCard?.commentCardBadge && (
            <span className="text-[10px] font-bold text-amber-300">
              {activeCommentCard.commentCardBadge}
            </span>
          )}
          <span className="text-[11px] text-neutral-500 font-medium tabular-nums">
            {getArabicRelativeTime()}
          </span>
        </div>
      </div>

      {/* Comment Body / Edit area */}
      {isEditing ? (
        <div className="space-y-2 mb-2 pr-10">
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="w-full bg-[#181D26] border border-neutral-800 rounded-lg px-2.5 py-1.5 text-white text-xs focus:border-[#FF1744] outline-none min-h-[52px] resize-none text-right"
            dir="rtl"
          />
          <div className="flex justify-between items-center">
            <label className="flex items-center gap-1.5 text-[11px] text-neutral-400 cursor-pointer">
              <input
                type="checkbox"
                checked={editedSpoiler}
                onChange={(e) => setEditedSpoiler(e.target.checked)}
                className="accent-[#FF1744]"
              />
              يحتوي على حرق
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-neutral-400 hover:text-white text-[11px] font-bold px-2 py-1"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="bg-[#FF1744] hover:bg-red-600 disabled:opacity-50 text-white font-bold text-[11px] px-3 py-1 rounded-md transition"
              >
                {savingEdit ? <Loader2 size={11} className="animate-spin" /> : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative mb-1.5 pr-10 text-right">
          {!isRevealed && (
            <div
              className="absolute inset-0 z-10 backdrop-blur-sm bg-black/75 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer border border-neutral-800"
              onClick={() => setIsRevealed(true)}
            >
              <EyeOff size={13} className="text-[#FF1744]" />
              <span className="text-[11px] font-bold text-white">
                كشف حرق الأحداث
              </span>
            </div>
          )}
          <p
            className={`text-[13px] leading-snug text-neutral-200 whitespace-pre-wrap break-words ${!isRevealed ? "opacity-15 select-none blur-[1.5px]" : ""}`}
          >
            {renderCommentText(comment.text)}
          </p>
        </div>
      )}

      {/* Compact Action Toolbar */}
      <div className="flex items-center justify-between pr-10 text-neutral-400">
        <div className="flex items-center gap-4">
          <button
            onClick={handleLike}
            className={`flex items-center gap-1 text-xs min-h-[28px] transition cursor-pointer ${userVote === "like" ? "text-blue-400 font-bold" : "text-neutral-500 hover:text-blue-400"}`}
          >
            <ThumbsUp
              size={14}
              fill={userVote === "like" ? "currentColor" : "none"}
            />
            <span className="tabular-nums">{likes}</span>
          </button>
          <button
            onClick={handleDislike}
            className={`flex items-center gap-1 text-xs min-h-[28px] transition cursor-pointer ${userVote === "dislike" ? "text-red-400 font-bold" : "text-neutral-500 hover:text-red-400"}`}
          >
            <ThumbsDown
              size={14}
              fill={userVote === "dislike" ? "currentColor" : "none"}
            />
            <span className="tabular-nums">{dislikes}</span>
          </button>
          {!isReply && (
            <button
              onClick={() => setShowReplyForm(!showReplyForm)}
              className="flex items-center gap-1 text-xs min-h-[28px] text-neutral-500 hover:text-white transition cursor-pointer"
            >
              <MessageSquare size={14} />
              <span>رد</span>
            </button>
          )}
          {!isReply && replies.length > 0 && (
            <button
              onClick={() => setShowRepliesDropdown(!showRepliesDropdown)}
              className={`flex items-center gap-1 text-xs min-h-[28px] font-bold transition cursor-pointer select-none ${showRepliesDropdown ? "text-[#FF1744]" : "text-sky-400 hover:text-sky-300"}`}
            >
              <span>
                {showRepliesDropdown
                  ? "إخفاء الردود"
                  : `الردود (${replies.length})`}
              </span>
            </button>
          )}
        </div>

        {/* Overflow menu */}
        <div className="relative">
          <button
            onClick={() => {
              setConfirmDelete(false);
              setShowDropdown(!showDropdown);
            }}
            aria-label="خيارات التعليق"
            className="text-neutral-500 hover:text-white p-1.5 rounded-lg transition hover:bg-white/5 cursor-pointer"
          >
            <MoreVertical size={15} />
          </button>

          {showDropdown && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => {
                  setShowDropdown(false);
                  setConfirmDelete(false);
                }}
              />
              <div className="absolute left-0 top-full mt-1 bg-[#161b26] border border-neutral-700/70 rounded-xl shadow-2xl py-1 w-44 z-40 text-xs text-right">
                <button
                  onClick={handleCopy}
                  className="w-full text-right px-3 py-2 hover:bg-white/5 text-neutral-200 transition flex items-center gap-2 justify-start cursor-pointer"
                >
                  {copied ? (
                    <Check size={13} className="text-emerald-400" />
                  ) : (
                    <Copy size={13} />
                  )}
                  <span>{copied ? "تم النسخ" : "نسخ النص"}</span>
                </button>

                <button
                  onClick={handleCopyMention}
                  className="w-full text-right px-3 py-2 hover:bg-white/5 text-neutral-200 transition flex items-center gap-2 justify-start cursor-pointer"
                >
                  <AtSign size={13} className="text-sky-400" />
                  <span>نسخ الإشارة @</span>
                </button>

                {user?.uid === comment.userId && (
                  <>
                    <button
                      onClick={() => {
                        setIsEditing(true);
                        setShowDropdown(false);
                      }}
                      className="w-full text-right px-3 py-2 hover:bg-white/5 text-neutral-200 transition flex items-center gap-2 border-t border-neutral-800/60 justify-start cursor-pointer"
                    >
                      <Edit2 size={13} className="text-blue-400" />
                      <span>تعديل</span>
                    </button>
                    {!confirmDelete ? (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="w-full text-right px-3 py-2 hover:bg-red-600/10 text-red-400 transition flex items-center gap-2 justify-start cursor-pointer"
                      >
                        <Trash2 size={13} />
                        <span>حذف التعليق</span>
                      </button>
                    ) : (
                      <div className="px-3 py-2 bg-red-950/40 border-t border-red-500/20 space-y-1.5">
                        <p className="text-[11px] font-bold text-red-300">تأكيد الحذف؟</p>
                        <div className="flex gap-1.5">
                          <button
                            onClick={handleDelete}
                            className="flex-1 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-bold text-[11px] cursor-pointer"
                          >
                            حذف
                          </button>
                          <button
                            onClick={() => setConfirmDelete(false)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-[11px] cursor-pointer"
                          >
                            تراجع
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {user && user.id !== comment.userId && (
                  <button
                    onClick={() => {
                      setShowReportModal(true);
                      setShowDropdown(false);
                    }}
                    className="w-full text-right px-3 py-2 hover:bg-white/5 text-amber-400 transition flex items-center gap-2 border-t border-neutral-800/60 justify-start cursor-pointer"
                  >
                    <Flag size={13} />
                    <span>إبلاغ للإدارة</span>
                  </button>
                )}

                {isMod && user?.uid !== comment.userId && (
                  <button
                    onClick={() => {
                      setShowModDeleteModal(true);
                      setShowDropdown(false);
                    }}
                    className="w-full text-right px-3 py-2 hover:bg-red-600/10 text-red-400 transition flex items-center gap-2 border-t border-neutral-800 justify-start cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span className="font-bold">حذف (مشرف)</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Inline Reply Form */}
      {showReplyForm && (
        <div className="mt-2 mr-10 bg-[#12161E] p-2.5 rounded-xl border border-neutral-800/80 space-y-2">
          <form onSubmit={handleAddReplySubmit} className="flex flex-col gap-2">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`اكتب رداً على ${comment.userDisplayName}...`}
                className="flex-1 bg-transparent text-white text-xs border-b border-neutral-800 py-1.5 focus:outline-none focus:border-[#FF1744] text-right font-sans"
                dir="rtl"
                disabled={submittingReply}
                autoFocus
              />
              <button
                type="submit"
                disabled={!replyText.trim() || submittingReply}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 disabled:opacity-40 shrink-0"
              >
                {submittingReply && <Loader2 size={11} className="animate-spin text-white" />}
                <span>إرسال</span>
              </button>
            </div>
            <div className="flex justify-between items-center text-[11px] text-neutral-400">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={replySpoiler}
                  onChange={(e) => setReplySpoiler(e.target.checked)}
                  className="accent-[#FF1744]"
                />
                <span>يحتوي على حرق</span>
              </label>
              <button
                type="button"
                onClick={() => setShowReplyForm(false)}
                className="text-neutral-400 hover:text-neutral-200 font-bold transition"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Collapsible Replies list */}
      {!isReply && replies.length > 0 && showRepliesDropdown && (
        <div className="mt-2 mr-10 border-r border-neutral-800/80 pr-2.5 space-y-1">
          {replies.map((reply: any) => (
            <AnimeCommentItem
              key={reply.id}
              comment={reply}
              user={user}
              onDeleteLocally={onDeleteLocally}
              isReply={true}
              onUserClick={onUserClick}
            />
          ))}
        </div>
      )}

      {/* Reporting Dialogue Modal */}
      {showReportModal && (
        <ViewportPortal>
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
            style={{
              height: "var(--vv-height, 100dvh)",
              paddingTop: "calc(var(--safe-top, 0px) + 1rem)",
              paddingBottom: "calc(var(--safe-bottom, 0px) + 1rem)",
            }}
            dir="rtl"
          >
            <div className="bg-[#1A2230] border border-neutral-700 rounded-2xl p-5 shadow-2xl max-w-sm w-full text-right">
              <h3 className="text-white font-bold text-sm mb-2 flex items-center gap-2">
                <Flag size={16} className="text-amber-400" />
                إبلاغ عن مخالفة تعليق
              </h3>
              <p className="text-[11px] text-neutral-400 mb-3 font-sans">
                حدد سبب إبلاغك لهذا التعليق ليراجعه فريق الإشراف:
              </p>

              <div className="space-y-1.5 mb-4">
                {[
                  "حرق أحداث غير مغطى",
                  "ألفاظ مسيئة أو كلام بذيء",
                  "إعلانات وروابط خارجية مشبوهة",
                  "سب وتهجم على الأعضاء",
                  "تعليق متكرر أو سبام",
                ].map((reasonCategory) => (
                  <button
                    key={reasonCategory}
                    type="button"
                    onClick={() => setReportReason(reasonCategory)}
                    className={`w-full text-right px-3 py-2 text-xs rounded-lg transition border ${
                      reportReason === reasonCategory
                        ? "bg-amber-500/15 border-amber-500 text-white"
                        : "bg-black/35 border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-white"
                    }`}
                  >
                    {reasonCategory}
                  </button>
                ))}
                <textarea
                  placeholder="سبب آخر للتبليغ..."
                  value={
                    reportReason.startsWith("آخر:")
                      ? reportReason.replace("آخر:", "")
                      : ""
                  }
                  onChange={(e) => setReportReason(`آخر:${e.target.value}`)}
                  className="w-full bg-black/40 border border-neutral-800 rounded-lg p-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/60 min-h-[55px] resize-none mt-1 text-right font-sans"
                  dir="rtl"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSendReport}
                  disabled={!reportReason || reporting}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-black text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  {reporting && <Loader2 size={12} className="animate-spin text-black" />}
                  <span>إرسال الإبلاغ</span>
                </button>
                <button
                  onClick={() => {
                    setShowReportModal(false);
                    setReportReason("");
                  }}
                  disabled={reporting}
                  className="px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs py-2.5 rounded-xl transition"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </ViewportPortal>
      )}

      {/* Moderator Deletion Notification Dialog */}
      {showModDeleteModal && (
        <ViewportPortal>
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
            style={{
              height: "var(--vv-height, 100dvh)",
              paddingTop: "calc(var(--safe-top, 0px) + 1rem)",
              paddingBottom: "calc(var(--safe-bottom, 0px) + 1rem)",
            }}
            dir="rtl"
          >
            <div className="bg-[#1A2230] border border-neutral-700 rounded-2xl p-5 shadow-2xl max-w-sm w-full text-right">
              <h3 className="text-white font-bold text-sm mb-2 flex items-center gap-2">
                <Trash2 size={16} className="text-red-500" />
                حذف التعليق كمشرف
              </h3>
              <p className="text-[11px] text-neutral-400 mb-3 font-sans leading-relaxed">
                سيتم حذف تعليق العضو{" "}
                <strong className="text-neutral-200">{comment.userDisplayName}</strong>{" "}
                وإرسال إشعار تلقائي له بالسبب.
              </p>

              <div className="space-y-1.5 mb-4">
                {[
                  "حرق أحداث مكشوف دون تحديد خيار الحرق",
                  "استخدام كلمات بذيئة ومخالفة للذوق العام",
                  "إثارة المشاكل والشتم بين الأعضاء",
                  "نشر روابط وإعلانات خارجية غير مرغوبة",
                  "تعليق عشوائي غير هادف أو سبام",
                ].map((modReason) => (
                  <button
                    key={modReason}
                    type="button"
                    onClick={() => setModDeleteReason(modReason)}
                    className={`w-full text-right px-3 py-2 text-xs rounded-lg transition border ${
                      modDeleteReason === modReason
                        ? "bg-red-500/15 border-red-500 text-white"
                        : "bg-black/35 border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-white"
                    }`}
                  >
                    {modReason}
                  </button>
                ))}
                <textarea
                  placeholder="اكتب سبب حذف مخصص يرسل للعضو..."
                  value={
                    modDeleteReason.startsWith("آخر:")
                      ? modDeleteReason.replace("آخر:", "")
                      : ""
                  }
                  onChange={(e) => setModDeleteReason(`آخر:${e.target.value}`)}
                  className="w-full bg-black/40 border border-neutral-800 rounded-lg p-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500/60 min-h-[55px] resize-none mt-1 text-right font-sans"
                  dir="rtl"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleModDeleteConfirm}
                  disabled={!modDeleteReason || deletingAsMod}
                  className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-black text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  {deletingAsMod && <Loader2 size={12} className="animate-spin text-white" />}
                  <span>تأكيد الحذف والإخطار</span>
                </button>
                <button
                  onClick={() => {
                    setShowModDeleteModal(false);
                    setModDeleteReason("");
                  }}
                  disabled={deletingAsMod}
                  className="px-4 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs py-2.5 rounded-xl transition"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </ViewportPortal>
      )}
    </div>
  );
}
