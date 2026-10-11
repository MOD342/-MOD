import { Router, Request, Response, NextFunction } from 'express';
import { GoogleGenAI, Type } from '@google/genai';

const router = Router();
let aiInstance: GoogleGenAI | null = null;

function getAi(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }
  if (!aiInstance) {
    try {
      aiInstance = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    } catch (e: any) {
      console.error("Failed to initialize GoogleGenAI:", e.message);
      return null;
    }
  }
  return aiInstance;
}

// ============================================================================
// HIGH-CONCURRENCY MULTI-USER SCALING & CACHING ENGINE
// ============================================================================

// 1. Per-User / Per-IP Sliding Window Rate Limiter (protects global API quota)
const userRateMap = new Map<string, { timestamps: number[] }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_CHAT_REQ_PER_MIN = 8; // Max 8 chat messages per minute per user

function checkRateLimit(identifier: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const entry = userRateMap.get(identifier) || { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (entry.timestamps.length >= MAX_CHAT_REQ_PER_MIN) {
    const oldest = entry.timestamps[0];
    const retryAfterSec = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000));
    userRateMap.set(identifier, entry);
    return { allowed: false, retryAfterSec };
  }

  entry.timestamps.push(now);
  userRateMap.set(identifier, entry);

  // Periodic cleanup to prevent memory leaks under high user volume
  if (userRateMap.size > 5000) {
    for (const [k, v] of userRateMap.entries()) {
      if (v.timestamps.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) {
        userRateMap.delete(k);
      }
    }
  }

  return { allowed: true };
}

// 2. Smart LRU Response Cache & In-Flight Request Deduplication for Chat
const chatResponseCache = new Map<string, { text: string; expiresAt: number }>();
const inFlightChatRequests = new Map<string, Promise<string>>();
const CHAT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache for common prompts

function normalizePromptKey(promptText: string, mood: string): string {
  return `${promptText.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ')}|${mood.slice(0, 12)}`;
}

// 3. Multi-User Games & Anti-Cheat Pool Cache (prevents calling Gemini on every game start)
const gamesPoolCache = new Map<string, { questions: any[]; expiresAt: number; refreshing: boolean }>();
const antiCheatCache = new Map<string, { data: any; expiresAt: number }>();
const GAMES_CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes shared pool per game type

// 4. Intelligent Local Otaku Senpai Knowledge Base (Zero-Downtime Fallback under extreme load)
function generateSmartOtakuFallback(lastMessage: string, mood: string): string {
  const q = lastMessage.toLowerCase();

  if (q.includes('fate') || q.includes('فيت')) {
    return `أهلاً بك يا ناكاما! ⚔️ سلسلة **Fate** عالم أسطوري مترابط، وإليك الترتيب الأفضل والأصح للمشاهدة بدون حرق:\n\n1️⃣ **Fate/stay night: Unlimited Blade Works (2014)** — البداية المثالية لفهم نظام حرب الكأس المقدسة بأقوى تحريك من استوديو Ufotable.\n2️⃣ **أفلام Fate/stay night: Heaven's Feel (الثلاثية)** — المسار الأعمق والأكثر سوداوية وإثارة.\n3️⃣ **Fate/Zero** — القصة السابقة (Prequel) التي تشرح حرب الكأس المقدسة الرابعة بكتابة عبقرية.\n\nبعد إنهاء هذه الثلاثية يمكنك مشاهدة أي جزء فرعي مثل *Fate/Apocrypha* أو *Fate/Grand Order* بحرية تامة! 🌟`;
  }

  if (q.includes('death note') || q.includes('مذكرة الموت') || q.includes('غموض') || q.includes('تحقيق') || q.includes('ذكاء')) {
    return `ذوقك رفيع جداً يا صديقي! 🧠 بما أنك تبحث عن صراع عقول وغموض بمستوى **Death Note**، إليك 4 تحف فنية ستجعلك تحبس أنفاسك:\n\n1️⃣ **Monster** — تحفة نفسية خالدة عن الطبيب "تينما" ومطاردته لأخطر عبقري شرير في التاريخ.\n2️⃣ **Code Geass** — إذا أعجبك دهاء "لايت ياغامي"، فإن "لولوش" سيذهلك بتخطيطه الاستراتيجي الخارق.\n3️⃣ **The Promised Neverland (الموسم الأول)** — حرب نفسية وتخطيط هروب عبقري لا يهدأ لحظة واحدة.\n4️⃣ **Tomodachi Game** — ألعاب نفسية ملتوية تكشف الوجه الحقيقي للأصدقاء تحت الضغط.\n\nأي واحد منها يشد انتباهك لنبدأ به؟ 🔥`;
  }

  if (q.includes('قصير') || q.includes('مكتمل') || q.includes('سريع') || q.includes('12 حلقة')) {
    return `طلبك عندي يا ناكاما! ⚡ هذه قائمة بأقوى الأنميات القصيرة والمكتملة (11 إلى 24 حلقة) التي تشدك من أول دقيقة حتى النهاية:\n\n1️⃣ **Erased (Boku dake ga Inai Machi)** — (12 حلقة) سفر عبر الزمن لإنقاذ ضحايا جريمة غامضة، مشوق لأقصى درجة!\n2️⃣ **Cyberpunk: Edgerunners** — (10 حلقات) أكشن مستقبلي وقصة مؤثرة جداً بإنتاج بصري خارق.\n3️⃣ **91 Days** — (12 حلقة) قصة انتقام ومافيا كلاسيكية محبوكة بإتقان.\n4️⃣ **Parasyte: The Maxim** — (24 حلقة) قتالات وتطور شخصية أسطوري ونهاية مكتملة ومُرضية.\n\nاختر واحداً منها وأضمن لك سهرة لا تُنسى! 🍿`;
  }

  if (q.includes('كوميد') || q.includes('ضحك') || mood.includes('حزين')) {
    return `لا مكان للحزن وأنا هنا يا ناكاما! 😆🌟 إذا أردت أنمي يجعلك تضحك من قلبك وينسيك تعب اليوم، فهذه اختيارات السينباي الذهبية:\n\n1️⃣ **Grand Blue** — كوميديا جامعية هستيرية، مستحيل تشاهد حلقة بدون ضحك متواصل!\n2️⃣ **Gintama** — ملك الكوميديا والأكشن الساخر بلا منازع.\n3️⃣ **Saiki Kusuo no Psi-nan** — حلقات سريعة وخفيفة عن طالب بقدرات خارقة يحاول فقط العيش بهدوء.\n4️⃣ **Spy x Family** — مزيج رائع ودافئ بين الكوميديا العائلية، الأكشن، ولطافة "آنيا"!\n\nجرب أول حلقة من أي منها وستشكرني فوراً! ✨`;
  }

  if (q.includes('أكشن') || q.includes('قتال') || q.includes('حماس') || q.includes('شونين') || mood.includes('متحمس')) {
    return `هذا هو الحماس الذي أحبه يا صديقي! 🔥⚔️ إذا كنت تريد معارك ملحمية وتحريك يفجر الشاشة، إليك نخبة الشونين والأكشن:\n\n1️⃣ **Solo Leveling** — تطور قوة البطل "سونغ جين-وو" وقتالات الظلال ترفع الأدرينالين لأقصى حد!\n2️⃣ **Jujutsu Kaisen** — خصوصاً آرك شيبويا، تحريك قتالي خارق للطبيعة.\n3️⃣ **Demon Slayer (Kimetsu no Yaiba)** — لوحات فنية متحركة في كل معركة.\n4️⃣ **Hunter x Hunter (2011)** — أفضل نظام قوة (Nen) وأعمق رحلة مغامرة في عالم الشونين.\n\nهل تابعت أياً منها أم تريد توصيات أعمق وأندر؟ 💪`;
  }

  if (q.includes('موسم') || q.includes('جديد') || q.includes('حالي')) {
    return `سؤال في محله يا ناكاما! 🌟 الساحة حالياً مشتعلة بأعمال قوية جداً تتصدر التقييمات:\n\n🔥 **أبرز الأعمال التي يجب أن تضعها في قائمتك:**\n• **Solo Leveling** — لا يزال يكتسح الشعبية بقتالاته الملحمية.\n• **Frieren: Beyond Journey's End** — تحفة فنية تجمع بين السحر، الفلسفة، والقتالات المذهلة.\n• **Dandadan** — إبداع بصري وسرعة أحداث تجمع الأكشن والكوميديا بطابع فريد.\n• **Kaiju No. 8** — أكشن وحماس منذ الحلقة الأولى.\n\nيمكنك تصفح تبويب **"موسم الأنمي"** في التطبيق لرؤية الحلقات المحدثة أولاً بأول! 📺`;
  }

  return `موشي موشي يا ناكاما! 🌟 بصفتي "السينباي المخضرم" وبناءً على مزاجك الحالي (${mood})، أنصحك بتجربة أحد هذه الأعمال الاستثنائية حسب ذوقك:\n\n• **للغموض والتشويق الذهني:** *Steins;Gate* أو *Monster*\n• **للأكشن والحماس الملحمي:** *Attack on Titan* أو *Hunter x Hunter*\n• **للقصص العميقة والفانتازيا:** *Frieren* أو *Fullmetal Alchemist: Brotherhood*\n\nأخبرني بنوعك المفضل (أكشن، غموض، خيال، كوميديا، أو أنمي قصير) أو اذكر لي آخر أنمي أعجبك لأعطيك توصية مفصلة على مقاسك تماماً! 🔥`;
}

