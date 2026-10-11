import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Swords,
  Zap,
  Flame,
  Shield,
  Heart,
  Trophy,
  X,
  Play,
  Sparkles,
  Layers,
  RotateCcw,
  Crown,
  Target,
  Volume2,
  VolumeX,
  ChevronLeft,
  Coins,
  Compass,
  Wand2,
  Lock,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  ArrowUp
} from 'lucide-react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform
} from 'motion/react';
import ThreeAnimeParallaxScene from './ThreeAnimeParallaxScene';
import {
  ANIME_FIGHTER_DECK,
  ARENA_QUESTION_POOL,
  getAnimeSvgFallback,
  getNonRepeatingQuestions
} from '../services/arenaCalendarEngine';
import { useAuth } from '../contexts/AuthContext';

import shinobiDojoBg from '../assets/images/anime_shinobi_dojo_world_1791458726380.jpg';
import cosmicBeamBg from '../assets/images/anime_cosmic_beam_clash_1791458749014.jpg';
import shadowDungeonBg from '../assets/images/anime_shadow_dungeon_boss_1791458737559.jpg';
import colosseumWorldBg from '../assets/images/anime_arena_colosseum_world_1791458713003.jpg';
import throneHallBg from '../assets/images/anime_tournament_throne_hall_1791458763249.jpg';

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

interface PlayableHero {
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

// ============================================================================
// محرك المؤثرات الصوتية المدمج (Web Audio Synthesizer Arcade SFX)
// ============================================================================
class ArcadeAudioEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private getCtx(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playSlash() {
    const ctx = this.getCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(680, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.14);
      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.14);
    } catch {}
  }

  playSealNode(stepIndex: number) {
    const ctx = this.getCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const baseFreq = 320 + stepIndex * 95;
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {}
  }

  playHit() {
    const ctx = this.getCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(42, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch {}
  }

  playJump() {
    const ctx = this.getCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(240, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(620, ctx.currentTime + 0.16);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } catch {}
  }

  playUltimate() {
    const ctx = this.getCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      [220, 330, 440, 660, 880].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + idx * 0.05 + 0.25);
        gain.gain.setValueAtTime(0.12, now + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.25);
      });
    } catch {}
  }

  playVictory() {
    const ctx = this.getCtx();
    if (!ctx) return;
    try {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((n, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(n, ctx.currentTime + i * 0.1);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.1);
        osc.stop(ctx.currentTime + i * 0.1 + 0.35);
      });
    } catch {}
  }
}

const sfx = new ArcadeAudioEngine();

