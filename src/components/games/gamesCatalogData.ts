import { ANIME_FIGHTER_DECK } from "../../services/arenaCalendarEngine";
import shinobiDojoBg from '../../assets/images/anime_shinobi_dojo_world_1791458726380.jpg';
import cosmicBeamBg from '../../assets/images/anime_cosmic_beam_clash_1791458749014.jpg';
import shadowDungeonBg from '../../assets/images/anime_shadow_dungeon_boss_1791458737559.jpg';
import colosseumWorldBg from '../../assets/images/anime_arena_colosseum_world_1791458713003.jpg';
import throneHallBg from '../../assets/images/anime_tournament_throne_hall_1791458763249.jpg';

export const ANIME_WORLD_BACKGROUNDS = {
  colosseum: colosseumWorldBg,
  dojo: shinobiDojoBg,
  dungeon: shadowDungeonBg,
  cosmic: cosmicBeamBg,
  throne: throneHallBg
};

export type VisualGameId =
  | 'hero_fighter_2d'
  | 'ninjutsu_seal_canvas'
  | 'card_clash'
  | 'dungeon_gate_explorer'
  | 'katana_slash'
  | 'beam_clash'
  | 'ultra_dodge'
  | 'sharingan_radar'
  | 'boss_raid'
  | 'sky_tower'
  | 'shinobi_parkour';

export interface VisualGameMeta {
  id: VisualGameId;
  titleAr: string;
  subtitleAr: string;
  studioTag: string;
  tagAr: string;
  accentColor: string;
  gradient: string;
  worldArt: string;
  fighterImg: string;
  targetScore: number;
  isFlagship?: boolean;
  descriptionAr?: string;
}

export interface StoryChapterMeta {
  chapterNumber: number;
  id: string;
  titleAr: string;
  subtitleAr: string;
  bossNameAr: string;
  bossAvatar: string;
  gameId: VisualGameId;
  targetScore: number;
  rewardCoins: number;
  rewardXp: number;
  unlockHeroId?: string;
  unlockHeroNameAr?: string;
  unlockStoreItemId?: string;
  unlockStoreItemNameAr?: string;
  accentColor: string;
}

