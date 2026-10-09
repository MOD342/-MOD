/**
 * محرك التقويم والفعاليات الذكي غير المتداخل (Smart Non-Overlapping Event Calendar Engine)
 * يضمن وجود حدث رئيسي واحد فقط نشط في أي لحظة دون تداخل:
 * - الأسابيع 1 و 2 و 3 من الشهر: تحدي أسبوعي فريد غير مكرر
 * - الأسبوع الأخير من الشهر: يتحول تلقائياً إلى البطولة الشهرية الكبرى (Monthly Grand Clash)
 * - الأسبوع الأخير من الموسم (نهاية مارس / يونيو / سبتمبر / ديسمبر): يتحول تلقائياً إلى مهرجان القمة الموسمي (Seasonal Festival)
 */

export type EventTier = 'weekly' | 'monthly' | 'seasonal';
export type BattleModeId = 'wrestling' | 'cards' | 'hawk_eye' | 'higher_lower';

export interface ActiveArenaEvent {
  id: string;
  tier: EventTier;
  tierBadgeAr: string;
  title: string;
  titleAr: string;
  subtitle: string;
  subtitleAr: string;
  bannerGradient: string;
  specialRuleAr: string;
  recommendedMode: BattleModeId;
  rewardMultiplier: number;
  prizePoolCoins: number;
  prizeTitleAr: string;
  endsAtMs: number;
  weekIndexInMonth: number; // 1..4
  isMonthEndWeek: boolean;
  isSeasonEndWeek: boolean;
  roadmap: {
    step: number;
    label: string;
    title: string;
    tier: EventTier;
    status: 'completed' | 'active' | 'upcoming';
  }[];
}

export const SEASONAL_FACTIONS = [
  {
    id: 'pirates',
    nameAr: 'أسطول قراصنة العالم الجديد 🏴‍☠️',
    mottoAr: 'الحرية والهيمنة على البحار الكبرى',
    baseScore: 18420,
    color: 'text-red-400',
    bg: 'bg-red-500/15',
    border: 'border-red-500/30'
  },
  {
    id: 'scouts',
    nameAr: 'فيلق الاستطلاع والأجنحة ⚔️',
    mottoAr: 'كرّسوا قلوبكم من أجل النصر',
    baseScore: 17890,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/30'
  },
  {
    id: 'sorcerers',
    nameAr: 'نقابة السحرة والشينيغامي 🌙',
    mottoAr: 'توسيع المجال والقوة المطلقة',
    baseScore: 19150,
    color: 'text-purple-400',
    bg: 'bg-purple-500/15',
    border: 'border-purple-500/30'
  },
  {
    id: 'hunters',
    nameAr: 'صيادو القارة والظلال ⚡',
    mottoAr: 'الارتقاء المنفرد وتخطي الحدود',
    baseScore: 18740,
    color: 'text-amber-400',
    bg: 'bg-amber-500/15',
    border: 'border-amber-500/30'
  }
];

export interface ArenaQuestionItem {
  id: string;
  mode: BattleModeId;
  prompt: string;
  animeName: string;
  imageUrl: string;
  options: string[];
  correctIndex: number;
  cardStats?: {
    power: number;
    iq: number;
    speed: number;
  };
}

export interface WrestlingFighterCard {
  id: string;
  name: string;
  anime: string;
  imageUrl: string;
  power: number;
  speed: number;
  iq: number;
  hype: number;
  specialMove: string;
}

