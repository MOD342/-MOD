import { db } from '../firebase';
import { collection, addDoc, getDocs, query, where, orderBy, limit, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../firebaseUtils';

export interface Comment {
  id?: string;
  animeId: string;
  userId: string;
  userDisplayName: string;
  text: string;
  likes: number;
  dislikes: number;
  userPhotoUrl?: string;
  parentCommentId?: string;
  isSpoiler?: boolean;
  createdAt?: any;
  equippedAvatar?: string | null;
  equippedFrame?: string | null;
  equippedTitle?: string | null;
  equippedBadge?: string | null;
}

export interface Recommendation {
  id?: string;
  animeId: string;
  animeTitle?: string;
  animePosterUrl?: string;
  targetAnimeId: string;
  targetAnimeTitle: string;
  targetAnimePosterUrl?: string;
  reason: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  likes?: number;
  dislikes?: number;
  createdAt?: any;
}

export const getComments = async (animeId: string, maxComments = 120): Promise<Comment[]> => {
  const q = query(
    collection(db, 'comments'),
    where('animeId', '==', animeId),
    orderBy('createdAt', 'desc'),
    limit(maxComments)
  );
  try {
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'comments');
    return [];
  }
};

export const addComment = async (comment: Omit<Comment, 'id' | 'createdAt'>) => {
  try {
    const docRef = await addDoc(collection(db, 'comments'), {
      ...comment,
      createdAt: serverTimestamp()
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'comments');
    throw error;
  }
};

export const updateCommentInteraction = async (commentId: string, data: Partial<Comment>) => {
  try {
    const ref = doc(db, 'comments', commentId);
    await updateDoc(ref, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `comments/${commentId}`);
  }
};

const normalizeRecKey = (title?: string | null): string =>
  String(title || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const getApprovedRecommendations = async (animeId: string): Promise<Recommendation[]> => {
  try {
    const q1 = query(
      collection(db, 'recommendations'),
      where('animeId', '==', animeId),
      where('status', '==', 'approved'),
      limit(25)
    );
    const q2 = query(
      collection(db, 'recommendations'),
      where('targetAnimeId', '==', animeId),
      where('status', '==', 'approved'),
      limit(25)
    );
    
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    
    const map = new Map<string, Recommendation>();
    
    snap1.docs.forEach(docSnap => {
      map.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as Recommendation);
    });
    
    snap2.docs.forEach(docSnap => {
      map.set(docSnap.id, { id: docSnap.id, ...docSnap.data() } as Recommendation);
    });
    
    const sorted = Array.from(map.values()).sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return bTime - aTime;
    });

    // Deduplicate recommendations pointing to the same anime (ignoring older duplicates)
    const seenTargets = new Set<string>();
    const seenTitles = new Set<string>();
    const recs: Recommendation[] = [];
    for (const r of sorted) {
      const isSource = String(r.animeId) === String(animeId);
      const otherId = String(isSource ? r.targetAnimeId : r.animeId).trim();
      const otherTitleNorm = normalizeRecKey(isSource ? r.targetAnimeTitle : r.animeTitle);
      if ((otherId && seenTargets.has(otherId)) || (otherTitleNorm && seenTitles.has(otherTitleNorm))) {
        continue;
      }
      if (otherId) seenTargets.add(otherId);
      if (otherTitleNorm) seenTitles.add(otherTitleNorm);
      recs.push(r);
    }

    // Resolve any missing animeTitle or posterUrls cleanly (capped to first 6 items to avoid burst load)
    const missingItems = recs
      .filter((r) => ((!r.animeTitle || r.animeTitle === 'أنمي' || !r.animePosterUrl) && r.animeId) || (!r.targetAnimePosterUrl && r.targetAnimeId))
      .slice(0, 6);

    await Promise.all(
      missingItems.map(async (r) => {
        if ((!r.animeTitle || r.animeTitle === 'أنمي' || !r.animePosterUrl) && r.animeId) {
          try {
            const res = await fetch(`/api/anime/details/${encodeURIComponent(String(r.animeId))}`, { signal: AbortSignal.timeout(4000) });
            const json = await res.json();
            const d = json?.data || json;
            if (d) {
              if (!r.animeTitle || r.animeTitle === 'أنمي') r.animeTitle = d.title || r.animeId;
              if (!r.animePosterUrl) r.animePosterUrl = d.posterUrl || '';
            }
          } catch {}
        }
        if (!r.targetAnimePosterUrl && r.targetAnimeId) {
          try {
            const res = await fetch(`/api/anime/details/${encodeURIComponent(String(r.targetAnimeId))}`, { signal: AbortSignal.timeout(4000) });
            const json = await res.json();
            const d = json?.data || json;
            if (d && d.posterUrl) {
              r.targetAnimePosterUrl = d.posterUrl;
            }
          } catch {}
        }
      })
    );

    return recs;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'recommendations');
    return [];
  }
};

