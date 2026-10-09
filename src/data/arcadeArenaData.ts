export interface OtakuFighterCard {
  id: string;
  name: string;
  title: string;
  anime: string;
  element: 'fire' | 'lightning' | 'shadow' | 'wind' | 'void';
  atk: number;
  def: number;
  spd: number;
  iq: number;
  specialMove: string;
  quote: string;
  img: string;
}

export const FIGHTER_DECK: OtakuFighterCard[] = [
  {
    id: 'f_gojo',
    name: 'ساتورو غوجو',
    title: 'حامل الأعين الستة اللانهائية',
    anime: 'Jujutsu Kaisen',
    element: 'void',
    atk: 98,
    def: 99,
    spd: 97,
    iq: 95,
    specialMove: 'الفراغ اللانهائي والأرجواني الأجوف',
    quote: 'لا تقلق.. في السماء والأرض، أنا وحدي المبجل.',
    img: 'https://cdn.myanimelist.net/images/characters/2/439744.jpg'
  },
  {
    id: 'f_luffy',
    name: 'مونكي دي لوفي',
    title: 'إمبراطور البحر (المحرك الخامس)',
    anime: 'One Piece',
    element: 'lightning',
    atk: 97,
    def: 94,
    spd: 96,
    iq: 78,
    specialMove: 'باجرانغ غان - قبضة إله الشمس نيكا',
    quote: 'سأصبح ملك القراصنة، الرجل الأكثر حرية في المحيطات!',
    img: 'https://cdn.myanimelist.net/images/characters/9/310307.jpg'
  },
  {
    id: 'f_levi',
    name: 'ليفاي أكرمان',
    title: 'أقوى جندي في تاريخ البشرية',
    anime: 'Attack on Titan',
    element: 'wind',
    atk: 94,
    def: 88,
    spd: 100,
    iq: 94,
    specialMove: 'إعصار نصل الاستطلاع الدوار',
    quote: 'اختر القرار الذي لن تندم عليه أبداً.',
    img: 'https://cdn.myanimelist.net/images/characters/2/241031.jpg'
  },
  {
    id: 'f_madara',
    name: 'مادارا أوتشيها',
    title: 'شبح الأوتشيها الخالد',
    anime: 'Naruto Shippuden',
    element: 'fire',
    atk: 99,
    def: 96,
    spd: 93,
    iq: 97,
    specialMove: 'السوسانو المثالي والنيزك المزدوج',
    quote: 'هل تريدون مني أن تستخدم النسخ السوسانو أيضاً أم لا؟',
    img: 'https://cdn.myanimelist.net/images/characters/14/205627.jpg'
  },
  {
    id: 'f_zoro',
    name: 'رورونوا زورو',
    title: 'ملك الجحيم وصائد القراصنة',
    anime: 'One Piece',
    element: 'wind',
    atk: 96,
    def: 92,
    spd: 91,
    iq: 80,
    specialMove: 'أشورا: نصل خطوط اللهب التسعة',
    quote: 'ندبة على الظهر هي عار على أي سياف.',
    img: 'https://cdn.myanimelist.net/images/characters/15/271383.jpg'
  },
  {
    id: 'f_itachi',
    name: 'إيتاتشي أوتشيها',
    title: 'عبقري الوهم والتضحية الصامتة',
    anime: 'Naruto Shippuden',
    element: 'shadow',
    atk: 93,
    def: 91,
    spd: 95,
    iq: 100,
    specialMove: 'تسوكويومي الأبدي ونيران الأماتيراسو',
    quote: 'الناس يعيشون مقيدين بما يظنونه حقيقة وواقعاً.',
    img: 'https://cdn.myanimelist.net/images/characters/16/205629.jpg'
  },
  {
    id: 'f_goku',
    name: 'سون غوكو',
    title: 'الغريزة الفائقة الكاملة',
    anime: 'Dragon Ball Super',
    element: 'lightning',
    atk: 100,
    def: 96,
    spd: 99,
    iq: 82,
    specialMove: 'كاميهاميها الكونية الفائقة',
    quote: 'أنا السايان الذي نشأ على كوكب الأرض!',
    img: 'https://cdn.myanimelist.net/images/characters/15/263399.jpg'
  },
  {
    id: 'f_killua',
    name: 'كيلوا زولديك',
    title: 'وريث عائلة القتلة وسرعة البرق',
    anime: 'Hunter x Hunter',
    element: 'lightning',
    atk: 89,
    def: 86,
    spd: 99,
    iq: 96,
    specialMove: 'غود سبيد (سرعة البرق الإلهية)',
    quote: 'غون، أنت الضوء.. وأحياناً تشرق بقوة لدرجة أنني أغمض عيني.',
    img: 'https://cdn.myanimelist.net/images/characters/13/214451.jpg'
  },
  {
    id: 'f_lelouch',
    name: 'لولوش لامبروج',
    title: 'الإمبراطور زيرو صاحب الجياس',
    anime: 'Code Geass',
    element: 'shadow',
    atk: 84,
    def: 85,
    spd: 82,
    iq: 100,
    specialMove: 'أمر الطاعة المطلقة للجياس الملكي',
    quote: 'الوحيدون الذين يجب أن يطلقوا النار هم المستعدون لتلقي الرصاص.',
    img: 'https://cdn.myanimelist.net/images/characters/12/37996.jpg'
  },
  {
    id: 'f_tanjiro',
    name: 'تانجيرو كامادو',
    title: 'وريث رقصة إله النار (هينوكامي)',
    anime: 'Demon Slayer',
    element: 'fire',
    atk: 91,
    def: 89,
    spd: 92,
    iq: 89,
    specialMove: 'رقصة إله الشمس: الهالة الحارقة',
    quote: 'مهما انكسرت، سأنهض وأحمي أختي وأصدقائي!',
    img: 'https://cdn.myanimelist.net/images/characters/11/384795.jpg'
  }
];