export const ANIME_FIGHTER_DECK: WrestlingFighterCard[] = [
  {
    id: 'luffy-g5',
    name: 'مونكي دي لوفي (Gear 5)',
    anime: 'One Piece',
    imageUrl: 'https://cdn.myanimelist.net/images/characters/9/310307.jpg',
    power: 98,
    speed: 96,
    iq: 78,
    hype: 99,
    specialMove: 'باجرانج غان (Bajrang Gun)'
  },
  {
    id: 'zoro-koh',
    name: 'رورونوا زورو',
    anime: 'One Piece',
    imageUrl: 'https://cdn.myanimelist.net/images/characters/3/100534.jpg',
    power: 95,
    speed: 93,
    iq: 80,
    hype: 97,
    specialMove: 'ملك الجحيم (King of Hell)'
  },
  {
    id: 'gojo-satoru',
    name: 'ساتورو غوجو',
    anime: 'Jujutsu Kaisen',
    imageUrl: 'https://cdn.myanimelist.net/images/characters/15/422168.jpg',
    power: 99,
    speed: 98,
    iq: 96,
    hype: 99,
    specialMove: 'الفراغ اللانهائي (Infinite Void)'
  },
  {
    id: 'levi-ackerman',
    name: 'ليفاي أكرمان',
    anime: 'Attack on Titan',
    imageUrl: 'https://cdn.myanimelist.net/images/characters/2/241413.jpg',
    power: 94,
    speed: 99,
    iq: 95,
    hype: 98,
    specialMove: 'عاصفة النصل الدوارة'
  },
  {
    id: 'eren-yeager',
    name: 'إيرين ييغر',
    anime: 'Attack on Titan',
    imageUrl: 'https://cdn.myanimelist.net/images/characters/10/216895.jpg',
    power: 97,
    speed: 88,
    iq: 92,
    hype: 98,
    specialMove: 'هدير الأرض (The Rumbling)'
  },
  {
    id: 'itachi-uchiha',
    name: 'إيتاتشي أوتشيها',
    anime: 'Naruto Shippuden',
    imageUrl: 'https://cdn.myanimelist.net/images/characters/9/284122.jpg',
    power: 94,
    speed: 95,
    iq: 99,
    hype: 98,
    specialMove: 'تسوكويومي وأماتيراسو'
  },
  {
    id: 'naruto-baryon',
    name: 'ناروتو أوزوماكي',
    anime: 'Naruto Shippuden',
    imageUrl: 'https://cdn.myanimelist.net/images/characters/2/284121.jpg',
    power: 98,
    speed: 97,
    iq: 86,
    hype: 99,
    specialMove: 'طور الباريون (Baryon Mode)'
  },
  {
    id: 'sung-jinwoo',
    name: 'سونغ جين وو',
    anime: 'Solo Leveling',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1097/140263l.jpg',
    power: 99,
    speed: 98,
    iq: 94,
    hype: 99,
    specialMove: 'انهض (Arise - جيش الظلال)'
  },
  {
    id: 'light-yagami',
    name: 'لايت ياغامي (كيرا)',
    anime: 'Death Note',
    imageUrl: 'https://cdn.myanimelist.net/images/characters/6/63870.jpg',
    power: 72,
    speed: 82,
    iq: 100,
    hype: 95,
    specialMove: 'حكم مفكرة الموت'
  },
  {
    id: 'l-lawliet',
    name: 'إل (L Lawliet)',
    anime: 'Death Note',
    imageUrl: 'https://cdn.myanimelist.net/images/characters/10/249647.jpg',
    power: 75,
    speed: 84,
    iq: 100,
    hype: 96,
    specialMove: 'الاستنتاج المطلق'
  },
  {
    id: 'tanjiro-kamado',
    name: 'تانجيرو كامادو',
    anime: 'Demon Slayer',
    imageUrl: 'https://cdn.myanimelist.net/images/characters/6/386735.jpg',
    power: 91,
    speed: 93,
    iq: 88,
    hype: 94,
    specialMove: 'رقصة إله النار (Hinokami Kagura)'
  },
  {
    id: 'killua-zoldyck',
    name: 'كيلوا زولديك',
    anime: 'Hunter x Hunter',
    imageUrl: 'https://cdn.myanimelist.net/images/characters/2/327920.jpg',
    power: 92,
    speed: 99,
    iq: 96,
    hype: 97,
    specialMove: 'سرعة البرق (Godspeed)'
  }
];