export const STORY_CAMPAIGN_CHAPTERS: StoryChapterMeta[] = [
  {
    chapterNumber: 1,
    id: 'ch_1_shinobi_seals',
    titleAr: 'الفصل 1: لفافة الأختام المحرمة',
    subtitleAr: 'ارسم أختام الشاكرا بالسحب المباشر لإطلاق تقنيات النينجيتسو وتدمير حراس الغابة',
    bossNameAr: 'أوروتشيمارو السياف',
    bossAvatar: ANIME_FIGHTER_DECK[5].imageUrl,
    gameId: 'ninjutsu_seal_canvas',
    targetScore: 260,
    rewardCoins: 180,
    rewardXp: 220,
    unlockHeroId: 'naruto-baryon',
    unlockHeroNameAr: 'ناروتو Baryon (شهاب كونوها)',
    unlockStoreItemId: 'fr_ninja_leaf',
    unlockStoreItemNameAr: 'إطار حامي الجبين الأوتاكو',
    accentColor: '#00E5FF'
  },
  {
    chapterNumber: 2,
    id: 'ch_2_fighter_arena',
    titleAr: 'الفصل 2: ملحمة قتال الأبطال 2D',
    subtitleAr: 'قتال فيزيائي مباشر بالتحريك والقفز المزدوج والصدّ والضربات القاضية',
    bossNameAr: 'كايدو ملك الوحوش',
    bossAvatar: ANIME_FIGHTER_DECK[0].imageUrl,
    gameId: 'hero_fighter_2d',
    targetScore: 300,
    rewardCoins: 240,
    rewardXp: 280,
    unlockHeroId: 'luffy-g5',
    unlockHeroNameAr: 'مونكي دي لوفي (Gear 5)',
    unlockStoreItemId: 'fr_1',
    unlockStoreItemNameAr: 'إطار اللهب الملتهب',
    accentColor: '#FF1744'
  },
  {
    chapterNumber: 3,
    id: 'ch_3_tactical_cards',
    titleAr: 'الفصل 3: طاولة حرب البطاقات 3D',
    subtitleAr: 'استدعِ مقاتلي الهولوغرام ثلاثيي الأبعاد وفعّل تآزر العناصر وكسر الدروع',
    bossNameAr: 'إمبراطور الهولوغرام',
    bossAvatar: ANIME_FIGHTER_DECK[8].imageUrl,
    gameId: 'card_clash',
    targetScore: 280,
    rewardCoins: 280,
    rewardXp: 320,
    unlockHeroId: 'zoro-koh',
    unlockHeroNameAr: 'رورونوا زورو (ملك الجحيم)',
    unlockStoreItemId: 'fr_egypt_gold',
    unlockStoreItemNameAr: 'إطار الملك الفرعوني المذهب',
    accentColor: '#a855f7'
  },
  {
    chapterNumber: 4,
    id: 'ch_4_shadow_dungeon',
    titleAr: 'الفصل 4: بوابة الدانجون الحمراء S-Rank',
    subtitleAr: 'استكشف غرف الدانجون، تفادَ الفخاخ، واستخرج جيش الظلال (ARISE)',
    bossNameAr: 'إيغريس الفارس الدموي',
    bossAvatar: ANIME_FIGHTER_DECK[7].imageUrl,
    gameId: 'dungeon_gate_explorer',
    targetScore: 320,
    rewardCoins: 350,
    rewardXp: 400,
    unlockHeroId: 'sung-jinwoo',
    unlockHeroNameAr: 'سونغ جين وو (عاهل الظلال)',
    unlockStoreItemId: 'fr_rhombus_void',
    unlockStoreItemNameAr: 'إطار معين البلازما المظلم',
    accentColor: '#10b981'
  },
  {
    chapterNumber: 5,
    id: 'ch_5_dojo_katana',
    titleAr: 'الفصل 5: دوجو القمر القرمزي',
    subtitleAr: 'اقطع كرات الطاقة بسرعة الضوء وتفادَ الأختام المتفجرة بسيف الكاتانا',
    bossNameAr: 'ميهوك عين الصقر',
    bossAvatar: ANIME_FIGHTER_DECK[1].imageUrl,
    gameId: 'katana_slash',
    targetScore: 310,
    rewardCoins: 380,
    rewardXp: 420,
    unlockHeroId: 'levi-ackerman',
    unlockHeroNameAr: 'القائد ليفاي أكرمان',
    unlockStoreItemId: 'fr_demon_slayer',
    unlockStoreItemNameAr: 'إطار تنفس الماء المائي',
    accentColor: '#f43f5e'
  },
  {
    chapterNumber: 6,
    id: 'ch_6_beam_collision',
    titleAr: 'الفصل 6: تصادم الفراغ اللانهائي',
    subtitleAr: 'ادفع موجة الطاقة الكونية في صراع أشعة سينمائي واضرب نقاط الضعف الحرجة',
    bossNameAr: 'ريومين سوكونا',
    bossAvatar: ANIME_FIGHTER_DECK[2].imageUrl,
    gameId: 'beam_clash',
    targetScore: 340,
    rewardCoins: 450,
    rewardXp: 500,
    unlockHeroId: 'gojo-satoru',
    unlockHeroNameAr: 'ساتورو غوجو (الأعين الست)',
    unlockStoreItemId: 'fr_s_1',
    unlockStoreItemNameAr: 'إطار أرجوان السوسانو',
    accentColor: '#f59e0b'
  },
  {
    chapterNumber: 7,
    id: 'ch_7_sharingan_genjutsu',
    titleAr: 'الفصل 7: متاهة التسوكويومي الخالدة',
    subtitleAr: 'اكشف أوهام الشارينغان البصرية قبل تلاشي الرؤية وانتصر بسرعة البديهة',
    bossNameAr: 'إيتاتشي أوتشيها',
    bossAvatar: ANIME_FIGHTER_DECK[5].imageUrl,
    gameId: 'sharingan_radar',
    targetScore: 320,
    rewardCoins: 500,
    rewardXp: 550,
    unlockHeroId: 'itachi-uchiha',
    unlockHeroNameAr: 'إيتاتشي أوتشيها (الملياردير البصري)',
    unlockStoreItemId: 'fr_3',
    unlockStoreItemNameAr: 'إطار غضب الهاكي الملكي',
    accentColor: '#ef4444'
  },
  {
    chapterNumber: 8,
    id: 'ch_8_emperor_finale',
    titleAr: 'الفصل 8: عرش إمبراطور الأنمي الأعلى',
    subtitleAr: 'المعركة الفيزيائية النهائية بكل القدرات والأختام والظلال لاعتلاء عرش السيرفر',
    bossNameAr: 'حاكم الأبعاد الأعلى',
    bossAvatar: ANIME_FIGHTER_DECK[4].imageUrl,
    gameId: 'hero_fighter_2d',
    targetScore: 420,
    rewardCoins: 800,
    rewardXp: 900,
    unlockHeroId: 'eren-founder',
    unlockHeroNameAr: 'إيرين ييغر (سيد العمالقة)',
    unlockStoreItemId: 'fr_10',
    unlockStoreItemNameAr: 'إطار مجد ملك القراصنة الذهبي',
    accentColor: '#eab308'
  }
];

