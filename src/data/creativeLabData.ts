export interface OtakuLeakItem {
  id: string;
  title: string;
  source: string;
  time: string;
  tag: string;
  summary: string;
  importance: 'high' | 'medium';
  likes: number;
  skulls: number;
  isBookmarked?: boolean;
}

export const INITIAL_OTAKU_LEAKS: OtakuLeakItem[] = [
  {
    id: 'leak_1',
    title: 'الإعلان رسمياً عن ثلاثية أفلام القلعة اللانهائية لأنمي قاتل الشياطين',
    source: 'استوديو Ufotable · طوكيو',
    time: 'منذ ١٥ دقيقة',
    tag: 'قاتل الشياطين',
    summary: 'تم تأكيد تقديم أرك القلعة اللانهائية الحاسم على هيئة ٣ أفلام سينمائية عالمية بميزانية إنتاجية هي الأضخم في تاريخ الاستوديو.',
    importance: 'high',
    likes: 482,
    skulls: 19
  },
  {
    id: 'leak_2',
    title: 'فصل ون بيس القادم يكشف ماضي جزيرة إلباف وأسرار حكومة العالم',
    source: 'مجلة شونين جمب الأسبوعية',
    time: 'منذ ساعتين',
    tag: 'ون بيس',
    summary: 'تشير الملاحظات الأولية من المحررين إلى مواجهة مباشرة غير مسبوقة في أرك العمالقة مع ظهور شخصية أسطورية طال انتظارها.',
    importance: 'high',
    likes: 715,
    skulls: 44
  },
  {
    id: 'leak_3',
    title: 'عرض تشويقي جديد لفيلم Chainsaw Man: Reze Arc وتحديد نافذة العرض',
    source: 'استوديو MAPPA',
    time: 'منذ ٥ ساعات',
    tag: 'رجل المنشار',
    summary: 'كشف فريق التحريك الرئيسي عن مشاهد قتالية سينمائية جديدة لأرك ريزي مع موسيقى تصويرية من تلحين كينسوكي أوشيو.',
    importance: 'medium',
    likes: 340,
    skulls: 8
  },
  {
    id: 'leak_4',
    title: 'بدء العمل على الموسم الثالث من Jujutsu Kaisen (أرك لعبة الإعدام)',
    source: 'لجنة إنتاج جوجوتسو كايسن',
    time: 'منذ يوم واحد',
    tag: 'جوجوتسو كايسن',
    summary: 'دخلت حلقات أرك Culling Game مرحلة التخطيط البصري المتقدم مع وعود بمشاهد قتالية تتجاوز مستوى حادثة شيبويا.',
    importance: 'high',
    likes: 610,
    skulls: 27
  }
];

export interface OstStationTrack {
  id: string;
  title: string;
  anime: string;
  composer: string;
  bpm: number;
  notes: number[]; // Web Audio synthesizer frequencies (Hz)
  lyrics: { time: number; line: string }[];
  cover: string;
}

export const OST_SYNTH_TRACKS: OstStationTrack[] = [
  {
    id: 'ost_bluebird',
    title: 'Blue Bird · الطائر الأزرق',
    anime: 'Naruto Shippuden',
    composer: 'Ikimono-gakari',
    bpm: 152,
    notes: [440, 493.88, 523.25, 587.33, 659.25, 587.33, 523.25, 493.88],
    cover: 'https://cdn.myanimelist.net/images/anime/1565/111305.jpg',
    lyrics: [
      { time: 0, line: 'إذا قررت التحليق في الأفق فلا تلتفت إلى الوراء...' },
      { time: 5, line: 'كل ما نصبو إليه هو تلك السماء الزرقاء البعيدة.' },
      { time: 10, line: 'حطّم قيود الصمت وحلّق بجناحيك نحو الضوء!' },
      { time: 15, line: 'نغمة شينوبي خالدة تتردد في سماء كونوها...' }
    ]
  },
  {
    id: 'ost_unravel',
    title: 'Unravel · تقاطع الظلال',
    anime: 'Tokyo Ghoul',
    composer: 'TK from Ling Tosite Sigure',
    bpm: 135,
    notes: [392, 440, 466.16, 523.25, 466.16, 440, 392, 349.23],
    cover: 'https://cdn.myanimelist.net/images/anime/5/64449.jpg',
    lyrics: [
      { time: 0, line: 'أخبرني كيف يعمل هذا العالم المتشابك؟' },
      { time: 5, line: 'من الذي يسكن بداخلي في هذه الليلة الماطرة؟' },
      { time: 10, line: 'تجمّد خطواتك.. لا تبحث عني وسط الحطام.' },
      { time: 15, line: 'سأحمي ذكرياتك حتى لو تلاشى كل شيء.' }
    ]
  },
  {
    id: 'ost_gurenge',
    title: 'Gurenge · زهرة اللوتس القرمزية',
    anime: 'Demon Slayer',
    composer: 'LiSA',
    bpm: 135,
    notes: [329.63, 392, 440, 493.88, 523.25, 493.88, 440, 392],
    cover: 'https://cdn.myanimelist.net/images/anime/1286/99889.jpg',
    lyrics: [
      { time: 0, line: 'أعرف السبب الذي يجعلني أزداد قوة يوماً بعد يوم...' },
      { time: 5, line: 'احمل أحزانك وامضِ قدماً بنصل لا ينكسر!' },
      { time: 10, line: 'زهرة اللوتس الحمراء تتفتح وسط عتمة الليل.' },
      { time: 15, line: 'تنفس الشمس يضيء الدرب أمام السيافين.' }
    ]
  },
  {
    id: 'ost_shinzou',
    title: 'Shinzou wo Sasageyo · كرسوا قلوبكم',
    anime: 'Attack on Titan',
    composer: 'Linked Horizon',
    bpm: 160,
    notes: [293.66, 349.23, 440, 523.25, 587.33, 523.25, 440, 349.23],
    cover: 'https://cdn.myanimelist.net/images/anime/10/47347.jpg',
    lyrics: [
      { time: 0, line: 'تقدموا خلف الأسوار نحو فجر الحرية الموعود!' },
      { time: 5, line: 'تضحيات الرفاق لن تذهب سدى طالما نواصل المسير.' },
      { time: 10, line: 'كرّسوا قلوبكم! أجنحة الحرية تخفق في السماء!' },
      { time: 15, line: 'نداء فيلق الاستطلاع يشق صمت المعركة.' }
    ]
  }
];

