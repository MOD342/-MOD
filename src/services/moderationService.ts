import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, query, getDocs, serverTimestamp, addDoc, updateDoc, orderBy } from 'firebase/firestore';
import { OperationType, handleFirestoreError } from '../firebaseUtils';

export type RoleLevel = 'owner' | 'admin' | 'moderator' | 'user';

export const ADMIN_EMAILS = [
  '342.mod@gmail.com',
  'mod.mg.342@gmail.com'
];

export const isStaffEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return ADMIN_EMAILS.some(adminEmail => adminEmail.toLowerCase() === clean);
};

export interface GlobalRole {
  id: string;
  uid: string;
  role: RoleLevel;
  assignedBy?: string;
  assignedAt?: any;
}

export interface ModPermissions {
  canBan: boolean;
  canNotify: boolean;
  canManageSettings: boolean;
  canViewRoles: boolean;
}

export interface AuditLogEntry {
  id?: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
  actionType: string;
  targetLabel: string;
  details: string;
  createdAt?: any;
}

export interface PromoCodeEntry {
  id: string;
  code: string;
  rewardCoins: number;
  rewardXp: number;
  maxUses: number;
  usedCount: number;
  redeemedBy: string[];
  active: boolean;
  createdBy: string;
  createdAt?: any;
}

export type SensitiveModerationAction =
  | 'access_dashboard'
  | 'delete_content'
  | 'edit_comment'
  | 'resolve_report'
  | 'manage_recommendations'
  | 'manage_suggestions'
  | 'edit_member_stats'
  | 'restrict_member'
  | 'ban_user'
  | 'unban_user'
  | 'assign_role'
  | 'manage_mod_permissions'
  | 'manage_promos'
  | 'mass_grant'
  | 'send_broadcast'
  | 'manage_settings'
  | 'manage_cache_queue'
  | 'reset_all_accounts'
  | 'factory_wipe';

export interface ServerVerifiedSession {
  uid: string;
  email: string;
  emailVerified: boolean;
  role: RoleLevel;
  permissions: ModPermissions;
  verifiedVia: string;
  verifiedAt: string;
}

export async function getAdminAuthHeaders(): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('يجب تسجيل الدخول أولاً للتحقق من صلاحيات الإدارة عبر الخادم.');
  }
  const idToken = await currentUser.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  };
}