export const VISUAL_ANIME_GAMES: VisualGameMeta[] = [
  {
    id: 'hero_fighter_2d',
    titleAr: 'قتال الأبطال 2D بالفيزياء والقدرات',
    subtitleAr: '2D PHYSICS ARENA FIGHTER • COMBO, PARRY & ULTIMATE',
    studioTag: '2D FIGHTER ENGINE 60FPS',
    tagAr: 'قتال وفيزياء 2D 🥊',
    accentColor: '#FF1744',
    gradient: 'from-red-600/50 via-rose-950/75 to-[#05050a]',
    worldArt: colosseumWorldBg,
    fighterImg: ANIME_FIGHTER_DECK[0].imageUrl,
    targetScore: 300,
    isFlagship: true,
    descriptionAr: 'حركة حرة، قفز مزدوج، اندفاع طيفي، صدّ الهجمات، كومبو متسلسل وضربات قاضية سينمائية!'
  },
  {
    id: 'ninjutsu_seal_canvas',
    titleAr: 'رسم أختام النينجيتسو بالسحب المباشر',
    subtitleAr: 'HAND-SEAL GESTURE CANVAS • ELEMENTAL JUTSU INVOKER',
    studioTag: 'CHAKRA GESTURE AI',
    tagAr: 'رسم الأختام باليد ⛩️',
    accentColor: '#00E5FF',
    gradient: 'from-cyan-500/45 via-slate-950/80 to-[#05050a]',
    worldArt: shinobiDojoBg,
    fighterImg: ANIME_FIGHTER_DECK[6].imageUrl,
    targetScore: 260,
    isFlagship: true,
    descriptionAr: 'ارسم مسارات الأختام النارية والبرقية بإصبعك أو الماوس على الشاشة لإطلاق تقنيات النينجيتسو!'
  },
  {
    id: 'card_clash',
    titleAr: 'حرب البطاقات التكتيكية 3D',
    subtitleAr: '3D HOLOGRAM SUMMONER TABLE • ELEMENTAL SYNERGY',
    studioTag: '3D TACTICAL DUEL',
    tagAr: 'حرب بطاقات 3D 🃏',
    accentColor: '#a855f7',
    gradient: 'from-purple-600/50 via-indigo-950/75 to-[#05050a]',
    worldArt: throneHallBg,
    fighterImg: ANIME_FIGHTER_DECK[2].imageUrl,
    targetScore: 280,
    isFlagship: true,
    descriptionAr: 'طاولة استدعاء ثلاثية الأبعاد مع تحريك انقضاض البطاقات، كسر الدروع، وتآزر العناصر والمكتبة!'
  },
  {
    id: 'dungeon_gate_explorer',
    titleAr: 'استكشاف الدانجون وبوابات الزعماء',
    subtitleAr: 'DIMENSIONAL GATE CRAWLER • SHADOW EXTRACTION RPG',
    studioTag: 'ARISE DUNGEON ENGINE',
    tagAr: 'دانجون واستخراج ظلال 👹',
    accentColor: '#10b981',
    gradient: 'from-emerald-600/50 via-teal-950/75 to-[#05050a]',
    worldArt: shadowDungeonBg,
    fighterImg: ANIME_FIGHTER_DECK[7].imageUrl,
    targetScore: 320,
    isFlagship: true,
    descriptionAr: 'افتح البوابات من رتبة E إلى S، تنقل بين الغرف والمذابح، واستخرج جنود الظلال ليقاتلوا معك!'
  },
  {
    id: 'katana_slash',
    titleAr: 'نصل الشينوبي القاطع',
    subtitleAr: 'SHINOBI BLOOD MOON DOJO • 2D SLASH ACTION',
    studioTag: 'DOJO ARCADE v2.5',
    tagAr: 'فيزياء وتقطيع 🗡️',
    accentColor: '#FF1744',
    gradient: 'from-red-600/45 via-rose-950/70 to-[#05050a]',
    worldArt: shinobiDojoBg,
    fighterImg: ANIME_FIGHTER_DECK[1].imageUrl,
    targetScore: 280
  },
  {
    id: 'beam_clash',
    titleAr: 'تصادم الموجات الخارقة',
    subtitleAr: 'COSMIC KAMEHAMEHA & VOID CLASH • 2D FIGHTER',
    studioTag: 'HYPER FIGHTER 2D',
    tagAr: 'صراع أشعة ⚡',
    accentColor: '#f59e0b',
    gradient: 'from-amber-500/45 via-orange-950/70 to-[#05050a]',
    worldArt: cosmicBeamBg,
    fighterImg: ANIME_FIGHTER_DECK[0].imageUrl,
    targetScore: 300
  },
  {
    id: 'ultra_dodge',
    titleAr: 'مدار الغريزة الفائقة',
    subtitleAr: 'ULTRA INSTINCT MIRAGE • COSMIC SURVIVAL',
    studioTag: 'ZERO GRAVITY 60FPS',
    tagAr: 'مراوغة كونية 🌀',
    accentColor: '#38bdf8',
    gradient: 'from-sky-500/45 via-blue-950/70 to-[#05050a]',
    worldArt: cosmicBeamBg,
    fighterImg: ANIME_FIGHTER_DECK[11].imageUrl,
    targetScore: 260
  },
  {
    id: 'sharingan_radar',
    titleAr: 'عدسة الشارينغان',
    subtitleAr: 'UCHIHA GENJUTSU EYE • VISUAL RADAR',
    studioTag: 'OCULAR ENGINE',
    tagAr: 'رادار بصري 👁️',
    accentColor: '#ef4444',
    gradient: 'from-rose-600/45 via-red-950/70 to-[#05050a]',
    worldArt: shinobiDojoBg,
    fighterImg: ANIME_FIGHTER_DECK[5].imageUrl,
    targetScore: 240
  },
  {
    id: 'boss_raid',
    titleAr: 'غارة زعيم الدانجون',
    subtitleAr: 'SOLO SHADOW MONARCH RAID • ARISE RPG',
    studioTag: 'DUNGEON RAID RPG',
    tagAr: 'قتال زعماء 👹',
    accentColor: '#10b981',
    gradient: 'from-emerald-600/45 via-teal-950/70 to-[#05050a]',
    worldArt: shadowDungeonBg,
    fighterImg: ANIME_FIGHTER_DECK[7].imageUrl,
    targetScore: 320
  },
  {
    id: 'sky_tower',
    titleAr: 'برج السماء والمخاطرة',
    subtitleAr: 'HEAVENS ARENA FLOOR CLIMBER • NEN RISK',
    studioTag: 'TOWER OF GODS',
    tagAr: 'صعود وغنائم 🗼',
    accentColor: '#eab308',
    gradient: 'from-yellow-500/45 via-amber-950/70 to-[#05050a]',
    worldArt: colosseumWorldBg,
    fighterImg: ANIME_FIGHTER_DECK[3].imageUrl,
    targetScore: 250
  },
  {
    id: 'shinobi_parkour',
    titleAr: 'سباق أسطح كونوها',
    subtitleAr: 'KONOHA ROOFTOP NINJA RUNNER • 2D PARKOUR',
    studioTag: 'SHINOBI RUNNER 2D',
    tagAr: 'ركض وقفز 🏃‍♂️',
    accentColor: '#ec4899',
    gradient: 'from-pink-600/45 via-fuchsia-950/70 to-[#05050a]',
    worldArt: shinobiDojoBg,
    fighterImg: ANIME_FIGHTER_DECK[6].imageUrl,
    targetScore: 260
  }
];

