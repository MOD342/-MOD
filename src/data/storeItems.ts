import { Sparkles, Shield, Palette, Zap, Star, Flame, Crown, Skull, Swords, Ghost, Moon, Droplet, Wind, Mountain, Sun, Gem, Heart, Eye, Crosshair, Anchor, Lock, Search, MessageSquare, Rocket, Wand2, Award, Compass, Gift } from 'lucide-react';
import { anilistAvatars, anilistBanners } from './anilistData';

export type StoreCategory = 'avatar' | 'banner' | 'frame' | 'aura' | 'comment_card' | 'booster' | 'title' | 'badge';
export type StoreRarity = 'common' | 'good' | 'rare' | 'epic' | 'legendary' | 'cosmic';
export type ValuationGrade = 'SSS+' | 'SS' | 'S' | 'A+' | 'A' | 'B';

export interface StoreItem {
  id: string;
  name: string;
  desc: string;
  price: number;
  type: StoreCategory;
  rarity?: StoreRarity;
  img?: string; 
  icon?: any;   
  color?: string;
  bg?: string;
  border?: string;
  frameStyle?: string; 
  imageStyle?: string;
  auraStyle?: string;
  auraGradient?: string;
  commentCardStyle?: string;
  commentCardBadge?: string;
  boosterKey?: 'doubleXpUntil' | 'doubleCoinsUntil' | 'streakShieldCount' | 'antiCheatHintCount' | 'staminaRefill';
  boosterDurationHours?: number;
  boosterAmount?: number;
  minLevel?: number;
  avatarShape?: 'circle' | 'squircle' | 'square' | 'hexagon' | 'octagon' | 'triangle' | 'rhombus';
  // Popularity & Valuation Engine fields (Applied to ALL store items)
  popularityIndex: number;       // 65 to 99.9
  animeScore: number;            // 7.2 to 9.9 (out of 10)
  favoritesCount: number;        // e.g. 1,500 to 185,000
  valuationGrade: ValuationGrade;// SSS+, SS, S, A+, A, B
  marketDemand: 'مرتفع جداً 🔥' | 'رائج ⚡' | 'مستقر ✨' | 'نادر 💎';
  animeOrigin?: string;          // Associated Anime / Character Franchise
  isSeasonal?: boolean;          // Added with current season
  seasonTag?: string;            // e.g. "خريف 2026"
}

export function getAvatarShapeClass(shape?: 'circle' | 'squircle' | 'square' | 'hexagon' | 'octagon' | 'triangle' | 'rhombus') {
  if (shape === 'square') return 'rounded-xl';
  if (shape === 'squircle') return 'rounded-[1.75rem]';
  if (shape === 'hexagon') return '[clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]';
  if (shape === 'octagon') return '[clip-path:polygon(30%_0%,70%_0%,100%_30%,100%_70%,70%_100%,30%_100%,0%_70%,0%_30%)]';
  if (shape === 'triangle') return '[clip-path:polygon(50%_0%,100%_100%,0%_100%)]';
  if (shape === 'rhombus') return '[clip-path:polygon(50%_0%,100%_50%,50%_100%,0%_50%)]';
  return 'rounded-full';
}

export const RARITY_META: Record<StoreRarity, { label: string; color: string; bg: string; border: string; glow: string }> = {
  common: { label: 'شائع', color: 'text-neutral-300', bg: 'bg-neutral-900/90', border: 'border-neutral-700', glow: '' },
  good: { label: 'مميز', color: 'text-emerald-400', bg: 'bg-emerald-950/90', border: 'border-emerald-500/40', glow: 'shadow-[0_0_10px_rgba(16,185,129,0.15)]' },
  rare: { label: 'نادر', color: 'text-sky-400', bg: 'bg-sky-950/90', border: 'border-sky-500/40', glow: 'shadow-[0_0_12px_rgba(56,189,248,0.2)]' },
  epic: { label: 'ملحمي', color: 'text-purple-400', bg: 'bg-purple-950/90', border: 'border-purple-500/50', glow: 'shadow-[0_0_15px_rgba(168,85,247,0.25)]' },
  legendary: { label: 'أسطوري', color: 'text-amber-400', bg: 'bg-amber-950/90', border: 'border-amber-500/50', glow: 'shadow-[0_0_18px_rgba(245,158,11,0.3)]' },
  cosmic: { label: 'كوني خارق', color: 'text-rose-400', bg: 'bg-rose-950/90', border: 'border-rose-500/60', glow: 'shadow-[0_0_24px_rgba(244,63,94,0.4)]' },
};

export const GRADE_META: Record<ValuationGrade, { badgeClass: string; textClass: string; labelAr: string }> = {
  'SSS+': { badgeClass: 'bg-gradient-to-r from-rose-600 via-amber-500 to-purple-600 text-white border-amber-300/60 shadow-[0_0_12px_rgba(244,63,94,0.5)]', textClass: 'text-rose-400', labelAr: 'تقدير سيادي SSS+' },
  'SS': { badgeClass: 'bg-gradient-to-r from-amber-500 to-yellow-400 text-black border-yellow-200/60 shadow-[0_0_10px_rgba(245,158,11,0.4)]', textClass: 'text-amber-400', labelAr: 'تقدير أسطوري SS' },
  'S': { badgeClass: 'bg-purple-600/90 text-white border-purple-400/50', textClass: 'text-purple-400', labelAr: 'تقدير نخبة S' },
  'A+': { badgeClass: 'bg-sky-600/90 text-white border-sky-400/50', textClass: 'text-sky-400', labelAr: 'تقدير ممتاز A+' },
  'A': { badgeClass: 'bg-emerald-600/90 text-white border-emerald-400/50', textClass: 'text-emerald-400', labelAr: 'تقدير جيد جداً A' },
  'B': { badgeClass: 'bg-neutral-800 text-neutral-300 border-neutral-700', textClass: 'text-neutral-400', labelAr: 'تقدير أساسي B' },
};

// Evaluates any store item based on its popularity rank, anime/character score, and favorites
export function computeItemValuation(
  rankRatio: number, // 0.0 (lowest) to 1.0 (highest popularity/tier)
  customMeta?: {
    popularityIndex?: number;
    animeScore?: number;
    favoritesCount?: number;
    animeOrigin?: string;
    isSeasonal?: boolean;
    seasonTag?: string;
  }
): {
  popularityIndex: number;
  animeScore: number;
  favoritesCount: number;
  valuationGrade: ValuationGrade;
  marketDemand: 'مرتفع جداً 🔥' | 'رائج ⚡' | 'مستقر ✨' | 'نادر 💎';
  rarity: StoreRarity;
} {
  const clamped = Math.max(0, Math.min(1, rankRatio));
  const popularityIndex = customMeta?.popularityIndex ?? Number((68 + clamped * 31.8).toFixed(1));
  const animeScore = customMeta?.animeScore ?? Number((7.4 + clamped * 2.4).toFixed(1));
  const favoritesCount = customMeta?.favoritesCount ?? Math.round(1800 + Math.pow(clamped, 2.2) * 165000);

  let valuationGrade: ValuationGrade = 'B';
  let rarity: StoreRarity = 'common';
  let marketDemand: 'مرتفع جداً 🔥' | 'رائج ⚡' | 'مستقر ✨' | 'نادر 💎' = 'مستقر ✨';

  if (popularityIndex >= 96 || animeScore >= 9.4) {
    valuationGrade = 'SSS+';
    rarity = 'cosmic';
    marketDemand = 'مرتفع جداً 🔥';
  } else if (popularityIndex >= 91 || animeScore >= 9.0) {
    valuationGrade = 'SS';
    rarity = 'legendary';
    marketDemand = 'مرتفع جداً 🔥';
  } else if (popularityIndex >= 85 || animeScore >= 8.6) {
    valuationGrade = 'S';
    rarity = 'epic';
    marketDemand = 'نادر 💎';
  } else if (popularityIndex >= 79 || animeScore >= 8.2) {
    valuationGrade = 'A+';
    rarity = 'rare';
    marketDemand = 'رائج ⚡';
  } else if (popularityIndex >= 73 || animeScore >= 7.8) {
    valuationGrade = 'A';
    rarity = 'good';
    marketDemand = 'رائج ⚡';
  } else {
    valuationGrade = 'B';
    rarity = 'common';
    marketDemand = 'مستقر ✨';
  }

  return {
    popularityIndex,
    animeScore,
    favoritesCount,
    valuationGrade,
    marketDemand,
    rarity,
  };
}

