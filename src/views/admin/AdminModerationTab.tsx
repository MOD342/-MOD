import React from "react";
import { ShieldAlert, ShieldCheck, UserX, Activity, Trash2, Check, Search, MessageSquare, Lightbulb, Send, VolumeX, Filter, Eye, EyeOff, History } from "lucide-react";

import { useAdminDashboard } from "./AdminDashboardContext";

export const AdminModerationTab: React.FC = () => {
  const {
    onNavigate,
    role,
    workspace,
    modSubTab,
    setModSubTab,
    reports,
    allUsers,
    recommendations,
    suggestionsList,
    auditLogs,
    auditTypeFilter,
    setAuditTypeFilter,
    liveComments,
    liveContentSource,
    setLiveContentSource,
    liveContentSearch,
    setLiveContentSearch,
    selectedContentIds,
    setSelectedContentIds,
    editingLiveCommentId,
    setEditingLiveCommentId,
    editingLiveCommentText,
    setEditingLiveCommentText,
    modPerms,
    reportFilter,
    setReportFilter,
    recStatusFilter,
    setRecStatusFilter,
    searchRecQuery,
    setSearchRecQuery,
    recIdBeingRejected,
    setRecIdBeingRejected,
    recRejectionReasonInput,
    setRecRejectionReasonInput,
    recIdBeingDeleted,
    setRecIdBeingDeleted,
    resolvedAnimeMeta,
    suggestionsFilter,
    setSuggestionsFilter,
    suggestionBeingDeleted,
    setSuggestionBeingDeleted,
    replyingSuggestion,
    setReplyingSuggestion,
    suggestionReplyText,
    setSuggestionReplyText,
    getUserNameByUid,
    pendingReportsCount,
    pendingRecsCount,
    unifiedLiveContent,
    filteredLiveContent,
    toggleSelectContentItem,
    toggleSelectAllVisibleContent,
    handleDeleteSingleLiveItem,
    handleBulkDeleteSelectedContent,
    handleToggleLiveCommentSpoiler,
    handleSaveLiveCommentEdit,
    handleQuickMuteAuthor,
    handleResolveReport,
    handleApproveRec,
    handleRejectRec,
    handleDeleteRec,
    handleDeleteSuggestion,
    handleReplyToSuggestion,
    handleUpdateSuggestionStatus,
    handleBan
  } = useAdminDashboard();

  return (
    <>
        {workspace === 'moderation' && (
          <div className="space-y-5">
            {/* Sub-Tabs Selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar bg-[#121215] border border-zinc-800/80 p-1.5 rounded-2xl">
              <button
                type="button"
                onClick={() => setModSubTab('live_content')}
                className={`min-h-[44px] flex items-center gap-2 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  modSubTab === 'live_content' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Activity size={14} className="text-violet-400" />
                <span>المراقبة الحية</span>
                <span className="text-[11px] font-mono tabular-nums text-violet-300">
                  ({unifiedLiveContent.length})
                </span>
              </button>

              <button
                type="button"
                onClick={() => setModSubTab('reports')}
                className={`min-h-[44px] flex items-center gap-2 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  modSubTab === 'reports' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <ShieldAlert size={14} className="text-rose-400" />
                <span>البلاغات</span>
                {pendingReportsCount > 0 && (
                  <span className="text-[11px] font-mono tabular-nums text-rose-400 font-black">
                    ({pendingReportsCount})
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setModSubTab('recommendations')}
                className={`min-h-[44px] flex items-center gap-2 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  modSubTab === 'recommendations' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Lightbulb size={14} className="text-amber-400" />
                <span>التوصيات</span>
                {recommendations.length > 0 && (
                  <span className="text-[11px] font-mono tabular-nums text-amber-400 font-black">
                    ({pendingRecsCount > 0 ? `${pendingRecsCount} جديد` : recommendations.length})
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setModSubTab('suggestions')}
                className={`min-h-[44px] flex items-center gap-2 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  modSubTab === 'suggestions' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <MessageSquare size={14} className="text-sky-400" />
                <span>التذاكر والشكاوى</span>
                {suggestionsList.length > 0 && (
                  <span className="text-[11px] font-mono tabular-nums text-sky-300">
                    ({suggestionsList.length})
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setModSubTab('audit')}
                className={`min-h-[44px] flex items-center gap-2 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  modSubTab === 'audit' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <History size={14} className="text-emerald-400" />
                <span>سجل المشرفين</span>
                {auditLogs.length > 0 && (
                  <span className="text-[11px] font-mono tabular-nums text-emerald-300">
                    ({auditLogs.length})
                  </span>
                )}
              </button>
            </div>

            {/* SUB-TAB 2.0: LIVE CONTENT INSPECTOR (المراقبة الحية للمحتوى والتحديد المتعدد) */}
            {modSubTab === 'live_content' && (
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
                  <div>
                    <h2 className="text-sm font-black text-white">المراقبة الحية للمحتوى المنشور (تحديد وإدارة فورية)</h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      جميع تعليقات الأنمي، منشورات المجتمع، ساحة الأوتاكو، والتسريبات في مكان واحد دون انتظار بلاغ
                    </p>
                  </div>

                  {/* Source Filter Pills */}
                  <div className="flex flex-wrap gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    {[
                      { id: 'all', label: `الكل (${unifiedLiveContent.length})` },
                      {
                        id: 'anime_comments',
                        label: `تعليقات الأنمي (${unifiedLiveContent.filter(i => i.sourceType === 'anime_comments').length})`
                      },
                      {
                        id: 'community_posts',
                        label: `المجتمع (${unifiedLiveContent.filter(i => i.sourceType === 'community_posts').length})`
                      },
                      {
                        id: 'arena_feed',
                        label: `ساحة الأوتاكو (${unifiedLiveContent.filter(i => i.sourceType === 'arena_feed').length})`
                      },
                      {
                        id: 'leaks',
                        label: `التسريبات (${unifiedLiveContent.filter(i => i.sourceType === 'leaks').length})`
                      }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => {
                          setLiveContentSource(f.id as any);
                          setSelectedContentIds([]);
                        }}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                          liveContentSource === f.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search & Bulk Selection Action Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="text"
                      value={liveContentSearch}
                      onChange={e => setLiveContentSearch(e.target.value)}
                      placeholder="ابحث في نص التعليق، المنشور، اسم الكاتب، أو معرّف الأنمي..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-700"
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={toggleSelectAllVisibleContent}
                      className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-bold text-zinc-200 cursor-pointer transition flex items-center gap-1.5"
                    >
                      <Check size={13} className="text-violet-400" />
                      <span>
                        {filteredLiveContent.slice(0, 60).length > 0 &&
                        filteredLiveContent.slice(0, 60).every(i => selectedContentIds.includes(i.uniqueKey))
                          ? 'إلغاء تحديد الكل'
                          : 'تحديد المعروض'}
                      </span>
                    </button>

                    {selectedContentIds.length > 0 && (
                      <button
                        onClick={handleBulkDeleteSelectedContent}
                        className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-black cursor-pointer transition flex items-center gap-1.5 shadow-lg shadow-rose-600/20"
                      >
                        <Trash2 size={13} />
                        <span>حذف المحدد ({selectedContentIds.length})</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Live Content Feed List */}
                {filteredLiveContent.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500 space-y-2">
                    <MessageSquare size={32} className="mx-auto text-zinc-700" />
                    <p className="text-xs font-bold text-zinc-300">لا توجد منشورات أو تعليقات مطابقة</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                    {filteredLiveContent.slice(0, 60).map(item => {
                      const isSelected = selectedContentIds.includes(item.uniqueKey);
                      const authorUser = allUsers.find(u => u.uid === item.authorId || u.id === item.authorId);
                      const isAuthorMuted = !!authorUser?.isMuted;

                      return (
                        <div
                          key={item.uniqueKey}
                          onClick={() => toggleSelectContentItem(item.uniqueKey)}
                          className={`rounded-xl p-3.5 border transition cursor-pointer ${
                            isSelected
                              ? 'bg-violet-500/10 border-violet-500/40'
                              : 'bg-zinc-950/70 border-zinc-800/80 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2.5">
                              {/* Checkbox */}
                              <div
                                className={`w-4 h-4 rounded flex items-center justify-center border transition ${
                                  isSelected
                                    ? 'bg-violet-500 border-violet-500 text-white'
                                    : 'border-zinc-700 bg-zinc-900'
                                }`}
                              >
                                {isSelected && <Check size={11} strokeWidth={3} />}
                              </div>

                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                  item.sourceType === 'anime_comments'
                                    ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                    : item.sourceType === 'community_posts'
                                      ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                      : item.sourceType === 'arena_feed'
                                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                }`}
                              >
                                {item.sourceLabel}
                              </span>

                              {item.isSpoiler && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                  حرق (Spoiler)
                                </span>
                              )}

                              <span className="text-xs font-black text-white">{item.authorName}</span>
                              {isAuthorMuted && (
                                <span className="text-[9px] bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded font-bold">
                                  مكتوم 🔇
                                </span>
                              )}
                            </div>

                            <span className="text-[10px] text-zinc-500 font-mono">
                              {item.createdAtSec
                                ? new Date(item.createdAtSec * 1000).toLocaleString('ar-EG', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : ''}
                            </span>
                          </div>

                          {/* Content Text or Inline Editor */}
                          {editingLiveCommentId === item.uniqueKey ? (
                            <div
                              onClick={e => e.stopPropagation()}
                              className="bg-zinc-900 border border-violet-500/40 rounded-xl p-2.5 space-y-2 my-2"
                            >
                              <textarea
                                rows={2}
                                value={editingLiveCommentText}
                                onChange={e => setEditingLiveCommentText(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-white focus:outline-none"
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => setEditingLiveCommentId(null)}
                                  className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-[10px] font-bold cursor-pointer"
                                >
                                  إلغاء
                                </button>
                                <button
                                  onClick={() => handleSaveLiveCommentEdit(item)}
                                  className="px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-bold cursor-pointer"
                                >
                                  حفظ التعديل
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-200 bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-2.5 leading-relaxed whitespace-pre-wrap">
                              {item.text || '(بدون نص)'}
                            </p>
                          )}

                          {/* Action Buttons Row */}
                          <div
                            onClick={e => e.stopPropagation()}
                            className="flex flex-wrap items-center justify-between gap-2 pt-2.5 mt-2 border-t border-zinc-900"
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              {onNavigate && item.collectionName === 'comments' && (
                                <button
                                  onClick={() => {
                                    if (item.animeId === 'community' || item.animeId === 'community_reply') {
                                      onNavigate('community', { focusCommentId: item.id });
                                    } else {
                                      onNavigate('anime_comments', {
                                        animeId: item.animeId,
                                        focusCommentId: item.id
                                      });
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-bold text-zinc-300 flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye size={11} />
                                  <span>معاينة بالموقع</span>
                                </button>
                              )}

                              {item.collectionName === 'comments' && (
                                <>
                                  <button
                                    onClick={() => handleToggleLiveCommentSpoiler(item)}
                                    className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-bold text-amber-400 flex items-center gap-1 cursor-pointer"
                                  >
                                    <EyeOff size={11} />
                                    <span>{item.isSpoiler ? 'إلغاء الحرق' : 'تحديد كحرق'}</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      setEditingLiveCommentId(item.uniqueKey);
                                      setEditingLiveCommentText(item.text || '');
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-bold text-sky-400 cursor-pointer"
                                  >
                                    تعديل النص
                                  </button>
                                </>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 mr-auto">
                              {item.authorId && (
                                <>
                                  <button
                                    onClick={() => handleQuickMuteAuthor(item.authorId, item.authorName)}
                                    className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                  >
                                    <VolumeX size={11} />
                                    <span>{isAuthorMuted ? 'فك الكتم' : 'كتم الكاتب'}</span>
                                  </button>

                                  {(role === 'owner' || role === 'admin' || modPerms.canBan) && (
                                    <button
                                      onClick={() => handleBan(item.authorId)}
                                      className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                    >
                                      <UserX size={11} />
                                      <span>حظر الكاتب</span>
                                    </button>
                                  )}
                                </>
                              )}

                              <button
                                onClick={() => handleDeleteSingleLiveItem(item)}
                                className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Trash2 size={11} />
                                <span>حذف</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 2.1: REPORTS */}
            {modSubTab === 'reports' && (
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
                  <div>
                    <h2 className="text-sm font-black text-white">مراجعة البلاغات والمخالفات</h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">التحقق من التعليقات والتوصيات المبلّغ عنها مع جلب تلقائي للنص والكاتب</p>
                  </div>
                  <div className="flex gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    {[
                      { id: 'pending', label: `معلّقة (${pendingReportsCount})` },
                      { id: 'resolved', label: `معالجة (${reports.length - pendingReportsCount})` },
                      { id: 'all', label: `الكل (${reports.length})` }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setReportFilter(f.id as any)}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                          reportFilter === f.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {(() => {
                  const filtered = reports.filter(r =>
                    reportFilter === 'all'
                      ? true
                      : reportFilter === 'pending'
                        ? r.status === 'pending'
                        : r.status !== 'pending'
                  );
                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-12 text-zinc-500 space-y-2">
                        <ShieldCheck size={32} className="mx-auto text-emerald-500/60" />
                        <p className="text-xs font-bold text-zinc-300">لا توجد بلاغات في هذا القسم</p>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-3">
                      {filtered.map((report, rIdx) => {
                        // Dynamic fallback lookup if report was created before metadata enrichment
                        const liveCommentMatch =
                          report.contentType === 'comment'
                            ? liveComments.find(c => c.id === report.contentId)
                            : null;
                        const liveRecMatch =
                          report.contentType === 'recommendation'
                            ? recommendations.find(r => r.id === report.contentId)
                            : null;

                        const resolvedText =
                          report.contentText ||
                          liveCommentMatch?.text ||
                          liveRecMatch?.reason ||
                          'المحتوى غير متوفر أو تم حذفه مسبقاً';
                        const resolvedAuthorId =
                          report.authorId || liveCommentMatch?.userId || liveRecMatch?.userId || '';
                        const resolvedAuthorName =
                          report.authorName ||
                          liveCommentMatch?.userDisplayName ||
                          (resolvedAuthorId ? getUserNameByUid(resolvedAuthorId) : 'غير معروف');
                        const resolvedAnimeId =
                          report.animeId || liveCommentMatch?.animeId || liveRecMatch?.animeId || '';

                        return (
                          <div
                            key={`report-${report.id || rIdx}-${rIdx}`}
                            className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 space-y-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                              <span
                                className={`px-2 py-0.5 rounded-md font-bold ${
                                  report.status === 'pending'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                }`}
                              >
                                {report.status === 'pending' ? 'بانتظار المراجعة' : 'تمت المعالجة'}
                              </span>
                              <div className="flex flex-wrap items-center gap-3 text-zinc-400">
                                <span>المبلّغ: {getUserNameByUid(report.reporterId)}</span>
                                <span className="text-rose-400 font-bold">
                                  صاحب المحتوى: {resolvedAuthorName}
                                </span>
                              </div>
                            </div>

                            <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-3 space-y-1.5">
                              <div className="text-[10px] text-zinc-400 font-bold">
                                سبب البلاغ: <span className="text-amber-300">{report.reason}</span>
                              </div>
                              <p className="text-xs text-zinc-100 leading-relaxed whitespace-pre-wrap">
                                {resolvedText}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              {onNavigate && resolvedAnimeId && (
                                <button
                                  onClick={() => {
                                    if (report.contentType === 'comment') {
                                      if (resolvedAnimeId === 'community' || resolvedAnimeId === 'community_reply') {
                                        onNavigate('community', { focusCommentId: report.contentId });
                                      } else {
                                        onNavigate('anime_comments', {
                                          animeId: resolvedAnimeId,
                                          focusCommentId: report.contentId
                                        });
                                      }
                                    } else {
                                      onNavigate('anime_details', { id: resolvedAnimeId });
                                    }
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-bold text-zinc-300 cursor-pointer transition"
                                >
                                  <Eye size={13} />
                                  <span>معاينة الموقع</span>
                                </button>
                              )}

                              {report.status === 'pending' && (
                                <div className="flex flex-wrap items-center gap-2 mr-auto">
                                  {resolvedAuthorId && (
                                    <button
                                      onClick={() => handleQuickMuteAuthor(resolvedAuthorId, resolvedAuthorName)}
                                      className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-[11px] font-bold text-amber-400 cursor-pointer transition flex items-center gap-1"
                                    >
                                      <VolumeX size={12} />
                                      <span>كتم الكاتب</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleResolveReport(report, 'dismissed')}
                                    className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[11px] font-bold text-zinc-300 cursor-pointer transition"
                                  >
                                    تجاهل وحفظ
                                  </button>
                                  <button
                                    onClick={() => handleResolveReport(report, 'deleted_content')}
                                    className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-[11px] font-bold text-white cursor-pointer transition flex items-center gap-1"
                                  >
                                    <Trash2 size={12} />
                                    <span>حذف المحتوى المخالف</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* SUB-TAB 2.2: RECOMMENDATIONS */}
            {modSubTab === 'recommendations' && (
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
                  <div>
                    <h2 className="text-sm font-black text-white">مراجعة واعتماد توصيات الأنمي</h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      قبول أو رفض التوصيات المقدمة من الأعضاء مع إشعار فوري للموصي
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      {
                        id: 'all',
                        label: 'الكل',
                        count: recommendations.length
                      },
                      {
                        id: 'pending',
                        label: 'قيد المراجعة',
                        count: recommendations.filter(r => (r.status || 'approved') === 'pending').length
                      },
                      {
                        id: 'approved',
                        label: 'معتمدة',
                        count: recommendations.filter(r => (r.status || 'approved') === 'approved').length
                      },
                      {
                        id: 'rejected',
                        label: 'مرفوضة',
                        count: recommendations.filter(r => (r.status || 'approved') === 'rejected').length
                      }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setRecStatusFilter(tab.id as any)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                          recStatusFilter === tab.id
                            ? 'bg-zinc-800 text-white border border-zinc-700'
                            : 'bg-zinc-950 text-zinc-400 border border-zinc-800/80 hover:text-white'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-900 text-zinc-300">
                          {tab.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search Input */}
                <div className="relative">
                  <Search size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={searchRecQuery}
                    onChange={e => setSearchRecQuery(e.target.value)}
                    placeholder="ابحث باسم الأنمي، سبب التوصية، أو اسم العضو..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-700"
                  />
                </div>

                {(() => {
                  const list = recommendations.filter(rec => {
                    const st = rec.status || 'approved';
                    if (recStatusFilter !== 'all' && st !== recStatusFilter) return false;
                    const q = searchRecQuery.toLowerCase().trim();
                    if (!q) return true;
                    const resolvedSrcTitle =
                      (rec.animeTitle && rec.animeTitle !== 'أنمي' ? rec.animeTitle : resolvedAnimeMeta[rec.animeId]?.title) ||
                      rec.animeId ||
                      '';
                    return (
                      (rec.targetAnimeTitle || '').toLowerCase().includes(q) ||
                      resolvedSrcTitle.toLowerCase().includes(q) ||
                      (rec.reason || '').toLowerCase().includes(q) ||
                      getUserNameByUid(rec.userId).toLowerCase().includes(q)
                    );
                  });

                  if (list.length === 0) {
                    return (
                      <div className="text-center py-12 text-zinc-500 text-xs font-bold">
                        لا توجد توصيات في هذه القائمة حالياً
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {list.map((rec, rIdx) => {
                        const userName = getUserNameByUid(rec.userId);
                        const currentStatus = rec.status || 'approved';
                        const srcTitle =
                          (rec.animeTitle && rec.animeTitle !== 'أنمي'
                            ? rec.animeTitle
                            : resolvedAnimeMeta[rec.animeId]?.title) || `أنمي #${rec.animeId}`;
                        const srcPoster = rec.animePosterUrl || resolvedAnimeMeta[rec.animeId]?.posterUrl || '';
                        const tgtTitle =
                          rec.targetAnimeTitle ||
                          resolvedAnimeMeta[rec.targetAnimeId]?.title ||
                          `أنمي #${rec.targetAnimeId}`;
                        const tgtPoster = rec.targetAnimePosterUrl || resolvedAnimeMeta[rec.targetAnimeId]?.posterUrl || '';

                        return (
                          <div
                            key={`rec-${rec.id || rIdx}-${rIdx}`}
                            className="bg-zinc-950/80 border border-zinc-800/90 rounded-2xl p-4 flex flex-col justify-between gap-3.5 shadow-lg"
                          >
                            {/* Header: Status Badge & Natural Arabic Summary */}
                            <div className="flex flex-col gap-2 border-b border-zinc-800/70 pb-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold text-zinc-400">
                                  اقتراح من العضو: <strong className="text-white">{userName}</strong>
                                </span>
                                <span
                                  className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                                    currentStatus === 'pending'
                                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                      : currentStatus === 'approved'
                                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                      : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                  }`}
                                >
                                  {currentStatus === 'pending'
                                    ? 'قيد المراجعة'
                                    : currentStatus === 'approved'
                                    ? 'منشورة ومعتمدة'
                                    : 'مرفوضة'}
                                </span>
                              </div>

                              <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-900/60 border border-zinc-800/70 rounded-xl px-3 py-2">
                                عند تصفح أنمي{' '}
                                <strong className="text-sky-400 font-black">«{srcTitle}»</strong>، يوصي بمشاهدة أنمي مشابه له وهو{' '}
                                <strong className="text-amber-400 font-black">«{tgtTitle}»</strong>
                              </p>
                            </div>

                            {/* Visual Side-by-Side Comparison */}
                            <div className="grid grid-cols-2 gap-2.5">
                              {/* Box 1: Source Anime (Where user was browsing) */}
                              <div
                                onClick={() => {
                                  if (onNavigate && rec.animeId) {
                                    onNavigate('anime_details', { id: String(rec.animeId) });
                                  }
                                }}
                                className="bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/80 hover:border-sky-500/40 rounded-xl p-2.5 flex items-center gap-2.5 cursor-pointer transition group"
                                title="اضغط لفتح صفحة هذا الأنمي"
                              >
                                {srcPoster ? (
                                  <img
                                    src={srcPoster}
                                    alt={srcTitle}
                                    referrerPolicy="no-referrer"
                                    className="w-11 h-16 rounded-lg object-cover shrink-0 bg-zinc-950 border border-zinc-800"
                                  />
                                ) : (
                                  <div className="w-11 h-16 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0 text-[9px] text-zinc-500 font-bold text-center px-1">
                                    بدون غلاف
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <span className="text-[9px] font-black text-sky-400 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded inline-block mb-1">
                                    ١. صفحة الأنمي الأصلية
                                  </span>
                                  <p className="text-xs font-black text-white line-clamp-2 leading-snug group-hover:text-sky-300 transition">
                                    {srcTitle}
                                  </p>
                                </div>
                              </div>

                              {/* Box 2: Recommended Target Anime */}
                              <div
                                onClick={() => {
                                  if (onNavigate && rec.targetAnimeId) {
                                    onNavigate('anime_details', { id: String(rec.targetAnimeId) });
                                  }
                                }}
                                className="bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/25 hover:border-amber-500/50 rounded-xl p-2.5 flex items-center gap-2.5 cursor-pointer transition group"
                                title="اضغط لفتح صفحة الأنمي المُوصى به"
                              >
                                {tgtPoster ? (
                                  <img
                                    src={tgtPoster}
                                    alt={tgtTitle}
                                    referrerPolicy="no-referrer"
                                    className="w-11 h-16 rounded-lg object-cover shrink-0 bg-zinc-950 border border-amber-500/30"
                                  />
                                ) : (
                                  <div className="w-11 h-16 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0 text-[9px] text-zinc-500 font-bold text-center px-1">
                                    بدون غلاف
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <span className="text-[9px] font-black text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded inline-block mb-1">
                                    ٢. الأنمي المُوصى به
                                  </span>
                                  <p className="text-xs font-black text-white line-clamp-2 leading-snug group-hover:text-amber-300 transition">
                                    {tgtTitle}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Reason Box */}
                            <div className="bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/60 space-y-1">
                              <span className="text-[10px] font-black text-zinc-400 block">
                                سبب التوصية (لماذا يتشابه العملان؟):
                              </span>
                              <p className="text-xs text-zinc-200 leading-relaxed font-medium">
                                "{rec.reason}"
                              </p>
                            </div>

                            {recIdBeingRejected === rec.id ? (
                              <div className="bg-zinc-900 border border-rose-500/30 p-2.5 rounded-xl space-y-2">
                                <input
                                  type="text"
                                  value={recRejectionReasonInput}
                                  onChange={e => setRecRejectionReasonInput(e.target.value)}
                                  placeholder="اكتب سبب الرفض لإرساله للعضو..."
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => setRecIdBeingRejected(null)}
                                    className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-[10px] font-bold cursor-pointer"
                                  >
                                    إلغاء
                                  </button>
                                  <button
                                    onClick={() => handleRejectRec(rec, recRejectionReasonInput)}
                                    className="px-3 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                                  >
                                    تأكيد الرفض
                                  </button>
                                </div>
                              </div>
                            ) : recIdBeingDeleted === rec.id ? (
                              <div className="bg-zinc-900 border border-rose-500/30 p-2.5 rounded-xl flex items-center justify-between">
                                <span className="text-[11px] text-zinc-200 font-bold">تأكيد الحذف النهائي؟</span>
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => setRecIdBeingDeleted(null)}
                                    className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-[10px] font-bold cursor-pointer"
                                  >
                                    تراجع
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRec(rec.id)}
                                    className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                                  >
                                    نعم، احذف
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between pt-2 border-t border-zinc-900 text-[11px]">
                                <span className="text-[10px] text-zinc-500">
                                  تظهر التوصية في صفحتي العملين بعد الاعتماد
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {currentStatus !== 'approved' && (
                                    <button
                                      onClick={() => handleApproveRec(rec)}
                                      className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/25 font-bold cursor-pointer transition"
                                    >
                                      قبول ونشر
                                    </button>
                                  )}
                                  {currentStatus !== 'rejected' && (
                                    <button
                                      onClick={() => {
                                        setRecIdBeingRejected(rec.id);
                                        setRecRejectionReasonInput('');
                                      }}
                                      className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-bold cursor-pointer transition"
                                    >
                                      رفض
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setRecIdBeingDeleted(rec.id)}
                                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-rose-500/15 text-zinc-400 hover:text-rose-400 border border-zinc-800 cursor-pointer transition"
                                    title="حذف نهائي"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* SUB-TAB 2.3: SUGGESTIONS & COMPLAINTS */}
            {modSubTab === 'suggestions' && (
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
                  <div>
                    <h2 className="text-sm font-black text-white">صندوق المقترحات والشكاوى</h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      الرسائل المرسلة من الأعضاء مع إمكانية الرد المباشر عبر الإشعارات
                    </p>
                  </div>
                  <div className="flex gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    {[
                      { id: 'all', label: `الكل (${suggestionsList.length})` },
                      {
                        id: 'suggestion',
                        label: `مقترحات (${suggestionsList.filter(s => s.type === 'suggestion').length})`
                      },
                      {
                        id: 'complaint',
                        label: `شكاوى (${suggestionsList.filter(s => s.type === 'complaint').length})`
                      }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setSuggestionsFilter(f.id as any)}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                          suggestionsFilter === f.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {suggestionsList.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500 text-xs font-bold">
                    لا توجد مقترحات أو شكاوى حالياً
                  </div>
                ) : (
                  <div className="space-y-3">
                    {suggestionsList
                      .filter(s => (suggestionsFilter === 'all' ? true : s.type === suggestionsFilter))
                      .map((s: any, sIdx: number) => (
                        <div
                          key={`sug-${s.id || sIdx}-${sIdx}`}
                          className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                  s.type === 'complaint'
                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                    : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                }`}
                              >
                                {s.type === 'complaint' ? 'تذكرة / مشكلة' : 'اقتراح تطوير'}
                              </span>
                              {s.category && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
                                  {s.category}
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                  s.status === 'replied' || s.status === 'resolved'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : s.status === 'in_progress'
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                                }`}
                              >
                                {s.status === 'replied'
                                  ? 'تم الرد'
                                  : s.status === 'resolved'
                                  ? 'مكتملة'
                                  : s.status === 'in_progress'
                                  ? 'قيد المعالجة'
                                  : 'جديدة'}
                              </span>
                              <span className="text-xs font-bold text-white">{s.displayName || 'عضو'}</span>
                              {s.email && <span className="text-[10px] text-zinc-500 font-mono">({s.email})</span>}
                            </div>
                            <span className="text-[10px] text-zinc-500">
                              {s.createdAt?.seconds
                                ? new Date(s.createdAt.seconds * 1000).toLocaleDateString('ar-EG')
                                : ''}
                            </span>
                          </div>

                          {s.subject && (
                            <div className="text-xs font-black text-white">{s.subject}</div>
                          )}

                          <p className="text-xs text-zinc-200 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/60 leading-relaxed whitespace-pre-wrap">
                            {s.message}
                          </p>

                          {s.adminReply && (
                            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-emerald-400 font-bold">
                                <span>رد الإدارة ({s.repliedBy || 'المشرف'}):</span>
                              </div>
                              <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap">
                                {s.adminReply}
                              </p>
                            </div>
                          )}

                          {replyingSuggestion?.id === s.id ? (
                            <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-xl space-y-2">
                              <input
                                type="text"
                                value={suggestionReplyText}
                                onChange={e => setSuggestionReplyText(e.target.value)}
                                placeholder="اكتب رد الإدارة ليظهر في صفحة تذاكر العضو ويصله كإشعار..."
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => setReplyingSuggestion(null)}
                                  className="px-3 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-[11px] font-bold cursor-pointer"
                                >
                                  إلغاء
                                </button>
                                <button
                                  onClick={() => handleReplyToSuggestion(s)}
                                  className="px-3 py-1 rounded-lg bg-[#FF1744] text-white text-[11px] font-bold cursor-pointer flex items-center gap-1"
                                >
                                  <Send size={12} />
                                  <span>حفظ وإرسال الرد</span>
                                </button>
                              </div>
                            </div>
                          ) : suggestionBeingDeleted === s.id ? (
                            <div className="flex items-center justify-between bg-zinc-900 p-2.5 rounded-xl border border-rose-500/30">
                              <span className="text-xs text-zinc-200 font-bold">هل تريد حذف وأرشفة هذه التذكرة؟</span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setSuggestionBeingDeleted(null)}
                                  className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-[10px] font-bold cursor-pointer"
                                >
                                  تراجع
                                </button>
                                <button
                                  onClick={() => handleDeleteSuggestion(s.id)}
                                  className="px-3 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                                >
                                  تأكيد الحذف
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              <div className="flex items-center gap-1.5">
                                {s.status !== 'in_progress' && s.status !== 'resolved' && (
                                  <button
                                    onClick={() => handleUpdateSuggestionStatus(s, 'in_progress')}
                                    className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-[10px] font-bold cursor-pointer transition"
                                  >
                                    قيد المعالجة
                                  </button>
                                )}
                                {s.status !== 'resolved' && (
                                  <button
                                    onClick={() => handleUpdateSuggestionStatus(s, 'resolved')}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold cursor-pointer transition"
                                  >
                                    إغلاق كمكتملة
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setReplyingSuggestion(s);
                                    setSuggestionReplyText(s.adminReply || '');
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 text-[11px] font-bold cursor-pointer transition"
                                >
                                  {s.adminReply ? 'تعديل الرد' : 'الرد على التذكرة'}
                                </button>
                                <button
                                  onClick={() => setSuggestionBeingDeleted(s.id)}
                                  className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-rose-500/15 text-zinc-400 hover:text-rose-400 border border-zinc-800 text-[11px] font-bold cursor-pointer transition"
                                >
                                  حذف
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* SUB-TAB 2.4: AUDIT LOGS (سجل نشاط المشرفين) */}
            {modSubTab === 'audit' && (
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
                  <div>
                    <h2 className="text-sm font-black text-white">سجل نشاط المشرفين والعمليات (Audit Log)</h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      توثيق لحظي لكل إجراء إداري (حظر، قبول توصية، تعديل رصيد، أكواد هدايا، إعدادات)
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    {[
                      { id: 'all', label: 'الكل' },
                      { id: 'report', label: 'البلاغات' },
                      { id: 'recommendation', label: 'التوصيات' },
                      { id: 'ban', label: 'الحظر' },
                      { id: 'member_edit', label: 'الأعضاء' },
                      { id: 'promo', label: 'الهدايا' },
                      { id: 'settings', label: 'الإعدادات' }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setAuditTypeFilter(f.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                          auditTypeFilter === f.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {(() => {
                  const filtered = auditLogs.filter(l =>
                    auditTypeFilter === 'all' ? true : l.actionType === auditTypeFilter
                  );
                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-12 text-zinc-500 text-xs font-bold">
                        لا توجد سجلات نشاط مسجلة في هذا التصنيف حتى الآن
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                      {filtered.map((log, idx) => (
                        <div
                          key={`audit-${log.id || idx}-${idx}`}
                          className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                  log.actionType === 'ban'
                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                    : log.actionType === 'promo'
                                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                      : log.actionType === 'recommendation'
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                        : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                }`}
                              >
                                {log.actorName} ({log.actorRole === 'owner' ? 'المالك' : log.actorRole === 'admin' ? 'مدير' : 'مشرف'})
                              </span>
                              <span className="text-xs font-bold text-white">{log.details}</span>
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              الهدف: <strong className="text-zinc-200">{log.targetLabel}</strong>
                            </div>
                          </div>
                          <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                            {log.createdAt?.seconds
                              ? new Date(log.createdAt.seconds * 1000).toLocaleString('ar-EG', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })
                              : 'الآن'}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
    </>
  );
};