export interface PlayableHero {
  id: string;
  name: string;
  titleAr: string;
  avatar: string;
  auraColor: string;
  secondaryColor: string;
  ultimateNameAr: string;
  power: number;
  speed: number;
  elementAr: string;
}


export interface SealPatternDef {
  id: string;
  nameAr: string;
  jutsuCallAr: string;
  elementAr: string;
  color: string;
  secondaryColor: string;
  baseDamage: number;
  // إحداثيات معيارية (0..1) لنقاط الختم المتسلسلة
  nodes: { x: number; y: number; label: string }[];
}

export const NINJUTSU_SEAL_PATTERNS: SealPatternDef[] = [
  {
    id: 'katon_pentagram',
    nameAr: 'ختم النجمة الخماسية النارية',
    jutsuCallAr: 'كاتون: كرة النار العظمى (FIREBALL JUTSU)! 🔥',
    elementAr: 'عنصر النار 🔥',
    color: '#FF1744',
    secondaryColor: '#facc15',
    baseDamage: 28,
    nodes: [
      { x: 0.5, y: 0.14, label: 'تنين' },
      { x: 0.82, y: 0.78, label: 'نمر' },
      { x: 0.16, y: 0.38, label: 'طائر' },
      { x: 0.84, y: 0.38, label: 'أفعى' },
      { x: 0.18, y: 0.78, label: 'كبش' },
      { x: 0.5, y: 0.14, label: 'إطلاق!' }
    ]
  },
  {
    id: 'raiton_chidori',
    nameAr: 'ختم صاعقة البرق القاطعة',
    jutsuCallAr: 'رايتون: سيف الألف طائر (CHIDORI BLADE)! ⚡',
    elementAr: 'عنصر البرق ⚡',
    color: '#00E5FF',
    secondaryColor: '#ffffff',
    baseDamage: 30,
    nodes: [
      { x: 0.75, y: 0.15, label: 'ثور' },
      { x: 0.25, y: 0.38, label: 'أرنب' },
      { x: 0.72, y: 0.52, label: 'قرد' },
      { x: 0.22, y: 0.82, label: 'برق!' },
      { x: 0.78, y: 0.82, label: 'اختراق!' }
    ]
  },
  {
    id: 'fuuton_rasengan',
    nameAr: 'لولب عاصفة الراسينغان',
    jutsuCallAr: 'فوتون: راسين شوريكين العملاقة! 🌀',
    elementAr: 'عنصر الرياح 🌪️',
    color: '#38bdf8',
    secondaryColor: '#a855f7',
    baseDamage: 32,
    nodes: [
      { x: 0.5, y: 0.15, label: 'شمال' },
      { x: 0.84, y: 0.36, label: 'شرق' },
      { x: 0.74, y: 0.78, label: 'مدار' },
      { x: 0.26, y: 0.78, label: 'عاصفة' },
      { x: 0.16, y: 0.36, label: 'ضغط' },
      { x: 0.5, y: 0.5, label: 'نواة!' }
    ]
  },
  {
    id: 'shadow_monarch_gate',
    nameAr: 'ختم بوابة عاهل الظلال',
    jutsuCallAr: 'انهضوا يا جيش الظلال (SHADOW EXTRACTION)! 🌑',
    elementAr: 'عنصر الظلال 🌑',
    color: '#a855f7',
    secondaryColor: '#10b981',
    baseDamage: 34,
    nodes: [
      { x: 0.5, y: 0.12, label: 'قمة' },
      { x: 0.85, y: 0.5, label: 'يمين' },
      { x: 0.5, y: 0.86, label: 'هاوية' },
      { x: 0.15, y: 0.5, label: 'يسار' },
      { x: 0.5, y: 0.12, label: 'قفل' },
      { x: 0.5, y: 0.5, label: 'انهض!' }
    ]
  },
  {
    id: 'domain_infinity',
    nameAr: 'ختم توسيع المجال اللانهائي',
    jutsuCallAr: 'توسيع المجال: الفراغ البنفسجي (HOLLOW PURPLE)! ♾️',
    elementAr: 'الفراغ الكوني ♾️',
    color: '#e879f9',
    secondaryColor: '#38bdf8',
    baseDamage: 36,
    nodes: [
      { x: 0.2, y: 0.25, label: 'أحمر' },
      { x: 0.2, y: 0.75, label: 'جذب' },
      { x: 0.8, y: 0.25, label: 'أزرق' },
      { x: 0.8, y: 0.75, label: 'دفع' },
      { x: 0.5, y: 0.5, label: 'فراغ!' }
    ]
  }
];