// ============================================================================
// قوالب أختام النينجيتسو الهندسية للرسم المباشر على الكانفاس
// ============================================================================
interface SealPatternDef {
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

const NINJUTSU_SEAL_PATTERNS: SealPatternDef[] = [
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

interface DungeonRoomNode {
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

interface ShadowSoldierAlly {
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

interface VisualAnimeGamesSpaceProps {
  gameId: VisualGameId;
  storyChapter?: StoryChapterMeta | null;
  ghostTarget?: {
    id: string;
    name: string;
    targetScoreToBeat?: number;
    stake?: number;
  } | null;
  onClose: () => void;
  onFinishMatch: (result: {
    gameId: VisualGameId;
    score: number;
    won: boolean;
    storyChapterId?: string;
    maxCombo?: number;
  }) => void;
}

export default function VisualAnimeGamesSpace({
  gameId,
  storyChapter,
  ghostTarget,
  onClose,
  onFinishMatch
}: VisualAnimeGamesSpaceProps) {
  const { user, userData } = useAuth();
  const gameMeta = VISUAL_ANIME_GAMES.find((g) => g.id === gameId) || VISUAL_ANIME_GAMES[0];
  const librarySynergy = useMemo(() => computeAnimeLibrarySynergy(userData), [userData]);
  const targetToBeat =
    storyChapter?.targetScore || ghostTarget?.targetScoreToBeat || gameMeta.targetScore;

  // قائمة المقاتلين والأفتارات القابلة للعب مع ربط القوة بتآزر مكتبة الأنمي
  const playableHeroes: PlayableHero[] = useMemo(
    () => [
      ...(user
        ? [
            {
              id: 'user-avatar',
              name: user.displayName || 'بطل الأوتاكو',
              titleAr: `أفتارك الشخصي (+${librarySynergy.atkBonusPct}% تآزر المكتبة)`,
              avatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`,
              auraColor: gameMeta.accentColor,
              secondaryColor: '#fde047',
              ultimateNameAr: 'انفجار هالة الأوتاكو القصوى!',
              power: 99,
              speed: 98,
              elementAr: 'الهاكي الملكي ⚡'
            }
          ]
        : []),
      {
        id: 'luffy-g5',
        name: 'لوفي Gear 5',
        titleAr: 'إله الشمس نيكا',
        avatar: ANIME_FIGHTER_DECK[0].imageUrl,
        auraColor: '#f59e0b',
        secondaryColor: '#ffffff',
        ultimateNameAr: 'قبضة باجرانج غان العملاقة (BAJRANG GUN)!',
        power: 99,
        speed: 97,
        elementAr: 'الشمس والهاكي ☀️'
      },
      {
        id: 'zoro-koh',
        name: 'رورونوا زورو',
        titleAr: 'ملك الجحيم الثلاثي',
        avatar: ANIME_FIGHTER_DECK[1].imageUrl,
        auraColor: '#10b981',
        secondaryColor: '#FF1744',
        ultimateNameAr: 'تنين الجحيم التساعي (KING OF HELL)!',
        power: 97,
        speed: 95,
        elementAr: 'إعصار السيوف 🌪️'
      },
      {
        id: 'gojo-satoru',
        name: 'ساتورو غوجو',
        titleAr: 'الأعين الست واللانهاية',
        avatar: ANIME_FIGHTER_DECK[2].imageUrl,
        auraColor: '#38bdf8',
        secondaryColor: '#a855f7',
        ultimateNameAr: 'توسيع المجال: الفراغ البنفسجي (HOLLOW PURPLE)!',
        power: 99,
        speed: 99,
        elementAr: 'الفراغ اللانهائي ♾️'
      },
      {
        id: 'sung-jinwoo',
        name: 'سونغ جين وو',
        titleAr: 'عاهل الظلال الأعلى',
        avatar: ANIME_FIGHTER_DECK[7].imageUrl,
        auraColor: '#a855f7',
        secondaryColor: '#10b981',
        ultimateNameAr: 'انهضوا يا جيش الظلال (ARISE DOMINION)!',
        power: 99,
        speed: 98,
        elementAr: 'ملك الظلال 🌑'
      },
      {
        id: 'naruto-baryon',
        name: 'ناروتو Baryon',
        titleAr: 'شهاب كونوها النووي',
        avatar: ANIME_FIGHTER_DECK[6].imageUrl,
        auraColor: '#FF1744',
        secondaryColor: '#facc15',
        ultimateNameAr: 'راسينغان الباريون الكاسحة!',
        power: 98,
        speed: 98,
        elementAr: 'لهب الكيوبي 🔥'
      }
    ],
    [user, gameMeta.accentColor, librarySynergy.atkBonusPct]
  );

  const [appPhase, setAppPhase] = useState<'TITLE_LOBBY' | 'PLAYING' | 'GAME_OVER'>('TITLE_LOBBY');
  const [selectedHero, setSelectedHero] = useState<PlayableHero>(playableHeroes[0]);
  const [soundMuted, setSoundMuted] = useState(false);

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [timeLeft, setTimeLeft] = useState(42);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [ultimateCharge, setUltimateCharge] = useState(35 + librarySynergy.startUltBonus);
  const [ultimateCutIn, setUltimateCutIn] = useState(false);
  const [heroPose, setHeroPose] = useState<'idle' | 'attack' | 'hit'>('idle');
  const [particleBurstTrigger, setParticleBurstTrigger] = useState(1);
  const [particleBurstMode, setParticleBurstMode] = useState<'idle' | 'challenge' | 'victory' | 'ultimate'>('challenge');
  const [floatingPopups, setFloatingPopups] = useState<
    { id: number; text: string; x: number; y: number; color: string }[]
  >([]);

  // Parallax 3D
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const smoothX = useSpring(mouseX, { stiffness: 65, damping: 20 });
  const smoothY = useSpring(mouseY, { stiffness: 65, damping: 20 });
  const bgParallaxX = useTransform(smoothX, [-1, 1], [22, -22]);
  const bgParallaxY = useTransform(smoothY, [-1, 1], [16, -16]);
  const stageRotateY = useTransform(smoothX, [-1, 1], [-3.5, 3.5]);
  const stageRotateX = useTransform(smoothY, [-1, 1], [2.5, -2.5]);

  const handleGlobalParallaxMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    mouseX.set(nx);
    mouseY.set(ny);
  };

  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const ultRef = useRef(35 + librarySynergy.startUltBonus);
  const finishedRef = useRef(false);
  const heroAvatarImgRef = useRef<HTMLImageElement | null>(null);
  const bossAvatarImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = selectedHero.avatar;
    heroAvatarImgRef.current = img;

    const bImg = new Image();
    bImg.crossOrigin = 'anonymous';
    bImg.src = storyChapter?.bossAvatar || ANIME_FIGHTER_DECK[2].imageUrl;
    bossAvatarImgRef.current = bImg;
  }, [selectedHero, storyChapter]);

  const toggleSound = () => {
    sfx.muted = !soundMuted;
    setSoundMuted(!soundMuted);
  };

  const addPopup = (text: string, x = 50, y = 42, color = '#fbbf24') => {
    const id = Date.now() + Math.random();
    setFloatingPopups((prev) => [...prev.slice(-7), { id, text, x, y, color }]);
  };

  const updateCombo = (nextCombo: number) => {
    comboRef.current = nextCombo;
    setCombo(nextCombo);
    if (nextCombo > maxComboRef.current) {
      maxComboRef.current = nextCombo;
      setMaxCombo(nextCombo);
    }
  };

  const addSynergyScore = (basePts: number) => {
    const mult = 1 + librarySynergy.atkBonusPct / 200;
    const finalPts = Math.round(basePts * mult);
    scoreRef.current += finalPts;
    setScore(scoreRef.current);
    return finalPts;
  };

  const triggerHeroAttackPose = () => {
    setHeroPose('attack');
    setTimeout(() => setHeroPose('idle'), 260);
  };

  const chargeUltimate = (amount: number) => {
    ultRef.current = Math.min(100, ultRef.current + amount);
    setUltimateCharge(ultRef.current);
  };

  const triggerEndGame = (finalScore: number, forceWin?: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setAppPhase('GAME_OVER');
    const won = forceWin !== undefined ? forceWin : finalScore >= targetToBeat;
    setParticleBurstMode(won ? 'victory' : 'challenge');
    setParticleBurstTrigger((t) => t + 1);
    if (won) sfx.playVictory();
    onFinishMatch({
      gameId,
      score: finalScore,
      won,
      storyChapterId: storyChapter?.id,
      maxCombo: maxComboRef.current
    });
  };

  // ============================================================================
  // حالات الألعاب الأربع الجديدة + الألعاب الكلاسيكية
  // ============================================================================
  // 1. حالة قتال الأبطال 2D بالفيزياء (Hero Fighter 2D)
  const fighterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fighterControlsRef = useRef<{
    moveLeft: () => void;
    moveRight: () => void;
    jump: () => void;
    dash: () => void;
    slashCombo: () => void;
    kiBlast: () => void;
    parryGuard: () => void;
    castUltInArena: () => void;
  }>({
    moveLeft: () => {},
    moveRight: () => {},
    jump: () => {},
    dash: () => {},
    slashCombo: () => {},
    kiBlast: () => {},
    parryGuard: () => {},
    castUltInArena: () => {}
  });
  const [fighterPlayerHp, setFighterPlayerHp] = useState(100);
  const [fighterBossHp, setFighterBossHp] = useState(100);
  const [fighterBossStagger, setFighterBossStagger] = useState(0);

  // 2. حالة رسم أختام النينجيتسو بالسحب المباشر (Ninjutsu Seal Canvas)
  const sealCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [currentSealIdx, setCurrentSealIdx] = useState(0);
  const [sealBossHp, setSealBossHp] = useState(100);
  const [sealAccuracyLast, setSealAccuracyLast] = useState<number | null>(null);
  const [activeJutsuBanner, setActiveJutsuBanner] = useState<string | null>(null);

  // 3. حالة طاولة حرب البطاقات 3D المطورة (3D Hologram Tactical Card Clash)
  const [playerLp, setPlayerLp] = useState(3000);
  const [enemyLp, setEnemyLp] = useState(3000);
  const [playerMana, setPlayerMana] = useState(6);
  const [enemyShieldHp, setEnemyShieldHp] = useState(450);
  const [handCards, setHandCards] = useState(() =>
    [...ANIME_FIGHTER_DECK].sort(() => Math.random() - 0.5).slice(0, 4)
  );
  const [fieldCards, setFieldCards] = useState<(typeof ANIME_FIGHTER_DECK)[0][]>([]);
  const [clashingPair, setClashingPair] = useState<{
    myCard: (typeof ANIME_FIGHTER_DECK)[0];
    oppCard: (typeof ANIME_FIGHTER_DECK)[0];
    stat: 'power' | 'speed' | 'iq';
    wonClash: boolean;
    damageDealt: number;
    elementBonus: boolean;
  } | null>(null);
  const [chosenAttr, setChosenAttr] = useState<'power' | 'speed' | 'iq'>('power');

  // 4. حالة استكشاف الدانجون وفتح البوابات واستخراج الظلال (Dungeon Gate Explorer)
  const [dungeonGateRank, setDungeonGateRank] = useState<'B-RANK' | 'A-RANK' | 'S-RANK'>('A-RANK');
  const [dungeonRooms, setDungeonRooms] = useState<DungeonRoomNode[]>([]);
  const [activeDungeonRoom, setActiveDungeonRoom] = useState<DungeonRoomNode | null>(null);
  const [roomEnemyHp, setRoomEnemyHp] = useState(100);
  const [extractedShadows, setExtractedShadows] = useState<ShadowSoldierAlly[]>([]);
  const [canExtractShadow, setCanExtractShadow] = useState<ShadowSoldierAlly | null>(null);
  const [bossDangerZone, setBossDangerZone] = useState<boolean>(false);
  const [playerDodging, setPlayerDodging] = useState<boolean>(false);

  // الألعاب الإضافية
  const [beamPower, setBeamPower] = useState(50);
  const [criticalNode, setCriticalNode] = useState<{ x: number; y: number } | null>({ x: 50, y: 40 });
  const [bossHp, setBossHp] = useState(100);
  const [weakSpotPos, setWeakSpotPos] = useState({ x: 50, y: 45 });
  const [bossShake, setBossShake] = useState(false);
  const [towerFloor, setTowerFloor] = useState(1);
  const [towerShield, setTowerShield] = useState(true);

  const initDungeonMap = () => {
    const initialRooms: DungeonRoomNode[] = [
      {
        id: 1,
        row: 1,
        titleAr: 'مدخل البوابة: حراس الظلام',
        type: 'monster',
        cleared: false,
        unlocked: true,
        enemyNameAr: 'ذئب الظلال الفولاذي',
        enemyImg: ANIME_FIGHTER_DECK[3].imageUrl,
        rankBadge: 'B-RANK'
      },
      {
        id: 2,
        row: 2,
        titleAr: 'مذبح الشاكرا والدم',
        type: 'altar',
        cleared: false,
        unlocked: false,
        enemyNameAr: 'مذبح القوة القدير',
        enemyImg: ANIME_FIGHTER_DECK[5].imageUrl,
        rankBadge: 'ALTAR'
      },
      {
        id: 3,
        row: 2,
        titleAr: 'قاعة الفرسان المدرعين',
        type: 'monster',
        cleared: false,
        unlocked: false,
        enemyNameAr: 'إيغريس الفارس الأحمر',
        enemyImg: ANIME_FIGHTER_DECK[1].imageUrl,
        rankBadge: 'A-RANK'
      },
      {
        id: 4,
        row: 3,
        titleAr: 'خزينة الآثار الملكية',
        type: 'chest',
        cleared: false,
        unlocked: false,
        enemyNameAr: 'صندوق الغنائم الأسطوري',
        enemyImg: ANIME_FIGHTER_DECK[8].imageUrl,
        rankBadge: 'RELIC'
      },
      {
        id: 5,
        row: 4,
        titleAr: 'عرش زعيم البوابة الحمراء',
        type: 'boss',
        cleared: false,
        unlocked: false,
        enemyNameAr: storyChapter?.bossNameAr || 'بيرو ملك الدانجون الأعلى',
        enemyImg: storyChapter?.bossAvatar || ANIME_FIGHTER_DECK[7].imageUrl,
        rankBadge: 'S-RANK BOSS'
      }
    ];
    setDungeonRooms(initialRooms);
    setActiveDungeonRoom(null);
    setExtractedShadows([
      { id: 'shadow-init', nameAr: 'جندي الظل المخلص', rank: 'B', atkBonus: 6, color: '#a855f7' }
    ]);
    setCanExtractShadow(null);
  };

  const startStandaloneGame = () => {
    sfx.playUltimate();
    setParticleBurstMode('challenge');
    setParticleBurstTrigger((t) => t + 1);
    finishedRef.current = false;
    scoreRef.current = 0;
    livesRef.current = 3;
    comboRef.current = 0;
    maxComboRef.current = 0;
    const initUlt = Math.min(80, 35 + librarySynergy.startUltBonus);
    ultRef.current = initUlt;
    setScore(0);
    setLives(3);
    setCombo(0);
    setMaxCombo(0);
    setUltimateCharge(initUlt);
    setTimeLeft(gameId === 'dungeon_gate_explorer' || gameId === 'hero_fighter_2d' ? 48 : 38);

    // إعادة ضبط حالات الألعاب
    setFighterPlayerHp(100);
    setFighterBossHp(100);
    setFighterBossStagger(0);
    setCurrentSealIdx(0);
    setSealBossHp(100);
    setSealAccuracyLast(null);
    setPlayerLp(3000);
    setEnemyLp(3000);
    setPlayerMana(6);
    setEnemyShieldHp(450);
    setFieldCards([]);
    setClashingPair(null);
    initDungeonMap();
    setBeamPower(50);
    setBossHp(100);
    setTowerFloor(1);
    setTowerShield(true);
    setAppPhase('PLAYING');
  };

  // إطلاق الضربة القاضية السينمائية (2D/3D ANIME ULTIMATE CUT-IN)
  const handleCastUltimateSkill = () => {
    if (appPhase !== 'PLAYING' || ultRef.current < 100) return;
    sfx.playUltimate();
    setParticleBurstMode('ultimate');
    setParticleBurstTrigger((t) => t + 1);
    ultRef.current = 0;
    setUltimateCharge(0);
    setUltimateCutIn(true);
    triggerHeroAttackPose();

    const bonusPts = addSynergyScore(125 + comboRef.current * 12);
    updateCombo(comboRef.current + 4);

    if (gameId === 'hero_fighter_2d') {
      fighterControlsRef.current.castUltInArena();
    } else if (gameId === 'ninjutsu_seal_canvas') {
      setSealBossHp((hp) => {
        const next = Math.max(0, hp - 38);
        if (next <= 0) setTimeout(() => triggerEndGame(scoreRef.current + 160, true), 650);
        return next;
      });
    } else if (gameId === 'card_clash') {
      setEnemyShieldHp(0);
      setEnemyLp((lp) => {
        const next = Math.max(0, lp - 1100);
        if (next <= 0) setTimeout(() => triggerEndGame(scoreRef.current + 180, true), 650);
        return next;
      });
    } else if (gameId === 'dungeon_gate_explorer') {
      if (activeDungeonRoom) {
        setRoomEnemyHp((hp) => Math.max(0, hp - 45));
      }
    } else if (gameId === 'beam_clash') {
      setBeamPower((p) => {
        const next = Math.min(100, p + 34);
        if (next >= 100) setTimeout(() => triggerEndGame(scoreRef.current + 120, true), 600);
        return next;
      });
    } else if (gameId === 'boss_raid') {
      setBossHp((hp) => {
        const next = Math.max(0, hp - 35);
        if (next <= 0) setTimeout(() => triggerEndGame(scoreRef.current + 150, true), 600);
        return next;
      });
    }

    addPopup(`💥 ${selectedHero.ultimateNameAr} (+${bonusPts})`, 50, 35, selectedHero.auraColor);
    setTimeout(() => setUltimateCutIn(false), 1200);
  };

  // مؤقت اللعب الفعلي
  useEffect(() => {
    if (appPhase !== 'PLAYING') return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          triggerEndGame(scoreRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [appPhase]);

  // ============================================================================
  // المحرك الأول: قتال الأبطال 2D بالتحريك والفيزياء والقدرات الخارقة (HERO FIGHTER 2D)
  // ============================================================================
  useEffect(() => {
    if (gameId !== 'hero_fighter_2d' || appPhase !== 'PLAYING') return;
    const canvas = fighterCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let tick = 0;
    let hitStopFrames = 0;
    let shakeFrames = 0;
    const width = (canvas.width = canvas.parentElement?.clientWidth || 680);
    const height = (canvas.height = canvas.parentElement?.clientHeight || 390);
    const groundY = height - 54;

    const player = {
      x: 110,
      y: groundY - 34,
      vx: 0,
      vy: 0,
      radius: 30,
      facing: 1,
      jumps: 0,
      hp: 100,
      guarding: false,
      parryWindow: 0,
      attackAnim: 0,
      comboStep: 0,
      dashClones: [] as { x: number; y: number; alpha: number }[]
    };

    const boss = {
      x: width - 120,
      y: groundY - 38,
      vx: 0,
      vy: 0,
      radius: 35,
      facing: -1,
      hp: 100,
      stagger: 0,
      state: 'patrol' as 'patrol' | 'charge_warn' | 'dash_strike' | 'stunned',
      stateTimer: 40,
      slashWave: 0
    };

    interface EnergyWave {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      fromPlayer: boolean;
      color: string;
      damage: number;
    }

    interface ArenaParticle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      alpha: number;
    }

    interface MangaKanjiFX {
      x: number;
      y: number;
      text: string;
      color: string;
      scale: number;
      alpha: number;
    }

    const projectiles: EnergyWave[] = [];
    const particles: ArenaParticle[] = [];
    const kanjiEffects: MangaKanjiFX[] = [];
    let slashArcVisual: { x: number; y: number; facing: number; alpha: number; color: string; radius: number } | null = null;
    let ultBeamActive = 0;

    const spawnBurst = (x: number, y: number, color: string, count = 16) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 2 + Math.random() * 9;
        particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 1.5,
          size: 3 + Math.random() * 4.5,
          color,
          alpha: 1
        });
      }
    };

    const spawnKanji = (x: number, y: number, text: string, color: string) => {
      kanjiEffects.push({ x, y, text, color, scale: 0.7, alpha: 1 });
    };

    // ربط أزرار التحكم بالفيزياء داخل الكانفاس
    fighterControlsRef.current = {
      moveLeft: () => {
        player.vx = -8.5;
        player.facing = -1;
      },
      moveRight: () => {
        player.vx = 8.5;
        player.facing = 1;
      },
      jump: () => {
        if (player.jumps < 2) {
          sfx.playJump();
          player.vy = -11.5;
          player.jumps += 1;
          spawnBurst(player.x, player.y + 24, '#ffffff', 8);
        }
      },
      dash: () => {
        sfx.playSlash();
        for (let c = 0; c < 4; c++) {
          player.dashClones.push({
            x: player.x - c * player.facing * 18,
            y: player.y,
            alpha: 0.7 - c * 0.14
          });
        }
        player.vx = player.facing * 17;
        spawnKanji(player.x, player.y - 38, 'SHUNPO ⚡', selectedHero.auraColor);
      },
      slashCombo: () => {
        sfx.playSlash();
        triggerHeroAttackPose();
        player.comboStep = (player.comboStep + 1) % 3;
        player.attackAnim = 12;
        player.facing = boss.x >= player.x ? 1 : -1;
        // اندفاع خفيف نحو الخصم أثناء الكومبو
        if (Math.abs(boss.x - player.x) < 190) {
          player.vx = player.facing * 7.5;
        }

        const isHeavyFinisher = player.comboStep === 0;
        const reach = isHeavyFinisher ? 135 : 105;
        slashArcVisual = {
          x: player.x + player.facing * 34,
          y: player.y,
          facing: player.facing,
          alpha: 1,
          color: isHeavyFinisher ? '#facc15' : selectedHero.auraColor,
          radius: isHeavyFinisher ? 68 : 50
        };

        const dist = Math.hypot(boss.x - player.x, boss.y - player.y);
        if (dist <= reach) {
          sfx.playHit();
          hitStopFrames = isHeavyFinisher ? 5 : 2;
          shakeFrames = isHeavyFinisher ? 8 : 4;
          const dmg = isHeavyFinisher ? 11 : 6.5;
          boss.hp = Math.max(0, boss.hp - dmg);
          boss.stagger = Math.min(100, boss.stagger + (isHeavyFinisher ? 28 : 15));
          boss.vx = player.facing * (isHeavyFinisher ? 10 : 4.5);
          if (isHeavyFinisher) boss.vy = -5.5;

          if (boss.stagger >= 100 && boss.state !== 'stunned') {
            boss.state = 'stunned';
            boss.stateTimer = 85;
            boss.stagger = 0;
            spawnKanji(boss.x, boss.y - 48, 'GUARD BREAK!! 💥', '#facc15');
            addSynergyScore(65);
          }

          setFighterBossHp(Math.round(boss.hp));
          setFighterBossStagger(Math.round(boss.stagger));
          spawnBurst(boss.x, boss.y, isHeavyFinisher ? '#facc15' : selectedHero.auraColor, isHeavyFinisher ? 24 : 14);
          spawnKanji(
            boss.x,
            boss.y - 35,
            isHeavyFinisher ? 'ゴゴゴ CRITICAL!' : 'SLASH!!',
            isHeavyFinisher ? '#facc15' : '#FF1744'
          );

          updateCombo(comboRef.current + 1);
          chargeUltimate(isHeavyFinisher ? 18 : 10);
          addSynergyScore(isHeavyFinisher ? 42 : 24);

          if (boss.hp <= 0) {
            addSynergyScore(180);
            triggerEndGame(scoreRef.current, true);
          }
        }
      },
      kiBlast: () => {
        sfx.playSlash();
        triggerHeroAttackPose();
        player.facing = boss.x >= player.x ? 1 : -1;
        projectiles.push({
          x: player.x + player.facing * 36,
          y: player.y,
          vx: player.facing * 12.5,
          vy: 0,
          radius: 16,
          fromPlayer: true,
          color: selectedHero.auraColor,
          damage: 7.5
        });
        spawnKanji(player.x, player.y - 32, 'HADOU 🔥', selectedHero.auraColor);
      },
      parryGuard: () => {
        player.guarding = true;
        player.parryWindow = 18;
        spawnKanji(player.x, player.y - 38, 'PARRY SHIELD 🛡️', '#38bdf8');
        setTimeout(() => {
          player.guarding = false;
        }, 420);
      },
      castUltInArena: () => {
        ultBeamActive = 28;
        shakeFrames = 16;
        boss.hp = Math.max(0, boss.hp - 34);
        boss.vx = player.facing * 14;
        boss.vy = -7;
        setFighterBossHp(Math.round(boss.hp));
        spawnBurst(boss.x, boss.y, '#facc15', 36);
        spawnKanji(boss.x, boss.y - 50, 'ULTIMATE KO!! ⚡', '#facc15');
        if (boss.hp <= 0) {
          setTimeout(() => triggerEndGame(scoreRef.current + 200, true), 500);
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') fighterControlsRef.current.moveRight();
      else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') fighterControlsRef.current.moveLeft();
      else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') fighterControlsRef.current.jump();
      else if (e.key === 'j' || e.key === 'J' || e.key === 'z') fighterControlsRef.current.slashCombo();
      else if (e.key === 'k' || e.key === 'K' || e.key === 'x') fighterControlsRef.current.kiBlast();
      else if (e.key === 'l' || e.key === 'L' || e.key === 'c') fighterControlsRef.current.parryGuard();
      else if (e.key === 'Shift') fighterControlsRef.current.dash();
    };
    window.addEventListener('keydown', onKeyDown);

    const renderArena = () => {
      if (hitStopFrames > 0) {
        hitStopFrames--;
        animId = requestAnimationFrame(renderArena);
        return;
      }

      tick += 0.12;
      ctx.save();
      if (shakeFrames > 0) {
        shakeFrames--;
        ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8);
      }
      ctx.clearRect(0, 0, width, height);

      // أرضية الحلبة المضيئة مع خطوط منظور القتال
      const floorGrad = ctx.createLinearGradient(0, groundY, 0, height);
      floorGrad.addColorStop(0, 'rgba(20, 15, 38, 0.92)');
      floorGrad.addColorStop(1, 'rgba(5, 5, 12, 0.98)');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, groundY, width, height - groundY);

      ctx.strokeStyle = selectedHero.auraColor;
      ctx.lineWidth = 3.5;
      ctx.shadowColor = selectedHero.auraColor;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(width, groundY);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // فيزياء اللاعب
      player.x += player.vx;
      player.y += player.vy;
      player.vx *= 0.82;
      player.vy += 0.58;
      if (player.y >= groundY - player.radius) {
        player.y = groundY - player.radius;
        player.vy = 0;
        player.jumps = 0;
      }
      player.x = Math.max(player.radius + 10, Math.min(width - player.radius - 10, player.x));
      if (player.parryWindow > 0) player.parryWindow--;
      if (player.attackAnim > 0) player.attackAnim--;

      // ذكاء وفيزياء الزعيم (AI Fighter Boss)
      boss.x += boss.vx;
      boss.y += boss.vy;
      boss.vx *= 0.84;
      boss.vy += 0.58;
      if (boss.y >= groundY - boss.radius) {
        boss.y = groundY - boss.radius;
        boss.vy = 0;
      }
      boss.x = Math.max(boss.radius + 15, Math.min(width - boss.radius - 15, boss.x));
      boss.facing = player.x < boss.x ? -1 : 1;

      boss.stateTimer--;
      if (boss.state === 'stunned') {
        if (boss.stateTimer <= 0) {
          boss.state = 'patrol';
          boss.stateTimer = 45;
        }
      } else if (boss.state === 'patrol') {
        const distToPlayer = Math.abs(player.x - boss.x);
        if (distToPlayer > 170) {
          boss.vx = boss.facing * 2.4;
        }
        if (boss.stateTimer <= 0) {
          if (Math.random() < 0.52) {
            boss.state = 'charge_warn';
            boss.stateTimer = 28;
            spawnKanji(boss.x, boss.y - 48, '⚠️ DANGER!!', '#ef4444');
          } else {
            // إطلاق كرة طاقة من الزعيم
            projectiles.push({
              x: boss.x + boss.facing * 36,
              y: boss.y,
              vx: boss.facing * 8.5,
              vy: 0,
              radius: 17,
              fromPlayer: false,
              color: '#a855f7',
              damage: 12
            });
            boss.stateTimer = 50;
          }
        }
      } else if (boss.state === 'charge_warn') {
        if (boss.stateTimer <= 0) {
          boss.state = 'dash_strike';
          boss.stateTimer = 18;
          boss.vx = boss.facing * 13.5;
          sfx.playSlash();
        }
      } else if (boss.state === 'dash_strike') {
        const d = Math.hypot(boss.x - player.x, boss.y - player.y);
        if (d < boss.radius + player.radius + 10) {
          if (player.parryWindow > 0 || player.guarding) {
            // صد مثالي يعكس هجوم الزعيم ويكسر توازنه!
            sfx.playUltimate();
            hitStopFrames = 6;
            shakeFrames = 10;
            boss.vx = -boss.facing * 12;
            boss.state = 'stunned';
            boss.stateTimer = 75;
            boss.hp = Math.max(0, boss.hp - 10);
            setFighterBossHp(Math.round(boss.hp));
            spawnBurst(player.x, player.y, '#38bdf8', 25);
            spawnKanji(player.x, player.y - 45, '⚡ PERFECT PARRY!! +80', '#38bdf8');
            addSynergyScore(80);
            chargeUltimate(25);
          } else {
            sfx.playHit();
            shakeFrames = 8;
            player.vx = boss.facing * 11;
            player.vy = -5;
            player.hp = Math.max(0, player.hp - 16);
            setFighterPlayerHp(Math.round(player.hp));
            updateCombo(0);
            spawnBurst(player.x, player.y, '#ef4444', 18);
            spawnKanji(player.x, player.y - 40, 'HIT -16 HP!', '#ef4444');
            if (player.hp <= 0) {
              livesRef.current = Math.max(0, livesRef.current - 1);
              setLives(livesRef.current);
              if (livesRef.current <= 0) {
                triggerEndGame(scoreRef.current);
              } else {
                player.hp = 100;
                setFighterPlayerHp(100);
              }
            }
          }
          boss.state = 'patrol';
          boss.stateTimer = 50;
        } else if (boss.stateTimer <= 0) {
          boss.state = 'patrol';
          boss.stateTimer = 45;
        }
      }

      // رسم أطياف الاندفاع (Afterimage Clones)
      for (let i = player.dashClones.length - 1; i >= 0; i--) {
        const cl = player.dashClones[i];
        cl.alpha -= 0.05;
        if (cl.alpha <= 0) {
          player.dashClones.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = cl.alpha;
        ctx.fillStyle = selectedHero.auraColor;
        ctx.beginPath();
        ctx.arc(cl.x, cl.y, player.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // رسم شعاع الضربة القاضية العابر للحلبة
      if (ultBeamActive > 0) {
        ultBeamActive--;
        ctx.save();
        const beamGrad = ctx.createLinearGradient(player.x, player.y, boss.x, boss.y);
        beamGrad.addColorStop(0, '#ffffff');
        beamGrad.addColorStop(0.5, selectedHero.auraColor);
        beamGrad.addColorStop(1, '#facc15');
        ctx.strokeStyle = beamGrad;
        ctx.lineWidth = 42 * (ultBeamActive / 28);
        ctx.lineCap = 'round';
        ctx.shadowColor = selectedHero.auraColor;
        ctx.shadowBlur = 35;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(boss.x, boss.y);
        ctx.stroke();
        ctx.restore();
      }

      // رسم مقاتل اللاعب مع هالة الشاكرا/الهاكي
      ctx.save();
      const pAura = player.radius + 14 + Math.sin(tick * 3) * 5;
      const pGrad = ctx.createRadialGradient(player.x, player.y, 6, player.x, player.y, pAura);
      pGrad.addColorStop(0, '#ffffff');
      pGrad.addColorStop(0.5, player.guarding ? '#38bdf8' : selectedHero.auraColor);
      pGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(player.x, player.y, pAura, 0, Math.PI * 2);
      ctx.fill();

      // درع الصدّ العاكس
      if (player.guarding || player.parryWindow > 0) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius + 12, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.save();
      ctx.clip();
      if (heroAvatarImgRef.current && heroAvatarImgRef.current.complete) {
        ctx.drawImage(
          heroAvatarImgRef.current,
          player.x - player.radius,
          player.y - player.radius,
          player.radius * 2,
          player.radius * 2
        );
      } else {
        ctx.fillStyle = selectedHero.auraColor;
        ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();

      // رسم قوس السيف القاطع عند الهجوم
      if (slashArcVisual && slashArcVisual.alpha > 0.05) {
        ctx.save();
        ctx.globalAlpha = slashArcVisual.alpha;
        ctx.strokeStyle = slashArcVisual.color;
        ctx.lineWidth = 9 * slashArcVisual.alpha;
        ctx.shadowColor = slashArcVisual.color;
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.arc(
          slashArcVisual.x,
          slashArcVisual.y,
          slashArcVisual.radius,
          slashArcVisual.facing === 1 ? -Math.PI * 0.45 : Math.PI * 0.55,
          slashArcVisual.facing === 1 ? Math.PI * 0.45 : Math.PI * 1.45
        );
        ctx.stroke();
        ctx.restore();
        slashArcVisual.alpha *= 0.78;
      }

      // رسم الزعيم الخصم مع هالة التهديد
      ctx.save();
      const bColor =
        boss.state === 'charge_warn'
          ? '#ef4444'
          : boss.state === 'stunned'
          ? '#facc15'
          : '#a855f7';
      const bAura = boss.radius + 16 + Math.cos(tick * 3) * 6;
      const bGrad = ctx.createRadialGradient(boss.x, boss.y, 8, boss.x, boss.y, bAura);
      bGrad.addColorStop(0, '#ffffff');
      bGrad.addColorStop(0.5, bColor);
      bGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, bAura, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(boss.x, boss.y, boss.radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.save();
      ctx.clip();
      if (bossAvatarImgRef.current && bossAvatarImgRef.current.complete) {
        ctx.drawImage(
          bossAvatarImgRef.current,
          boss.x - boss.radius,
          boss.y - boss.radius,
          boss.radius * 2,
          boss.radius * 2
        );
      } else {
        ctx.fillStyle = '#a855f7';
        ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = bColor;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.restore();

      // تحديث ورسم مقذوفات الطاقة (Ki Blasts & Parried Waves)
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const pr = projectiles[i];
        pr.x += pr.vx;
        pr.y += pr.vy;

        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = pr.color;
        ctx.shadowBlur = 22;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, pr.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = pr.color;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();

        if (pr.fromPlayer) {
          const d = Math.hypot(pr.x - boss.x, pr.y - boss.y);
          if (d < pr.radius + boss.radius) {
            projectiles.splice(i, 1);
            sfx.playHit();
            boss.hp = Math.max(0, boss.hp - pr.damage);
            boss.stagger = Math.min(100, boss.stagger + 16);
            setFighterBossHp(Math.round(boss.hp));
            setFighterBossStagger(Math.round(boss.stagger));
            spawnBurst(boss.x, boss.y, pr.color, 16);
            updateCombo(comboRef.current + 1);
            chargeUltimate(12);
            addSynergyScore(30);
            if (boss.hp <= 0) {
              addSynergyScore(180);
              triggerEndGame(scoreRef.current, true);
            }
            continue;
          }
        } else {
          const d = Math.hypot(pr.x - player.x, pr.y - player.y);
          if (d < pr.radius + player.radius) {
            if (player.parryWindow > 0 || player.guarding) {
              // عكس كرة طاقة الزعيم نحوه بضعف السرعة!
              sfx.playUltimate();
              pr.fromPlayer = true;
              pr.vx = -pr.vx * 1.65;
              pr.color = '#38bdf8';
              pr.damage = 16;
              spawnKanji(player.x, player.y - 40, 'REFLECT!! ⚡', '#38bdf8');
              addSynergyScore(55);
              chargeUltimate(20);
            } else {
              projectiles.splice(i, 1);
              sfx.playHit();
              player.hp = Math.max(0, player.hp - pr.damage);
              setFighterPlayerHp(Math.round(player.hp));
              updateCombo(0);
              spawnBurst(player.x, player.y, '#ef4444', 14);
              if (player.hp <= 0) {
                livesRef.current = Math.max(0, livesRef.current - 1);
                setLives(livesRef.current);
                if (livesRef.current <= 0) triggerEndGame(scoreRef.current);
                else {
                  player.hp = 100;
                  setFighterPlayerHp(100);
                }
              }
            }
            continue;
          }
        }

        if (pr.x < -50 || pr.x > width + 50) {
          projectiles.splice(i, 1);
        }
      }

      // رسم الجسيمات
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.vy += 0.25;
        pt.alpha -= 0.038;
        if (pt.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = pt.alpha;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // رسم حروف المانغا القتالية (Manga Impact Typography)
      for (let i = kanjiEffects.length - 1; i >= 0; i--) {
        const kj = kanjiEffects[i];
        kj.y -= 1.2;
        kj.scale = Math.min(1.25, kj.scale + 0.08);
        kj.alpha -= 0.03;
        if (kj.alpha <= 0) {
          kanjiEffects.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = kj.alpha;
        ctx.font = '900 16px sans-serif';
        ctx.fillStyle = kj.color;
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 10;
        ctx.textAlign = 'center';
        ctx.fillText(kj.text, kj.x, kj.y);
        ctx.restore();
      }

      ctx.restore();
      animId = requestAnimationFrame(renderArena);
    };

    animId = requestAnimationFrame(renderArena);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [gameId, appPhase, selectedHero]);

  // ============================================================================
  // المحرك الثاني: رسم أختام النينجيتسو بالسحب المباشر (NINJUTSU SEAL CANVAS)
  // ============================================================================
  useEffect(() => {
    if (gameId !== 'ninjutsu_seal_canvas' || appPhase !== 'PLAYING') return;
    const canvas = sealCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let tick = 0;
    const width = (canvas.width = canvas.parentElement?.clientWidth || 440);
    const height = (canvas.height = canvas.parentElement?.clientHeight || 380);

    const pattern = NINJUTSU_SEAL_PATTERNS[currentSealIdx % NINJUTSU_SEAL_PATTERNS.length];
    const scaledNodes = pattern.nodes.map((n) => ({
      x: n.x * width,
      y: n.y * height,
      label: n.label
    }));

    let reachedIndex = 0;
    let isDrawing = false;
    const strokePoints: { x: number; y: number }[] = [];
    const inkSparks: { x: number; y: number; vx: number; vy: number; alpha: number; color: string }[] = [];
    let jutsuBlastAnim = 0;

    const checkNodeProximity = (px: number, py: number) => {
      const targetNode = scaledNodes[reachedIndex];
      if (!targetNode) return;
      const dist = Math.hypot(px - targetNode.x, py - targetNode.y);
      if (dist <= 38) {
        sfx.playSealNode(reachedIndex);
        reachedIndex++;
        for (let i = 0; i < 14; i++) {
          inkSparks.push({
            x: targetNode.x,
            y: targetNode.y,
            vx: (Math.random() - 0.5) * 9,
            vy: (Math.random() - 0.5) * 9,
            alpha: 1,
            color: pattern.color
          });
        }

        // اكتمال رسم الختم بالكامل!
        if (reachedIndex >= scaledNodes.length) {
          isDrawing = false;
          jutsuBlastAnim = 24;
          sfx.playUltimate();
          triggerHeroAttackPose();

          // حساب دقة الرسم الهندسية بناءً على انسيابية المسار
          const accuracy = Math.min(100, Math.max(78, Math.round(98 - Math.abs(strokePoints.length - 45) * 0.25)));
          setSealAccuracyLast(accuracy);
          setActiveJutsuBanner(pattern.jutsuCallAr);
          setTimeout(() => setActiveJutsuBanner(null), 1150);

          const gained = addSynergyScore(Math.round((pattern.baseDamage * accuracy) / 32));
          updateCombo(comboRef.current + 1);
          chargeUltimate(24);
          addPopup(`⛩️ ${pattern.nameAr} (${accuracy}%) +${gained}`, 50, 32, pattern.color);

          setSealBossHp((prev) => {
            const next = Math.max(0, prev - pattern.baseDamage);
            if (next <= 0) {
              addSynergyScore(150);
              setTimeout(() => triggerEndGame(scoreRef.current, true), 550);
            }
            return next;
          });

          setTimeout(() => {
            setCurrentSealIdx((idx) => idx + 1);
          }, 520);
        }
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      isDrawing = true;
      strokePoints.push({ x: px, y: py });
      checkNodeProximity(px, py);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDrawing) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      strokePoints.push({ x: px, y: py });
      if (strokePoints.length > 90) strokePoints.shift();

      if (Math.random() > 0.35) {
        inkSparks.push({
          x: px,
          y: py,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          alpha: 0.9,
          color: pattern.secondaryColor
        });
      }
      checkNodeProximity(px, py);
    };

    const handlePointerUp = () => {
      isDrawing = false;
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    const renderSealStage = () => {
      tick += 0.08;
      ctx.clearRect(0, 0, width, height);

      // دائرة الختم المقدسة في الخلفية
      const cx = width / 2;
      const cy = height / 2;
      const magicRadius = Math.min(width, height) * 0.38;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tick * 0.25);
      ctx.strokeStyle = `${pattern.color}44`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, magicRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, magicRadius * 0.78, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // رسم الخطوط الإرشادية للختم
      ctx.save();
      ctx.setLineDash([7, 7]);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      scaledNodes.forEach((nd, i) => {
        if (i === 0) ctx.moveTo(nd.x, nd.y);
        else ctx.lineTo(nd.x, nd.y);
      });
      ctx.stroke();
      ctx.restore();

      // رسم الخطوط المكتملة المتوهجة بين العقد التي مر بها اللاعب
      if (reachedIndex > 1) {
        ctx.save();
        ctx.strokeStyle = pattern.color;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = pattern.color;
        ctx.shadowBlur = 24;
        ctx.beginPath();
        for (let i = 0; i < reachedIndex; i++) {
          const nd = scaledNodes[i];
          if (i === 0) ctx.moveTo(nd.x, nd.y);
          else ctx.lineTo(nd.x, nd.y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // رسم حبر الشاكرا الحي أثناء سحب الإصبع/الماوس
      if (strokePoints.length > 1) {
        ctx.save();
        ctx.strokeStyle = pattern.secondaryColor;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = pattern.color;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        strokePoints.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
        ctx.restore();
      }

      // رسم عقد الختم المرقمة
      scaledNodes.forEach((nd, idx) => {
        const isDone = idx < reachedIndex;
        const isNext = idx === reachedIndex;
        const r = isNext ? 24 + Math.sin(tick * 4) * 4 : 20;

        ctx.save();
        ctx.beginPath();
        ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isDone ? pattern.color : isNext ? '#111827' : 'rgba(15, 23, 42, 0.85)';
        ctx.shadowColor = isDone || isNext ? pattern.color : 'transparent';
        ctx.shadowBlur = isNext ? 26 : isDone ? 16 : 0;
        ctx.fill();

        ctx.lineWidth = isNext ? 3.5 : 2;
        ctx.strokeStyle = isDone ? '#ffffff' : isNext ? pattern.color : 'rgba(255,255,255,0.3)';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${idx + 1}`, nd.x, nd.y - 2);

        ctx.font = '700 10px sans-serif';
        ctx.fillStyle = isNext ? '#fde047' : '#cbd5e1';
        ctx.fillText(nd.label, nd.x, nd.y + r + 12);
        ctx.restore();
      });

      // شظايا حبر الشاكرا
      for (let i = inkSparks.length - 1; i >= 0; i--) {
        const sp = inkSparks[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.alpha -= 0.04;
        if (sp.alpha <= 0) {
          inkSparks.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = sp.alpha;
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // انفجار الجوتسو عند إتمام الختم
      if (jutsuBlastAnim > 0) {
        jutsuBlastAnim--;
        ctx.save();
        const blastR = (25 - jutsuBlastAnim) * 22;
        const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, blastR);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.5, pattern.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, blastR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      animId = requestAnimationFrame(renderSealStage);
    };

    animId = requestAnimationFrame(renderSealStage);
    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [gameId, appPhase, currentSealIdx]);

  // ============================================================================
  // المحرك الثالث: طاولة حرب البطاقات الهولوغرام 3D المطورة (3D TACTICAL CARD CLASH)
  // ============================================================================
  const handlePlayCard = (card: (typeof ANIME_FIGHTER_DECK)[0]) => {
    if (appPhase !== 'PLAYING' || clashingPair) return;
    const opp = ANIME_FIGHTER_DECK[Math.floor(Math.random() * ANIME_FIGHTER_DECK.length)];

    // مكافأة تآزر مكتبة الأنمي وتآزر العناصر
    const libraryBuff = Math.round(card[chosenAttr] * (librarySynergy.atkBonusPct / 200));
    const elementBonus = (card.power + card.speed) % 2 === 0;
    const myVal = card[chosenAttr] + libraryBuff + (elementBonus ? 5 : 0);
    const oppVal = opp[chosenAttr];
    const wonClash = myVal >= oppVal;
    const damageDealt = wonClash ? Math.max(350, (myVal - oppVal + 18) * 32) : 220;

    setClashingPair({
      myCard: card,
      oppCard: opp,
      stat: chosenAttr,
      wonClash,
      damageDealt,
      elementBonus
    });
    setFieldCards((prev) => [...prev.slice(-2), card]);
    setPlayerMana((m) => Math.min(10, m + 2));
    triggerHeroAttackPose();
    chargeUltimate(24);

    if (wonClash) {
      sfx.playSlash();
      updateCombo(comboRef.current + 1);
      const gained = addSynergyScore(75 + comboRef.current * 16);

      // كسر درع الخصم ثم خصم نقاط حياته (LP)
      setEnemyShieldHp((sh) => {
        const remShield = Math.max(0, sh - damageDealt * 0.5);
        return Math.round(remShield);
      });
      setEnemyLp((lp) => {
        const nextLp = Math.max(0, lp - damageDealt);
        if (nextLp <= 0) {
          addSynergyScore(160);
          setTimeout(() => triggerEndGame(scoreRef.current, true), 650);
        }
        return nextLp;
      });
      addPopup(`🃏 اختراق هولوغرام 3D (-${damageDealt} LP) +${gained}`, 50, 36, '#10b981');
    } else {
      sfx.playHit();
      updateCombo(0);
      addSynergyScore(20);
      setPlayerLp((lp) => Math.max(200, lp - 320));
      addPopup('⚡ تصادم متكافئ مع درع الخصم +20', 50, 38, '#f59e0b');
    }

    setTimeout(() => {
      setClashingPair(null);
      setHandCards([...ANIME_FIGHTER_DECK].sort(() => Math.random() - 0.5).slice(0, 4));
    }, 1050);
  };

  // ============================================================================
  // المحرك الرابع: استكشاف الدانجون وفتح البوابات واستخراج الظلال (DUNGEON GATE EXPLORER)
  // ============================================================================
  useEffect(() => {
    if (gameId !== 'dungeon_gate_explorer' || appPhase !== 'PLAYING' || !activeDungeonRoom) return;
    if (activeDungeonRoom.type !== 'monster' && activeDungeonRoom.type !== 'boss') return;

    const dangerTimer = setInterval(() => {
      setBossDangerZone(true);
      setTimeout(() => {
        setBossDangerZone((stillDanger) => {
          if (stillDanger && !playerDodging) {
            sfx.playHit();
            livesRef.current = Math.max(0, livesRef.current - 1);
            setLives(livesRef.current);
            addPopup('💥 ضربة وحش البوابة! استخدم المراوغة!', 50, 42, '#ef4444');
            if (livesRef.current <= 0) triggerEndGame(scoreRef.current);
          }
          return false;
        });
      }, 950);
    }, 3400);

    // هجوم تلقائي مساند من جنود الظلال المستخرجين!
    const shadowAssistTimer = setInterval(() => {
      if (extractedShadows.length > 0) {
        const totalShadowDmg = extractedShadows.reduce((acc, s) => acc + s.atkBonus, 0);
        setRoomEnemyHp((hp) => {
          const next = Math.max(0, hp - totalShadowDmg);
          return next;
        });
      }
    }, 1400);

    return () => {
      clearInterval(dangerTimer);
      clearInterval(shadowAssistTimer);
    };
  }, [gameId, appPhase, activeDungeonRoom, playerDodging, extractedShadows]);

  const handleEnterDungeonRoom = (room: DungeonRoomNode) => {
    if (!room.unlocked || room.cleared) return;
    sfx.playJump();
    setCanExtractShadow(null);

    if (room.type === 'altar') {
      chargeUltimate(45);
      const pts = addSynergyScore(65);
      addPopup(`⛩️ مذبح الرون منحك طاقة قصوى +${pts} PT!`, 50, 35, '#00E5FF');
      completeDungeonRoom(room.id);
      return;
    }

    if (room.type === 'chest') {
      sfx.playVictory();
      const pts = addSynergyScore(95);
      addPopup(`💎 خزينة الآثار الملكية +${pts} PT!`, 50, 35, '#facc15');
      completeDungeonRoom(room.id);
      return;
    }

    setRoomEnemyHp(100);
    setActiveDungeonRoom(room);
  };

  const completeDungeonRoom = (roomId: number) => {
    setDungeonRooms((prev) =>
      prev.map((r) => {
        if (r.id === roomId) return { ...r, cleared: true };
        if (r.id === roomId + 1 || r.id === roomId + 2) return { ...r, unlocked: true };
        return r;
      })
    );
    setActiveDungeonRoom(null);
  };

  const handleDungeonStrike = () => {
    if (!activeDungeonRoom) return;
    sfx.playSlash();
    triggerHeroAttackPose();
    chargeUltimate(18);
    updateCombo(comboRef.current + 1);

    const shadowBonus = extractedShadows.reduce((s, a) => s + a.atkBonus, 0);
    const dmg = (activeDungeonRoom.type === 'boss' ? 11 : 18) + Math.round(shadowBonus * 0.5);
    const pts = addSynergyScore(34 + comboRef.current * 4);
    addPopup(`🗡️ قاطع الظلال -${dmg}% HP (+${pts})`, 35 + Math.random() * 30, 38, '#10b981');

    setRoomEnemyHp((prev) => {
      const next = Math.max(0, prev - dmg);
      if (next <= 0) {
        sfx.playVictory();
        const isBossRoom = activeDungeonRoom.type === 'boss';
        if (isBossRoom) {
          addSynergyScore(180);
          setTimeout(() => triggerEndGame(scoreRef.current, true), 550);
        } else {
          setCanExtractShadow({
            id: `shadow-${activeDungeonRoom.id}`,
            nameAr: `ظل ${activeDungeonRoom.enemyNameAr}`,
            rank: 'S',
            atkBonus: 12,
            color: '#10b981'
          });
        }
      }
      return next;
    });
  };

  const handleAriseShadow = () => {
    if (!canExtractShadow || !activeDungeonRoom) return;
    sfx.playUltimate();
    setExtractedShadows((prev) => [...prev, canExtractShadow]);
    addSynergyScore(75);
    addPopup(`🌑 ARISE! انضم «${canExtractShadow.nameAr}» لجيشك!`, 50, 32, '#a855f7');
    const finishedId = activeDungeonRoom.id;
    setCanExtractShadow(null);
    completeDungeonRoom(finishedId);
  };

  // ============================================================================
  // بقية الألعاب الكلاسيكية (نصل الشينوبي، تصادم الأشعة، الغريزة، الشارينغان، إلخ)
  // ============================================================================
  const katanaCanvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (gameId !== 'katana_slash' || appPhase !== 'PLAYING') return;
    const canvas = katanaCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let tick = 0;
    const width = (canvas.width = canvas.parentElement?.clientWidth || 420);
    const height = (canvas.height = canvas.parentElement?.clientHeight || 420);

    interface OrbTarget {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      color: string;
      innerColor: string;
      isBomb: boolean;
      sliced: boolean;
      angle: number;
      vAngle: number;
    }

    const orbs: OrbTarget[] = [];
    const particles: { x: number; y: number; vx: number; vy: number; alpha: number; color: string; size: number }[] = [];
    const bladeTrail: { x: number; y: number; life: number }[] = [];
    let avatarSlashWave = 0;

    const palette = [
      { main: selectedHero.auraColor, inner: '#ffffff' },
      { main: '#FF1744', inner: '#ff8a80' },
      { main: '#a855f7', inner: '#e9d5ff' },
      { main: '#38bdf8', inner: '#bae6fd' },
      { main: '#f59e0b', inner: '#fde68a' }
    ];

    const spawnOrb = () => {
      const isBomb = Math.random() < 0.2;
      const x = 50 + Math.random() * (width - 100);
      const vx = (width / 2 - x) * 0.013 + (Math.random() - 0.5) * 2.4;
      const vy = -(9.0 + Math.random() * 2.8);
      const pal = palette[Math.floor(Math.random() * palette.length)];
      orbs.push({
        x,
        y: height + 24,
        vx,
        vy,
        radius: isBomb ? 25 : 29,
        color: isBomb ? '#ef4444' : pal.main,
        innerColor: isBomb ? '#450a0a' : pal.inner,
        isBomb,
        sliced: false,
        angle: 0,
        vAngle: (Math.random() - 0.5) * 0.14
      });
    };

    const spawnInterval = setInterval(() => {
      spawnOrb();
      if (Math.random() > 0.4) spawnOrb();
    }, 600);

    const handleSliceAt = (px: number, py: number) => {
      bladeTrail.push({ x: px, y: py, life: 1 });
      if (bladeTrail.length > 18) bladeTrail.shift();

      orbs.forEach((orb) => {
        if (orb.sliced) return;
        const dist = Math.hypot(orb.x - px, orb.y - py);
        if (dist <= orb.radius + 22) {
          orb.sliced = true;
          avatarSlashWave = 1.0;

          for (let i = 0; i < 16; i++) {
            particles.push({
              x: orb.x,
              y: orb.y,
              vx: (Math.random() - 0.5) * 12,
              vy: (Math.random() - 0.5) * 12,
              alpha: 1,
              color: orb.isBomb ? '#ef4444' : orb.innerColor,
              size: 3 + Math.random() * 4.5
            });
          }

          if (orb.isBomb) {
            sfx.playHit();
            updateCombo(0);
            setHeroPose('hit');
            setTimeout(() => setHeroPose('idle'), 300);
            livesRef.current = Math.max(0, livesRef.current - 1);
            setLives(livesRef.current);
            addPopup('💥 ختم متفجر!', 50, 38, '#ef4444');
            if (livesRef.current <= 0) triggerEndGame(scoreRef.current);
          } else {
            sfx.playSlash();
            triggerHeroAttackPose();
            updateCombo(comboRef.current + 1);
            chargeUltimate(12);
            addSynergyScore(24 + Math.min(40, comboRef.current * 5));
          }
        }
      });
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      handleSliceAt(e.clientX - rect.left, e.clientY - rect.top);
    };
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerMove);

    const render = () => {
      tick += 0.08;
      ctx.clearRect(0, 0, width, height);

      const heroX = width / 2;
      const heroY = height - 48;
      ctx.save();
      const auraRadius = 42 + Math.sin(tick * 3) * 6 + avatarSlashWave * 18;
      const auraGrad = ctx.createRadialGradient(heroX, heroY, 8, heroX, heroY, auraRadius);
      auraGrad.addColorStop(0, '#ffffff');
      auraGrad.addColorStop(0.45, selectedHero.auraColor);
      auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(heroX, heroY, auraRadius, 0, Math.PI * 2);
      ctx.fill();

      if (avatarSlashWave > 0.05) {
        ctx.strokeStyle = selectedHero.auraColor;
        ctx.lineWidth = 5 * avatarSlashWave;
        ctx.beginPath();
        ctx.arc(heroX, heroY, 45 + (1 - avatarSlashWave) * 90, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        avatarSlashWave *= 0.88;
      }

      ctx.beginPath();
      ctx.arc(heroX, heroY, 28, 0, Math.PI * 2);
      ctx.closePath();
      ctx.save();
      ctx.clip();
      if (heroAvatarImgRef.current && heroAvatarImgRef.current.complete) {
        ctx.drawImage(heroAvatarImgRef.current, heroX - 28, heroY - 28, 56, 56);
      }
      ctx.restore();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();

      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i];
        o.x += o.vx;
        o.y += o.vy;
        o.vy += 0.21;
        o.angle += o.vAngle;

        if (!o.sliced) {
          ctx.save();
          ctx.translate(o.x, o.y);
          ctx.rotate(o.angle);
          ctx.fillStyle = o.color;
          ctx.shadowColor = o.color;
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.arc(0, 0, o.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        if (o.y > height + 65 || o.sliced) orbs.splice(i, 1);
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.04;
        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (bladeTrail.length > 1) {
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < bladeTrail.length; i++) {
          const pt = bladeTrail[i];
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
          pt.life -= 0.085;
        }
        ctx.strokeStyle = selectedHero.auraColor;
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
      }
      while (bladeTrail.length > 0 && bladeTrail[0].life <= 0) bladeTrail.shift();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      clearInterval(spawnInterval);
      cancelAnimationFrame(animId);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerMove);
    };
  }, [gameId, appPhase, selectedHero]);

  // تصادم الأشعة (Beam Clash)
  const beamCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const beamPowerRef = useRef(50);
  useEffect(() => {
    beamPowerRef.current = beamPower;
  }, [beamPower]);

  useEffect(() => {
    if (gameId !== 'beam_clash' || appPhase !== 'PLAYING') return;
    const enemyPush = setInterval(() => {
      setBeamPower((prev) => Math.max(6, prev - 2.6));
      if (Math.random() > 0.38) {
        setCriticalNode({
          x: 24 + Math.floor(Math.random() * 52),
          y: 22 + Math.floor(Math.random() * 48)
        });
      }
    }, 340);
    return () => clearInterval(enemyPush);
  }, [gameId, appPhase]);

  useEffect(() => {
    if (gameId !== 'beam_clash' || appPhase !== 'PLAYING') return;
    const canvas = beamCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let tick = 0;
    const width = (canvas.width = canvas.parentElement?.clientWidth || 380);
    const height = (canvas.height = 240);

    const renderBeam = () => {
      tick += 0.16;
      ctx.clearRect(0, 0, width, height);
      const cy = height / 2;
      const clashX = width - (beamPowerRef.current / 100) * width;

      const enemyGrad = ctx.createLinearGradient(0, cy, clashX, cy);
      enemyGrad.addColorStop(0, '#4f46e5');
      enemyGrad.addColorStop(1, '#38bdf8');
      ctx.fillStyle = enemyGrad;
      ctx.beginPath();
      ctx.roundRect(0, cy - 20, Math.max(12, clashX), 40, 20);
      ctx.fill();

      const heroGrad = ctx.createLinearGradient(width, cy, clashX, cy);
      heroGrad.addColorStop(0, selectedHero.auraColor);
      heroGrad.addColorStop(1, '#ffffff');
      ctx.fillStyle = heroGrad;
      ctx.beginPath();
      ctx.roundRect(clashX, cy - 22, Math.max(12, width - clashX), 44, 22);
      ctx.fill();

      const pulseRadius = 30 + Math.sin(tick * 4) * 7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(clashX, cy, pulseRadius * 0.6, 0, Math.PI * 2);
      ctx.fill();

      animId = requestAnimationFrame(renderBeam);
    };
    animId = requestAnimationFrame(renderBeam);
    return () => cancelAnimationFrame(animId);
  }, [gameId, appPhase, selectedHero]);

  const handleBeamSurge = (isCrit = false) => {
    if (appPhase !== 'PLAYING') return;
    sfx.playSlash();
    triggerHeroAttackPose();
    chargeUltimate(isCrit ? 22 : 9);
    const boost = isCrit ? 12 : 6;
    addSynergyScore(isCrit ? 50 : 22);
    updateCombo(comboRef.current + 1);
    if (isCrit) {
      addPopup('⚡ موجة خارقة مزدوجة!', 50, 32, '#38bdf8');
      setCriticalNode(null);
    }
    setBeamPower((prev) => {
      const next = Math.min(100, prev + boost);
      if (next >= 100) {
        addSynergyScore(130);
        triggerEndGame(scoreRef.current, true);
      }
      return next;
    });
  };

  // مدار الغريزة الفائقة (Ultra Dodge)
  const dodgeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (gameId !== 'ultra_dodge' || appPhase !== 'PLAYING') return;
    const canvas = dodgeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const width = (canvas.width = canvas.parentElement?.clientWidth || 400);
    const height = (canvas.height = 390);
    const player = { x: width / 2, y: height - 70, r: 24 };
    const hazards: { x: number; y: number; vx: number; vy: number; r: number; isStar: boolean }[] = [];

    const spawnTimer = setInterval(() => {
      const isStar = Math.random() < 0.38;
      hazards.push({
        x: 28 + Math.random() * (width - 56),
        y: -24,
        vx: (Math.random() - 0.5) * 2.0,
        vy: isStar ? 4.5 : 5.5 + Math.random() * 2.8,
        r: isStar ? 16 : 17,
        isStar
      });
    }, 320);

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      player.x = Math.max(28, Math.min(width - 28, e.clientX - rect.left));
      player.y = Math.max(40, Math.min(height - 32, e.clientY - rect.top));
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onMove);

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
      ctx.fillStyle = selectedHero.auraColor;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();

      for (let i = hazards.length - 1; i >= 0; i--) {
        const h = hazards[i];
        h.x += h.vx;
        h.y += h.vy;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fillStyle = h.isStar ? '#facc15' : '#FF1744';
        ctx.fill();

        if (Math.hypot(h.x - player.x, h.y - player.y) < h.r + player.r - 3) {
          hazards.splice(i, 1);
          if (h.isStar) {
            sfx.playSlash();
            chargeUltimate(16);
            addSynergyScore(40);
            updateCombo(comboRef.current + 1);
          } else {
            sfx.playHit();
            updateCombo(0);
            livesRef.current = Math.max(0, livesRef.current - 1);
            setLives(livesRef.current);
            if (livesRef.current <= 0) triggerEndGame(scoreRef.current);
          }
          continue;
        }
        if (h.y > height + 30) {
          if (!h.isStar) addSynergyScore(10);
          hazards.splice(i, 1);
        }
      }
      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);
    return () => {
      clearInterval(spawnTimer);
      cancelAnimationFrame(animId);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onMove);
    };
  }, [gameId, appPhase, selectedHero]);

  // عدسة الشارينغان
  const [radarQuestions] = useState(() => getNonRepeatingQuestions(8));
  const [radarIdx, setRadarIdx] = useState(0);
  const [radarBlur, setRadarBlur] = useState(16);

  useEffect(() => {
    if (gameId !== 'sharingan_radar' || appPhase !== 'PLAYING') return;
    setRadarBlur(16);
    const t = setInterval(() => setRadarBlur((b) => Math.max(0, b - 2)), 650);
    return () => clearInterval(t);
  }, [gameId, radarIdx, appPhase]);

  const handleRadarPick = (optIdx: number) => {
    if (appPhase !== 'PLAYING') return;
    const cur = radarQuestions[radarIdx % radarQuestions.length];
    if (optIdx === cur.correctIndex) {
      sfx.playSlash();
      triggerHeroAttackPose();
      chargeUltimate(25);
      const pts = addSynergyScore(60 + radarBlur * 4);
      updateCombo(comboRef.current + 1);
      addPopup(`👁️ كشف الشارينغان +${pts}`, 50, 35, '#ef4444');
    } else {
      sfx.playHit();
      updateCombo(0);
      livesRef.current = Math.max(0, livesRef.current - 1);
      setLives(livesRef.current);
      if (livesRef.current <= 0) {
        triggerEndGame(scoreRef.current);
        return;
      }
    }
    setRadarIdx((prev) => prev + 1);
  };

  // غارة الزعيم الكلاسيكية
  useEffect(() => {
    if (gameId !== 'boss_raid' || appPhase !== 'PLAYING') return;
    const t = setInterval(() => {
      setWeakSpotPos({
        x: 22 + Math.floor(Math.random() * 56),
        y: 22 + Math.floor(Math.random() * 52)
      });
    }, 800);
    return () => clearInterval(t);
  }, [gameId, appPhase]);

  const handleStrikeBoss = () => {
    if (appPhase !== 'PLAYING') return;
    sfx.playSlash();
    triggerHeroAttackPose();
    chargeUltimate(20);
    addSynergyScore(36);
    updateCombo(comboRef.current + 1);
    setBossShake(true);
    setTimeout(() => setBossShake(false), 220);
    setBossHp((prev) => {
      const next = Math.max(0, prev - 9);
      if (next <= 0) {
        addSynergyScore(150);
        triggerEndGame(scoreRef.current, true);
      }
      return next;
    });
  };

  // برج السماء
  const handleClimbGate = (gateIdx: number) => {
    if (appPhase !== 'PLAYING') return;
    const trapGate = Math.floor(Math.random() * 3);
    if (gateIdx === trapGate) {
      sfx.playHit();
      if (towerShield) {
        setTowerShield(false);
        addPopup('🛡️ درع النين صدّ الفخ!', 50, 40, '#38bdf8');
      } else {
        livesRef.current = Math.max(0, livesRef.current - 1);
        setLives(livesRef.current);
        if (livesRef.current <= 0) triggerEndGame(scoreRef.current);
      }
    } else {
      sfx.playJump();
      chargeUltimate(20);
      const gain = addSynergyScore(Math.round(48 * (gateIdx === 1 ? 2 : 1.5) + towerFloor * 9));
      updateCombo(comboRef.current + 1);
      setTowerFloor((f) => f + 1);
      addPopup(`🗼 صعود الطابق ${towerFloor + 1} (+${gain})`, 50, 35, '#facc15');
    }
  };

  // سباق أسطح كونوها
  const parkourCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const jumpTriggerRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (gameId !== 'shinobi_parkour' || appPhase !== 'PLAYING') return;
    const canvas = parkourCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const width = (canvas.width = canvas.parentElement?.clientWidth || 400);
    const height = (canvas.height = 360);
    const groundY = height - 54;
    const ninja = { x: 82, y: groundY - 24, vy: 0, jumps: 0 };
    const obstacles: { x: number; y: number; isScroll: boolean; r: number }[] = [];

    jumpTriggerRef.current = () => {
      if (ninja.jumps < 2) {
        sfx.playJump();
        ninja.vy = -10.8;
        ninja.jumps += 1;
      }
    };

    const spawnObs = setInterval(() => {
      const isScroll = Math.random() < 0.44;
      obstacles.push({
        x: width + 25,
        y: isScroll ? groundY - 85 - Math.random() * 60 : groundY - 22,
        isScroll,
        r: isScroll ? 16 : 18
      });
    }, 650);

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(18, 12, 34, 0.94)';
      ctx.fillRect(0, groundY, width, height - groundY);

      ninja.y += ninja.vy;
      ninja.vy += 0.52;
      if (ninja.y >= groundY - 24) {
        ninja.y = groundY - 24;
        ninja.vy = 0;
        ninja.jumps = 0;
      }

      ctx.beginPath();
      ctx.arc(ninja.x, ninja.y, 22, 0, Math.PI * 2);
      ctx.fillStyle = selectedHero.auraColor;
      ctx.fill();

      for (let i = obstacles.length - 1; i >= 0; i--) {
        const ob = obstacles[i];
        ob.x -= 6.2;
        ctx.beginPath();
        ctx.arc(ob.x, ob.y, ob.r, 0, Math.PI * 2);
        ctx.fillStyle = ob.isScroll ? '#facc15' : '#ef4444';
        ctx.fill();

        if (Math.hypot(ob.x - ninja.x, ob.y - ninja.y) < ob.r + 18) {
          obstacles.splice(i, 1);
          if (ob.isScroll) {
            sfx.playSlash();
            chargeUltimate(18);
            addSynergyScore(44);
          } else {
            sfx.playHit();
            livesRef.current = Math.max(0, livesRef.current - 1);
            setLives(livesRef.current);
            if (livesRef.current <= 0) triggerEndGame(scoreRef.current);
          }
          continue;
        }
        if (ob.x < -30) {
          if (!ob.isScroll) addSynergyScore(12);
          obstacles.splice(i, 1);
        }
      }
      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);
    return () => {
      clearInterval(spawnObs);
      cancelAnimationFrame(animId);
    };
  }, [gameId, appPhase, selectedHero]);

  const currentSealDef = NINJUTSU_SEAL_PATTERNS[currentSealIdx % NINJUTSU_SEAL_PATTERNS.length];

  return (
    <div
      onPointerMove={handleGlobalParallaxMove}
      className="fixed inset-0 z-[9999] bg-[#040408] text-white flex flex-col justify-between overflow-hidden select-none font-sans"
      dir="rtl"
    >
      {/* خلفية عالم الأنمي المرسومة مع تحريك Parallax */}
      <motion.img
        src={gameMeta.worldArt}
        alt=""
        style={{ x: bgParallaxX, y: bgParallaxY, scale: 1.12 }}
        className="absolute inset-0 w-full h-full object-cover opacity-45 pointer-events-none"
      />
      <div
        className={`absolute inset-0 bg-gradient-to-b ${gameMeta.gradient} pointer-events-none z-[1]`}
      />

      <ThreeAnimeParallaxScene
        accentColor={selectedHero.auraColor || gameMeta.accentColor}
        secondaryColor={selectedHero.secondaryColor || '#facc15'}
        burstTrigger={particleBurstTrigger}
        burstMode={particleBurstMode}
        intensity="high"
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_15%,#040408_95%)] pointer-events-none z-[3]" />

      {/* شريط الضربة القاضية السينمائي (ULTIMATE CUT-IN) */}
      <AnimatePresence>
        {ultimateCutIn && (
          <motion.div
            initial={{ opacity: 0, x: 250, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -250 }}
            className="fixed inset-x-0 top-1/3 z-[10000] pointer-events-none flex items-center justify-center"
          >
            <div
              style={{ borderColor: selectedHero.auraColor }}
              className="w-full py-5 bg-gradient-to-l from-black via-[#1a0b1e] to-black border-y-4 shadow-[0_0_80px_#FF1744] flex items-center justify-center gap-5 px-6"
            >
              <img
                src={selectedHero.avatar}
                onError={(e) => {
                  e.currentTarget.src = getAnimeSvgFallback(selectedHero.name, selectedHero.auraColor);
                }}
                alt=""
                className="w-24 h-24 rounded-3xl object-cover ring-4 ring-white shadow-2xl"
              />
              <div className="text-right">
                <span className="text-xs font-black text-amber-300 tracking-widest block">
                  ⚡ ULTIMATE FINISHER UNLEASHED ⚡
                </span>
                <h2 className="text-xl sm:text-3xl font-black text-white drop-shadow-[0_0_20px_#FF1744]">
                  {selectedHero.ultimateNameAr}
                </h2>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* لافتة إطلاق النينجيتسو عند اكتمال الختم */}
      <AnimatePresence>
        {activeJutsuBanner && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] bg-black/90 border-2 border-cyan-400 px-6 py-2.5 rounded-2xl shadow-[0_0_40px_#00E5FF] pointer-events-none text-center"
          >
            <div className="text-[10px] font-black text-cyan-300 tracking-widest">PERFECT HAND SEAL</div>
            <div className="text-sm sm:text-base font-black text-white">{activeJutsuBanner}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* المؤثرات العائمة للضربات */}
      <AnimatePresence>
        {floatingPopups.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 1, y: 0, scale: 0.75 }}
            animate={{ opacity: 0, y: -55, scale: 1.25 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65 }}
            style={{ left: `${p.x}%`, top: `${p.y}%`, color: p.color }}
            className="fixed z-50 -translate-x-1/2 font-black text-base pointer-events-none drop-shadow-[0_0_16px_rgba(0,0,0,0.95)]"
          >
            {p.text}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* =====================================================================
          الطور الأول: شاشة بداية اللعبة واختيار المقاتل وتآزر المكتبة
         ===================================================================== */}
      {appPhase === 'TITLE_LOBBY' && (
        <div className="relative z-30 flex-1 flex flex-col justify-between p-4 sm:p-6 max-w-4xl w-full mx-auto overflow-y-auto">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={onClose}
              className="bg-black/75 hover:bg-[#FF1744] text-white border border-white/20 px-4 py-2.5 rounded-2xl text-xs font-black flex items-center gap-2 transition cursor-pointer shadow-xl"
            >
              <ChevronLeft size={16} className="rotate-180" />
              <span>بوابة الساحة والألعاب</span>
            </button>

            <div className="flex items-center gap-2">
              <div className="bg-emerald-500/15 border border-emerald-400/40 px-3 py-2 rounded-2xl text-emerald-300 text-[11px] font-black">
                تآزر مكتبتك: +{librarySynergy.atkBonusPct}% هجوم
              </div>
              <div className="bg-black/75 border border-amber-400/40 px-3.5 py-2 rounded-2xl flex items-center gap-1.5 text-amber-400 text-xs font-black font-mono">
                <Coins size={14} />
                <span>{userData?.coins || 0}</span>
              </div>
              <button
                onClick={toggleSound}
                className="w-10 h-10 rounded-2xl bg-black/75 border border-white/15 flex items-center justify-center text-white cursor-pointer"
              >
                {soundMuted ? <VolumeX size={18} /> : <Volume2 size={18} className="text-emerald-400" />}
              </button>
            </div>
          </div>

          <div className="my-auto py-3 flex flex-col items-center text-center space-y-4">
            {storyChapter ? (
              <div className="bg-gradient-to-r from-amber-500/20 via-red-600/25 to-amber-500/20 border border-amber-400/50 rounded-2xl px-4 py-2 text-center">
                <span className="text-[10px] font-black text-amber-300 block">
                  📖 طور القصة الملحمي • زعيم الفصل: {storyChapter.bossNameAr}
                </span>
                <span className="text-xs font-black text-white">{storyChapter.titleAr}</span>
              </div>
            ) : null}

            <div className="space-y-1">
              <span
                style={{ backgroundColor: gameMeta.accentColor }}
                className="text-black text-[10px] font-black px-3.5 py-1 rounded-full tracking-wider inline-block shadow-lg"
              >
                {gameMeta.studioTag}
              </span>
              <h1 className="text-2xl sm:text-4xl font-black text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)]">
                {gameMeta.titleAr}
              </h1>
              <p className="text-xs text-neutral-300 max-w-xl mx-auto">
                {gameMeta.descriptionAr || gameMeta.subtitleAr}
              </p>
            </div>

            {/* استعراض المقاتل المختار */}
            <motion.div
              key={selectedHero.id}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative flex flex-col items-center"
            >
              <div
                style={{
                  boxShadow: `0 0 60px ${selectedHero.auraColor}`,
                  borderColor: selectedHero.auraColor
                }}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl overflow-hidden border-4 bg-black relative"
              >
                <img
                  src={selectedHero.avatar}
                  onError={(e) => {
                    e.currentTarget.src = getAnimeSvgFallback(selectedHero.name, selectedHero.auraColor);
                  }}
                  alt={selectedHero.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="mt-2 bg-black/85 border border-white/15 px-4 py-1.5 rounded-2xl">
                <div className="text-sm font-black text-white">{selectedHero.name}</div>
                <div className="text-[10px] text-amber-400 font-bold">
                  {selectedHero.titleAr} • {selectedHero.elementAr}
                </div>
              </div>
            </motion.div>

            {/* قائمة المقاتلين */}
            <div className="w-full max-w-2xl space-y-2">
              <div className="text-xs font-black text-neutral-200">
                اختر البطل المقاتل (تُضاف مكافأة مكتبة الأنمي +{librarySynergy.atkBonusPct}% تلقائياً):
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {playableHeroes.map((h) => {
                  const isSel = selectedHero.id === h.id;
                  return (
                    <button
                      key={h.id}
                      onClick={() => {
                        sfx.playSlash();
                        setSelectedHero(h);
                      }}
                      style={{
                        borderColor: isSel ? h.auraColor : 'rgba(255,255,255,0.12)'
                      }}
                      className={`p-2 rounded-2xl border-2 transition flex flex-col items-center gap-1 cursor-pointer ${
                        isSel ? 'bg-white/15 scale-105 shadow-xl' : 'bg-black/65 opacity-75 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={h.avatar}
                        onError={(e) => {
                          e.currentTarget.src = getAnimeSvgFallback(h.name, h.auraColor);
                        }}
                        alt={h.name}
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 rounded-xl object-cover bg-black"
                      />
                      <span className="text-[10px] font-black text-white truncate w-full text-center">
                        {h.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={startStandaloneGame}
              className="w-full max-w-md py-4 rounded-3xl bg-gradient-to-r from-[#FF1744] via-amber-500 to-[#FF1744] text-black font-black text-base sm:text-lg shadow-[0_0_45px_rgba(255,23,68,0.65)] flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <Play size={20} className="fill-black" />
              <span>
                {storyChapter ? `بدء معركة ${storyChapter.titleAr}` : 'انطلاق لعالم اللعبة (START)'}
              </span>
            </motion.button>
          </div>
        </div>
      )}

      {/* =====================================================================
          الطور الثاني: ساحة اللعب الحركي المباشر (ACTIVE 60FPS STAGE)
         ===================================================================== */}
      {appPhase === 'PLAYING' && (
        <>
          {/* شريط القتال العلوي (Arcade HUD) */}
          <div className="relative z-20 px-3.5 py-2 bg-black/80 backdrop-blur-xl border-b border-white/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-[#FF1744] border border-white/15 flex items-center justify-center text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>

              <motion.div
                animate={
                  heroPose === 'attack'
                    ? { scale: 1.18, rotate: -6 }
                    : heroPose === 'hit'
                    ? { x: [-5, 5, -5, 0] }
                    : { scale: 1 }
                }
                style={{ borderColor: selectedHero.auraColor }}
                className="w-10 h-10 rounded-2xl overflow-hidden border-2 bg-black shadow-lg shrink-0"
              >
                <img
                  src={selectedHero.avatar}
                  onError={(e) => {
                    e.currentTarget.src = getAnimeSvgFallback(selectedHero.name, selectedHero.auraColor);
                  }}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </motion.div>

              <div>
                <div className="text-xs font-black text-white flex items-center gap-1.5">
                  <span>{selectedHero.name}</span>
                  <span className="text-[10px] text-amber-400 font-mono">🎯 {targetToBeat}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  {[1, 2, 3].map((h) => (
                    <Heart
                      key={h}
                      size={12}
                      className={
                        h <= lives
                          ? 'text-[#FF1744] fill-[#FF1744] drop-shadow-[0_0_6px_#FF1744]'
                          : 'text-neutral-700'
                      }
                    />
                  ))}
                  <span className="text-[9px] text-emerald-400 font-bold mr-1">
                    +{librarySynergy.atkBonusPct}% تآزر
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {combo >= 2 && (
                <motion.span
                  key={combo}
                  initial={{ scale: 1.35 }}
                  animate={{ scale: 1 }}
                  className="bg-gradient-to-r from-amber-500 to-[#FF1744] text-black text-xs font-black px-2.5 py-1 rounded-xl font-mono tabular-nums"
                >
                  🔥x{combo}
                </motion.span>
              )}

              <div className="bg-emerald-500/20 border border-emerald-400/40 px-2.5 py-1 rounded-xl text-xs sm:text-sm font-black font-mono tabular-nums text-emerald-300">
                {score} PT
              </div>

              <div className="bg-[#FF1744]/25 border border-[#FF1744] px-2.5 py-1 rounded-xl text-xs sm:text-sm font-black font-mono tabular-nums text-white">
                {timeLeft}s
              </div>

              <button
                onClick={toggleSound}
                className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white cursor-pointer"
              >
                {soundMuted ? <VolumeX size={14} /> : <Volume2 size={14} className="text-emerald-400" />}
              </button>
            </div>
          </div>

          {/* مسرح اللعب التفاعلي */}
          <motion.div
            style={{ rotateX: stageRotateX, rotateY: stageRotateY, transformPerspective: 1100 }}
            className="relative z-10 flex-1 flex flex-col items-center justify-center p-2 sm:p-4 max-w-4xl w-full mx-auto overflow-hidden"
          >
            {/* 1. ملحمة قتال الأبطال 2D بالفيزياء والقدرات الخارقة */}
            {gameId === 'hero_fighter_2d' && (
              <div className="w-full h-full flex flex-col justify-between gap-2.5">
                {/* أشرطة صحة وكسر درع القتال 2D */}
                <div className="grid grid-cols-2 gap-3 bg-black/75 border border-white/15 rounded-2xl p-2.5">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-black">
                      <span className="text-emerald-400">{selectedHero.name}</span>
                      <span className="font-mono tabular-nums">{fighterPlayerHp}% HP</span>
                    </div>
                    <div className="w-full h-3 bg-black rounded-full overflow-hidden border border-emerald-500/40">
                      <div
                        style={{ width: `${fighterPlayerHp}%` }}
                        className="h-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-150"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-black">
                      <span className="text-purple-300">
                        {storyChapter?.bossNameAr || ghostTarget?.name || 'زعيم الحلبة الخارق'}
                      </span>
                      <span className="font-mono tabular-nums text-red-400">{fighterBossHp}% HP</span>
                    </div>
                    <div className="w-full h-3 bg-black rounded-full overflow-hidden border border-red-500/40">
                      <div
                        style={{ width: `${fighterBossHp}%` }}
                        className="h-full bg-gradient-to-r from-[#FF1744] to-amber-500 transition-all duration-150"
                      />
                    </div>
                    <div className="w-full h-1.5 bg-black rounded-full overflow-hidden">
                      <div
                        style={{ width: `${fighterBossStagger}%` }}
                        className="h-full bg-amber-400 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* كانفاس الفيزياء 60FPS */}
                <div className="relative flex-1 min-h-[240px] max-h-[340px] w-full rounded-3xl overflow-hidden border-2 border-[#FF1744]/50 bg-black/65 shadow-[0_0_50px_rgba(255,23,68,0.25)]">
                  <canvas ref={fighterCanvasRef} className="w-full h-full block" />
                </div>

                {/* لوحة أزرار التحكم القتالية (تعمل باللمس والماوس والكيبورد) */}
                <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
                  <div className="col-span-1 sm:col-span-3 grid grid-cols-3 gap-1.5">
                    <button
                      onPointerDown={() => fighterControlsRef.current.moveRight()}
                      className="bg-[#161625] active:bg-[#FF1744] border border-white/15 rounded-2xl py-3 flex flex-col items-center justify-center gap-0.5 text-white font-black text-[11px] cursor-pointer"
                    >
                      <ArrowRight size={16} />
                      <span>تقدم</span>
                    </button>
                    <button
                      onPointerDown={() => fighterControlsRef.current.jump()}
                      className="bg-[#161625] active:bg-sky-500 border border-white/15 rounded-2xl py-3 flex flex-col items-center justify-center gap-0.5 text-white font-black text-[11px] cursor-pointer"
                    >
                      <ArrowUp size={16} />
                      <span>قفز x2</span>
                    </button>
                    <button
                      onPointerDown={() => fighterControlsRef.current.moveLeft()}
                      className="bg-[#161625] active:bg-[#FF1744] border border-white/15 rounded-2xl py-3 flex flex-col items-center justify-center gap-0.5 text-white font-black text-[11px] cursor-pointer"
                    >
                      <ArrowLeft size={16} />
                      <span>تراجع</span>
                    </button>
                  </div>

                  <div className="col-span-1 sm:col-span-4 grid grid-cols-4 gap-1.5">
                    <button
                      onPointerDown={() => fighterControlsRef.current.slashCombo()}
                      className="bg-gradient-to-b from-[#FF1744] to-rose-700 text-white rounded-2xl py-3 flex flex-col items-center justify-center gap-0.5 font-black text-[11px] shadow-[0_0_20px_rgba(255,23,68,0.5)] active:scale-95 cursor-pointer"
                    >
                      <Swords size={16} />
                      <span>كومبو ⚔️</span>
                    </button>
                    <button
                      onPointerDown={() => fighterControlsRef.current.kiBlast()}
                      className="bg-gradient-to-b from-amber-500 to-orange-600 text-black rounded-2xl py-3 flex flex-col items-center justify-center gap-0.5 font-black text-[11px] active:scale-95 cursor-pointer"
                    >
                      <Flame size={16} />
                      <span>موجة كي 🔥</span>
                    </button>
                    <button
                      onPointerDown={() => fighterControlsRef.current.parryGuard()}
                      className="bg-gradient-to-b from-sky-400 to-blue-600 text-black rounded-2xl py-3 flex flex-col items-center justify-center gap-0.5 font-black text-[11px] active:scale-95 cursor-pointer"
                    >
                      <Shield size={16} />
                      <span>صدّ عاكس 🛡️</span>
                    </button>
                    <button
                      onPointerDown={() => fighterControlsRef.current.dash()}
                      className="bg-gradient-to-b from-purple-500 to-indigo-700 text-white rounded-2xl py-3 flex flex-col items-center justify-center gap-0.5 font-black text-[11px] active:scale-95 cursor-pointer"
                    >
                      <Zap size={16} />
                      <span>اندفاع ⚡</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 2. رسم أختام النينجيتسو بالسحب المباشر على الشاشة */}
            {gameId === 'ninjutsu_seal_canvas' && (
              <div className="w-full h-full flex flex-col justify-between gap-3">
                <div className="bg-black/75 border border-cyan-500/40 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-black text-cyan-400">
                      {currentSealDef.elementAr} • اسحب بإصبعك أو الماوس بالترتيب (1 ⬅️ {currentSealDef.nodes.length})
                    </div>
                    <div className="text-xs sm:text-sm font-black text-white">{currentSealDef.nameAr}</div>
                  </div>

                  <div className="flex items-center gap-3">
                    {sealAccuracyLast !== null && (
                      <span className="bg-emerald-500/20 border border-emerald-400 px-2.5 py-1 rounded-xl text-xs font-black text-emerald-300 font-mono">
                        دقة الختم: {sealAccuracyLast}%
                      </span>
                    )}
                    <div className="w-32 space-y-1">
                      <div className="flex justify-between text-[10px] font-black text-red-300">
                        <span>صحة الخصم</span>
                        <span className="font-mono">{sealBossHp}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-black rounded-full overflow-hidden border border-red-500/40">
                        <div
                          style={{ width: `${sealBossHp}%` }}
                          className="h-full bg-gradient-to-r from-[#FF1744] to-amber-400 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="relative flex-1 min-h-[290px] max-h-[380px] w-full rounded-3xl overflow-hidden border-2 border-cyan-400/50 bg-black/65 shadow-[0_0_50px_rgba(0,229,255,0.2)]">
                  <canvas
                    ref={sealCanvasRef}
                    className="w-full h-full touch-none cursor-crosshair block"
                  />
                </div>
              </div>
            )}

            {/* 3. طاولة حرب البطاقات التكتيكية 3D الهولوغرامية */}
            {gameId === 'card_clash' && (
              <div className="w-full flex flex-col justify-between gap-3">
                {/* شريط نقاط الحياة LP والمانا ودرع الخصم */}
                <div className="grid grid-cols-3 gap-2 bg-black/75 border border-purple-500/40 rounded-2xl p-2.5 items-center">
                  <div>
                    <span className="text-[10px] text-emerald-400 font-bold block">نقاط حياتك (LP)</span>
                    <span className="text-sm sm:text-base font-black text-white font-mono tabular-nums">
                      {playerLp} LP
                    </span>
                  </div>

                  <div className="text-center">
                    <span className="text-[10px] text-sky-300 font-black block">بلورات الشاكرا</span>
                    <div className="flex items-center justify-center gap-1 mt-0.5">
                      <span className="text-xs font-black font-mono text-sky-400">💎 {playerMana}/10</span>
                    </div>
                  </div>

                  <div className="text-left">
                    <span className="text-[10px] text-rose-400 font-bold block">
                      خصم الطاولة {enemyShieldHp > 0 ? `(🛡️${enemyShieldHp})` : '(مكسور الدرع!)'}
                    </span>
                    <span className="text-sm sm:text-base font-black text-amber-400 font-mono tabular-nums">
                      {enemyLp} LP
                    </span>
                  </div>
                </div>

                {/* اختيار تكتيك الهجوم */}
                <div className="flex items-center justify-center gap-2">
                  {[
                    { id: 'power', label: '⚔️ اختراق هجومي', color: 'bg-[#FF1744] text-white' },
                    { id: 'speed', label: '⚡ هجوم خاطف', color: 'bg-amber-400 text-black' },
                    { id: 'iq', label: '🧠 خدعة تكتيكية', color: 'bg-purple-600 text-white' }
                  ].map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setChosenAttr(st.id as any)}
                      className={`px-3.5 py-1.5 rounded-2xl text-xs font-black transition cursor-pointer ${
                        chosenAttr === st.id
                          ? `${st.color} scale-105 shadow-lg`
                          : 'bg-black/65 text-neutral-300 border border-white/15'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                {/* مسرح الطاولة ثلاثي الأبعاد */}
                <div
                  style={{ transform: 'perspective(1000px) rotateX(8deg)' }}
                  className="h-48 rounded-3xl bg-gradient-to-b from-[#17112b]/90 to-[#090712]/95 border-2 border-purple-500/50 flex items-center justify-center gap-6 p-4 relative overflow-hidden shadow-[0_20px_50px_rgba(168,85,247,0.3)]"
                >
                  {clashingPair ? (
                    <div className="flex items-center gap-5 sm:gap-10">
                      <motion.div
                        initial={{ x: 90, rotateY: 90, scale: 0.7 }}
                        animate={{ x: 0, rotateY: 0, scale: 1.08 }}
                        className="w-32 h-40 rounded-2xl bg-gradient-to-b from-[#1e1b38] to-[#0d0b18] border-2 border-emerald-400 p-2 flex flex-col items-center justify-between shadow-[0_0_30px_rgba(16,185,129,0.5)]"
                      >
                        <img
                          src={clashingPair.myCard.imageUrl}
                          onError={(e) => {
                            e.currentTarget.src = getAnimeSvgFallback(clashingPair.myCard.name, '#10b981');
                          }}
                          alt=""
                          className="w-20 h-20 rounded-xl object-cover"
                        />
                        <span className="text-xs font-black truncate w-full text-center">
                          {clashingPair.myCard.name}
                        </span>
                        <span className="bg-emerald-500 text-black px-3 py-0.5 rounded-full text-xs font-black font-mono">
                          {clashingPair.myCard[clashingPair.stat]} (+تآزر)
                        </span>
                      </motion.div>

                      <div className="flex flex-col items-center gap-1">
                        <div className="w-11 h-11 rounded-full bg-[#FF1744] text-white font-black text-xs flex items-center justify-center shadow-[0_0_25px_#FF1744]">
                          VS
                        </div>
                        <span className="text-[10px] font-black text-amber-300 font-mono">
                          -{clashingPair.damageDealt} LP
                        </span>
                      </div>

                      <motion.div
                        initial={{ x: -90, rotateY: 90, scale: 0.7 }}
                        animate={{ x: 0, rotateY: 0, scale: clashingPair.wonClash ? 0.86 : 1.05 }}
                        className={`w-32 h-40 rounded-2xl bg-gradient-to-b from-[#2a1420] to-[#0d0b18] border-2 p-2 flex flex-col items-center justify-between ${
                          clashingPair.wonClash ? 'border-red-500/40 opacity-55' : 'border-amber-400'
                        }`}
                      >
                        <img
                          src={clashingPair.oppCard.imageUrl}
                          onError={(e) => {
                            e.currentTarget.src = getAnimeSvgFallback(clashingPair.oppCard.name, '#ef4444');
                          }}
                          alt=""
                          className="w-20 h-20 rounded-xl object-cover"
                        />
                        <span className="text-xs font-black truncate w-full text-center">
                          {clashingPair.oppCard.name}
                        </span>
                        <span className="bg-amber-400 text-black px-3 py-0.5 rounded-full text-xs font-black font-mono">
                          {clashingPair.oppCard[clashingPair.stat]}
                        </span>
                      </motion.div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-center">
                      <Layers size={28} className="text-purple-300 animate-bounce" />
                      <span className="text-xs sm:text-sm font-black text-white">
                        اختر بطاقة من يدك بالأسفل لاستدعاء الهولوغرام الثلاثي الأبعاد والانقضاض على الخصم!
                      </span>
                      {fieldCards.length > 0 && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-purple-300">البطاقات المستدعاة بالميدان:</span>
                          {fieldCards.map((fc, i) => (
                            <span
                              key={`${fc.id}-${i}`}
                              className="bg-purple-500/20 border border-purple-400/40 px-2 py-0.5 rounded-lg text-[10px] font-bold text-white"
                            >
                              {fc.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* بطاقات اليد القابلة للاستدعاء */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {handCards.map((card) => (
                    <motion.button
                      key={card.id}
                      whileHover={{ y: -8, rotateX: 8, scale: 1.04 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handlePlayCard(card)}
                      className="bg-gradient-to-b from-[#1e1b36]/95 to-[#0b0a14]/95 border-2 border-purple-500/50 hover:border-amber-400 rounded-2xl p-2 flex flex-col items-center gap-1.5 cursor-pointer shadow-xl"
                    >
                      <div className="relative w-full h-20 rounded-xl overflow-hidden bg-black">
                        <img
                          src={card.imageUrl}
                          onError={(e) => {
                            e.currentTarget.src = getAnimeSvgFallback(card.name, '#a855f7');
                          }}
                          alt={card.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute top-1 right-1 bg-black/80 text-emerald-300 text-[9px] font-black px-1.5 py-0.5 rounded-md">
                          +{librarySynergy.atkBonusPct}%
                        </span>
                      </div>
                      <span className="text-xs font-black text-white truncate w-full text-center">
                        {card.name}
                      </span>
                      <div className="w-full grid grid-cols-3 gap-1 text-[10px] font-mono font-black bg-black/70 rounded-xl p-1">
                        <span className="text-red-400">⚔️{card.power}</span>
                        <span className="text-amber-400">⚡{card.speed}</span>
                        <span className="text-purple-300">🧠{card.iq}</span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* 4. استكشاف الدانجون وفتح البوابات واستخراج الظلال (DUNGEON GATE EXPLORER) */}
            {gameId === 'dungeon_gate_explorer' && (
              <div className="w-full h-full flex flex-col justify-between gap-3">
                {/* شريط جيش الظلال المستخرج ورتبة البوابة */}
                <div className="bg-black/80 border border-emerald-500/40 rounded-2xl p-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Compass size={16} className="text-emerald-400" />
                    <span className="text-xs font-black text-white">
                      خريطة بوابة الدانجون ({dungeonGateRank})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-black text-purple-300">جيش ظلالك (ARISE):</span>
                    {extractedShadows.map((sh) => (
                      <span
                        key={sh.id}
                        className="bg-purple-600/25 border border-purple-400/50 text-purple-200 text-[10px] font-black px-2 py-0.5 rounded-full"
                      >
                        🌑 {sh.nameAr} (+{sh.atkBonus} هجوم)
                      </span>
                    ))}
                  </div>
                </div>

                {activeDungeonRoom ? (
                  /* غرفة القتال الحية داخل الدانجون */
                  <div className="flex-1 rounded-3xl bg-black/75 border-2 border-emerald-500/50 p-4 flex flex-col justify-between relative overflow-hidden">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-black text-emerald-400 block">
                          {activeDungeonRoom.rankBadge}
                        </span>
                        <h3 className="text-sm sm:text-base font-black text-white">
                          {activeDungeonRoom.enemyNameAr}
                        </h3>
                      </div>
                      <button
                        onClick={() => setActiveDungeonRoom(null)}
                        className="bg-white/10 text-white text-xs font-bold px-3 py-1 rounded-xl cursor-pointer"
                      >
                        خريطة الغرف
                      </button>
                    </div>

                    <div className="w-full h-3.5 bg-black rounded-full overflow-hidden border border-emerald-400/40 my-2">
                      <div
                        style={{ width: `${roomEnemyHp}%` }}
                        className="h-full bg-gradient-to-r from-[#FF1744] via-amber-400 to-emerald-400 transition-all"
                      />
                    </div>

                    {canExtractShadow ? (
                      <div className="my-auto text-center space-y-3 py-4">
                        <div className="text-sm font-black text-purple-300">
                          🌑 سقط الحارس! هل تريد استخراج ظله ليقاتل معك في غرفة الزعيم؟
                        </div>
                        <button
                          onClick={handleAriseShadow}
                          className="bg-gradient-to-r from-purple-600 via-emerald-500 to-purple-600 text-black font-black px-6 py-3.5 rounded-2xl text-sm shadow-[0_0_35px_#a855f7] animate-pulse cursor-pointer"
                        >
                          انهض! (ARISE SHADOW) ⚡
                        </button>
                      </div>
                    ) : (
                      <div className="my-auto flex flex-col items-center gap-3 relative py-2">
                        {bossDangerZone && (
                          <div className="bg-red-600/30 border-2 border-red-500 text-white text-xs font-black px-4 py-1.5 rounded-full animate-bounce">
                            ⚠️ هجوم قاتل من الوحش! اضغط «مراوغة الظل» فوراً!
                          </div>
                        )}

                        <div className="relative w-36 h-36 rounded-3xl overflow-hidden border-4 border-emerald-400 shadow-[0_0_45px_rgba(16,185,129,0.5)]">
                          <img
                            src={activeDungeonRoom.enemyImg}
                            onError={(e) => {
                              e.currentTarget.src = getAnimeSvgFallback(activeDungeonRoom.enemyNameAr, '#10b981');
                            }}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3 w-full max-w-md pt-2">
                          <button
                            onClick={handleDungeonStrike}
                            className="bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-black py-3 rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg active:scale-95 cursor-pointer"
                          >
                            <Swords size={16} />
                            <span>هجوم الخنجر المزدوج 🗡️</span>
                          </button>
                          <button
                            onClick={() => {
                              sfx.playJump();
                              setPlayerDodging(true);
                              setBossDangerZone(false);
                              addSynergyScore(25);
                              addPopup('💨 مراوغة ظل ناجحة +25!', 50, 38, '#38bdf8');
                              setTimeout(() => setPlayerDodging(false), 900);
                            }}
                            className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black py-3 rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg active:scale-95 cursor-pointer"
                          >
                            <Zap size={16} />
                            <span>مراوغة الظل 💨</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* خريطة غرف الدانجون التفاعلية */
                  <div className="flex-1 rounded-3xl bg-black/70 border-2 border-emerald-500/40 p-4 flex flex-col justify-between">
                    <div className="text-xs font-bold text-neutral-300 text-center">
                      اختر الغرفة المفتوحة للتقدم نحو عرش زعيم البوابة الحمراء (S-Rank):
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 my-auto">
                      {dungeonRooms.map((rm) => (
                        <button
                          key={rm.id}
                          onClick={() => handleEnterDungeonRoom(rm)}
                          disabled={!rm.unlocked || rm.cleared}
                          className={`p-3 rounded-2xl border-2 text-right transition flex flex-col justify-between min-h-[125px] ${
                            rm.cleared
                              ? 'bg-emerald-950/30 border-emerald-500/40 opacity-65'
                              : rm.unlocked
                              ? 'bg-[#131c24] border-emerald-400 hover:scale-105 cursor-pointer shadow-[0_0_25px_rgba(16,185,129,0.25)]'
                              : 'bg-black/50 border-white/10 opacity-45'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-black/70 text-emerald-300">
                              {rm.rankBadge}
                            </span>
                            {rm.cleared ? (
                              <CheckCircle2 size={15} className="text-emerald-400" />
                            ) : !rm.unlocked ? (
                              <Lock size={14} className="text-neutral-500" />
                            ) : (
                              <Flame size={15} className="text-amber-400 animate-pulse" />
                            )}
                          </div>

                          <div className="space-y-1 mt-2">
                            <div className="text-xs font-black text-white leading-snug">{rm.titleAr}</div>
                            <div className="text-[10px] text-neutral-300 truncate">{rm.enemyNameAr}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 5. نصل الشينوبي */}
            {gameId === 'katana_slash' && (
              <div className="w-full h-full max-h-[420px] rounded-3xl overflow-hidden border-2 border-[#FF1744]/50 shadow-[0_0_50px_rgba(255,23,68,0.25)] bg-black/55 relative">
                <canvas
                  ref={katanaCanvasRef}
                  className="w-full h-full touch-none cursor-crosshair block"
                />
              </div>
            )}

            {/* 6. تصادم الموجات الخارقة */}
            {gameId === 'beam_clash' && (
              <div className="w-full h-[400px] rounded-3xl bg-black/65 backdrop-blur-md border-2 border-amber-500/50 relative overflow-hidden flex flex-col justify-between p-4 sm:p-6">
                <div className="relative flex-1 flex items-center justify-between gap-2">
                  <div className="relative z-20 flex flex-col items-center gap-1.5 shrink-0">
                    <div
                      style={{ borderColor: selectedHero.auraColor }}
                      className="w-20 h-20 rounded-full border-4 overflow-hidden bg-black"
                    >
                      <img src={selectedHero.avatar} alt="" className="w-full h-full object-cover" />
                    </div>
                    <span className="bg-amber-500 text-black text-[11px] font-black px-2.5 py-0.5 rounded-full font-mono">
                      {Math.round(beamPower)}%
                    </span>
                  </div>

                  <div className="flex-1 h-56 relative flex items-center">
                    <canvas ref={beamCanvasRef} className="w-full h-56 block" />
                  </div>

                  <div className="relative z-20 flex flex-col items-center gap-1.5 shrink-0">
                    <div className="w-20 h-20 rounded-full ring-4 ring-purple-500 overflow-hidden bg-black">
                      <img
                        src={storyChapter?.bossAvatar || ANIME_FIGHTER_DECK[2].imageUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="bg-purple-600 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full">
                      {storyChapter?.bossNameAr || ghostTarget?.name || 'خصم الفضاء'}
                    </span>
                  </div>

                  {criticalNode && (
                    <button
                      onClick={() => handleBeamSurge(true)}
                      style={{ left: `${criticalNode.x}%`, top: `${criticalNode.y}%` }}
                      className="absolute z-30 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-sky-500/40 border-2 border-sky-300 text-white font-black text-xs flex flex-col items-center justify-center shadow-[0_0_30px_#38bdf8] animate-bounce cursor-pointer"
                    >
                      <span>⚡2X</span>
                    </button>
                  )}
                </div>

                <button
                  onClick={() => handleBeamSurge(false)}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#FF1744] via-amber-400 to-[#FF1744] text-black font-black text-base shadow-lg active:scale-95 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Zap size={20} className="fill-black" />
                  <span>اضغط بسرعة لدفع الموجة الخارقة!</span>
                </button>
              </div>
            )}

            {/* 7. مدار الغريزة الفائقة */}
            {gameId === 'ultra_dodge' && (
              <div className="w-full rounded-3xl overflow-hidden border-2 border-sky-400/50 bg-black/60 relative">
                <canvas
                  ref={dodgeCanvasRef}
                  className="w-full h-[380px] touch-none cursor-pointer block"
                />
              </div>
            )}

            {/* 8. عدسة الشارينغان */}
            {gameId === 'sharingan_radar' && (() => {
              const curQ = radarQuestions[radarIdx % radarQuestions.length];
              return (
                <div className="w-full flex flex-col items-center gap-4 bg-black/65 backdrop-blur-md border-2 border-[#FF1744]/40 rounded-3xl p-5 shadow-2xl">
                  <div className="relative w-40 h-40 rounded-full p-2 bg-gradient-to-tr from-[#FF1744] via-red-900 to-black flex items-center justify-center">
                    <div className="w-32 h-32 rounded-full overflow-hidden bg-black relative border-2 border-[#FF1744]">
                      <img
                        src={curQ.imageUrl}
                        style={{ filter: `blur(${radarBlur}px)` }}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  <div className="text-center">
                    <span className="text-xs font-black text-amber-400">{curQ.animeName}</span>
                    <h3 className="text-sm sm:text-base font-black text-white mt-0.5">{curQ.prompt}</h3>
                  </div>
                  <div className="w-full grid grid-cols-2 gap-2.5 max-w-lg">
                    {curQ.options.map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleRadarPick(idx)}
                        className="bg-[#161626] hover:bg-[#FF1744] text-white border border-white/15 rounded-2xl py-3 px-4 text-xs sm:text-sm font-black transition cursor-pointer"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* 9. غارة زعيم الدانجون */}
            {gameId === 'boss_raid' && (
              <div className="w-full h-[380px] rounded-3xl bg-black/65 backdrop-blur-md border-2 border-emerald-500/50 p-5 flex flex-col justify-between relative overflow-hidden">
                <div className="space-y-1.5 relative z-20">
                  <div className="flex justify-between items-center text-xs sm:text-sm font-black">
                    <span className="text-emerald-300">زعيم الدانجون: ملك الظلال المدرّع</span>
                    <span className="bg-red-600/30 border border-red-500 px-2.5 py-0.5 rounded-full text-white font-mono">
                      {bossHp}% HP
                    </span>
                  </div>
                  <div className="w-full h-3.5 bg-black/90 rounded-full overflow-hidden border border-emerald-400/40">
                    <div
                      style={{ width: `${bossHp}%` }}
                      className="h-full bg-gradient-to-r from-[#FF1744] via-amber-400 to-emerald-400 transition-all"
                    />
                  </div>
                </div>
                <div className="relative flex-1 flex items-center justify-center">
                  <motion.div
                    animate={bossShake ? { x: [-8, 8, -6, 6, 0], scale: 0.94 } : { scale: [1, 1.05, 1] }}
                    className="relative w-40 h-40 rounded-3xl overflow-hidden ring-4 ring-emerald-400 bg-black"
                  >
                    <img src={shadowDungeonBg} alt="" className="w-full h-full object-cover" />
                  </motion.div>
                  <button
                    onClick={handleStrikeBoss}
                    style={{ left: `${weakSpotPos.x}%`, top: `${weakSpotPos.y}%` }}
                    className="absolute z-30 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-[#FF1744]/40 border-4 border-[#FF1744] text-white font-black text-xs flex flex-col items-center justify-center animate-pulse cursor-pointer"
                  >
                    <Target size={22} />
                    <span>اضرب!</span>
                  </button>
                </div>
              </div>
            )}

            {/* 10. برج السماء */}
            {gameId === 'sky_tower' && (
              <div className="w-full h-[380px] rounded-3xl bg-black/65 backdrop-blur-md border-2 border-yellow-500/50 p-5 flex flex-col justify-between text-center">
                <div className="flex items-center justify-between">
                  <span className="bg-yellow-500 text-black text-xs font-black px-3.5 py-1 rounded-full">
                    🗼 الطابق القتالي: #{towerFloor}
                  </span>
                  <span className="text-xs font-black px-3 py-1 rounded-full border border-sky-400 text-sky-300">
                    {towerShield ? '🛡️ درع النين مفعّل' : '⚠️ بدون درع'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3.5 my-auto">
                  {[
                    { idx: 0, title: 'بوابة التنين', mult: '1.5X', color: 'from-red-500/30 to-black border-red-500/60' },
                    { idx: 1, title: 'بوابة العرش الذهبي', mult: '2.0X', color: 'from-amber-400/35 to-black border-yellow-400' },
                    { idx: 2, title: 'بوابة الظلال', mult: '1.5X', color: 'from-purple-500/30 to-black border-purple-400/60' }
                  ].map((g) => (
                    <button
                      key={g.idx}
                      onClick={() => handleClimbGate(g.idx)}
                      className={`h-36 rounded-3xl bg-gradient-to-b ${g.color} border-2 flex flex-col items-center justify-center gap-2 p-3 cursor-pointer`}
                    >
                      <Sparkles size={24} className="text-yellow-300" />
                      <span className="text-xs font-black text-white">{g.title}</span>
                      <span className="text-[11px] font-mono font-black text-amber-300">{g.mult}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => triggerEndGame(scoreRef.current, scoreRef.current >= 120)}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 text-black font-black text-xs cursor-pointer"
                >
                  💰 تأمين غنيمة البرج والانسحاب بـ ({score} PT)
                </button>
              </div>
            )}

            {/* 11. سباق أسطح كونوها */}
            {gameId === 'shinobi_parkour' && (
              <div
                onClick={() => jumpTriggerRef.current()}
                className="w-full rounded-3xl overflow-hidden border-2 border-pink-500/50 bg-black/55 relative cursor-pointer"
              >
                <canvas ref={parkourCanvasRef} className="w-full h-[360px] block" />
              </div>
            )}
          </motion.div>

          {/* شريط الضربة القاضية السفلي الموحد */}
          <div className="relative z-20 px-4 py-2 bg-black/85 backdrop-blur-xl border-t border-white/10">
            <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-[10px] font-black">
                  <span className="text-amber-300">⚡ مقياس الضربة القاضية السينمائية ({selectedHero.name})</span>
                  <span className="font-mono tabular-nums">{ultimateCharge}%</span>
                </div>
                <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    style={{
                      width: `${ultimateCharge}%`,
                      backgroundColor: selectedHero.auraColor
                    }}
                    className="h-full transition-all duration-200"
                  />
                </div>
              </div>

              <button
                onClick={handleCastUltimateSkill}
                disabled={ultimateCharge < 100}
                className={`px-4 py-2.5 rounded-2xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                  ultimateCharge >= 100
                    ? 'bg-gradient-to-r from-[#FF1744] via-amber-400 to-[#FF1744] text-black shadow-[0_0_25px_#FF1744] animate-pulse'
                    : 'bg-white/5 text-neutral-500 border border-white/10'
                }`}
              >
                <Flame size={15} />
                <span>ضربة قاضية ULTIMATE</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* =====================================================================
          الطور الثالث: شاشة تتويج اللعبة وفتح جوائز القصة والمتجر
         ===================================================================== */}
      <AnimatePresence>
        {appPhase === 'GAME_OVER' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.88, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#11111d] border-2 border-white/15 rounded-3xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl"
            >
              <div className="relative mx-auto w-24 h-24">
                <img
                  src={selectedHero.avatar}
                  onError={(e) => {
                    e.currentTarget.src = getAnimeSvgFallback(selectedHero.name, selectedHero.auraColor);
                  }}
                  alt=""
                  className="w-24 h-24 rounded-3xl object-cover ring-4 ring-amber-400 shadow-[0_0_30px_#f59e0b]"
                />
                <span className="absolute -bottom-2 -right-2 bg-gradient-to-r from-amber-400 to-[#FF1744] text-black font-black text-xs px-2.5 py-0.5 rounded-full">
                  {score >= targetToBeat * 1.2 ? 'S-RANK' : score >= targetToBeat ? 'A-RANK' : 'B-RANK'}
                </span>
              </div>

              <div className="space-y-1.5 pt-1">
                <h3 className="text-xl font-black text-white">
                  {score >= targetToBeat ? 'انتصار أسطوري ساحق! 🏆' : 'انتهت الجولة القتالية!'}
                </h3>
                <p className="text-xs text-neutral-300">
                  النتيجة المسجلة:{' '}
                  <strong className="text-emerald-400 font-mono">{score} PT</strong> • أقصى كومبو:{' '}
                  <strong className="text-amber-400 font-mono">x{maxCombo}</strong>
                </p>

                {storyChapter && score >= targetToBeat && (
                  <div className="mt-2 bg-emerald-500/15 border border-emerald-400/40 rounded-2xl p-3 text-xs space-y-1">
                    <div className="font-black text-emerald-300">
                      🎉 اجتزت {storyChapter.titleAr} بنجاح!
                    </div>
                    {storyChapter.unlockHeroNameAr && (
                      <div className="text-amber-300 font-bold">
                        🔓 تم فتح البطل: {storyChapter.unlockHeroNameAr}
                      </div>
                    )}
                    {storyChapter.unlockStoreItemNameAr && (
                      <div className="text-purple-300 font-bold">
                        👑 تم فتح في المتجر والحساب: {storyChapter.unlockStoreItemNameAr}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  onClick={startStandaloneGame}
                  className="bg-[#FF1744] hover:bg-rose-600 text-white font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
                >
                  <RotateCcw size={15} />
                  <span>إعادة التحدي</span>
                </button>
                <button
                  onClick={() => setAppPhase('TITLE_LOBBY')}
                  className="bg-amber-500/20 border border-amber-400/40 text-amber-300 font-black py-3 rounded-2xl text-xs cursor-pointer"
                >
                  تغيير البطل
                </button>
              </div>

              <button
                onClick={onClose}
                className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-2.5 rounded-2xl text-xs cursor-pointer"
              >
                العودة لمركز الألعاب وطور القصة
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