export interface MysteryClueTarget {
  id: string;
  name: string;
  anime: string;
  img: string;
  clues: string[];
  options: string[];
  correctIdx: number;
}

export const MYSTERY_DETECTIVE_CASES: MysteryClueTarget[] = [
  {
    id: 'case_1',
    name: 'إل لوليت (L Lawliet)',
    anime: 'Death Note',
    img: 'https://cdn.myanimelist.net/images/characters/10/63813.jpg',
    clues: [
      'الدليل الأول (40 نقطة): يجلس دائماً بطريقة القرفصاء ويؤكد أن الجلوس العادي يقلل من قدرته الاستنتاجية بنسبة 40%.',
      'الدليل الثاني (30 نقطة): يعشق الحلويات والسكريات بشراهة ولا يرتدي الأحذية أبداً أثناء التحقيق.',
      'الدليل الثالث (20 نقطة): أعظم محقق سري في العالم وخصم "كيرا" الأول في طوكيو.'
    ],
    options: ['لايت ياغامي', 'إل لوليت (L)', 'نير (Near)', 'كونان إيدوغاوا'],
    correctIdx: 1
  },
  {
    id: 'case_2',
    name: 'إدوارد إلريك',
    anime: 'Fullmetal Alchemist: Brotherhood',
    img: 'https://cdn.myanimelist.net/images/characters/9/72533.jpg',
    clues: [
      'الدليل الأول (40 نقطة): يغضب بشدة إذا سخر أحد من قصر قامته، ويحمل ساعة جيب فضية محفور داخلها تاريخ لا يُنسى.',
      'الدليل الثاني (30 نقطة): يستطيع إجراء التحويل الكيميائي بتصفيق يديه فقط دون رسم دائرة تحويل.',
      'الدليل الثالث (20 نقطة): فقد ذراعه اليمنى وساقه اليسرى في محاولة محرمة لإعادة والدته، ويرتدي أطرافاً معدنية (أوتوميل).'
    ],
    options: ['روي موستانغ', 'إدوارد إلريك', 'ألفونس إلريك', 'ثورفين'],
    correctIdx: 1
  },
  {
    id: 'case_3',
    name: 'كورابيكا',
    anime: 'Hunter x Hunter',
    img: 'https://cdn.myanimelist.net/images/characters/4/174561.jpg',
    clues: [
      'الدليل الأول (40 نقطة): يتحول نوع الـ "نين" الخاص به من التجسيد إلى التخصص (100% في كل الفئات) عندما يتغير لون عينيه.',
      'الدليل الثاني (30 نقطة): وضع شرطاً قاتلاً على قلبه باستخدام نصل سلسلة لا يجوز استخدامه إلا ضد عصابة محددة.',
      'الدليل الثالث (20 نقطة): الناجي الأخير من قبيلة كوروتا ذات العيون القرمزية ومطارد عصابة العناكب.'
    ],
    options: ['كيلوا زولديك', 'كورابيكا', 'كرولو لوسيلفر', 'هيسوكا'],
    correctIdx: 1
  },
  {
    id: 'case_4',
    name: 'ترافلغار دي ووتر لاو',
    anime: 'One Piece',
    img: 'https://cdn.myanimelist.net/images/characters/11/253003.jpg',
    clues: [
      'الدليل الأول (40 نقطة): يلقب بـ "جراح الموت" ويقود غواصة صفراء بدلاً من سفينة قراصنة تقليدية.',
      'الدليل الثاني (30 نقطة): يدين بحياته لـ "كورازون" الذي ضحى بنفسه لمنحه فاكهة الشيطان الأسطورية.',
      'الدليل الثالث (20 نقطة): يمتلك فاكهة "أوبي أوبي نو مي" التي تخلق غرفة عمليات زرقاء (ROOM) يقطع ويبدل فيها أي شيء.'
    ],
    options: ['يوستاس كيد', 'ترافلغار لاو', 'شانكس', 'ماركو العنقاء'],
    correctIdx: 1
  },
  {
    id: 'case_5',
    name: 'كين كانيكي',
    anime: 'Tokyo Ghoul',
    img: 'https://cdn.myanimelist.net/images/characters/2/324102.jpg',
    clues: [
      'الدليل الأول (40 نقطة): طالب جامعي هادئ يحب قراءة روايات الكاتب "سن تاكاتسوكي" ويمسك ذقنه بيده عندما يكذب.',
      'الدليل الثاني (30 نقطة): تحول شعره من الأسود إلى الأبيض بالكامل بعد تعرضه لتعذيب قاسٍ مع مسألة (1000 ناقص 7).',
      'الدليل الثالث (20 نقطة): يرتدي قناعاً جلدياً برقعة عين واحدة ويعمل في مقهى "الأنتيك" بطوكيو.'
    ],
    options: ['كين كانيكي', 'أريما كيشو', 'شينيتشي إيزومي', 'أكوتاغاوا'],
    correctIdx: 0
  },
  {
    id: 'case_6',
    name: 'سوسكي آيزن',
    anime: 'Bleach',
    img: 'https://cdn.myanimelist.net/images/characters/12/73128.jpg',
    clues: [
      'الدليل الأول (40 نقطة): تظاهر بأنه قائد هادئ يرتدي نظارة طبية وزيف مقتله أمام الجميع في مجتمع الأرواح.',
      'الدليل الثاني (30 نقطة): سيفه الزانباكتو "كيوكا سويغيتسو" يضع كل من يرى إطلاقه تحت التنويم المغناطيسي الكامل.',
      'الدليل الثالث (20 نقطة): القائد السابق للفرقة الخامسة وسيد قصر لاس نوتشيس ومنظمة الإسبادا.'
    ],
    options: ['بياكويا كوتشيكي', 'سوسكي آيزن', 'كيسكي أوراهارا', 'يوها باخ'],
    correctIdx: 1
  }
];