export const addRecommendation = async (
  rec: Omit<Recommendation, 'id' | 'createdAt' | 'status'>
): Promise<{ added: boolean; duplicate?: boolean }> => {
  try {
    const srcId = String(rec.animeId || '').trim();
    const tgtId = String(rec.targetAnimeId || '').trim();
    const tgtTitleNorm = normalizeRecKey(rec.targetAnimeTitle);
    if (!srcId || !tgtId || srcId === tgtId) {
      return { added: false, duplicate: true };
    }

    // Ignore any recommendation that already exists (pending or approved) in either direction
    try {
      const qFromSource = query(collection(db, 'recommendations'), where('animeId', '==', srcId), limit(60));
      const qToSource = query(collection(db, 'recommendations'), where('targetAnimeId', '==', srcId), limit(60));
      const [snapFrom, snapTo] = await Promise.all([getDocs(qFromSource), getDocs(qToSource)]);

      const duplicateExists = [...snapFrom.docs, ...snapTo.docs].some((d) => {
        const data = d.data() || {};
        const st = String(data.status || 'approved');
        if (st === 'rejected') return false;
        const dAnimeId = String(data.animeId || '').trim();
        const dTargetId = String(data.targetAnimeId || '').trim();
        if (
          (dAnimeId === srcId && dTargetId === tgtId) ||
          (dAnimeId === tgtId && dTargetId === srcId)
        ) {
          return true;
        }
        if (tgtTitleNorm) {
          const otherTitle = dAnimeId === srcId ? data.targetAnimeTitle : data.animeTitle;
          if (normalizeRecKey(otherTitle) === tgtTitleNorm) return true;
        }
        return false;
      });

      if (duplicateExists) {
        return { added: false, duplicate: true };
      }
    } catch {
      // Proceed gracefully if duplicate pre-check query is temporarily unavailable
    }

    const cleanRec: any = {
      animeId: srcId,
      targetAnimeId: tgtId,
      targetAnimeTitle: String(rec.targetAnimeTitle),
      reason: String(rec.reason),
      userId: String(rec.userId),
    };

    if (rec.animeTitle !== undefined && rec.animeTitle !== null) {
      cleanRec.animeTitle = String(rec.animeTitle);
    }
    if (rec.animePosterUrl !== undefined && rec.animePosterUrl !== null) {
      cleanRec.animePosterUrl = String(rec.animePosterUrl);
    }
    if (rec.targetAnimePosterUrl !== undefined && rec.targetAnimePosterUrl !== null) {
      cleanRec.targetAnimePosterUrl = String(rec.targetAnimePosterUrl);
    }

    await addDoc(collection(db, 'recommendations'), {
      ...cleanRec,
      status: 'pending',
      likes: 0,
      dislikes: 0,
      createdAt: serverTimestamp()
    });
    const { incrementInteraction } = await import('./gamificationService');
    await incrementInteraction(rec.userId, 'recommendation');
    return { added: true };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'recommendations');
    throw error;
  }
};

export const updateRecommendationInteraction = async (recId: string, data: Partial<Recommendation>) => {
  try {
    const ref = doc(db, 'recommendations', recId);
    await updateDoc(ref, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `recommendations/${recId}`);
  }
};