export const ARENA_QUESTION_POOL: ArenaQuestionItem[] = [
  {
    id: 'q1',
    mode: 'wrestling',
    prompt: 'من هو صاحب تقنية «الفراغ اللانهائي (Infinite Void)»؟',
    animeName: 'Jujutsu Kaisen',
    imageUrl: 'https://cdn.myanimelist.net/images/characters/15/422168.jpg',
    options: ['ساتورو غوجو', 'ريومين سوكونا', 'ميغومي فوشيغورو', 'يوجي إيتادوري'],
    correctIndex: 0
  },
  {
    id: 'q2',
    mode: 'hawk_eye',
    prompt: 'تعرف على هذا البطل من اللقطة البصرية قبل خصومك!',
    animeName: 'Attack on Titan',
    imageUrl: 'https://cdn.myanimelist.net/images/characters/2/241413.jpg',
    options: ['إيروين سميث', 'ليفاي أكرمان', 'إيرين ييغر', 'جان كيرشتاين'],
    correctIndex: 1
  },
  {
    id: 'q3',
    mode: 'wrestling',
    prompt: 'ما هو اسم السيف الملعون الذي حصل عليه زورو في بلاد وانو؟',
    animeName: 'One Piece',
    imageUrl: 'https://cdn.myanimelist.net/images/characters/3/100534.jpg',
    options: ['وادو إيتشيمونجي', 'شوسوي', 'إنما (Enma)', 'سانداي كيتيتسو'],
    correctIndex: 2
  },
  {
    id: 'q4',
    mode: 'hawk_eye',
    prompt: 'من هي هذه الشخصية الأسطورية من عالم الشينوبي؟',
    animeName: 'Naruto Shippuden',
    imageUrl: 'https://cdn.myanimelist.net/images/characters/9/284122.jpg',
    options: ['مادارا أوتشيها', 'ساسكي أوتشيها', 'أوبيتو أوتشيها', 'إيتاتشي أوتشيها'],
    correctIndex: 3
  },
  {
    id: 'q5',
    mode: 'higher_lower',
    prompt: 'أي من هذين العملين يمتلك عدد حلقات أكثر في البث الرسمي؟',
    animeName: 'مقارنة الأرقام',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1244/138851l.jpg',
    options: ['One Piece (+1100 حلقة)', 'Naruto Shippuden (500 حلقة)', 'Bleach (366 حلقة)', 'Hunter x Hunter (148 حلقة)'],
    correctIndex: 0
  },
  {
    id: 'q6',
    mode: 'wrestling',
    prompt: 'ما هي الكلمة الشهيرة التي يطلقها «سونغ جين وو» لاستدعاء جيش الظلال؟',
    animeName: 'Solo Leveling',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1097/140263l.jpg',
    options: ['احترق (Burn)', 'انهض (Arise)', 'اختفِ (Vanish)', 'اقطع (Slash)'],
    correctIndex: 1
  },
  {
    id: 'q7',
    mode: 'hawk_eye',
    prompt: 'من هو هذا العبقري الذي واجه كيرا في معركة الذكاء؟',
    animeName: 'Death Note',
    imageUrl: 'https://cdn.myanimelist.net/images/characters/10/249647.jpg',
    options: ['نير (Near)', 'ميلو (Mello)', 'إل (L Lawliet)', 'لايت ياغامي'],
    correctIndex: 2
  },
  {
    id: 'q8',
    mode: 'wrestling',
    prompt: 'ما هو نوع النين الذي يتقنه «كيلوا زولديك» في Hunter x Hunter؟',
    animeName: 'Hunter x Hunter',
    imageUrl: 'https://cdn.myanimelist.net/images/characters/2/327920.jpg',
    options: ['التعزيز (Enhancer)', 'التحويل (Transmuter)', 'التجسيد (Conjurer)', 'التلاعب (Manipulator)'],
    correctIndex: 1
  },
  {
    id: 'q9',
    mode: 'higher_lower',
    prompt: 'أي أنمي من التالي حصل على التقييم العالمي الأعلى (9.3+)؟',
    animeName: 'مقارنة التقييمات',
    imageUrl: 'https://cdn.myanimelist.net/images/anime/1015/138075l.jpg',
    options: ['Frieren: Beyond Journey\'s End', 'Tokyo Ghoul', 'Blue Lock', 'Sword Art Online'],
    correctIndex: 0
  },
  {
    id: 'q10',
    mode: 'wrestling',
    prompt: 'كم عدد العمالقة المتحولين الأصليين في أنمي هجوم العمالقة؟',
    animeName: 'Attack on Titan',
    imageUrl: 'https://cdn.myanimelist.net/images/characters/10/216895.jpg',
    options: ['7 عمالقة', '9 عمالقة', '12 عملاقاً', '5 عمالقة'],
    correctIndex: 1
  }
];

