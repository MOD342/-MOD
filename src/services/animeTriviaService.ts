import { 
  collection, addDoc, getDocs, query, where, limit, 
  serverTimestamp, doc, updateDoc, increment, writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { TriviaQuestion } from '../models/TriviaQuestion';

// Shuffling helper
const shuffleArray = <T>(arr: T[]): T[] => {
  const newArr = [...arr];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

// Exceptional, authentic Anime trivia pool
export const SEED_TRIVIA_QUESTIONS: Omit<TriviaQuestion, 'createdAt'>[] = [
  {
    question: "من هو صانع السيوف الأسطوري الذي قام بنحت 'وادو إيتشيمونجي' و'إنما' في ون بيس؟",
    options: ["تنجو كوتيتسو", "شيموتسوكي كوزابورو", "كيوشيرو", "هيتيتسو"],
    correctIndex: 1,
    animeName: "One Piece",
    difficulty: "medium",
    author: "إدارة الفيلق 🛡️",
    likes: 5,
    dislikes: 0
  },
  {
    question: "ما هو الاسم الحقيقي للعميد 'إل' (L) في أنمي مذكرة الموت (Death Note)؟",
    options: ["إل ريوزاكي", "نات ريفر", "إل لولايت", "ميلو"],
    correctIndex: 2,
    animeName: "Death Note",
    difficulty: "easy",
    author: "أوتوكو محقق 🔍",
    likes: 8,
    dislikes: 0
  },
  {
    question: "ما هو اسم السيف الخاص بالشخصية 'رورونوا زورو' والمصنف كأوه-وازامونو (خنجر ذو مظهر أسود) وحصل عليه كنصف إرث؟",
    options: ["شوشوي", "وادو إيتشيمونجي", "يوباشيري", "ساندائي كيتيتسو"],
    correctIndex: 0,
    animeName: "One Piece",
    difficulty: "medium",
    author: "سياف الغسق ⚔️",
    likes: 12,
    dislikes: 1
  },
  {
    question: "في هجوم العمالقة، ما هو الاسم الحقيقي لعملاق الفك الذي ورثه فالكو غريس؟",
    options: ["بوركو غاليارد", "مارسيل غاليارد", "يومير", "العملاق الفك الأجنح"],
    correctIndex: 0,
    animeName: "Attack on Titan",
    difficulty: "hard",
    author: "فيلق الاستطلاع 🏹",
    likes: 15,
    dislikes: 0
  },
  {
    question: "ما نوع تشاكر النصل والنين لمدرب كورايبكا (كورابيكا) عندما تصبح عيناه قرمزية بالكامل؟",
    options: ["تجسيد", "تحويل", "متخصص", "تعزيز"],
    correctIndex: 2,
    animeName: "Hunter x Hunter",
    difficulty: "easy",
    author: "حكيم كونوها 🍃",
    likes: 9,
    dislikes: 2
  },
  {
    question: "ما هي الجملة أو الكلمة السحرية التي يطلقها بطل القصة 'سينكّو' لبدء التنشيط العلمي في أنمي دكتور ستون؟",
    options: ["بنسبة 10 مليار بالمئة", "العلم سينتصر دائماً", "هذا غير منطقي علمياً", "تمت محاكاة المعادلة"],
    correctIndex: 0,
    animeName: "Dr. Stone",
    difficulty: "easy",
    author: "أكاديمي العلوم 🧬",
    likes: 6,
    dislikes: 0
  },
  {
    question: "في بليتش، من هو الأقوى المرتبة صفر في منظمة الإيسبادا المدمرة؟",
    options: ["كويوت ستارك", "يامي رياجو", "أولكيورا تسيفر", "باراغان لويزنبرن"],
    correctIndex: 1,
    animeName: "Bleach",
    difficulty: "hard",
    author: "ملك الأرواح ☠️",
    likes: 10,
    dislikes: 1
  },
  {
    question: "كم عدد البوابات الداخلية التي قام مايت غاي بفتحها بالكامل في معركته الأسطورية ضد مادارا أوتشيها؟",
    options: ["سبع بوابات", "ثماني بوابات", "ست بوابات", "خمس بوابات"],
    correctIndex: 1,
    animeName: "Naruto Shippuden",
    difficulty: "easy",
    author: "الوحش الأخضر 🛡️",
    likes: 11,
    dislikes: 0
  },
  {
    question: "في بلاك كلوفر، ما هو اسم الشليطر السري والوجه الشيطاني الحقيقي المحبوس داخل كتاب تعاويذ أستا ذو الخمس نفات؟",
    options: ["ليبي", "زاغريد", "ميغيكيولا", "لوسيفر"],
    correctIndex: 0,
    animeName: "Black Clover",
    difficulty: "medium",
    author: "ساحر القرن 🔥",
    likes: 7,
    dislikes: 1
  },
  {
    question: "ما هو اسم السحر الشرير والتقنية التوسعية الإقليمية الخاصة بملك اللعنات 'سوكونا' في جوجوتسو كايسن؟",
    options: ["ضريح السوء (Malevolent Shrine)", "الفراغ اللانهائي", "تابوت جبل الحديد", "حديقة الظل الخيمية"],
    correctIndex: 0,
    animeName: "Jujutsu Kaisen",
    difficulty: "medium",
    author: "سحرة كوتو 🧬",
    likes: 14,
    dislikes: 0
  },
  {
    question: "من هو قائد الفرقة الأولى في غوتي 13 بعد وفاة ياماموتو جينريوساي في بليتش؟",
    options: ["كيوراكو شونسوي", "كوتشيكي بياكويا", "زاراكي كينباتشي", "هيتسوغايا توشيرو"],
    correctIndex: 0,
    animeName: "Bleach",
    difficulty: "medium",
    author: "مجلس الـ 46 🛡️",
    likes: 18,
    dislikes: 0
  },
  {
    question: "ما هي القدرة الحقيقية لـ مانجيكيو شارينغان الخاصة بشيسوي أوتشيها في ناروتو؟",
    options: ["كوتواماتسوكامي", "أوماتيراسو", "كاموي", "إيزاناغي"],
    correctIndex: 0,
    animeName: "Naruto Shippuden",
    difficulty: "medium",
    author: "عين الوهم 👁️",
    likes: 22,
    dislikes: 1
  },
  {
    question: "في أنمي هجوم العمالقة، من هو البطل الذي قتل العملاق المطرقة وحصل على قوته؟",
    options: ["إيرين ييغر", "ميكاسا أكرمان", "أرمين أرليرت", "ليفاي أكرمان"],
    correctIndex: 0,
    animeName: "Attack on Titan",
    difficulty: "easy",
    author: "الحرية للعمالقة 🕊️",
    likes: 25,
    dislikes: 0
  },
  {
    question: "ما هو اسم الشيطان الذي عقد معه دنجي عقداً في أنمي رجل المنشار (Chainsaw Man)؟",
    options: ["بوتشيتا", "كوراما", "سوكونا", "شينيغامي"],
    correctIndex: 0,
    animeName: "Chainsaw Man",
    difficulty: "easy",
    author: "صائدو الشياطين 🪚",
    likes: 19,
    dislikes: 0
  },
  {
    question: "في هانتر x هانتر، ما هي فئة النين التي ينتمي إليها بطل القصة غون فريكس؟",
    options: ["التعزيز", "التحويل", "التجسيد", "التخصص"],
    correctIndex: 0,
    animeName: "Hunter x Hunter",
    difficulty: "easy",
    author: "رابطة الصيادين 🎣",
    likes: 15,
    dislikes: 0
  },
  {
    question: "ما هي الهوية الحقيقية للخادم 'آرتشر' في أنمي مصير/بقاء الليل (Fate/stay night)؟",
    options: ["إيميا شيرو (المستقبلي)", "غيلغاميش", "كيريتسوغو", "كوتوميني كيري"],
    correctIndex: 0,
    animeName: "Fate Series",
    difficulty: "hard",
    author: "فارس الفجر ⚔️",
    likes: 14,
    dislikes: 1
  },
  {
    question: "في مذكرة الموت، ما هو الطعام المفضل للشينيغامي ريوك؟",
    options: ["التفاح", "الشوكولاتة", "الرامن", "السوشي"],
    correctIndex: 0,
    animeName: "Death Note",
    difficulty: "easy",
    author: "العالم الجديد 🍎",
    likes: 31,
    dislikes: 0
  },
  {
    question: "ما اسم الأكاديمية البطلة التي يدرس فيها إيزوكو ميدوريا في أنمي أكاديميتي للأبطال؟",
    options: ["أكاديمية UA", "أكاديمية شينبي", "مدرسة كونوها", "أكاديمية السحر"],
    correctIndex: 0,
    animeName: "My Hero Academia",
    difficulty: "easy",
    author: "رمز السلام 🦸‍♂️",
    likes: 16,
    dislikes: 0
  },
  {
    question: "في قاتل الشياطين، ما هو اسم تنفس تانجيرو كامادو الأساسي الذي ورثه عن عائلته؟",
    options: ["رقصة إله النار (هينوكامي كاغورا)", "تنفس الماء", "تنفس الرعد", "تنفس الشمس"],
    correctIndex: 0,
    animeName: "Demon Slayer",
    difficulty: "medium",
    author: "فيلق قاتلي الشياطين 🗡️",
    likes: 24,
    dislikes: 1
  },
  {
    question: "ما هي المكافأة الأولى التي وضعت على رأس لوفي في ون بيس؟",
    options: ["30 مليون بيري", "15 مليون بيري", "50 مليون بيري", "100 مليون بيري"],
    correctIndex: 0,
    animeName: "One Piece",
    difficulty: "easy",
    author: "البحرية العالمية ⚓",
    likes: 27,
    dislikes: 0
  },
  {
    question: "من هي الشخصية التي تلقب بـ 'ملك الذباب' أو 'نائب لوسيفر' في بلاك كلوفر؟",
    options: ["بيلزيبوب", "لوسيفر", "ميغيكيولا", "أديراميليك"],
    correctIndex: 0,
    animeName: "Black Clover",
    difficulty: "hard",
    author: "قادة الفرسان السحرة 🧙‍♂️",
    likes: 11,
    dislikes: 2
  },
  {
    question: "في كود غياس، ما هي القوة المطلقة التي منحتها سي سي لـ لولوش لامبروج؟",
    options: ["الغياس (الإطاعة المطلقة)", "الشارينغان", "التخاطر الأثيري", "التحريك الذهني"],
    correctIndex: 0,
    animeName: "Code Geass",
    difficulty: "easy",
    author: "قائد الفرسان السود 🎭",
    likes: 20,
    dislikes: 0
  },
  {
    question: "ما هي اللعبة اللوحية الأسطورية التي كان يلعبها ميرويم مع كوموغي في هانتر x هانتر؟",
    options: ["غونغي", "الشوجي", "الغو", "الشطرنج"],
    correctIndex: 0,
    animeName: "Hunter x Hunter",
    difficulty: "medium",
    author: "أوصياء العرش 👑",
    likes: 29,
    dislikes: 0
  },
  {
    question: "في قاتل الشياطين، كم عدد عيون كوكوشيبو (القمة الأولى من الأقمار الاثني عشر)؟",
    options: ["6 عيون", "4 عيون", "2 عينان", "8 عيون"],
    correctIndex: 0,
    animeName: "Demon Slayer",
    difficulty: "medium",
    author: "القمم الشيطانية 💀",
    likes: 18,
    dislikes: 1
  },
  {
    question: "في دراغون بول، ما هو اسم الكوكب الأصلي الذي ينتمي إليه غوكو وفيجيتا؟",
    options: ["كوكب فيجيتا", "كوكب ناميك", "كوكب الأرض", "كوكب سادالا"],
    correctIndex: 0,
    animeName: "Dragon Ball Z",
    difficulty: "easy",
    author: "سوبر سايان الأزرق 🐒",
    likes: 23,
    dislikes: 0
  },
  {
    question: "من هو الوحش المحبوس داخل غارا (محب الرمل) في ناروتو شيبودن؟",
    options: ["شوكاكو (ذو الذيل الواحد)", "كوراما (ذو الذيول التسعة)", "ماتاتابي (ذو الذيلين)", "غيوكي (ذو الذيول الثمانية)"],
    correctIndex: 0,
    animeName: "Naruto Shippuden",
    difficulty: "easy",
    author: "رياح الرمال 🌪️",
    likes: 15,
    dislikes: 0
  },
  {
    question: "ما هو اسم السحر المحرم الذي استخدمه إدوارد وألفونس إلريك لإعادة والدتهما في كيميائي المعادن الكامل؟",
    options: ["التحويل البشري", "الكيمياء الحيوية", "حجر الفلاسفة", "سحر الأرواح"],
    correctIndex: 0,
    animeName: "Fullmetal Alchemist",
    difficulty: "easy",
    author: "الكيميائي الفولاذي ⚙️",
    likes: 26,
    dislikes: 0
  },
  {
    question: "ما هو الاسم الحقيقي للعملاق الأسطوري الذي يمتلكه أرمين أرليرت في هجوم العمالقة؟",
    options: ["العملاق الضخم", "العملاق المدرع", "العملاق المهاجم", "العملاق الأنثى"],
    correctIndex: 0,
    animeName: "Attack on Titan",
    difficulty: "easy",
    author: "حماة الأسوار 🛡️",
    likes: 17,
    dislikes: 0
  },
  {
    question: "في أنمي جوجوتسو كايسن، ما هي التقنية اللانهائية لـ ساتورو غوجو التي تبطئ الأشياء كلما اقتربت منه؟",
    options: ["اللانهاية (Infinity)", "الأرجواني الجوفي", "الأزرق الجاذب", "الأحمر الطارد"],
    correctIndex: 0,
    animeName: "Jujutsu Kaisen",
    difficulty: "medium",
    author: "عائلة غوجو الأثرية 🧿",
    likes: 28,
    dislikes: 0
  },
  {
    question: "من هو مؤلف مانجا ون بيس الأسطورية والأكثر مبيعاً في التاريخ؟",
    options: ["إييتشيرو أودا", "ماساشي كيشيموتو", "تايت كوبو", "هاجيمي إيساياما"],
    correctIndex: 0,
    animeName: "One Piece",
    difficulty: "easy",
    author: "إدارة الفيلق 🛡️",
    likes: 35,
    dislikes: 0
  },
  {
    question: "في بليتش، ما هو اسم الزانباكتو الخاص بالقائد زاراكي كينباتشي بعد أن سمعه أخيراً؟",
    options: ["نوزاراشي", "زابيمارو", "هوزيمارو", "سينبونزاكورا"],
    correctIndex: 0,
    animeName: "Bleach",
    difficulty: "hard",
    author: "الفرقة الحادية عشرة 💀",
    likes: 19,
    dislikes: 0
  },
  {
    question: "ما هو اللقب الحقيقي الممنوح لـ ميتسوري كانروجي في قاتل الشياطين كعامود؟",
    options: ["هاشيرا الحب", "هاشيرا الماء", "هاشيرا الحشرات", "هاشيرا الأفعى"],
    correctIndex: 0,
    animeName: "Demon Slayer",
    difficulty: "easy",
    author: "عشاق الأنمي 🌸",
    likes: 16,
    dislikes: 0
  },
  {
    question: "في أنمي جينتاما، ما هو اسم الكلب الضخم الأليف والروحي التابع لليوروزويا؟",
    options: ["ساداهارو", "إليزابيث", "جاست تانك", "كوتارو"],
    correctIndex: 0,
    animeName: "Gintama",
    difficulty: "medium",
    author: "مكتب ساموراي الفضة 🐾",
    likes: 21,
    dislikes: 0
  },
  {
    question: "من هو العضو الأول الذي انضم لطاقم قبعة القش بعد القائد لوفي في ون بيس؟",
    options: ["رورونوا زورو", "نامي", "أوسوب", "سانجي"],
    correctIndex: 0,
    animeName: "One Piece",
    difficulty: "easy",
    author: "طواقم قبعة القش 🏴‍☠️",
    likes: 33,
    dislikes: 0
  },
  {
    question: "في البرسيرك (Berserk)، ما هو اسم السيف الضخم والعملاق الذي يقاتل به غاتس لتدمير الشياطين؟",
    options: ["قاتل التنانين (Dragon Slayer)", "نصل الجحيم", "سيف الغسق", "سيف الخطيئة"],
    correctIndex: 0,
    animeName: "Berserk",
    difficulty: "medium",
    author: "مبارزو الظل ⚔️",
    likes: 24,
    dislikes: 1
  },
  {
    question: "ما هو اسم المنظمة السرية الثورية التي يقودها لولوش لامبروج في كود غياس؟",
    options: ["الفرسان السود", "منظمة عين الصقر", "الفيلق الإمبراطوري", "منظمة الأكاتسكي"],
    correctIndex: 0,
    animeName: "Code Geass",
    difficulty: "easy",
    author: "الثورة الأبدية 🎭",
    likes: 18,
    dislikes: 0
  },
  {
    question: "ما هو اسم الوحش ذو العيون الزرقاء والجسد الأبيض الأسطوري المفضل لستو كايبا في يوغي يو؟",
    options: ["تنين عيون زرقاء بيضاء", "تنين أحمر العينين الأسود", "فارس الظلام", "العملاق المعذب"],
    correctIndex: 0,
    animeName: "Yu-Gi-Oh!",
    difficulty: "easy",
    author: "مبارزو مبارزة الوحوش 🃏",
    likes: 22,
    dislikes: 0
  },
  {
    question: "في طوكيو غول، ما هو اسم المقهى والملجأ السري للغيلان الصديقة التي كان يعمل بها كانيكي؟",
    options: ["الأنتيك (Anteiku)", "الأستوريا", "غول كافيه", "طوكيو ريفنجرز"],
    correctIndex: 0,
    animeName: "Tokyo Ghoul",
    difficulty: "easy",
    author: "بومة الغسق ☕",
    likes: 29,
    dislikes: 0
  },
  {
    question: "من هو الخائن الأكبر في غوتي 13 الذي سرق الهوجيوكو وهرب إلى الهويكو موندو في بليتش؟",
    options: ["آيزن سوسكي", "إيتشيمارو جين", "توسين كانامي", "أوراهارا كيسكي"],
    correctIndex: 0,
    animeName: "Bleach",
    difficulty: "easy",
    author: "قادة غوتي 💀",
    likes: 34,
    dislikes: 1
  }
];

/**
 * Fetch trivia questions filtered by difficulty.
 * Supports background automatic seeding if empty, and falls back to seeds.
 */
export async function getTriviaQuestions(difficulty: 'easy' | 'medium' | 'hard', user: any = null): Promise<TriviaQuestion[]> {
  try {
    const q = query(
      collection(db, 'animeTrivia'),
      where('difficulty', '==', difficulty),
      limit(20)
    );
    const snap = await getDocs(q);
    const results: TriviaQuestion[] = [];
    
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data) {
        results.push({
          id: docSnap.id,
          question: data.question,
          options: data.options,
          correctIndex: data.correctIndex,
          animeName: data.animeName,
          difficulty: data.difficulty,
          author: data.author || 'الذكاء الاصطناعي 🛡️',
          likes: data.likes || 0,
          dislikes: data.dislikes || 0,
          createdAt: data.createdAt
        });
      }
    });

    // If Firestore does not have questions, automatically seed in background and return fallback shuffled
    if (results.length === 0) {
      console.log(`[TriviaService] No trivia in db for difficulty '${difficulty}'. Seeding standard questions...`);
      if (user) {
        seedAndCacheQuestions();
      }
      const filteredSeeds = SEED_TRIVIA_QUESTIONS.filter(q => q.difficulty === difficulty);
      return shuffleArray(filteredSeeds.length > 0 ? filteredSeeds : SEED_TRIVIA_QUESTIONS) as TriviaQuestion[];
    }

    return shuffleArray(results);
  } catch (error) {
    console.warn("[TriviaService] Failed to load trivia questions from Firestore:", error);
    const filteredSeeds = SEED_TRIVIA_QUESTIONS.filter(q => q.difficulty === difficulty);
    return shuffleArray(filteredSeeds.length > 0 ? filteredSeeds : SEED_TRIVIA_QUESTIONS) as TriviaQuestion[];
  }
}