// Convert dynamic seasonal API items into full StoreItems evaluated by popularity and rating
export function evaluateSeasonalStoreItems(seasonalFeed: {
  seasonLabel?: string;
  banners?: any[];
  avatars?: any[];
}): StoreItem[] {
  if (!seasonalFeed) return [];
  const results: StoreItem[] = [];
  const seasonTag = seasonalFeed.seasonLabel || 'الموسم الحالي';

  // 1. Evaluate Seasonal Anime Banners
  const banners = seasonalFeed.banners || [];
  banners.forEach((b, idx) => {
    const score = Number(b.animeScore || 8.3);
    const popCount = Number(b.popularityCount || 50000);
    const favCount = Number(b.favoritesCount || 4500);
    // Normalize popularity rank based on score + popularity
    const scoreWeight = Math.max(0, Math.min(1, (score - 7.0) / 2.5));
    const popWeight = Math.max(0, Math.min(1, 1 - idx / Math.max(1, banners.length)));
    const combinedRatio = Number((scoreWeight * 0.55 + popWeight * 0.45).toFixed(3));

    const val = computeItemValuation(combinedRatio, {
      popularityIndex: Number((78 + combinedRatio * 21.5).toFixed(1)),
      animeScore: score,
      favoritesCount: favCount,
      animeOrigin: b.animeTitle || b.name,
      isSeasonal: true,
      seasonTag,
    });

    const minLevel = Math.max(5, Math.min(65, Math.round(5 + combinedRatio * 45)));
    const price = Math.round((450 + Math.pow(combinedRatio, 1.4) * 4200) / 10) * 10;

    results.push({
      id: b.id,
      name: `غلاف موسمي: ${b.name}`,
      desc: `غلاف حصري من موسم ${seasonTag} مقيّم حسب شعبية وتقييم أنمي ${b.animeTitle || b.name}.`,
      price,
      minLevel,
      type: 'banner',
      img: b.img,
      rarity: val.rarity,
      popularityIndex: val.popularityIndex,
      animeScore: val.animeScore,
      favoritesCount: val.favoritesCount || Math.round(popCount / 8),
      valuationGrade: val.valuationGrade,
      marketDemand: val.marketDemand,
      animeOrigin: b.animeTitle || b.name,
      isSeasonal: true,
      seasonTag,
    });
  });

  // 2. Evaluate Seasonal Character Avatars
  const avatars = seasonalFeed.avatars || [];
  avatars.forEach((av, idx) => {
    const score = Number(av.animeScore || 8.3);
    const charFavs = Number(av.favoritesCount || 2200);
    const favWeight = Math.max(0, Math.min(1, Math.log10(Math.max(10, charFavs)) / 4.8));
    const rankWeight = Math.max(0, Math.min(1, 1 - idx / Math.max(1, avatars.length)));
    const combinedRatio = Number((favWeight * 0.6 + rankWeight * 0.4).toFixed(3));

    const val = computeItemValuation(combinedRatio, {
      popularityIndex: Number((76 + combinedRatio * 23.4).toFixed(1)),
      animeScore: score,
      favoritesCount: charFavs,
      animeOrigin: av.animeTitle || av.name,
      isSeasonal: true,
      seasonTag,
    });

    const minLevel = Math.max(5, Math.min(60, Math.round(5 + combinedRatio * 40)));
    const price = Math.round((350 + Math.pow(combinedRatio, 1.4) * 3600) / 10) * 10;

    results.push({
      id: av.id,
      name: `${av.name}`,
      desc: `شخصية موسمية رائجة من أنمي ${av.animeTitle || ''} (${seasonTag}) خاضعة للتقدير حسب الشعبية.`,
      price,
      minLevel,
      type: 'avatar',
      img: av.img,
      rarity: val.rarity,
      popularityIndex: val.popularityIndex,
      animeScore: val.animeScore,
      favoritesCount: charFavs,
      valuationGrade: val.valuationGrade,
      marketDemand: val.marketDemand,
      animeOrigin: av.animeTitle || 'أنمي الموسم',
      isSeasonal: true,
      seasonTag,
    });
  });

  // 3. Add 3 Seasonal Special Edition Cosmetics (Frame, Aura, Comment Card) calibrated to current season hype
  results.push(
    {
      id: 'season_frame_current_1',
      name: `إطار عرش الموسم (${seasonTag})`,
      desc: 'إطار هندسي موسمي مشع يتبدل توهجه مع صدارة أنميات الموسم الكبرى.',
      price: 1850,
      minLevel: 8,
      type: 'frame',
      rarity: 'legendary',
      avatarShape: 'hexagon',
      frameStyle: 'border-[5px] border-amber-400 shadow-[0_0_22px_#f59e0b]',
      popularityIndex: 96.4,
      animeScore: 9.3,
      favoritesCount: 48200,
      valuationGrade: 'SS',
      marketDemand: 'مرتفع جداً 🔥',
      animeOrigin: `موسم ${seasonTag}`,
      isSeasonal: true,
      seasonTag,
    },
    {
      id: 'season_aura_current_1',
      name: `هالة البرق السيادي (${seasonTag})`,
      desc: 'هالة طاقة موسمية تحيط بملفك الشخصي وتمنحه حضوراً سينمائياً مستوحى من أبطال الموسم.',
      price: 2400,
      minLevel: 10,
      type: 'aura',
      rarity: 'cosmic',
      auraStyle: 'ring-4 ring-rose-500/60 shadow-[0_0_35px_rgba(244,63,94,0.85)] animate-pulse',
      auraGradient: 'from-rose-600/35 via-amber-500/20 to-purple-700/35',
      popularityIndex: 98.2,
      animeScore: 9.6,
      favoritesCount: 74500,
      valuationGrade: 'SSS+',
      marketDemand: 'مرتفع جداً 🔥',
      animeOrigin: `موسم ${seasonTag}`,
      isSeasonal: true,
      seasonTag,
    },
    {
      id: 'season_card_current_1',
      name: `بطاقة تعليق أساطير ${seasonTag}`,
      desc: 'تكسو جميع تعليقاتك ونقاشاتك بخلفية ملكية متدرجة ووسم الموسم الحصري.',
      price: 1600,
      minLevel: 7,
      type: 'comment_card',
      rarity: 'epic',
      commentCardStyle: 'bg-gradient-to-l from-amber-950/45 via-rose-950/30 to-purple-950/40 border border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.12)]',
      commentCardBadge: `👑 نخبة ${seasonTag}`,
      popularityIndex: 93.8,
      animeScore: 9.1,
      favoritesCount: 39100,
      valuationGrade: 'SS',
      marketDemand: 'مرتفع جداً 🔥',
      animeOrigin: `موسم ${seasonTag}`,
      isSeasonal: true,
      seasonTag,
    }
  );

  return results;
}

// 1. Core definitions of items
// Note: anilistAvatars and anilistBanners are ordered from most popular (index 0) to lower popularity
const totalAnilistAvatars = anilistAvatars.length;
const baseAvatars: any[] = anilistAvatars.map((item, index) => {
  // Index 0 is highest popularity on AniList (Levi, Gojo, Killua, Luffy, Eren...)
  const popRankRatio = Math.max(0.05, Math.min(0.99, 1 - index / Math.max(1, totalAnilistAvatars - 1)));
  return {
    ...item,
    type: 'avatar' as StoreCategory,
    desc: `رمز شخصي مميز للبطل ${item.name} مقيّم حسب شعبيته الجارفة في عالم الأنمي.`,
    _popRatio: popRankRatio,
    animeOrigin: item.name,
  };
});