const WEEKLY_ROTATION_THEMES = [
  {
    title: 'حلبة البقاء الرباعية (4-Players Knockout)',
    subtitle: 'نزالات مصارعة حية بين 2 إلى 4 لاعبين بنظام استنزاف نقاط الصحة (HP)',
    specialRuleAr: 'قانون الأسبوع: الضربة القاضية في أول 4 ثوانٍ تضاعف الضرر ضد خصومك (2X Damage)!',
    recommendedMode: 'wrestling' as BattleModeId,
    prizePoolCoins: 2500,
    prizeTitleAr: 'مصارع الحلبة الفولاذي'
  },
  {
    title: 'أسبوع قنص البطاقات التكتيكي (Card Clash Week)',
    subtitle: 'مبارزات أوراق الأبطال بخصائص القوة والسرعة والذكاء الحقيقية',
    specialRuleAr: 'قانون الأسبوع: بطاقات الذكاء (IQ 95+) تحصل على تعزيز دفاعي إضافي في كل جولة!',
    recommendedMode: 'cards' as BattleModeId,
    prizePoolCoins: 3000,
    prizeTitleAr: 'سيد البطاقات الأسطوري'
  },
  {
    title: 'رادار الشارينغان الخاطف (Hawk-Eye Sprint)',
    subtitle: 'كشف اللقطات المشوشة والعيون في أجزاء من الثانية قبل منافسيك في الغرفة',
    specialRuleAr: 'قانون الأسبوع: الإجابة قبل اتضاح 50% من الصورة تمنحك +50 نقطة هيبة إضافية!',
    recommendedMode: 'hawk_eye' as BattleModeId,
    prizePoolCoins: 2800,
    prizeTitleAr: 'صاحب عين الصقر'
  }
];

const MONTHLY_GRAND_THEMES = [
  {
    title: 'بطولة صراع الأساطير الشهرية (Grand Monthly Clash)',
    subtitle: 'الحدث الشهري الكبير لنهاية الشهر — يلغي التحدي الأسبوعي ويمنح جوائز 3X!',
    specialRuleAr: 'قانون نهاية الشهر: جميع انتصارات الغرف تضاعف نقاط التصدر والرهان 3 مرات!',
    recommendedMode: 'wrestling' as BattleModeId,
    prizePoolCoins: 7500,
    prizeTitleAr: 'بطل الشهر الذهبي'
  },
  {
    title: 'غارة الزعيم وحرب التحالفات الشهرية',
    subtitle: 'حدث نهاية الشهر الاستثنائي — اجمع الانتصارات في الحلبة لرفع راية تحالفك!',
    specialRuleAr: 'قانون نهاية الشهر: كل فوز في غرفة متعددة اللاعبين يمنحك صندوق غنائم إضافي!',
    recommendedMode: 'cards' as BattleModeId,
    prizePoolCoins: 8000,
    prizeTitleAr: 'قائد التحالف الشهري'
  }
];

const SEASONAL_FESTIVAL_THEMES: Record<number, {
  seasonAr: string;
  title: string;
  subtitle: string;
  specialRuleAr: string;
  prizePoolCoins: number;
  prizeTitleAr: string;
}> = {
  2: {
    seasonAr: 'شتاء',
    title: 'مهرجان القمة الموسمي (أولمبياد الشتاء الكبرى)',
    subtitle: 'الحدث الموسمي الأعظم لنهاية موسم الشتاء — يتوج أباطرة الموسم بالكامل!',
    specialRuleAr: 'قانون نهاية الموسم: جوائز 5X + تخليد الفائزين الثلاثة الأوائل في قاعة شرف الموسم!',
    prizePoolCoins: 20000,
    prizeTitleAr: 'إمبراطور موسم الشتاء'
  },
  5: {
    seasonAr: 'ربيع',
    title: 'مهرجان القمة الموسمي (أولمبياد الربيع الكبرى)',
    subtitle: 'الحدث الموسمي الأعظم لنهاية موسم الربيع — يتوج أباطرة الموسم بالكامل!',
    specialRuleAr: 'قانون نهاية الموسم: جوائز 5X + تخليد الفائزين الثلاثة الأوائل في قاعة شرف الموسم!',
    prizePoolCoins: 20000,
    prizeTitleAr: 'إمبراطور موسم الربيع'
  },
  8: {
    seasonAr: 'صيف',
    title: 'مهرجان القمة الموسمي (أولمبياد الصيف الكبرى)',
    subtitle: 'الحدث الموسمي الأعظم لنهاية موسم الصيف — يتوج أباطرة الموسم بالكامل!',
    specialRuleAr: 'قانون نهاية الموسم: جوائز 5X + تخليد الفائزين الثلاثة الأوائل في قاعة شرف الموسم!',
    prizePoolCoins: 20000,
    prizeTitleAr: 'إمبراطور موسم الصيف'
  },
  11: {
    seasonAr: 'خريف',
    title: 'مهرجان القمة الموسمي (أولمبياد الخريف الكبرى)',
    subtitle: 'الحدث الموسمي الأعظم لنهاية موسم الخريف — يتوج أباطرة الموسم بالكامل!',
    specialRuleAr: 'قانون نهاية الموسم: جوائز 5X + تخليد الفائزين الثلاثة الأوائل في قاعة شرف الموسم!',
    prizePoolCoins: 20000,
    prizeTitleAr: 'إمبراطور موسم الخريف'
  }
};

