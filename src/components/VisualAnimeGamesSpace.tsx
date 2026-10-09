import React, { useState, useEffect, useRef } from 'react';
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
  Coins
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
  | 'katana_slash'
  | 'beam_clash'
  | 'card_clash'
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
}

export const VISUAL_ANIME_GAMES: VisualGameMeta[] = [
  {
    id: 'katana_slash',
    titleAr: 'نصل الشينوبي القاطع',
    subtitleAr: 'SHINOBI BLOOD MOON DOJO • 2D SLASH ACTION',
    studioTag: 'DOJO ARCADE v2.4',
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
    id: 'card_clash',
    titleAr: 'طاولة حرب البطاقات 3D',
    subtitleAr: 'HOLOGRAM SUMMONER TABLE • TACTICAL DUEL',
    studioTag: 'DUEL LINKS ARENA',
    tagAr: 'هولوغرام 🃏',
    accentColor: '#a855f7',
    gradient: 'from-purple-600/45 via-indigo-950/70 to-[#05050a]',
    worldArt: throneHallBg,
    fighterImg: ANIME_FIGHTER_DECK[2].imageUrl,
    targetScore: 250
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

interface VisualAnimeGamesSpaceProps {
  gameId: VisualGameId;
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
  }) => void;
}

export default function VisualAnimeGamesSpace({
  gameId,
  ghostTarget,
  onClose,
  onFinishMatch
}: VisualAnimeGamesSpaceProps) {
  const { user, userData } = useAuth();
  const gameMeta = VISUAL_ANIME_GAMES.find((g) => g.id === gameId) || VISUAL_ANIME_GAMES[0];
  const targetToBeat = ghostTarget?.targetScoreToBeat || gameMeta.targetScore;

  // قائمة المقاتلين والأفتارات القابلة للعب داخل التطبيق المستقل (بما في ذلك أفتار المستخدم نفسه!)
  const playableHeroes: PlayableHero[] = [
    ...(user
      ? [
          {
            id: 'user-avatar',
            name: user.displayName || 'بطل الأوتاكو',
            titleAr: 'أفتارك الشخصي الخارق',
            avatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`,
            auraColor: gameMeta.accentColor,
            secondaryColor: '#fde047',
            ultimateNameAr: 'انفجار هالة الأوتاكو القصوى!',
            power: 99,
            speed: 98
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
      speed: 97
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
      speed: 95
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
      speed: 99
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
      speed: 98
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
      speed: 98
    }
  ];

  // أطوار تطبيق اللعبة المستقل: شاشة البداية واختيار المقاتل -> اللعب الحي -> شاشة التتويج
  const [appPhase, setAppPhase] = useState<'TITLE_LOBBY' | 'PLAYING' | 'GAME_OVER'>('TITLE_LOBBY');
  const [selectedHero, setSelectedHero] = useState<PlayableHero>(playableHeroes[0]);
  const [soundMuted, setSoundMuted] = useState(false);

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [timeLeft, setTimeLeft] = useState(32);
  const [combo, setCombo] = useState(0);
  const [ultimateCharge, setUltimateCharge] = useState(35); // 0..100
  const [ultimateCutIn, setUltimateCutIn] = useState(false);
  const [heroPose, setHeroPose] = useState<'idle' | 'attack' | 'hit'>('idle');
  const [particleBurstTrigger, setParticleBurstTrigger] = useState(1);
  const [particleBurstMode, setParticleBurstMode] = useState<'idle' | 'challenge' | 'victory' | 'ultimate'>('challenge');
  const [floatingPopups, setFloatingPopups] = useState<
    { id: number; text: string; x: number; y: number; color: string }[]
  >([]);

  // نظام Framer Motion المتقدم للـ Parallax متعدد الطبقات
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const smoothX = useSpring(mouseX, { stiffness: 65, damping: 20 });
  const smoothY = useSpring(mouseY, { stiffness: 65, damping: 20 });
  const bgParallaxX = useTransform(smoothX, [-1, 1], [22, -22]);
  const bgParallaxY = useTransform(smoothY, [-1, 1], [16, -16]);
  const stageRotateY = useTransform(smoothX, [-1, 1], [-4, 4]);
  const stageRotateX = useTransform(smoothY, [-1, 1], [3, -3]);

  const handleGlobalParallaxMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    mouseX.set(nx);
    mouseY.set(ny);
  };

  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const comboRef = useRef(0);
  const ultRef = useRef(35);
  const finishedRef = useRef(false);
  const heroAvatarImgRef = useRef<HTMLImageElement | null>(null);

  // تحميل صورة أفتار المقاتل المختار لرسمها داخل الكانفاس 2D مباشرةً
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = selectedHero.avatar;
    heroAvatarImgRef.current = img;
  }, [selectedHero]);

  const toggleSound = () => {
    sfx.muted = !soundMuted;
    setSoundMuted(!soundMuted);
  };

  const addPopup = (text: string, x = 50, y = 42, color = '#fbbf24') => {
    const id = Date.now() + Math.random();
    setFloatingPopups((prev) => [...prev.slice(-6), { id, text, x, y, color }]);
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
      won
    });
  };

  const startStandaloneGame = () => {
    sfx.playUltimate();
    setParticleBurstMode('challenge');
    setParticleBurstTrigger((t) => t + 1);
    finishedRef.current = false;
    scoreRef.current = 0;
    livesRef.current = 3;
    comboRef.current = 0;
    ultRef.current = 35;
    setScore(0);
    setLives(3);
    setCombo(0);
    setUltimateCharge(35);
    setTimeLeft(32);
    setBeamPower(50);
    setBossHp(100);
    setTowerFloor(1);
    setTowerShield(true);
    setAppPhase('PLAYING');
  };

  // إطلاق الضربة القاضية السينمائية (2D Anime Ultimate Cut-In)
  const handleCastUltimateSkill = () => {
    if (appPhase !== 'PLAYING' || ultRef.current < 100) return;
    sfx.playUltimate();
    setParticleBurstMode('ultimate');
    setParticleBurstTrigger((t) => t + 1);
    ultRef.current = 0;
    setUltimateCharge(0);
    setUltimateCutIn(true);
    triggerHeroAttackPose();

    const bonusPts = 110 + comboRef.current * 10;
    scoreRef.current += bonusPts;
    setScore(scoreRef.current);
    comboRef.current += 3;
    setCombo(comboRef.current);

    if (gameId === 'beam_clash') {
      setBeamPower((p) => {
        const next = Math.min(100, p + 32);
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
    setTimeout(() => setUltimateCutIn(false), 1150);
  };

  // مؤقت اللعب الفعلي (يعمل فقط عندما تكون اللعبة في طور PLAYING)
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
  // 1. نصل الشينوبي القاطع — مع أفتار المقاتل الحي وموجات السيف المرسومة
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
    const height = (canvas.height = canvas.parentElement?.clientHeight || 440);

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

    interface SlashHalf {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      color: string;
      alpha: number;
      side: number;
    }

    interface SparkParticle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      alpha: number;
      color: string;
      size: number;
    }

    const orbs: OrbTarget[] = [];
    const halves: SlashHalf[] = [];
    const particles: SparkParticle[] = [];
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

          halves.push(
            {
              x: orb.x - 8,
              y: orb.y,
              vx: orb.vx - 3.5,
              vy: orb.vy - 1.8,
              radius: orb.radius,
              color: orb.color,
              alpha: 1,
              side: -1
            },
            {
              x: orb.x + 8,
              y: orb.y,
              vx: orb.vx + 3.5,
              vy: orb.vy - 1.8,
              radius: orb.radius,
              color: orb.color,
              alpha: 1,
              side: 1
            }
          );

          for (let i = 0; i < 18; i++) {
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
            comboRef.current = 0;
            setCombo(0);
            setHeroPose('hit');
            setTimeout(() => setHeroPose('idle'), 300);
            livesRef.current = Math.max(0, livesRef.current - 1);
            setLives(livesRef.current);
            addPopup('💥 ختم متفجر!', 50, 38, '#ef4444');
            if (livesRef.current <= 0) {
              triggerEndGame(scoreRef.current);
            }
          } else {
            sfx.playSlash();
            triggerHeroAttackPose();
            comboRef.current += 1;
            setCombo(comboRef.current);
            chargeUltimate(12);
            const gain = 24 + Math.min(40, comboRef.current * 5);
            scoreRef.current += gain;
            setScore(scoreRef.current);
          }
        }
      });
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      handleSliceAt(e.clientX - rect.left, e.clientY - rect.top);
    };
    const onPointerDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      handleSliceAt(e.clientX - rect.left, e.clientY - rect.top);
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);

    const render = () => {
      tick += 0.08;
      ctx.clearRect(0, 0, width, height);

      // رسم أفتار المقاتل 2D في أسفل منتصف ساحة الدوجو مع هالة الطاقة النابضة
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

      // موجة الهلال القتالية الصادرة من أفتار اللاعب عند القطع
      if (avatarSlashWave > 0.05) {
        ctx.strokeStyle = selectedHero.auraColor;
        ctx.lineWidth = 5 * avatarSlashWave;
        ctx.shadowColor = selectedHero.auraColor;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(heroX, heroY, 45 + (1 - avatarSlashWave) * 90, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        avatarSlashWave *= 0.88;
      }

      // دائرة صورة أفتار المقاتل داخل الكانفاس
      ctx.beginPath();
      ctx.arc(heroX, heroY, 28, 0, Math.PI * 2);
      ctx.closePath();
      ctx.save();
      ctx.clip();
      if (heroAvatarImgRef.current && heroAvatarImgRef.current.complete) {
        ctx.drawImage(heroAvatarImgRef.current, heroX - 28, heroY - 28, 56, 56);
      } else {
        ctx.fillStyle = selectedHero.auraColor;
        ctx.fillRect(heroX - 28, heroY - 28, 56, 56);
      }
      ctx.restore();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(heroX, heroY, 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // تحديث ورسم الأوربات والشوريكين
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

          if (o.isBomb) {
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 22;
            ctx.fillStyle = '#1f0707';
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            for (let s = 0; s < 8; s++) {
              const r = s % 2 === 0 ? o.radius + 7 : o.radius * 0.5;
              const a = (s * Math.PI) / 4;
              if (s === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
              else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          } else {
            const radGrad = ctx.createRadialGradient(0, 0, 3, 0, 0, o.radius);
            radGrad.addColorStop(0, '#ffffff');
            radGrad.addColorStop(0.5, o.innerColor);
            radGrad.addColorStop(1, o.color);

            ctx.shadowColor = o.color;
            ctx.shadowBlur = 24;
            ctx.fillStyle = radGrad;
            ctx.beginPath();
            ctx.arc(0, 0, o.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 0, o.radius + 5, o.radius * 0.42, o.angle, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        }

        if (o.y > height + 65 || o.sliced) {
          orbs.splice(i, 1);
        }
      }

      // أنصاف الأوربات المقطوعة
      for (let i = halves.length - 1; i >= 0; i--) {
        const h = halves[i];
        h.x += h.vx;
        h.y += h.vy;
        h.vy += 0.28;
        h.alpha -= 0.035;
        if (h.alpha <= 0) {
          halves.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = h.alpha;
        ctx.fillStyle = h.color;
        ctx.beginPath();
        ctx.arc(
          h.x,
          h.y,
          h.radius,
          h.side === -1 ? Math.PI * 0.5 : -Math.PI * 0.5,
          h.side === -1 ? Math.PI * 1.5 : Math.PI * 0.5
        );
        ctx.fill();
        ctx.restore();
      }

      // الشظايا
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

      // أثر نصل الكاتانا بلون هالة المقاتل المختار
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
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = selectedHero.auraColor;
        ctx.shadowBlur = 26;
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.5;
        ctx.stroke();
        ctx.restore();
      }
      while (bladeTrail.length > 0 && bladeTrail[0].life <= 0) {
        bladeTrail.shift();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      clearInterval(spawnInterval);
      cancelAnimationFrame(animId);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
    };
  }, [gameId, appPhase, selectedHero]);

  // ============================================================================
  // 2. تصادم الموجات الخارقة (2D Fighting Beam Clash Canvas)
  // ============================================================================
  const [beamPower, setBeamPower] = useState(50);
  const [criticalNode, setCriticalNode] = useState<{ x: number; y: number } | null>({ x: 50, y: 40 });
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
    const height = (canvas.height = 250);

    const renderBeam = () => {
      tick += 0.16;
      ctx.clearRect(0, 0, width, height);

      const cy = height / 2;
      const clashX = width - (beamPowerRef.current / 100) * width;

      // شعاع الخصم
      const enemyGrad = ctx.createLinearGradient(0, cy, clashX, cy);
      enemyGrad.addColorStop(0, '#4f46e5');
      enemyGrad.addColorStop(0.6, '#9333ea');
      enemyGrad.addColorStop(1, '#38bdf8');
      ctx.save();
      ctx.fillStyle = enemyGrad;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.roundRect(0, cy - 20, Math.max(12, clashX), 40, 20);
      ctx.fill();
      ctx.restore();

      // شعاع مقاتل اللاعب بلون هالته المختارة
      const heroGrad = ctx.createLinearGradient(width, cy, clashX, cy);
      heroGrad.addColorStop(0, selectedHero.auraColor);
      heroGrad.addColorStop(0.5, '#FF1744');
      heroGrad.addColorStop(1, '#ffffff');
      ctx.save();
      ctx.fillStyle = heroGrad;
      ctx.shadowColor = selectedHero.auraColor;
      ctx.shadowBlur = 35;
      ctx.beginPath();
      ctx.roundRect(clashX, cy - 22, Math.max(12, width - clashX), 44, 22);
      ctx.fill();
      ctx.restore();

      // صواعق البرق المتفجرة في نقطة الاصطدام
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.8;
      ctx.shadowColor = selectedHero.auraColor;
      ctx.shadowBlur = 22;
      for (let b = 0; b < 6; b++) {
        ctx.beginPath();
        ctx.moveTo(clashX, cy);
        const angle = tick + (b * Math.PI * 2) / 6;
        const r1 = 26 + Math.sin(tick * 3 + b) * 14;
        const r2 = 52 + Math.cos(tick * 2 + b) * 18;
        ctx.lineTo(clashX + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
        ctx.lineTo(clashX + Math.cos(angle + 0.35) * r2, cy + Math.sin(angle + 0.35) * r2);
        ctx.stroke();
      }

      const pulseRadius = 30 + Math.sin(tick * 4) * 7;
      const coreGrad = ctx.createRadialGradient(clashX, cy, 3, clashX, cy, pulseRadius);
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.5, selectedHero.secondaryColor);
      coreGrad.addColorStop(1, 'rgba(255, 23, 68, 0)');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(clashX, cy, pulseRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

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
    const pts = isCrit ? 50 : 22;
    scoreRef.current += pts;
    setScore(scoreRef.current);
    comboRef.current += 1;
    setCombo(comboRef.current);

    if (isCrit) {
      addPopup('⚡ موجة خارقة مزدوجة +50!', 50, 32, '#38bdf8');
      setCriticalNode(null);
    }

    setBeamPower((prev) => {
      const next = Math.min(100, prev + boost);
      if (next >= 100) {
        scoreRef.current += 130;
        setScore(scoreRef.current);
        triggerEndGame(scoreRef.current, true);
      }
      return next;
    });
  };

  // ============================================================================
  // 3. طاولة حرب البطاقات الهولوغرام (3D Hologram Card Clash)
  // ============================================================================
  const [handCards, setHandCards] = useState(() =>
    [...ANIME_FIGHTER_DECK].sort(() => Math.random() - 0.5).slice(0, 4)
  );
  const [clashingPair, setClashingPair] = useState<{
    myCard: (typeof ANIME_FIGHTER_DECK)[0];
    oppCard: (typeof ANIME_FIGHTER_DECK)[0];
    stat: 'power' | 'speed' | 'iq';
    wonClash: boolean;
  } | null>(null);
  const [chosenAttr, setChosenAttr] = useState<'power' | 'speed' | 'iq'>('power');

  const handlePlayCard = (card: (typeof ANIME_FIGHTER_DECK)[0]) => {
    if (appPhase !== 'PLAYING' || clashingPair) return;
    const opp = ANIME_FIGHTER_DECK[Math.floor(Math.random() * ANIME_FIGHTER_DECK.length)];
    const myVal = card[chosenAttr];
    const oppVal = opp[chosenAttr];
    const wonClash = myVal >= oppVal;

    setClashingPair({ myCard: card, oppCard: opp, stat: chosenAttr, wonClash });
    triggerHeroAttackPose();
    chargeUltimate(24);

    if (wonClash) {
      sfx.playSlash();
      comboRef.current += 1;
      setCombo(comboRef.current);
      const gained = 70 + comboRef.current * 15;
      scoreRef.current += gained;
      setScore(scoreRef.current);
      addPopup(`🔥 تدمير هولوغرام الخصم +${gained}`, 50, 38, '#10b981');
    } else {
      sfx.playHit();
      comboRef.current = 0;
      setCombo(0);
      scoreRef.current += 18;
      setScore(scoreRef.current);
      addPopup('⚡ تصادم متكافئ +18', 50, 38, '#f59e0b');
    }

    setTimeout(() => {
      setClashingPair(null);
      setHandCards([...ANIME_FIGHTER_DECK].sort(() => Math.random() - 0.5).slice(0, 4));
    }, 950);
  };

  // ============================================================================
  // 4. مدار الغريزة الفائقة — أفتار اللاعب يتحرك فعلياً داخل الكانفاس 2D بطيف وهالة
  // ============================================================================
  const dodgeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (gameId !== 'ultra_dodge' || appPhase !== 'PLAYING') return;
    const canvas = dodgeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let tick = 0;
    const width = (canvas.width = canvas.parentElement?.clientWidth || 400);
    const height = (canvas.height = 410);

    const player = { x: width / 2, y: height - 70, r: 24 };
    const trail: { x: number; y: number; alpha: number }[] = [];
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

    const movePlayer = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      player.x = Math.max(28, Math.min(width - 28, clientX - rect.left));
      player.y = Math.max(40, Math.min(height - 32, clientY - rect.top));
      trail.push({ x: player.x, y: player.y, alpha: 0.65 });
      if (trail.length > 10) trail.shift();
    };

    const onMove = (e: PointerEvent) => movePlayer(e.clientX, e.clientY);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onMove);

    const render = () => {
      tick += 0.12;
      ctx.clearRect(0, 0, width, height);

      // رسم طيف السراب الخلفي للأفتار
      for (let i = trail.length - 1; i >= 0; i--) {
        const tr = trail[i];
        tr.alpha -= 0.045;
        if (tr.alpha <= 0) {
          trail.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = tr.alpha;
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, player.r * 0.85, 0, Math.PI * 2);
        ctx.fillStyle = selectedHero.auraColor;
        ctx.fill();
        ctx.restore();
      }

      // رسم هالة الغريزة الفائقة + صورة الأفتار الحقيقية داخل الكانفاس
      ctx.save();
      const auraR = player.r + 14 + Math.sin(tick * 3) * 5;
      const auraGrad = ctx.createRadialGradient(player.x, player.y, 4, player.x, player.y, auraR);
      auraGrad.addColorStop(0, '#ffffff');
      auraGrad.addColorStop(0.5, selectedHero.auraColor);
      auraGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(player.x, player.y, auraR, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.save();
      ctx.clip();
      if (heroAvatarImgRef.current && heroAvatarImgRef.current.complete) {
        ctx.drawImage(
          heroAvatarImgRef.current,
          player.x - player.r,
          player.y - player.r,
          player.r * 2,
          player.r * 2
        );
      } else {
        ctx.fillStyle = selectedHero.auraColor;
        ctx.fill();
      }
      ctx.restore();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      for (let i = hazards.length - 1; i >= 0; i--) {
        const h = hazards[i];
        h.x += h.vx;
        h.y += h.vy;

        ctx.save();
        if (h.isStar) {
          ctx.fillStyle = '#facc15';
          ctx.shadowColor = '#facc15';
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const metGrad = ctx.createRadialGradient(h.x, h.y, 2, h.x, h.y, h.r + 4);
          metGrad.addColorStop(0, '#ffffff');
          metGrad.addColorStop(0.4, '#FF1744');
          metGrad.addColorStop(1, '#7f1d1d');
          ctx.fillStyle = metGrad;
          ctx.shadowColor = '#FF1744';
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        const dist = Math.hypot(h.x - player.x, h.y - player.y);
        if (dist < h.r + player.r - 3) {
          hazards.splice(i, 1);
          if (h.isStar) {
            sfx.playSlash();
            chargeUltimate(16);
            scoreRef.current += 40;
            setScore(scoreRef.current);
            comboRef.current += 1;
            setCombo(comboRef.current);
            addPopup('✨ بلورة طاقة +40', 50, 35, '#facc15');
          } else {
            sfx.playHit();
            comboRef.current = 0;
            setCombo(0);
            livesRef.current = Math.max(0, livesRef.current - 1);
            setLives(livesRef.current);
            addPopup('💥 اصطدام نيزكي!', 50, 40, '#ef4444');
            if (livesRef.current <= 0) {
              triggerEndGame(scoreRef.current);
            }
          }
          continue;
        }

        if (h.y > height + 30) {
          if (!h.isStar) {
            scoreRef.current += 10;
            setScore(scoreRef.current);
          }
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

  // ============================================================================
  // 5. عدسة الشارينغان الدوّارة (Sharingan Visual Radar)
  // ============================================================================
  const [radarQuestions] = useState(() => getNonRepeatingQuestions(8));
  const [radarIdx, setRadarIdx] = useState(0);
  const [radarBlur, setRadarBlur] = useState(16);

  useEffect(() => {
    if (gameId !== 'sharingan_radar' || appPhase !== 'PLAYING') return;
    setRadarBlur(16);
    const t = setInterval(() => {
      setRadarBlur((b) => Math.max(0, b - 2));
    }, 650);
    return () => clearInterval(t);
  }, [gameId, radarIdx, appPhase]);

  const handleRadarPick = (optIdx: number) => {
    if (appPhase !== 'PLAYING') return;
    const cur = radarQuestions[radarIdx % radarQuestions.length];
    if (optIdx === cur.correctIndex) {
      sfx.playSlash();
      triggerHeroAttackPose();
      chargeUltimate(25);
      const speedBonus = radarBlur * 4;
      const pts = 60 + speedBonus;
      scoreRef.current += pts;
      setScore(scoreRef.current);
      comboRef.current += 1;
      setCombo(comboRef.current);
      addPopup(`👁️ كشف الشارينغان +${pts}`, 50, 35, '#ef4444');
    } else {
      sfx.playHit();
      comboRef.current = 0;
      setCombo(0);
      livesRef.current = Math.max(0, livesRef.current - 1);
      setLives(livesRef.current);
      if (livesRef.current <= 0) {
        triggerEndGame(scoreRef.current);
        return;
      }
    }
    setRadarIdx((prev) => prev + 1);
  };

  // ============================================================================
  // 6. غارة زعيم الدانجون العالمي (Dungeon Boss Raid RPG)
  // ============================================================================
  const [bossHp, setBossHp] = useState(100);
  const [weakSpotPos, setWeakSpotPos] = useState({ x: 50, y: 45 });
  const [bossShake, setBossShake] = useState(false);

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
    const dmg = 9;
    const pts = 36;
    scoreRef.current += pts;
    setScore(scoreRef.current);
    comboRef.current += 1;
    setCombo(comboRef.current);
    setBossShake(true);
    setTimeout(() => setBossShake(false), 220);

    addPopup('🗡️ ضربة حرجة +36', weakSpotPos.x, weakSpotPos.y, '#10b981');

    setBossHp((prev) => {
      const next = Math.max(0, prev - dmg);
      if (next <= 0) {
        scoreRef.current += 150;
        setScore(scoreRef.current);
        triggerEndGame(scoreRef.current, true);
      }
      return next;
    });
  };

  // ============================================================================
  // 7. برج السماء والمخاطرة (Hunter Exam Sky Tower)
  // ============================================================================
  const [towerFloor, setTowerFloor] = useState(1);
  const [towerShield, setTowerShield] = useState(true);

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
        addPopup('💥 كمين حارس الطابق!', 50, 40, '#ef4444');
        if (livesRef.current <= 0) {
          triggerEndGame(scoreRef.current);
          return;
        }
      }
    } else {
      sfx.playJump();
      triggerHeroAttackPose();
      chargeUltimate(20);
      const mult = gateIdx === 1 ? 2 : 1.5;
      const gain = Math.round(48 * mult + towerFloor * 9);
      scoreRef.current += gain;
      setScore(scoreRef.current);
      comboRef.current += 1;
      setCombo(comboRef.current);
      setTowerFloor((f) => f + 1);
      addPopup(`🗼 صعود الطابق ${towerFloor + 1} (+${gain})`, 50, 35, '#facc15');
    }
  };

  // ============================================================================
  // 8. سباق أسطح كونوها — أفتار اللاعب يقفز فعلياً داخل الكانفاس 2D بوشاح متطاير
  // ============================================================================
  const parkourCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const jumpTriggerRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (gameId !== 'shinobi_parkour' || appPhase !== 'PLAYING') return;
    const canvas = parkourCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let rotTick = 0;
    const width = (canvas.width = canvas.parentElement?.clientWidth || 400);
    const height = (canvas.height = 380);
    const groundY = height - 58;

    const ninja = { x: 82, y: groundY - 26, vy: 0, jumps: 0 };
    const buildings = [
      { x: 20, w: 95, h: 130 },
      { x: 160, w: 115, h: 175 },
      { x: 310, w: 100, h: 140 }
    ];
    const obstacles: { x: number; y: number; isScroll: boolean; r: number }[] = [];

    jumpTriggerRef.current = () => {
      if (ninja.jumps < 2) {
        sfx.playJump();
        ninja.vy = -10.8;
        ninja.jumps += 1;
        triggerHeroAttackPose();
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
      rotTick += 0.22;
      ctx.clearRect(0, 0, width, height);

      buildings.forEach((b) => {
        b.x -= 1.6;
        if (b.x + b.w < 0) b.x = width + 30;
        ctx.fillStyle = 'rgba(15, 10, 30, 0.78)';
        ctx.fillRect(b.x, groundY - b.h, b.w, b.h);
        ctx.strokeStyle = 'rgba(236, 72, 153, 0.28)';
        ctx.strokeRect(b.x, groundY - b.h, b.w, b.h);
      });

      ctx.fillStyle = 'rgba(18, 12, 34, 0.94)';
      ctx.fillRect(0, groundY, width, height - groundY);
      ctx.strokeStyle = selectedHero.auraColor;
      ctx.lineWidth = 4;
      ctx.shadowColor = selectedHero.auraColor;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(width, groundY);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ninja.y += ninja.vy;
      ninja.vy += 0.52;
      if (ninja.y >= groundY - 24) {
        ninja.y = groundY - 24;
        ninja.vy = 0;
        ninja.jumps = 0;
      }

      // رسم وشاح الطاقة المتطاير خلف الأفتار
      ctx.save();
      ctx.strokeStyle = selectedHero.auraColor;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ninja.x - 10, ninja.y - 4);
      ctx.quadraticCurveTo(
        ninja.x - 35,
        ninja.y - 16 + Math.sin(rotTick) * 8,
        ninja.x - 54,
        ninja.y - 2
      );
      ctx.stroke();

      // رسم صورة أفتار المقاتل الحقيقية داخل الكانفاس
      ctx.beginPath();
      ctx.arc(ninja.x, ninja.y, 22, 0, Math.PI * 2);
      ctx.closePath();
      ctx.save();
      ctx.clip();
      if (heroAvatarImgRef.current && heroAvatarImgRef.current.complete) {
        ctx.drawImage(heroAvatarImgRef.current, ninja.x - 22, ninja.y - 22, 44, 44);
      } else {
        ctx.fillStyle = selectedHero.auraColor;
        ctx.fill();
      }
      ctx.restore();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(ninja.x, ninja.y, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      for (let i = obstacles.length - 1; i >= 0; i--) {
        const ob = obstacles[i];
        ob.x -= 6.2;

        ctx.save();
        ctx.translate(ob.x, ob.y);
        if (ob.isScroll) {
          ctx.fillStyle = '#facc15';
          ctx.shadowColor = '#facc15';
          ctx.shadowBlur = 16;
          ctx.fillRect(-13, -8, 26, 16);
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(-16, -10, 4, 20);
          ctx.fillRect(12, -10, 4, 20);
        } else {
          ctx.rotate(rotTick * 1.9);
          ctx.fillStyle = '#ef4444';
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 18;
          ctx.beginPath();
          for (let s = 0; s < 8; s++) {
            const r = s % 2 === 0 ? ob.r + 5 : ob.r * 0.4;
            const a = (s * Math.PI) / 4;
            if (s === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        const dist = Math.hypot(ob.x - ninja.x, ob.y - ninja.y);
        if (dist < ob.r + 18) {
          obstacles.splice(i, 1);
          if (ob.isScroll) {
            sfx.playSlash();
            chargeUltimate(18);
            scoreRef.current += 44;
            setScore(scoreRef.current);
            comboRef.current += 1;
            setCombo(comboRef.current);
            addPopup('📜 لفافة نينجتسو +44', 50, 35, '#facc15');
          } else {
            sfx.playHit();
            comboRef.current = 0;
            setCombo(0);
            livesRef.current = Math.max(0, livesRef.current - 1);
            setLives(livesRef.current);
            addPopup('💥 إصابة شوريكين!', 50, 40, '#ef4444');
            if (livesRef.current <= 0) {
              triggerEndGame(scoreRef.current);
            }
          }
          continue;
        }

        if (ob.x < -30) {
          if (!ob.isScroll) {
            scoreRef.current += 12;
            setScore(scoreRef.current);
          }
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

  return (
    <div
      onPointerMove={handleGlobalParallaxMove}
      className="fixed inset-0 z-[9999] bg-[#040408] text-white flex flex-col justify-between overflow-hidden select-none font-sans"
      dir="rtl"
    >
      {/* الطبقة الأولى: خلفية عالم الأنمي المرسومة مع تحريك Framer Motion Parallax */}
      <motion.img
        src={gameMeta.worldArt}
        alt=""
        style={{ x: bgParallaxX, y: bgParallaxY, scale: 1.12 }}
        className="absolute inset-0 w-full h-full object-cover opacity-45 pointer-events-none"
      />
      <div
        className={`absolute inset-0 bg-gradient-to-b ${gameMeta.gradient} pointer-events-none z-[1]`}
      />

      {/* الطبقة الثانية: فضاء Three.js WebGL ثلاثي الأبعاد مع الجسيمات والبلورات التفاعلية */}
      <ThreeAnimeParallaxScene
        accentColor={selectedHero.auraColor || gameMeta.accentColor}
        secondaryColor={selectedHero.secondaryColor || '#facc15'}
        burstTrigger={particleBurstTrigger}
        burstMode={particleBurstMode}
        intensity="high"
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_15%,#040408_95%)] pointer-events-none z-[3]" />

      {/* =====================================================================
          شريط الضربة القاضية السينمائي العابر للشاشة (2D ANIME ULTIMATE CUT-IN)
         ===================================================================== */}
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
                  ⚡ ULTIMATE SKILL UNLEASHED ⚡
                </span>
                <h2 className="text-xl sm:text-3xl font-black text-white drop-shadow-[0_0_20px_#FF1744]">
                  {selectedHero.ultimateNameAr}
                </h2>
              </div>
            </div>
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
          الطور الأول: شاشة بداية تطبيق اللعبة المستقل واختيار الأفتار المقاتل
         ===================================================================== */}
      {appPhase === 'TITLE_LOBBY' && (
        <div className="relative z-30 flex-1 flex flex-col justify-between p-4 sm:p-7 max-w-4xl w-full mx-auto overflow-y-auto">
          {/* شريط البوابة للعودة للتطبيق الأساسي + رصيد حسابك المربوط */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={onClose}
              className="bg-black/75 hover:bg-[#FF1744] text-white border border-white/20 px-4 py-2.5 rounded-2xl text-xs font-black flex items-center gap-2 transition cursor-pointer shadow-xl"
            >
              <ChevronLeft size={16} className="rotate-180" />
              <span>بوابة التطبيق الأساسي</span>
            </button>

            <div className="flex items-center gap-2">
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

          {/* شعار اللعبة المستقلة + استعراض الأفتار المختار بهالته */}
          <div className="my-auto py-4 flex flex-col items-center text-center space-y-5">
            <div className="space-y-1.5">
              <span
                style={{ backgroundColor: gameMeta.accentColor }}
                className="text-black text-[10px] font-black px-3.5 py-1 rounded-full tracking-wider inline-block shadow-lg"
              >
                {gameMeta.studioTag}
              </span>
              <h1 className="text-2xl sm:text-4xl font-black text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)]">
                {gameMeta.titleAr}
              </h1>
              <p className="text-[11px] sm:text-xs font-mono text-neutral-300 tracking-wide">
                {gameMeta.subtitleAr}
              </p>
            </div>

            {/* منصة استعراض الأفتار المختار بهالة القتال */}
            <motion.div
              key={selectedHero.id}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative flex flex-col items-center"
            >
              <div
                style={{
                  boxShadow: `0 0 65px ${selectedHero.auraColor}`,
                  borderColor: selectedHero.auraColor
                }}
                className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl overflow-hidden border-4 bg-black relative"
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
              <div className="mt-2.5 bg-black/85 border border-white/15 px-4 py-1.5 rounded-2xl">
                <div className="text-sm font-black text-white">{selectedHero.name}</div>
                <div className="text-[10px] text-amber-400 font-bold">{selectedHero.titleAr}</div>
              </div>
            </motion.div>

            {/* شريط اختيار المقاتل / الأفتار قبل دخول المعركة */}
            <div className="w-full max-w-2xl space-y-2">
              <div className="text-xs font-black text-neutral-200">
                اختر مقاتلك (الأفتار الذي سيمثلك داخل اللعبة):
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
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
                      className={`p-2 rounded-2xl border-2 transition flex flex-col items-center gap-1.5 cursor-pointer ${
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
                        className="w-12 h-12 rounded-xl object-cover bg-black"
                      />
                      <span className="text-[10px] font-black text-white truncate w-full text-center">
                        {h.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* زر بدء اللعبة المستقلة */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={startStandaloneGame}
              className="w-full max-w-md py-4 rounded-3xl bg-gradient-to-r from-[#FF1744] via-amber-500 to-[#FF1744] text-black font-black text-base sm:text-lg shadow-[0_0_45px_rgba(255,23,68,0.65)] flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <Play size={20} className="fill-black" />
              <span>انطلاق لعالم اللعبة (START GAME)</span>
            </motion.button>
          </div>
        </div>
      )}

      {/* =====================================================================
          الطور الثاني: ساحة اللعب الحركي المباشر (ACTIVE 2D ARCADE STAGE)
         ===================================================================== */}
      {appPhase === 'PLAYING' && (
        <>
          {/* شريط القتال العلوي (Arcade 2D Fighter HUD) */}
          <div className="relative z-20 px-3.5 py-2.5 bg-black/75 backdrop-blur-xl border-b border-white/10 flex items-center justify-between gap-2">
            {/* المقاتل المختار وحالته الحية */}
            <div className="flex items-center gap-2.5">
              <button
                onClick={onClose}
                title="العودة للتطبيق الأساسي"
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-[#FF1744] border border-white/15 flex items-center justify-center text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>

              <motion.div
                animate={
                  heroPose === 'attack'
                    ? { scale: 1.2, rotate: -6 }
                    : heroPose === 'hit'
                    ? { x: [-5, 5, -5, 0] }
                    : { scale: 1 }
                }
                style={{ borderColor: selectedHero.auraColor }}
                className="w-11 h-11 rounded-2xl overflow-hidden border-2 bg-black shadow-lg shrink-0"
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
                      size={13}
                      className={
                        h <= lives
                          ? 'text-[#FF1744] fill-[#FF1744] drop-shadow-[0_0_6px_#FF1744]'
                          : 'text-neutral-700'
                      }
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* الكومبو + النقاط + المؤقت + الصوت */}
            <div className="flex items-center gap-1.5 sm:gap-2.5">
              {combo >= 2 && (
                <motion.span
                  key={combo}
                  initial={{ scale: 1.35 }}
                  animate={{ scale: 1 }}
                  className="bg-gradient-to-r from-amber-500 to-[#FF1744] text-black text-xs font-black px-2.5 py-1 rounded-xl font-mono"
                >
                  🔥x{combo}
                </motion.span>
              )}

              <div className="bg-emerald-500/20 border border-emerald-400/40 px-3 py-1 rounded-xl text-xs sm:text-sm font-black font-mono tabular-nums text-emerald-300">
                {score} PT
              </div>

              <div className="bg-[#FF1744]/25 border border-[#FF1744] px-2.5 py-1 rounded-xl text-xs sm:text-sm font-black font-mono tabular-nums text-white">
                {timeLeft}s
              </div>

              <button
                onClick={toggleSound}
                className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white cursor-pointer"
              >
                {soundMuted ? <VolumeX size={15} /> : <Volume2 size={15} className="text-emerald-400" />}
              </button>
            </div>
          </div>

          {/* مسرح اللعب التفاعلي الخاص بكل لعبة مع إمالة Parallax 3D خفيفة */}
          <motion.div
            style={{ rotateX: stageRotateX, rotateY: stageRotateY, transformPerspective: 1100 }}
            className="relative z-10 flex-1 flex flex-col items-center justify-center p-2.5 sm:p-4 max-w-4xl w-full mx-auto overflow-hidden"
          >
            {gameId === 'katana_slash' && (
              <div className="w-full h-full max-h-[440px] rounded-3xl overflow-hidden border-2 border-[#FF1744]/50 shadow-[0_0_50px_rgba(255,23,68,0.25)] bg-black/55 relative">
                <canvas
                  ref={katanaCanvasRef}
                  className="w-full h-full touch-none cursor-crosshair block"
                />
              </div>
            )}

            {gameId === 'beam_clash' && (
              <div className="w-full h-[420px] rounded-3xl bg-black/65 backdrop-blur-md border-2 border-amber-500/50 relative overflow-hidden flex flex-col justify-between p-4 sm:p-6">
                <div className="relative flex-1 flex items-center justify-between gap-2">
                  {/* مقاتلك المختار على اليمين */}
                  <motion.div
                    animate={{ scale: [1, 1.08, 1] }}
                    transition={{ repeat: Infinity, duration: 1.1 }}
                    className="relative z-20 flex flex-col items-center gap-1.5 shrink-0"
                  >
                    <div
                      style={{
                        boxShadow: `0 0 35px ${selectedHero.auraColor}`,
                        borderColor: selectedHero.auraColor
                      }}
                      className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 overflow-hidden bg-black"
                    >
                      <img
                        src={selectedHero.avatar}
                        onError={(e) => {
                          e.currentTarget.src = getAnimeSvgFallback(selectedHero.name, selectedHero.auraColor);
                        }}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="bg-amber-500 text-black text-[11px] font-black px-2.5 py-0.5 rounded-full font-mono">
                      {Math.round(beamPower)}%
                    </span>
                  </motion.div>

                  <div className="flex-1 h-60 relative flex items-center">
                    <canvas ref={beamCanvasRef} className="w-full h-60 block" />
                  </div>

                  {/* الخصم على اليسار */}
                  <motion.div
                    animate={{ scale: [1, 1.06, 1] }}
                    transition={{ repeat: Infinity, duration: 1.3 }}
                    className="relative z-20 flex flex-col items-center gap-1.5 shrink-0"
                  >
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full ring-4 ring-purple-500 shadow-[0_0_35px_#a855f7] overflow-hidden bg-black">
                      <img
                        src={ANIME_FIGHTER_DECK[2].imageUrl}
                        onError={(e) => {
                          e.currentTarget.src = getAnimeSvgFallback('BOSS', '#a855f7');
                        }}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="bg-purple-600 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full">
                      {ghostTarget ? ghostTarget.name : 'خصم الفضاء'}
                    </span>
                  </motion.div>

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
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#FF1744] via-amber-400 to-[#FF1744] text-black font-black text-base sm:text-lg shadow-[0_0_35px_rgba(245,158,11,0.5)] active:scale-95 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Zap size={22} className="fill-black" />
                  <span>اضغط بسرعة لدفع الموجة الخارقة!</span>
                </button>
              </div>
            )}

            {gameId === 'card_clash' && (
              <div className="w-full flex flex-col justify-between gap-3.5">
                <div className="flex items-center justify-center gap-2">
                  {[
                    { id: 'power', label: '⚔️ القوة الهجومية', color: 'bg-[#FF1744] text-white' },
                    { id: 'speed', label: '⚡ السرعة الخاطفة', color: 'bg-amber-400 text-black' },
                    { id: 'iq', label: '🧠 الذكاء القتالي', color: 'bg-purple-600 text-white' }
                  ].map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setChosenAttr(st.id as any)}
                      className={`px-4 py-2 rounded-2xl text-xs font-black transition cursor-pointer ${
                        chosenAttr === st.id
                          ? `${st.color} scale-105 shadow-lg`
                          : 'bg-black/65 text-neutral-300 border border-white/15'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                <div className="h-48 rounded-3xl bg-black/65 backdrop-blur-md border-2 border-purple-500/40 flex items-center justify-center gap-6 p-4 relative overflow-hidden">
                  {clashingPair ? (
                    <div className="flex items-center gap-6 sm:gap-10">
                      <motion.div
                        initial={{ x: 90, rotateY: 90, scale: 0.7 }}
                        animate={{ x: 0, rotateY: 0, scale: 1.05 }}
                        className="w-32 h-40 rounded-2xl bg-gradient-to-b from-[#1e1b38] to-[#0d0b18] border-2 border-emerald-400 p-2 flex flex-col items-center justify-between"
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
                          {clashingPair.myCard[clashingPair.stat]}
                        </span>
                      </motion.div>

                      <div className="w-11 h-11 rounded-full bg-[#FF1744] text-white font-black text-xs flex items-center justify-center shadow-[0_0_25px_#FF1744]">
                        VS
                      </div>

                      <motion.div
                        initial={{ x: -90, rotateY: 90, scale: 0.7 }}
                        animate={{ x: 0, rotateY: 0, scale: clashingPair.wonClash ? 0.88 : 1.05 }}
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
                        اضغط على إحدى بطاقاتك بالأسفل لاستدعاء الهولوغرام!
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {handCards.map((card) => (
                    <motion.button
                      key={card.id}
                      whileHover={{ y: -8, scale: 1.03 }}
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

            {gameId === 'ultra_dodge' && (
              <div className="w-full rounded-3xl overflow-hidden border-2 border-sky-400/50 shadow-[0_0_50px_rgba(56,189,248,0.25)] bg-black/60 relative">
                <canvas
                  ref={dodgeCanvasRef}
                  className="w-full h-[390px] touch-none cursor-pointer block"
                />
              </div>
            )}

            {gameId === 'sharingan_radar' && (() => {
              const curQ = radarQuestions[radarIdx % radarQuestions.length];
              return (
                <div className="w-full flex flex-col items-center gap-4 bg-black/65 backdrop-blur-md border-2 border-[#FF1744]/40 rounded-3xl p-5 shadow-2xl">
                  <div className="relative w-44 h-44 rounded-full p-2.5 bg-gradient-to-tr from-[#FF1744] via-red-900 to-black shadow-[0_0_50px_rgba(255,23,68,0.5)] flex items-center justify-center">
                    <div className="absolute inset-1.5 rounded-full border-2 border-dashed border-red-400/80 animate-spin" />
                    <div className="w-36 h-36 rounded-full overflow-hidden bg-black relative border-2 border-[#FF1744]">
                      <img
                        src={curQ.imageUrl}
                        onError={(e) => {
                          e.currentTarget.src = getAnimeSvgFallback(curQ.animeName, '#FF1744');
                        }}
                        alt=""
                        referrerPolicy="no-referrer"
                        style={{
                          filter: `blur(${radarBlur}px)`,
                          transition: 'filter 0.35s ease'
                        }}
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
                        className="bg-[#161626] hover:bg-[#FF1744] text-white border border-white/15 rounded-2xl py-3 px-4 text-xs sm:text-sm font-black transition active:scale-95 cursor-pointer"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {gameId === 'boss_raid' && (
              <div className="w-full h-[390px] rounded-3xl bg-black/65 backdrop-blur-md border-2 border-emerald-500/50 p-5 flex flex-col justify-between relative overflow-hidden">
                <div className="space-y-1.5 relative z-20">
                  <div className="flex justify-between items-center text-xs sm:text-sm font-black">
                    <span className="text-emerald-300 flex items-center gap-1.5">
                      <Crown size={16} className="text-amber-400" />
                      <span>زعيم الدانجون: ملك الظلال المدرّع</span>
                    </span>
                    <span className="bg-red-600/30 border border-red-500 px-2.5 py-0.5 rounded-full text-white font-mono">
                      {bossHp}% HP
                    </span>
                  </div>
                  <div className="w-full h-4 bg-black/90 rounded-full overflow-hidden border border-emerald-400/40 p-0.5">
                    <div
                      style={{ width: `${bossHp}%` }}
                      className="h-full rounded-full bg-gradient-to-r from-[#FF1744] via-amber-400 to-emerald-400 transition-all duration-200"
                    />
                  </div>
                </div>

                <div className="relative flex-1 flex items-center justify-center">
                  <motion.div
                    animate={
                      bossShake
                        ? { x: [-8, 8, -6, 6, 0], scale: 0.94 }
                        : { scale: [1, 1.05, 1] }
                    }
                    transition={{ duration: bossShake ? 0.2 : 2, repeat: bossShake ? 0 : Infinity }}
                    className="relative w-44 h-44 rounded-3xl overflow-hidden ring-4 ring-emerald-400 shadow-[0_0_60px_rgba(16,185,129,0.55)] bg-black"
                  >
                    <img src={shadowDungeonBg} alt="" className="w-full h-full object-cover" />
                  </motion.div>

                  <button
                    onClick={handleStrikeBoss}
                    style={{ left: `${weakSpotPos.x}%`, top: `${weakSpotPos.y}%` }}
                    className="absolute z-30 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-[#FF1744]/40 border-4 border-[#FF1744] text-white font-black text-xs flex flex-col items-center justify-center shadow-[0_0_30px_#FF1744] animate-pulse cursor-pointer active:scale-90"
                  >
                    <Target size={22} />
                    <span>اضرب!</span>
                  </button>
                </div>
              </div>
            )}

            {gameId === 'sky_tower' && (
              <div className="w-full h-[390px] rounded-3xl bg-black/65 backdrop-blur-md border-2 border-yellow-500/50 p-5 flex flex-col justify-between text-center">
                <div className="flex items-center justify-between">
                  <span className="bg-yellow-500 text-black text-xs font-black px-3.5 py-1 rounded-full">
                    🗼 الطابق القتالي: #{towerFloor}
                  </span>
                  <span
                    className={`text-xs font-black px-3 py-1 rounded-full border ${
                      towerShield
                        ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                        : 'bg-red-500/20 border-red-500 text-red-300'
                    }`}
                  >
                    {towerShield ? '🛡️ درع النين مفعّل' : '⚠️ بدون درع'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3.5 my-auto">
                  {[
                    { idx: 0, title: 'بوابة التنين', mult: '1.5X', color: 'from-red-500/30 to-black border-red-500/60' },
                    { idx: 1, title: 'بوابة العرش الذهبي', mult: '2.0X', color: 'from-amber-400/35 to-black border-yellow-400' },
                    { idx: 2, title: 'بوابة الظلال', mult: '1.5X', color: 'from-purple-500/30 to-black border-purple-400/60' }
                  ].map((g) => (
                    <motion.button
                      key={g.idx}
                      whileHover={{ y: -8, scale: 1.04 }}
                      whileTap={{ scale: 0.94 }}
                      onClick={() => handleClimbGate(g.idx)}
                      className={`h-40 rounded-3xl bg-gradient-to-b ${g.color} border-2 flex flex-col items-center justify-center gap-2 p-3 cursor-pointer shadow-2xl`}
                    >
                      <Sparkles size={26} className="text-yellow-300" />
                      <span className="text-xs sm:text-sm font-black text-white">{g.title}</span>
                      <span className="bg-black/70 text-amber-300 text-[11px] font-mono font-black px-2.5 py-0.5 rounded-full">
                        {g.mult}
                      </span>
                    </motion.button>
                  ))}
                </div>

                <button
                  onClick={() => triggerEndGame(scoreRef.current, scoreRef.current >= 120)}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 text-black font-black text-xs sm:text-sm cursor-pointer shadow-lg"
                >
                  💰 تأمين غنيمة البرج والانسحاب بـ ({score} PT)
                </button>
              </div>
            )}

            {gameId === 'shinobi_parkour' && (
              <div
                onClick={() => jumpTriggerRef.current()}
                className="w-full rounded-3xl overflow-hidden border-2 border-pink-500/50 shadow-[0_0_50px_rgba(236,72,153,0.25)] bg-black/55 relative cursor-pointer"
              >
                <canvas ref={parkourCanvasRef} className="w-full h-[380px] block" />
              </div>
            )}
          </motion.div>

          {/* =====================================================================
              شريط التحكم السفلي الموحد للألعاب (عداد الضربة القاضية السينمائية ULTIMATE)
             ===================================================================== */}
          <div className="relative z-20 px-4 py-2.5 bg-black/80 backdrop-blur-xl border-t border-white/10">
            <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-[10px] font-black">
                  <span className="text-amber-300">⚡ شحن الضربة القاضية ({selectedHero.name})</span>
                  <span className="font-mono">{ultimateCharge}%</span>
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
          الطور الثالث: شاشة تتويج تطبيق اللعبة المستقل (S-RANK VICTORY SCREEN)
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
              className="bg-[#11111d] border-2 border-white/15 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl"
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

              <div className="space-y-1 pt-1">
                <h3 className="text-xl font-black text-white">
                  {score >= targetToBeat ? 'انتصار أسطوري في اللعبة! 🏆' : 'انتهت المعركة!'}
                </h3>
                <p className="text-xs text-neutral-300">
                  النتيجة المسجلة في حسابك:{' '}
                  <strong className="text-emerald-400 font-mono">{score} PT</strong> (الهدف:{' '}
                  {targetToBeat})
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  onClick={startStandaloneGame}
                  className="bg-[#FF1744] hover:bg-rose-600 text-white font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
                >
                  <RotateCcw size={15} />
                  <span>جولة جديدة</span>
                </button>
                <button
                  onClick={() => setAppPhase('TITLE_LOBBY')}
                  className="bg-amber-500/20 border border-amber-400/40 text-amber-300 font-black py-3 rounded-2xl text-xs cursor-pointer"
                >
                  تغيير المقاتل
                </button>
              </div>

              <button
                onClick={onClose}
                className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-2.5 rounded-2xl text-xs cursor-pointer"
              >
                العودة لبوابة التطبيق الأساسي
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
