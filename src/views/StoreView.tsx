import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { 
  ArrowRight, Check, RefreshCw, Trophy, Crown, Coins, Bookmark, Lock, Sparkles, Shield, Star, Award,
  Flame, Zap, MessageSquare, Gift, Search, Filter, TrendingUp, Heart, Eye, Clock, Send, X, CheckCircle2, AlertCircle
} from 'lucide-react';
import { doc, updateDoc, increment, arrayUnion, collection, query, where, getDocs, addDoc, serverTimestamp, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { notificationsService } from '../services/notificationsService';
import { 
  STORE_ITEMS_SORTED, 
  StoreItem, 
  StoreRarity,
  ValuationGrade,
  RARITY_META,
  GRADE_META,
  getAvatarShapeClass,
  isBadgeUnlocked,
  getBadgeRequirementDesc,
  isTitleUnlocked,
  evaluateSeasonalStoreItems,
  getDailyFlashDeals
} from '../data/storeItems';

interface StoreViewProps {
  onBack: () => void;
}

type MainTab = 'seasonal' | 'avatar' | 'banner' | 'frame' | 'aura' | 'comment_card' | 'booster' | 'inventory';

// Standardized highly-crafted geometric avatar frame component with optional Energy Aura
export const GeometricAvatar = ({ 
  avatarUrl, 
  frame, 
  aura,
  size = 'w-16 h-16' 
}: { 
  avatarUrl: string;
  frame?: StoreItem | null;
  aura?: StoreItem | null;
  size?: string;
}) => {
  const shapeClass = getAvatarShapeClass(frame?.avatarShape);
  
  return (
    <div className={`relative ${size} flex items-center justify-center select-none`}>
      {/* Energy Aura Ring */}
      {aura && (
        <div
          className={`absolute -inset-2.5 rounded-full pointer-events-none z-0 opacity-90 transition-all duration-500 ${aura.auraStyle || ''} bg-gradient-to-tr ${aura.auraGradient || 'from-purple-500/40 to-amber-500/40'} blur-[4px]`}
        />
      )}

      {!frame ? (
        <div className={`relative z-10 w-full h-full rounded-full overflow-hidden border-2 border-neutral-800 bg-neutral-950 shadow-inner`}>
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        </div>
      ) : ['hexagon', 'octagon', 'triangle', 'rhombus'].includes(frame.avatarShape || '') ? (
        <div className={`relative z-10 w-full h-full flex items-center justify-center`}>
          <div className={`absolute inset-0 ${shapeClass} ${frame.frameStyle || 'bg-purple-500'} flex items-center justify-center p-[3px] shadow-lg`}>
            <div className={`w-full h-full ${shapeClass} bg-black p-[2px]`}>
              <div className={`w-full h-full ${shapeClass} overflow-hidden bg-neutral-950`}>
                <img 
                  src={avatarUrl} 
                  alt="" 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer" 
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={`relative z-10 w-full h-full flex items-center justify-center`}>
          <div className={`w-full h-full ${shapeClass} overflow-hidden border-2 border-black relative bg-neutral-950 shadow-md`}>
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <div className={`absolute inset-[-3.5px] ${shapeClass} pointer-events-none ring-[3px] ring-offset-1 ring-offset-black ${frame.frameStyle}`} />
        </div>
      )}
    </div>
  );
};

// Popularity & Valuation Strip rendered on EVERY Store Item
const ValuationStrip = ({ item, compact = false }: { item: StoreItem; compact?: boolean }) => {
  const gradeInfo = GRADE_META[item.valuationGrade || 'A'] || GRADE_META['A'];
  const rarityInfo = RARITY_META[item.rarity || 'common'] || RARITY_META['common'];

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-1 text-[8px] font-black bg-black/75 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10">
        <div className="flex items-center gap-1">
          <span className={`px-1.5 py-0.2 rounded border text-[7.5px] font-black ${gradeInfo.badgeClass}`}>
            {item.valuationGrade}
          </span>
          <span className={`${rarityInfo.color}`}>{rarityInfo.label}</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-neutral-300">
          <span className="flex items-center gap-0.5 text-amber-400">
            <Star size={8} className="fill-amber-400" />
            {item.animeScore}
          </span>
          <span className="text-emerald-400">{item.popularityIndex}%</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-neutral-950/90 border border-neutral-800/80 rounded-xl p-2 space-y-1.5">
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          <span className={`px-1.5 py-0.5 rounded-md border text-[8px] font-black tracking-wider ${gradeInfo.badgeClass}`}>
            {item.valuationGrade}
          </span>
          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md border ${rarityInfo.bg} ${rarityInfo.color} ${rarityInfo.border}`}>
            {rarityInfo.label}
          </span>
        </div>
        <span className="text-[8px] font-bold text-neutral-300 bg-neutral-900 px-1.5 py-0.5 rounded">
          {item.marketDemand}
        </span>
      </div>

      {/* Popularity progress bar & metrics */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[8px] font-bold">
          <span className="text-neutral-400 flex items-center gap-0.5">
            <TrendingUp size={9} className="text-emerald-400" />
            مؤشر الشعبية والتقدير:
          </span>
          <div className="flex items-center gap-2 font-mono">
            <span className="text-amber-400 flex items-center gap-0.5">
              <Star size={8} className="fill-amber-400" />
              {item.animeScore}/10
            </span>
            <span className="text-rose-400 flex items-center gap-0.5">
              <Heart size={8} className="fill-rose-400" />
              {(item.favoritesCount || 1500).toLocaleString()}
            </span>
            <span className="text-emerald-400 font-black">{item.popularityIndex}%</span>
          </div>
        </div>
        <div className="w-full h-1.5 bg-neutral-900 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-l from-rose-500 via-amber-400 to-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, item.popularityIndex || 80)}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default function StoreView({ onBack }: StoreViewProps) {
  const { user, userData } = useAuth();
  
  const coins = userData?.coins || 0;
  const userLevel = userData?.level || 1;
  const purchasedItems: string[] = userData?.purchasedItems || [];

  // Active equips
  const equippedBannerId = userData?.equippedBanner || null;
  const equippedAvatarId = userData?.equippedAvatar || null;
  const equippedFrameId = userData?.equippedFrame || null;
  const equippedAuraId = userData?.equippedAura || null;
  const equippedCommentCardId = userData?.equippedCommentCard || null;
  const equippedTitleId = userData?.equippedTitle || null;
  const equippedBadgeId = userData?.equippedBadge || null;

  const [activeTab, setActiveTab] = useState<MainTab>('seasonal');
  const [inventorySubTab, setInventorySubTab] = useState<'avatar' | 'banner' | 'frame' | 'aura' | 'comment_card' | 'title' | 'badge'>('avatar');
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const isPurchasingRef = useRef(false);

  // Seasonal Dynamic Store State
  const [seasonalItems, setSeasonalItems] = useState<StoreItem[]>([]);
  const [seasonLabel, setSeasonLabel] = useState<string>('الموسم الحالي');
  const [loadingSeasonal, setLoadingSeasonal] = useState<boolean>(true);
  const [seasonalSubFilter, setSeasonalSubFilter] = useState<'all' | 'avatar' | 'banner' | 'special'>('all');

  // Search, Sort & Valuation Filters (applies across all tabs)
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState<'ALL' | ValuationGrade>('ALL');
  const [sortBy, setSortBy] = useState<'popularity' | 'score' | 'level_asc' | 'price_asc' | 'price_desc'>('popularity');

  // Live element preview config
  const [previewItem, setPreviewItem] = useState<StoreItem | null>(null);

  // Toast feedback
  const [storeNotice, setStoreNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Gifting Modal State
  const [giftModalItem, setGiftModalItem] = useState<StoreItem | null>(null);
  const [giftSearchInput, setGiftSearchInput] = useState('');
  const [giftSearchResults, setGiftSearchResults] = useState<any[]>([]);
  const [searchingRecipient, setSearchingRecipient] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<any | null>(null);
  const [sendingGift, setSendingGift] = useState(false);

  const showToast = (type: 'success' | 'error', text: string) => {
    setStoreNotice({ type, text });
    setTimeout(() => setStoreNotice(null), 4000);
  };

  // Load current season anime & characters and evaluate them
  useEffect(() => {
    let mounted = true;
    const fetchSeasonalStore = async () => {
      try {
        setLoadingSeasonal(true);
        const res = await fetch('/api/store/seasonal');
        const json = await res.json();
        if (mounted && json?.data) {
          const evaluated = evaluateSeasonalStoreItems(json.data);
          setSeasonalItems(evaluated);
          if (json.data.seasonLabel) {
            setSeasonLabel(json.data.seasonLabel);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch seasonal store feed:', err);
      } finally {
        if (mounted) setLoadingSeasonal(false);
      }
    };
    fetchSeasonalStore();
    return () => {
      mounted = false;
    };
  }, []);

  // Combined master catalog (Static + Dynamic Seasonal items)
  const allCatalogItems = useMemo(() => {
    const map = new Map<string, StoreItem>();
    STORE_ITEMS_SORTED.forEach(item => map.set(item.id, item));
    seasonalItems.forEach(item => map.set(item.id, item));
    return Array.from(map.values());
  }, [seasonalItems]);

  // Daily Flash Deals
  const flashDeals = useMemo(() => {
    return getDailyFlashDeals(allCatalogItems);
  }, [allCatalogItems]);

  // Helper check ownership or dynamic qualification
  const isItemOwnedOrUnlocked = useCallback((item: StoreItem): boolean => {
    if (item.type === 'title') {
      return isTitleUnlocked(item, userData);
    }
    if (item.type === 'badge') {
      return isBadgeUnlocked(item.id, userData);
    }
    if (item.type === 'booster') {
      return false; // Boosters are repeatable consumables
    }
    return purchasedItems.includes(item.id);
  }, [userData, purchasedItems]);

  // Check if item has a flash deal price today
  const getEffectivePrice = useCallback((item: StoreItem): { price: number; originalPrice?: number; discountPercent?: number } => {
    const deal = flashDeals.find(d => d.item.id === item.id);
    if (deal) {
      return {
        price: deal.discountedPrice,
        originalPrice: deal.originalPrice,
        discountPercent: deal.discountPercent
      };
    }
    return { price: item.price };
  }, [flashDeals]);

  // Master lists filtered & sorted by valuation/popularity
  const filteredItems = useMemo(() => {
    let baseList: StoreItem[] = [];

    if (activeTab === 'seasonal') {
      baseList = seasonalItems.length > 0 ? [...seasonalItems] : allCatalogItems.slice(0, 18);
      if (seasonalSubFilter === 'avatar') baseList = baseList.filter(i => i.type === 'avatar');
      else if (seasonalSubFilter === 'banner') baseList = baseList.filter(i => i.type === 'banner');
      else if (seasonalSubFilter === 'special') baseList = baseList.filter(i => i.type === 'frame' || i.type === 'aura' || i.type === 'comment_card');
    } else if (activeTab === 'avatar') {
      baseList = allCatalogItems.filter(i => i.type === 'avatar');
    } else if (activeTab === 'banner') {
      baseList = allCatalogItems.filter(i => i.type === 'banner');
    } else if (activeTab === 'frame') {
      baseList = allCatalogItems.filter(i => i.type === 'frame');
    } else if (activeTab === 'aura') {
      baseList = allCatalogItems.filter(i => i.type === 'aura');
    } else if (activeTab === 'comment_card') {
      baseList = allCatalogItems.filter(i => i.type === 'comment_card');
    } else if (activeTab === 'booster') {
      baseList = allCatalogItems.filter(i => i.type === 'booster');
    } else if (activeTab === 'inventory') {
      baseList = allCatalogItems.filter(i => i.type === inventorySubTab && isItemOwnedOrUnlocked(i));
    }

    // Apply Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      baseList = baseList.filter(i => 
        i.name.toLowerCase().includes(q) || 
        (i.animeOrigin && i.animeOrigin.toLowerCase().includes(q)) ||
        (i.desc && i.desc.toLowerCase().includes(q))
      );
    }

    // Apply Valuation Grade Filter
    if (gradeFilter !== 'ALL') {
      baseList = baseList.filter(i => i.valuationGrade === gradeFilter);
    }

    // Apply Sort
    return baseList.sort((a, b) => {
      if (sortBy === 'popularity') {
        if ((b.popularityIndex || 0) !== (a.popularityIndex || 0)) {
          return (b.popularityIndex || 0) - (a.popularityIndex || 0);
        }
        return (b.animeScore || 0) - (a.animeScore || 0);
      }
      if (sortBy === 'score') {
        if ((b.animeScore || 0) !== (a.animeScore || 0)) {
          return (b.animeScore || 0) - (a.animeScore || 0);
        }
        return (b.popularityIndex || 0) - (a.popularityIndex || 0);
      }
      if (sortBy === 'price_asc') return a.price - b.price;
      if (sortBy === 'price_desc') return b.price - a.price;
      // Default level_asc
      const levelA = a.minLevel || 1;
      const levelB = b.minLevel || 1;
      if (levelA !== levelB) return levelA - levelB;
      return a.price - b.price;
    });
  }, [activeTab, seasonalItems, allCatalogItems, seasonalSubFilter, inventorySubTab, searchQuery, gradeFilter, sortBy, isItemOwnedOrUnlocked]);

  // Preview Plaque calculations (including Aura and Comment Card live preview)
  const previewData = useMemo(() => {
    const mockBanner = previewItem?.type === 'banner' ? previewItem : allCatalogItems.find(i => i.id === equippedBannerId) || null;
    const mockAvatar = previewItem?.type === 'avatar' ? previewItem : allCatalogItems.find(i => i.id === equippedAvatarId) || null;
    const mockFrame = previewItem?.type === 'frame' ? previewItem : allCatalogItems.find(i => i.id === equippedFrameId) || null;
    const mockAura = previewItem?.type === 'aura' ? previewItem : allCatalogItems.find(i => i.id === equippedAuraId) || null;
    const mockCommentCard = previewItem?.type === 'comment_card' ? previewItem : allCatalogItems.find(i => i.id === equippedCommentCardId) || null;
    const mockTitle = previewItem?.type === 'title' ? previewItem : allCatalogItems.find(i => i.id === equippedTitleId) || null;
    const mockBadge = previewItem?.type === 'badge' ? previewItem : allCatalogItems.find(i => i.id === equippedBadgeId) || null;

    return {
      bannerUrl: mockBanner?.img || '',
      avatarUrl: mockAvatar?.img || userData?.photoURL || "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
      bannerObj: mockBanner,
      avatarObj: mockAvatar,
      frameObj: mockFrame,
      auraObj: mockAura,
      commentCardObj: mockCommentCard,
      titleObj: mockTitle,
      badgeObj: mockBadge
    };
  }, [previewItem, allCatalogItems, equippedBannerId, equippedAvatarId, equippedFrameId, equippedAuraId, equippedCommentCardId, equippedTitleId, equippedBadgeId, userData]);

  // Purchase handler for cosmetics & tactical boosters
  const handlePurchase = async (item: StoreItem) => {
    const { price: effectivePrice } = getEffectivePrice(item);
    if (!user || coins < effectivePrice || isPurchasingRef.current) return;
    if (item.type !== 'booster' && purchasedItems.includes(item.id)) return;
    if (item.minLevel && userLevel < item.minLevel) return;

    try {
      isPurchasingRef.current = true;
      setPurchasing(item.id);
      
      const updates: Record<string, any> = {
        coins: increment(-effectivePrice),
      };

      if (item.type === 'booster') {
        const now = Date.now();
        if (item.boosterKey === 'doubleXpUntil') {
          const currentEnd = Math.max(now, userData?.doubleXpUntil || 0);
          updates.doubleXpUntil = currentEnd + (item.boosterDurationHours || 24) * 3600 * 1000;
        } else if (item.boosterKey === 'doubleCoinsUntil') {
          const currentEnd = Math.max(now, userData?.doubleCoinsUntil || 0);
          updates.doubleCoinsUntil = currentEnd + (item.boosterDurationHours || 24) * 3600 * 1000;
        } else if (item.boosterKey === 'streakShieldCount') {
          updates.streakShieldCount = increment(item.boosterAmount || 1);
        } else if (item.boosterKey === 'antiCheatHintCount') {
          updates.antiCheatHintCount = increment(item.boosterAmount || 2);
        } else if (item.boosterKey === 'staminaRefill') {
          updates.xp = increment(150);
          updates.aiGamesPoints = increment(50);
        }
        await updateDoc(doc(db, 'users', user.id), updates);
        showToast('success', `⚡ تم تفعيل "${item.name}" في حسابك بنجاح!`);
      } else {
        updates.purchasedItems = arrayUnion(item.id);
        await updateDoc(doc(db, 'users', user.id), updates);
        setPreviewItem(item);
        showToast('success', `🎉 تم اقتناء "${item.name}" (التقدير ${item.valuationGrade}) بنجاح!`);
      }
    } catch (e) {
      console.error('Failed to buy item:', e);
      showToast('error', 'حدث خطأ أثناء إتمام عملية الشراء.');
    } finally {
      isPurchasingRef.current = false;
      setPurchasing(null);
    }
  };

  // Toggle Equip triggers
  const handleEquipToggle = async (item: StoreItem, forceUnequip = false) => {
    if (!user) return;
    if (!isItemOwnedOrUnlocked(item) && !forceUnequip) return; 

    const key = item.type === 'banner' ? 'equippedBanner' :
                item.type === 'avatar' ? 'equippedAvatar' :
                item.type === 'frame' ? 'equippedFrame' :
                item.type === 'aura' ? 'equippedAura' :
                item.type === 'comment_card' ? 'equippedCommentCard' :
                item.type === 'title' ? 'equippedTitle' :
                item.type === 'badge' ? 'equippedBadge' : null;
    if (!key) return;

    try {
      await updateDoc(doc(db, 'users', user.id), {
        [key]: forceUnequip ? null : item.id
      });
      if (previewItem?.id === item.id && forceUnequip) {
        setPreviewItem(null);
      }
      showToast('success', forceUnequip ? `تم إلغاء تجهيز "${item.name}"` : `✨ تم تجهيز "${item.name}" في هويتك!`);
    } catch (err) {
      console.error('Failed toggling item equip:', err);
    }
  };

  // Search users for Gifting
  const handleSearchRecipient = async () => {
    const clean = giftSearchInput.trim();
    if (!clean || clean.length < 2) return;
    setSearchingRecipient(true);
    try {
      const lower = clean.toLowerCase().replace(/^@/, '');
      const qByUsername = query(collection(db, 'users'), where('username', '>=', lower), where('username', '<=', lower + '\uf8ff'), limit(5));
      const snap1 = await getDocs(qByUsername);
      const listMap = new Map<string, any>();
      snap1.docs.forEach(d => {
        if (d.id !== user?.id) listMap.set(d.id, { id: d.id, ...d.data() });
      });

      if (listMap.size < 3) {
        const qByName = query(collection(db, 'users'), where('displayName', '>=', clean), where('displayName', '<=', clean + '\uf8ff'), limit(5));
        const snap2 = await getDocs(qByName);
        snap2.docs.forEach(d => {
          if (d.id !== user?.id) listMap.set(d.id, { id: d.id, ...d.data() });
        });
      }
      setGiftSearchResults(Array.from(listMap.values()));
    } catch (err) {
      console.error('Error searching gift recipient:', err);
    } finally {
      setSearchingRecipient(false);
    }
  };

  // Send Gift to another member
  const handleSendGift = async () => {
    if (!user || !giftModalItem || !selectedRecipient || sendingGift) return;
    const { price: effectivePrice } = getEffectivePrice(giftModalItem);
    if (coins < effectivePrice) {
      showToast('error', 'رصيد الكوينز غير كافٍ لإرسال هذه الهدية.');
      return;
    }

    const recipientOwned: string[] = selectedRecipient.purchasedItems || [];
    if (recipientOwned.includes(giftModalItem.id)) {
      showToast('error', 'هذا العضو يمتلك هذا العنصر بالفعل في حقيبته!');
      return;
    }

    setSendingGift(true);
    try {
      // 1. Deduct coins from sender
      await updateDoc(doc(db, 'users', user.id), {
        coins: increment(-effectivePrice)
      });

      // 2. Grant item to recipient
      await updateDoc(doc(db, 'users', selectedRecipient.id), {
        purchasedItems: arrayUnion(giftModalItem.id)
      });

      // 3. Log gift transaction
      await addDoc(collection(db, 'storeGiftLogs'), {
        senderId: user.id,
        senderName: userData?.displayName || user.displayName || 'أوتاكو',
        recipientId: selectedRecipient.id,
        recipientName: selectedRecipient.displayName || 'عضو',
        itemId: giftModalItem.id,
        itemName: giftModalItem.name,
        valuationGrade: giftModalItem.valuationGrade,
        price: effectivePrice,
        createdAt: serverTimestamp()
      });

      // 4. Send notification to recipient
      await notificationsService.createUserNotification(selectedRecipient.id, {
        title: '🎁 وصلتك هدية فاخرة من المتجر!',
        body: `أهدى إليك ${userData?.displayName || user.displayName || 'صديقك'} عنصر "${giftModalItem.name}" بتقدير [${giftModalItem.valuationGrade}]! تفقد حقيبتك الآن.`,
        type: 'reward',
        linkTo: 'store'
      });

      showToast('success', `🎁 تم إرسال "${giftModalItem.name}" كهدية إلى ${selectedRecipient.displayName || selectedRecipient.username}!`);
      setGiftModalItem(null);
      setSelectedRecipient(null);
      setGiftSearchResults([]);
      setGiftSearchInput('');
    } catch (err) {
      console.error('Failed to send gift:', err);
      showToast('error', 'تعذر إرسال الهدية حالياً، حاول مجدداً.');
    } finally {
      setSendingGift(false);
    }
  };

  return (
    <div className="min-h-screen bg-black pb-36 font-sans text-right select-none max-w-xl mx-auto border-x border-neutral-900 relative shadow-[0_0_50px_rgba(0,0,0,0.8)]" dir="rtl">
      
      {/* Dynamic Ambient Blur background */}
      <div className="absolute top-0 inset-x-0 h-96 bg-gradient-to-b from-purple-900/15 via-rose-900/10 to-transparent blur-3xl pointer-events-none" />

      {/* Toast Notification Banner */}
      {storeNotice && (
        <div className="fixed top-4 inset-x-4 max-w-md mx-auto z-50 animate-fadeIn">
          <div className={`px-4 py-3 rounded-2xl border shadow-2xl flex items-center gap-2.5 text-xs font-black backdrop-blur-xl ${
            storeNotice.type === 'success' 
              ? 'bg-emerald-950/95 border-emerald-500/40 text-emerald-300' 
              : 'bg-rose-950/95 border-rose-500/40 text-rose-300'
          }`}>
            {storeNotice.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{storeNotice.text}</span>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="p-4 space-y-5 relative z-10">

        {/* Premium Integrated Header and Level status */}
        <div className="flex items-center justify-between gap-4 bg-zinc-950/60 p-4 border border-neutral-900 rounded-2xl">
          <div className="flex items-center gap-3">
            <button 
              onClick={onBack}
              className="p-2 bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white rounded-xl transition cursor-pointer active:scale-95"
              title="رجوع"
              aria-label="رجوع"
            >
              <ArrowRight size={18} />
            </button>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-white font-black text-lg bg-gradient-to-l from-yellow-500 via-amber-300 to-rose-400 bg-clip-text text-transparent">
                  بورصة ومتجر الأوتاكو
                </h1>
                <span className="text-[8px] bg-rose-500/15 border border-rose-500/30 text-rose-400 px-1.5 py-0.5 rounded-full font-black">
                  تقييم حي للشعبية
                </span>
              </div>
              <span className="text-[9px] text-neutral-400 block leading-tight mt-0.5">
                جميع العناصر تخضع للتقييم والتقدير (SSS+ إلى B) حسب شعبية الأنمي والشخصية
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="bg-purple-950/40 border border-purple-500/20 px-2.5 py-1.5 rounded-xl text-purple-400 text-xs font-black font-mono">
              LV: {userLevel}
            </div>
            <div className="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-1.5 rounded-xl text-yellow-500 text-xs font-black font-mono">
              <Coins size={12} className="text-yellow-500 animate-pulse" />
              <span>{coins.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* PROFILE & COMMENT CARD PREVIEW PLAQUE */}
        <section className="relative group bg-[#050508] border border-neutral-900 rounded-2xl p-4 overflow-hidden shadow-2xl space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase font-black text-purple-400 tracking-wider flex items-center gap-1">
              <Sparkles size={12} className="text-amber-400 animate-pulse" />
              لوحة المحاكاة الحية للهوية والتقدير
            </span>
            <div className="flex items-center gap-2">
              {previewItem && (
                <span className={`text-[8px] font-black px-2 py-0.5 rounded border ${GRADE_META[previewItem.valuationGrade || 'A'].badgeClass}`}>
                  معاينة: {previewItem.name} [{previewItem.valuationGrade}]
                </span>
              )}
              {previewItem && (
                <button 
                  onClick={() => setPreviewItem(null)}
                  className="text-[9px] text-[#aaaaaa] hover:text-white bg-neutral-950 border border-neutral-900 px-2 py-0.5 rounded transition cursor-pointer"
                >
                  إلغاء ✕
                </button>
              )}
            </div>
          </div>

          <div className="h-32 rounded-xl overflow-hidden relative border border-neutral-900 bg-black shadow-inner">
            {previewData.bannerUrl ? (
              <div 
                className={`absolute inset-0 w-full h-full bg-cover bg-center transition-all duration-500 ${previewData.bannerObj?.imageStyle || ''}`}
                style={{ backgroundImage: `url(${previewData.bannerUrl})` }}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-950 opacity-40" />
            )}
            
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/20 z-10" />
            
            {/* Equipping avatar + frame + aura preview block */}
            <div className="absolute bottom-3 right-4 flex items-center gap-3.5 z-20">
              <GeometricAvatar 
                avatarUrl={previewData.avatarUrl} 
                frame={previewData.frameObj} 
                aura={previewData.auraObj}
                size="w-14 h-14" 
              />
              
              <div className="text-right space-y-0.5">
                <h3 className={`text-xs font-black tracking-tight flex items-center gap-1 ${previewData.titleObj ? previewData.titleObj.color : 'text-white'}`}>
                  <span>{userData?.displayName || 'العضو النبيل'}</span>
                  {previewData.titleObj && previewData.titleObj.icon && <previewData.titleObj.icon size={11} className="inline-block" />}
                </h3>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] text-neutral-400 font-bold font-mono">@{userData?.username || 'otaku_core'}</span>
                  <span className="text-[8px] bg-purple-500/10 border border-purple-500/20 text-purple-400 px-1 rounded font-mono font-black">Lvl {userLevel}</span>
                  {previewData.auraObj && (
                    <span className="text-[7.5px] bg-rose-500/20 border border-rose-500/30 text-rose-300 px-1.5 rounded-full font-black">
                      ✨ {previewData.auraObj.name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Award badge displays */}
            {previewData.badgeObj && (
              <div className="absolute bottom-3 left-4 bg-black/75 border border-amber-500/20 px-2 py-0.5 rounded-lg z-20 flex items-center gap-1.5 select-none shadow-lg">
                {previewData.badgeObj.icon && React.createElement(previewData.badgeObj.icon, { size: 10, className: previewData.badgeObj.color })}
                <span className={`text-[8px] font-black ${previewData.badgeObj.color}`}>{previewData.badgeObj.name}</span>
              </div>
            )}
          </div>

          {/* Simulated Comment Card Preview when previewing or equipping a Comment Card */}
          {previewData.commentCardObj && (
            <div className={`p-3 rounded-xl transition-all duration-300 ${previewData.commentCardObj.commentCardStyle || 'bg-neutral-900 border border-neutral-800'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-black text-white flex items-center gap-1">
                  <MessageSquare size={10} className="text-purple-400" />
                  معاينة بطاقة التعليقات: {previewData.commentCardObj.name}
                </span>
                <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-black/60 text-amber-300 border border-amber-500/30">
                  {previewData.commentCardObj.commentCardBadge}
                </span>
              </div>
              <p className="text-[10px] text-neutral-200 font-bold">
                "هذه الحلقات الأخيرة من الموسم كانت أسطورية بكل المقاييس! التحريك والقتال فوق الخيال 🔥"
              </p>
            </div>
          )}
        </section>

        {/* DAILY FLASH DEALS (عروض البرق اليومية) */}
        {userLevel >= 5 && flashDeals.length > 0 && activeTab !== 'inventory' && (
          <section className="bg-gradient-to-l from-amber-950/30 via-rose-950/25 to-purple-950/30 border border-amber-500/30 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Zap size={14} className="text-amber-400 fill-amber-400 animate-bounce" />
                <h2 className="text-xs font-black text-white">عروض البرق اليومية (تخفيضات حتى 50%)</h2>
              </div>
              <span className="text-[8.5px] font-mono font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Clock size={9} />
                تتجدد يومياً
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {flashDeals.map(({ item, originalPrice, discountedPrice, discountPercent }) => {
                const owned = isItemOwnedOrUnlocked(item);
                const locked = item.minLevel && userLevel < item.minLevel;
                return (
                  <div
                    key={`deal_${item.id}`}
                    onClick={() => setPreviewItem(item)}
                    className="bg-black/80 border border-amber-500/20 hover:border-amber-400/50 rounded-xl p-2 flex flex-col justify-between cursor-pointer transition relative overflow-hidden group"
                  >
                    <div className="flex items-center justify-between gap-1 mb-1.5 z-10">
                      <span className="text-[8px] font-black bg-rose-600 text-white px-1.5 py-0.2 rounded-full">
                        -{discountPercent}%
                      </span>
                      <span className={`text-[7.5px] font-black px-1 rounded border ${GRADE_META[item.valuationGrade].badgeClass}`}>
                        {item.valuationGrade}
                      </span>
                    </div>

                    {item.img ? (
                      <div className="h-12 w-full rounded-lg overflow-hidden mb-1.5 bg-neutral-900">
                        <img src={item.img} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition" referrerPolicy="no-referrer" />
                      </div>
                    ) : (
                      <div className="h-12 w-full rounded-lg bg-neutral-900/90 flex items-center justify-center mb-1.5">
                        {item.icon ? React.createElement(item.icon, { size: 18, className: item.color || 'text-amber-400' }) : <Sparkles size={18} className="text-amber-400" />}
                      </div>
                    )}

                    <h4 className="text-[9px] font-black text-white truncate">{item.name}</h4>
                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-white/10">
                      <div className="flex items-center gap-1 font-mono">
                        <span className="text-[8px] text-neutral-500 line-through">{originalPrice}</span>
                        <span className="text-[9px] text-yellow-400 font-black">{discountedPrice}🪙</span>
                      </div>
                      {owned ? (
                        <span className="text-[7.5px] text-emerald-400 font-black">مملوك ✓</span>
                      ) : (
                        <button
                          disabled={coins < discountedPrice || locked || purchasing !== null}
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePurchase(item);
                          }}
                          className={`px-2 py-0.5 rounded text-[8px] font-black ${
                            coins >= discountedPrice && !locked
                              ? 'bg-amber-400 text-black hover:bg-amber-300 cursor-pointer'
                              : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                          }`}
                        >
                          اقتناء
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Dynamic Store Categories / Tabs */}
        <section className="bg-neutral-950 p-1.5 rounded-2xl border border-neutral-900 grid grid-cols-4 sm:grid-cols-8 gap-1">
          {[
            { id: 'seasonal', label: 'موسمي حي', emoji: '🔥' },
            { id: 'avatar', label: 'صور الحساب', emoji: '👤' },
            { id: 'banner', label: 'أغلفة', emoji: '🌌' },
            { id: 'frame', label: 'إطارات', emoji: '🖼️' },
            { id: 'aura', label: 'هالات الطاقة', emoji: '✨' },
            { id: 'comment_card', label: 'بطاقات النقاش', emoji: '💬' },
            { id: 'booster', label: 'معززات', emoji: '⚡' },
            { id: 'inventory', label: 'الحقيبة', emoji: '🎒' }
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as MainTab);
                  setPreviewItem(null);
                }}
                className={`py-2 px-1 rounded-xl text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  isActive 
                    ? 'bg-gradient-to-b from-purple-950/80 to-neutral-900 border border-purple-500/40 text-white shadow-lg shadow-purple-950/30' 
                    : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50'
                }`}
              >
                <span className="text-sm leading-none">{tab.emoji}</span>
                <span className="text-[8.5px] font-black whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
        </section>

        {/* UNIVERSAL POPULARITY & VALUATION FILTER BAR */}
        <section className="bg-neutral-950/90 border border-neutral-900 rounded-2xl p-3 space-y-2.5">
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Search Box */}
            <div className="relative flex-1">
              <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث باسم الشخصية، الأنمي، الإطار، أو العنصر..."
                className="w-full bg-black border border-neutral-800 focus:border-purple-500/50 rounded-xl pr-8 pl-3 py-1.5 text-[10px] text-white placeholder:text-neutral-600 outline-none"
              />
            </div>

            {/* Sort Selector */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-black border border-neutral-800 rounded-xl px-2.5 py-1.5 text-[10px] font-bold text-neutral-300 outline-none cursor-pointer"
            >
              <option value="popularity">🔥 الأعلى شعبية وتقديراً</option>
              <option value="score">⭐ الأعلى تقييماً للأنمي</option>
              <option value="level_asc">🔓 المستوى (من الأقل للأعلى)</option>
              <option value="price_asc">🪙 السعر (من الأرخص للأغلى)</option>
              <option value="price_desc">💎 السعر (من الأغلى للأرخص)</option>
            </select>
          </div>

          {/* Valuation Grade Pills (SSS+, SS, S, A+, A, B) */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
            <span className="text-[8.5px] text-neutral-500 font-bold ml-1 shrink-0">فئة التقدير:</span>
            {(['ALL', 'SSS+', 'SS', 'S', 'A+', 'A', 'B'] as const).map((g) => {
              const active = gradeFilter === g;
              return (
                <button
                  key={g}
                  onClick={() => setGradeFilter(g)}
                  className={`px-2.5 py-1 rounded-lg text-[8.5px] font-black transition cursor-pointer shrink-0 border ${
                    active
                      ? 'bg-purple-600 text-white border-purple-400 shadow'
                      : 'bg-black text-neutral-400 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  {g === 'ALL' ? 'الكل 🌟' : `تقدير ${g}`}
                </button>
              );
            })}
          </div>
        </section>

        {/* Master Listings Area */}
        <div className="space-y-6">
          
          {userLevel < 5 && activeTab !== 'inventory' ? (
            <div className="p-8 text-center border border-neutral-900 rounded-3xl bg-zinc-950/60 backdrop-blur-md space-y-6 animate-fadeIn py-12">
              <div className="inline-flex p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.1)] animate-pulse">
                <Lock size={32} />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-white text-base font-black">متجر وبورصة الأوتاكو مغلق</h3>
                <p className="text-neutral-400 text-[10.5px] leading-relaxed max-w-sm mx-auto">
                  يفتح المتجر رسمياً عند بلوغ <span className="text-amber-400 font-bold">المستوى 5</span>. مستواك الحالي هو <span className="font-mono text-xs bg-neutral-900 px-1.5 py-0.5 rounded text-white">{userLevel}</span> ولديك متبقٍّ <span className="font-bold text-white">{5 - userLevel} مستويات</span> للوصول للقمة وتخصيص حسابك بكل فخامة.
                </p>
              </div>

              <div className="max-w-[12rem] mx-auto space-y-1">
                <div className="w-full bg-neutral-900 border border-neutral-800 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-gradient-to-l from-amber-500 to-yellow-400 h-full rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min(100, (userLevel / 5) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[8px] font-mono text-neutral-500">
                  <span>المستوى {userLevel}</span>
                  <span>المستوى 5 🗝️</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* SEASONAL DYNAMIC STORE TAB */}
              {activeTab === 'seasonal' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="bg-gradient-to-l from-rose-950/40 via-purple-950/30 to-black border border-rose-500/30 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Flame size={16} className="text-rose-500 fill-rose-500 animate-pulse" />
                          <h2 className="text-sm font-black text-white">إصدارات موسم {seasonLabel} الحية</h2>
                        </div>
                        <p className="text-[10px] text-neutral-400 mt-0.5">
                          تُضاف تلقائياً مع كل موسم جديد وتُقيّم أسعارها وتقديرها حسب شعبية الأنمي والشخصية في البورصة العالمية.
                        </p>
                      </div>
                      <span className="text-[9px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2.5 py-1 rounded-xl">
                        {seasonalItems.length} عنصر موسمي مقيّم
                      </span>
                    </div>

                    {/* Seasonal Sub-filter */}
                    <div className="flex gap-1.5 pt-1">
                      {[
                        { id: 'all', label: 'كل عناصر الموسم 🌟' },
                        { id: 'avatar', label: 'أبطال الموسم 👤' },
                        { id: 'banner', label: 'أغلفة الأنميات 🌌' },
                        { id: 'special', label: 'إصدارات الموسم الخاصة ✨' },
                      ].map(sf => (
                        <button
                          key={sf.id}
                          onClick={() => setSeasonalSubFilter(sf.id as any)}
                          className={`px-2.5 py-1 rounded-xl text-[9px] font-black transition cursor-pointer border ${
                            seasonalSubFilter === sf.id
                              ? 'bg-rose-600 text-white border-rose-400'
                              : 'bg-black/60 text-neutral-400 border-neutral-800 hover:text-white'
                          }`}
                        >
                          {sf.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {loadingSeasonal ? (
                    <div className="p-12 text-center border border-neutral-900 rounded-2xl bg-neutral-950/50 space-y-2">
                      <RefreshCw size={22} className="animate-spin text-rose-500 mx-auto" />
                      <p className="text-xs font-bold text-neutral-400">جاري جلب وتقييم عناصر الموسم الحالي حسب الشعبية...</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {filteredItems.map((item) => {
                        const isOwnedOrUnlocked = isItemOwnedOrUnlocked(item);
                        const levelLock = item.minLevel && userLevel < item.minLevel;
                        const { price: effectivePrice, originalPrice } = getEffectivePrice(item);
                        const isEquipped = [equippedAvatarId, equippedBannerId, equippedFrameId, equippedAuraId, equippedCommentCardId].includes(item.id);

                        return (
                          <div
                            key={item.id}
                            onClick={() => setPreviewItem(item)}
                            className="bg-neutral-950 border border-neutral-900 hover:border-rose-500/40 rounded-2xl overflow-hidden flex flex-col justify-between transition cursor-pointer shadow-xl group"
                          >
                            {/* Visual Header */}
                            <div className="h-36 w-full relative bg-black overflow-hidden">
                              {item.img ? (
                                <img
                                  src={item.img}
                                  alt={item.name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-950/60 via-black to-rose-950/60">
                                  <GeometricAvatar
                                    avatarUrl={userData?.photoURL || "https://api.dicebear.com/7.x/avataaars/svg?seed=Season"}
                                    frame={item.type === 'frame' ? item : undefined}
                                    aura={item.type === 'aura' ? item : undefined}
                                    size="w-16 h-16"
                                  />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-black/30 to-transparent" />

                              {/* Top Right Badges */}
                              <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
                                <span className="text-[8px] font-black bg-rose-600/90 text-white px-2 py-0.5 rounded-full shadow">
                                  🔥 {item.seasonTag || seasonLabel}
                                </span>
                                <span className={`text-[8px] font-black px-2 py-0.5 rounded-full backdrop-blur-md ${
                                  levelLock ? 'bg-rose-950/90 text-rose-400 border border-rose-900/40' : 'bg-black/70 text-emerald-400 border border-emerald-900/30'
                                }`}>
                                  LV {item.minLevel || 5}
                                </span>
                              </div>

                              {/* Gift Button (Top Left) */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setGiftModalItem(item);
                                }}
                                title="إهداء لصديق"
                                className="absolute top-2.5 left-2.5 z-10 p-1.5 rounded-full bg-black/70 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/30 transition cursor-pointer"
                              >
                                <Gift size={12} />
                              </button>

                              {/* Bottom Title inside image */}
                              <div className="absolute bottom-2 right-3 left-3 z-10">
                                <span className="text-[8px] text-amber-300 font-bold block truncate">
                                  {item.animeOrigin}
                                </span>
                                <h4 className="text-xs font-black text-white truncate">{item.name}</h4>
                              </div>
                            </div>

                            {/* Valuation & Actions Body */}
                            <div className="p-3 space-y-2.5">
                              <ValuationStrip item={item} />

                              <div className="flex items-center gap-2 pt-1">
                                {isOwnedOrUnlocked ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEquipToggle(item, isEquipped);
                                    }}
                                    className={`flex-1 py-2 rounded-xl text-[9.5px] font-black cursor-pointer transition ${
                                      isEquipped
                                        ? 'bg-emerald-950/90 text-emerald-400 border border-emerald-500/30'
                                        : 'bg-white text-black hover:bg-neutral-200'
                                    }`}
                                  >
                                    {isEquipped ? 'إلغاء التجهيز ✓' : 'تجهيز الآن'}
                                  </button>
                                ) : (
                                  <button
                                    disabled={coins < effectivePrice || levelLock || purchasing !== null}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePurchase(item);
                                    }}
                                    className={`flex-1 py-2 rounded-xl text-[9.5px] font-black transition cursor-pointer flex items-center justify-center gap-1 ${
                                      coins >= effectivePrice && !levelLock
                                        ? 'bg-yellow-500 text-black hover:bg-yellow-400'
                                        : 'bg-neutral-900 text-neutral-500 cursor-not-allowed border border-neutral-800'
                                    }`}
                                  >
                                    {purchasing === item.id ? (
                                      <RefreshCw size={10} className="animate-spin" />
                                    ) : (
                                      <>
                                        <span>اقتناء بـ</span>
                                        {originalPrice && <span className="line-through text-[8px] opacity-70">{originalPrice}</span>}
                                        <span className="font-mono">{effectivePrice}🪙</span>
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* AVATAR IMAGES TAB */}
              {activeTab === 'avatar' && (
                <div className="space-y-3 animate-fadeIn">
                  <h2 className="text-xs text-neutral-400 font-extrabold flex items-center justify-between">
                    <span>👤 صور الحساب الشخصية الفاخرة (مقيّمة حسب الشعبية)</span>
                    <span className="text-[9px] text-neutral-500">{filteredItems.length} شخصية</span>
                  </h2>
    
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {filteredItems.map((item) => {
                      const isOwnedOrUnlocked = isItemOwnedOrUnlocked(item);
                      const levelLock = item.minLevel && userLevel < item.minLevel;
                      const isEquipped = equippedAvatarId === item.id;
                      const { price: effectivePrice, originalPrice } = getEffectivePrice(item);
    
                      return (
                        <div 
                          key={item.id}
                          onClick={() => setPreviewItem(item)}
                          className="aspect-[4/5] bg-neutral-950 border border-neutral-900 rounded-[1.5rem] overflow-hidden relative group cursor-pointer transition hover:border-neutral-700 shadow-xl flex flex-col justify-end"
                        >
                          <img 
                            src={item.img} 
                            className="absolute inset-0 w-full h-full object-cover transition duration-500 group-hover:scale-105" 
                            alt={item.name}
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/15 z-10" />

                          {/* Level lock badge (Top Right) */}
                          <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1">
                            <span className={`text-[8px] font-black px-2 py-0.5 rounded-full backdrop-blur-md ${
                              levelLock ? 'bg-rose-950/90 text-rose-400 border border-rose-900/40' : 'bg-black/60 text-emerald-400 border border-emerald-900/20'
                            }`}>
                              LV {item.minLevel || 1}
                            </span>
                            {item.isSeasonal && (
                              <span className="text-[7.5px] font-black bg-rose-600 text-white px-1.5 py-0.5 rounded-full">
                                موسمي
                              </span>
                            )}
                          </div>

                          {/* Gift & Equipped (Top Left) */}
                          <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setGiftModalItem(item);
                              }}
                              title="إهداء لصديق"
                              className="p-1.5 rounded-full bg-black/70 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/30 transition cursor-pointer"
                            >
                              <Gift size={10} />
                            </button>
                            {isEquipped && (
                              <div className="bg-emerald-500 text-black p-1 rounded-full shadow animate-pulse">
                                <Check size={8} className="stroke-[4px]" />
                              </div>
                            )}
                          </div>

                          {/* Overlaid Valuation + Controls */}
                          <div className="relative z-20 p-2.5 space-y-1.5">
                            <h4 className="text-[10px] font-black text-white leading-tight truncate">{item.name}</h4>
                            <ValuationStrip item={item} compact />

                            <div className="pt-1">
                              {isOwnedOrUnlocked ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEquipToggle(item, isEquipped);
                                  }}
                                  className={`w-full py-1.5 rounded-xl text-[8.5px] font-black cursor-pointer transition ${
                                    isEquipped 
                                      ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/20' 
                                      : 'bg-white text-black hover:bg-neutral-200 font-black'
                                  }`}
                                >
                                  {isEquipped ? 'إلغاء التجهيز' : 'تجهيز المظهر'}
                                </button>
                              ) : (
                                <button
                                  disabled={coins < effectivePrice || levelLock || purchasing !== null}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePurchase(item);
                                  }}
                                  className={`w-full py-1.5 rounded-xl text-[8.5px] font-black transition cursor-pointer flex items-center justify-center gap-0.5 ${
                                    coins >= effectivePrice && !levelLock
                                      ? 'bg-yellow-500 text-black hover:bg-yellow-400 font-black'
                                      : 'bg-neutral-900 text-neutral-500 cursor-not-allowed'
                                  }`}
                                >
                                  {purchasing === item.id ? (
                                    <RefreshCw size={8} className="animate-spin" />
                                  ) : (
                                    <>
                                      <span>شراء بـ</span>
                                      {originalPrice && <span className="line-through text-[7.5px] opacity-70">{originalPrice}</span>}
                                      <span className="font-mono">{effectivePrice}🪙</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* COVERS / BANNERS TAB */}
              {activeTab === 'banner' && (
                <div className="space-y-3 animate-fadeIn">
                  <h2 className="text-xs text-neutral-400 font-extrabold flex items-center justify-between">
                    <span>🌌 أغلفة الملف الشخصي الحيوية (مقيّمة حسب شعبية الأنمي)</span>
                    <span className="text-[9px] text-neutral-500">{filteredItems.length} غلاف</span>
                  </h2>

                  <div className="space-y-4">
                    {filteredItems.map((item) => {
                      const isOwnedOrUnlocked = isItemOwnedOrUnlocked(item);
                      const levelLock = item.minLevel && userLevel < item.minLevel;
                      const isEquipped = equippedBannerId === item.id;
                      const { price: effectivePrice, originalPrice } = getEffectivePrice(item);

                      return (
                        <div 
                          key={item.id}
                          onClick={() => setPreviewItem(item)}
                          className="rounded-2xl overflow-hidden border border-neutral-900 bg-neutral-950 relative group cursor-pointer transition hover:border-neutral-700 shadow-xl"
                        >
                          <div className="h-32 sm:h-36 w-full relative overflow-hidden">
                            <img 
                              src={item.img} 
                              className="absolute inset-0 w-full h-full object-cover transition duration-500 group-hover:scale-105" 
                              alt={item.name} 
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/10 z-10" />

                            {/* Level lock badge (Top Right) */}
                            <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
                              <span className={`text-[8px] font-black px-2 py-0.5 rounded-full backdrop-blur-md ${
                                levelLock ? 'bg-rose-950/90 text-rose-400 border border-rose-900/40' : 'bg-black/60 text-emerald-400 border border-emerald-950/20'
                              }`}>
                                LV {item.minLevel || 1}
                              </span>
                              {item.isSeasonal && (
                                <span className="text-[8px] font-black bg-rose-600 text-white px-2 py-0.5 rounded-full">
                                  🔥 {item.seasonTag}
                                </span>
                              )}
                            </div>

                            {/* Gift & Equipped (Top Left) */}
                            <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setGiftModalItem(item);
                                }}
                                title="إهداء لصديق"
                                className="p-1.5 rounded-full bg-black/70 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/30 transition cursor-pointer"
                              >
                                <Gift size={11} />
                              </button>
                              {isEquipped && (
                                <div className="bg-emerald-500 text-black p-1 rounded-full shadow animate-pulse">
                                  <Check size={8} className="stroke-[4px]" />
                                </div>
                              )}
                            </div>

                            {/* Bottom row inside banner */}
                            <div className="absolute bottom-3 inset-x-3.5 flex items-end justify-between gap-4 z-20">
                              <div className="text-right">
                                <h4 className="text-xs font-black text-white drop-shadow-md">{item.name}</h4>
                              </div>

                              <div>
                                {isOwnedOrUnlocked ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEquipToggle(item, isEquipped);
                                    }}
                                    className={`px-3.5 py-1.5 rounded-xl text-[9px] font-black cursor-pointer transition ${
                                      isEquipped 
                                        ? 'bg-emerald-950/90 text-emerald-400 border border-emerald-500/30' 
                                        : 'bg-white text-black hover:bg-neutral-200'
                                    }`}
                                  >
                                    {isEquipped ? 'إلغاء التجهيز' : 'تجهيز'}
                                  </button>
                                ) : (
                                  <button
                                    disabled={coins < effectivePrice || levelLock || purchasing !== null}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePurchase(item);
                                    }}
                                    className={`px-3.5 py-1.5 rounded-xl text-[9px] font-black transition cursor-pointer flex items-center gap-0.5 ${
                                      coins >= effectivePrice && !levelLock
                                        ? 'bg-yellow-500 text-black hover:bg-yellow-400'
                                        : 'bg-neutral-900 text-neutral-500 cursor-not-allowed border border-neutral-900/50'
                                    }`}
                                  >
                                    {purchasing === item.id ? (
                                      <RefreshCw size={8} className="animate-spin text-black" />
                                    ) : (
                                      <>
                                        <span>شراء بـ</span>
                                        {originalPrice && <span className="line-through text-[7.5px] opacity-70">{originalPrice}</span>}
                                        <span className="font-mono">{effectivePrice}🪙</span>
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Valuation Bar Underneath Banner */}
                          <div className="p-2.5 bg-neutral-950">
                            <ValuationStrip item={item} compact />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* GEOMETRIC FRAMES TAB */}
              {activeTab === 'frame' && (
                <div className="space-y-3 animate-fadeIn">
                  <h2 className="text-xs text-neutral-400 font-extrabold flex items-center justify-between">
                    <span>🖼️ إطارات هندسية متقنة الصنع (مقيّمة حسب الندرة والشعبية)</span>
                    <span className="text-[9px] text-neutral-500">{filteredItems.length} إطار</span>
                  </h2>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {filteredItems.map((item) => {
                      const isOwnedOrUnlocked = isItemOwnedOrUnlocked(item);
                      const levelLock = item.minLevel && userLevel < item.minLevel;
                      const isEquipped = equippedFrameId === item.id;
                      const { price: effectivePrice, originalPrice } = getEffectivePrice(item);

                      const shapeNames: Record<string, string> = {
                        circle: "دائري",
                        square: "مربع",
                        squircle: "منحني",
                        hexagon: "سداسي",
                        octagon: "ثماني",
                        triangle: "ثلاثي",
                        rhombus: "معين"
                      };

                      return (
                        <div 
                          key={item.id}
                          onClick={() => setPreviewItem(item)}
                          className="bg-neutral-950 border border-neutral-900 rounded-[1.5rem] p-3 flex flex-col justify-between relative group cursor-pointer transition hover:border-neutral-700 shadow-xl min-h-[215px]"
                        >
                          <div className="flex items-center justify-between z-10">
                            <span className={`text-[7.5px] font-black px-1.5 py-0.5 rounded-full ${
                              levelLock ? 'bg-rose-950/90 text-rose-400 border border-rose-900/40' : 'bg-black/60 text-emerald-400 border border-emerald-950/30'
                            }`}>
                              LV {item.minLevel || 1}
                            </span>

                            <div className="flex items-center gap-1">
                              <span className="text-[7.5px] bg-purple-950/40 text-purple-400 px-1.5 py-0.5 rounded font-black">
                                {shapeNames[item.avatarShape || ''] || 'دائري'}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setGiftModalItem(item);
                                }}
                                title="إهداء لصديق"
                                className="p-1 rounded-full bg-neutral-900 hover:bg-purple-600 text-purple-300 hover:text-white transition cursor-pointer"
                              >
                                <Gift size={10} />
                              </button>
                            </div>
                          </div>

                          <div className="flex-1 flex items-center justify-center py-3 select-none">
                            <GeometricAvatar 
                              avatarUrl={userData?.photoURL || "https://api.dicebear.com/7.x/avataaars/svg?seed=Lucky"} 
                              frame={item} 
                              size="w-14 h-14" 
                            />
                          </div>

                          <div className="space-y-1.5">
                            <h4 className="text-[9.5px] font-black text-white text-center truncate">{item.name}</h4>
                            <ValuationStrip item={item} compact />
                          </div>

                          <div className="pt-2 border-t border-white/5 mt-2">
                            {isOwnedOrUnlocked ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEquipToggle(item, isEquipped);
                                }}
                                className={`w-full py-1.5 rounded-xl text-[8.5px] font-black cursor-pointer transition ${
                                  isEquipped 
                                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/20' 
                                    : 'bg-white text-black hover:bg-neutral-200'
                                }`}
                              >
                                {isEquipped ? 'إلغاء التجهيز' : 'تجهيز'}
                              </button>
                            ) : (
                              <button
                                disabled={coins < effectivePrice || levelLock || purchasing !== null}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePurchase(item);
                                }}
                                className={`w-full py-1.5 rounded-xl text-[8px] font-black transition cursor-pointer flex items-center justify-center gap-0.5 ${
                                  coins >= effectivePrice && !levelLock
                                    ? 'bg-yellow-500 text-black hover:bg-yellow-400'
                                    : 'bg-neutral-900 text-neutral-500 cursor-not-allowed border border-neutral-900/50'
                                }`}
                              >
                                {purchasing === item.id ? (
                                  <RefreshCw size={8} className="animate-spin text-black" />
                                ) : (
                                  <>
                                    <span>بـ</span>
                                    {originalPrice && <span className="line-through text-[7px] opacity-70">{originalPrice}</span>}
                                    <span className="font-mono">{effectivePrice}🪙</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ENERGY AURAS TAB (هالات الطاقة الكونية) */}
              {activeTab === 'aura' && (
                <div className="space-y-3 animate-fadeIn">
                  <h2 className="text-xs text-neutral-400 font-extrabold flex items-center justify-between">
                    <span>✨ هالات الطاقة المشتعلة حول حسابك</span>
                    <span className="text-[9px] text-neutral-500">{filteredItems.length} هالة</span>
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {filteredItems.map((item) => {
                      const isOwnedOrUnlocked = isItemOwnedOrUnlocked(item);
                      const levelLock = item.minLevel && userLevel < item.minLevel;
                      const isEquipped = equippedAuraId === item.id;
                      const { price: effectivePrice, originalPrice } = getEffectivePrice(item);

                      return (
                        <div
                          key={item.id}
                          onClick={() => setPreviewItem(item)}
                          className="bg-neutral-950 border border-neutral-900 hover:border-purple-500/40 rounded-2xl p-4 flex flex-col justify-between gap-3 cursor-pointer transition shadow-xl"
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-[8px] font-black px-2 py-0.5 rounded-full ${
                              levelLock ? 'bg-rose-950 text-rose-400' : 'bg-emerald-950/60 text-emerald-400'
                            }`}>
                              LV {item.minLevel || 6}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[8px] text-purple-300 font-bold">{item.animeOrigin}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setGiftModalItem(item);
                                }}
                                title="إهداء لصديق"
                                className="p-1.5 rounded-full bg-neutral-900 hover:bg-purple-600 text-purple-300 hover:text-white transition cursor-pointer"
                              >
                                <Gift size={11} />
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 py-2">
                            <GeometricAvatar
                              avatarUrl={userData?.photoURL || "https://api.dicebear.com/7.x/avataaars/svg?seed=Aura"}
                              aura={item}
                              size="w-16 h-16"
                            />
                            <div className="flex-1 text-right space-y-1">
                              <h4 className="text-xs font-black text-white">{item.name}</h4>
                              <p className="text-[9.5px] text-neutral-400 leading-relaxed">{item.desc}</p>
                            </div>
                          </div>

                          <ValuationStrip item={item} />

                          <div>
                            {isOwnedOrUnlocked ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEquipToggle(item, isEquipped);
                                }}
                                className={`w-full py-2 rounded-xl text-[9.5px] font-black cursor-pointer transition ${
                                  isEquipped
                                    ? 'bg-emerald-950/90 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-white text-black hover:bg-neutral-200'
                                }`}
                              >
                                {isEquipped ? 'إلغاء تجهيز الهالة ✓' : 'تجهيز الهالة'}
                              </button>
                            ) : (
                              <button
                                disabled={coins < effectivePrice || levelLock || purchasing !== null}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePurchase(item);
                                }}
                                className={`w-full py-2 rounded-xl text-[9.5px] font-black transition cursor-pointer flex items-center justify-center gap-1 ${
                                  coins >= effectivePrice && !levelLock
                                    ? 'bg-yellow-500 text-black hover:bg-yellow-400'
                                    : 'bg-neutral-900 text-neutral-500 cursor-not-allowed'
                                }`}
                              >
                                <span>شراء الهالة بـ</span>
                                {originalPrice && <span className="line-through text-[8px] opacity-70">{originalPrice}</span>}
                                <span className="font-mono">{effectivePrice}🪙</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* COMMENT CARDS TAB (بطاقات التعليقات الملكية) */}
              {activeTab === 'comment_card' && (
                <div className="space-y-3 animate-fadeIn">
                  <h2 className="text-xs text-neutral-400 font-extrabold flex items-center justify-between">
                    <span>💬 بطاقات وخلفيات التعليقات والنقاشات</span>
                    <span className="text-[9px] text-neutral-500">{filteredItems.length} بطاقة</span>
                  </h2>

                  <div className="space-y-4">
                    {filteredItems.map((item) => {
                      const isOwnedOrUnlocked = isItemOwnedOrUnlocked(item);
                      const levelLock = item.minLevel && userLevel < item.minLevel;
                      const isEquipped = equippedCommentCardId === item.id;
                      const { price: effectivePrice, originalPrice } = getEffectivePrice(item);

                      return (
                        <div
                          key={item.id}
                          onClick={() => setPreviewItem(item)}
                          className="bg-neutral-950 border border-neutral-900 hover:border-purple-500/40 rounded-2xl p-4 space-y-3 cursor-pointer transition shadow-xl"
                        >
                          {/* Simulated Comment Card */}
                          <div className={`p-3.5 rounded-xl ${item.commentCardStyle || 'bg-neutral-900 border border-neutral-800'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <img
                                  src={userData?.photoURL || "https://api.dicebear.com/7.x/avataaars/svg?seed=Comment"}
                                  alt=""
                                  className="w-7 h-7 rounded-full object-cover border border-white/20"
                                />
                                <div>
                                  <span className="text-[10px] font-black text-white block">{userData?.displayName || 'أوتاكو النخبة'}</span>
                                  <span className="text-[8px] text-neutral-400">منذ دقيقتين</span>
                                </div>
                              </div>
                              <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-black/70 text-amber-300 border border-amber-500/30">
                                {item.commentCardBadge}
                              </span>
                            </div>
                            <p className="text-[10.5px] text-neutral-100 font-bold leading-relaxed">
                              {item.desc}
                            </p>
                          </div>

                          <ValuationStrip item={item} />

                          <div className="flex items-center justify-between gap-2 pt-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[8px] font-black px-2 py-1 rounded-lg ${
                                levelLock ? 'bg-rose-950 text-rose-400' : 'bg-neutral-900 text-emerald-400'
                              }`}>
                                LV {item.minLevel || 6}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setGiftModalItem(item);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-purple-950/50 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/30 text-[8.5px] font-black flex items-center gap-1 transition cursor-pointer"
                              >
                                <Gift size={10} />
                                <span>إهداء</span>
                              </button>
                            </div>

                            {isOwnedOrUnlocked ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEquipToggle(item, isEquipped);
                                }}
                                className={`px-5 py-1.5 rounded-xl text-[9.5px] font-black cursor-pointer transition ${
                                  isEquipped
                                    ? 'bg-emerald-950/90 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-white text-black hover:bg-neutral-200'
                                }`}
                              >
                                {isEquipped ? 'إلغاء التجهيز ✓' : 'تجهيز البطاقة'}
                              </button>
                            ) : (
                              <button
                                disabled={coins < effectivePrice || levelLock || purchasing !== null}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePurchase(item);
                                }}
                                className={`px-5 py-1.5 rounded-xl text-[9.5px] font-black transition cursor-pointer flex items-center gap-1 ${
                                  coins >= effectivePrice && !levelLock
                                    ? 'bg-yellow-500 text-black hover:bg-yellow-400'
                                    : 'bg-neutral-900 text-neutral-500 cursor-not-allowed'
                                }`}
                              >
                                <span>شراء بـ</span>
                                {originalPrice && <span className="line-through text-[8px] opacity-70">{originalPrice}</span>}
                                <span className="font-mono">{effectivePrice}🪙</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TACTICAL BOOSTERS TAB (المعززات التكتيكية) */}
              {activeTab === 'booster' && (
                <div className="space-y-3 animate-fadeIn">
                  <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-3.5 flex items-center justify-between">
                    <div>
                      <h2 className="text-xs font-black text-amber-400 flex items-center gap-1">
                        <Zap size={14} />
                        <span>المعززات التكتيكية وقدرات التقدم السريع</span>
                      </h2>
                      <p className="text-[9.5px] text-neutral-400 mt-0.5">
                        تُفعّل فوراً في حسابك لمضاعفة نقاط الخبرة أو الكوينز وحماية الستريك اليومي.
                      </p>
                    </div>
                    <div className="text-left font-mono text-[9px] text-neutral-300 space-y-0.5">
                      <div>🛡️ دروع الستريك: <span className="text-sky-400 font-black">{userData?.streakShieldCount || 0}</span></div>
                      <div>👁️ تلميحات الاختبار: <span className="text-purple-400 font-black">{userData?.antiCheatHintCount || 0}</span></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {filteredItems.map((item) => {
                      const levelLock = item.minLevel && userLevel < item.minLevel;
                      const { price: effectivePrice, originalPrice } = getEffectivePrice(item);

                      return (
                        <div
                          key={item.id}
                          className="bg-neutral-950 border border-neutral-900 hover:border-amber-500/40 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-xl"
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-12 h-12 rounded-2xl ${item.bg || 'bg-amber-500/10'} border ${item.border || 'border-amber-500/30'} flex items-center justify-center shrink-0`}>
                              {item.icon ? React.createElement(item.icon, { size: 22, className: item.color || 'text-amber-400' }) : <Zap size={22} className="text-amber-400" />}
                            </div>
                            <div className="flex-1 text-right">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-black text-white">{item.name}</h4>
                                <span className="text-[8px] font-mono bg-neutral-900 text-emerald-400 px-1.5 py-0.5 rounded">
                                  LV {item.minLevel || 5}
                                </span>
                              </div>
                              <p className="text-[9.5px] text-neutral-400 mt-1 leading-relaxed">{item.desc}</p>
                            </div>
                          </div>

                          <ValuationStrip item={item} />

                          <button
                            disabled={coins < effectivePrice || levelLock || purchasing !== null}
                            onClick={() => handlePurchase(item)}
                            className={`w-full py-2 rounded-xl text-[9.5px] font-black transition cursor-pointer flex items-center justify-center gap-1 ${
                              coins >= effectivePrice && !levelLock
                                ? 'bg-gradient-to-l from-amber-500 to-yellow-400 text-black hover:opacity-95'
                                : 'bg-neutral-900 text-neutral-500 cursor-not-allowed'
                            }`}
                          >
                            {purchasing === item.id ? (
                              <RefreshCw size={10} className="animate-spin" />
                            ) : (
                              <>
                                <Zap size={11} />
                                <span>تفعيل المعزز بـ</span>
                                {originalPrice && <span className="line-through text-[8px] opacity-70">{originalPrice}</span>}
                                <span className="font-mono">{effectivePrice}🪙</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* INVENTORY / BAG & EARNED REWARDS TAB */}
          {activeTab === 'inventory' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="space-y-4">
                <h3 className="text-xs text-neutral-400 font-extrabold flex items-center gap-1 justify-between">
                  <span>🎒 حقيبتك الخاصة - المقتنيات والأوسمة المقيّمة</span>
                  <span className="text-[9px] text-neutral-400 bg-neutral-950 px-2.5 py-0.5 rounded-full border border-neutral-800">
                    {filteredItems.length} عنصر مملوك
                  </span>
                </h3>

                {/* Sub tab selector pills */}
                <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1 select-none border-b border-neutral-900/40" dir="rtl">
                  {[
                    { id: 'avatar', label: '👤 صور الحساب' },
                    { id: 'banner', label: '🌌 الأغلفة' },
                    { id: 'frame', label: '🖼️ الإطارات' },
                    { id: 'aura', label: '✨ الهالات' },
                    { id: 'comment_card', label: '💬 البطاقات' },
                    { id: 'title', label: '👑 الألقاب' },
                    { id: 'badge', label: '🏅 الشارات' }
                  ].map((sub) => {
                    const isSubActive = inventorySubTab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => setInventorySubTab(sub.id as any)}
                        className={`px-3 py-1.5 text-[9px] font-black rounded-xl border transition cursor-pointer flex-1 text-center whitespace-nowrap ${
                          isSubActive
                            ? 'bg-purple-950/40 text-purple-400 border-purple-500/30'
                            : 'bg-neutral-950/60 border-neutral-900 text-neutral-500 hover:text-neutral-300'
                        }`}
                      >
                        {sub.label}
                      </button>
                    );
                  })}
                </div>

                {/* Unified Inventory Cards with Valuation */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {filteredItems.map((item) => {
                    const isEquipped = [
                      equippedAvatarId,
                      equippedBannerId,
                      equippedFrameId,
                      equippedAuraId,
                      equippedCommentCardId,
                      equippedTitleId,
                      equippedBadgeId
                    ].includes(item.id);

                    return (
                      <div
                        key={item.id}
                        onClick={() => setPreviewItem(item)}
                        className="p-3.5 bg-neutral-950 border border-neutral-900 hover:border-neutral-700 rounded-2xl flex flex-col justify-between gap-2.5 cursor-pointer transition shadow-xl"
                      >
                        <div className="flex items-center gap-3">
                          {item.img ? (
                            <img src={item.img} alt={item.name} className="w-12 h-12 rounded-xl object-cover border border-neutral-800 shrink-0" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-neutral-900 flex items-center justify-center shrink-0">
                              {item.icon ? React.createElement(item.icon, { size: 20, className: item.color || 'text-purple-400' }) : <Sparkles size={20} className="text-purple-400" />}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className={`text-xs font-black truncate ${item.color || 'text-white'}`}>{item.name}</h4>
                            <p className="text-[9px] text-neutral-500 truncate">{item.animeOrigin || item.desc}</p>
                          </div>
                        </div>

                        <ValuationStrip item={item} compact />

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEquipToggle(item, isEquipped);
                          }}
                          className={`w-full py-1.5 rounded-xl text-[9px] font-black cursor-pointer transition ${
                            isEquipped
                              ? 'bg-emerald-950/90 text-emerald-400 border border-emerald-500/30'
                              : 'bg-white text-black hover:bg-neutral-200'
                          }`}
                        >
                          {isEquipped ? 'إلغاء التجهيز ✓' : 'تجهيز في الحساب'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {filteredItems.length === 0 && (
                  <div className="p-8 text-center border border-neutral-900 rounded-2xl bg-neutral-950/60 text-[10px] text-neutral-500">
                    حقيبتك خالية من العناصر المفتوحة في هذا التبويب حالياً.
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

      </div>

      {/* GIFTING MODAL (نظام إهداء عناصر المتجر للأصدقاء) */}
      {giftModalItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" dir="rtl">
          <div className="bg-neutral-950 border border-neutral-800 rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
                  <Gift size={18} />
                </div>
                <div>
                  <h3 className="text-xs font-black text-white">إهداء عنصر فاخر لصديق</h3>
                  <p className="text-[9px] text-neutral-400">أرسل "{giftModalItem.name}" كهدية فورية</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setGiftModalItem(null);
                  setSelectedRecipient(null);
                  setGiftSearchResults([]);
                }}
                className="p-1.5 rounded-xl bg-neutral-900 text-neutral-400 hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Item Summary */}
            <div className="p-3 rounded-2xl bg-black border border-neutral-900 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-white">{giftModalItem.name}</span>
                <span className="text-xs font-mono font-black text-yellow-400">
                  {getEffectivePrice(giftModalItem).price} 🪙
                </span>
              </div>
              <ValuationStrip item={giftModalItem} compact />
            </div>

            {/* Search Recipient */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-neutral-300 block">ابحث عن اسم المستخدم أو اللقب:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={giftSearchInput}
                  onChange={(e) => setGiftSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchRecipient()}
                  placeholder="مثال: @otaku أو اسم العضو..."
                  className="flex-1 bg-black border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                />
                <button
                  onClick={handleSearchRecipient}
                  disabled={searchingRecipient}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black cursor-pointer transition"
                >
                  {searchingRecipient ? <RefreshCw size={14} className="animate-spin" /> : 'بحث'}
                </button>
              </div>
            </div>

            {/* Results List */}
            {giftSearchResults.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {giftSearchResults.map((u) => {
                  const isSelected = selectedRecipient?.id === u.id;
                  return (
                    <div
                      key={u.id}
                      onClick={() => setSelectedRecipient(u)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                        isSelected
                          ? 'bg-purple-950/50 border-purple-500 text-white'
                          : 'bg-black border-neutral-900 text-neutral-300 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <img
                          src={u.photoURL || "https://api.dicebear.com/7.x/avataaars/svg?seed=User"}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover"
                        />
                        <div>
                          <div className="text-[10.5px] font-black">{u.displayName || 'عضو'}</div>
                          <div className="text-[8.5px] text-neutral-500 font-mono">@{u.username || 'user'}</div>
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 size={15} className="text-purple-400" />}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Confirm Gift Send */}
            <button
              disabled={!selectedRecipient || sendingGift || coins < getEffectivePrice(giftModalItem).price}
              onClick={handleSendGift}
              className={`w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                selectedRecipient && coins >= getEffectivePrice(giftModalItem).price
                  ? 'bg-gradient-to-l from-purple-600 to-rose-600 text-white hover:opacity-95 shadow-lg'
                  : 'bg-neutral-900 text-neutral-500 cursor-not-allowed'
              }`}
            >
              {sendingGift ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <>
                  <Send size={13} />
                  <span>إرسال الهدية الآن ({getEffectivePrice(giftModalItem).price} 🪙)</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