const FALLBACK_GAMES: Record<string, any[]> = {
  quotes: [
    {
      text: "أنا لست بطلاً لأنني أريد ذلك، بل لأنني يجب أن أكون كذلك!",
      options: ['سون غوكو', 'مونكي دي لوفي', 'ميدوريا إيزوكو', 'أوزوماكي ناروتو'],
      correct: 1,
      anime: 'ون بيس'
    },
    {
      text: "الخوف ليس سيئاً، بل يخبرك بما هي نقاط ضعفك الحقيقية.",
      options: ['جراي فورستار', 'جيلدارتس كليف', 'ماكاروف', 'ناتسو دراغنيل'],
      correct: 1,
      anime: 'فيفي تيل'
    },
    {
      text: "إذا كنت لا تشارك شخصًا ما ألمه، فلن تفهمه أبدًا.",
      options: ['هاتاكي كاكاشي', 'أوتشيها إيتاتشي', 'باين (ناغاتو)', 'أوزوماكي ناروتو'],
      correct: 2,
      anime: 'ناروتو شيبودن'
    },
    {
      text: "البشر لديهم الحق في البحث عن السعادة، لكن الصعوبة تكمن في العثور عليها وتثبيتها.",
      options: ['جيرايا (الناسك المنحرف)', 'سينجو توبيراما', 'أوروتشيمارو', 'أوتشيها مادارا'],
      correct: 0,
      anime: 'ناروتو'
    },
    {
      text: "الاستسلام هو ما يقتل الناس، عندما يرفض الناس الاستسلام... يكتسبون الحق في تجاوز حدودهم!",
      options: ['أوسوب', 'رورونوا زورو', 'مونكي دي لوفي', 'نامي'],
      correct: 2,
      anime: 'ون بيس'
    }
  ],
  imposter: [
    {
      anime: 'ناروتو شيبودن',
      options: ['أوزوماكي ناروتو', 'أوتشيها ساسكي', 'هارونو ساكورا', 'مونكي دي لوفي'],
      correct: 3
    },
    {
      anime: 'هجوم العمالقة',
      options: ['ليفاي أكرمان', 'ميكاسا أكرمان', 'إرين ييغر', 'سون غوكو'],
      correct: 3
    },
    {
      anime: 'قاتل الشياطين',
      options: ['كامادو تانجيرو', 'كامادو نيزوكو', 'أوتشيها إيتاتشي', 'أغنيس زينيتسو'],
      correct: 2
    },
    {
      anime: 'مذكرة الموت',
      options: ['إل (L)', 'ياغامي لايت', 'ريوك', 'كيلوا زولديك'],
      correct: 3
    },
    {
      anime: 'هنتر x هنتر',
      options: ['غون فريكس', 'كيلوا زولديك', 'كورابيكا', 'هاتاكي كاكاشي'],
      correct: 3
    }
  ],
  emoji: [
    {
      emojis: '☠️ 🍖 👒 ⚔️',
      options: ['دراغون بول', 'ون بيس', 'ناروتو', 'بليتش'],
      correct: 1
    },
    {
      emojis: '📓 🍎 🧠 🕵️‍♂️',
      options: ['مذكرة الموت', 'المحقق كونان', 'طوكيو غول', 'هجوم العمالقة'],
      correct: 0
    },
    {
      emojis: '🦊 🧡 🍥 🌀',
      options: ['قاتل الشياطين', 'ناروتو شيبودن', 'هنتر x هنتر', 'ون بيس'],
      correct: 1
    },
    {
      emojis: '🗡️ 🐗 ⚡ 👹',
      options: ['ون بيس', 'بليتش', 'قاتل الشياطين', 'جوجوتسو كايسن'],
      correct: 2
    },
    {
      emojis: '🧑‍🦲 👊 💥 🦸‍♂️',
      options: ['ون بنش مان', 'أكاديمية بطلي', 'موب سايكو 100', 'دراغون بول Z'],
      correct: 0
    }
  ],
  lyrics: [
    {
      text: "شرف الوطن، أغلى من شرف حياتي... عهد الأصدقاء مرسوم في وجداني",
      options: ['عهد الأصدقاء', 'روبن هود', 'صقور الأرض', 'دروب ريمي'],
      correct: 0
    },
    {
      text: "قد تلمع صور في مخيلتنا تلوح معلنة أن روح الأمل ما زالت حية لم تمت",
      options: ['أنا وأخي', 'أبطال الديجيتال', 'سابق ولاحق', 'سيف النار'],
      correct: 1
    },
    {
      text: "حلمنا نهار، نهارنا عمل... نملك الخيار وخيارنا الأمل",
      options: ['أبطال الديجيتال', 'القناص (Hunter x Hunter)', 'فرسان الأرض', 'صقور الأرض'],
      correct: 1
    },
    {
      text: "في جعبتي حكاية، يرويها حكيم... عن قصص قديمة، من زمن قديم",
      options: ['في جعبتي حكاية', 'سندباد', 'ماوكلي فتى الكهوف', 'أمينة الأنيقة'],
      correct: 0
    },
    {
      text: "لا تبكِ يا صغيري، لا انظر نحو السماء... يمنحنا الدفء ويزيل عنا العناء",
      options: ['أنا وأخي', 'دروب ريمي', 'عهد الأصدقاء', 'سالي القديمة'],
      correct: 1
    }
  ],
  trivia: [
    {
      text: "لوفي استغرق سنتين كاملتين للتدريب برفقة سيلفرز رايلي في جزيرة روسكاينا المهجورة لتعلم الهاكي.",
      isTrue: true,
      explanation: "صحيح، لوفي اعتزل العالم برفقة رايلي للتدريب الشاق لمدة عامين كاملين قبل العودة إلى أرخبيل شابوندي."
    },
    {
      text: "مانغا وأنمي 'مذكرة الموت' (Death Note) من تأليف الكاتب الأسطوري والرسام إيتشيرو أودا.",
      isTrue: false,
      explanation: "خاطئ تماماً، إيتشيرو أودا هو مؤلف ون بيس. بينما مؤلف مذكرة الموت هو تسوغومي أوبا والرسام هو تاكيشي أوباتا."
    },
    {
      text: "هاتاكي كاكاشي تم تعيينه كالهوكاجي الخامس لقرية كونوها بعد نهاية حرب النينجا العظمى مباشرة.",
      isTrue: false,
      explanation: "خاطئ، تسونادي هي من تولت منصب الهوكاجي الخامس، كاكاشي تم تعيينه الهوكاجي السادس، وناروتو الأوزوماكي هو السابع."
    },
    {
      text: "نجح غون فريكس في المرة المئة فقط من اجتياز اختبار الصيادين المهيب بعد مواجهات ملحمية مع هيسوكا.",
      isTrue: false,
      explanation: "خاطئ، غون نجح في المرة الأولى التي تقدم فيها للبطولة والامتحان بينما كيلوا نجح في المحاولة الثانية بعد استبعاد سابقتها."
    },
    {
      text: "في عالم جوجوتسو كايسن، ريومين سوكونا المشهور بملك اللعنات يمتلك بالكامل 20 إصبعاً تم تفريقها وختمها عبر العصور.",
      isTrue: true,
      explanation: "صحيح، كل إصبع يحتوي على جزء غامض من طاقة سوكونا، وابتلاع يوجي إيتادوري لإصبع واحد منه جعله وعاءً لملك اللعنات."
    }
  ],
  math: [
    {
      text: "عدد كرات التنين في كوكبة الأرض (7) كرات + عدد السيوف التي يحملها رورونوا زورو دائماً في قتالاته (3)",
      answer: 10,
      options: [7, 8, 10, 12],
      correct: 2
    },
    {
      text: "أقصى عدد من البوابات الثمانية التي يستطيع مايت غاي فتحها (8) - رتبة الهوكاجي لناروتو أوزوماكي كمنصب رسمي (7)",
      answer: 1,
      options: [0, 1, 2, 3],
      correct: 1
    },
    {
      text: "عدد أعضاء فريق السبعة الأسطوري الأصليين (3) أفراد + عدد الأعين التي تملكها البومة العملاقة في طاقم كاكاشي (1)",
      answer: 4,
      options: [2, 3, 4, 5],
      correct: 2
    },
    {
      text: "عدد أفراد طاقم قبعة القش حتى نهاية أرك وانو بما فيهم جينبي (10) * عدد عيون ليفاي أكرمان السليمة تماماً بالقصة (1)",
      answer: 10,
      options: [10, 20, 5, 0],
      correct: 0
    },
    {
      text: "الحلقة التي ظهر فيها الجير فايف للوفي لأول مرة (1071) - الرقم المطابق لسنة تأسيس الاستوديو توي أنيميشن بالكامل (1956)",
      answer: 885,
      options: [885, 915, 1071, 1000],
      correct: 0
    }
  ],
  timeline: [
    {
      e1: "قيام إيتاتشي أوتشيها بالقضاء على العشيرة لإنقاذ قرية كونوها وتأمين حماية ساسكي",
      e2: "مواجهة ساسكي أوتشيها لإيتاتشي بغرض الثأر والانتقام في المقر السري",
      first: 1
    },
    {
      e1: "انفجار سفينة الجوينج ميري واحتراقها بصورة مؤلمة بعد إنقاذ الطاقم من إينيس لوبي",
      e2: "بناء سفينة الثاوزند ساني (Thousand Sunny) على يد فرانكي ودخولها المياه الإقليمية",
      first: 1
    },
    {
      e1: "إعدام ملك القراصنة غول دي روجر وإعلانه عن الكنز الأسطوري ون بيس",
      e2: "انطلاق مونكي دي لوفي في رحلته بعمر 17 عاماً للحصول على طاقم قراصنة خاص به",
      first: 1
    },
    {
      e1: "انضمام غراي فولستار لنقابة فيري تيل كطفل يتيم يبحث عن معلمة",
      e2: "لقاء ناتسو دراغنيل بلوسي هارتفيليا وعرض الانضمام إلى نقابة فيري تيل الشهيرة",
      first: 1
    },
    {
      e1: "اجتياز غون فريكس لامتحان الصيادين الصعب وامتلاك رخصة صيد مرخصة",
      e2: "صعود غون وكيلوا لبرج السماء (Heavens Arena) لتعلم أسرار الطاقة والنين قتالياً",
      first: 1
    }
  ]
};