export function getActiveNonOverlappingEvent(now = new Date()): ActiveArenaEvent {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0..11
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // تقسيم الشهر إلى 4 أسابيع متتالية غير متداخلة
  let weekIndexInMonth = Math.min(4, Math.ceil(dayOfMonth / 7));
  const isMonthEndWeek = dayOfMonth > daysInMonth - 7 || weekIndexInMonth === 4;
  const isSeasonEndMonth = month === 2 || month === 5 || month === 8 || month === 11;
  const isSeasonEndWeek = isMonthEndWeek && isSeasonEndMonth;

  // حساب نهاية الأسبوع الحالي بدقة للعد التنازلي الحي
  const endDay =
    weekIndexInMonth === 1
      ? 7
      : weekIndexInMonth === 2
      ? 14
      : weekIndexInMonth === 3
      ? 21
      : daysInMonth;
  const endsAtDate = new Date(year, month, endDay, 23, 59, 59, 999);
  const endsAtMs = endsAtDate.getTime();

  // بناء خريطة الطريق الشهرية والموسمية غير المتداخلة
  const w1Theme = WEEKLY_ROTATION_THEMES[(month * 3 + 0) % WEEKLY_ROTATION_THEMES.length];
  const w2Theme = WEEKLY_ROTATION_THEMES[(month * 3 + 1) % WEEKLY_ROTATION_THEMES.length];
  const w3Theme = WEEKLY_ROTATION_THEMES[(month * 3 + 2) % WEEKLY_ROTATION_THEMES.length];
  const monthlyTheme = MONTHLY_GRAND_THEMES[month % MONTHLY_GRAND_THEMES.length];
  const seasonalTheme = SEASONAL_FESTIVAL_THEMES[month];

  const finalWeekNode = isSeasonEndMonth && seasonalTheme
    ? {
        step: 4,
        label: 'الأسبوع 4 (نهاية الموسم)',
        title: seasonalTheme.title,
        tier: 'seasonal' as EventTier,
        status: (weekIndexInMonth === 4 ? 'active' : 'upcoming') as 'completed' | 'active' | 'upcoming'
      }
    : {
        step: 4,
        label: 'الأسبوع 4 (نهاية الشهر)',
        title: monthlyTheme.title,
        tier: 'monthly' as EventTier,
        status: (weekIndexInMonth === 4 ? 'active' : 'upcoming') as 'completed' | 'active' | 'upcoming'
      };

  const roadmap: ActiveArenaEvent['roadmap'] = [
    {
      step: 1,
      label: 'الأسبوع 1',
      title: w1Theme.title,
      tier: 'weekly',
      status: weekIndexInMonth > 1 ? 'completed' : 'active'
    },
    {
      step: 2,
      label: 'الأسبوع 2',
      title: w2Theme.title,
      tier: 'weekly',
      status: weekIndexInMonth > 2 ? 'completed' : weekIndexInMonth === 2 ? 'active' : 'upcoming'
    },
    {
      step: 3,
      label: 'الأسبوع 3',
      title: w3Theme.title,
      tier: 'weekly',
      status: weekIndexInMonth > 3 ? 'completed' : weekIndexInMonth === 3 ? 'active' : 'upcoming'
    },
    finalWeekNode
  ];

  // قاعدة عدم التداخل:
  // 1) إذا كنا في الأسبوع الأخير من الموسم -> الحدث الموسمي يسيطر ويلغي الشهري والأسبوعي
  if (isSeasonEndWeek && seasonalTheme) {
    return {
      id: `seasonal-${year}-${month + 1}`,
      tier: 'seasonal',
      tierBadgeAr: `مهرجان نهاية موسم الـ${seasonalTheme.seasonAr} 🏆`,
      title: seasonalTheme.title,
      titleAr: seasonalTheme.title,
      subtitle: seasonalTheme.subtitle,
      subtitleAr: seasonalTheme.subtitle,
      bannerGradient: 'from-amber-950/60 via-[#12121a] to-red-950/40',
      specialRuleAr: seasonalTheme.specialRuleAr,
      recommendedMode: 'wrestling',
      rewardMultiplier: 5,
      prizePoolCoins: seasonalTheme.prizePoolCoins,
      prizeTitleAr: seasonalTheme.prizeTitleAr,
      endsAtMs,
      weekIndexInMonth: 4,
      isMonthEndWeek: true,
      isSeasonEndWeek: true,
      roadmap
    };
  }

  // 2) إذا كنا في الأسبوع الأخير من الشهر -> الحدث الشهري يسيطر ويلغي الأسبوعي
  if (isMonthEndWeek) {
    return {
      id: `monthly-${year}-${month + 1}`,
      tier: 'monthly',
      tierBadgeAr: 'البطولة الشهرية الكبرى 👑',
      title: monthlyTheme.title,
      titleAr: monthlyTheme.title,
      subtitle: monthlyTheme.subtitle,
      subtitleAr: monthlyTheme.subtitle,
      bannerGradient: 'from-purple-950/60 via-[#12121a] to-rose-950/40',
      specialRuleAr: monthlyTheme.specialRuleAr,
      recommendedMode: monthlyTheme.recommendedMode,
      rewardMultiplier: 3,
      prizePoolCoins: monthlyTheme.prizePoolCoins,
      prizeTitleAr: monthlyTheme.prizeTitleAr,
      endsAtMs,
      weekIndexInMonth: 4,
      isMonthEndWeek: true,
      isSeasonEndWeek: false,
      roadmap
    };
  }

  // 3) في الأسابيع 1 و 2 و 3 -> التحدي الأسبوعي المتنوع غير المكرر
  const activeWeekly = [w1Theme, w2Theme, w3Theme][Math.max(0, Math.min(2, weekIndexInMonth - 1))];
  return {
    id: `weekly-${year}-${month + 1}-w${weekIndexInMonth}`,
    tier: 'weekly',
    tierBadgeAr: `تحدي الأسبوع ${weekIndexInMonth} النشط ⚡`,
    title: activeWeekly.title,
    titleAr: activeWeekly.title,
    subtitle: activeWeekly.subtitle,
    subtitleAr: activeWeekly.subtitle,
    bannerGradient: 'from-red-950/50 via-[#12121a] to-zinc-950',
    specialRuleAr: activeWeekly.specialRuleAr,
    recommendedMode: activeWeekly.recommendedMode,
    rewardMultiplier: 2,
    prizePoolCoins: activeWeekly.prizePoolCoins,
    prizeTitleAr: activeWeekly.prizeTitleAr,
    endsAtMs,
    weekIndexInMonth,
    isMonthEndWeek: false,
    isSeasonEndWeek: false,
    roadmap
  };
}