const totalAnilistBanners = anilistBanners.length;
const baseBanners: any[] = anilistBanners.map((item, index) => {
  const popRankRatio = Math.max(0.05, Math.min(0.99, 1 - index / Math.max(1, totalAnilistBanners - 1)));
  return {
    ...item,
    type: 'banner' as StoreCategory,
    desc: `غلاف خلفي ملحمي من أنمي ${item.name} خاضع للتقدير والتقييم حسب شعبية العمل.`,
    _popRatio: popRankRatio,
    animeOrigin: item.name,
  };
});

const baseFrames: Partial<StoreItem>[] = [
  { id: 'fr_common_1', name: 'إطار الخشب البسيط', desc: 'إطار خشبي متواضع بلمسة دافئة وزوايا ناعمة', price: 0, type: 'frame', rarity: 'common', avatarShape: 'squircle', frameStyle: 'ring-2 ring-amber-800', animeOrigin: 'كلاسيكيات الأنمي' },
  { id: 'fr_common_2', name: 'إطار الحديد المطروق', desc: 'تصميم حديدي بسيط وثقيل يمنح الحساب مظهر الصمود', price: 0, type: 'frame', rarity: 'common', avatarShape: 'square', frameStyle: 'ring-2 ring-neutral-700', animeOrigin: 'دروع المحاربين' },
  { id: 'fr_square_crystal', name: 'إطار الكريستال الناعم', desc: 'إطار مربع خفيف مثل بلورات الماء المقطر الرقيقة', price: 0, type: 'frame', rarity: 'good', avatarShape: 'square', frameStyle: 'ring-2 ring-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.2)]', animeOrigin: 'سحر الكريستال' },
  { id: 'fr_good_1', name: 'إطار برونزي مصقول', desc: 'إطار دائري من البرونز اللامع يستحقه كل مكافح ومتابع نشيط', price: 0, type: 'frame', rarity: 'good', avatarShape: 'circle', frameStyle: 'ring-2 ring-amber-600/60 shadow-[0_0_8px_rgba(217,119,6,0.15)]', animeOrigin: 'نقابة المغامرين' },
  { id: 'fr_ninja_leaf', name: 'حامي الجبين الشينوبي', desc: 'لوحة معدنية مستوحاة من نينجا ورقة الشجر الأسطورية لبداية عهد جديد', price: 0, type: 'frame', rarity: 'good', avatarShape: 'square', frameStyle: 'ring-2 ring-emerald-600 border border-slate-300', animeOrigin: 'Naruto Shippuden' },
  { id: 'fr_circle_sakura', name: 'طوق الساكورا الربيعي', desc: 'هالة ربيعية دافئة هادئة محاطة بأوراق الساكورا الوردية الزاهية', price: 0, type: 'frame', rarity: 'good', avatarShape: 'circle', frameStyle: 'ring-2 ring-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.3)]', animeOrigin: 'أزهار الكرز' },
  { id: 'fr_triangle_crimson', name: 'المثلث الياقوتي الحاد', desc: 'إطار ثلاثي هندسي ملتهب بقوة شعلة الكي الياقوتية المتألقة', price: 0, type: 'frame', rarity: 'rare', avatarShape: 'triangle', frameStyle: 'border-[6px] border-red-600 shadow-[0_0_10px_#f43f5e] bg-transparent', animeOrigin: 'Flame Alchemist' },
  { id: 'fr_octagon_emerald', name: 'المثمن الزمردي المتألق', desc: 'إطار ثماني الأبعاد مصقول مروى بنقش النيون الزمردي البحت', price: 0, type: 'frame', rarity: 'rare', avatarShape: 'octagon', frameStyle: 'border-[6px] border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)] bg-transparent', animeOrigin: 'Hunter x Hunter' },
  { id: 'fr_triangle_solar', name: 'المثلث الشمسي المتوهج', desc: 'شكل ثلاثي هندسي مشرق بحرارة طاقة الكي الشعلية', price: 0, type: 'frame', rarity: 'rare', avatarShape: 'triangle', frameStyle: 'border-[6px] border-yellow-500 shadow-[0_0_12px_#fbbf24] bg-transparent', animeOrigin: 'تنفس الشمس' },
  { id: 'fr_death_note', name: 'إطار الشينيغامي الأسود', desc: 'وهج قادم من عالم الموتى بمسحة سوداء غامضة', price: 0, type: 'frame', rarity: 'rare', avatarShape: 'circle', frameStyle: 'ring-2 ring-black border border-neutral-800 shadow-[0_0_12px_rgba(0,0,0,1)]', animeOrigin: 'Death Note' },
  { id: 'fr_rhombus_void', name: 'معين البلازما المظلم', desc: 'جسم معين هندسي ذو أطراف متباينة يشع بهالة بنفسجية غامضة', price: 0, type: 'frame', rarity: 'epic', avatarShape: 'rhombus', frameStyle: 'border-[6px] border-purple-500 shadow-[0_0_15px_#c084fc] bg-transparent', animeOrigin: 'Jujutsu Kaisen' },
  { id: 'fr_1', name: 'إطار اللهب الملتهب', desc: 'نيران ملتهبة غاضبة تحيط بصورتك الدائرية الشغوفة بمشاهدة الحلقات', price: 0, type: 'frame', rarity: 'epic', avatarShape: 'circle', frameStyle: 'ring-2 ring-orange-500 shadow-[0_0_15px_orange]', animeOrigin: 'Fire Force' },
  { id: 'fr_2', name: 'إطار الأمواج الصافية', desc: 'أمواج صافية وعميقة تأخذ شكلاً ناعماً مستديراً وخلاباً لأصحاب الذوق المائي', price: 0, type: 'frame', rarity: 'epic', avatarShape: 'squircle', frameStyle: 'ring-2 ring-blue-500 shadow-[0_0_15px_blue] border-dashed border-2 border-cyan-300', animeOrigin: 'Kimetsu no Yaiba' },
  { id: 'fr_demon_slayer', name: 'تنفس الماء المائي', desc: 'تدفقات السيوف المائية المنحنية مقتبسة من قتلة الشياطين تكسو صورتك هيبة', price: 0, type: 'frame', rarity: 'epic', avatarShape: 'circle', frameStyle: 'ring-2 ring-teal-400 border border-white shadow-[0_0_12px_rgba(34,211,238,0.5)] animate-pulse', animeOrigin: 'Kimetsu no Yaiba' },
  { id: 'fr_hexagon_ruby', name: 'سداسي العقيق الناري', desc: 'جسم سداسي منتظم مروى بوهج زاهي يشع بالطاقة النقية الكثيفة', price: 0, type: 'frame', rarity: 'epic', avatarShape: 'hexagon', frameStyle: 'border-[6px] border-rose-600 shadow-[0_0_14px_rgba(225,29,72,0.5)] bg-transparent', animeOrigin: 'Fate/stay night' },
  { id: 'fr_new_rose_square', name: 'إطار الغابة الكرزي الفاخر', desc: 'إطار مربع ناعم مزدان بزخارف كرزية وورود متفتحة جذابة ومريحة للعين', price: 0, type: 'frame', rarity: 'epic', avatarShape: 'square', frameStyle: 'ring-2 ring-rose-400 border-2 border-rose-600 shadow-[0_0_12px_rgba(244,63,94,0.4)]', animeOrigin: 'Bleach: Senbonzakura' },
  { id: 'fr_7', name: 'إطار الصقيع الجليدي', desc: 'إطار مربع متجمد من رياح مملكة الجليد القاسية للمتابعين من ذوي الدم البارد والتركيز المطلق', price: 0, type: 'frame', rarity: 'epic', avatarShape: 'square', frameStyle: 'ring-4 ring-cyan-200 border-4 border-cyan-800 shadow-[0_0_15px_#22d3ee]', animeOrigin: 'Esdeath Frost' },
  { id: 'fr_new_plasma_hex', name: 'إطار البلازما سداسي الأضلاع', desc: 'هالة سداسية حقيقية تومض بطاقة دمج البلازما الفريدة من معارك الخيال العلمي الملحمية', price: 0, type: 'frame', rarity: 'epic', avatarShape: 'hexagon', frameStyle: 'border-[3px] border-fuchsia-500 shadow-[0_0_20px_#e879f9]', animeOrigin: 'Cyberpunk Edgerunners' },
  { id: 'fr_rhombus_shadow', name: 'إطار معين الشينوبي الغسقي', desc: 'إطار هندسي على شكل معين يحمل وهج النينجا الغسقي المظلم والتخفي الأسطوري', price: 0, type: 'frame', rarity: 'legendary', avatarShape: 'rhombus', frameStyle: 'border-[6px] border-zinc-500 shadow-[0_0_15px_rgba(0,0,0,0.8)] bg-transparent', animeOrigin: 'Solo Leveling' },
  { id: 'fr_egypt_gold', name: 'الملك الفرعوني المذهب', desc: 'إطار ذهبي عريق يحمل أسرار الأحجية الألفية والذهب الذي لا يفنى لمتابعي ألعاب الذكاء', price: 0, type: 'frame', rarity: 'legendary', avatarShape: 'square', frameStyle: 'ring-4 ring-yellow-500 border-2 border-amber-600 shadow-[0_0_15px_#fbbf24]', animeOrigin: 'Yu-Gi-Oh!' },
  { id: 'fr_s_1', name: 'أرجوان الرداء (السوسانو)', desc: 'دروع السوسانو الحامية لملفك الشخصي بعز ونبل شينوبي الأوتشيها ذوي القوة والأعين الخالدة', price: 0, type: 'frame', rarity: 'legendary', avatarShape: 'circle', frameStyle: 'ring-4 ring-purple-600 border-2 border-fuchsia-400 border-double shadow-[0_0_20px_#c084fc]', animeOrigin: 'Uchiha Susanoo' },
  { id: 'fr_new_cyber_squircle', name: 'إطار السايبر المستقبلي', desc: 'إطار سيبراني ناعم مستقبلي باللون الأخضر المشع يحاكي هولوغرام لوحات تحكم الفضاء العميقة', price: 0, type: 'frame', rarity: 'legendary', avatarShape: 'squircle', frameStyle: 'ring-4 ring-emerald-400 border-2 border-emerald-900 border-dashed shadow-[0_0_18px_#34d399]', animeOrigin: 'Steins;Gate' },
  { id: 'fr_3', name: 'غضب الهاكي الملكي', desc: 'هاكي ملكي مسود يرهب قلوب المنافسين والزوار ويثبت هيبتك العتيدة', price: 0, type: 'frame', rarity: 'legendary', avatarShape: 'circle', frameStyle: 'ring-4 ring-rose-900 border-4 border-black border-dashed shadow-[0_0_20px_#4c1d95]', animeOrigin: 'One Piece' },
  { id: 'fr_octagon_gold', name: 'المثمن الإمبراطوري المرصع', desc: 'ثماني أبعاد ذهبي عتيق براق ينبض ببريق الثراء وعرش الأباطرة لصفوة من يعتلون السيرفر', price: 0, type: 'frame', rarity: 'legendary', avatarShape: 'octagon', frameStyle: 'border-[6px] border-yellow-500 shadow-[0_0_20px_#f59e0b] bg-transparent', animeOrigin: 'Gilgamesh Gate' },
  { id: 'fr_9', name: 'إطار المجرة السداسية الساحرة', desc: 'سحابة نجوم سحيقة تلمع بقالب سداسي نادر فخم وساحر لكل المترددين', price: 0, type: 'frame', rarity: 'legendary', avatarShape: 'hexagon', frameStyle: 'border-[3px] border-fuchsia-600 shadow-[0_0_30px_fuchsia]', animeOrigin: 'Gurren Lagann' },
  { id: 'fr_cosmic_warp', name: 'نفق الالتواء السديمي', desc: 'إطار مشع كوني بألوان قوس قزح هولوغرافي يأتي مائلاً مثل انحناءة الزمكان الفضائي', price: 0, type: 'frame', rarity: 'cosmic', avatarShape: 'squircle', frameStyle: 'ring-4 ring-indigo-400 border-2 border-purple-500 shadow-[0_0_20px_#6366f1] animate-pulse', animeOrigin: 'Gojo Infinity' },
  { id: 'fr_4', name: 'هالة السايان الفائقة', desc: 'نهض طاقة الكي السايانية المتفجرة من السوبر سايان ولهيبها الذهبي المنبعث بلا نهاية', price: 0, type: 'frame', rarity: 'cosmic', avatarShape: 'circle', frameStyle: 'ring-4 ring-yellow-400 border-2 border-orange-500 shadow-[0_0_25px_rgba(234,179,8,0.8)] animate-pulse', animeOrigin: 'Dragon Ball Z' },
  { id: 'fr_squircle_star', name: 'النجم السديمي الفضائي', desc: 'هيكل مروحي مائل مرن مصقول بسديم أندروميدا المضيء الخارق ذو الجاذبية الساحقة', price: 0, type: 'frame', rarity: 'cosmic', avatarShape: 'squircle', frameStyle: 'border-[6px] border-indigo-500 shadow-[0_0_25px_#4f46e5] bg-transparent', animeOrigin: 'Sousou no Frieren' },
  { id: 'fr_10', name: 'مجد ملك القراصنة الذهبي', desc: 'الذهب الخالص الممزوج بإرادة الجوي بوي التي لا تهزم لتبرز فوق قمة كل القراصنة والمشاهدين', price: 0, type: 'frame', rarity: 'cosmic', avatarShape: 'circle', frameStyle: 'ring-[6px] ring-yellow-500 border-2 border-white shadow-[0_0_40px_yellow]', animeOrigin: 'One Piece Gear 5' },
  { id: 'fr_5', name: 'الغريزة الكونية سداسية الأضلاع', desc: 'توازن الهدوء والسرعة الهلالية بهالة سداسية فضية طاقة كاملة لمن حاز السمعة النقية الطيبة', price: 0, type: 'frame', rarity: 'cosmic', avatarShape: 'hexagon', frameStyle: 'border-[3px] border-slate-100 shadow-[0_0_35px_rgba(255,255,255,0.9)]', animeOrigin: 'Ultra Instinct' }
];

