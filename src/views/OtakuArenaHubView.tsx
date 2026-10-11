import React, { useState, useEffect, useMemo } from 'react';
import {
  Swords,
  Trophy,
  Flame,
  Crown,
  Users,
  Plus,
  Play,
  Shield,
  Zap,
  Coins,
  Clock,
  ChevronRight,
  Send,
  Sparkles,
  CheckCircle2,
  Heart,
  Copy,
  Check,
  UserPlus,
  Layers,
  Target,
  Gift,
  Lock,
  BookOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  increment,
  getDocs,
  arrayUnion
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { awardXP } from '../services/gamificationService';
import { notificationsService } from '../services/notificationsService';
import {
  getActiveNonOverlappingEvent,
  getCombatRankInfo,
  ARENA_QUESTION_POOL,
  ANIME_FIGHTER_DECK,
  SEASONAL_FACTIONS,
  BattleModeId,
  getDailyArenaStamina,
  consumeArenaStamina,
  MAX_DAILY_ARENA_STAMINA,
  isRewardClaimedLock,
  setRewardClaimedLock,
  getNonRepeatingQuestions,
  getPreviousEndedEventVault,
  getAnimeSvgFallback
} from '../services/arenaCalendarEngine';
import VisualAnimeGamesSpace, {
  VISUAL_ANIME_GAMES,
  VisualGameId,
  ANIME_WORLD_BACKGROUNDS,
  STORY_CAMPAIGN_CHAPTERS,
  StoryChapterMeta,
  computeAnimeLibrarySynergy
} from '../components/VisualAnimeGamesSpace';
import ThreeAnimeParallaxScene from '../components/ThreeAnimeParallaxScene';
import ThreeHeaderTrophyEmblem from '../components/ThreeHeaderTrophyEmblem';

export type ArenaTab = 'games' | 'tournaments' | 'arena' | 'leaderboard';

interface OtakuArenaHubViewProps {
  initialTab?: ArenaTab;
  initialRoomCode?: string;
  initialChallengeUser?: { id: string; displayName?: string; username?: string };
  onBack: () => void;
  onUserClick?: (userId: string) => void;
  onNavigate?: (view: string, props?: any) => void;
}

interface RoomPlayer {
  id: string;
  name: string;
  avatar: string;
  hp: number;
  score: number;
  combo: number;
  isBot?: boolean;
  lastAnsweredRound?: number;
}

interface BattleRoomDoc {
  id: string;
  code: string;
  hostId: string;
  hostName: string;
  mode: BattleModeId;
  maxPlayers: number;
  stake: number;
  status: 'waiting' | 'playing' | 'finished';
  round: number;
  players: RoomPlayer[];
  questionIds: string[];
  winnerId?: string;
  winnerName?: string;
  lastActionLog?: string;
  escrowDeducted?: boolean;
  createdAtMs?: number;
  createdAt?: any;
  updatedAt?: any;
}

const AI_BOT_FIGHTERS = [
  { id: 'bot-zoro', name: 'زورو السياف 🤖', avatar: 'https://cdn.myanimelist.net/images/characters/3/100534.jpg' },
  { id: 'bot-gojo', name: 'ساتورو غوجو 🤖', avatar: 'https://cdn.myanimelist.net/images/characters/15/422168.jpg' },
  { id: 'bot-levi', name: 'القائد ليفاي 🤖', avatar: 'https://cdn.myanimelist.net/images/characters/2/241413.jpg' }
];

const MODE_LABELS: Record<BattleModeId, { name: string; badge: string }> = {
  wrestling: {
    name: 'حلبة المصارعة الملكية',
    badge: 'قتال HP 🥊'
  },
  cards: {
    name: 'حرب البطاقات التكتيكية',
    badge: 'هولوغرام 🃏'
  },
  hawk_eye: {
    name: 'رادار الشارينغان',
    badge: 'بصري 👁️'
  },
  higher_lower: {
    name: 'ميزان القوة الخارقة',
    badge: 'سرعة ⚡'
  }
};

const BRACKET_CONTENDERS = [
  { id: 'c1', name: 'لوفي Gear 5', anime: 'One Piece', image: 'https://cdn.myanimelist.net/images/characters/9/310307.jpg', baseVotes: 412 },
  { id: 'c2', name: 'ساتورو غوجو', anime: 'Jujutsu Kaisen', image: 'https://cdn.myanimelist.net/images/characters/15/422168.jpg', baseVotes: 398 },
  { id: 'c3', name: 'ليفاي أكرمان', anime: 'Attack on Titan', image: 'https://cdn.myanimelist.net/images/characters/2/241413.jpg', baseVotes: 375 },
  { id: 'c4', name: 'سونغ جين وو', anime: 'Solo Leveling', image: 'https://cdn.myanimelist.net/images/anime/1097/140263l.jpg', baseVotes: 364 },
  { id: 'c5', name: 'رورونوا زورو', anime: 'One Piece', image: 'https://cdn.myanimelist.net/images/characters/3/100534.jpg', baseVotes: 355 },
  { id: 'c6', name: 'إيتاتشي أوتشيها', anime: 'Naruto Shippuden', image: 'https://cdn.myanimelist.net/images/characters/9/284122.jpg', baseVotes: 349 },
  { id: 'c7', name: 'إيرين ييغر', anime: 'Attack on Titan', image: 'https://cdn.myanimelist.net/images/characters/10/216895.jpg', baseVotes: 332 },
  { id: 'c8', name: 'ناروتو Baryon', anime: 'Naruto Shippuden', image: 'https://cdn.myanimelist.net/images/characters/2/284121.jpg', baseVotes: 340 }
];

export default function OtakuArenaHubView({
  initialTab = 'games',
  initialRoomCode,
  initialChallengeUser,
  onBack,
  onUserClick,
  onNavigate
}: OtakuArenaHubViewProps) {
  const { user, userData, signIn } = useAuth();
  const [activeTab, setActiveTab] = useState<ArenaTab>(initialTab);
  const librarySynergy = useMemo(() => computeAnimeLibrarySynergy(userData), [userData]);

  // محرك التقويم الذكي غير المتداخل + صندوق تتويج البطولة السابقة
  const activeEvent = useMemo(() => getActiveNonOverlappingEvent(), []);
  const endedVault = useMemo(() => getPreviousEndedEventVault(), []);
  const [vaultClaimed, setVaultClaimed] = useState(() => isRewardClaimedLock(endedVault.id));
  const [countdownStr, setCountdownStr] = useState('');

  // طاقة الحلبة اليومية (منع التجميع اللانهائي وتضخم الكوينز)
  const [stamina, setStamina] = useState(() => getDailyArenaStamina(user?.id));
  useEffect(() => {
    setStamina(getDailyArenaStamina(user?.id));
  }, [user?.id]);

  // تشغيل الفضاء البصري الكامل للعبة المختارة + طور القصة + التحدي المسجّل (Ghost Duel)
  const [activeVisualGame, setActiveVisualGame] = useState<VisualGameId | null>(null);
  const [activeStoryChapter, setActiveStoryChapter] = useState<StoryChapterMeta | null>(null);
  const [ghostDuelTarget, setGhostDuelTarget] = useState<{
    id: string;
    name: string;
    targetScoreToBeat?: number;
    stake?: number;
    postId?: string;
  } | null>(null);

  // حفظ تقدم طور القصة وأعلى النقاط المستقلة لكل لعبة
  const [completedChapters, setCompletedChapters] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('otaku_story_chapters_done') || '[]');
    } catch {
      return [];
    }
  });

  const [myGameHighScores, setMyGameHighScores] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('otaku_game_high_scores') || '{}');
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (userData?.unlockedRewards && Array.isArray(userData.unlockedRewards)) {
      const storyIds = userData.unlockedRewards.filter((r: string) => r.startsWith('ch_'));
      if (storyIds.length > 0) {
        setCompletedChapters((prev) => Array.from(new Set([...prev, ...storyIds])));
      }
    }
    if (userData?.dailyStats?.gameHighScores) {
      setMyGameHighScores((prev) => ({
        ...prev,
        ...userData.dailyStats.gameHighScores
      }));
    }
  }, [userData?.unlockedRewards, userData?.dailyStats]);

  const [selectedLeaderGameId, setSelectedLeaderGameId] = useState<'all' | VisualGameId>('all');

  // بيانات الحلبة والغرف الحية (2-4 لاعبين)
  const [openRooms, setOpenRooms] = useState<BattleRoomDoc[]>([]);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(initialRoomCode || null);
  const [currentRoom, setCurrentRoom] = useState<BattleRoomDoc | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  // إعدادات إنشاء غرفة جديدة
  const [selectedMode, setSelectedMode] = useState<BattleModeId>(activeEvent.recommendedMode);
  const [selectedMaxPlayers, setSelectedMaxPlayers] = useState<number>(4);
  const [selectedStake, setSelectedStake] = useState<number>(50);
  const [creatingRoom, setCreatingRoom] = useState(false);

  // مؤثرات القتال البصرية داخل الحلبة
  const [blurLevel, setBlurLevel] = useState(14);
  const [roundTimer, setRoundTimer] = useState(12);
  const [screenShake, setScreenShake] = useState(false);
  const [attackBeamVisual, setAttackBeamVisual] = useState<{ text: string; color: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [hubBurstTrigger, setHubBurstTrigger] = useState(1);
  const [hubBurstMode, setHubBurstMode] = useState<'idle' | 'challenge' | 'victory' | 'ultimate'>('idle');

  const triggerHubParticles = (mode: 'challenge' | 'victory' | 'ultimate') => {
    setHubBurstMode(mode);
    setHubBurstTrigger((t) => t + 1);
  };

  // حزام بطل الحلبة (King of the Ring Belt)
  const [beltChampion, setBeltChampion] = useState({
    championId: 'champ-default',
    championName: 'MOD-342',
    championAvatar: 'https://cdn.myanimelist.net/images/characters/15/422168.jpg',
    winStreak: 7,
    title: activeEvent.prizeTitleAr
  });

  // البطولة الإقصائية وتوقع البطل وحرب المعسكرات
  const [pickedChampionId, setPickedChampionId] = useState<string>(() => {
    try {
      return localStorage.getItem(`arena_pick_${activeEvent.id}`) || '';
    } catch {
      return '';
    }
  });
  const [votedMatches, setVotedMatches] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(`arena_votes_${activeEvent.id}`) || '{}');
    } catch {
      return {};
    }
  });
  const [selectedFaction, setSelectedFaction] = useState<string>(() => {
    try {
      return localStorage.getItem('arena_user_faction') || 'pirates';
    } catch {
      return 'pirates';
    }
  });
  const [dailyChallengeDone, setDailyChallengeDone] = useState<boolean>(() => {
    try {
      const todayKey = new Date().toISOString().slice(0, 10);
      return localStorage.getItem(`arena_daily_${todayKey}`) === 'done';
    } catch {
      return false;
    }
  });

  // الساحة التفاعلية (تحديات الشبح المسجّلة + صيحات التحدي + مواجهات التصويت البصرية)
  const [arenaPosts, setArenaPosts] = useState<any[]>([]);
  const [newPostType, setNewPostType] = useState<'challenge' | 'poll'>('challenge');
  const [newPostTitle, setNewPostTitle] = useState('');
  const [pollOptA, setPollOptA] = useState('');
  const [pollOptB, setPollOptB] = useState('');
  const [votedPolls, setVotedPolls] = useState<Record<string, 'A' | 'B'>>({});

  // لوحة المتصدرين والأعضاء
  const [leaders, setLeaders] = useState<any[]>([]);
  const [leaderFilter, setLeaderFilter] = useState<'event' | 'xp' | 'coins'>('event');
  const [challengingUserId, setChallengingUserId] = useState<string | null>(null);

  const userCoins = userData?.coins || 0;
  const userXp = userData?.xp || 0;
  const userWins = userData?.aiGamesPoints || 0;
  const combatRank = useMemo(() => getCombatRankInfo(userXp, userWins), [userXp, userWins]);

  const showNotice = (msg: string) => {
    triggerHubParticles('challenge');
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // مؤقت العد التنازلي للحدث النشط غير المتداخل
  useEffect(() => {
    const updateTimer = () => {
      const diff = Math.max(0, activeEvent.endsAtMs - Date.now());
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const mins = Math.floor((diff / (1000 * 60)) % 60);
      setCountdownStr(`${days}ي : ${hours}س : ${mins}د`);
    };
    updateTimer();
    const timer = setInterval(updateTimer, 30000);
    return () => clearInterval(timer);
  }, [activeEvent.endsAtMs]);

  // الاستماع للغرف المفتوحة مع فلتر النبض الحي (10 دقائق TTL لمنع تراكم الغرف الميتة)
  useEffect(() => {
    const unsubRooms = onSnapshot(
      query(collection(db, 'battleRooms'), orderBy('createdAt', 'desc'), limit(20)),
      (snap) => {
        const nowMs = Date.now();
        const list: BattleRoomDoc[] = [];
        snap.forEach((d) => {
          const data = d.data() as BattleRoomDoc;
          const createdMs = data.createdAtMs || (data.createdAt?.toMillis ? data.createdAt.toMillis() : nowMs);
          const isFresh = nowMs - createdMs <= 10 * 60 * 1000; // 10 دقائق فقط
          if ((data.status === 'waiting' || data.status === 'playing') && isFresh) {
            list.push({ ...data, id: d.id });
          }
        });
        setOpenRooms(list);
      },
      () => {}
    );

    const unsubBelt = onSnapshot(
      doc(db, 'arenaBelt', 'current'),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setBeltChampion({
            championId: d.championId || 'champ',
            championName: d.championName || 'بطل الحلبة',
            championAvatar: d.championAvatar || 'https://cdn.myanimelist.net/images/characters/15/422168.jpg',
            winStreak: d.winStreak || 1,
            title: d.title || activeEvent.prizeTitleAr
          });
        }
      },
      () => {}
    );

    const unsubFeed = onSnapshot(
      query(collection(db, 'arenaFeed'), orderBy('createdAt', 'desc'), limit(20)),
      (snap) => {
        const list: any[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setArenaPosts(list);
      },
      () => {}
    );

    getDocs(query(collection(db, 'users'), orderBy('xp', 'desc'), limit(25)))
      .then((snap) => {
        const arr: any[] = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        setLeaders(arr);
      })
      .catch(() => {});

    return () => {
      unsubRooms();
      unsubBelt();
      unsubFeed();
    };
  }, [activeEvent.prizeTitleAr]);

  // الاستماع للغرفة المفتوحة حالياً لحظياً
  useEffect(() => {
    if (!currentRoomId) {
      setCurrentRoom(null);
      return;
    }
    const unsub = onSnapshot(
      doc(db, 'battleRooms', currentRoomId),
      (snap) => {
        if (snap.exists()) {
          setCurrentRoom({ ...(snap.data() as BattleRoomDoc), id: snap.id });
        } else {
          setCurrentRoom(null);
          setCurrentRoomId(null);
        }
      },
      () => {}
    );
    return () => unsub();
  }, [currentRoomId]);

  // مؤقت الجولة مع الحسم التلقائي عند انتهاء الوقت (لمنع تجمّد الغرفة إذا خرج لاعب)
  useEffect(() => {
    if (!currentRoom || currentRoom.status !== 'playing') return;
    setBlurLevel(14);
    setRoundTimer(12);

    const interval = setInterval(() => {
      setBlurLevel((prev) => Math.max(0, prev - 2));
      setRoundTimer((prev) => {
        if (prev <= 1) {
          // حسم تلقائي للجولة إذا انتهى المؤقت لمنع أي تجمّد للغرفة
          handleArenaStrike(-1);
          return 12;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentRoom?.status, currentRoom?.round]);

  // ============================================================================
  // تسليم مكافأة انتهاء أي لعبة بصرية أو فصل قصة أو تحدي شبح مسجّل (Ghost Duel)
  // ============================================================================
  const handleVisualGameFinished = async (result: {
    gameId: VisualGameId;
    score: number;
    won: boolean;
    storyChapterId?: string;
    maxCombo?: number;
  }) => {
    // حفظ أعلى نتيجة للعبة محلياً وفي الحساب ولوحة الصدارة المستقلة
    const prevBest = myGameHighScores[result.gameId] || 0;
    const isNewRecord = result.score > prevBest;
    const updatedScores = {
      ...myGameHighScores,
      [result.gameId]: Math.max(prevBest, result.score)
    };
    setMyGameHighScores(updatedScores);
    try {
      localStorage.setItem('otaku_game_high_scores', JSON.stringify(updatedScores));
    } catch {}

    if (!user) return;

    const { remaining, hadStamina } = consumeArenaStamina(user.id);
    setStamina(remaining);

    // تحديث أعلى نتيجة للعبة في وثيقة المستخدم ليظهر في لوحة الصدارة المستقلة لكل لعبة
    if (isNewRecord) {
      try {
        const mergedDailyStats = {
          ...(userData?.dailyStats || {}),
          gameHighScores: updatedScores
        };
        await updateDoc(doc(db, 'users', user.id), {
          dailyStats: mergedDailyStats
        });
      } catch {}
    }

    // إذا كان اللاعب في طور القصة واجتاز الفصل بنجاح!
    if (result.won && result.storyChapterId) {
      const chMeta = STORY_CAMPAIGN_CHAPTERS.find((c) => c.id === result.storyChapterId);
      const isFirstTimeChapter = !completedChapters.includes(result.storyChapterId);
      const nextChapters = Array.from(new Set([...completedChapters, result.storyChapterId]));
      setCompletedChapters(nextChapters);
      try {
        localStorage.setItem('otaku_story_chapters_done', JSON.stringify(nextChapters));
      } catch {}

      if (chMeta) {
        const storyCoins = isFirstTimeChapter
          ? Math.round(chMeta.rewardCoins * librarySynergy.coinMult)
          : Math.round(chMeta.rewardCoins * 0.35);
        const storyXp = isFirstTimeChapter ? chMeta.rewardXp : Math.round(chMeta.rewardXp * 0.4);

        const extraUpdates: Record<string, any> = {
          aiGamesPoints: increment(1),
          unlockedRewards: arrayUnion(chMeta.id)
        };
        if (chMeta.unlockStoreItemId) {
          extraUpdates.purchasedItems = arrayUnion(chMeta.unlockStoreItemId);
        }

        await awardXP(user.id, storyXp, storyCoins, extraUpdates);
        showNotice(
          `👑 اكتمل ${chMeta.titleAr}! ربحت +${storyCoins} كوينز و +${storyXp} XP ${
            chMeta.unlockStoreItemNameAr ? `وتم فتح «${chMeta.unlockStoreItemNameAr}» في حسابك!` : ''
          }`
        );
        return;
      }
    }

    // إذا كان اللاعب يتحدى عضواً آخر (Ghost Duel)، نسجل التحدي في الساحة ونرسل إشعاراً للخصم!
    if (ghostDuelTarget && !ghostDuelTarget.postId) {
      try {
        const postRef = doc(collection(db, 'arenaFeed'));
        await setDoc(postRef, {
          type: 'ghost_duel',
          gameId: result.gameId,
          authorId: user.id,
          authorName: user.displayName || 'مقاتل أوتاكو',
          authorAvatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`,
          targetUserId: ghostDuelTarget.id,
          targetUserName: ghostDuelTarget.name,
          scoreToBeat: Math.max(120, result.score),
          stake: ghostDuelTarget.stake || 50,
          title: `⚔️ سجل ${user.displayName || 'مقاتل'} (${result.score} نقطة) في تحدي مباشر ضد ${ghostDuelTarget.name}! من يكسر هذا الرقم؟`,
          likes: 0,
          createdAt: serverTimestamp()
        });

        await notificationsService.createUserNotification(ghostDuelTarget.id, {
          title: `⚔️ ${user.displayName || 'مقاتل'} سجل ضدك ${result.score} نقطة في الحلبة!`,
          body: `ادخل الآن إلى الساحة واكسر رقمه في لعبة (${
            VISUAL_ANIME_GAMES.find((g) => g.id === result.gameId)?.titleAr || 'الحلبة'
          }) لتنتزع الرهان!`,
          type: 'tournament',
          imageUrl: user.photoURL || undefined,
          linkTo: 'suggestions_hub'
        });
      } catch (e) {
        console.error('Ghost duel record error:', e);
      }
    }

    if (result.won) {
      const coinsEarned = hadStamina
        ? Math.min(220, Math.round((result.score / 7) * activeEvent.rewardMultiplier * librarySynergy.coinMult))
        : 15;
      const xpEarned = hadStamina ? Math.round(95 * activeEvent.rewardMultiplier) : 20;

      await awardXP(user.id, xpEarned, coinsEarned, {
        aiGamesPoints: increment(1)
      });

      showNotice(
        hadStamina
          ? `🏆 انتصار بصري ساحق! ربحت +${coinsEarned} كوينز و +${xpEarned} XP (تآزر مكتبتك ${librarySynergy.coinMult}x)`
          : `🔥 فوز رائع! (انتهت طاقة المكافآت المضاعفة اليومية، حصلت على +15 كوينز)`
      );
    } else {
      await awardXP(user.id, 25, 8);
      showNotice(`⚡ جمعت ${result.score} نقطة وحصلت على +25 XP و +8 كوينز للمشاركة!`);
    }
  };

  const handleEquipStoryFrame = async (frameId: string, frameName: string) => {
    if (!user) {
      signIn();
      return;
    }
    try {
      await updateDoc(doc(db, 'users', user.id), {
        purchasedItems: arrayUnion(frameId),
        equippedFrame: frameId
      });
      showNotice(`✨ تم تجهيز «${frameName}» كإطار لحسابك الشخصي بنجاح!`);
    } catch {
      showNotice('تعذر تجهيز الإطار حالياً، حاول مجدداً.');
    }
  };

  // ============================================================================
  // إنشاء غرفة تحدي حية (2-4 لاعبين) مع فحص الرصيد الحقيقي (Escrow Check)
  // ============================================================================
  const handleCreateRoom = async (inviteTargetUser?: any) => {
    if (!user) {
      signIn();
      return null;
    }
    if (userCoins < selectedStake) {
      showNotice(`رصيدك الحالي (${userCoins} 🪙) لا يكفي لرهان الغرفة (${selectedStake} 🪙)! اختر رهاناً أقل أو العب في الفضاء الحر.`);
      return null;
    }
    if (creatingRoom) return null;
    setCreatingRoom(true);

    try {
      const roomCode = String(Math.floor(1000 + Math.random() * 9000));
      const nonRepeatingQs = getNonRepeatingQuestions(6).map((q) => q.id);

      const hostPlayer: RoomPlayer = {
        id: user.id,
        name: user.displayName || 'مقاتل أوتاكو',
        avatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`,
        hp: 100,
        score: 0,
        combo: 0
      };

      const newRoom: BattleRoomDoc = {
        id: roomCode,
        code: roomCode,
        hostId: user.id,
        hostName: hostPlayer.name,
        mode: selectedMode,
        maxPlayers: selectedMaxPlayers,
        stake: selectedStake,
        status: 'waiting',
        round: 0,
        players: [hostPlayer],
        questionIds: nonRepeatingQs,
        lastActionLog: `أنشأ ${hostPlayer.name} حلبة النزال (#${roomCode})`,
        escrowDeducted: false,
        createdAtMs: Date.now(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'battleRooms', roomCode), newRoom);
      setCurrentRoomId(roomCode);
      setActiveTab('games');

      if (inviteTargetUser && inviteTargetUser.id && inviteTargetUser.id !== user.id) {
        await notificationsService.createUserNotification(inviteTargetUser.id, {
          title: `⚔️ دعوة نزال في الحلبة من ${hostPlayer.name}!`,
          body: `يتحداك في غرفة #${roomCode} (${MODE_LABELS[selectedMode].name}) على جائزة ${selectedStake * selectedMaxPlayers} كوينز!`,
          type: 'tournament',
          imageUrl: hostPlayer.avatar,
          linkTo: `arena_room:${roomCode}`
        });
        showNotice(`تم فتح الحلبة #${roomCode} وإرسال الدعوة إلى ${inviteTargetUser.displayName || inviteTargetUser.username || 'العضو'} ⚔️`);
      } else {
        showNotice(`تم فتح غرفة الحلبة #${roomCode} بنجاح!`);
      }

      return roomCode;
    } catch (e) {
      console.error('Failed to create battle room:', e);
      showNotice('تعذر إنشاء الغرفة حالياً، حاول مجدداً.');
      return null;
    } finally {
      setCreatingRoom(false);
    }
  };

  // الانضمام لغرفة بالكود أو من القائمة الحية
  const handleJoinRoom = async (codeToJoin: string) => {
    if (!user) {
      signIn();
      return;
    }
    const cleanCode = codeToJoin.replace('#', '').trim();
    if (!cleanCode) return;

    try {
      const roomRef = doc(db, 'battleRooms', cleanCode);
      const snap = await getDoc(roomRef);
      if (!snap.exists()) {
        showNotice('هذه الغرفة غير موجودة أو انتهت صلاحيتها.');
        return;
      }

      const data = snap.data() as BattleRoomDoc;
      const alreadyIn = data.players.some((p) => p.id === user.id);

      if (!alreadyIn) {
        if (userCoins < data.stake) {
          showNotice(`تحتاج إلى ${data.stake} كوينز لدخول هذه الغرفة!`);
          return;
        }
        if (data.players.length >= data.maxPlayers) {
          showNotice('هذه الغرفة مكتملة العدد!');
          return;
        }
        const newPlayer: RoomPlayer = {
          id: user.id,
          name: user.displayName || 'مقاتل أوتاكو',
          avatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`,
          hp: 100,
          score: 0,
          combo: 0
        };
        const updatedPlayers = [...data.players, newPlayer];
        await updateDoc(roomRef, {
          players: updatedPlayers,
          lastActionLog: `انضم ${newPlayer.name} إلى الحلبة!`,
          updatedAt: serverTimestamp()
        });
      }

      setCurrentRoomId(cleanCode);
      setActiveTab('games');
      setJoinCodeInput('');
    } catch (e) {
      console.error('Join room error:', e);
    }
  };

  // بدء النزال مع خصم الرهان الحقيقي (Escrow Stake Deduction) وإكمال المقاعد الفارغة
  const handleFillBotsAndStart = async () => {
    if (!currentRoom || !user) return;
    const roomRef = doc(db, 'battleRooms', currentRoom.code);

    // خصم الرهان الفعلي عند بداية النزال لمنع الهروب (Rage-Quit Protection)
    if (!currentRoom.escrowDeducted && currentRoom.stake > 0 && userCoins >= currentRoom.stake) {
      await awardXP(user.id, 0, -currentRoom.stake);
    }

    const updatedPlayers = currentRoom.players.map((p) => ({
      ...p,
      hp: 100,
      score: 0,
      combo: 0,
      lastAnsweredRound: -1
    }));

    let botIdx = 0;
    while (updatedPlayers.length < currentRoom.maxPlayers && botIdx < AI_BOT_FIGHTERS.length) {
      const bot = AI_BOT_FIGHTERS[botIdx++];
      if (!updatedPlayers.some((p) => p.id === bot.id)) {
        updatedPlayers.push({
          id: bot.id,
          name: bot.name,
          avatar: bot.avatar,
          hp: 100,
          score: 0,
          combo: 0,
          isBot: true,
          lastAnsweredRound: -1
        });
      }
    }

    await updateDoc(roomRef, {
      players: updatedPlayers,
      status: 'playing',
      round: 0,
      escrowDeducted: true,
      lastActionLog: '🔔 قرع جرس الحلبة ووُضع الرهان في الخزينة! انطلق النزال!',
      updatedAt: serverTimestamp()
    });
  };

  // تنفيذ ضربة قتالية مرئية في الحلبة
  const handleArenaStrike = async (optionIdx: number) => {
    if (!currentRoom || currentRoom.status !== 'playing' || !user) return;

    const currentQId = currentRoom.questionIds[currentRoom.round % currentRoom.questionIds.length];
    const currentQ = ARENA_QUESTION_POOL.find((q) => q.id === currentQId) || ARENA_QUESTION_POOL[0];
    const isCorrect = optionIdx === currentQ.correctIndex;

    const myPlayer = currentRoom.players.find((p) => p.id === user.id);
    if (optionIdx !== -1 && myPlayer && myPlayer.lastAnsweredRound === currentRoom.round) {
      return;
    }

    let actionLog = '';
    const baseDamage = activeEvent.rewardMultiplier >= 3 ? 35 : 28;

    if (isCorrect) {
      setAttackBeamVisual({ text: `⚡ ضربة قاضية -${baseDamage} HP!`, color: '#FF1744' });
      setScreenShake(true);
      setTimeout(() => {
        setScreenShake(false);
        setAttackBeamVisual(null);
      }, 650);
    } else if (optionIdx !== -1) {
      setAttackBeamVisual({ text: '💥 ارتداد الضربة -15 HP', color: '#f59e0b' });
      setTimeout(() => setAttackBeamVisual(null), 650);
    }

    const updatedPlayers = currentRoom.players.map((p) => {
      if (p.id === user.id) {
        if (isCorrect) {
          const newCombo = (p.combo || 0) + 1;
          const speedBonus = roundTimer >= 8 ? 40 : 20;
          const gained = (100 + speedBonus) * (newCombo >= 3 ? 2 : 1);
          actionLog =
            newCombo >= 3
              ? `🔥 كومبو متفجر (x${newCombo}) من ${p.name}! ضرر مضاعف بالخصوم!`
              : `⚡ ضربة مباشرة من ${p.name}! خصم -${baseDamage} HP من جميع الخصوم!`;
          return {
            ...p,
            score: p.score + gained,
            combo: newCombo,
            lastAnsweredRound: currentRoom.round
          };
        } else {
          actionLog =
            optionIdx === -1
              ? '⏱️ انتهى وقت الجولة! الانتقال للجولة التالية تلقائياً.'
              : `💥 أخطأ ${p.name} التوقيت وتلقى ضرراً مرتداً (-15 HP)!`;
          return {
            ...p,
            hp: Math.max(0, p.hp - 15),
            combo: 0,
            lastAnsweredRound: currentRoom.round
          };
        }
      } else {
        let nextHp = isCorrect ? Math.max(0, p.hp - baseDamage) : p.hp;
        let nextScore = p.score;
        if (p.isBot) {
          const botHit = Math.random() > 0.44;
          if (botHit) nextScore += 80;
          else nextHp = Math.max(0, nextHp - 12);
        }
        return {
          ...p,
          hp: nextHp,
          score: nextScore,
          lastAnsweredRound: currentRoom.round
        };
      }
    });

    const alivePlayers = updatedPlayers.filter((p) => p.hp > 0);
    const nextRound = currentRoom.round + 1;
    const isMatchOver = nextRound >= currentRoom.questionIds.length || alivePlayers.length <= 1;

    const roomRef = doc(db, 'battleRooms', currentRoom.code);

    if (isMatchOver) {
      const sorted = [...updatedPlayers].sort((a, b) => b.score + b.hp * 5 - (a.score + a.hp * 5));
      const winner = sorted[0];
      const matchLockId = `room_${currentRoom.code}_r${currentRoom.round}`;
      const totalPot = Math.max(50, currentRoom.stake * currentRoom.players.length);

      await updateDoc(roomRef, {
        players: updatedPlayers,
        status: 'finished',
        winnerId: winner.id,
        winnerName: winner.name,
        lastActionLog: `🏆 انتهى النزال! البطل الفائز هو ${winner.name} وحصد خزينة الحلبة (${totalPot} 🪙)!`,
        updatedAt: serverTimestamp()
      });

      if (winner.id === user.id && !isRewardClaimedLock(matchLockId)) {
        setRewardClaimedLock(matchLockId);
        const { remaining, hadStamina } = consumeArenaStamina(user.id);
        setStamina(remaining);

        const finalPrize = hadStamina ? totalPot : currentRoom.stake + 15;
        await awardXP(user.id, 120 * activeEvent.rewardMultiplier, finalPrize, {
          aiGamesPoints: increment(1)
        });

        await setDoc(
          doc(db, 'arenaBelt', 'current'),
          {
            championId: user.id,
            championName: user.displayName || 'بطل الحلبة',
            championAvatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`,
            winStreak: (beltChampion.championId === user.id ? beltChampion.winStreak : 0) + 1,
            title: activeEvent.prizeTitleAr,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );
      }
    } else {
      await updateDoc(roomRef, {
        players: updatedPlayers,
        round: nextRound,
        lastActionLog: actionLog,
        updatedAt: serverTimestamp()
      });
    }
  };

  // تحدي عضو مباشرة (إرسال دعوة غرفة + إمكانية لعب تحدي شبح فوري دون انتظاره!)
  const handleDirectChallengeUser = async (targetUser: any, launchGhostGame = false) => {
    if (!user) {
      signIn();
      return;
    }
    const targetName = targetUser.displayName || targetUser.username || 'مقاتل أوتاكو';

    if (launchGhostGame) {
      setGhostDuelTarget({
        id: targetUser.id,
        name: targetName,
        targetScoreToBeat: 260,
        stake: selectedStake
      });
      setActiveVisualGame('katana_slash');
      return;
    }

    setChallengingUserId(targetUser.id);
    try {
      if (currentRoom && currentRoom.status === 'waiting') {
        await notificationsService.createUserNotification(targetUser.id, {
          title: `⚔️ ${user.displayName || 'مقاتل'} يتحداك في الحلبة!`,
          body: `انضم لغرفة النزال #${currentRoom.code} (${MODE_LABELS[currentRoom.mode].name}) على رهان ${currentRoom.stake} كوينز!`,
          type: 'tournament',
          imageUrl: user.photoURL || undefined,
          linkTo: `arena_room:${currentRoom.code}`
        });
        showNotice(`تم إرسال دعوة النزال لغرفتك (#${currentRoom.code}) إلى ${targetName}!`);
      } else {
        await handleCreateRoom(targetUser);
      }
    } finally {
      setChallengingUserId(null);
    }
  };

  useEffect(() => {
    if (initialChallengeUser && initialChallengeUser.id && user && initialChallengeUser.id !== user.id) {
      handleDirectChallengeUser(initialChallengeUser);
    }
  }, [initialChallengeUser?.id]);

  // استلام جائزة البطولة المنتهية من صندوق التتويج التلقائي
  const handleClaimEndedTournamentVault = async () => {
    if (!user) {
      signIn();
      return;
    }
    if (vaultClaimed || isRewardClaimedLock(endedVault.id)) return;
    setRewardClaimedLock(endedVault.id);
    setVaultClaimed(true);
    await awardXP(user.id, endedVault.rewardXp, endedVault.rewardCoins);
    showNotice(`👑 تم استلام غنيمة البطولة المنتهية: +${endedVault.rewardCoins} كوينز و +${endedVault.rewardXp} XP!`);
  };

  // نشر صيحة تحدي أو مواجهة تصويت بصرية في الساحة
  const handlePublishArenaPost = async () => {
    if (!user) {
      signIn();
      return;
    }
    if (!newPostTitle.trim()) return;

    try {
      let roomCode = currentRoom?.code || '';
      if (newPostType === 'challenge' && !roomCode) {
        const created = await handleCreateRoom();
        if (created) roomCode = created;
      }

      const postRef = doc(collection(db, 'arenaFeed'));
      await setDoc(postRef, {
        type: newPostType,
        authorId: user.id,
        authorName: user.displayName || 'أوتاكو مقاتل',
        authorAvatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`,
        title: newPostTitle.trim(),
        roomCode: newPostType === 'challenge' ? roomCode : '',
        stake: selectedStake,
        optionA: newPostType === 'poll' ? pollOptA.trim() || 'الكفة الأولى 🔥' : '',
        optionB: newPostType === 'poll' ? pollOptB.trim() || 'الكفة الثانية ⚡' : '',
        votesA: newPostType === 'poll' ? 1 : 0,
        votesB: 0,
        likes: 0,
        createdAt: serverTimestamp()
      });

      setNewPostTitle('');
      setPollOptA('');
      setPollOptB('');
      showNotice(newPostType === 'challenge' ? 'تم نشر صيحة التحدي في الساحة مع كود غرفتك!' : 'تم نشر بطاقة المواجهة البصرية في الساحة!');
    } catch (e) {
      console.error('Publish arena post error:', e);
    }
  };

  const handleVotePoll = async (post: any, side: 'A' | 'B') => {
    if (votedPolls[post.id]) return;
    setVotedPolls((prev) => ({ ...prev, [post.id]: side }));
    try {
      await updateDoc(doc(db, 'arenaFeed', post.id), {
        [side === 'A' ? 'votesA' : 'votesB']: increment(1)
      });
    } catch {}
  };

  const handlePickTournamentChampion = (contenderId: string) => {
    setPickedChampionId(contenderId);
    try {
      localStorage.setItem(`arena_pick_${activeEvent.id}`, contenderId);
    } catch {}
    showNotice('تم تثبيت بطلك المرشح للكأس! 🏆');
  };

  const handleVoteBracketMatch = (matchKey: string, contenderId: string) => {
    if (votedMatches[matchKey]) return;
    const next = { ...votedMatches, [matchKey]: contenderId };
    setVotedMatches(next);
    try {
      localStorage.setItem(`arena_votes_${activeEvent.id}`, JSON.stringify(next));
    } catch {}
    if (user && !isRewardClaimedLock(`vote_${activeEvent.id}_${matchKey}`)) {
      setRewardClaimedLock(`vote_${activeEvent.id}_${matchKey}`);
      awardXP(user.id, 15, 5);
    }
  };

  const sortedLeaders = useMemo(() => {
    const copy = [...leaders];
    if (selectedLeaderGameId !== 'all') {
      return copy.sort((a, b) => {
        const scoreA =
          (a.id === user?.id ? myGameHighScores[selectedLeaderGameId] : 0) ||
          a.dailyStats?.gameHighScores?.[selectedLeaderGameId] ||
          Math.round((a.aiGamesPoints || 0) * 45 + (a.level || 1) * 18);
        const scoreB =
          (b.id === user?.id ? myGameHighScores[selectedLeaderGameId] : 0) ||
          b.dailyStats?.gameHighScores?.[selectedLeaderGameId] ||
          Math.round((b.aiGamesPoints || 0) * 45 + (b.level || 1) * 18);
        return scoreB - scoreA;
      });
    }
    if (leaderFilter === 'coins') {
      return copy.sort((a, b) => (b.coins || 0) - (a.coins || 0));
    }
    if (leaderFilter === 'xp') {
      return copy.sort((a, b) => (b.xp || 0) - (a.xp || 0));
    }
    return copy.sort(
      (a, b) =>
        (b.aiGamesPoints || 0) * 300 + (b.xp || 0) - ((a.aiGamesPoints || 0) * 300 + (a.xp || 0))
    );
  }, [leaders, leaderFilter, selectedLeaderGameId, myGameHighScores, user?.id]);

  return (
    <div className="min-h-screen bg-[#06060a] text-white pb-28 font-sans text-right select-none" dir="rtl">
      {/* مشغل الفضاءات البصرية الكاملة للألعاب وطور القصة */}
      {activeVisualGame && (
        <VisualAnimeGamesSpace
          gameId={activeVisualGame}
          storyChapter={activeStoryChapter}
          ghostTarget={ghostDuelTarget}
          onClose={() => {
            setActiveVisualGame(null);
            setActiveStoryChapter(null);
            setGhostDuelTarget(null);
          }}
          onFinishMatch={handleVisualGameFinished}
        />
      )}

      {/* إشعار حالة عائم */}
      <AnimatePresence>
        {statusMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[9998] bg-[#14141f] border border-[#FF1744]/50 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2"
          >
            <Sparkles size={15} className="text-[#FF1744] shrink-0" />
            <span>{statusMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1. الشريط العلوي الموحد (الرتبة + كأس وشعار الحلبة 3D في المنتصف + الكوينز + التبويبات الـ 4) */}
      <div className="sticky top-0 z-40 bg-[#06060a]/95 backdrop-blur-xl border-b border-white/5 px-3.5 py-2.5">
        <div className="max-w-5xl mx-auto flex flex-col gap-2.5">
          <div className="grid grid-cols-3 items-center gap-2">
            {/* اليمين: زر الرجوع + عنوان الساحة والرتبة */}
            <div className="flex items-center gap-2.5 justify-self-start min-w-0">
              <button
                onClick={onBack}
                className="w-9 h-9 rounded-xl bg-[#13131c] border border-white/5 flex items-center justify-center text-neutral-300 hover:text-white transition cursor-pointer shrink-0"
                aria-label="رجوع"
              >
                <ChevronRight size={19} />
              </button>
              <div className="min-w-0">
                <h1 className="text-xs sm:text-base font-black text-white flex items-center gap-1.5 truncate">
                  <Swords size={16} className="text-[#FF1744] shrink-0" />
                  <span className="truncate">ساحة وفضاءات الأوتاكو</span>
                </h1>
                <div className="flex items-center gap-1.5 text-[10px] text-neutral-400 truncate">
                  <span className={`font-bold ${combatRank.color}`}>{combatRank.rankAr}</span>
                  <span>•</span>
                  <span>انتصاراتك: {userWins}</span>
                </div>
              </div>
            </div>

            {/* المنتصف: الكأس والشعار ثلاثي الأبعاد الدوار (Rotating Low-Poly 3D Trophy & Arena Emblem) */}
            <div className="flex flex-col items-center justify-center justify-self-center">
              <ThreeHeaderTrophyEmblem
                mode={activeTab}
                size={52}
                onClick={() => {
                  triggerHubParticles('victory');
                  setActiveTab('tournaments');
                }}
              />
            </div>

            {/* اليسار: طاقة الحلبة اليومية + الكوينز + مضاعف الحدث */}
            <div className="flex items-center gap-1.5 sm:gap-2 justify-self-end">
              <div
                title="طاقة المباريات المكافأة اليومية"
                className="bg-sky-500/10 border border-sky-500/25 px-2 sm:px-2.5 py-1 rounded-xl flex items-center gap-1 text-sky-400 text-[11px] font-black font-mono tabular-nums"
              >
                <Zap size={12} className="fill-sky-400" />
                <span>{stamina}/{MAX_DAILY_ARENA_STAMINA}</span>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/25 px-2 sm:px-2.5 py-1 rounded-xl flex items-center gap-1 text-amber-400 text-xs font-black font-mono tabular-nums">
                <Coins size={12} />
                <span>{userCoins}</span>
              </div>
              <div className="hidden sm:block bg-[#FF1744]/15 border border-[#FF1744]/30 px-2 py-1 rounded-xl text-[#FF1744] text-[10px] font-black">
                {activeEvent.rewardMultiplier}X
              </div>
            </div>
          </div>

          {/* التبويبات الأربعة للفضاءات الموحدة */}
          <div className="grid grid-cols-4 gap-1.5 bg-[#101018] p-1 rounded-2xl border border-white/5">
            {[
              { id: 'games', label: 'الألعاب والحلبة', icon: Swords },
              { id: 'tournaments', label: 'مدرج البطولات', icon: Trophy },
              { id: 'arena', label: 'الساحة', icon: Flame },
              { id: 'leaderboard', label: 'المتصدرون', icon: Crown }
            ].map((t) => {
              const IconComp = t.icon;
              const isAct = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as ArenaTab)}
                  className={`py-2 px-1.5 rounded-xl text-[11px] sm:text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    isAct ? 'bg-[#FF1744] text-white shadow-md' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <IconComp size={13} />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-3.5 md:px-6 pt-4 space-y-5">
        {/* لافتة الحدث الوحيد النشط حالياً (قاعدة عدم التداخل) مع لوحة فنية سينمائية وفضاء Three.js 3D */}
        <div
          className={`relative overflow-hidden rounded-3xl p-5 border-2 border-[#FF1744]/40 shadow-[0_0_45px_rgba(255,23,68,0.2)]`}
        >
          <img
            src={
              activeTab === 'tournaments'
                ? ANIME_WORLD_BACKGROUNDS.throne
                : activeTab === 'arena'
                ? ANIME_WORLD_BACKGROUNDS.cosmic
                : ANIME_WORLD_BACKGROUNDS.colosseum
            }
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-50 scale-105 pointer-events-none"
          />
          <ThreeAnimeParallaxScene
            accentColor={activeTab === 'tournaments' ? '#f59e0b' : '#FF1744'}
            secondaryColor="#38bdf8"
            burstTrigger={hubBurstTrigger}
            burstMode={hubBurstMode}
            intensity="normal"
          />
          <div className="absolute inset-0 bg-gradient-to-l from-black/85 via-black/55 to-black/80 pointer-events-none z-[3]" />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-[#FF1744] text-white text-[10px] font-black px-3 py-1 rounded-full shadow-[0_0_15px_#FF1744]">
                  {activeEvent.tierBadgeAr}
                </span>
                <span className="bg-black/70 border border-amber-400/40 px-2.5 py-0.5 rounded-full text-[11px] text-amber-300 font-mono tabular-nums flex items-center gap-1">
                  <Clock size={12} />
                  {countdownStr}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-white drop-shadow">{activeEvent.title}</h2>
              <p className="text-xs text-neutral-200">{activeEvent.specialRuleAr}</p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="bg-black/75 backdrop-blur-md border border-yellow-400/30 px-3.5 py-2 rounded-2xl text-right sm:text-left">
                <span className="text-[10px] text-neutral-300 block">خزينة الجوائز</span>
                <span className="text-sm sm:text-base font-black text-yellow-400 font-mono tabular-nums">
                  {activeEvent.prizePoolCoins.toLocaleString()} 🪙
                </span>
              </div>
              <button
                onClick={() => setActiveVisualGame('katana_slash')}
                className="bg-gradient-to-r from-[#FF1744] to-amber-500 hover:opacity-95 text-black text-xs font-black px-4 py-3 rounded-2xl transition cursor-pointer shrink-0 flex items-center gap-1.5 shadow-[0_0_25px_rgba(255,23,68,0.5)]"
              >
                <Play size={14} className="fill-black" />
                <span>العب الآن</span>
              </button>
            </div>
          </div>
        </div>

        {/* =====================================================================
            الفضاء الأول: الألعاب الرسومية والتحريكية + طور القصة + تآزر مكتبة الأنمي
           ===================================================================== */}
        {activeTab === 'games' && (
          <div className="space-y-5">
            {/* 0. شريط تآزر مكتبة الأنمي مع الألعاب والمتجر (Anime Library Synergy & Store Link) */}
            <div className="bg-gradient-to-l from-emerald-950/50 via-[#10121d] to-purple-950/40 border border-emerald-500/35 rounded-3xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="bg-emerald-500 text-black text-[10px] font-black px-2.5 py-0.5 rounded-full">
                    ⚡ تآزر مكتبة الأنمي مفعل
                  </span>
                  <span className="text-xs font-black text-amber-300">{librarySynergy.rankTitleAr}</span>
                </div>
                <p className="text-xs text-neutral-200">
                  مشاهداتك ({librarySynergy.totalWatchedEpisodes} حلقة • {librarySynergy.completedAnime} أنمي مكتمل) تمنح أبطالك{' '}
                  <strong className="text-emerald-400">+{librarySynergy.atkBonusPct}% قوة هجومية</strong> و{' '}
                  <strong className="text-amber-400">{librarySynergy.coinMult}x مضاعف كوينز</strong> في جميع الألعاب!
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {onNavigate && (
                  <button
                    onClick={() => onNavigate('store')}
                    className="bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400/50 text-purple-200 text-xs font-black px-3.5 py-2 rounded-2xl transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Crown size={14} className="text-amber-400" />
                    <span>متجر الإطارات والألقاب</span>
                  </button>
                )}
              </div>
            </div>

            {/* 1. الألعاب الرسومية والتحريكية الأربع الكبرى (4 Flagship Graphical & Physics Engines) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                  <Sparkles size={16} className="text-[#FF1744]" />
                  <span>الألعاب الرسومية والتحريكية الكبرى (فيزياء 2D، رسم أختام، بطاقات 3D، ودانجون)</span>
                </h3>
                <span className="text-[10px] text-emerald-400 font-black">تحريك سينمائي 60FPS</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {VISUAL_ANIME_GAMES.filter((g) => g.isFlagship).map((g) => {
                  const personalBest = myGameHighScores[g.id] || 0;
                  return (
                    <motion.div
                      key={g.id}
                      whileHover={{ y: -5, scale: 1.01 }}
                      onClick={() => {
                        setGhostDuelTarget(null);
                        setActiveStoryChapter(null);
                        setActiveVisualGame(g.id);
                      }}
                      style={{ borderColor: `${g.accentColor}66` }}
                      className="relative min-h-[180px] rounded-3xl overflow-hidden border-2 hover:border-[#FF1744] text-right p-4 flex flex-col justify-between group cursor-pointer shadow-[0_14px_35px_rgba(0,0,0,0.75)]"
                    >
                      <img
                        src={g.worldArt}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:scale-105 transition duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/65 to-black/25" />

                      <div className="relative z-10 flex items-center justify-between gap-2">
                        <span
                          style={{ backgroundColor: g.accentColor }}
                          className="text-black text-[10px] font-black px-3 py-1 rounded-full shadow-md"
                        >
                          {g.tagAr}
                        </span>
                        <div className="flex items-center gap-2">
                          {personalBest > 0 && (
                            <span className="bg-black/80 border border-amber-400/50 text-amber-300 text-[10px] font-black font-mono px-2.5 py-0.5 rounded-full">
                              🏆 رقمك: {personalBest} PT
                            </span>
                          )}
                          <img
                            src={g.fighterImg}
                            onError={(e) => {
                              e.currentTarget.src = getAnimeSvgFallback(g.titleAr, g.accentColor);
                            }}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="w-11 h-11 rounded-2xl object-cover ring-2 ring-white/50 bg-black"
                          />
                        </div>
                      </div>

                      <div className="relative z-10 space-y-1.5 mt-3">
                        <div className="text-[10px] font-mono text-amber-300">{g.studioTag}</div>
                        <h4 className="text-sm sm:text-base font-black text-white leading-snug">
                          {g.titleAr}
                        </h4>
                        <p className="text-[11px] text-neutral-300 line-clamp-2">{g.descriptionAr}</p>
                        <div className="pt-1 flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-[#FF1744] to-amber-500 text-black text-xs font-black px-4 py-1.5 rounded-xl shadow-lg">
                            <Play size={12} className="fill-black" />
                            <span>العب الآن</span>
                          </span>
                          <span className="text-[10px] font-mono text-neutral-300">
                            الهدف: {g.targetScore} PT
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* 2. طور القصة والمراحل المتدرجة (Story Campaign & Hero/Store Unlocks) */}
            <div className="bg-[#101018] border-2 border-amber-500/30 rounded-3xl p-4 sm:p-5 space-y-3.5 shadow-2xl">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                    <BookOpen size={16} className="text-amber-400" />
                    <span>طور القصة الملحمي (8 فصول متدرجة تفتح أبطالاً وإطارات متجر حصرية)</span>
                  </h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    اجتز زعماء الفصول لفتح المراحل التالية واستلام الإطارات الحصرية والكوينز الفورية!
                  </p>
                </div>
                <span className="bg-amber-500/15 border border-amber-400/40 text-amber-300 text-xs font-black px-3 py-1 rounded-xl font-mono">
                  تقدم القصة: {completedChapters.length}/{STORY_CAMPAIGN_CHAPTERS.length}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {STORY_CAMPAIGN_CHAPTERS.map((ch, idx) => {
                  const isCompleted = completedChapters.includes(ch.id);
                  const prevCompleted =
                    idx === 0 || completedChapters.includes(STORY_CAMPAIGN_CHAPTERS[idx - 1].id);
                  const isUnlocked = idx === 0 || isCompleted || prevCompleted;
                  const isFrameEquipped = userData?.equippedFrame === ch.unlockStoreItemId;

                  return (
                    <div
                      key={ch.id}
                      className={`rounded-2xl p-3.5 border-2 flex flex-col justify-between gap-2.5 transition ${
                        isCompleted
                          ? 'bg-gradient-to-b from-emerald-950/35 to-[#0c0d14] border-emerald-500/50'
                          : isUnlocked
                          ? 'bg-gradient-to-b from-[#1a1528] to-[#0d0d16] border-amber-400/60 shadow-[0_0_25px_rgba(245,158,11,0.15)]'
                          : 'bg-[#0b0b12] border-white/5 opacity-55'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          style={{ backgroundColor: isUnlocked ? ch.accentColor : '#374151' }}
                          className="text-black text-[10px] font-black px-2.5 py-0.5 rounded-full"
                        >
                          الفصل {ch.chapterNumber}
                        </span>
                        {isCompleted ? (
                          <span className="text-[10px] font-black text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 size={13} /> مكتمل
                          </span>
                        ) : !isUnlocked ? (
                          <span className="text-[10px] font-bold text-neutral-500 flex items-center gap-1">
                            <Lock size={12} /> مغلق
                          </span>
                        ) : (
                          <span className="text-[10px] font-black text-amber-400 animate-pulse">
                            🔥 متاح للقتال
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5">
                        <img
                          src={ch.bossAvatar}
                          onError={(e) => {
                            e.currentTarget.src = getAnimeSvgFallback(ch.bossNameAr, ch.accentColor);
                          }}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-2xl object-cover bg-black ring-2 ring-white/20 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-black text-white truncate">{ch.titleAr}</div>
                          <div className="text-[10px] text-rose-400 font-bold truncate">
                            الزعيم: {ch.bossNameAr}
                          </div>
                          <div className="text-[10px] text-amber-300 font-mono">
                            +{ch.rewardCoins} 🪙 • +{ch.rewardXp} XP
                          </div>
                        </div>
                      </div>

                      <p className="text-[10px] text-neutral-300 line-clamp-2">{ch.subtitleAr}</p>

                      <div className="bg-black/50 border border-white/5 rounded-xl p-2 text-[10px] space-y-0.5">
                        {ch.unlockHeroNameAr && (
                          <div className="text-emerald-300 font-bold truncate">
                            🦸 يفتح: {ch.unlockHeroNameAr}
                          </div>
                        )}
                        {ch.unlockStoreItemNameAr && (
                          <div className="text-purple-300 font-bold truncate">
                            🖼️ يفتح: {ch.unlockStoreItemNameAr}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          disabled={!isUnlocked}
                          onClick={() => {
                            setGhostDuelTarget(null);
                            setActiveStoryChapter(ch);
                            setActiveVisualGame(ch.gameId);
                          }}
                          className={`flex-1 py-2 rounded-xl text-[11px] font-black flex items-center justify-center gap-1 transition ${
                            isUnlocked
                              ? 'bg-gradient-to-r from-[#FF1744] to-amber-500 text-black cursor-pointer shadow-md'
                              : 'bg-white/5 text-neutral-500 cursor-not-allowed'
                          }`}
                        >
                          <Play size={11} className="fill-current" />
                          <span>{isCompleted ? 'إعادة الفصل' : 'خوض الفصل'}</span>
                        </button>

                        {isCompleted && ch.unlockStoreItemId && (
                          <button
                            onClick={() =>
                              handleEquipStoryFrame(
                                ch.unlockStoreItemId!,
                                ch.unlockStoreItemNameAr || 'إطار القصة'
                              )
                            }
                            className={`px-2.5 py-2 rounded-xl text-[10px] font-black border cursor-pointer ${
                              isFrameEquipped
                                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                                : 'bg-purple-500/20 border-purple-400 text-purple-200 hover:bg-purple-500/35'
                            }`}
                          >
                            {isFrameEquipped ? '✓ مجهز' : 'تجهيز الإطار'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. عوالم الأركيد السريعة الإضافية (7 Classic Arcade Worlds) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                  <Zap size={15} className="text-amber-400" />
                  <span>عوالم الأركيد السريعة وتحديات المهارة</span>
                </h3>
                <span className="text-[10px] text-amber-400 font-bold">مكافآت فورية ولوحة صدارة</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {VISUAL_ANIME_GAMES.filter((g) => !g.isFlagship).map((g) => {
                  const personalBest = myGameHighScores[g.id] || 0;
                  return (
                    <motion.button
                      key={g.id}
                      whileHover={{ y: -5, scale: 1.02 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => {
                        setGhostDuelTarget(null);
                        setActiveStoryChapter(null);
                        setActiveVisualGame(g.id);
                      }}
                      className="relative h-44 rounded-3xl overflow-hidden border-2 border-white/15 hover:border-[#FF1744] text-right p-3.5 flex flex-col justify-between group cursor-pointer shadow-[0_12px_30px_rgba(0,0,0,0.65)]"
                    >
                      <img
                        src={g.worldArt}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover opacity-75 group-hover:scale-110 transition duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/20" />

                      <img
                        src={g.fighterImg}
                        onError={(e) => {
                          e.currentTarget.src = getAnimeSvgFallback(g.titleAr, g.accentColor);
                        }}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="absolute top-2.5 left-2.5 w-10 h-10 rounded-2xl object-cover ring-2 ring-white/40 shadow-xl z-10 bg-black"
                      />

                      <div className="relative z-10 flex items-center justify-between">
                        <span
                          style={{ borderColor: g.accentColor }}
                          className="bg-black/80 backdrop-blur-md border text-[10px] font-black text-white px-2.5 py-0.5 rounded-full"
                        >
                          {g.tagAr}
                        </span>
                      </div>

                      <div className="relative z-10 space-y-1.5">
                        <h4 className="text-xs sm:text-sm font-black text-white leading-tight drop-shadow">
                          {g.titleAr}
                        </h4>
                        <div className="flex items-center justify-between">
                          <div className="inline-flex items-center gap-1 bg-gradient-to-r from-[#FF1744] to-amber-500 text-black text-[10px] font-black px-2.5 py-1 rounded-xl shadow-lg">
                            <Play size={10} className="fill-black" />
                            <span>العب</span>
                          </div>
                          {personalBest > 0 && (
                            <span className="text-[10px] font-mono font-black text-amber-300">
                              {personalBest} PT
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* 2. فضاء حلبة المصارعة الملكية (غرف اللعب الجماعي 2-4 لاعبين) */}
            {currentRoom ? (
              <div
                className={`relative overflow-hidden border-2 rounded-3xl p-4 sm:p-5 space-y-4 transition-transform shadow-[0_0_50px_rgba(255,23,68,0.25)] ${
                  screenShake ? 'translate-x-1.5 -translate-y-1 border-[#FF1744]' : 'border-amber-400/50'
                }`}
              >
                <img
                  src={ANIME_WORLD_BACKGROUNDS.colosseum}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-35 pointer-events-none"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-[#0b0914]/85 to-black/95 pointer-events-none" />
                {/* مؤثر الشعاع القتالي العابر للحلبة عند الضربة */}
                <AnimatePresence>
                  {attackBeamVisual && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1.1 }}
                      exit={{ opacity: 0 }}
                      style={{ color: attackBeamVisual.color }}
                      className="absolute inset-x-0 top-1/3 z-50 text-center font-black text-lg drop-shadow-[0_0_20px_rgba(255,23,68,0.8)] pointer-events-none"
                    >
                      {attackBeamVisual.text}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* شريط الحلبة العلوي */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-[#FF1744] text-white text-xs font-black px-3 py-1 rounded-xl font-mono">
                      حلبة #{currentRoom.code}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(currentRoom.code);
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2000);
                      }}
                      className="text-xs bg-white/5 hover:bg-white/15 text-neutral-200 px-2.5 py-1 rounded-xl flex items-center gap-1 cursor-pointer"
                    >
                      {copiedCode ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      <span>{copiedCode ? 'تم النسخ' : 'نسخ الكود'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-yellow-400 font-black font-mono tabular-nums bg-yellow-500/10 border border-yellow-500/25 px-2.5 py-1 rounded-xl">
                      خزينة الرهان: {currentRoom.stake * currentRoom.maxPlayers} 🪙
                    </span>
                    <button
                      onClick={() => setCurrentRoomId(null)}
                      className="text-xs bg-white/5 hover:bg-red-500/20 text-neutral-300 hover:text-red-300 px-3 py-1 rounded-xl cursor-pointer"
                    >
                      خروج
                    </button>
                  </div>
                </div>

                {/* الزوايا الأربع لحلبة المصارعة البصرية (Octagon Fighter Corners) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Array.from({ length: currentRoom.maxPlayers }).map((_, idx) => {
                    const player = currentRoom.players[idx];
                    if (!player) {
                      return (
                        <div
                          key={`empty-${idx}`}
                          className="bg-black/40 border-2 border-dashed border-white/10 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 min-h-[120px]"
                        >
                          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-neutral-600">
                            <Users size={18} />
                          </div>
                          <span className="text-[11px] text-neutral-500 font-bold">زاوية #{idx + 1}</span>
                        </div>
                      );
                    }

                    const hpPercent = Math.max(0, Math.min(100, player.hp));
                    return (
                      <motion.div
                        key={player.id}
                        animate={player.combo >= 2 ? { scale: [1, 1.03, 1] } : {}}
                        className={`relative rounded-2xl p-3 flex flex-col items-center text-center gap-2 border-2 ${
                          player.hp <= 0
                            ? 'bg-red-950/20 border-red-900/40 opacity-50'
                            : player.id === user?.id
                            ? 'bg-[#1a1325] border-[#FF1744] shadow-[0_0_20px_rgba(255,23,68,0.2)]'
                            : 'bg-[#141420] border-white/10'
                        }`}
                      >
                        <div className="relative">
                          <img
                            src={player.avatar}
                            onError={(e) => {
                              e.currentTarget.src = getAnimeSvgFallback(player.name, '#FF1744');
                            }}
                            alt={player.name}
                            referrerPolicy="no-referrer"
                            className="w-14 h-14 rounded-full object-cover ring-2 ring-white/20 bg-black"
                          />
                          {player.combo >= 2 && (
                            <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-[10px] font-black px-1.5 py-0.5 rounded-full">
                              🔥x{player.combo}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 w-full">
                          <div className="text-xs font-black text-white truncate">{player.name}</div>
                          <div className="text-[10px] text-amber-400 font-mono">{player.score} PT</div>
                        </div>

                        {/* شريط الصحة البصري العريض */}
                        <div className="w-full space-y-1">
                          <div className="w-full h-2.5 bg-black rounded-full overflow-hidden border border-white/10">
                            <div
                              className={`h-full transition-all duration-300 ${
                                hpPercent > 50
                                  ? 'bg-gradient-to-r from-emerald-500 to-green-400'
                                  : hpPercent > 25
                                  ? 'bg-amber-500'
                                  : 'bg-red-600'
                              }`}
                              style={{ width: `${hpPercent}%` }}
                            />
                          </div>
                          <div className="text-[9px] font-mono font-bold text-neutral-300">
                            {hpPercent} HP
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* حالة انتظار المقاتلين قبل قرع الجرس */}
                {currentRoom.status === 'waiting' && (
                  <div className="bg-black/50 border border-white/10 rounded-2xl p-4 text-center space-y-3">
                    <p className="text-xs font-bold text-neutral-300">
                      أرسل الكود <strong className="text-[#FF1744] font-mono">#{currentRoom.code}</strong> أو اضغط لبدء المعركة فوراً في الحلبة!
                    </p>
                    <button
                      onClick={handleFillBotsAndStart}
                      className="bg-gradient-to-r from-[#FF1744] to-amber-500 text-black font-black text-xs px-6 py-3 rounded-xl inline-flex items-center gap-2 cursor-pointer shadow-lg"
                    >
                      <Play size={14} className="fill-black" />
                      <span>قرع جرس الحلبة وبدء القتال ⚡</span>
                    </button>
                  </div>
                )}

                {/* حالة القتال الحي داخل الحلبة */}
                {currentRoom.status === 'playing' && (() => {
                  const qId = currentRoom.questionIds[currentRoom.round % currentRoom.questionIds.length];
                  const qItem = ARENA_QUESTION_POOL.find((q) => q.id === qId) || ARENA_QUESTION_POOL[0];
                  return (
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center justify-between text-xs font-black">
                        <span className="text-neutral-300">
                          الجولة القتالية {currentRoom.round + 1}/{currentRoom.questionIds.length}
                        </span>
                        <span className="text-[#FF1744] font-mono">⏱️ {roundTimer}s</span>
                      </div>

                      <div className="bg-[#141422] border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4">
                        <div className="w-28 h-32 rounded-2xl overflow-hidden bg-black shrink-0 border-2 border-[#FF1744]/40">
                          <img
                            src={qItem.imageUrl}
                            onError={(e) => {
                              e.currentTarget.src = getAnimeSvgFallback(qItem.animeName, '#FF1744');
                            }}
                            alt=""
                            referrerPolicy="no-referrer"
                            style={{
                              filter: currentRoom.mode === 'hawk_eye' ? `blur(${blurLevel}px)` : 'none'
                            }}
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="flex-1 space-y-3 w-full">
                          <h3 className="text-xs sm:text-sm font-black text-white">{qItem.prompt}</h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {qItem.options.map((opt, idx) => (
                              <button
                                key={idx}
                                onClick={() => handleArenaStrike(idx)}
                                className="bg-[#1e1e30] hover:bg-[#FF1744] text-white border border-white/10 rounded-xl py-2.5 px-3 text-xs font-black text-right transition active:scale-95 cursor-pointer flex items-center justify-between"
                              >
                                <span>{opt}</span>
                                <Swords size={13} className="text-[#FF1744]" />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* تتويج الفائز بالحلبة */}
                {currentRoom.status === 'finished' && (
                  <div className="bg-gradient-to-b from-amber-500/20 to-black border border-amber-400/40 rounded-2xl p-5 text-center space-y-3">
                    <Crown size={34} className="text-yellow-400 mx-auto animate-bounce" />
                    <h3 className="text-base font-black text-white">
                      🏆 البطل الفائز بالحلبة: {currentRoom.winnerName}
                    </h3>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={handleFillBotsAndStart}
                        className="bg-[#FF1744] text-white text-xs font-black px-5 py-2.5 rounded-xl cursor-pointer"
                      >
                        مباراة ثأر 🔥
                      </button>
                      <button
                        onClick={() => setCurrentRoomId(null)}
                        className="bg-white/10 text-white text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer"
                      >
                        ردهة الحلبة
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ردهة حلبة المصارعة الجماعية (إنشاء غرفة 2-4 لاعبين أو دخول غرفة حية) */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="relative overflow-hidden lg:col-span-7 bg-[#101018] border-2 border-amber-500/30 rounded-3xl p-4 sm:p-5 space-y-4 shadow-2xl">
                  <img
                    src={ANIME_WORLD_BACKGROUNDS.colosseum}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover opacity-25 pointer-events-none"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#090912] via-[#090912]/80 to-transparent pointer-events-none" />
                  <div className="relative z-10 flex items-center justify-between">
                    <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                      <Swords size={16} className="text-[#FF1744]" />
                      <span>مدرج حلبة المصارعة الملكية (2 إلى 4 مقاتلين)</span>
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(Object.keys(MODE_LABELS) as BattleModeId[]).map((mKey) => {
                      const m = MODE_LABELS[mKey];
                      const isSel = selectedMode === mKey;
                      return (
                        <button
                          key={mKey}
                          onClick={() => setSelectedMode(mKey)}
                          className={`p-2.5 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center gap-1 ${
                            isSel
                              ? 'bg-[#FF1744]/20 border-[#FF1744] text-white'
                              : 'bg-[#161622] border-white/5 text-neutral-400'
                          }`}
                        >
                          <span className="text-[11px] font-black text-[#FF1744]">{m.badge}</span>
                          <span className="text-[11px] font-bold text-white truncate w-full">{m.name}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid grid-cols-3 gap-1.5">
                      {[2, 3, 4].map((num) => (
                        <button
                          key={num}
                          onClick={() => setSelectedMaxPlayers(num)}
                          className={`py-2 rounded-xl text-xs font-black border cursor-pointer ${
                            selectedMaxPlayers === num
                              ? 'bg-[#FF1744] border-[#FF1744] text-white'
                              : 'bg-[#161622] border-white/5 text-neutral-400'
                          }`}
                        >
                          {num}P
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {[50, 100, 250].map((st) => (
                        <button
                          key={st}
                          onClick={() => setSelectedStake(st)}
                          className={`py-2 rounded-xl text-xs font-black border cursor-pointer font-mono ${
                            selectedStake === st
                              ? 'bg-amber-500 border-amber-400 text-black'
                              : 'bg-[#161622] border-white/5 text-neutral-400'
                          }`}
                        >
                          {st}🪙
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => handleCreateRoom()}
                    disabled={creatingRoom}
                    className="w-full bg-gradient-to-r from-[#FF1744] to-rose-600 text-white font-black py-3 rounded-2xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                  >
                    <Plus size={16} />
                    <span>
                      فتح حلبة نزال ({selectedMaxPlayers} مقاتلين • الخزينة {selectedStake * selectedMaxPlayers} 🪙)
                    </span>
                  </button>
                </div>

                {/* الغرف الحية النشطة حالياً (تُصفّى تلقائياً كل 10 دقائق) */}
                <div className="lg:col-span-5 bg-[#101018] border border-white/10 rounded-3xl p-4 space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value)}
                      placeholder="كود الغرفة (#4821)"
                      className="flex-1 bg-[#161622] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF1744]"
                    />
                    <button
                      onClick={() => handleJoinRoom(joinCodeInput)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black px-4 py-2 rounded-xl cursor-pointer"
                    >
                      دخول
                    </button>
                  </div>

                  <div className="space-y-2 max-h-40 overflow-y-auto hide-scrollbar">
                    {openRooms.length > 0 ? (
                      openRooms.map((r) => (
                        <div
                          key={r.id}
                          className="bg-[#161622] border border-white/5 rounded-xl p-2.5 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-black text-white truncate">
                              حلبة {r.hostName} <span className="text-[#FF1744] font-mono">#{r.code}</span>
                            </div>
                            <div className="text-[10px] text-neutral-400">
                              {r.players?.length || 1}/{r.maxPlayers} مقاتلين • {r.stake} 🪙
                            </div>
                          </div>
                          <button
                            onClick={() => handleJoinRoom(r.code)}
                            className="bg-[#FF1744] text-white text-xs font-black px-3 py-1.5 rounded-lg cursor-pointer shrink-0"
                          >
                            انضم ⚔️
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 text-[11px] text-neutral-500 font-bold">
                        لا توجد غرف منتظرة في هذه اللحظة — افتح حلبتك أو تحدَّ أي عضو بالأسفل فوراً!
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 3. شريط التحدي الفوري للأعضاء (غرفة حية أو تحدي شبح مسجّل دون انتظار!) */}
            <div className="bg-[#101018] border border-white/10 rounded-3xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                  <UserPlus size={16} className="text-[#FF1744]" />
                  <span>منازلة الأعضاء (حتى لو كان خصمك غير متصل الآن!)</span>
                </h3>
              </div>

              <div className="flex gap-2.5 overflow-x-auto hide-scrollbar pb-1">
                {leaders
                  .filter((u) => u.id !== user?.id)
                  .slice(0, 12)
                  .map((member) => (
                    <div
                      key={member.id}
                      className="w-40 shrink-0 bg-[#161622] border border-white/5 rounded-2xl p-2.5 flex flex-col items-center text-center gap-2"
                    >
                      <img
                        src={
                          member.photoURL ||
                          `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.id}`
                        }
                        onError={(e) => {
                          e.currentTarget.src = getAnimeSvgFallback(member.displayName, '#FF1744');
                        }}
                        alt=""
                        referrerPolicy="no-referrer"
                        onClick={() => onUserClick?.(member.id)}
                        className="w-12 h-12 rounded-full object-cover bg-black cursor-pointer ring-2 ring-[#FF1744]/40"
                      />
                      <div className="min-w-0 w-full">
                        <div className="text-xs font-black text-white truncate">
                          {member.displayName || member.username || 'مقاتل أوتاكو'}
                        </div>
                        <div className="text-[10px] text-amber-400 font-mono">LV.{member.level || 1}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-1 w-full">
                        <button
                          onClick={() => handleDirectChallengeUser(member, true)}
                          className="bg-[#FF1744] text-white rounded-lg py-1.5 text-[10px] font-black cursor-pointer"
                          title="العب ضده فوراً وسجل رقمك"
                        >
                          انزله الآن 🗡️
                        </button>
                        <button
                          onClick={() => handleDirectChallengeUser(member, false)}
                          disabled={challengingUserId === member.id}
                          className="bg-white/10 hover:bg-white/20 text-white rounded-lg py-1.5 text-[10px] font-bold cursor-pointer"
                          title="دعوة لغرفة حية"
                        >
                          غرفة 🥊
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            الفضاء الثاني: مدرج البطولات البصري + صندوق تتويج البطولة المنتهية
           ===================================================================== */}
        {activeTab === 'tournaments' && (
          <div className="space-y-5">
            {/* صندوق استلام غنيمة البطولة المنتهية تلقائياً (Auto-Settlement Vault) */}
            {!vaultClaimed && (
              <div className="bg-gradient-to-r from-emerald-950/60 via-[#121820] to-amber-950/40 border border-emerald-500/40 rounded-3xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0">
                    <Gift size={22} />
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-emerald-400">صندوق تتويج الدورة السابقة</span>
                    <h4 className="text-xs sm:text-sm font-black text-white">{endedVault.title}</h4>
                    <p className="text-[11px] text-neutral-300">
                      مكافأتك الجاهزة للاستلام: +{endedVault.rewardCoins} كوينز و +{endedVault.rewardXp} XP
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClaimEndedTournamentVault}
                  className="bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs px-5 py-2.5 rounded-xl cursor-pointer shrink-0"
                >
                  استلام الغنيمة 💰
                </button>
              </div>
            )}

            {/* 1. حزام بطل الحلبة المتوهج (The Undisputed Belt) */}
            <div className="relative overflow-hidden border-2 border-amber-400/60 rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-[0_0_45px_rgba(245,158,11,0.2)]">
              <img
                src={ANIME_WORLD_BACKGROUNDS.throne}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none"
              />
              <div className="absolute inset-0 bg-gradient-to-l from-black/90 via-black/70 to-black/85 pointer-events-none" />
              <div className="relative z-10 flex items-center gap-3.5">
                <div className="relative">
                  <img
                    src={beltChampion.championAvatar}
                    onError={(e) => {
                      e.currentTarget.src = getAnimeSvgFallback(beltChampion.championName, '#f59e0b');
                    }}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-2xl object-cover ring-2 ring-yellow-400 bg-black"
                  />
                  <span className="absolute -bottom-1.5 -right-1.5 bg-yellow-400 text-black text-[10px] font-black px-2 py-0.5 rounded-full">
                    👑 البطل
                  </span>
                </div>
                <div>
                  <div className="text-[11px] font-black text-yellow-400">{beltChampion.title}</div>
                  <h3 className="text-base font-black text-white">{beltChampion.championName}</h3>
                  <div className="text-xs text-neutral-300">
                    سلسلة الانتصارات: <strong className="text-amber-400">{beltChampion.winStreak} 🔥</strong>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setActiveVisualGame('beam_clash')}
                className="relative z-10 bg-gradient-to-r from-amber-400 to-yellow-500 hover:opacity-95 text-black font-black text-xs px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 flex items-center gap-1.5 shadow-[0_0_25px_#f59e0b]"
              >
                <Swords size={15} />
                <span>انتزع الحزام الآن!</span>
              </button>
            </div>

            {/* 2. المسار الزمني غير المتداخل (أسبوعي -> شهري -> موسمي) */}
            <div className="bg-[#101018] border border-white/10 rounded-3xl p-4 space-y-3">
              <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                <Layers size={16} className="text-[#FF1744]" />
                <span>خريطة البطولات المتتالية (صفر تداخل)</span>
              </h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                {activeEvent.roadmap.map((node) => (
                  <div
                    key={node.step}
                    className={`rounded-2xl p-3 border flex flex-col justify-between gap-1.5 ${
                      node.status === 'active'
                        ? 'bg-[#FF1744]/20 border-[#FF1744] text-white shadow-lg'
                        : node.status === 'completed'
                        ? 'bg-[#151520] border-emerald-500/30 text-neutral-300'
                        : 'bg-[#0c0c14] border-white/5 text-neutral-500'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-black">
                      <span>{node.label}</span>
                      <span>{node.status === 'active' ? '🔥 الآن' : node.status === 'completed' ? '✓' : '⏳'}</span>
                    </div>
                    <div className="text-xs font-black leading-snug">{node.title}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. شجرة الكأس البصرية المضيئة (Visual Colosseum Bracket) */}
            <div className="bg-[#101018] border border-white/10 rounded-3xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                  <Trophy size={16} className="text-yellow-400" />
                  <span>شجرة الكأس البصرية (اختر بطلك وصوّت في المواجهات)</span>
                </h3>
              </div>

              {/* شريط صور المرشحين للقب */}
              <div className="flex gap-2.5 overflow-x-auto hide-scrollbar pb-1">
                {BRACKET_CONTENDERS.map((c) => {
                  const isPicked = pickedChampionId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => handlePickTournamentChampion(c.id)}
                      className={`w-24 shrink-0 p-2 rounded-2xl border text-center transition cursor-pointer flex flex-col items-center gap-1.5 ${
                        isPicked
                          ? 'bg-amber-500/20 border-amber-400 text-white scale-105'
                          : 'bg-[#161622] border-white/5 text-neutral-300'
                      }`}
                    >
                      <img
                        src={c.image}
                        onError={(e) => {
                          e.currentTarget.src = getAnimeSvgFallback(c.name, '#f59e0b');
                        }}
                        alt={c.name}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-full object-cover ring-2 ring-amber-400/40 bg-black"
                      />
                      <span className="text-[10px] font-black truncate w-full">{c.name}</span>
                      <span className="text-[9px] text-amber-400 font-bold">
                        {isPicked ? '★ بطلك' : 'رشّح'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* المواجهات البصرية المباشرة */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[0, 1, 2, 3].map((mIdx) => {
                  const fighterA = BRACKET_CONTENDERS[mIdx * 2];
                  const fighterB = BRACKET_CONTENDERS[mIdx * 2 + 1];
                  const matchKey = `qf_${mIdx}`;
                  const userVote = votedMatches[matchKey];
                  const votesA = fighterA.baseVotes + (userVote === fighterA.id ? 1 : 0);
                  const votesB = fighterB.baseVotes + (userVote === fighterB.id ? 1 : 0);
                  const pctA = Math.round((votesA / (votesA + votesB)) * 100);
                  const pctB = 100 - pctA;

                  return (
                    <div
                      key={matchKey}
                      className="bg-[#161622] border border-white/5 rounded-2xl p-3 space-y-2"
                    >
                      <div className="grid grid-cols-2 gap-2 items-center">
                        {[
                          { f: fighterA, pct: pctA },
                          { f: fighterB, pct: pctB }
                        ].map(({ f, pct }) => {
                          const votedThis = userVote === f.id;
                          return (
                            <button
                              key={f.id}
                              onClick={() => handleVoteBracketMatch(matchKey, f.id)}
                              className={`p-2 rounded-xl border text-right transition cursor-pointer flex items-center gap-2 ${
                                votedThis
                                  ? 'bg-[#FF1744]/25 border-[#FF1744] text-white'
                                  : 'bg-[#0f0f18] border-white/5 text-neutral-200'
                              }`}
                            >
                              <img
                                src={f.image}
                                onError={(e) => {
                                  e.currentTarget.src = getAnimeSvgFallback(f.name, '#FF1744');
                                }}
                                alt={f.name}
                                referrerPolicy="no-referrer"
                                className="w-11 h-11 rounded-xl object-cover shrink-0 bg-black"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-black truncate">{f.name}</div>
                                <div className="text-[11px] text-amber-400 font-mono font-black">{pct}%</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* شريط طاقة المواجهة البصري */}
                      <div className="h-1.5 w-full bg-black rounded-full overflow-hidden flex">
                        <div style={{ width: `${pctA}%` }} className="bg-[#FF1744] h-full" />
                        <div style={{ width: `${pctB}%` }} className="bg-amber-400 h-full" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. صراع المعسكرات الأربعة البصري */}
            <div className="bg-[#101018] border border-white/10 rounded-3xl p-4 space-y-3">
              <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                <Shield size={16} className="text-[#FF1744]" />
                <span>حرب المعسكرات الأربعة (اختر رايتك القتالية)</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {SEASONAL_FACTIONS.map((fac) => {
                  const isMyFaction = selectedFaction === fac.id;
                  const score = fac.baseScore + (isMyFaction ? userWins * 100 + 250 : 0);
                  return (
                    <button
                      key={fac.id}
                      onClick={() => {
                        setSelectedFaction(fac.id);
                        try {
                          localStorage.setItem('arena_user_faction', fac.id);
                        } catch {}
                        showNotice(`رفعت راية «${fac.nameAr}»! ⚔️`);
                      }}
                      className={`p-3 rounded-2xl border text-right transition cursor-pointer flex items-center justify-between gap-3 ${
                        isMyFaction
                          ? `${fac.bg} ${fac.border} text-white`
                          : 'bg-[#161622] border-white/5 text-neutral-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-black truncate">{fac.nameAr}</div>
                        <div className="text-[10px] text-neutral-400 truncate">{fac.mottoAr}</div>
                      </div>
                      <div className="text-left shrink-0">
                        <div className={`text-xs font-black font-mono ${fac.color}`}>
                          {score.toLocaleString()}
                        </div>
                        <div className="text-[10px] font-bold text-neutral-400">
                          {isMyFaction ? '✓ معسكرك' : 'انضمام'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            الفضاء الثالث: الساحة والرادار الحي (التحديات المسجّلة Ghost Duels + VS)
           ===================================================================== */}
        {activeTab === 'arena' && (() => {
          const dayIdx = new Date().getDate() % ARENA_QUESTION_POOL.length;
          const dailyQuestion = ARENA_QUESTION_POOL[dayIdx];
          return (
            <div className="space-y-4">
              {/* ضربة اليوم السريعة */}
              <div className="bg-gradient-to-r from-[#FF1744]/20 via-[#13131f] to-[#101018] border border-[#FF1744]/30 rounded-3xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target size={16} className="text-[#FF1744]" />
                    <h3 className="text-xs sm:text-sm font-black text-white">
                      ضربة اليوم الخاطفة ({dailyQuestion.animeName})
                    </h3>
                  </div>
                  <span className="text-[10px] font-black text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full">
                    +50 🪙 • +80 XP
                  </span>
                </div>

                <p className="text-xs font-bold text-neutral-200">{dailyQuestion.prompt}</p>

                {dailyChallengeDone ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-2">
                    <CheckCircle2 size={15} />
                    <span>حصدت مكافأة اليوم!</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {dailyQuestion.options.map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={async () => {
                          if (!user) {
                            signIn();
                            return;
                          }
                          if (idx === dailyQuestion.correctIndex) {
                            const todayKey = new Date().toISOString().slice(0, 10);
                            try {
                              localStorage.setItem(`arena_daily_${todayKey}`, 'done');
                            } catch {}
                            setDailyChallengeDone(true);
                            await awardXP(user.id, 80, 50);
                            showNotice('🎉 ضربة موفقة! +50 كوينز و +80 XP!');
                          } else {
                            showNotice('أخطأت الهدف! حاول مجدداً.');
                          }
                        }}
                        className="bg-[#181826] hover:bg-[#FF1744] text-white border border-white/10 rounded-xl py-2 px-3 text-xs font-bold transition cursor-pointer"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* إطلاق تحدي أو مواجهة VS في الساحة */}
              <div className="bg-[#101018] border border-white/10 rounded-3xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-white">أطلق صيحة تحدي أو مواجهة VS</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setNewPostType('challenge')}
                      className={`px-3 py-1 rounded-xl text-xs font-bold cursor-pointer ${
                        newPostType === 'challenge' ? 'bg-[#FF1744] text-white' : 'bg-[#171722] text-neutral-400'
                      }`}
                    >
                      تحدي حلبة ⚔️
                    </button>
                    <button
                      onClick={() => setNewPostType('poll')}
                      className={`px-3 py-1 rounded-xl text-xs font-bold cursor-pointer ${
                        newPostType === 'poll' ? 'bg-[#FF1744] text-white' : 'bg-[#171722] text-neutral-400'
                      }`}
                    >
                      بطاقة VS 🔥
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPostTitle}
                    onChange={(e) => setNewPostTitle(e.target.value)}
                    placeholder={
                      newPostType === 'challenge'
                        ? 'اكتب رسالتك للمتحدين...'
                        : 'عنوان المواجهة (مثال: لوفي ضد ناروتو)...'
                    }
                    className="flex-1 bg-[#161622] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#FF1744]"
                  />
                  <button
                    onClick={handlePublishArenaPost}
                    className="bg-[#FF1744] text-white text-xs font-black px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Send size={13} />
                    <span>نشر</span>
                  </button>
                </div>

                {newPostType === 'poll' && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={pollOptA}
                      onChange={(e) => setPollOptA(e.target.value)}
                      placeholder="البطل الأول 🔥"
                      className="bg-[#161622] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={pollOptB}
                      onChange={(e) => setPollOptB(e.target.value)}
                      placeholder="البطل الثاني ⚡"
                      className="bg-[#161622] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                )}
              </div>

              {/* بطاقات الساحة الحية (بما فيها تحديات الشبح المسجّلة Ghost Duels!) */}
              <div className="space-y-3">
                {arenaPosts.map((post, pIdx) => {
                  const totalVotes = (post.votesA || 0) + (post.votesB || 0);
                  const pctA = totalVotes > 0 ? Math.round(((post.votesA || 0) / totalVotes) * 100) : 50;
                  const pctB = 100 - pctA;

                  return (
                    <div
                      key={`arena-post-${post.id || pIdx}-${pIdx}`}
                      className="bg-[#101018] border border-white/10 rounded-3xl p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={post.authorAvatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=otaku'}
                            onError={(e) => {
                              e.currentTarget.src = getAnimeSvgFallback(post.authorName, '#FF1744');
                            }}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full object-cover bg-black ring-1 ring-white/15"
                          />
                          <div>
                            <div className="text-xs font-black text-white">{post.authorName}</div>
                            <div className="text-[10px] text-[#FF1744] font-bold">
                              {post.type === 'ghost_duel'
                                ? `🗡️ تحدي مسجّل (${post.scoreToBeat} نقطة)`
                                : post.type === 'challenge'
                                ? '🥊 دعوة حلبة مباشرة'
                                : '🔥 مواجهة VS بصرية'}
                            </div>
                          </div>
                        </div>

                        {post.type === 'ghost_duel' && (
                          <button
                            onClick={() => {
                              setGhostDuelTarget({
                                id: post.authorId,
                                name: post.authorName,
                                targetScoreToBeat: post.scoreToBeat || 250,
                                stake: post.stake || 50,
                                postId: post.id
                              });
                              setActiveVisualGame((post.gameId as VisualGameId) || 'katana_slash');
                            }}
                            className="bg-gradient-to-r from-[#FF1744] to-amber-500 text-black text-xs font-black px-3.5 py-2 rounded-xl cursor-pointer flex items-center gap-1 shadow-md"
                          >
                            <Swords size={13} />
                            <span>اكسر رقمه ({post.scoreToBeat})</span>
                          </button>
                        )}

                        {post.type === 'challenge' && post.roomCode && (
                          <button
                            onClick={() => handleJoinRoom(post.roomCode)}
                            className="bg-[#FF1744] text-white text-xs font-black px-3.5 py-2 rounded-xl cursor-pointer flex items-center gap-1"
                          >
                            <Swords size={13} />
                            <span>دخول #{post.roomCode}</span>
                          </button>
                        )}
                      </div>

                      <p className="text-xs sm:text-sm font-bold text-neutral-100">{post.title}</p>

                      {post.type === 'poll' && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2.5">
                            <button
                              onClick={() => handleVotePoll(post, 'A')}
                              className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
                                votedPolls[post.id] === 'A'
                                  ? 'bg-[#FF1744]/25 border-[#FF1744] text-white'
                                  : 'bg-[#161622] border-white/5 text-neutral-200'
                              }`}
                            >
                              <div className="flex justify-between text-xs font-black">
                                <span>{post.optionA}</span>
                                <span className="text-[#FF1744] font-mono">{pctA}%</span>
                              </div>
                            </button>
                            <button
                              onClick={() => handleVotePoll(post, 'B')}
                              className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
                                votedPolls[post.id] === 'B'
                                  ? 'bg-amber-500/25 border-amber-400 text-white'
                                  : 'bg-[#161622] border-white/5 text-neutral-200'
                              }`}
                            >
                              <div className="flex justify-between text-xs font-black">
                                <span>{post.optionB}</span>
                                <span className="text-amber-400 font-mono">{pctB}%</span>
                              </div>
                            </button>
                          </div>
                          {/* شريط لهب التصويت البصري */}
                          <div className="h-2 w-full bg-black rounded-full overflow-hidden flex">
                            <div style={{ width: `${pctA}%` }} className="bg-[#FF1744] h-full transition-all" />
                            <div style={{ width: `${pctB}%` }} className="bg-amber-400 h-full transition-all" />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* =====================================================================
            الفضاء الرابع: منصة الأساطير ولوحة الصدارة المستقلة لكل لعبة
           ===================================================================== */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-4">
            <div className="bg-[#101018] border border-white/10 rounded-3xl p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-black text-white flex items-center gap-1.5">
                  <Crown size={15} className="text-amber-400" />
                  <span>اختر التصنيف العام أو لوحة الصدارة المستقلة لكل لعبة:</span>
                </div>

                <div className="flex gap-1.5">
                  {[
                    { id: 'event', label: 'أبطال الحلبة 🔥' },
                    { id: 'xp', label: 'المستوى XP ⭐' },
                    { id: 'coins', label: 'الكوينز 🪙' }
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => {
                        setSelectedLeaderGameId('all');
                        setLeaderFilter(f.id as any);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                        selectedLeaderGameId === 'all' && leaderFilter === f.id
                          ? 'bg-[#FF1744] text-white'
                          : 'bg-[#161622] text-neutral-400 hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* شريط اختيار لوحة الصدارة المستقلة لكل لعبة */}
              <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
                <button
                  onClick={() => setSelectedLeaderGameId('all')}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-black shrink-0 border transition cursor-pointer ${
                    selectedLeaderGameId === 'all'
                      ? 'bg-amber-500 text-black border-amber-400'
                      : 'bg-[#161622] text-neutral-300 border-white/5'
                  }`}
                >
                  🌐 جميع الألعاب
                </button>
                {VISUAL_ANIME_GAMES.map((gm) => {
                  const isSel = selectedLeaderGameId === gm.id;
                  return (
                    <button
                      key={gm.id}
                      onClick={() => setSelectedLeaderGameId(gm.id)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-black shrink-0 border transition cursor-pointer flex items-center gap-1.5 ${
                        isSel
                          ? 'bg-[#FF1744] text-white border-[#FF1744] shadow-md'
                          : 'bg-[#161622] text-neutral-300 border-white/5 hover:text-white'
                      }`}
                    >
                      <span>{gm.titleAr}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* منصة التتويج البصرية للمراكز الثلاثة الأولى */}
            {sortedLeaders.length >= 3 && (
              <div className="grid grid-cols-3 gap-2.5 items-end pt-3">
                {[1, 0, 2].map((rankIdx) => {
                  const u = sortedLeaders[rankIdx];
                  if (!u) return null;
                  const isFirst = rankIdx === 0;
                  const gameScoreVal =
                    selectedLeaderGameId !== 'all'
                      ? (u.id === user?.id ? myGameHighScores[selectedLeaderGameId] : 0) ||
                        u.dailyStats?.gameHighScores?.[selectedLeaderGameId] ||
                        Math.round((u.aiGamesPoints || 0) * 45 + (u.level || 1) * 18)
                      : 0;

                  return (
                    <div
                      key={`podium-${u.id || rankIdx}-${rankIdx}`}
                      className={`rounded-3xl p-3 flex flex-col items-center text-center gap-2 border-2 ${
                        isFirst
                          ? 'bg-gradient-to-b from-amber-500/25 via-[#161624] to-[#101018] border-yellow-400 pb-6 shadow-[0_0_30px_rgba(250,204,21,0.15)]'
                          : 'bg-[#101018] border-white/10'
                      }`}
                    >
                      <div className="relative">
                        <img
                          src={u.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`}
                          onError={(e) => {
                            e.currentTarget.src = getAnimeSvgFallback(u.displayName, '#f59e0b');
                          }}
                          alt=""
                          referrerPolicy="no-referrer"
                          onClick={() => onUserClick?.(u.id)}
                          className={`${
                            isFirst ? 'w-16 h-16 ring-2 ring-yellow-400' : 'w-13 h-13 ring-1 ring-white/20'
                          } rounded-full object-cover bg-black cursor-pointer`}
                        />
                        <span
                          className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center ${
                            isFirst
                              ? 'bg-yellow-400 text-black'
                              : rankIdx === 1
                              ? 'bg-neutral-300 text-black'
                              : 'bg-amber-700 text-white'
                          }`}
                        >
                          {rankIdx + 1}
                        </span>
                      </div>
                      <div className="min-w-0 w-full">
                        <div className="text-xs font-black text-white truncate">
                          {u.displayName || u.username || 'مقاتل أوتاكو'}
                        </div>
                        <div className="text-[10px] text-amber-400 font-mono">
                          {selectedLeaderGameId !== 'all'
                            ? `${gameScoreVal} PT 🏆`
                            : leaderFilter === 'coins'
                            ? `${u.coins || 0} 🪙`
                            : leaderFilter === 'xp'
                            ? `LV.${u.level || 1}`
                            : `${u.aiGamesPoints || 0} فوز`}
                        </div>
                      </div>
                      {u.id !== user?.id && (
                        <button
                          onClick={() => {
                            if (selectedLeaderGameId !== 'all') {
                              setGhostDuelTarget({
                                id: u.id,
                                name: u.displayName || u.username || 'مقاتل',
                                targetScoreToBeat: Math.max(200, gameScoreVal),
                                stake: selectedStake
                              });
                              setActiveStoryChapter(null);
                              setActiveVisualGame(selectedLeaderGameId);
                            } else {
                              handleDirectChallengeUser(u, true);
                            }
                          }}
                          className="w-full bg-[#FF1744] text-white rounded-xl py-1.5 text-[10px] font-black cursor-pointer"
                        >
                          انزله ⚔️
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* بقية المتصدرين */}
            <div className="bg-[#101018] border border-white/10 rounded-3xl divide-y divide-white/5 overflow-hidden">
              {sortedLeaders.slice(3, 25).map((u, idx) => {
                const gameScoreVal =
                  selectedLeaderGameId !== 'all'
                    ? (u.id === user?.id ? myGameHighScores[selectedLeaderGameId] : 0) ||
                      u.dailyStats?.gameHighScores?.[selectedLeaderGameId] ||
                      Math.round((u.aiGamesPoints || 0) * 45 + (u.level || 1) * 18)
                    : 0;
                return (
                  <div key={`leader-${u.id || idx}-${idx}`} className="p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 text-center text-xs font-mono font-black text-neutral-500">
                        #{idx + 4}
                      </span>
                      <img
                        src={u.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`}
                        onError={(e) => {
                          e.currentTarget.src = getAnimeSvgFallback(u.displayName, '#FF1744');
                        }}
                        alt=""
                        referrerPolicy="no-referrer"
                        onClick={() => onUserClick?.(u.id)}
                        className="w-10 h-10 rounded-full object-cover bg-black cursor-pointer shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-black text-white truncate">
                          {u.displayName || u.username || 'مقاتل أوتاكو'}
                        </div>
                        <div className="text-[10px] text-neutral-400 font-mono">
                          {selectedLeaderGameId !== 'all'
                            ? `أعلى رقم في اللعبة: ${gameScoreVal} PT`
                            : `LV.${u.level || 1} • ${u.coins || 0} 🪙 • ${u.aiGamesPoints || 0} فوز`}
                        </div>
                      </div>
                    </div>

                    {u.id !== user?.id && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => {
                            if (selectedLeaderGameId !== 'all') {
                              setGhostDuelTarget({
                                id: u.id,
                                name: u.displayName || u.username || 'مقاتل',
                                targetScoreToBeat: Math.max(200, gameScoreVal),
                                stake: selectedStake
                              });
                              setActiveStoryChapter(null);
                              setActiveVisualGame(selectedLeaderGameId);
                            } else {
                              handleDirectChallengeUser(u, true);
                            }
                          }}
                          className="bg-[#FF1744] text-white px-3 py-1.5 rounded-xl text-[11px] font-black cursor-pointer"
                        >
                          انزله 🗡️
                        </button>
                        <button
                          onClick={() => handleDirectChallengeUser(u, false)}
                          className="bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer"
                        >
                          غرفة 🥊
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