/**
 * Seed Firestore in batches with initial questions
 */
export async function seedAndCacheQuestions() {
  try {
    const checkSnap = await getDocs(query(collection(db, 'animeTrivia'), limit(1)));
    if (!checkSnap.empty) return; // already seeded

    const batch = writeBatch(db);
    SEED_TRIVIA_QUESTIONS.forEach((q) => {
      const docRef = doc(collection(db, 'animeTrivia'));
      batch.set(docRef, {
        ...q,
        createdAt: serverTimestamp()
      });
    });
    await batch.commit();
    console.log("[TriviaService] Seeding of high-quality anime trivia complete.");
  } catch (error) {
    console.warn("[TriviaService] Seeding failed: ", error);
  }
}

/**
 * Submit user contributed Trivia question
 */
export async function submitTriviaQuestion(
  questionData: Omit<TriviaQuestion, 'createdAt' | 'likes' | 'dislikes'>,
  userId: string,
  username: string
): Promise<boolean> {
  try {
    await addDoc(collection(db, 'animeTrivia'), {
      question: questionData.question,
      options: questionData.options,
      correctIndex: questionData.correctIndex,
      animeName: questionData.animeName,
      difficulty: questionData.difficulty,
      author: username || 'الأوتوكو المساهم ⚔️',
      likes: 0,
      dislikes: 0,
      createdAt: serverTimestamp()
    });

    // Reward user with coins, mod points, and xp
    try {
      await updateDoc(doc(db, 'users', userId), {
        coins: increment(20), // 20 coins reward for high-fidelity trivia contributor!
        xp: increment(40),
        modPoints: increment(5)
      });
    } catch (err) {
      console.warn("Contributor reward update failed:", err);
    }

    return true;
  } catch (error) {
    console.error("[TriviaService] Failed to submit trivia question:", error);
    return false;
  }
}

/**
 * Vote on a trivia question quality
 */
export async function voteTriviaQuestion(questionId: string, isLike: boolean): Promise<void> {
  if (!questionId) return;
  try {
    await updateDoc(doc(db, 'animeTrivia', questionId), {
      [isLike ? 'likes' : 'dislikes']: increment(1)
    });
  } catch (err) {
    console.warn("[TriviaService] Voting on trivia question failed:", err);
  }
}