// NEW CATEGORY 1: Energy Auras & Combat Visuals (هالات الطاقة والقتال)
const baseAuras: Partial<StoreItem>[] = [
  {
    id: 'aura_chakra_blue',
    name: 'هالة التشاكرا الزرقاء',
    desc: 'تدفق تشاكرا نقي يحيط بصورتك وبطاقتك في الملف الشخصي والحلبة.',
    type: 'aura',
    rarity: 'good',
    auraStyle: 'ring-2 ring-sky-400/70 shadow-[0_0_18px_rgba(56,189,248,0.65)]',
    auraGradient: 'from-sky-500/25 via-cyan-500/10 to-blue-600/25',
    animeOrigin: 'Naruto Shippuden',
  },
  {
    id: 'aura_water_breathing',
    name: 'هالة تنفس الماء الهادئ',
    desc: 'موجات مائية متناغمة تحيط بهويتك وتمنحك سكون السيافين المهرة.',
    type: 'aura',
    rarity: 'rare',
    auraStyle: 'ring-2 ring-cyan-300/80 shadow-[0_0_22px_rgba(34,211,238,0.75)]',
    auraGradient: 'from-cyan-500/30 via-blue-500/15 to-teal-500/30',
    animeOrigin: 'Kimetsu no Yaiba',
  },
  {
    id: 'aura_cursed_energy',
    name: 'هالة الطاقة الملعونة القرمزية',
    desc: 'شرارات طاقة ملعونة سوداء وقرمزية تحاكيومضة الـ Black Flash الخارقة.',
    type: 'aura',
    rarity: 'epic',
    auraStyle: 'ring-3 ring-rose-600/80 shadow-[0_0_26px_rgba(225,29,72,0.85)] animate-pulse',
    auraGradient: 'from-rose-600/35 via-red-900/25 to-zinc-950/60',
    animeOrigin: 'Jujutsu Kaisen',
  },
  {
    id: 'aura_shadow_monarch',
    name: 'هالة عاهل الظلال (Arise)',
    desc: 'أبخرة أرجوانية ملكية تنبعث من خلفية حسابك كقائد جيش الظلال الأبدي.',
    type: 'aura',
    rarity: 'legendary',
    auraStyle: 'ring-4 ring-purple-500/80 shadow-[0_0_30px_rgba(168,85,247,0.9)] animate-pulse',
    auraGradient: 'from-purple-600/40 via-indigo-950/30 to-violet-600/40',
    animeOrigin: 'Solo Leveling',
  },
  {
    id: 'aura_conqueror_haki',
    name: 'هالة الهاكي الملكي الأعلى',
    desc: 'برق أحمر وأسود يضرب أركان ملفك الشخصي ويهز حضور المنافسين في الحلبة.',
    type: 'aura',
    rarity: 'legendary',
    auraStyle: 'ring-4 ring-red-600 shadow-[0_0_34px_rgba(239,68,68,0.95)] animate-pulse',
    auraGradient: 'from-red-600/40 via-rose-950/35 to-amber-600/30',
    animeOrigin: 'One Piece',
  },
  {
    id: 'aura_ultra_instinct',
    name: 'هالة الغريزة الفائقة الكونية',
    desc: 'طاقة فضية سماوية متوهجة تمثل أقصى درجات الإتقان والهيبة في مجتمع الأوتاكو.',
    type: 'aura',
    rarity: 'cosmic',
    auraStyle: 'ring-4 ring-white shadow-[0_0_40px_rgba(255,255,255,0.95)] animate-pulse',
    auraGradient: 'from-slate-200/35 via-indigo-400/25 to-cyan-300/35',
    animeOrigin: 'Dragon Ball Super',
  }
];

