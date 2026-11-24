import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  ArrowRight,
  Check,
  RefreshCw,
  Coins,
  Lock,
  Sparkles,
  MessageSquare,
  Gift,
  Search,
  Send,
  X,
  CheckCircle2,
  AlertCircle,
  Zap,
  Shield,
  Backpack,
  Eye,
} from 'lucide-react';
import {
  doc,
  updateDoc,
  increment,
  arrayUnion,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { notificationsService } from '../services/notificationsService';
import {
  STORE_ITEMS_SORTED,
  StoreItem,
  getAvatarShapeClass,
  isBadgeUnlocked,
  isTitleUnlocked,
  evaluateSeasonalStoreItems,
  getDailyFlashDeals,
} from '../data/storeItems';
import ViewportPortal from '../components/ViewportPortal';
import PullToRefresh from '../components/PullToRefresh';
import ImageLightboxModal from '../components/ImageLightboxModal';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';
import { clientCache } from '../utils/clientCache';

interface StoreViewProps {
  onBack: () => void;
}

type MainTab =
  | 'seasonal'
  | 'avatar'
  | 'banner'
  | 'frame'
  | 'aura'
  | 'comment_card'
  | 'booster'
  | 'inventory';

type InventorySubTab =
  | 'avatar'
  | 'banner'
  | 'frame'
  | 'aura'
  | 'comment_card'
  | 'title'
  | 'badge';

const CATEGORY_LABELS: Record<StoreItem['type'], string> = {
  avatar: 'صورة حساب',
  banner: 'غلاف ملف',
  frame: 'إطار هندسي',
  aura: 'هالة طاقة',
  comment_card: 'بطاقة نقاش',
  booster: 'معزز تكتيكي',
  title: 'لقب',
  badge: 'شارة',
};

const FRAME_SHAPE_LABELS: Record<string, string> = {
  circle: 'دائري',
  square: 'مربع',
  squircle: 'منحني',
  hexagon: 'سداسي',
  octagon: 'ثماني',
  triangle: 'ثلاثي',
  rhombus: 'معين',
};

// Standardized geometric avatar frame component with optional Energy Aura
export const GeometricAvatar = ({
  avatarUrl,
  frame,
  aura,
  size = 'w-16 h-16',
}: {
  avatarUrl: string;
  frame?: StoreItem | null;
  aura?: StoreItem | null;
  size?: string;
}) => {
  const shapeClass = getAvatarShapeClass(frame?.avatarShape);

  return (
    <div className={`relative ${size} flex items-center justify-center select-none shrink-0`}>
      {aura && (
        <div
          className={`absolute -inset-2.5 rounded-full pointer-events-none z-0 opacity-90 transition-all duration-300 ${aura.auraStyle || ''} bg-gradient-to-tr ${aura.auraGradient || 'from-purple-500/40 to-amber-500/40'} blur-[4px]`}
        />
      )}

      {!frame ? (
        <div className="relative z-10 w-full h-full rounded-full overflow-hidden border-2 border-neutral-800 bg-neutral-950 shadow-inner">
          <img
            src={avatarUrl}
            alt="صورة الحساب"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : ['hexagon', 'octagon', 'triangle', 'rhombus'].includes(frame.avatarShape || '') ? (
        <div className="relative z-10 w-full h-full flex items-center justify-center">
          <div
            className={`absolute inset-0 ${shapeClass} ${frame.frameStyle || 'bg-purple-500'} flex items-center justify-center p-[3px] shadow-lg`}
          >
            <div className={`w-full h-full ${shapeClass} bg-black p-[2px]`}>
              <div className={`w-full h-full ${shapeClass} overflow-hidden bg-neutral-950`}>
                <img
                  src={avatarUrl}
                  alt="صورة الحساب"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative z-10 w-full h-full flex items-center justify-center">
          <div
            className={`w-full h-full ${shapeClass} overflow-hidden border-2 border-black relative bg-neutral-950 shadow-md`}
          >
            <img
              src={avatarUrl}
              alt="صورة الحساب"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div
            className={`absolute inset-[-3.5px] ${shapeClass} pointer-events-none ring-[3px] ring-offset-1 ring-offset-black ${frame.frameStyle}`}
          />
        </div>
      )}
    </div>
  );
};

export default function StoreView({ onBack }: StoreViewProps) {
  const { user, userData } = useAuth();
  const display = useDeviceDisplay();

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
  const [inventorySubTab, setInventorySubTab] = useState<InventorySubTab>('avatar');
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const isPurchasingRef = useRef(false);

  // Seasonal Dynamic Store State
  const [seasonalItems, setSeasonalItems] = useState<StoreItem[]>([]);
  const [seasonLabel, setSeasonLabel] = useState<string>('الموسم الحالي');
  const [loadingSeasonal, setLoadingSeasonal] = useState<boolean>(true);
  const [seasonalError, setSeasonalError] = useState<boolean>(false);
  const [refreshingStore, setRefreshingStore] = useState<boolean>(false);
  const [seasonalSubFilter, setSeasonalSubFilter] = useState<'all' | 'avatar' | 'banner' | 'special'>('all');

  // Search & Simple Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'price_asc' | 'price_desc' | 'level_asc'>('default');

  // Preview + Detail Inspection + Fullscreen Image Lightbox
  const [previewItem, setPreviewItem] = useState<StoreItem | null>(null);
  const [detailItem, setDetailItem] = useState<StoreItem | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<{ src: string; caption?: string } | null>(null);

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
    setTimeout(() => setStoreNotice(null), 3500);
  };

  const fetchSeasonalStore = useCallback(async (forceBypass = false) => {
    const cacheKey = 'client_store_seasonal_v1';
    setSeasonalError(false);

    if (!forceBypass) {
      const cachedPayload = clientCache.get<any>(cacheKey);
      if (cachedPayload) {
        const evaluated = evaluateSeasonalStoreItems(cachedPayload);
        if (evaluated.length > 0) {
          setSeasonalItems(evaluated);
          if (cachedPayload.seasonLabel) {
            setSeasonLabel(cachedPayload.seasonLabel);
          }
          setLoadingSeasonal(false);
          setRefreshingStore(false);
          return;
        }
      }
    }

    if (forceBypass) setRefreshingStore(true);
    else setLoadingSeasonal(true);
    try {
      const ts = forceBypass ? `?_t=${Date.now()}` : '';
      const res = await fetch(`/api/store/seasonal${ts}`, {
        cache: forceBypass ? 'no-store' : 'default',
      });
      const json = await res.json();
      if (json?.data) {
        const evaluated = evaluateSeasonalStoreItems(json.data);
        setSeasonalItems(evaluated);
        if (json.data.seasonLabel) {
          setSeasonLabel(json.data.seasonLabel);
        }
        if (evaluated.length > 0) {
          clientCache.set(cacheKey, json.data, 12 * 60 * 60 * 1000);
        } else {
          setSeasonalError(true);
        }
      } else {
        setSeasonalError(true);
      }
    } catch (err) {
      console.warn('Failed to fetch seasonal store feed:', err);
      setSeasonalError(true);
    } finally {
      setLoadingSeasonal(false);
      setRefreshingStore(false);
    }
  }, []);

  const handleRefreshStore = useCallback(async () => {
    await fetchSeasonalStore(true);
  }, [fetchSeasonalStore]);

  // Load current season anime & characters
  useEffect(() => {
    fetchSeasonalStore(false);
  }, [fetchSeasonalStore]);

  // Combined catalog
  const allCatalogItems = useMemo(() => {
    const map = new Map<string, StoreItem>();
    STORE_ITEMS_SORTED.forEach((item) => map.set(item.id, item));
    seasonalItems.forEach((item) => map.set(item.id, item));
    return Array.from(map.values());
  }, [seasonalItems]);

  // Daily Flash Deals
  const flashDeals = useMemo(() => {
    return getDailyFlashDeals(allCatalogItems);
  }, [allCatalogItems]);

  // Check ownership or unlock status
  const isItemOwnedOrUnlocked = useCallback(
    (item: StoreItem): boolean => {
      if (item.type === 'title') return isTitleUnlocked(item, userData);
      if (item.type === 'badge') return isBadgeUnlocked(item.id, userData);
      if (item.type === 'booster') return false;
      return purchasedItems.includes(item.id);
    },
    [userData, purchasedItems]
  );

  const isItemEquipped = useCallback(
    (item: StoreItem): boolean => {
      return [
        equippedAvatarId,
        equippedBannerId,
        equippedFrameId,
        equippedAuraId,
        equippedCommentCardId,
        equippedTitleId,
        equippedBadgeId,
      ].includes(item.id);
    },
    [
      equippedAvatarId,
      equippedBannerId,
      equippedFrameId,
      equippedAuraId,
      equippedCommentCardId,
      equippedTitleId,
      equippedBadgeId,
    ]
  );

  // Daily discount price resolver
  const getEffectivePrice = useCallback(
    (item: StoreItem): { price: number; originalPrice?: number; discountPercent?: number } => {
      const deal = flashDeals.find((d) => d.item.id === item.id);
      if (deal) {
        return {
          price: deal.discountedPrice,
          originalPrice: deal.originalPrice,
          discountPercent: deal.discountPercent,
        };
      }
      return { price: item.price };
    },
    [flashDeals]
  );

  // Filtered and sorted items for the current tab
  const filteredItems = useMemo(() => {
    let baseList: StoreItem[] = [];

    if (activeTab === 'seasonal') {
      baseList = seasonalItems.length > 0 ? [...seasonalItems] : allCatalogItems.slice(0, 18);
      if (seasonalSubFilter === 'avatar') baseList = baseList.filter((i) => i.type === 'avatar');
      else if (seasonalSubFilter === 'banner') baseList = baseList.filter((i) => i.type === 'banner');
      else if (seasonalSubFilter === 'special')
        baseList = baseList.filter(
          (i) => i.type === 'frame' || i.type === 'aura' || i.type === 'comment_card'
        );
    } else if (activeTab === 'inventory') {
      baseList = allCatalogItems.filter(
        (i) => i.type === inventorySubTab && isItemOwnedOrUnlocked(i)
      );
    } else {
      baseList = allCatalogItems.filter((i) => i.type === activeTab);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      baseList = baseList.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.animeOrigin && i.animeOrigin.toLowerCase().includes(q)) ||
          (i.desc && i.desc.toLowerCase().includes(q))
      );
    }

    if (sortBy === 'price_asc') {
      return [...baseList].sort((a, b) => getEffectivePrice(a).price - getEffectivePrice(b).price);
    }
    if (sortBy === 'price_desc') {
      return [...baseList].sort((a, b) => getEffectivePrice(b).price - getEffectivePrice(a).price);
    }
    if (sortBy === 'level_asc') {
      return [...baseList].sort((a, b) => {
        const levelA = a.minLevel || 1;
        const levelB = b.minLevel || 1;
        if (levelA !== levelB) return levelA - levelB;
        return a.price - b.price;
      });
    }

    return baseList;
  }, [
    activeTab,
    seasonalItems,
    allCatalogItems,
    seasonalSubFilter,
    inventorySubTab,
    searchQuery,
    sortBy,
    isItemOwnedOrUnlocked,
    getEffectivePrice,
  ]);

  // Live profile banner preview
  const previewData = useMemo(() => {
    const mockBanner =
      previewItem?.type === 'banner'
        ? previewItem
        : allCatalogItems.find((i) => i.id === equippedBannerId) || null;
    const mockAvatar =
      previewItem?.type === 'avatar'
        ? previewItem
        : allCatalogItems.find((i) => i.id === equippedAvatarId) || null;
    const mockFrame =
      previewItem?.type === 'frame'
        ? previewItem
        : allCatalogItems.find((i) => i.id === equippedFrameId) || null;
    const mockAura =
      previewItem?.type === 'aura'
        ? previewItem
        : allCatalogItems.find((i) => i.id === equippedAuraId) || null;
    const mockCommentCard =
      previewItem?.type === 'comment_card'
        ? previewItem
        : allCatalogItems.find((i) => i.id === equippedCommentCardId) || null;
    const mockTitle =
      previewItem?.type === 'title'
        ? previewItem
        : allCatalogItems.find((i) => i.id === equippedTitleId) || null;
    const mockBadge =
      previewItem?.type === 'badge'
        ? previewItem
        : allCatalogItems.find((i) => i.id === equippedBadgeId) || null;

    return {
      bannerUrl: mockBanner?.img || '',
      avatarUrl:
        mockAvatar?.img ||
        userData?.photoURL ||
        'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
      bannerObj: mockBanner,
      frameObj: mockFrame,
      auraObj: mockAura,
      commentCardObj: mockCommentCard,
      titleObj: mockTitle,
      badgeObj: mockBadge,
    };
  }, [
    previewItem,
    allCatalogItems,
    equippedBannerId,
    equippedAvatarId,
    equippedFrameId,
    equippedAuraId,
    equippedCommentCardId,
    equippedTitleId,
    equippedBadgeId,
    userData,
  ]);

  // Purchase handler
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
        showToast('success', `تم تفعيل "${item.name}" في حسابك`);
      } else {
        updates.purchasedItems = arrayUnion(item.id);
        await updateDoc(doc(db, 'users', user.id), updates);
        setPreviewItem(item);
        showToast('success', `تم شراء "${item.name}" بنجاح`);
      }
    } catch (e) {
      console.error('Failed to buy item:', e);
      showToast('error', 'حدث خطأ أثناء إتمام الشراء.');
    } finally {
      isPurchasingRef.current = false;
      setPurchasing(null);
    }
  };

  // Equip / Unequip handler
  const handleEquipToggle = async (item: StoreItem, forceUnequip = false) => {
    if (!user) return;
    if (!isItemOwnedOrUnlocked(item) && !forceUnequip) return;

    const key =
      item.type === 'banner'
        ? 'equippedBanner'
        : item.type === 'avatar'
        ? 'equippedAvatar'
        : item.type === 'frame'
        ? 'equippedFrame'
        : item.type === 'aura'
        ? 'equippedAura'
        : item.type === 'comment_card'
        ? 'equippedCommentCard'
        : item.type === 'title'
        ? 'equippedTitle'
        : item.type === 'badge'
        ? 'equippedBadge'
        : null;

    if (!key) return;

    try {
      await updateDoc(doc(db, 'users', user.id), {
        [key]: forceUnequip ? null : item.id,
      });
      if (previewItem?.id === item.id && forceUnequip) {
        setPreviewItem(null);
      }
      showToast(
        'success',
        forceUnequip ? `تم إلغاء تجهيز "${item.name}"` : `تم تجهيز "${item.name}"`
      );
    } catch (err) {
      console.error('Failed toggling item equip:', err);
      showToast('error', 'تعذر تحديث المظهر.');
    }
  };

  // Search users for Gifting
  const handleSearchRecipient = async () => {
    const clean = giftSearchInput.trim();
    if (!clean || clean.length < 2) return;
    setSearchingRecipient(true);
    try {
      const lower = clean.toLowerCase().replace(/^@/, '');
      const qByUsername = query(
        collection(db, 'users'),
        where('username', '>=', lower),
        where('username', '<=', lower + '\uf8ff'),
        limit(5)
      );
      const snap1 = await getDocs(qByUsername);
      const listMap = new Map<string, any>();
      snap1.docs.forEach((d) => {
        if (d.id !== user?.id) listMap.set(d.id, { id: d.id, ...d.data() });
      });

      if (listMap.size < 3) {
        const qByName = query(
          collection(db, 'users'),
          where('displayName', '>=', clean),
          where('displayName', '<=', clean + '\uf8ff'),
          limit(5)
        );
        const snap2 = await getDocs(qByName);
        snap2.docs.forEach((d) => {
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

  // Send Gift
  const handleSendGift = async () => {
    if (!user || !giftModalItem || !selectedRecipient || sendingGift) return;
    const { price: effectivePrice } = getEffectivePrice(giftModalItem);
    if (coins < effectivePrice) {
      showToast('error', 'رصيد الكوينز غير كافٍ لإرسال الهدية.');
      return;
    }

    const recipientOwned: string[] = selectedRecipient.purchasedItems || [];
    if (recipientOwned.includes(giftModalItem.id)) {
      showToast('error', 'هذا العضو يمتلك هذا العنصر بالفعل.');
      return;
    }

    setSendingGift(true);
    try {
      await updateDoc(doc(db, 'users', user.id), {
        coins: increment(-effectivePrice),
      });

      await updateDoc(doc(db, 'users', selectedRecipient.id), {
        purchasedItems: arrayUnion(giftModalItem.id),
      });

      await addDoc(collection(db, 'storeGiftLogs'), {
        senderId: user.id,
        senderName: userData?.displayName || user.displayName || 'أوتاكو',
        recipientId: selectedRecipient.id,
        recipientName: selectedRecipient.displayName || 'عضو',
        itemId: giftModalItem.id,
        itemName: giftModalItem.name,
        price: effectivePrice,
        createdAt: serverTimestamp(),
      });

      await notificationsService.createUserNotification(selectedRecipient.id, {
        title: 'وصلتك هدية من المتجر',
        body: `أهدى إليك ${userData?.displayName || user.displayName || 'صديقك'} عنصر "${giftModalItem.name}". تفقد حقيبتك الآن.`,
        type: 'reward',
        linkTo: 'store',
      });

      showToast(
        'success',
        `تم إرسال "${giftModalItem.name}" إلى ${selectedRecipient.displayName || selectedRecipient.username}`
      );
      setGiftModalItem(null);
      setSelectedRecipient(null);
      setGiftSearchResults([]);
      setGiftSearchInput('');
    } catch (err) {
      console.error('Failed to send gift:', err);
      showToast('error', 'تعذر إرسال الهدية حالياً.');
    } finally {
      setSendingGift(false);
    }
  };

  const renderItemVisual = (item: StoreItem, large = false) => {
    if (item.type === 'frame' || item.type === 'aura') {
      // Matches ProfileView avatar scale (w-20 h-20) with ample stage padding so outer aura glows never clip
      return (
        <div
          className={`w-full ${large ? 'h-48 p-6' : 'h-36 p-4'} bg-[#0a0a0f] flex items-center justify-center relative overflow-hidden`}
        >
          <GeometricAvatar
            avatarUrl={
              userData?.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Otaku'
            }
            frame={item.type === 'frame' ? item : undefined}
            aura={item.type === 'aura' ? item : undefined}
            size={large ? 'w-24 h-24' : 'w-20 h-20'}
          />
        </div>
      );
    }

    if (item.type === 'comment_card') {
      // Wide discussion comment box proportions without text truncation
      return (
        <div
          className={`w-full ${large ? 'p-5 min-h-[132px]' : 'min-h-[124px] p-3.5'} bg-[#0a0a0f] flex items-center justify-center overflow-hidden`}
        >
          <div
            className={`w-full rounded-xl p-3.5 ${item.commentCardStyle || 'bg-neutral-900 border border-neutral-800'}`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-bold text-white truncate">
                {userData?.displayName || 'عضو'}
              </span>
              {item.commentCardBadge && (
                <span className="text-[11px] font-bold text-amber-300 shrink-0">
                  {item.commentCardBadge}
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-200 leading-relaxed">
              {large ? item.desc : 'مثال لمظهر تعليقك داخل صفحات النقاشات والأنمي'}
            </p>
          </div>
        </div>
      );
    }

    if (item.type === 'banner' && item.img) {
      // Horizontal profile cover proportions (21:9) filled completely edge-to-edge without letterbox gaps
      return (
        <div
          onClick={
            large
              ? () => setLightboxSrc({ src: item.img!, caption: item.name })
              : undefined
          }
          className={`theme-keep-dark w-full aspect-[21/9] ${large ? 'min-h-[170px] sm:min-h-[200px] cursor-zoom-in' : 'min-h-[112px]'} bg-neutral-950 relative overflow-hidden`}
        >
          <img
            src={item.img}
            alt={item.name}
            className={`w-full h-full object-cover object-center transition-transform duration-300 ${!large ? 'group-hover:scale-[1.03]' : ''} ${item.imageStyle || ''}`}
            referrerPolicy="no-referrer"
          />
        </div>
      );
    }

    if (item.type === 'avatar' && item.img) {
      if (large) {
        // Detail view shows complete uncropped image with click-to-zoom lightbox
        return (
          <div
            onClick={() => setLightboxSrc({ src: item.img!, caption: item.name })}
            className="theme-keep-dark w-full h-64 bg-neutral-950 relative overflow-hidden flex items-center justify-center p-3 cursor-zoom-in"
          >
            <img
              src={item.img}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-30 pointer-events-none"
              referrerPolicy="no-referrer"
            />
            <img
              src={item.img}
              alt={item.name}
              className="relative z-10 max-h-full max-w-full w-auto h-auto rounded-xl object-contain shadow-2xl"
              referrerPolicy="no-referrer"
            />
          </div>
        );
      }
      // Grid card mirrors ProfileView circular w-20 h-20 avatar size & upper-body framing
      return (
        <div className="theme-keep-dark w-full h-36 bg-[#0a0a0f] relative overflow-hidden flex items-center justify-center p-3">
          <img
            src={item.img}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-25 pointer-events-none"
            referrerPolicy="no-referrer"
          />
          <div className="relative z-10 w-20 h-20 rounded-full overflow-hidden ring-2 ring-white/20 shadow-xl bg-neutral-950 shrink-0 transition-transform duration-300 group-hover:scale-105">
            <img
              src={item.img}
              alt={item.name}
              className="w-full h-full object-cover object-[center_18%]"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      );
    }

    if (item.img) {
      return (
        <div
          onClick={
            large
              ? () => setLightboxSrc({ src: item.img!, caption: item.name })
              : undefined
          }
          className={`theme-keep-dark w-full ${large ? 'h-56 p-3 cursor-zoom-in' : 'h-36 p-2'} bg-neutral-950 relative overflow-hidden flex items-center justify-center`}
        >
          <img
            src={item.img}
            alt={item.name}
            className="max-h-full max-w-full w-auto h-auto object-contain transition-transform duration-300 group-hover:scale-[1.03]"
            referrerPolicy="no-referrer"
          />
        </div>
      );
    }

    if (item.type === 'title' || item.type === 'badge') {
      const IconComp = item.icon || Sparkles;
      return (
        <div
          className={`w-full ${large ? 'h-40 p-5' : 'h-32 p-3.5'} bg-[#0a0a0f] flex items-center justify-center`}
        >
          <div className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-3 py-2.5 flex items-center justify-center gap-2 min-w-0">
            <IconComp size={15} className={`${item.color || 'text-amber-400'} shrink-0`} />
            <span className={`text-xs sm:text-sm font-bold truncate ${item.color || 'text-white'}`}>
              {item.type === 'title'
                ? item.name
                : `${userData?.displayName || 'أوتاكو'} · ${item.name}`}
            </span>
          </div>
        </div>
      );
    }

    // Fallback for boosters
    const IconComp = item.icon || (item.type === 'booster' ? Zap : Sparkles);
    return (
      <div
        className={`w-full ${large ? 'h-40' : 'h-32'} bg-[#0a0a0f] flex items-center justify-center`}
      >
        <div
          className={`w-14 h-14 rounded-2xl ${item.bg || 'bg-white/[0.04]'} border ${item.border || 'border-white/10'} flex items-center justify-center`}
        >
          <IconComp size={26} className={item.color || 'text-amber-400'} />
        </div>
      </div>
    );
  };

  const getItemSubtitle = (item: StoreItem) => {
    if (item.animeOrigin) return item.animeOrigin;
    if (item.type === 'frame' && item.avatarShape) {
      return `إطار ${FRAME_SHAPE_LABELS[item.avatarShape] || 'دائري'}`;
    }
    if (item.type === 'booster') return 'معزز فوري';
    return CATEGORY_LABELS[item.type] || '';
  };

  const TABS: { id: MainTab; label: string }[] = [
    { id: 'seasonal', label: 'الموسم' },
    { id: 'avatar', label: 'الصور' },
    { id: 'banner', label: 'الأغلفة' },
    { id: 'frame', label: 'الإطارات' },
    { id: 'aura', label: 'الهالات' },
    { id: 'comment_card', label: 'البطاقات' },
    { id: 'booster', label: 'المعززات' },
    { id: 'inventory', label: 'حقيبتي' },
  ];

  const INVENTORY_SUBS: { id: InventorySubTab; label: string }[] = [
    { id: 'avatar', label: 'الصور' },
    { id: 'banner', label: 'الأغلفة' },
    { id: 'frame', label: 'الإطارات' },
    { id: 'aura', label: 'الهالات' },
    { id: 'comment_card', label: 'البطاقات' },
    { id: 'title', label: 'الألقاب' },
    { id: 'badge', label: 'الشارات' },
  ];

  return (
    <PullToRefresh onRefresh={handleRefreshStore}>
    <div
      className="min-h-[var(--vv-height,100dvh)] w-full bg-[#060608] text-neutral-100 pb-28 font-sans text-right select-none"
      dir="rtl"
    >
      {/* Toast Notification Banner */}
      <ViewportPortal>
        {storeNotice && (
          <div
            className="fixed inset-x-4 max-w-md mx-auto z-[9999] pointer-events-none"
            style={{ top: 'calc(var(--safe-top, 0px) + 0.75rem)' }}
          >
            <div
              className={`px-4 py-3 rounded-2xl border shadow-2xl flex items-center gap-2.5 text-xs font-bold backdrop-blur-xl ${
                storeNotice.type === 'success'
                  ? 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/95 border-rose-500/40 text-rose-200'
              }`}
            >
              {storeNotice.type === 'success' ? (
                <CheckCircle2 size={16} className="shrink-0" />
              ) : (
                <AlertCircle size={16} className="shrink-0" />
              )}
              <span>{storeNotice.text}</span>
            </div>
          </div>
        )}
      </ViewportPortal>

      {/* Clean Single-Row Sticky Header */}
      <header
        className="sticky top-0 z-40 bg-[#060608]/90 backdrop-blur-md border-b border-white/[0.06]"
        style={{ paddingTop: 'var(--safe-top, 0px)' }}
      >
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={onBack}
              className="w-10 h-10 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-neutral-200 flex items-center justify-center transition cursor-pointer shrink-0"
              title="رجوع"
              aria-label="رجوع"
            >
              <ArrowRight size={18} />
            </button>
            <h1 className="text-sm sm:text-lg font-bold text-white whitespace-nowrap truncate">المتجر</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {!display.isCoverScreen && (
              <>
                <span className="text-xs text-neutral-400 font-mono tabular-nums whitespace-nowrap">
                  المستوى {userLevel}
                </span>
                <span className="text-neutral-700" aria-hidden="true">
                  ·
                </span>
              </>
            )}
            <div className="flex items-center gap-1 sm:gap-1.5 text-amber-400 font-mono font-bold text-xs sm:text-sm tabular-nums whitespace-nowrap">
              <Coins size={14} />
              <span>{coins.toLocaleString()}</span>
            </div>
            <button
              onClick={() => {
                setActiveTab(activeTab === 'inventory' ? 'seasonal' : 'inventory');
                setPreviewItem(null);
              }}
              className={`min-h-[38px] px-2.5 sm:px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0 border ${
                activeTab === 'inventory'
                  ? 'bg-white text-black border-white'
                  : 'bg-white/[0.04] text-neutral-200 border-white/[0.08] hover:bg-white/[0.08]'
              }`}
            >
              <Backpack size={14} />
              <span>الحقيبة</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-6 pt-5 space-y-6">
        {/* Compact Identity Preview Banner */}
        <section className="theme-keep-dark rounded-2xl overflow-hidden border border-white/[0.08] bg-[#101015]">
          <div className="h-24 sm:h-28 relative overflow-hidden">
            {previewData.bannerUrl ? (
              <img
                src={previewData.bannerUrl}
                alt="معاينة الغلاف"
                referrerPolicy="no-referrer"
                className={`absolute inset-0 w-full h-full object-cover object-center transition-all duration-300 ${previewData.bannerObj?.imageStyle || ''}`}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-l from-neutral-900 via-[#12121a] to-neutral-950" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/20" />

            <div className="relative z-10 h-full px-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                <GeometricAvatar
                  avatarUrl={previewData.avatarUrl}
                  frame={previewData.frameObj}
                  aura={previewData.auraObj}
                  size="w-14 h-14"
                />
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h2
                      className={`text-sm sm:text-base font-bold truncate ${previewData.titleObj ? previewData.titleObj.color : 'text-white'}`}
                    >
                      {userData?.displayName || 'عضو أوتاكو MOD'}
                    </h2>
                    {previewData.titleObj?.icon && (
                      <previewData.titleObj.icon size={13} className="shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400 truncate">
                    <span className="font-mono">@{userData?.username || 'otaku'}</span>
                    {previewData.badgeObj && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className={previewData.badgeObj.color}>
                          {previewData.badgeObj.name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {previewItem && (
                <button
                  onClick={() => setPreviewItem(null)}
                  className="min-h-[36px] px-3 rounded-xl bg-black/75 hover:bg-black text-xs font-bold text-neutral-200 border border-white/15 flex items-center gap-1.5 transition cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <X size={13} />
                  <span>إلغاء المعاينة</span>
                </button>
              )}
            </div>
          </div>

          {previewItem && (
            <div className="px-4 py-2.5 bg-white/[0.03] border-t border-white/[0.06] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-neutral-300 min-w-0">
                <Eye size={14} className="text-amber-400 shrink-0" />
                <span className="truncate">معاينة حالية: {previewItem.name}</span>
              </div>
              <button
                onClick={() => setDetailItem(previewItem)}
                className="text-xs font-bold text-amber-400 hover:text-amber-300 whitespace-nowrap shrink-0 cursor-pointer"
              >
                التفاصيل
              </button>
            </div>
          )}

          {previewItem?.type === 'comment_card' && previewData.commentCardObj && (
            <div className="p-3 bg-black/40 border-t border-white/[0.06]">
              <div
                className={`p-3 rounded-xl ${previewData.commentCardObj.commentCardStyle || 'bg-neutral-900 border border-neutral-800'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <MessageSquare size={12} className="text-neutral-300" />
                    <span>{userData?.displayName || 'عضو'}</span>
                  </span>
                  {previewData.commentCardObj.commentCardBadge && (
                    <span className="text-[11px] font-bold text-amber-300">
                      {previewData.commentCardObj.commentCardBadge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-200">
                  معاينة لشكل تعليقك عند تفعيل هذه البطاقة في النقاشات.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Category Navigation + Search & Sort */}
        <section className="space-y-3">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setPreviewItem(null);
                  }}
                  className={`min-h-[40px] px-4 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 border ${
                    active
                      ? 'bg-white text-black border-white'
                      : 'bg-[#101015] text-neutral-400 border-white/[0.07] hover:text-white hover:border-white/15'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search
                size={15}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث بالاسم أو الأنمي..."
                className="w-full min-h-[42px] bg-[#101015] border border-white/[0.08] focus:border-white/25 rounded-xl pr-10 pl-9 text-xs text-white placeholder:text-neutral-500 outline-none transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg text-neutral-400 hover:text-white flex items-center justify-center cursor-pointer"
                  aria-label="مسح البحث"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="min-h-[42px] bg-[#101015] border border-white/[0.08] rounded-xl px-3.5 text-xs font-semibold text-neutral-200 outline-none cursor-pointer"
            >
              <option value="default">الترتيب الافتراضي</option>
              <option value="price_asc">السعر: من الأقل</option>
              <option value="price_desc">السعر: من الأعلى</option>
              <option value="level_asc">المستوى المطلوب</option>
            </select>
          </div>

          {/* Contextual Sub-filters */}
          {activeTab === 'seasonal' && userLevel >= 5 && (
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {[
                  { id: 'all', label: 'الكل' },
                  { id: 'avatar', label: 'الشخصيات' },
                  { id: 'banner', label: 'الأغلفة' },
                  { id: 'special', label: 'التأثيرات' },
                ].map((sf) => (
                  <button
                    key={sf.id}
                    onClick={() => setSeasonalSubFilter(sf.id as any)}
                    className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                      seasonalSubFilter === sf.id
                        ? 'bg-white/15 text-white'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {sf.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-neutral-500 whitespace-nowrap">
                {seasonLabel} · {filteredItems.length} عنصر
              </span>
            </div>
          )}

          {activeTab === 'inventory' && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
              {INVENTORY_SUBS.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setInventorySubTab(sub.id)}
                  className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    inventorySubTab === sub.id
                      ? 'bg-white/15 text-white'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Locked State for Level < 5 (Non-inventory tabs) */}
        {userLevel < 5 && activeTab !== 'inventory' ? (
          <section className="rounded-2xl border border-white/[0.08] bg-[#101015] p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <Lock size={22} />
            </div>
            <div className="space-y-1.5 max-w-sm mx-auto">
              <h2 className="text-base font-bold text-white">المتجر يُفتح عند المستوى 5</h2>
              <p className="text-xs text-neutral-400 leading-relaxed">
                مستواك الحالي {userLevel}. استمر في المشاهدة والتفاعل للوصول إلى المستوى 5 وفتح جميع العناصر.
              </p>
            </div>
            <div className="max-w-xs mx-auto space-y-1.5">
              <div className="w-full h-2 bg-neutral-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (userLevel / 5) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono tabular-nums text-neutral-500">
                <span>المستوى {userLevel}</span>
                <span>الهدف: 5</span>
              </div>
            </div>
          </section>
        ) : (
          <>
            {/* Slim Daily Discounts Row (shown cleanly in Seasonal tab only when no active search) */}
            {activeTab === 'seasonal' && flashDeals.length > 0 && !searchQuery.trim() && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white">تخفيضات اليوم</h2>
                  <span className="text-xs text-neutral-500">تتجدد يومياً</span>
                </div>
                <div className={`grid gap-3 ${display.isCoverScreen ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4'}`}>
                  {flashDeals.map(({ item, originalPrice, discountedPrice, discountPercent }) => {
                    const owned = isItemOwnedOrUnlocked(item);
                    const locked = Boolean(item.minLevel && userLevel < item.minLevel);
                    return (
                      <div
                        key={`deal_${item.id}`}
                        onClick={() => {
                          setPreviewItem(item);
                          setDetailItem(item);
                        }}
                        className="rounded-2xl bg-[#101015] border border-amber-500/20 hover:border-amber-400/50 p-3 flex flex-col justify-between gap-2.5 cursor-pointer transition"
                      >
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-rose-400 font-mono tabular-nums">-{discountPercent}%</span>
                          <span className="text-neutral-500 truncate max-w-[65%]">{CATEGORY_LABELS[item.type]}</span>
                        </div>
                        <div className="flex items-center gap-2.5 min-w-0">
                          {item.img ? (
                            item.type === 'banner' ? (
                              <img
                                src={item.img}
                                alt={item.name}
                                className="w-16 h-9 rounded-lg object-cover object-center shrink-0 bg-neutral-950 border border-white/10"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <img
                                src={item.img}
                                alt={item.name}
                                className={`w-10 h-10 shrink-0 bg-neutral-900 ${
                                  item.type === 'avatar'
                                    ? 'rounded-full object-cover object-[center_18%] border border-white/15'
                                    : 'rounded-lg object-cover'
                                }`}
                                referrerPolicy="no-referrer"
                              />
                            )
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
                              <Zap size={16} className="text-amber-400" />
                            </div>
                          )}
                          <h3 className="text-xs font-bold text-white truncate">{item.name}</h3>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                          <div className="flex items-center gap-1.5 font-mono tabular-nums text-xs">
                            <span className="text-amber-400 font-bold">{discountedPrice}</span>
                            <span className="text-neutral-600 line-through text-[11px]">{originalPrice}</span>
                          </div>
                          {owned ? (
                            <span className="text-xs font-bold text-emerald-400">مملوك</span>
                          ) : (
                            <button
                              disabled={coins < discountedPrice || locked || purchasing !== null}
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePurchase(item);
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                                coins >= discountedPrice && !locked
                                  ? 'bg-amber-400 text-black hover:bg-amber-300 cursor-pointer'
                                  : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                              }`}
                            >
                              شراء
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Booster Active Balance Strip */}
            {activeTab === 'booster' && (
              <section className="rounded-2xl bg-[#101015] border border-white/[0.08] px-4 py-3 flex items-center justify-between flex-wrap gap-3">
                <span className="text-xs text-neutral-300 font-semibold">
                  رصيدك من العناصر النشطة
                </span>
                <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-neutral-300">
                  <span className="flex items-center gap-1.5">
                    <Shield size={13} className="text-sky-400" />
                    دروع الستريك: <strong className="text-white">{userData?.streakShieldCount || 0}</strong>
                  </span>
                  <span className="text-neutral-700" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    تلميحات: <strong className="text-white">{userData?.antiCheatHintCount || 0}</strong>
                  </span>
                </div>
              </section>
            )}

            {/* Main Item Grid */}
            {activeTab === 'seasonal' && loadingSeasonal && filteredItems.length === 0 ? (
              <div className="py-16 text-center rounded-2xl border border-white/[0.06] bg-[#101015] space-y-2.5">
                <RefreshCw size={20} className="animate-spin text-neutral-400 mx-auto" />
                <p className="text-xs text-neutral-400">جاري تحميل عناصر الموسم...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="py-14 px-4 text-center rounded-2xl border border-white/[0.06] bg-[#101015] space-y-3">
                <p className="text-sm font-bold text-neutral-300">
                  {activeTab === 'seasonal' && seasonalError
                    ? 'تعذر جلب عروض الموسم حالياً'
                    : 'لا توجد عناصر مطابقة'}
                </p>
                <p className="text-xs text-neutral-500">
                  {activeTab === 'inventory'
                    ? 'حقيبتك فارغة في هذا القسم حالياً.'
                    : activeTab === 'seasonal' && seasonalError
                      ? 'تأكد من اتصالك بالإنترنت واضغط على إعادة المحاولة.'
                      : 'جرّب تغيير كلمة البحث أو استعراض قسم آخر.'}
                </p>
                {activeTab === 'seasonal' && seasonalError && (
                  <button
                    onClick={handleRefreshStore}
                    disabled={refreshingStore}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold transition cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={refreshingStore ? 'animate-spin' : ''} />
                    <span>إعادة المحاولة</span>
                  </button>
                )}
              </div>
            ) : (
              <section
                className={`grid gap-3.5 sm:gap-4 ${
                  display.isCoverScreen
                    ? 'grid-cols-1'
                    : activeTab === 'banner' ||
                        activeTab === 'comment_card' ||
                        (activeTab === 'seasonal' && seasonalSubFilter === 'banner') ||
                        (activeTab === 'inventory' &&
                          (inventorySubTab === 'banner' || inventorySubTab === 'comment_card'))
                      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                      : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
                }`}
              >
                {filteredItems.map((item) => {
                  const owned = isItemOwnedOrUnlocked(item);
                  const equipped = isItemEquipped(item);
                  const levelLock = Boolean(item.minLevel && userLevel < item.minLevel);
                  const { price: effectivePrice, originalPrice } = getEffectivePrice(item);
                  const subtitle = getItemSubtitle(item);
                  const isWideItem = item.type === 'banner' || item.type === 'comment_card';
                  const spanWideInMixedGrid =
                    !display.isCoverScreen &&
                    activeTab === 'seasonal' &&
                    seasonalSubFilter !== 'banner' &&
                    isWideItem;

                  return (
                    <article
                      key={item.id}
                      onClick={() => {
                        setPreviewItem(item);
                        setDetailItem(item);
                      }}
                      className={`rounded-2xl bg-[#101015] border transition overflow-hidden flex flex-col justify-between cursor-pointer group ${
                        spanWideInMixedGrid ? 'col-span-2' : ''
                      } ${
                        equipped
                          ? 'border-emerald-500/45'
                          : 'border-white/[0.07] hover:border-white/20'
                      }`}
                    >
                      <div className="relative">
                        {renderItemVisual(item)}
                        {equipped && (
                          <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/80 text-emerald-400 text-[11px] font-bold flex items-center gap-1">
                            <Check size={11} />
                            مجهّز
                          </span>
                        )}
                      </div>

                      <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
                        <div className="space-y-0.5 min-w-0">
                          <h3
                            className={`text-sm font-bold truncate ${
                              item.color && !item.img ? item.color : 'text-white'
                            }`}
                          >
                            {item.name}
                          </h3>
                          <p className="text-xs text-neutral-400 truncate">
                            {subtitle}
                            {levelLock ? ` · مستوى ${item.minLevel}` : ''}
                          </p>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-white/[0.06]">
                          <div className="text-xs font-mono tabular-nums font-bold">
                            {owned ? (
                              <span className="text-neutral-400 font-sans">مملوك</span>
                            ) : (
                              <div className="flex items-center gap-1 text-amber-400">
                                <Coins size={12} className="shrink-0" />
                                <span>{effectivePrice}</span>
                                {originalPrice && (
                                  <span className="text-neutral-600 line-through text-[11px]">
                                    {originalPrice}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {owned ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEquipToggle(item, equipped);
                              }}
                              className={`min-h-[36px] px-3 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                                equipped
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                                  : 'bg-white text-black hover:bg-neutral-200'
                              }`}
                            >
                              {equipped ? 'إلغاء' : 'تجهيز'}
                            </button>
                          ) : (
                            <button
                              disabled={coins < effectivePrice || levelLock || purchasing !== null}
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePurchase(item);
                              }}
                              className={`min-h-[36px] px-3 rounded-xl text-xs font-bold transition whitespace-nowrap shrink-0 flex items-center justify-center gap-1 ${
                                coins >= effectivePrice && !levelLock
                                  ? 'bg-amber-400 text-black hover:bg-amber-300 cursor-pointer'
                                  : 'bg-white/[0.05] text-neutral-500 cursor-not-allowed'
                              }`}
                            >
                              {purchasing === item.id ? (
                                <RefreshCw size={12} className="animate-spin" />
                              ) : levelLock ? (
                                <>
                                  <Lock size={11} />
                                  <span>LV {item.minLevel}</span>
                                </>
                              ) : (
                                <span>{item.type === 'booster' ? 'تفعيل' : 'شراء'}</span>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
            )}
          </>
        )}
      </main>

      {/* Quick Item Details Sheet / Modal (Preview, Description, Buy/Equip, Gift) */}
      <ViewportPortal>
        {detailItem && (
          <div
            onClick={() => setDetailItem(null)}
            className="fixed inset-0 z-[115] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
            style={{
              height: 'var(--vv-height, 100dvh)',
              paddingTop: 'calc(var(--safe-top, 0px) + 1rem)',
              paddingBottom: 'var(--safe-bottom, 0px)',
            }}
            dir="rtl"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-[#101015] border border-white/10 rounded-t-3xl sm:rounded-3xl max-w-md w-full overflow-hidden shadow-2xl"
              style={{
                maxHeight: 'calc(var(--vv-height, 100dvh) - var(--safe-top, 0px) - var(--safe-bottom, 0px) - 1rem)',
              }}
            >
              <div className="relative">
                {renderItemVisual(detailItem, true)}
                <button
                  onClick={() => setDetailItem(null)}
                  className="absolute top-3 left-3 w-9 h-9 rounded-full bg-black/75 text-neutral-300 hover:text-white flex items-center justify-center cursor-pointer border border-white/10"
                  aria-label="إغلاق"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 space-y-4 overflow-y-auto">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-bold text-white">{detailItem.name}</h3>
                    {!isItemOwnedOrUnlocked(detailItem) && (
                      <div className="flex items-center gap-1 text-amber-400 font-mono tabular-nums font-bold text-sm shrink-0">
                        <Coins size={14} />
                        <span>{getEffectivePrice(detailItem).price}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400">
                    {CATEGORY_LABELS[detailItem.type]}
                    {detailItem.animeOrigin ? ` · ${detailItem.animeOrigin}` : ''}
                    {detailItem.minLevel ? ` · يتطلب المستوى ${detailItem.minLevel}` : ''}
                  </p>
                </div>

                {detailItem.desc && (
                  <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                    {detailItem.desc}
                  </p>
                )}

                <div className="flex items-center gap-2.5 pt-1">
                  {isItemOwnedOrUnlocked(detailItem) ? (
                    <button
                      onClick={() => handleEquipToggle(detailItem, isItemEquipped(detailItem))}
                      className={`flex-1 min-h-[44px] rounded-xl text-sm font-bold transition cursor-pointer ${
                        isItemEquipped(detailItem)
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                          : 'bg-white text-black hover:bg-neutral-200'
                      }`}
                    >
                      {isItemEquipped(detailItem) ? 'إلغاء التجهيز' : 'تجهيز الآن'}
                    </button>
                  ) : (
                    <button
                      disabled={
                        coins < getEffectivePrice(detailItem).price ||
                        Boolean(detailItem.minLevel && userLevel < detailItem.minLevel) ||
                        purchasing !== null
                      }
                      onClick={() => handlePurchase(detailItem)}
                      className={`flex-1 min-h-[44px] rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 ${
                        coins >= getEffectivePrice(detailItem).price &&
                        !(detailItem.minLevel && userLevel < detailItem.minLevel)
                          ? 'bg-amber-400 text-black hover:bg-amber-300 cursor-pointer'
                          : 'bg-white/[0.06] text-neutral-500 cursor-not-allowed'
                      }`}
                    >
                      {purchasing === detailItem.id ? (
                        <RefreshCw size={15} className="animate-spin" />
                      ) : detailItem.minLevel && userLevel < detailItem.minLevel ? (
                        <span>يتطلب المستوى {detailItem.minLevel}</span>
                      ) : (
                        <span>
                          {detailItem.type === 'booster' ? 'تفعيل الآن' : 'شراء العنصر'} (
                          {getEffectivePrice(detailItem).price})
                        </span>
                      )}
                    </button>
                  )}

                  {detailItem.type !== 'booster' &&
                    detailItem.type !== 'title' &&
                    detailItem.type !== 'badge' && (
                      <button
                        onClick={() => {
                          const target = detailItem;
                          setDetailItem(null);
                          setGiftModalItem(target);
                        }}
                        className="min-h-[44px] px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-neutral-200 border border-white/10 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                      >
                        <Gift size={15} />
                        <span>إهداء</span>
                      </button>
                    )}
                </div>
              </div>
            </div>
          </div>
        )}
      </ViewportPortal>

      {/* GIFTING MODAL */}
      <ViewportPortal>
        {giftModalItem && (
          <div
            onClick={() => {
              setGiftModalItem(null);
              setSelectedRecipient(null);
              setGiftSearchResults([]);
            }}
            className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            style={{
              height: 'var(--vv-height, 100dvh)',
              paddingTop: 'calc(var(--safe-top, 0px) + 1rem)',
              paddingBottom: 'calc(var(--safe-bottom, 0px) + 1rem)',
            }}
            dir="rtl"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-[#101015] border border-white/10 rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl overflow-y-auto"
              style={{
                maxHeight: 'calc(var(--vv-height, 100dvh) - var(--safe-top, 0px) - var(--safe-bottom, 0px) - 2rem)',
              }}
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-white/[0.06] text-amber-400 flex items-center justify-center">
                    <Gift size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">إهداء لصديق</h3>
                    <p className="text-xs text-neutral-400">{giftModalItem.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setGiftModalItem(null);
                    setSelectedRecipient(null);
                    setGiftSearchResults([]);
                  }}
                  className="w-8 h-8 rounded-xl bg-white/[0.06] text-neutral-400 hover:text-white flex items-center justify-center cursor-pointer"
                  aria-label="إغلاق"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-white/[0.06] flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-300">
                  {CATEGORY_LABELS[giftModalItem.type]}
                </span>
                <span className="text-xs font-mono tabular-nums font-bold text-amber-400 flex items-center gap-1">
                  <Coins size={12} />
                  {getEffectivePrice(giftModalItem).price}
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-300 block">
                  ابحث باسم المستخدم أو الاسم:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={giftSearchInput}
                    onChange={(e) => setGiftSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchRecipient()}
                    placeholder="@username"
                    className="flex-1 min-h-[42px] bg-black/50 border border-white/10 rounded-xl px-3 text-xs text-white outline-none focus:border-white/30"
                  />
                  <button
                    onClick={handleSearchRecipient}
                    disabled={searchingRecipient}
                    className="min-h-[42px] px-4 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-bold cursor-pointer transition shrink-0"
                  >
                    {searchingRecipient ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      'بحث'
                    )}
                  </button>
                </div>
              </div>

              {giftSearchResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1.5">
                  {giftSearchResults.map((u) => {
                    const isSelected = selectedRecipient?.id === u.id;
                    return (
                      <div
                        key={u.id}
                        onClick={() => setSelectedRecipient(u)}
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                          isSelected
                            ? 'bg-white/[0.08] border-white/30 text-white'
                            : 'bg-black/40 border-white/[0.06] text-neutral-300 hover:border-white/15'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={
                              u.photoURL ||
                              'https://api.dicebear.com/7.x/avataaars/svg?seed=User'
                            }
                            alt={u.displayName || 'عضو'}
                            className="w-8 h-8 rounded-full object-cover shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-bold truncate">
                              {u.displayName || 'عضو'}
                            </div>
                            <div className="text-[11px] text-neutral-500 font-mono truncate">
                              @{u.username || 'user'}
                            </div>
                          </div>
                        </div>
                        {isSelected && <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                disabled={
                  !selectedRecipient ||
                  sendingGift ||
                  coins < getEffectivePrice(giftModalItem).price
                }
                onClick={handleSendGift}
                className={`w-full min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
                  selectedRecipient && coins >= getEffectivePrice(giftModalItem).price
                    ? 'bg-amber-400 text-black hover:bg-amber-300 cursor-pointer'
                    : 'bg-white/[0.05] text-neutral-500 cursor-not-allowed'
                }`}
              >
                {sendingGift ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <>
                    <Send size={13} />
                    <span>
                      إرسال الهدية ({getEffectivePrice(giftModalItem).price})
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </ViewportPortal>
      <ImageLightboxModal
        src={lightboxSrc?.src || null}
        caption={lightboxSrc?.caption}
        onClose={() => setLightboxSrc(null)}
      />
    </div>
    </PullToRefresh>
  );
}