export interface DungeonRoomNode {
  id: number;
  row: number;
  titleAr: string;
  type: 'monster' | 'altar' | 'chest' | 'boss';
  cleared: boolean;
  unlocked: boolean;
  enemyNameAr: string;
  enemyImg: string;
  rankBadge: string;
}

export interface ShadowSoldierAlly {
  id: string;
  nameAr: string;
  rank: string;
  atkBonus: number;
  color: string;
}

export interface LibrarySynergyInfo {
  totalWatchedEpisodes: number;
  completedAnime: number;
  listCount: number;
  atkBonusPct: number;
  startUltBonus: number;
  coinMult: number;
  rankTitleAr: string;
}

export function computeAnimeLibrarySynergy(userData: any): LibrarySynergyInfo {
  const totalWatchedEpisodes = Number(userData?.totalEpisodesWatched || 0);
  const completedAnime = Number(userData?.completedAnimeCount || 0);
  const listCount = Number(userData?.listCount || 0);

  const rawPoints = completedAnime * 6 + Math.floor(totalWatchedEpisodes / 3) + listCount * 2;
  const atkBonusPct = Math.min(60, 5 + rawPoints);
  const startUltBonus = Math.min(45, 10 + completedAnime * 5 + Math.floor(totalWatchedEpisodes / 10) * 3);
  const coinMult = Number((1 + Math.min(0.75, rawPoints * 0.015)).toFixed(2));

  let rankTitleAr = 'متابع صاعد (+5% هجوم)';
  if (atkBonusPct >= 45) rankTitleAr = 'إمبراطور المكتبة الأسطوري 🔥';
  else if (atkBonusPct >= 25) rankTitleAr = 'خبير الأنمي المخضرم ⚡';
  else if (atkBonusPct >= 12) rankTitleAr = 'صياد الحلقات المحترف 🗡️';

  return {
    totalWatchedEpisodes,
    completedAnime,
    listCount,
    atkBonusPct,
    startUltBonus,
    coinMult,
    rankTitleAr
  };
}