// NEW CATEGORY 2: Comment & Discussion Cards (بطاقات التعليقات والنقاش)
const baseCommentCards: Partial<StoreItem>[] = [
  {
    id: 'cc_leaf_scroll',
    name: 'لفافة كونوها العتيقة',
    desc: 'تمنح تعليقاتك إطاراً أخضر زمردياً وختم شينوبي كونوها في جميع نقاشات الأنمي.',
    type: 'comment_card',
    rarity: 'good',
    commentCardStyle: 'bg-gradient-to-l from-emerald-950/35 via-neutral-950 to-emerald-900/20 border border-emerald-500/30',
    commentCardBadge: '🍃 شينوبي كونوها',
    animeOrigin: 'Naruto Shippuden',
  },
  {
    id: 'cc_survey_corps',
    name: 'بطاقة أجنحة الحرية',
    desc: 'تصميم عسكري فخم لتعليقاتك مستوحى من فيلق الاستطلاع مع شارة الأجنحة.',
    type: 'comment_card',
    rarity: 'rare',
    commentCardStyle: 'bg-gradient-to-l from-amber-950/35 via-zinc-950 to-stone-900/40 border border-amber-600/35',
    commentCardBadge: '⚔️ فيلق الاستطلاع',
    animeOrigin: 'Shingeki no Kyojin',
  },
  {
    id: 'cc_unlimited_void',
    name: 'بطاقة اللانهاية الفضائية',
    desc: 'تحول خلفية تعليقك إلى سديم أزرق وبنفسجي عميق يجذب الأنظار فوراً.',
    type: 'comment_card',
    rarity: 'epic',
    commentCardStyle: 'bg-gradient-to-l from-indigo-950/50 via-purple-950/35 to-sky-950/40 border border-indigo-400/40 shadow-[0_0_15px_rgba(99,102,241,0.12)]',
    commentCardBadge: '♾️ مجال اللانهاية',
    animeOrigin: 'Jujutsu Kaisen',
  },
  {
    id: 'cc_blood_moon',
    name: 'بطاقة القمر القرمزي (الأكاتسوكي)',
    desc: 'خلفية سوداء ملكية موشحة بغيوم حمراء متوهجة تبرز آراءك النقدية بقوة.',
    type: 'comment_card',
    rarity: 'legendary',
    commentCardStyle: 'bg-gradient-to-l from-rose-950/55 via-black to-red-950/40 border border-rose-500/45 shadow-[0_0_18px_rgba(244,63,94,0.16)]',
    commentCardBadge: '🩸 القمر القرمزي',
    animeOrigin: 'Akatsuki Chronicles',
  },
  {
    id: 'cc_gear_fifth',
    name: 'بطاقة الجير الخامس الأسطورية',
    desc: 'أفخم بطاقة تعليق في المنصة؛ تتألق ببريق ذهبي وأرجواني مع ختم الإمبراطور.',
    type: 'comment_card',
    rarity: 'cosmic',
    commentCardStyle: 'bg-gradient-to-l from-yellow-950/50 via-purple-950/40 to-rose-950/45 border border-yellow-400/50 shadow-[0_0_24px_rgba(250,204,21,0.2)]',
    commentCardBadge: '☀️ إمبراطور البحار Nika',
    animeOrigin: 'One Piece',
  }
];

// NEW CATEGORY 3: Tactical Boosters & Consumables (المعززات التكتيكية)
const baseBoosters: StoreItem[] = [
  {
    id: 'boost_xp_24h',
    name: 'جرعة مضاعفة الخبرة (2x XP)',
    desc: 'تضاعف نقاط الخبرة المكتسبة من مشاهدة الحلقات والألعاب والتعليقات لمدة 24 ساعة كاملة.',
    price: 450,
    minLevel: 5,
    type: 'booster',
    rarity: 'rare',
    icon: Zap,
    color: 'text-sky-400',
    boosterKey: 'doubleXpUntil',
    boosterDurationHours: 24,
    popularityIndex: 91.5,
    animeScore: 8.9,
    favoritesCount: 34200,
    valuationGrade: 'SS',
    marketDemand: 'مرتفع جداً 🔥',
    animeOrigin: 'معززات التدريب المكثف',
  },
  {
    id: 'boost_coins_24h',
    name: 'تميمة الثروة المضاعفة (2x Coins)',
    desc: 'تمنحك ضعف الكوينز عند إنهاء الحلقات والفوز في تحديات حلبة الأوتاكو لمدة 24 ساعة.',
    price: 600,
    minLevel: 6,
    type: 'booster',
    rarity: 'epic',
    icon: Gem,
    color: 'text-yellow-400',
    boosterKey: 'doubleCoinsUntil',
    boosterDurationHours: 24,
    popularityIndex: 94.8,
    animeScore: 9.2,
    favoritesCount: 51800,
    valuationGrade: 'SS',
    marketDemand: 'مرتفع جداً 🔥',
    animeOrigin: 'خزانة الذهب الملكية',
  },
  {
    id: 'boost_streak_shield',
    name: 'درع حماية الستريك الذهبي',
    desc: 'يحمي سلسلة حضورك اليومي (Streak) من الانقطاع تلقائياً ليوم كامل في حال غيابك.',
    price: 520,
    minLevel: 5,
    type: 'booster',
    rarity: 'epic',
    icon: Shield,
    color: 'text-emerald-400',
    boosterKey: 'streakShieldCount',
    boosterAmount: 1,
    popularityIndex: 89.4,
    animeScore: 8.8,
    favoritesCount: 28900,
    valuationGrade: 'S',
    marketDemand: 'رائج ⚡',
    animeOrigin: 'ترس الحماية المطلق',
  },
  {
    id: 'boost_anticheat_hint',
    name: 'عدسة الشارينغان (تلميح اختبار الأنمي)',
    desc: 'تمنحك 3 تلميحات ذكية لاستبعاد إجابتين خاطئتين في اختبارات التحقق من مشاهدة الأنمي.',
    price: 380,
    minLevel: 5,
    type: 'booster',
    rarity: 'rare',
    icon: Eye,
    color: 'text-rose-400',
    boosterKey: 'antiCheatHintCount',
    boosterAmount: 3,
    popularityIndex: 87.2,
    animeScore: 8.6,
    favoritesCount: 21400,
    valuationGrade: 'S',
    marketDemand: 'رائج ⚡',
    animeOrigin: 'بصيرة الأوتشيها',
  },
  {
    id: 'boost_arena_stamina',
    name: 'حبة السِنزو الخالدة (طاقة الحلبة)',
    desc: 'تستعيد طاقة الحلبة اليومية بالكامل (+5 محاولات قتالية فورية) لمواصلة اللعب والتحدي.',
    price: 490,
    minLevel: 5,
    type: 'booster',
    rarity: 'legendary',
    icon: Flame,
    color: 'text-amber-400',
    boosterKey: 'staminaRefill',
    boosterAmount: 5,
    popularityIndex: 96.1,
    animeScore: 9.5,
    favoritesCount: 63000,
    valuationGrade: 'SSS+',
    marketDemand: 'مرتفع جداً 🔥',
    animeOrigin: 'Dragon Ball Z - Senzu Bean',
  }
];