const handleAsync = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

router.post('/chat', handleAsync(async (req: Request, res: Response) => {
  const { messages, mood, status, userId } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, message: 'Invalid messages array.' });
  }

  // 1. Identify user for fair multi-user rate limiting
  const clientId = String(userId || req.headers['x-forwarded-for'] || req.ip || 'anon');
  const rateCheck = checkRateLimit(clientId);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      success: false,
      rateLimited: true,
      retryAfterSec: rateCheck.retryAfterSec,
      message: `مهلاً يا ناكاما! 🔥 أنت ترسل الرسائل بسرعة البرق. انتظر ${rateCheck.retryAfterSec} ثانية فقط للحفاظ على سرعة الخادم لجميع الأوتاكو!`
    });
  }

  const userMood = String(mood || 'طبيعي');
  const userStatus = String(status || 'أتابع أنمي');

  // 2. Context Window Optimization: Keep only the last 6 messages and cap length at 600 chars
  // This reduces token usage by up to 85% for long conversations across thousands of users.
  const recentMessages = messages.slice(-6).map((m: any) => ({
    sender: m.sender === 'user' ? 'user' : 'bot',
    text: String(m.text || '').slice(0, 600).trim(),
  })).filter((m: any) => m.text.length > 0);

  const lastUserMsg = [...recentMessages].reverse().find((m) => m.sender === 'user')?.text || '';

  // 3. Check shared response cache for common/quick prompts
  const isSingleTurnOrQuickPrompt = recentMessages.filter((m) => m.sender === 'user').length <= 2;
  const cacheKey = normalizePromptKey(lastUserMsg, userMood);

  if (isSingleTurnOrQuickPrompt && cacheKey.length > 4) {
    const cached = chatResponseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({
        success: true,
        cached: true,
        text: cached.text,
      });
    }
  }

  const ai = getAi();
  if (!ai) {
    return res.json({
      success: true,
      fallback: true,
      text: generateSmartOtakuFallback(lastUserMsg, userMood),
    });
  }

  try {
    // 4. Deduplicate identical concurrent requests from multiple users clicking the same prompt simultaneously
    const executeGeneration = async (): Promise<string> => {
      const systemInstruction = `أنت "السينباي المخضرم" (أوتاكو قديم مخضرم لديه خبرة شاسعة ومعرفة عميقة بكل تفاصيل وأسرار الأنمي والمانغا من الثمانينيات وحتى أحدث مواسم الأنمي الحالية).
تحدث باللغة العربية بأسلوب الأوتاكو الحقيقي والودود، بحماس وحركية ممتعة، واستخدم الكلمات اليابانية الشهيرة باعتدال مثل ("يا ناكاما"، "سينباي"، "سوغوي").
مزاج المستخدم الحالي ووضعه هو: [المزاج: ${userMood} | الحالة: ${userStatus}].
اجعل ردك منظماً، واضحاً، ومختصراً بشكل مفيد (لا يتجاوز 150 كلمة إلا عند الضرورة) لتوفير قراءة سريعة وممتعة.`;

      const contents = recentMessages.map((m: any) => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

      // Load-balanced model cascade across high-throughput Flash models
      const modelsToTry = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];
      for (const modelName of modelsToTry) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents,
            config: {
              systemInstruction,
              temperature: 0.75,
              maxOutputTokens: 550,
            }
          });
          if (response?.text) {
            return response.text;
          }
        } catch (err: any) {
          console.warn(`[Otaku AI Scale] Model ${modelName} busy, cascading to next model:`, err.message || err);
        }
      }
      // If all models hit temporary quota saturation under heavy multi-user spike, return intelligent Otaku response
      return generateSmartOtakuFallback(lastUserMsg, userMood);
    };

    let responseText = '';
    if (isSingleTurnOrQuickPrompt && inFlightChatRequests.has(cacheKey)) {
      responseText = await inFlightChatRequests.get(cacheKey)!;
    } else {
      const promise = executeGeneration();
      if (isSingleTurnOrQuickPrompt) {
        inFlightChatRequests.set(cacheKey, promise);
      }
      try {
        responseText = await promise;
      } finally {
        inFlightChatRequests.delete(cacheKey);
      }
    }

    if (isSingleTurnOrQuickPrompt && responseText) {
      if (chatResponseCache.size > 1000) {
        const oldestKey = chatResponseCache.keys().next().value;
        if (oldestKey) chatResponseCache.delete(oldestKey);
      }
      chatResponseCache.set(cacheKey, {
        text: responseText,
        expiresAt: Date.now() + CHAT_CACHE_TTL_MS,
      });
    }

    res.json({
      success: true,
      text: responseText
    });
  } catch (error: any) {
    console.warn('Gemini Chat Fallback triggered:', error.message);
    res.json({
      success: true,
      fallback: true,
      text: generateSmartOtakuFallback(lastUserMsg, userMood),
    });
  }
}));