export interface VisualBlurTarget {
  id: string;
  title: string;
  arabicTitle: string;
  year: string;
  studio: string;
  img: string;
  options: string[];
  correctIdx: number;
}

export const VISUAL_BLUR_TARGETS: VisualBlurTarget[] = [
  {
    id: 'vb_1',
    title: 'Attack on Titan',
    arabicTitle: 'هجوم العمالقة',
    year: '2013',
    studio: 'Wit Studio / MAPPA',
    img: 'https://cdn.myanimelist.net/images/anime/10/47347.jpg',
    options: ['هجوم العمالقة (Attack on Titan)', 'فينلاند ساغا (Vinland Saga)', 'كابانيري الحصن الحديدي', 'بيرسيرك (Berserk)'],
    correctIdx: 0
  },
  {
    id: 'vb_2',
    title: 'Demon Slayer',
    arabicTitle: 'قاتل الشياطين',
    year: '2019',
    studio: 'Ufotable',
    img: 'https://cdn.myanimelist.net/images/anime/1286/99889.jpg',
    options: ['بليتش (Bleach)', 'قاتل الشياطين (Demon Slayer)', 'دورورو (Dororo)', 'إينوياشا (Inuyasha)'],
    correctIdx: 1
  },
  {
    id: 'vb_3',
    title: 'Jujutsu Kaisen',
    arabicTitle: 'جوجوتسو كايسن',
    year: '2020',
    studio: 'MAPPA',
    img: 'https://cdn.myanimelist.net/images/anime/1171/109222.jpg',
    options: ['طوكيو غول (Tokyo Ghoul)', 'رجل المنشار (Chainsaw Man)', 'جوجوتسو كايسن (Jujutsu Kaisen)', 'موب سايكو 100'],
    correctIdx: 2
  },
  {
    id: 'vb_4',
    title: 'Hunter x Hunter',
    arabicTitle: 'هنتر x هنتر (القناص)',
    year: '2011',
    studio: 'Madhouse',
    img: 'https://cdn.myanimelist.net/images/anime/1337/99013.jpg',
    options: ['يو يو هاكوشو', 'هنتر x هنتر (Hunter x Hunter)', 'ناروتو (Naruto)', 'ون بيس (One Piece)'],
    correctIdx: 1
  },
  {
    id: 'vb_5',
    title: 'Steins;Gate',
    arabicTitle: 'بوابة شتاينز',
    year: '2011',
    studio: 'White Fox',
    img: 'https://cdn.myanimelist.net/images/anime/1935/127974.jpg',
    options: ['مذكرة الموت (Death Note)', 'بوابة شتاينز (Steins;Gate)', 'مونستر (Monster)', 'سايكو باس (Psycho-Pass)'],
    correctIdx: 1
  },
  {
    id: 'vb_6',
    title: 'Sousou no Frieren',
    arabicTitle: 'فريرين: ما وراء نهاية الرحلة',
    year: '2023',
    studio: 'Madhouse',
    img: 'https://cdn.myanimelist.net/images/anime/1015/138029.jpg',
    options: ['فايوليت إيفرغاردن', 'فريرين (Sousou no Frieren)', 'ري:زيرو (Re:Zero)', 'موشوكو تينسي'],
    correctIdx: 1
  }
];

