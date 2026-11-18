import React from "react";
import { UserX, Users, Trash2, Search, Copy, Coins, VolumeX, Gamepad2, Crown, Gift, Ticket, X } from "lucide-react";
import { RoleLevel, isStaffEmail } from "../../services/moderationService";
import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useAdminDashboard } from "./AdminDashboardContext";

export const AdminCommunityTab: React.FC = () => {
  const {
    role,
    workspace,
    commSubTab,
    setCommSubTab,
    usersInfo,
    bannedUsers,
    allUsers,
    promoCodesList,
    newPromoCode,
    setNewPromoCode,
    newPromoCoins,
    setNewPromoCoins,
    newPromoXp,
    setNewPromoXp,
    newPromoMaxUses,
    setNewPromoMaxUses,
    isCreatingPromo,
    massGrantCoins,
    setMassGrantCoins,
    massGrantXp,
    setMassGrantXp,
    massGrantSegment,
    setMassGrantSegment,
    isGrantingMass,
    modPerms,
    searchUserQuery,
    setSearchUserQuery,
    userFilterBy,
    setUserFilterBy,
    userSortBy,
    setUserSortBy,
    editingUser,
    setEditingUser,
    editingCoins,
    setEditingCoins,
    editingXP,
    setEditingXP,
    editingLevel,
    setEditingLevel,
    editingIsMuted,
    setEditingIsMuted,
    editingIsGamesRestricted,
    setEditingIsGamesRestricted,
    editingIsCoinsRestricted,
    setEditingIsCoinsRestricted,
    isUpdatingUser,
    roleSearchQuery,
    setRoleSearchQuery,
    selectedSearchUser,
    setSelectedSearchUser,
    userIdInput,
    setUserIdInput,
    roleInput,
    setRoleInput,
    banReasonInput,
    setBanReasonInput,
    confirmDemoteUid,
    setConfirmDemoteUid,
    editingPermissionsMod,
    setEditingPermissionsMod,
    modCustomPerms,
    setModCustomPerms,
    notify,
    getUserNameByUid,
    matchesUserSearch,
    calculateTotalCumulativeXp,
    calculateLevelAndXpFromTotal,
    statsMetrics,
    handleUpdateUserStats,
    handleAssignRole,
    handleDemoteStaff,
    handleSaveModCustomPermissions,
    handleBan,
    handleUnban,
    handleCreatePromoCode,
    handleTogglePromo,
    handleDeletePromo,
    handleMassGrant,
    suggestedRoleUsers
  } = useAdminDashboard();

  return (
    <>
        {workspace === 'community' && (
          <div className="space-y-5">
            {/* Sub-Tabs Selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar bg-[#121215] border border-zinc-800/80 p-1.5 rounded-2xl">
              <button
                type="button"
                onClick={() => setCommSubTab('members')}
                className={`min-h-[44px] flex items-center gap-2 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  commSubTab === 'members' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Users size={14} className="text-emerald-400" />
                <span className="tabular-nums">الأعضاء ({allUsers.length})</span>
              </button>

              {(role === 'owner' || role === 'admin' || modPerms.canViewRoles) && (
                <button
                  type="button"
                  onClick={() => setCommSubTab('roles')}
                  className={`min-h-[44px] flex items-center gap-2 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    commSubTab === 'roles' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Crown size={14} className="text-violet-400" />
                  <span className="tabular-nums">الرتب ({usersInfo.length})</span>
                </button>
              )}

              {(role === 'owner' || role === 'admin' || modPerms.canBan) && (
                <button
                  type="button"
                  onClick={() => setCommSubTab('bans')}
                  className={`min-h-[44px] flex items-center gap-2 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    commSubTab === 'bans' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <UserX size={14} className="text-rose-400" />
                  <span className="tabular-nums">الحظر ({bannedUsers.length})</span>
                </button>
              )}

              {(role === 'owner' || role === 'admin' || modPerms.canManageSettings) && (
                <button
                  type="button"
                  onClick={() => setCommSubTab('promos')}
                  className={`min-h-[44px] flex items-center gap-2 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    commSubTab === 'promos' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Gift size={14} className="text-amber-400" />
                  <span className="tabular-nums">الأكواد والإهداء ({promoCodesList.length})</span>
                </button>
              )}
            </div>

            {/* SUB-TAB 3.1: MEMBERS DIRECTORY */}
            {commSubTab === 'members' && (
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                {/* Search & Filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="relative">
                    <Search size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="text"
                      value={searchUserQuery}
                      onChange={e => setSearchUserQuery(e.target.value)}
                      placeholder="ابحث بالاسم، @username، البريد، أو UID..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-700"
                    />
                  </div>

                  <select
                    value={userFilterBy}
                    onChange={e => setUserFilterBy(e.target.value as any)}
                    className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 font-bold focus:outline-none"
                  >
                    <option value="all">جميع الأعضاء ({allUsers.length})</option>
                    <option value="staff">طاقم الإدارة والإشراف</option>
                    <option value="muted">الأعضاء المكتومون ({statsMetrics.mutedCount})</option>
                    <option value="gamesRestricted">مقيدو الألعاب</option>
                    <option value="coinsRestricted">مجمدو الكوينز</option>
                  </select>

                  <select
                    value={userSortBy}
                    onChange={e => setUserSortBy(e.target.value as any)}
                    className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 font-bold focus:outline-none"
                  >
                    <option value="default">الترتيب الافتراضي</option>
                    <option value="coins">الأعلى رصيد كوينز</option>
                    <option value="level">الأعلى مستوى (Level)</option>
                    <option value="xp">الأعلى خبرة (XP)</option>
                  </select>
                </div>

                {/* Member Edit Drawer / Panel */}
                {editingUser && (
                  <div className="bg-zinc-950 border border-[#FF1744]/40 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center text-xs font-bold">
                          {editingUser.photoURL ? (
                            <img src={editingUser.photoURL} alt="" className="w-full h-full object-cover" />
                          ) : (
                            (editingUser.displayName || 'U')[0]
                          )}
                        </div>
                        <div>
                          <h3 className="text-xs font-black text-white">
                            تعديل بيانات وصلاحيات: {editingUser.displayName || 'عضو'}
                          </h3>
                          <span className="text-[10px] text-zinc-500 font-mono">@{editingUser.username || editingUser.uid}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setEditingUser(null)}
                        className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer"
                      >
                        <X size={15} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] text-zinc-400 font-bold mb-1">رصيد الكوينز</label>
                        <input
                          type="number"
                          value={editingCoins}
                          onChange={e => setEditingCoins(Number(e.target.value))}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-3 text-xs font-bold text-amber-400 text-center focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-400 font-bold mb-1">إجمالي الخبرة (XP)</label>
                        <input
                          type="number"
                          value={editingXP}
                          onChange={e => {
                            const val = Math.max(0, Number(e.target.value));
                            setEditingXP(val);
                            setEditingLevel(calculateLevelAndXpFromTotal(val).level);
                          }}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-3 text-xs font-bold text-sky-400 text-center focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-400 font-bold mb-1">المستوى (1 - 100)</label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={editingLevel}
                          onChange={e => {
                            const lvl = Math.max(1, Math.min(100, Number(e.target.value)));
                            setEditingLevel(lvl);
                            setEditingXP(calculateTotalCumulativeXp(lvl, 0));
                          }}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-3 text-xs font-bold text-emerald-400 text-center focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setEditingIsMuted(!editingIsMuted)}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition ${
                          editingIsMuted
                            ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <VolumeX size={14} /> كتم التعليقات
                        </span>
                        <span>{editingIsMuted ? 'مفعّل' : 'غير مفعّل'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingIsGamesRestricted(!editingIsGamesRestricted)}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition ${
                          editingIsGamesRestricted
                            ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <Gamepad2 size={14} /> تقييد الألعاب
                        </span>
                        <span>{editingIsGamesRestricted ? 'مفعّل' : 'غير مفعّل'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingIsCoinsRestricted(!editingIsCoinsRestricted)}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition ${
                          editingIsCoinsRestricted
                            ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <Coins size={14} /> تجميد الكوينز
                        </span>
                        <span>{editingIsCoinsRestricted ? 'مفعّل' : 'غير مفعّل'}</span>
                      </button>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => setEditingUser(null)}
                        className="px-4 py-2 rounded-xl bg-zinc-900 text-zinc-400 text-xs font-bold cursor-pointer"
                      >
                        إلغاء
                      </button>
                      <button
                        onClick={handleUpdateUserStats}
                        disabled={isUpdatingUser}
                        className="px-5 py-2 rounded-xl bg-[#FF1744] hover:bg-rose-600 text-white text-xs font-bold cursor-pointer transition"
                      >
                        {isUpdatingUser ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Members List */}
                <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                  {(() => {
                    const filtered = allUsers
                      .filter(u => {
                        if (!matchesUserSearch(u, searchUserQuery)) return false;
                        const memberRoleObj = usersInfo.find(r => r.uid === u.uid || r.id === u.uid);
                        const memberRole = isStaffEmail(u.email) ? 'owner' : memberRoleObj?.role || u.role || 'user';
                        if (userFilterBy === 'staff') return memberRole !== 'user';
                        if (userFilterBy === 'muted') return u.isMuted === true;
                        if (userFilterBy === 'gamesRestricted') return u.isGamesRestricted === true;
                        if (userFilterBy === 'coinsRestricted') return u.isCoinsRestricted === true;
                        return true;
                      })
                      .sort((a, b) => {
                        if (userSortBy === 'coins') return (b.coins || 0) - (a.coins || 0);
                        if (userSortBy === 'level') return (b.level || 1) - (a.level || 1);
                        if (userSortBy === 'xp') return (b.xp || 0) - (a.xp || 0);
                        return 0;
                      });

                    if (filtered.length === 0) {
                      return (
                        <div className="text-center py-10 text-zinc-500 text-xs font-bold">
                          لا يوجد أعضاء مطابقون للبحث
                        </div>
                      );
                    }

                    return filtered.slice(0, 60).map((u, uIdx) => {
                      const memberRoleObj = usersInfo.find(r => r.uid === u.uid || r.id === u.uid);
                      const memberRole = isStaffEmail(u.email) ? 'owner' : memberRoleObj?.role || u.role || 'user';
                      return (
                        <div
                          key={`member-${u.uid || u.id || uIdx}-${uIdx}`}
                          className="bg-zinc-950/60 border border-zinc-800/70 hover:border-zinc-700/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-300 overflow-hidden shrink-0">
                              {u.photoURL ? (
                                <img src={u.photoURL} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                              ) : (
                                (u.displayName || 'U')[0].toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-bold text-white truncate">{u.displayName || 'عضو'}</span>
                                {memberRole !== 'user' && (
                                  <span
                                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                      memberRole === 'owner'
                                        ? 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                                        : memberRole === 'admin'
                                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                                          : 'bg-violet-500/15 text-violet-400 border border-violet-500/25'
                                    }`}
                                  >
                                    {memberRole === 'owner' ? 'المالك' : memberRole === 'admin' ? 'مدير' : 'مشرف'}
                                  </span>
                                )}
                                <span className="text-[10px] bg-zinc-900 text-zinc-300 px-1.5 py-0.5 rounded font-bold">
                                  Lvl {u.level || 1}
                                </span>
                                <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-bold">
                                  {u.coins || 0} كوينز
                                </span>
                                {u.isMuted && (
                                  <span className="text-[9px] bg-rose-500/15 text-rose-400 px-1.5 py-0.5 rounded font-bold">
                                    مكتوم
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">
                                @{u.username || u.uid} {u.email ? `• ${u.email}` : ''}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                            <button
                              onClick={() => {
                                setEditingUser(u);
                                setEditingCoins(u.coins || 0);
                                setEditingXP(calculateTotalCumulativeXp(u.level || 1, u.xp || 0));
                                setEditingLevel(u.level || 1);
                                setEditingIsMuted(u.isMuted || false);
                                setEditingIsGamesRestricted(u.isGamesRestricted || false);
                                setEditingIsCoinsRestricted(u.isCoinsRestricted || false);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-[11px] font-bold cursor-pointer transition"
                            >
                              تعديل
                            </button>

                            {(role === 'owner' || role === 'admin') && (
                              <button
                                onClick={() => {
                                  setSelectedSearchUser(u);
                                  setUserIdInput(u.username || u.uid);
                                  setCommSubTab('roles');
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 text-violet-300 text-[11px] font-bold cursor-pointer transition"
                              >
                                الرتبة
                              </button>
                            )}

                            <button
                              onClick={() => {
                                const idStr = u.username || u.uid;
                                navigator.clipboard.writeText(idStr);
                                notify(`تم نسخ المعرّف: ${idStr}`);
                              }}
                              className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer transition"
                              title="نسخ المعرّف"
                            >
                              <Copy size={13} />
                            </button>

                            {u.uid !== auth.currentUser?.uid && !isStaffEmail(u.email) && (
                              <button
                                onClick={() => handleBan(u.uid)}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-[11px] font-bold cursor-pointer transition"
                              >
                                حظر
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* SUB-TAB 3.2: ROLES & STAFF PERMISSIONS */}
            {commSubTab === 'roles' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Assign Role Card */}
                <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                  <div>
                    <h2 className="text-sm font-black text-white">تعيين أو تعديل رتبة عضو</h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">ترقية عضو إلى مشرف أو مدير أو سحب الرتبة</p>
                  </div>

                  <div className="space-y-3">
                    <div className="relative">
                      <Search size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        value={roleSearchQuery}
                        onChange={e => {
                          setRoleSearchQuery(e.target.value);
                          setSelectedSearchUser(null);
                        }}
                        placeholder="ابحث عن العضو بالاسم أو @username..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>

                    {!selectedSearchUser && (
                      <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl divide-y divide-zinc-900 max-h-44 overflow-y-auto">
                        {suggestedRoleUsers.map((u, sIdx) => (
                          <button
                            type="button"
                            key={`role-sug-${u.uid || u.id || sIdx}-${sIdx}`}
                            onClick={() => {
                              setSelectedSearchUser(u);
                              setUserIdInput(u.username || u.uid);
                            }}
                            className="w-full p-2.5 hover:bg-zinc-900 flex items-center justify-between text-xs cursor-pointer transition text-right"
                          >
                            <div>
                              <span className="font-bold text-white block">{u.displayName || 'عضو'}</span>
                              <span className="text-[10px] text-zinc-500 font-mono">@{u.username || u.uid}</span>
                            </div>
                            <span className="text-[10px] text-[#FF1744] font-bold">اختيار</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedSearchUser && (
                      <div className="flex items-center justify-between bg-zinc-900 border border-zinc-700 p-2.5 rounded-xl text-xs">
                        <div>
                          <span className="text-zinc-400">العضو المختار: </span>
                          <strong className="text-white">{selectedSearchUser.displayName}</strong>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedSearchUser(null);
                            setUserIdInput('');
                          }}
                          className="text-rose-400 text-[11px] font-bold cursor-pointer"
                        >
                          تغيير
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <select
                        value={roleInput}
                        onChange={e => setRoleInput(e.target.value as RoleLevel)}
                        className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:outline-none"
                      >
                        <option value="moderator">مشرف (Moderator)</option>
                        {role === 'owner' && <option value="admin">مدير (Admin)</option>}
                        <option value="user">عضو عادي (سحب الرتبة)</option>
                      </select>

                      <button
                        onClick={handleAssignRole}
                        className="bg-[#FF1744] hover:bg-rose-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition cursor-pointer"
                      >
                        حفظ وتطبيق الرتبة
                      </button>
                    </div>
                  </div>
                </div>

                {/* Current Staff List */}
                <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4">
                  <div>
                    <h2 className="text-sm font-black text-white">طاقم الإشراف الحالي</h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">التحكم في الصلاحيات الفرعية أو إعفاء المشرفين</p>
                  </div>

                  <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                    {usersInfo.map((u, stIdx) => {
                      const profile = allUsers.find(m => m.uid === u.uid) || { displayName: 'مشرف', username: u.uid };
                      return (
                        <div
                          key={`staff-${u.uid || u.id || stIdx}-${stIdx}`}
                          className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3 space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white">{profile.displayName}</span>
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                    u.role === 'owner'
                                      ? 'bg-rose-500/15 text-rose-400'
                                      : u.role === 'admin'
                                        ? 'bg-amber-500/15 text-amber-400'
                                        : 'bg-violet-500/15 text-violet-400'
                                  }`}
                                >
                                  {u.role === 'owner' ? 'المالك' : u.role === 'admin' ? 'مدير' : 'مشرف'}
                                </span>
                              </div>
                              <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">
                                @{profile.username || u.uid}
                              </span>
                            </div>

                            {u.role !== 'owner' && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={async () => {
                                    const docS = await getDoc(doc(db, 'globalRoles', u.uid));
                                    const d = docS.exists() ? docS.data() : {};
                                    setEditingPermissionsMod(u);
                                    setModCustomPerms({
                                      canBan: d.canBan ?? false,
                                      canNotify: d.canNotify ?? false,
                                      canManageSettings: d.canManageSettings ?? false,
                                      canViewRoles: d.canViewRoles ?? false
                                    });
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-[11px] font-bold cursor-pointer"
                                >
                                  الصلاحيات
                                </button>

                                {role === 'owner' && (
                                  <button
                                    onClick={() => setConfirmDemoteUid(u.uid)}
                                    className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-[11px] font-bold cursor-pointer"
                                  >
                                    إعفاء
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {confirmDemoteUid === u.uid && (
                            <div className="flex items-center justify-between bg-zinc-900 p-2.5 rounded-lg border border-rose-500/30">
                              <span className="text-[11px] text-zinc-200 font-bold">
                                تأكيد سحب الإشراف من {profile.displayName}؟
                              </span>
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => setConfirmDemoteUid(null)}
                                  className="px-2.5 py-1 rounded bg-zinc-800 text-zinc-300 text-[10px] font-bold cursor-pointer"
                                >
                                  تراجع
                                </button>
                                <button
                                  onClick={() => handleDemoteStaff(u.uid)}
                                  className="px-2.5 py-1 rounded bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                                >
                                  تأكيد الإعفاء
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Moderator Custom Permissions Editor */}
                  {editingPermissionsMod && (
                    <div className="bg-zinc-950 border border-zinc-700 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white">تخصيص صلاحيات المشرف</h4>
                        <button
                          onClick={() => setEditingPermissionsMod(null)}
                          className="text-zinc-400 hover:text-white text-xs cursor-pointer"
                        >
                          <X size={15} />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {[
                          { key: 'canBan', label: 'حظر وفك حظر الأعضاء' },
                          { key: 'canNotify', label: 'إرسال الإشعارات العامة' },
                          { key: 'canManageSettings', label: 'تعديل إعدادات السلايدر' },
                          { key: 'canViewRoles', label: 'الاطلاع على سجل الرتب' }
                        ].map(perm => {
                          const active = (modCustomPerms as any)[perm.key];
                          return (
                            <button
                              key={perm.key}
                              type="button"
                              onClick={() =>
                                setModCustomPerms(prev => ({ ...prev, [perm.key]: !(prev as any)[perm.key] }))
                              }
                              className={`p-2.5 rounded-lg border flex items-center justify-between font-bold cursor-pointer transition ${
                                active
                                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                              }`}
                            >
                              <span>{perm.label}</span>
                              <span>{active ? '✓' : '×'}</span>
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={handleSaveModCustomPermissions}
                        className="w-full bg-[#FF1744] hover:bg-rose-600 text-white font-bold py-2 rounded-xl text-xs cursor-pointer transition"
                      >
                        حفظ الصلاحيات
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUB-TAB 3.3: BANS MANAGEMENT */}
            {commSubTab === 'bans' && (
              <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-5">
                <div>
                  <h2 className="text-sm font-black text-white">إدارة الحظر وفك القيود</h2>
                  <p className="text-[11px] text-zinc-400 mt-0.5">حظر الحسابات المخالفة أو استعادة الحسابات المحظورة</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-800/80">
                  <input
                    type="text"
                    value={userIdInput}
                    onChange={e => setUserIdInput(e.target.value)}
                    placeholder="اسم المستخدم (@username) أو UID..."
                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                  <input
                    type="text"
                    value={banReasonInput}
                    onChange={e => setBanReasonInput(e.target.value)}
                    placeholder="سبب الحظر..."
                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                  <button
                    onClick={() => handleBan()}
                    className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-2 px-4 rounded-xl text-xs cursor-pointer transition"
                  >
                    تنفيذ الحظر
                  </button>
                </div>

                <div className="space-y-2">
                  {bannedUsers.length === 0 ? (
                    <div className="text-center py-10 text-zinc-500 text-xs font-bold">
                      لا توجد حسابات محظورة حالياً
                    </div>
                  ) : (
                    bannedUsers.map((b, bIdx) => (
                      <div
                        key={`ban-${b.uid || bIdx}-${bIdx}`}
                        className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3 flex items-center justify-between gap-3"
                      >
                        <div>
                          <span className="text-xs font-bold text-white block">{getUserNameByUid(b.uid)}</span>
                          <span className="text-[10px] text-zinc-500 block mt-0.5">
                            السبب: {b.reason || 'مخالفة شروط الاستخدام'}
                          </span>
                        </div>
                        <button
                          onClick={() => handleUnban(b.uid)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 text-emerald-400 text-xs font-bold cursor-pointer transition"
                        >
                          فك الحظر
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* SUB-TAB 3.4: PROMO CODES & MASS GRANTS (أكواد المكافآت والإهداء الجماعي) */}
            {commSubTab === 'promos' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Create Promo Code + Active Codes List */}
                <div className="lg:col-span-2 bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-5">
                  <div className="border-b border-zinc-800/80 pb-3">
                    <h2 className="text-sm font-black text-white flex items-center gap-2">
                      <Ticket size={16} className="text-amber-400" />
                      <span>إنشاء وإدارة أكواد الهدايا (Promo Codes)</span>
                    </h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      يمكن للأعضاء استرداد الكود من صفحة الجوائز للحصول على كوينز و XP فورية
                    </p>
                  </div>

                  {/* Create Form */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-800">
                    <div>
                      <label className="block text-[10px] text-zinc-400 font-bold mb-1">رمز الكود</label>
                      <input
                        type="text"
                        dir="ltr"
                        value={newPromoCode}
                        onChange={e => setNewPromoCode(e.target.value.toUpperCase())}
                        placeholder="OTAKU500"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono font-black text-amber-400 uppercase text-center focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 font-bold mb-1">الكوينز الممنوحة</label>
                      <input
                        type="number"
                        min={0}
                        value={newPromoCoins}
                        onChange={e => setNewPromoCoins(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-white text-center focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 font-bold mb-1">نقاط الخبرة (XP)</label>
                      <input
                        type="number"
                        min={0}
                        value={newPromoXp}
                        onChange={e => setNewPromoXp(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-white text-center focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 font-bold mb-1">الحد الأقصى للاستخدام</label>
                      <input
                        type="number"
                        min={1}
                        value={newPromoMaxUses}
                        onChange={e => setNewPromoMaxUses(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-white text-center focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleCreatePromoCode}
                    disabled={isCreatingPromo || !newPromoCode.trim()}
                    className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-black py-2.5 rounded-xl text-xs transition cursor-pointer"
                  >
                    {isCreatingPromo ? 'جاري الإنشاء...' : '+ إنشاء ونشر كود المكافأة'}
                  </button>

                  {/* Codes List */}
                  <div className="space-y-2.5 pt-2">
                    {promoCodesList.length === 0 ? (
                      <div className="text-center py-8 text-zinc-500 text-xs font-bold">
                        لا توجد أكواد هدايا مضافة حالياً
                      </div>
                    ) : (
                      promoCodesList.map((promo, pIdx) => {
                        const isExhausted = (promo.usedCount || 0) >= (promo.maxUses || 1);
                        return (
                          <div
                            key={`promo-${promo.id || pIdx}-${pIdx}`}
                            className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(promo.code);
                                  notify(`تم نسخ الكود: ${promo.code}`);
                                }}
                                className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono font-black text-xs flex items-center gap-1.5 cursor-pointer"
                                title="نسخ الكود"
                              >
                                <span>{promo.code}</span>
                                <Copy size={12} />
                              </button>
                              <div>
                                <div className="flex items-center gap-2 text-xs font-bold text-white">
                                  <span className="text-amber-400">+{promo.rewardCoins} كوينز</span>
                                  <span>•</span>
                                  <span className="text-sky-400">+{promo.rewardXp} XP</span>
                                </div>
                                <div className="text-[10px] text-zinc-500 mt-0.5">
                                  الاستخدام: <strong className="text-zinc-300">{promo.usedCount || 0}</strong> من{' '}
                                  <strong className="text-zinc-300">{promo.maxUses}</strong> عضو
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto">
                              <button
                                onClick={() => handleTogglePromo(promo)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer transition ${
                                  promo.active && !isExhausted
                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                                    : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                                }`}
                              >
                                {isExhausted ? 'مكتمل العدد' : promo.active ? 'نشط (إيقاف)' : 'متوقف (تفعيل)'}
                              </button>
                              <button
                                onClick={() => handleDeletePromo(promo.id)}
                                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-rose-500/15 text-zinc-400 hover:text-rose-400 border border-zinc-800 cursor-pointer transition"
                                title="حذف الكود"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Mass Grant Card */}
                <div className="bg-[#121215] border border-zinc-800/80 rounded-2xl p-5 space-y-4 h-fit">
                  <div className="border-b border-zinc-800/80 pb-3">
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <Gift size={16} className="text-[#FF1744]" />
                      <span>إهداء جماعي فوري</span>
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      منح كوينز أو نقاط خبرة لجميع الأعضاء أو شريحة محددة بضغطة واحدة مع إشعار عام
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] text-zinc-400 font-bold mb-1">الشريحة المستهدفة</label>
                      <select
                        value={massGrantSegment}
                        onChange={e => setMassGrantSegment(e.target.value as any)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none"
                      >
                        <option value="all">جميع أعضاء المنصة ({allUsers.length})</option>
                        <option value="active_30">الأعضاء النشطون (Lvl 3 فأعلى)</option>
                        <option value="elite">نخبة المنصة (Lvl 15 فأعلى)</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-zinc-400 font-bold mb-1">كوينز لكل عضو</label>
                        <input
                          type="number"
                          min={0}
                          value={massGrantCoins}
                          onChange={e => setMassGrantCoins(Number(e.target.value))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-amber-400 text-center focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-zinc-400 font-bold mb-1">خبرة (XP) لكل عضو</label>
                        <input
                          type="number"
                          min={0}
                          value={massGrantXp}
                          onChange={e => setMassGrantXp(Number(e.target.value))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-sky-400 text-center focus:outline-none"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleMassGrant}
                      disabled={isGrantingMass}
                      className="w-full bg-[#FF1744] hover:bg-rose-600 disabled:opacity-40 text-white font-black py-3 rounded-xl text-xs transition cursor-pointer"
                    >
                      {isGrantingMass ? 'جاري توزيع المكافآت...' : 'إرسال المكافأة الجماعية الآن'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
    </>
  );
};