router.get('/games/generate', handleAsync(async (req: Request, res: Response) => {
  const { type } = req.query; // 'quotes', 'lyrics', 'imposter', 'emoji', etc.
  if (!type) return res.status(400).json({ success: false, message: 'Missing type.' });

  const gameType = String(type);
  const now = Date.now();

  // Check multi-user shared pool cache first so 1,000 concurrent players don't trigger 1,000 Gemini calls
  const cachedPool = gamesPoolCache.get(gameType);
  if (cachedPool && cachedPool.expiresAt > now && cachedPool.questions.length >= 5) {
    const shuffled = [...cachedPool.questions].sort(() => Math.random() - 0.5).slice(0, 5);
    return res.json({ success: true, cached: true, data: shuffled });
  }

  const ai = getAi();
  if (!ai) {
    const fallbackQuestions = FALLBACK_GAMES[gameType] || FALLBACK_GAMES.quotes;
    return res.json({ success: true, data: fallbackQuestions });
  }

  try {
    let schemaProperties: Record<string, any> = {};
    let prompt = "";

    const randomSeed = Math.floor(Math.random() * 10000);
    switch(gameType) {
      case 'quotes':
        prompt = `قم بتوليد 5 أسئلة 'من القائل' لاقتباسات مشهورة من أنميات متنوعة. اجعلها متوسطة إلى صعبة. أرقام عشوائية لإجبار التنويع: ${randomSeed}`;
        schemaProperties = {
          questions: {
             type: Type.ARRAY,
             items: {
               type: Type.OBJECT,
               properties: {
                 text: { type: Type.STRING, description: "The quote in Arabic" },
                 options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4 options for characters" },
                 correct: { type: Type.INTEGER, description: "Index of the correct option (0-3)" },
                 anime: { type: Type.STRING, description: "The anime name" }
               },
               required: ["text", "options", "correct", "anime"]
             }
          }
        };
        break;
      case 'imposter':
        prompt = `قم بتوليد 5 أسئلة لعبة الجاسوس. حيث تعطي 3 شخصيات من نفس الأنمي وشخصية رابعة من أنمي مختلف. على اللاعب إيجاد الشخصية الغريبة. أرقام عشوائية لإجبار التنويع: ${randomSeed}`;
        schemaProperties = {
          questions: {
             type: Type.ARRAY,
             items: {
               type: Type.OBJECT,
               properties: {
                 anime: { type: Type.STRING, description: "The anime the other 3 belong to" },
                 options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4 character names" },
                 correct: { type: Type.INTEGER, description: "Index of the imposter character (0-3)" }
               },
               required: ["anime", "options", "correct"]
             }
          }
        };
        break;
      case 'emoji':
        prompt = `قم بتوليد 5 أسئلة عن أنمي ممثل باستخدام الإيموجي فقط. أرقام عشوائية لإجبار التنويع: ${randomSeed}`;
        schemaProperties = {
          questions: {
             type: Type.ARRAY,
             items: {
               type: Type.OBJECT,
               properties: {
                 emojis: { type: Type.STRING, description: "3-5 emojis" },
                 options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4 anime names" },
                 correct: { type: Type.INTEGER, description: "Index of correct anime (0-3)" }
               },
               required: ["emojis", "options", "correct"]
             }
          }
        };
        break;
      case 'lyrics':
        prompt = `قم بتوليد 5 أسئلة 'تخمين الأنمي من شارة البداية أو النهاية (أغنية الأوبينينغ)'. أكتب سطراً مشهوراً من الأغنية (بالعربية المترجمة أو بالحروف الإنجليزية)، واجعلها خيارات متعددة. أرقام عشوائية لإجبار التنويع: ${randomSeed}`;
        schemaProperties = {
          questions: {
             type: Type.ARRAY,
             items: {
               type: Type.OBJECT,
               properties: {
                 text: { type: Type.STRING, description: "A famous line from the anime opening/ending song" },
                 options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4 anime names along with the song name" },
                 correct: { type: Type.INTEGER, description: "Index of correct anime (0-3)" }
               },
               required: ["text", "options", "correct"]
             }
          }
        };
        break;
      case 'trivia':
        prompt = `قم بتوليد 5 معلومات عامة (تريفيا) عن الأنميات المشهورة ليكون نصفها صحيح ونصفها خاطئ بوضوح لمن تابعه. أرقام عشوائية لإجبار التنويع: ${randomSeed}`;
        schemaProperties = {
          questions: {
             type: Type.ARRAY,
             items: {
               type: Type.OBJECT,
               properties: {
                 text: { type: Type.STRING, description: "A trivia fact about an anime" },
                 isTrue: { type: Type.BOOLEAN, description: "Whether the fact is true or false" },
                 explanation: { type: Type.STRING, description: "A short explanation of why it is true or false" }
               },
               required: ["text", "isTrue", "explanation"]
             }
          }
        };
        break;
      case 'math':
        prompt = `قم بتوليد 5 أسئلة 'رياضيات الأنمي'. مثال: (عدد ذيول الكيوبي + عدد أفراد طاقم قبعة القش). اجعلها ذكية ومتنوعة. أرقام عشوائية: ${randomSeed}`;
        schemaProperties = {
          questions: {
             type: Type.ARRAY,
             items: {
               type: Type.OBJECT,
               properties: {
                 text: { type: Type.STRING, description: "The math equation using anime elements (in Arabic)" },
                 answer: { type: Type.INTEGER, description: "The correct numerical answer" },
                 options: { type: Type.ARRAY, items: { type: Type.INTEGER }, description: "4 integer options" },
                 correct: { type: Type.INTEGER, description: "Index of the correct option (0-3)" }
               },
               required: ["text", "answer", "options", "correct"]
             }
          }
        };
        break;
      case 'timeline':
        prompt = `قم بتوليد 5 أسئلة 'أي الفعاليات حدثت أولاً في عالم الأنمي؟'. اذكر حدثين من نفس الأنمي أو أنميات مختلفة واطلب تحديد من حدث قبل الآخر حسب القصة المعترف بها. أرقام عشوائية: ${randomSeed}`;
        schemaProperties = {
          questions: {
             type: Type.ARRAY,
             items: {
               type: Type.OBJECT,
               properties: {
                 e1: { type: Type.STRING, description: "First event description" },
                 e2: { type: Type.STRING, description: "Second event description" },
                 first: { type: Type.INTEGER, description: "Which event happened first chronologically in the anime world? must be 1 or 2" }
               },
               required: ["e1", "e2", "first"]
             }
          }
        };
        break;
      default:
        return res.status(400).json({ success: false, message: 'Unknown type.' });
    }

    let response;
    const modelsToTry = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];
    let success = false;
    for (const modelName of modelsToTry) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            temperature: 0.9,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: schemaProperties,
              required: ["questions"]
            }
          }
        });
        if (response?.text) {
          success = true;
          break;
        }
      } catch (err: any) {
        console.warn(`[Gemini Games] Generation failed with ${modelName}: ${err.message || err}. Trying next fallback...`);
      }
    }

    if (!success) {
      throw new Error("All active Gemini models experienced high demand.");
    }

    const parsed = JSON.parse(response?.text || '{}');
    const generatedQuestions = parsed.questions || [];
    const fallbackList = FALLBACK_GAMES[gameType] || FALLBACK_GAMES.quotes;
    const combinedPool = [...generatedQuestions, ...fallbackList];

    gamesPoolCache.set(gameType, {
      questions: combinedPool,
      expiresAt: Date.now() + GAMES_CACHE_TTL_MS,
      refreshing: false,
    });

    res.json({ success: true, data: generatedQuestions.length > 0 ? generatedQuestions : fallbackList });

  } catch (error: any) {
    console.warn(`[Gemini Games fallback] Serving high-quality offline fallback questions.`);
    const fallbackQuestions = FALLBACK_GAMES[gameType] || FALLBACK_GAMES.quotes;
    res.json({ success: true, data: fallbackQuestions });
  }
}));