export interface SpeedChallengeItem {
  q: string;
  options: string[];
  correct: number;
  category: string;
}

export const SPEED_ARENA_QUESTIONS: SpeedChallengeItem[] = [
  { q: 'ما هو اسم سيف زورو الذي ورثه من كوينا في طفولته؟', options: ['إنما', 'وادو إيتشيمونجي', 'شوشوي', 'سانداي كيتيتسو'], correct: 1, category: 'ون بيس' },
  { q: 'من هو المدرب الذي علّم ناروتو تقنية "الراسينغان"؟', options: ['كاكاشي هاتاكي', 'جيرايا', 'ميناتو ناميكازي', 'إيروكا'], correct: 1, category: 'ناروتو' },
  { q: 'كم عدد أصابع ملك اللعنات "ريومن سوكونا" الكاملة؟', options: ['10 أصابع', '15 إصبعاً', '20 إصبعاً', '24 إصبعاً'], correct: 2, category: 'جوجوتسو كايسن' },
  { q: 'من هو قائد فرقة الاستطلاع الثالث عشر في هجوم العمالقة؟', options: ['كيث شاديس', 'إيروين سميث', 'هانجي زوي', 'بيكسيس'], correct: 1, category: 'هجوم العمالقة' },
  { q: 'ما هي قدرة النين الخاصة بـ "هيسوكا" في هنتر x هنتر؟', options: ['بانجي غام (العلكة المطاطية)', 'سلسلة الحكم', 'قبضة جاجانكين', 'تلاعب الظلال'], correct: 0, category: 'هنتر x هنتر' },
  { q: 'ما هو الاسم الحقيقي للشخصية "كيرا" في أنمي مذكرة الموت؟', options: ['إل لوليت', 'لايت ياغامي', 'ريوك', 'ميلو'], correct: 1, category: 'مذكرة الموت' },
  { q: 'من هو هاشيرا اللهب الذي قاتل القمر العلوي الثالث "أكازا"؟', options: ['غييو توميوكا', 'كيوجورو رينغوكو', 'تينغن أوزوي', 'ميتسوري كانروجي'], correct: 1, category: 'قاتل الشياطين' },
  { q: 'ما هو اسم والد "إيرين ييغر" الذي ورّثه العملاق المهاجم والمؤسس؟', options: ['زيكي ييغر', 'غريشا ييغر', 'ويلي تيبور', 'توم كسافر'], correct: 1, category: 'هجوم العمالقة' },
  { q: 'أي شخصية في أنمي بليتش تمتلك الزانباكتو "سينبونزاكورا" (ألف زهرة كرز)؟', options: ['توشيرو هيتسوغايا', 'بياكويا كوتشيكي', 'رينجي أباراي', 'كينباتشي زاراكي'], correct: 1, category: 'بليتش' },
  { q: 'في أنمي فينلاند ساغا، من هو المحارب الذي قتل والد ثورفين "ثورس"؟', options: ['ثوركيل', 'أسكيلاد', 'الملك كانوت', 'فلولكي'], correct: 1, category: 'فينلاند ساغا' }
];