export function getCombatRankInfo(xp = 0, wins = 0) {
  const totalPower = xp + wins * 250;
  if (totalPower >= 25000) {
    return { rankAr: 'يونكو الحلبة (Yonko)', color: 'text-red-400', border: 'border-red-500/40', bg: 'bg-red-500/15', minPower: 25000, nextPower: 50000 };
  }
  if (totalPower >= 12000) {
    return { rankAr: 'هاشيرا أسطوري (Hashira)', color: 'text-amber-400', border: 'border-amber-500/40', bg: 'bg-amber-500/15', minPower: 12000, nextPower: 25000 };
  }
  if (totalPower >= 5000) {
    return { rankAr: 'جونين نخبة (Jonin)', color: 'text-purple-400', border: 'border-purple-500/40', bg: 'bg-purple-500/15', minPower: 5000, nextPower: 12000 };
  }
  if (totalPower >= 1500) {
    return { rankAr: 'تشونين مقاتل (Chunin)', color: 'text-sky-400', border: 'border-sky-500/40', bg: 'bg-sky-500/15', minPower: 1500, nextPower: 5000 };
  }
  return { rankAr: 'مقاتل صاعد (Genin)', color: 'text-emerald-400', border: 'border-emerald-500/40', bg: 'bg-emerald-500/15', minPower: 0, nextPower: 1500 };
}