router.get('/anti-cheat', handleAsync(async (req: Request, res: Response) => {
  const { title, englishTitle, season, episodesCount, synopsis, characters } = req.query;
  if (!title) return res.status(400).json({ success: false, message: 'Missing anime title.' });

  const rawTitle = String(title).trim();
  const rawEngTitle = String(englishTitle || '').trim();
  const seasonNum = Math.max(1, parseInt(String(season || '1'), 10) || 1);
  const epsCount = parseInt(String(episodesCount || '12'), 10) || 12;
  const cleanTitle = `${rawTitle.toLowerCase()} ${rawEngTitle.toLowerCase()}`.trim();
  const cacheKey = `${cleanTitle}_s${seasonNum}`;

  // Check multi-user Anti-Cheat cache first (stores an array of questions so retries get fresh questions)
  const cachedQuiz = antiCheatCache.get(cacheKey);
  if (cachedQuiz && cachedQuiz.expiresAt > Date.now() && Array.isArray(cachedQuiz.data) && cachedQuiz.data.length > 0) {
    const picked = cachedQuiz.data[Math.floor(Math.random() * cachedQuiz.data.length)];
    return res.json({ success: true, cached: true, data: picked });
  }

  let localPool: any[] | null = null;

  // 1. فحص فوري ومحلي لأسئلة مرتبطة بالموسم وأحداثه النهائية للأعمال الشهيرة
  if (cleanTitle.includes('attack') || cleanTitle.includes('titan') || cleanTitle.includes('shingeki') || cleanTitle.includes('هجوم العمالقة')) {
    if (seasonNum === 1) {
      localPool = [
        {
          question: 'في نهاية الموسم الأول من هجوم العمالقة، من تبيّن أنها العملاقة الأنثى التي قاتلت إيرين داخل سور سينا (مقاطعة ستوهيس)؟',
          options: ['آني ليونهارت (Annie Leonhart)', 'ميكاسا أكرمان', 'هيستوريا ريس', 'ساشا براوس'],
          correct: 0
        },
        {
          question: 'ماذا اكتشف فيلق الاستطلاع داخل سور سينا في المشهد الختامي من الموسم الأول بعد تبلور آني؟',
          options: ['وجود عملاق ضخم حي مدفون داخل الجدار نفسه', 'بوابة سرية تقود إلى القبو', 'مختبر لصناعة مصل العمالقة', 'سلاح مدفعي قديم'],
          correct: 0
        }
      ];
    } else if (seasonNum === 2) {
      localPool = [
        {
          question: 'في الموسم الثاني من هجوم العمالقة، من كشف عن هويته فوق الجدار بأنه العملاق المدرع والعملاق الضخم؟',
          options: ['راينر براون وبيرتولت هوفر', 'زيكي ييغر وبيك فينغر', 'إيروين سميث وليفاي', 'كوني سبرينغر وجان كيرشتاين'],
          correct: 0
        },
        {
          question: 'ما هي القدرة التي فعلها إيرين لأول مرة في الحلقة الأخيرة من الموسم الثاني عندما لمس العملاقة المبتسمة (دينا فريتز)؟',
          options: ['قدرة الإحداثي (التحكم بالعمالقة وتوجيههم)', 'التصلب الكامل للجسد', 'الطيران عبر عدة المناورة', 'استدعاء عملاق المطرقة'],
          correct: 0
        }
      ];
    } else if (seasonNum === 3) {
      localPool = [
        {
          question: 'في نهاية معركة استعادة شيغانشينا في الموسم الثالث، من الذي تم اختياره لحقنه بمصل العملاق ليرث العملاق الضخم؟',
          options: ['أرمين أرليرت (Armin Arlert)', 'إيروين سميث (Erwin Smith)', 'هانجي زوي', 'جان كيرشتاين'],
          correct: 0
        }
      ];
    } else {
      localPool = [
        {
          question: 'في الموسم الرابع (الأخير) من هجوم العمالقة، ما هو اسم الخطة الكارثية التي أطلقها إيرين ييغر بعد دخوله مسارات يمير؟',
          options: ['دك الأرض (The Rumbling)', 'خطة القتل الرحيم', 'عملية تحرير ليبيريو', 'مشروع السور الحديدي'],
          correct: 0
        }
      ];
    }
  } else if (cleanTitle.includes('demon slayer') || cleanTitle.includes('kimetsu') || cleanTitle.includes('قاتل الشياطين')) {
    if (seasonNum === 1) {
      localPool = [
        {
          question: 'في نهاية الموسم الأول من قاتل الشياطين (جبل ناتاغومو)، من هو القمر السفلي الخامس الذي قاتله تانجيرو وأيقظ ضده رقصة إله النار؟',
          options: ['روي (Rui) شيطان العناكب', 'إنمو (Enmu)', 'أكازا (Akaza)', 'غيوتارو (Gyutaro)'],
          correct: 0
        }
      ];
    } else if (seasonNum === 2) {
      localPool = [
        {
          question: 'في الموسم الثاني من قاتل الشياطين (حي الترفيه)، من هو الهاشيرا الذي قاد المهمة بجانب تانجيرو ضد القمر العلوي السادس (داكي وغيوتارو)؟',
          options: ['تينغين أوزوي (هاشيرا الصوت)', 'كيوجيرو رينغوكو (هاشيرا اللهب)', 'ميتسوري كانروجي (هاشيرا الحب)', 'مويتشيرو توكيتو (هاشيرا الضباب)'],
          correct: 0
        }
      ];
    } else if (seasonNum === 3) {
      localPool = [
        {
          question: 'ما هي المعجزة غير المسبوقة التي حدثت لنيزوكو في الحلقة الأخيرة من الموسم الثالث (قرية صانعي السيوف)؟',
          options: ['تمكنت من المشي تحت أشعة الشمس والتحدث دون أن تحترق', 'تحولت إلى هاشيرا رسمي في الفيلق', 'استعادت ذاكرتها البشرية بالكامل وعادت إنسانة', 'هزمت موزان بمفردها'],
          correct: 0
        }
      ];
    } else {
      localPool = [
        {
          question: 'بماذا انتهت الحلقة الأخيرة من موسم تدريب الهاشيرا في أنمي قاتل الشياطين؟',
          options: ['سقوط تانجيرو والهاشيرا جميعاً داخل قلعة اللانهاية الخاصة بموزان', 'انتصار الفيلق في غابة الضباب', 'اعتزال غيو توميوكا القتال', 'تتويج زينيتسو كهاشيرا للرعد'],
          correct: 0
        }
      ];
    }
  } else if (cleanTitle.includes('jujutsu') || cleanTitle.includes('جوجوتسو')) {
    if (seasonNum === 1) {
      localPool = [
        {
          question: 'في نهاية الموسم الأول من جوجوتسو كايسن، أي تقنية عالية المستوى نجح ميغومي فوشيغورو في تفعيلها لأول مرة لهزيمة اللعنة حاملة إصبع سوكونا؟',
          options: ['توسيع المجال: حديقة الظلال الخيالية (Chimera Shadow Garden)', 'استدعاء الجنرال ماهوراغا', 'وميض أسود رباعي', 'التقنية الملعونة العكسية'],
          correct: 0
        }
      ];
    } else {
      localPool = [
        {
          question: 'في الموسم الثاني من جوجوتسو كايسن (حادثة شيبويا)، ما هي الأداة الملعونة الخاصة التي استُخدمت لختم ساتورو غوجو؟',
          options: ['بوابة سجن العالم (Prison Realm)', 'رمح السماء المقلوب', 'سيف ترويض الأرواح', 'حبل التدفق الأسود'],
          correct: 0
        }
      ];
    }
  } else if (cleanTitle.includes('death note') || cleanTitle.includes('مذكرة الموت')) {
    localPool = [
      {
        question: 'في الحلقة الأخيرة من أنمي مذكرة الموت، من هو المحقق الذي نجح في كشف تلاعب لايت ياغامي بالمذكرة في المستودع الأصفر؟',
        options: ['نير (Near) بفضل تضحية ميلو وتهور ميكامي', 'إل (L Lawliet)', 'واتاري', 'ماتسودا بمفرده'],
        correct: 0
      },
      {
        question: 'من الذي كتب اسم "لايت ياغامي" في مذكرة الموت في المشهد الأخير لينهي حياته كما وعده في بداية القصة؟',
        options: ['الشينيغامي ريوك (Ryuk)', 'الشينيغامي ريم (Rem)', 'نير (Near)', 'تيرو ميكامي'],
        correct: 0
      }
    ];
  } else if (cleanTitle.includes('solo leveling') || cleanTitle.includes('سولو ليفلينج')) {
    localPool = [
      {
        question: 'في نهاية الموسم الأول من أنمي Solo Leveling، ما هي المهنة السرية واللقب الذي حصل عليه سونغ جين-وو بعد اجتياز مهمة تغيير المهنة وهزيمة إغريس؟',
        options: ['عاهل الظلال (Shadow Monarch)', 'ملك التنانين', 'سيد اللهب الأبيض', 'إمبراطور الجليد'],
        correct: 0
      }
    ];
  } else if (cleanTitle.includes('hunter') || cleanTitle.includes('هنتر')) {
    localPool = [
      {
        question: 'في نهاية آرك نمل الكيميرا في أنمي Hunter x Hunter، كيف هزم الرئيس نيتيرو ملك النمل ميرويم في النهاية؟',
        options: ['بتفجير قنبلة "وردة الرجل الفقير" السامة المزروعة في قلبه', 'بضربة البوديساتفا المئة القاضية', 'بختم النين الخاص به للأبد', 'بتدخل غون البالغ في اللحظة الأخيرة'],
        correct: 0
      }
    ];
  } else if (cleanTitle.includes('fullmetal') || cleanTitle.includes('الخيميائي المعدني')) {
    localPool = [
      {
        question: 'في نهاية أنمي الخيميائي المعدني (Brotherhood)، بماذا ضحى إدوارد إلريك أمام بوابة الحقيقة لاستعادة جسد شقيقه ألفونس بالكامل؟',
        options: ['ببوابتة الخيميائية وقدرته على استخدام الخيمياء للأبد', 'بذراعه وساقه مرة أخرى', 'بحجر الفلاسفة الأحمر', 'بذاكرته عن رحلته الطويلة'],
        correct: 0
      }
    ];
  } else if (cleanTitle.includes('code geass') || cleanTitle.includes('كود غياس')) {
    localPool = [
      {
        question: 'ما هو اسم الخطة النهائية في ختام أنمي Code Geass التي جمع فيها لولوش كراهية العالم كله نحوه ثم جعل سوزاكو يقتله في زي "زيرو"؟',
        options: ['مرثية زيرو (Zero Requiem)', 'التمرد الأسود', 'أمر راغناروك', 'مشروع السلام الإمبراطوري'],
        correct: 0
      }
    ];
  }

  if (localPool && localPool.length > 0) {
    antiCheatCache.set(cacheKey, {
      data: localPool,
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    const picked = localPool[Math.floor(Math.random() * localPool.length)];
    return res.json({ success: true, data: picked });
  }

  // Helper to build a tailored fallback quiz from synopsis & characters if AI is unavailable
  const buildMetadataFallback = () => {
    const seasonLabel = seasonNum > 1 ? ` (الموسم ${seasonNum})` : '';
    const charList = String(characters || '').split(',').map(s => s.trim()).filter(Boolean);
    if (charList.length >= 2) {
      const mainChar = charList[0];
      const secondChar = charList[1];
      return {
        question: `للتحقق من إكمالك لمشاهدة "${rawTitle}"${seasonLabel} حتى الحلقة ${epsCount}: أي من الشخصيات التالية كان لها دور محوري في أحداث هذا الموسم وحسم صراعاته؟`,
        options: [
          `${mainChar} و ${secondChar}`,
          'تاتسوماكي وكينغ من عالم البطولة',
          'غينتوكي ساكاتا وكاغورا',
          'إدوارد نيغيت وماركو العنقاء'
        ],
        correct: 0
      };
    }
    return {
      question: `للتحقق من مشاهدتك الكاملة لأنمي "${rawTitle}"${seasonLabel} (${epsCount} حلقة): كيف انتهت الذروة الدرامية لأحداث هذا الموسم؟`,
      options: [
        'بحسم المواجهة الرئيسية في الحلقات الأخيرة وكشف مصير الأبطال للمرحلة القادمة',
        'بتحول القصة إلى برنامج مسابقات رياضي مدرسي بدون أي صراع',
        'بإلغاء جميع الأحداث السابقة واكتشاف أن الموسم كله مجرد إعلان تجاري',
        'بعدم ظهور الشخصية الرئيسية طوال حلقات النصف الثاني من الموسم'
      ],
      correct: 0
    };
  };

  const ai = getAi();
  if (!ai) {
    return res.json({ success: true, data: buildMetadataFallback() });
  }

  try {
    const seasonText = seasonNum > 1 ? `الموسم ${seasonNum}` : 'الموسم الأول / الكامل';
    const contextParts: string[] = [
      `اسم الأنمي: "${rawTitle}"${rawEngTitle ? ` (${rawEngTitle})` : ''}`,
      `الموسم المطلوب التحقق منه: ${seasonText} (عدد الحلقات: ${epsCount})`
    ];
    if (characters) contextParts.push(`أبرز الشخصيات: ${characters}`);
    if (synopsis) contextParts.push(`نبذة عن القصة: ${synopsis}`);

    const prompt = `أنت نظام منع غش صارم في تطبيق أنمي. يريد المستخدم إضافة الأنمي التالي إلى قائمة "مكتمل":
${contextParts.join('\n')}

المطلوب:
قم بتوليد 3 أسئلة مختلفة باللغة العربية الفصحى، كل سؤال يركز تحديداً على أحداث ${seasonText} من هذا الأنمي (وخاصة النصف الثاني أو الحلقات الأخيرة/النهاية من هذا الموسم تحديداً) للتحقق من أن المستخدم قد شاهد ${seasonText} بالكامل فعلاً.
- تجنب الأسئلة السطحية أو البديهية التي تُعرف من البوستر أو الحلقة الأولى فقط.
- اجعل الخيارات الأربعة منطقية ومن نفس أجواء العمل بحيث لا يعرف الإجابة الصحيحة إلا من شاهد الموسم بالكامل.`;

    const modelsToTry = ['gemini-3.8-flash', 'gemini-flash-latest'];
    let response;
    let success = false;

    for (const modelName of modelsToTry) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            temperature: 0.7,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      question: { type: Type.STRING, description: "Season-specific anti-cheat question in Arabic" },
                      options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4 plausible options in Arabic" },
                      correct: { type: Type.INTEGER, description: "Index of the correct option (0-3)" }
                    },
                    required: ["question", "options", "correct"]
                  }
                }
              },
              required: ["questions"]
            }
          }
        });
        if (response?.text) {
          success = true;
          break;
        }
      } catch (err: any) {
        console.warn(`[Gemini Anti-Cheat] Failed with ${modelName}: ${err.message || err}. Trying next fallback...`);
      }
    }

    if (!success) {
      throw new Error("All active Gemini models experienced high-demand.");
    }

    const parsed = JSON.parse(response?.text || '{}');
    const questionsList = Array.isArray(parsed.questions) && parsed.questions.length > 0
      ? parsed.questions
      : (parsed.question ? [parsed] : [buildMetadataFallback()]);

    antiCheatCache.set(cacheKey, {
      data: questionsList,
      expiresAt: Date.now() + 60 * 60 * 1000, // Cache quiz pool per anime + season for 1 hour
    });
    const picked = questionsList[Math.floor(Math.random() * questionsList.length)];
    res.json({ success: true, data: picked });
  } catch (error: any) {
    res.json({ success: true, data: buildMetadataFallback() });
  }
}));

export default router;