export interface TierHeroItem {
  id: string;
  name: string;
  anime: string;
  img: string;
}

export const TIER_ROSTER_HEROES: TierHeroItem[] = [
  { id: 'th_luffy', name: 'مونكي دي لوفي', anime: 'One Piece', img: 'https://cdn.myanimelist.net/images/characters/9/310307.jpg' },
  { id: 'th_zoro', name: 'رورونوا زورو', anime: 'One Piece', img: 'https://cdn.myanimelist.net/images/characters/15/271383.jpg' },
  { id: 'th_naruto', name: 'ناروتو أوزوماكي', anime: 'Naruto', img: 'https://cdn.myanimelist.net/images/characters/9/131317.jpg' },
  { id: 'th_itachi', name: 'إيتاتشي أوتشيها', anime: 'Naruto', img: 'https://cdn.myanimelist.net/images/characters/16/205629.jpg' },
  { id: 'th_gojo', name: 'ساتورو غوجو', anime: 'Jujutsu Kaisen', img: 'https://cdn.myanimelist.net/images/characters/2/439744.jpg' },
  { id: 'th_levi', name: 'ليفاي أكرمان', anime: 'Attack on Titan', img: 'https://cdn.myanimelist.net/images/characters/2/241031.jpg' },
  { id: 'th_eren', name: 'إيرين ييغر', anime: 'Attack on Titan', img: 'https://cdn.myanimelist.net/images/characters/3/218013.jpg' },
  { id: 'th_goku', name: 'سون غوكو', anime: 'Dragon Ball', img: 'https://cdn.myanimelist.net/images/characters/15/263399.jpg' },
  { id: 'th_killua', name: 'كيلوا زولديك', anime: 'Hunter x Hunter', img: 'https://cdn.myanimelist.net/images/characters/13/214451.jpg' },
  { id: 'th_light', name: 'لايت ياغامي', anime: 'Death Note', img: 'https://cdn.myanimelist.net/images/characters/6/275115.jpg' },
  { id: 'th_edward', name: 'إدوارد إلريك', anime: 'Fullmetal Alchemist', img: 'https://cdn.myanimelist.net/images/characters/9/72533.jpg' },
  { id: 'th_lelouch', name: 'لولوش لامبروج', anime: 'Code Geass', img: 'https://cdn.myanimelist.net/images/characters/12/37996.jpg' }
];

export interface VersusPollDebate {
  id: string;
  question: string;
  category: string;
  sideA: { name: string; subtitle: string; img: string; votes: number };
  sideB: { name: string; subtitle: string; img: string; votes: number };
}

export const INITIAL_VERSUS_DEBATES: VersusPollDebate[] = [
  {
    id: 'vs_1',
    question: 'من ينتصر في مواجهة مباشرة بكامل القوة؟',
    category: 'نزال القمة الأسطوري',
    sideA: {
      name: 'ساتورو غوجو (الأعين الستة)',
      subtitle: 'Jujutsu Kaisen · الفراغ اللانهائي',
      img: 'https://cdn.myanimelist.net/images/characters/2/439744.jpg',
      votes: 642
    },
    sideB: {
      name: 'مادارا أوتشيها (الطور الإلهي)',
      subtitle: 'Naruto Shippuden · الرينيغان والسوسانو',
      img: 'https://cdn.myanimelist.net/images/characters/14/205627.jpg',
      votes: 589
    }
  },
  {
    id: 'vs_2',
    question: 'أيهما يمتلك العقل التكتيكي والتخطيط الأدهى في عالم الأنمي؟',
    category: 'مناظرة الدهاء الاستراتيجي',
    sideA: {
      name: 'إل لوليت (L Lawliet)',
      subtitle: 'Death Note · المحقق الأعظم',
      img: 'https://cdn.myanimelist.net/images/characters/10/63813.jpg',
      votes: 490
    },
    sideB: {
      name: 'لولوش لامبروج (Zero)',
      subtitle: 'Code Geass · قائد التمرد',
      img: 'https://cdn.myanimelist.net/images/characters/12/37996.jpg',
      votes: 518
    }
  },
  {
    id: 'vs_3',
    question: 'من هو السياف الأكثر هيبة وإتقاناً في المعارك الحاسمة؟',
    category: 'مبارزة السيافين',
    sideA: {
      name: 'رورونوا زورو',
      subtitle: 'One Piece · أسلوب السيوف الثلاثة',
      img: 'https://cdn.myanimelist.net/images/characters/15/271383.jpg',
      votes: 812
    },
    sideB: {
      name: 'ليفاي أكرمان',
      subtitle: 'Attack on Titan · نصل الاستطلاع',
      img: 'https://cdn.myanimelist.net/images/characters/2/241031.jpg',
      votes: 745
    }
  }
];