export const moderationService = {
  /**
   * Verifies the current user's session and role on the backend using Firebase Admin SDK.
   */
  verifyServerAdminSession: async (): Promise<ServerVerifiedSession | null> => {
    if (!auth.currentUser) return null;
    try {
      const headers = await getAdminAuthHeaders();
      const res = await fetch('/api/admin/verify-session', {
        method: 'GET',
        headers,
      });
      if (!res.ok) {
        return null;
      }
      const data = await res.json();
      if (data?.success && data?.session) {
        return data.session as ServerVerifiedSession;
      }
      return null;
    } catch (error) {
      console.warn('[moderationService] Server session verification warning:', error);
      return null;
    }
  },

  /**
   * Enforces a server-side permission check using Firebase Admin SDK before executing any sensitive moderation action.
   * Throws an error if the user is not authorized on the server.
   */
  authorizeServerModerationAction: async (
    action: SensitiveModerationAction,
    targetId?: string,
    metadata?: Record<string, any>
  ): Promise<void> => {
    const headers = await getAdminAuthHeaders();
    const res = await fetch('/api/admin/authorize-action', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action,
        targetId,
        metadata,
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success || !data?.authorized) {
      const errMsg =
        data?.message ||
        'رفض الخادم (Firebase Admin SDK) تنفيذ هذا الإجراء الحساس لعدم كفاية الصلاحيات.';
      throw new Error(errMsg);
    }
  },

  getModPermissions: async (): Promise<ModPermissions> => {
    try {
      const snap = await getDoc(doc(db, 'globalSettings', 'modPermissions'));
      if (snap.exists()) {
        return snap.data() as ModPermissions;
      }
    } catch(error: any) {
      console.warn("[moderationService] Offline/notice for modPermissions:", error?.message || error);
    }
    // Default permissions
    return {
      canBan: false,
      canNotify: false,
      canManageSettings: false,
      canViewRoles: false
    };
  },
  
  updateModPermissions: async (perms: ModPermissions): Promise<void> => {
    if (!auth.currentUser) return;
    await moderationService.authorizeServerModerationAction('manage_mod_permissions', 'modPermissions', perms);
    try {
      await setDoc(doc(db, 'globalSettings', 'modPermissions'), perms);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'globalSettings');
    }
  },

  getGlobalSettings: async (id: string): Promise<any> => {
    try {
      const snap = await getDoc(doc(db, 'globalSettings', id));
      if (snap.exists()) {
        return snap.data();
      }
    } catch(error: any) {
      console.warn(`[moderationService] Offline/notice loading settings '${id}':`, error?.message || error);
    }
    return null;
  },

  updateGlobalSettings: async (id: string, data: any): Promise<void> => {
    if (!auth.currentUser) return;
    await moderationService.authorizeServerModerationAction('manage_settings', id);
    try {
      await setDoc(doc(db, 'globalSettings', id), data, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'globalSettings');
    }
  },

  getAppStats: async (): Promise<any> => {
    try {
       const usersQuery = await getDocs(query(collection(db, 'users')));
       const rolesQuery = await getDocs(query(collection(db, 'globalRoles')));
       const bansQuery = await getDocs(query(collection(db, 'bannedUsers')));
       const reportsQuery = await getDocs(query(collection(db, 'reports')));
       const commentsQuery = await getDocs(query(collection(db, 'comments')));
       
       return {
         totalUsers: usersQuery.size,
         totalRoles: rolesQuery.size,
         totalBans: bansQuery.size,
         totalReports: reportsQuery.size,
         totalComments: commentsQuery.size
       };
    } catch (error: any) {
       console.warn("[moderationService] Could not aggregate real-time app stats (offline fallback active):", error?.message || error);
       return {
         totalUsers: 125,
         totalRoles: 3,
         totalBans: 2,
         totalReports: 0,
         totalComments: 450
       };
    }
  },

  // Check role
  getCurrentUserRole: async (providedUser?: any): Promise<RoleLevel> => {
    const targetUser = providedUser || auth.currentUser;
    if (!targetUser) return 'user';
    
    const email = targetUser.email;
    if (isStaffEmail(email)) {
      const uid = targetUser.uid || targetUser.id;
      if (uid) {
        setDoc(doc(db, 'globalRoles', uid), {
          role: 'owner',
          email: (email || '').trim().toLowerCase(),
          assignedAt: serverTimestamp(),
          assignedBy: 'system_bootstrap'
        }, { merge: true }).catch(() => {});
      }
      return 'owner';
    }
    
    try {
      const uid = targetUser.uid || targetUser.id;
      if (uid) {
        const snap = await getDoc(doc(db, 'globalRoles', uid));
        if (snap.exists()) {
          return snap.data().role as RoleLevel;
        }
      }
    } catch(error: any) {
      console.warn("[moderationService] Offline/notice for globalRoles:", error?.message || error);
    }
    return 'user';
  },

  getAllRoles: async (): Promise<GlobalRole[]> => {
    try {
      const q = query(collection(db, 'globalRoles'));
      const snap = await getDocs(q);
      const roles: GlobalRole[] = [];
      snap.forEach(doc => {
        roles.push({ ...doc.data(), id: doc.id, uid: doc.id } as GlobalRole);
      });
      return roles;
    } catch(error) {
       handleFirestoreError(error, OperationType.GET, 'globalRoles');
       return [];
    }
  },

  reportContent: async (
    contentId: string,
    contentType: 'comment' | 'recommendation' | 'arena_post' | 'leak',
    reason: string,
    extra?: {
      contentText?: string;
      authorId?: string;
      authorName?: string;
      animeId?: string;
      animeTitle?: string;
    }
  ): Promise<void> => {
    if (!auth.currentUser) return;
    try {
      await addDoc(collection(db, 'reports'), {
        contentId,
        contentType,
        reason,
        reporterId: auth.currentUser.uid,
        contentText: extra?.contentText || '',
        authorId: extra?.authorId || '',
        authorName: extra?.authorName || '',
        animeId: extra?.animeId || '',
        animeTitle: extra?.animeTitle || '',
        createdAt: serverTimestamp(),
        status: 'pending'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'reports');
    }
  },

  getReports: async (): Promise<any[]> => {
    try {
      const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const items: any[] = [];
      snap.forEach(d => {
        items.push({ id: d.id, ...d.data() });
      });
      return items;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'reports');
      return [];
    }
  },

  resolveReport: async (
    reportId: string,
    resolution: 'deleted_content' | 'dismissed',
    contentType?: 'comment' | 'recommendation' | 'arena_post' | 'leak',
    contentId?: string
  ): Promise<void> => {
    await moderationService.authorizeServerModerationAction('resolve_report', reportId, {
      resolution,
      contentType,
      contentId,
    });
    try {
      await updateDoc(doc(db, 'reports', reportId), {
        status: 'resolved',
        resolution,
        resolvedAt: serverTimestamp(),
        resolvedBy: auth.currentUser?.uid
      });

      if (resolution === 'deleted_content' && contentType && contentId) {
        if (contentType === 'comment') {
          await deleteDoc(doc(db, 'comments', contentId));
        } else if (contentType === 'recommendation') {
          await deleteDoc(doc(db, 'recommendations', contentId));
        } else if (contentType === 'arena_post') {
          await deleteDoc(doc(db, 'arenaFeed', contentId));
        } else if (contentType === 'leak') {
          await deleteDoc(doc(db, 'otakuLeaks', contentId));
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'reports');
    }
  },
  
  assignRole: async (id: string, role: RoleLevel): Promise<void> => {
    if (!auth.currentUser) throw new Error('Not auth');
    await moderationService.authorizeServerModerationAction('assign_role', id, { targetRole: role });
    try {
      if (role === 'user') {
         await deleteDoc(doc(db, 'globalRoles', id));
      } else {
         await setDoc(doc(db, 'globalRoles', id), {
           role,
           assignedBy: auth.currentUser.uid,
           assignedAt: serverTimestamp()
         });
      }
    } catch(error) {
      handleFirestoreError(error, OperationType.WRITE, 'globalRoles');
    }
  },

  banUser: async (id: string, reason: string): Promise<void> => {
    if (!auth.currentUser) return;
    await moderationService.authorizeServerModerationAction('ban_user', id, { reason });
    try {
      await setDoc(doc(db, 'bannedUsers', id), {
        reason,
        bannedBy: auth.currentUser.uid,
        bannedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'bannedUsers');
    }
  },
  
  unbanUser: async (id: string): Promise<void> => {
    await moderationService.authorizeServerModerationAction('unban_user', id);
    try {
      await deleteDoc(doc(db, 'bannedUsers', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'bannedUsers');
    }
  },

  getBannedUsers: async (): Promise<any[]> => {
    try {
      const q = query(collection(db, 'bannedUsers'));
      const snap = await getDocs(q);
      const bans: any[] = [];
      snap.forEach(doc => {
        bans.push({ ...doc.data(), id: doc.id, uid: doc.id });
      });
      return bans;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'bannedUsers');
      return [];
    }
  },

  getAllUsers: async (): Promise<any[]> => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      const items: any[] = [];
      snap.forEach(doc => {
        items.push({ ...doc.data(), id: doc.id, uid: doc.id });
      });
      return items;
    } catch (error) {
       console.error("Failed to fetch all users", error);
       return [];
    }
  },

  updateUserCoinsAndXP: async (id: string, coins: number, xp: number, level: number): Promise<void> => {
    await moderationService.authorizeServerModerationAction('edit_member_stats', id, { coins, xp, level });
    try {
      await updateDoc(doc(db, 'users', id), {
        coins: Number(coins),
        xp: Number(xp),
        level: Number(level)
      });
    } catch (error) {
      console.error("Failed to update user stats", error);
      throw error;
    }
  },

  restrictMember: async (id: string, restrictions: { isMuted: boolean; isGamesRestricted?: boolean; isCoinsRestricted?: boolean }): Promise<void> => {
    await moderationService.authorizeServerModerationAction('restrict_member', id, restrictions);
    try {
      const patch: Record<string, boolean> = {
        isMuted: Boolean(restrictions.isMuted),
      };
      if (restrictions.isGamesRestricted !== undefined) {
        patch.isGamesRestricted = Boolean(restrictions.isGamesRestricted);
      }
      if (restrictions.isCoinsRestricted !== undefined) {
        patch.isCoinsRestricted = Boolean(restrictions.isCoinsRestricted);
      }
      await updateDoc(doc(db, 'users', id), patch);
    } catch (error) {
      console.error("Failed to restrict member in Firestore", error);
      throw error;
    }
  },

  deleteComment: async (commentId: string): Promise<void> => {
    await moderationService.authorizeServerModerationAction('delete_content', commentId);
    try {
      await deleteDoc(doc(db, 'comments', commentId));
    } catch(error) {
      handleFirestoreError(error, OperationType.DELETE, 'comments');
    }
  },

  deleteRecommendation: async (recId: string): Promise<void> => {
    await moderationService.authorizeServerModerationAction('manage_recommendations', recId);
    try {
      await deleteDoc(doc(db, 'recommendations', recId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'recommendations');
    }
  },

  resetAllAccounts: async (): Promise<void> => {
    if (!auth.currentUser) throw new Error('Not authenticated');
    await moderationService.authorizeServerModerationAction('reset_all_accounts');
    
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      
      const promises = usersSnap.docs.map(async (userDoc) => {
        const id = userDoc.id;
        
        const entriesSnap = await getDocs(collection(db, 'users', id, 'animeEntries'));
        const deletePromises = entriesSnap.docs.map(d => 
          deleteDoc(doc(db, 'users', id, 'animeEntries', d.id))
        );
        await Promise.all(deletePromises);
        
        await updateDoc(doc(db, 'users', id), {
          xp: 0,
          level: 1,
          coins: 0,
          completedAnimeCount: 0,
          totalEpisodesWatched: 0,
          purchasedItems: [],
          listCount: 0,
          unlockedRewards: [],
          hasClaimedCorrectionBadge: false
        });
      });
      
      await Promise.all(promises);
    } catch (error) {
       console.error("Error resetting all accounts:", error);
       throw error;
    }
  },

  factoryWipeForLaunch: async (): Promise<{ deletedDocs: number; deletedUsers: number }> => {
    if (!auth.currentUser) throw new Error('Not authenticated');
    await moderationService.authorizeServerModerationAction('factory_wipe');
    let deletedDocs = 0;
    let deletedUsers = 0;

    // 1. Delete all users and their nested subcollections (animeEntries, customLists, tierList, notifications)
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;
        const subCols = ['animeEntries', 'customLists', 'tierList', 'notifications'];
        for (const sub of subCols) {
          try {
            const subSnap = await getDocs(collection(db, 'users', uid, sub));
            if (!subSnap.empty) {
              await Promise.all(
                subSnap.docs.map(async (d) => {
                  await deleteDoc(doc(db, 'users', uid, sub, d.id)).catch(() => {});
                  deletedDocs++;
                })
              );
            }
          } catch {}
        }
        await deleteDoc(doc(db, 'users', uid)).catch(() => {});
        deletedUsers++;
        deletedDocs++;
      }
    } catch (err) {
      console.warn('[factoryWipeForLaunch] Users cleanup warning:', err);
    }

    // 2. Delete all top-level collections (accounts, content, caches, settings, roles, logs, etc.)
    const topCollections = [
      'usernames',
      'globalRoles',
      'bannedUsers',
      'reports',
      'comments',
      'recommendations',
      'ratings',
      'suggestions',
      'globalNotifications',
      'otakuLeaks',
      'arenaFeed',
      'battleRooms',
      'arenaBelt',
      'gameQuestions',
      'animeTrivia',
      'promoCodes',
      'server_cache',
      'globalSettings',
      'auditLogs'
    ];

    for (const colName of topCollections) {
      try {
        const snap = await getDocs(collection(db, colName));
        if (!snap.empty) {
          await Promise.all(
            snap.docs.map(async (d) => {
              await deleteDoc(doc(db, colName, d.id)).catch(() => {});
              deletedDocs++;
            })
          );
        }
      } catch (err) {
        console.warn(`[factoryWipeForLaunch] Collection ${colName} cleanup warning:`, err);
      }
    }

    // 3. Re-register current staff owner role so the admin doesn't lose access
    if (auth.currentUser && isStaffEmail(auth.currentUser.email)) {
      try {
        await setDoc(doc(db, 'globalRoles', auth.currentUser.uid), {
          role: 'owner',
          email: (auth.currentUser.email || '').trim().toLowerCase(),
          assignedAt: serverTimestamp(),
          assignedBy: 'launch_clean_slate'
        });
      } catch {}
    }

    return { deletedDocs, deletedUsers };
  },

  logAuditAction: async (params: {
    actionType: string;
    targetLabel: string;
    details: string;
    actorName?: string;
    actorRole?: string;
  }): Promise<void> => {
    if (!auth.currentUser) return;
    try {
      await addDoc(collection(db, 'auditLogs'), {
        actorUid: auth.currentUser.uid,
        actorName: params.actorName || auth.currentUser.displayName || auth.currentUser.email || 'مشرف',
        actorRole: params.actorRole || 'staff',
        actionType: params.actionType,
        targetLabel: params.targetLabel,
        details: params.details,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.warn('[moderationService] Failed to write audit log:', error);
    }
  },

  createPromoCode: async (params: {
    code: string;
    rewardCoins: number;
    rewardXp: number;
    maxUses: number;
  }): Promise<void> => {
    if (!auth.currentUser) throw new Error('Not authenticated');
    const cleanCode = params.code.trim().toUpperCase().replace(/\s+/g, '');
    if (!cleanCode) throw new Error('Invalid code');
    await moderationService.authorizeServerModerationAction('manage_promos', cleanCode, params);
    await setDoc(doc(db, 'promoCodes', cleanCode), {
      code: cleanCode,
      rewardCoins: Math.max(0, Number(params.rewardCoins) || 0),
      rewardXp: Math.max(0, Number(params.rewardXp) || 0),
      maxUses: Math.max(1, Number(params.maxUses) || 50),
      usedCount: 0,
      redeemedBy: [],
      active: true,
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp()
    });
  },

  togglePromoCode: async (codeId: string, active: boolean): Promise<void> => {
    await moderationService.authorizeServerModerationAction('manage_promos', codeId, { active });
    await updateDoc(doc(db, 'promoCodes', codeId), { active });
  },

  deletePromoCode: async (codeId: string): Promise<void> => {
    await moderationService.authorizeServerModerationAction('manage_promos', codeId);
    await deleteDoc(doc(db, 'promoCodes', codeId));
  },

  redeemPromoCode: async (
    userId: string,
    code: string
  ): Promise<{ rewardCoins: number; rewardXp: number }> => {
    const cleanCode = code.trim().toUpperCase().replace(/\s+/g, '');
    if (!cleanCode) throw new Error('يرجى إدخال كود صحيح');

    const promoRef = doc(db, 'promoCodes', cleanCode);
    const promoSnap = await getDoc(promoRef);
    if (!promoSnap.exists()) {
      throw new Error('الكود غير موجود أو غير صالح.');
    }

    const promoData = promoSnap.data() as PromoCodeEntry;
    if (!promoData.active) {
      throw new Error('تم إيقاف هذا الكود الترويجي من قبل الإدارة.');
    }

    const usedCount = Number(promoData.usedCount || 0);
    const maxUses = Number(promoData.maxUses || 1);
    if (usedCount >= maxUses) {
      throw new Error('انتهت جميع مرات استخدام هذا الكود.');
    }

    const redeemedBy = Array.isArray(promoData.redeemedBy) ? promoData.redeemedBy : [];
    if (redeemedBy.includes(userId)) {
      throw new Error('لقد قمت باسترداد هذا الكود مسبقاً!');
    }

    const rewardCoins = Math.max(0, Number(promoData.rewardCoins || 0));
    const rewardXp = Math.max(0, Number(promoData.rewardXp || 0));

    await updateDoc(promoRef, {
      usedCount: usedCount + 1,
      redeemedBy: [...redeemedBy, userId]
    });

    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const uData = userSnap.data();
      await updateDoc(userRef, {
        coins: Number(uData.coins || 0) + rewardCoins,
        xp: Number(uData.xp || 0) + rewardXp
      });
    }

    return { rewardCoins, rewardXp };
  },

  massGrantReward: async (params: {
    coins: number;
    xp: number;
    segment: 'all' | 'active_30' | 'elite';
  }): Promise<number> => {
    if (!auth.currentUser) throw new Error('Not authenticated');
    await moderationService.authorizeServerModerationAction('mass_grant', params.segment, params);
    const usersSnap = await getDocs(collection(db, 'users'));
    let count = 0;
    const addCoins = Math.max(0, Number(params.coins) || 0);
    const addXp = Math.max(0, Number(params.xp) || 0);
    if (addCoins === 0 && addXp === 0) return 0;

    const tasks = usersSnap.docs.map(async uDoc => {
      const d = uDoc.data();
      if (params.segment === 'elite' && Number(d.level || 1) < 15) return;
      if (params.segment === 'active_30' && Number(d.level || 1) < 3) return;
      const curCoins = Number(d.coins || 0);
      const curXp = Number(d.xp || 0);
      await updateDoc(doc(db, 'users', uDoc.id), {
        coins: curCoins + addCoins,
        xp: curXp + addXp
      });
      count++;
    });

    await Promise.all(tasks);
    return count;
  }
};