const baseTitles: Partial<StoreItem>[] = [
  { id: 'title_common_1', name: 'لقب: مبتدئ الأوتاكو', desc: 'لقب بسيط يعبر عن خطواتك الأولى الفتية في عالم المشاهدة.', price: 0, type: 'title', rarity: 'common', color: 'text-neutral-400', bg: 'bg-black/40', border: 'border-neutral-900', icon: Shield, animeOrigin: 'رتب الأوتاكو' },
  { id: 'title_good_1', name: 'لقب: متابع متفاعل', desc: 'لقب رائع لمن يترك أثراً دائماً ورأياً طيباً حول الحلقات.', price: 0, type: 'title', rarity: 'good', color: 'text-green-400', bg: 'bg-black/60', border: 'border-neutral-800', icon: Star, animeOrigin: 'مجتمع النقاش' },
  { id: 'title_good_2', name: 'لقب: ناقد الأنمي القدير', desc: 'يستحق لبلوغ مستوى رائق من الفن ومتابعة الأساطير بآراء فريدة.', price: 0, type: 'title', rarity: 'good', color: 'text-cyan-400', bg: 'bg-black/70', border: 'border-cyan-950', icon: Palette, animeOrigin: 'نخبة النقاد' },
  { id: 'title_1', name: 'لقب: سيد الظلام', desc: 'يظهر بجانب اسمك، يعكس هدوءك وهيبتك الغامضة والعميقة كالقمر المظلم.', price: 0, type: 'title', rarity: 'epic', color: 'text-purple-500', bg: 'bg-black', border: 'border-neutral-800', icon: Moon, animeOrigin: 'Eminence in Shadow' },
  { id: 'title_2', name: 'لقب: إمبراطور النار', desc: 'يبرز شغفك والتهاب إرادتك المستعرة كالملك الوهّاج إيس صاحب الشعلة الأبدية.', price: 0, type: 'title', rarity: 'epic', color: 'text-orange-500', bg: 'bg-black', border: 'border-neutral-800', icon: Flame, animeOrigin: 'One Piece - Ace' },
  { id: 'title_3', name: 'لقب: الشبح الخفي', desc: 'نادر وخفي، ينفذ مهماته تحت ستار الليل بلا أثر أو صوت يعلو.', price: 0, type: 'title', rarity: 'epic', color: 'text-slate-400', bg: 'bg-black', border: 'border-neutral-800', icon: Ghost, animeOrigin: 'Phantom Troupe' },
  { id: 'title_9', name: 'لقب: شينوبي الرتبة S', desc: 'مطلوب في جميع القرى بقيمة مليارية لقوته الخارقة وقدراته الفتاكة المعجزة.', price: 0, type: 'title', rarity: 'legendary', color: 'text-emerald-400', bg: 'bg-black', border: 'border-neutral-800', icon: Swords, animeOrigin: 'Naruto Shippuden' },
  { id: 'title_4', name: 'لقب: سياف الغسق الأسطوري', desc: 'شفرة لا تصدأ عبر الزمن تقسم السحاب والبحار بسحبة واحدة وهدوء يحبس المتابعين.', price: 0, type: 'title', rarity: 'legendary', color: 'text-indigo-400', bg: 'bg-black', border: 'border-neutral-800', icon: Swords, animeOrigin: 'Roronoa Zoro' },
  { id: 'title_5', name: 'لقب: إله الدمار الفتاك', desc: 'قوة مفرطة تحطم كل شيء أمامها مع غضب الكي المخيف الأسطوري.', price: 0, type: 'title', rarity: 'legendary', color: 'text-red-500', bg: 'bg-black', border: 'border-neutral-800', icon: Skull, animeOrigin: 'Dragon Ball Super' },
  { id: 'title_10', name: 'لقب: صياد العمالقة الأقوى', desc: 'قائد فيلق الاستطلاع الطائر الذي لا يرحم في حماية ما تبقى وتحقيق الانتصار الأكيد.', price: 0, type: 'title', rarity: 'legendary', color: 'text-cyan-400', bg: 'bg-black', border: 'border-emerald-950', icon: Crosshair, animeOrigin: 'Attack on Titan' },
  { id: 'title_6', name: 'لقب: حامل الإرادة العتيقة', desc: 'الشعلة التي تفجر فجر العالم الجديد من قلب رافتيل محفورة في التاريخ والكتب القديمة.', price: 0, type: 'title', rarity: 'cosmic', color: 'text-yellow-400', bg: 'bg-black', border: 'border-neutral-800', icon: Sun, animeOrigin: 'One Piece' },
  { id: 'title_8', name: 'لقب: وريث الهاكي الملكي', desc: 'صاحب العيون القرمزية التي تخر لها جبابرة السيرفر ذعراً ومحبة وهدوءاً مهيباً.', price: 0, type: 'title', rarity: 'cosmic', color: 'text-[#ef4444]', bg: 'bg-neutral-950', border: 'border-red-900', icon: Zap, animeOrigin: 'Shanks Red Hair' },
  { id: 'title_7', name: 'لقب: الأوتاكو الأعظم فريد النظير', desc: 'اللقب الأسمى لمن ختم عالم الأنمي بالكامل واعتلى عرش المتابعين وأثبت أنه الرقم الصعب.', price: 0, type: 'title', rarity: 'cosmic', color: 'text-yellow-500', bg: 'bg-black', border: 'border-neutral-800', icon: Crown, animeOrigin: 'عرش الأوتاكو' },
  { id: 'title_god', name: 'لقب: الـمـاورائـي الإلـهـي', desc: 'تجاوز حدود مستويات الأنمي وفهم كينونة الحكاية كلياً ليدرك جوهر الأباطرة والملوك قاطبة.', price: 0, type: 'title', rarity: 'cosmic', color: 'text-rose-400 font-bold tracking-widest', bg: 'bg-black', border: 'border-neutral-800', icon: Sparkles, animeOrigin: 'القمة المطلقة' }
];