/**
 * 1. درع منع التجميع اللانهائي وطاقة الحلبة اليومية (Daily Stamina Shield - 10/10)
 */
export const MAX_DAILY_ARENA_STAMINA = 10;

export function getDailyArenaStamina(userId = 'guest'): number {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const key = `arena_stamina_${userId}_${today}`;
    const stored = localStorage.getItem(key);
    if (stored === null) return MAX_DAILY_ARENA_STAMINA;
    return Math.max(0, Math.min(MAX_DAILY_ARENA_STAMINA, parseInt(stored, 10)));
  } catch {
    return MAX_DAILY_ARENA_STAMINA;
  }
}

export function consumeArenaStamina(userId = 'guest'): { remaining: number; hadStamina: boolean } {
  try {
    const current = getDailyArenaStamina(userId);
    if (current <= 0) {
      return { remaining: 0, hadStamina: false };
    }
    const next = current - 1;
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(`arena_stamina_${userId}_${today}`, String(next));
    return { remaining: next, hadStamina: true };
  } catch {
    return { remaining: MAX_DAILY_ARENA_STAMINA, hadStamina: true };
  }
}

/**
 * 2. قفل الجوائز الذري لمنع تكرار استلام مكافأة نفس المباراة أو التحدي (Idempotent Lock)
 */
export function isRewardClaimedLock(lockId: string): boolean {
  try {
    return localStorage.getItem(`arena_lock_${lockId}`) === '1';
  } catch {
    return false;
  }
}

export function setRewardClaimedLock(lockId: string): void {
  try {
    localStorage.setItem(`arena_lock_${lockId}`, '1');
  } catch {}
}

/**
 * 3. محرك عدم التكرار الشخصي (Seen-History Ring Buffer)
 */
export function getNonRepeatingQuestions(count = 6): ArenaQuestionItem[] {
  try {
    const raw = localStorage.getItem('arena_seen_q_buffer');
    let seenIds: string[] = raw ? JSON.parse(raw) : [];
    let unseen = ARENA_QUESTION_POOL.filter((q) => !seenIds.includes(q.id));
    if (unseen.length < count) {
      seenIds = [];
      unseen = [...ARENA_QUESTION_POOL];
    }
    const picked = [...unseen].sort(() => Math.random() - 0.5).slice(0, count);
    const nextSeen = [...seenIds, ...picked.map((p) => p.id)].slice(-14);
    localStorage.setItem('arena_seen_q_buffer', JSON.stringify(nextSeen));
    return picked;
  } catch {
    return [...ARENA_QUESTION_POOL].sort(() => Math.random() - 0.5).slice(0, count);
  }
}

/**
 * 4. صندوق تتويج البطولة المنتهية (Auto-Settlement Vault)
 */
export function getPreviousEndedEventVault(now = new Date()) {
  const prevDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prevEvent = getActiveNonOverlappingEvent(prevDate);
  const rewardCoins = prevEvent.tier === 'seasonal' ? 350 : prevEvent.tier === 'monthly' ? 200 : 120;
  const rewardXp = prevEvent.tier === 'seasonal' ? 500 : prevEvent.tier === 'monthly' ? 300 : 180;
  return {
    id: `settled_${prevEvent.id}`,
    title: prevEvent.title,
    tierBadgeAr: prevEvent.tierBadgeAr,
    rewardCoins,
    rewardXp
  };
}

/**
 * 5. درع الصور البصري الفوري (SVG Vector Emblem Fallback - 0% Broken Images)
 */
export function getAnimeSvgFallback(label = 'OTAKU', accentHex = '#FF1744'): string {
  const clean = (label || 'OTAKU').slice(0, 10).replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240">
    <defs>
      <radialGradient id="g" cx="50%" cy="40%" r="65%">
        <stop offset="0%" stop-color="${accentHex}" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#090910" stop-opacity="1"/>
      </radialGradient>
    </defs>
    <rect width="200" height="240" rx="24" fill="url(#g)"/>
    <circle cx="100" cy="95" r="46" fill="none" stroke="${accentHex}" stroke-width="3" stroke-dasharray="10 6"/>
    <path d="M100 58 L113 88 L145 92 L120 113 L127 144 L100 127 L73 144 L80 113 L55 92 L87 88 Z" fill="${accentHex}" opacity="0.85"/>
    <text x="100" y="195" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-weight="900" font-size="16">${clean}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