const baseBadges: Partial<StoreItem>[] = [
  { id: 'badge_common_1', name: 'شارة: البداية الفتية', desc: 'رمز العضوية الجديدة والترحيب بك في عالم الأباطرة.', price: 0, type: 'badge', rarity: 'common', color: 'text-neutral-400', bg: 'bg-black/50', border: 'border-neutral-950', icon: Shield, animeOrigin: 'وسام الترحيب' },
  { id: 'badge_good_1', name: 'شارة: الباحث الذكي', desc: 'لمن يعرف كيف يستخرج تفاصيل الأنمي ويبحث بتعمق.', price: 0, type: 'badge', rarity: 'good', color: 'text-amber-500', bg: 'bg-black/50', border: 'border-neutral-800', icon: Search, animeOrigin: 'أرشيف المعرفة' },
  { id: 'badge_1', name: 'شارة: عين الصقر', desc: 'دقة الملاحظة الأسطورية وقوة التركيز لقطع جبال الجليد.', price: 0, type: 'badge', rarity: 'rare', color: 'text-amber-500', bg: 'bg-black', border: 'border-neutral-800', icon: Eye, animeOrigin: 'Dracule Mihawk' },
  { id: 'badge_2', name: 'شارة: قلب شجاع لا يلين', desc: 'قلب لا يعرف الاستسلام، ينادي بالإرادة الحرة والحرية وكسر القيود.', price: 0, type: 'badge', rarity: 'epic', color: 'text-rose-500', bg: 'bg-black', border: 'border-neutral-800', icon: Heart, animeOrigin: 'إرادة الأبطال' },
  { id: 'badge_3', name: 'شارة: الغموض المطلق', desc: 'أسرار قديمة غامضة لم تكتشف بعد في المخطوطات السحرية للأوتاكو.', price: 0, type: 'badge', rarity: 'epic', color: 'text-fuchsia-500', bg: 'bg-black', border: 'border-neutral-800', icon: Ghost, animeOrigin: 'ساحة الذكاء' },
  { id: 'badge_5', name: 'شارة: الجوتسو السري الخارق', desc: 'رمز مستخدم العناصر الخمسة للنينجوتسو عالي التعقيد والتنفيذ.', price: 0, type: 'badge', rarity: 'legendary', color: 'text-teal-400', bg: 'bg-black', border: 'border-neutral-800', icon: Wind, animeOrigin: 'Naruto Shippuden' },
  { id: 'badge_4', name: 'شارة: أعين الشارينغان الخالدة', desc: 'أعين اليوتشيها الأسطورية القادرة على نسخ الحركات واستبصار الهجمات وتوقع الغد.', price: 0, type: 'badge', rarity: 'legendary', color: 'text-red-500', bg: 'bg-black', border: 'border-red-950', icon: Eye, animeOrigin: 'Itachi Uchiha' },
  { id: 'badge_6', name: 'شارة: إرادة الـ D الأبدية', desc: 'الحمل الموروث عبر العصور كالعاصفة التي ستجلب الفجر اللامع وتغير مصير العالم وعرش البحار.', price: 0, type: 'badge', rarity: 'cosmic', color: 'text-amber-400', bg: 'bg-neutral-950', border: 'border-yellow-950', icon: Anchor, animeOrigin: 'One Piece' }
];

// Helper to calculate rarity rank weight
const getRarityWeight = (rarity?: StoreRarity): number => {
  if (rarity === 'common') return 1;
  if (rarity === 'good') return 2;
  if (rarity === 'rare') return 3;
  if (rarity === 'epic') return 4;
  if (rarity === 'legendary') return 5;
  if (rarity === 'cosmic') return 6;
  return 1;
};

// 2. Separate Level 5 Starter Items explicitly (with full popularity & valuation metrics)
const itemLevi: StoreItem = {
  id: 'av_ani_45627',
  name: 'Levi Ackerman',
  desc: 'الرمز الترحيبي الأسطوري للبطل ليفاي أكرمان متاح فور فتح المتجر ومقيّم بأعلى درجات الشعبية.',
  price: 250,
  minLevel: 5,
  type: 'avatar',
  img: 'https://s4.anilist.co/file/anilistcdn/character/large/b45627-CR68RyZmddGG.png',
  rarity: 'legendary',
  popularityIndex: 99.4,
  animeScore: 9.1,
  favoritesCount: 148500,
  valuationGrade: 'SSS+',
  marketDemand: 'مرتفع جداً 🔥',
  animeOrigin: 'Shingeki no Kyojin',
};

const itemWoodFrame: StoreItem = {
  id: 'fr_common_1',
  name: 'إطار الخشب البسيط',
  desc: 'إطار خشبي دافئ يرمز لبداية رحلتك العظيمة بعد الوصول للمستوى 5.',
  price: 260,
  minLevel: 5,
  type: 'frame',
  avatarShape: 'squircle',
  frameStyle: 'ring-2 ring-amber-800',
  rarity: 'common',
  popularityIndex: 72.0,
  animeScore: 7.6,
  favoritesCount: 4200,
  valuationGrade: 'B',
  marketDemand: 'مستقر ✨',
  animeOrigin: 'كلاسيكيات الأنمي',
};

// Helper to map and scale an array of items systematically from startPrice to endPrice and startLevel to endLevel
// while computing their full Popularity & Valuation metrics
const mapPurchasablesList = (
  items: any[],
  startLevel: number,
  endLevel: number,
  startPrice: number,
  endPrice: number,
  preservePopularityOrder = false
): StoreItem[] => {
  const sorted = preservePopularityOrder
    ? [...items] // Keep AniList popularity order or flip so higher popularity scales or has accurate valuation
    : [...items].sort((a, b) => {
        const rA = getRarityWeight(a.rarity);
        const rB = getRarityWeight(b.rarity);
        if (rA !== rB) return rA - rB;
        return (a.name || '').localeCompare(b.name || '');
      });

  const total = sorted.length;
  if (total === 0) return [];

  return sorted.map((item, idx) => {
    const ratio = total === 1 ? 0.5 : idx / (total - 1);
    // If item has _popRatio from AniList (where index 0 was top popular), use it for valuation!
    const popRatio = typeof item._popRatio === 'number' ? item._popRatio : ratio;

    // Level range gradually increasing; for AniList items, higher popularity characters have higher valuation & balanced progression
    const progressionRatio = typeof item._popRatio === 'number' ? (1 - ratio * 0.65 + item._popRatio * 0.35) : ratio;
    const clampedProg = Math.max(0, Math.min(1, progressionRatio));

    const level = Math.min(endLevel, Math.max(startLevel, Math.floor(startLevel + ratio * (endLevel - startLevel))));

    // Price range gradually scaling up to endPrice, influenced by both progression and popularity valuation
    const linearPart = startPrice + ratio * (endPrice - startPrice);
    const curvePart = startPrice + Math.pow(ratio, 1.5) * (endPrice - startPrice);
    const popularityBonus = popRatio > 0.85 ? 1.15 : popRatio > 0.65 ? 1.05 : 1.0;
    const rawPrice = (0.8 * curvePart + 0.2 * linearPart) * popularityBonus;
    const price = Math.min(endPrice, Math.max(startPrice, Math.round(rawPrice / 10) * 10));

    // Compute universal popularity & valuation rating
    const valuation = computeItemValuation(Math.max(ratio * 0.5 + popRatio * 0.5, popRatio));

    let rarity: StoreRarity = valuation.rarity;
    if (level >= 92 || valuation.valuationGrade === 'SSS+') rarity = 'cosmic';
    else if (level >= 72 || valuation.valuationGrade === 'SS') rarity = 'legendary';
    else if (level >= 45 || valuation.valuationGrade === 'S') rarity = 'epic';
    else if (level >= 25 || valuation.valuationGrade === 'A+') rarity = 'rare';
    else if (level >= 12 || valuation.valuationGrade === 'A') rarity = 'good';

    return {
      ...item,
      price,
      minLevel: level,
      rarity,
      popularityIndex: valuation.popularityIndex,
      animeScore: valuation.animeScore,
      favoritesCount: valuation.favoritesCount,
      valuationGrade: valuation.valuationGrade,
      marketDemand: valuation.marketDemand,
      animeOrigin: item.animeOrigin || item.name,
    };
  });
};

// Filter remaining items to avoid duplication
// Reverse baseAvatars & baseBanners so starter levels get solid items while top-tier legends scale up to level 100 with SSS+ valuation
const remainingAvatars = [...baseAvatars.filter(x => x.id !== 'av_ani_45627')].reverse();
const remainingBanners = [...baseBanners].reverse();
const remainingFrames = baseFrames.filter(x => x.id !== 'fr_common_1');

// Scaled arrays for each category independently
const mappedAvatars = mapPurchasablesList(remainingAvatars, 6, 100, 270, 30000, true);
const mappedBanners = mapPurchasablesList(remainingBanners, 6, 100, 250, 30000, true);
const mappedFrames = mapPurchasablesList(remainingFrames, 6, 100, 270, 30000, false);
const mappedAuras = mapPurchasablesList(baseAuras, 6, 85, 650, 18000, false);
const mappedCommentCards = mapPurchasablesList(baseCommentCards, 6, 80, 550, 14000, false);

// Sort free earned honors and scale their levels from 6 to 100 gradually so they are not available before level 5 opens
const honorsList = [...baseTitles, ...baseBadges];
honorsList.sort((a, b) => {
  const rA = getRarityWeight(a.rarity);
  const rB = getRarityWeight(b.rarity);
  if (rA !== rB) return rA - rB;
  return (a.name || '').localeCompare(b.name || '');
});

const totalHonors = honorsList.length;
const mappedHonors: StoreItem[] = honorsList.map((item, idx) => {
  const ratio = idx / Math.max(1, totalHonors - 1);
  const level = Math.min(100, Math.floor(6 + ratio * 94));
  const valuation = computeItemValuation(ratio);

  let rarity: StoreRarity = 'common';
  if (level >= 95) rarity = 'cosmic';
  else if (level >= 75) rarity = 'legendary';
  else if (level >= 45) rarity = 'epic';
  else if (level >= 25) rarity = 'rare';
  else if (level >= 12) rarity = 'good';

  return {
    ...(item as StoreItem),
    price: 0,
    minLevel: level,
    rarity,
    popularityIndex: valuation.popularityIndex,
    animeScore: valuation.animeScore,
    favoritesCount: valuation.favoritesCount,
    valuationGrade: valuation.valuationGrade,
    marketDemand: valuation.marketDemand,
    animeOrigin: item.animeOrigin || 'أوسمة الشرف',
  };
});

// Create complete list of STORE_ITEMS ensuring all items have full valuation & rating metadata
export const STORE_ITEMS: StoreItem[] = [
  itemLevi,
  itemWoodFrame,
  ...mappedAvatars,
  ...mappedBanners,
  ...mappedFrames,
  ...mappedAuras,
  ...mappedCommentCards,
  ...baseBoosters,
  ...mappedHonors
];

export const STORE_ITEMS_SORTED = [...STORE_ITEMS].sort((a, b) => {
  const lvlA = a.minLevel || 5;
  const lvlB = b.minLevel || 5;
  if (lvlA !== lvlB) return lvlA - lvlB;
  return a.price - b.price;
});

// Deterministic Daily Flash Deals (عروض البرق اليومية بخصم 35% إلى 50%)
export function getDailyFlashDeals(allItems: StoreItem[] = STORE_ITEMS_SORTED): {
  item: StoreItem;
  originalPrice: number;
  discountedPrice: number;
  discountPercent: number;
}[] {
  const todayStr = new Date().toISOString().split('T')[0];
  let seed = 0;
  for (let i = 0; i < todayStr.length; i++) {
    seed = (seed * 31 + todayStr.charCodeAt(i)) % 100000;
  }

  const purchasables = allItems.filter(i => i.price >= 300 && i.type !== 'title' && i.type !== 'badge');
  if (purchasables.length === 0) return [];

  const deals: {
    item: StoreItem;
    originalPrice: number;
    discountedPrice: number;
    discountPercent: number;
  }[] = [];

  const usedIds = new Set<string>();
  const discountOptions = [35, 40, 45, 50];

  for (let slot = 0; slot < 4; slot++) {
    const idx = (seed + slot * 97) % purchasables.length;
    const candidate = purchasables[idx];
    if (candidate && !usedIds.has(candidate.id)) {
      usedIds.add(candidate.id);
      const discountPercent = discountOptions[(seed + slot) % discountOptions.length];
      const discountedPrice = Math.max(100, Math.round((candidate.price * (100 - discountPercent)) / 1000) * 10);
      deals.push({
        item: candidate,
        originalPrice: candidate.price,
        discountedPrice,
        discountPercent,
      });
    }
  }

  return deals;
}

export function isBadgeUnlocked(badgeId: string, userData: any): boolean {
  if (!userData) return false;
  const level = userData.level || 1;
  
  const badgeItem = STORE_ITEMS.find(i => i.id === badgeId);
  const requiredLevel = badgeItem?.minLevel || 6;
  
  if (level < requiredLevel) return false;

  const commentsCount = userData.commentsCount || 0;
  const ratingsCount = userData.ratingsCount || 0;
  const streakDays = userData.streakDays || 0;
  const aiGamesPoints = userData.aiGamesPoints || 0;
  const likesReceived = userData.likesReceived || 0;
  const approvedRecommendationsCount = userData.approvedRecommendationsCount || 0;
  const completedAnimeCount = userData.completedAnimeCount || 0;
  const totalEpisodesWatched = userData.totalEpisodesWatched || 0;
  const listCount = userData.listCount || 0;

  switch (badgeId) {
    case 'badge_common_1':
      return commentsCount >= 1;
    case 'badge_good_1':
      return ratingsCount >= 1 || listCount >= 3;
    case 'badge_1':
      return commentsCount >= 5;
    case 'badge_2':
      return streakDays >= 7;
    case 'badge_3':
      return aiGamesPoints >= 100;
    case 'badge_5':
      return commentsCount >= 15;
    case 'badge_4':
      return likesReceived >= 3 || approvedRecommendationsCount >= 1;
    case 'badge_6':
      return completedAnimeCount >= 5 || totalEpisodesWatched >= 40;
    default:
      return true;
  }
}

export function getBadgeRequirementDesc(badgeId: string): string {
  const badgeItem = STORE_ITEMS.find(i => i.id === badgeId);
  const requiredLevel = badgeItem?.minLevel || 6;
  
  const baseDesc = (() => {
    switch (badgeId) {
      case 'badge_common_1':
        return "كتابة تعليق واحد على الأقل";
      case 'badge_good_1':
        return "إرسال تقييم واحد فما فوق، أو وجود 3 عناصر بالكلية في قائمتك";
      case 'badge_1':
        return "نشر 5 تعليقات أو ردود نقاشية حية بالأنمي";
      case 'badge_2':
        return "تحقيق سلسلة دخول يومية متتالية لـ 7 أيام بلا انقطاع";
      case 'badge_3':
        return "إحراز حظوة 100 نقطة فما فوق في ساحات ألعاب الأنمي";
      case 'badge_5':
        return "كتابة ما لا يقل عن 15 تعليقاً فاعلاً ومنظماً";
      case 'badge_4':
        return "تلقي 3 إعجابات تفاعل، أو قبول توصية فريدة لك من قبل المشرفين";
      case 'badge_6':
        return "إنهاء مشاهدة 5 أنميات، أو تخطي 40 حلقة";
      default:
        return "تتطلب تفاعلاً مستمراً وإثبات جدارة في مجتمع الأوتاكو";
    }
  })();
  
  return `${baseDesc} (يتطلب أيضاً مستوى ${requiredLevel})`;
}

export function isTitleUnlocked(item: StoreItem, userData: any): boolean {
  if (!userData) return false;
  const level = userData.level || 1;
  return level >= (item.minLevel || 1);
}
