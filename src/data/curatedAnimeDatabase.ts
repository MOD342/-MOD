// قاعدة بيانات الأنميات الحديثة - لضمان أحدث الحلقات وأسماء الأنمي الصافية
export interface CuratedAnime {
  mal_id: number;
  title: string;
  title_english: string;
  posterUrl: string;
  bannerUrl?: string;
  rating: number;
  genres: string[];
  status: string;
  episodes: number;
  latestEpisode: number;
  synopsis: string;
  releaseYear: string;
  season: string;
  broadcastDay: string;
}

export const CURATED_ANIME_LIST: CuratedAnime[] = [
  {
    mal_id: 21,
    title: "One Piece",
    title_english: "One Piece",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-wf37VakJmZqs.jpg",
    rating: 9.2,
    genres: ["أكشن", "مغامرات", "فانتازيا"],
    status: "مستمر",
    episodes: 1200,
    latestEpisode: 1180,
    synopsis: "مغامرات مونكي دي لوفي وقراصنة قبعة القش في رحلتهم الأسطورية للبحث عن كنز ون بيس الأعظم ليصبح لوفي ملك القراصنة القادم.",
    releaseYear: "1999",
    season: "fall",
    broadcastDay: "sunday"
  },
  {
    mal_id: 59193,
    title: "Mushoku Tensei: Jobless Reincarnation Season 3",
    title_english: "Mushoku Tensei: Jobless Reincarnation Season 3",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx166873-fN3e686l5N6a.jpg",
    rating: 9.0,
    genres: ["فانتازيا", "إيسيكاي", "دراما"],
    status: "مستمر",
    episodes: 24,
    latestEpisode: 14,
    synopsis: "يواصل روديوس غريغات رحلته في عالم السحر بعد إعادة إحيائه، حيث يواجه تحديات مصيرية لحماية عائلته وأحبائه.",
    releaseYear: "2024",
    season: "fall",
    broadcastDay: "sunday"
  },
  {
    mal_id: 56163,
    title: "Solo Leveling: Arise from the Shadow",
    title_english: "Solo Leveling: Arise from the Shadow",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx176496-xCNtU43t92wT.jpg",
    rating: 9.3,
    genres: ["أكشن", "فانتازيا", "خوارق"],
    status: "مستمر",
    episodes: 24,
    latestEpisode: 13,
    synopsis: "سونغ جين وو يتطور بصفته سيد الظلال الأقوى في مواجهة أعظم الوحوش والبوابات من الرتبة S لحماية البشرية.",
    releaseYear: "2025",
    season: "winter",
    broadcastDay: "saturday"
  },
  {
    mal_id: 57334,
    title: "Dandadan",
    title_english: "Dandadan",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx171018-2ldCj6QywuOa.jpg",
    rating: 8.9,
    genres: ["أكشن", "كوميدي", "خوارق"],
    status: "مستمر",
    episodes: 12,
    latestEpisode: 12,
    synopsis: "مومو وأوكاران يخوضان صراعاً شيقاً ومجنوناً يجمع بين كائنات الفضاء الخارجي والأشباح والقدرات الخارقة.",
    releaseYear: "2024",
    season: "fall",
    broadcastDay: "thursday"
  },
  {
    mal_id: 41467,
    title: "Bleach: Thousand-Year Blood War",
    title_english: "Bleach: Thousand-Year Blood War",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx116674-p3zK4PUX2A7Q.jpg",
    rating: 9.1,
    genres: ["أكشن", "مغامرات", "خوارق"],
    status: "مستمر",
    episodes: 39,
    latestEpisode: 34,
    synopsis: "إيتشيغو ومجتمع الأرواح يواجهون حرب الإبادة الشاملة ضد إمبراطورية الكوينشي بقيادة يوهاباخ في صراع النهاية.",
    releaseYear: "2024",
    season: "fall",
    broadcastDay: "saturday"
  },
  {
    mal_id: 54857,
    title: "Re:ZERO - Starting Life in Another World Season 3",
    title_english: "Re:ZERO Season 3",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx163134-Y0r2E2aB0h8o.jpg",
    rating: 8.9,
    genres: ["دراما", "فانتازيا", "إثارة"],
    status: "مستمر",
    episodes: 16,
    latestEpisode: 16,
    synopsis: "سوبارو ناتسوكي يستعمل قدرة العودة بالموت لمواجهة رؤساء عبادة الساحرة وحماية مدينة بريستيلا المائية.",
    releaseYear: "2024",
    season: "fall",
    broadcastDay: "wednesday"
  },
  {
    mal_id: 58514,
    title: "Blue Lock Season 2",
    title_english: "Blue Lock Season 2",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx163146-3fT0tQ6e2p8R.jpg",
    rating: 8.7,
    genres: ["رياضي", "إثارة", "منافسة"],
    status: "مستمر",
    episodes: 14,
    latestEpisode: 14,
    synopsis: "المرحلة الحاسمة لاختيار تشكيلة منتخب اليابان للشباب تحت 20 عاماً وخوض مواجهة إثبات الذات في القفل الأزرق.",
    releaseYear: "2024",
    season: "fall",
    broadcastDay: "saturday"
  },
  {
    mal_id: 57973,
    title: "Shangri-La Frontier Season 2",
    title_english: "Shangri-La Frontier Season 2",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx174299-s5K9p3u7Q1vX.jpg",
    rating: 8.8,
    genres: ["أكشن", "ألعاب", "فانتازيا"],
    status: "مستمر",
    episodes: 25,
    latestEpisode: 18,
    synopsis: "صياد ألعاب القمامة راكورو يواصل مغامرته في أفضل لعبة واقع افتراضي ويتحدى الوحوش الفريدة السبعة.",
    releaseYear: "2024",
    season: "fall",
    broadcastDay: "sunday"
  },
  {
    mal_id: 60601,
    title: "Tensei Kizoku, Kantei Skill de Nariagaru Season 3",
    title_english: "As a Reincarnated Aristocrat, Appraisal Skill Season 3",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx175452-wR5t9uL2k4mN.jpg",
    rating: 8.4,
    genres: ["فانتازيا", "إيسيكاي"],
    status: "مستمر",
    episodes: 12,
    latestEpisode: 1,
    synopsis: "أرس لوفنت يستخدم مهارة التقييم الاستثنائية لتوظيف أعظم النوابغ وتوسيع منطقته ومواجهة الأخطار السياسية.",
    releaseYear: "2025",
    season: "winter",
    broadcastDay: "sunday"
  },
  {
    mal_id: 52299,
    title: "Solo Leveling",
    title_english: "Solo Leveling",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx151807-m1gX3iwfIsLu.png",
    rating: 8.8,
    genres: ["أكشن", "ألعاب", "فانتازيا"],
    status: "مستمر",
    episodes: 24,
    latestEpisode: 12,
    synopsis: "في عالم ظهر فيه الصيادون، البشر الذين يمتلكون قدرات سحرية، يجب عليهم قتال الوحوش القاتلة لحماية الجنس البشري من الإبادة.",
    releaseYear: "2024",
    season: "winter",
    broadcastDay: "saturday"
  },
  {
    mal_id: 58356,
    title: "Sakamoto Days",
    title_english: "Sakamoto Days",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx177709-b2aL8K7x6cZ5.jpg",
    rating: 8.9,
    genres: ["أكشن", "كوميدي"],
    status: "مستمر",
    episodes: 12,
    latestEpisode: 8,
    synopsis: "تارو ساكاموتو، القاتل المأجور الأسطوري المتقاعد، يدير متجراً صغيراً ويقاتل لحماية عائلته وحياته الهادئة من الاغتيال.",
    releaseYear: "2025",
    season: "winter",
    broadcastDay: "saturday"
  },
  {
    mal_id: 58494,
    title: "Ranma 1/2 (2024)",
    title_english: "Ranma 1/2 (2024)",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx171457-h9P4w2R7t5yN.jpg",
    rating: 8.6,
    genres: ["كوميدي", "فنون قتالية", "رومانسي"],
    status: "مستمر",
    episodes: 12,
    latestEpisode: 12,
    synopsis: "إعادة إنتاج حديثة ومبهرة لتحفة رميكو تاكاهاشي حول رانما ساوتومي ولعنة الينابيع الملعونة وفنون الدفاع عن النفس.",
    releaseYear: "2024",
    season: "fall",
    broadcastDay: "saturday"
  },
  {
    mal_id: 52991,
    title: "Frieren: Beyond Journey's End",
    title_english: "Frieren: Beyond Journey's End",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-gHSraOSa0nBG.jpg",
    rating: 9.4,
    genres: ["مغامرات", "دراما", "فانتازيا"],
    status: "مكتمل",
    episodes: 28,
    latestEpisode: 28,
    synopsis: "الساحرة فريرين تبدأ رحلة جديدة لفهم مشاعر الإنسانية وتقدير اللحظات العابرة مع أصدقائها البشر.",
    releaseYear: "2023",
    season: "fall",
    broadcastDay: "friday"
  },
  {
    mal_id: 54865,
    title: "Kaiju No. 8",
    title_english: "Kaiju No. 8",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx153288-tD2Om05xab2d.jpg",
    rating: 8.6,
    genres: ["أكشن", "خيال علمي", "وحوش"],
    status: "مكتمل",
    episodes: 12,
    latestEpisode: 12,
    synopsis: "كافكا هيبينو يكتسب قدرة التحول إلى كايجو مدمر مع الاحتفاظ بوعيه وينضم لقوات الدفاع لإنقاذ البشرية.",
    releaseYear: "2024",
    season: "spring",
    broadcastDay: "saturday"
  },
  {
    mal_id: 57524,
    title: "Dragon Ball Daima",
    title_english: "Dragon Ball Daima",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx170083-v2cQ3r0dF8wP.jpg",
    rating: 8.7,
    genres: ["أكشن", "مغامرات", "فنون قتالية"],
    status: "مستمر",
    episodes: 20,
    latestEpisode: 20,
    synopsis: "غوكو وأصدقاؤه يتحولون إلى أطفال بسبب مؤامرة غامضة وينطلقون إلى عالم جديد مجهول لاستعادة قوتهم وأجسادهم.",
    releaseYear: "2024",
    season: "fall",
    broadcastDay: "friday"
  },
  {
    mal_id: 38000,
    title: "Demon Slayer: Kimetsu no Yaiba",
    title_english: "Demon Slayer: Kimetsu no Yaiba",
    posterUrl: "https://cdn.myanimelist.net/images/anime/1286/99889l.jpg",
    rating: 9.0,
    genres: ["أكشن", "خوارق", "تاريخي"],
    status: "مستمر",
    episodes: 63,
    latestEpisode: 63,
    synopsis: "تانجيرو وفيلق قتلة الشياطين يخوضون تدريب الهاشيرا المكثف استعداداً للمواجهة الأخيرة في قلعة اللانهاية.",
    releaseYear: "2024",
    season: "spring",
    broadcastDay: "sunday"
  }
];

export const CURATED_GENRES_LIST = [
  { mal_id: 1, name: "Action", nameAr: "أكشن" },
  { mal_id: 2, name: "Adventure", nameAr: "مغامرات" },
  { mal_id: 4, name: "Comedy", nameAr: "كوميدي" },
  { mal_id: 8, name: "Drama", nameAr: "دراما" },
  { mal_id: 10, name: "Fantasy", nameAr: "فانتازيا" },
  { mal_id: 7, name: "Mystery", nameAr: "غموض" },
  { mal_id: 22, name: "Romance", nameAr: "رومانسي" },
  { mal_id: 24, name: "Sci-Fi", nameAr: "خيال علمي" },
  { mal_id: 36, name: "Slice of Life", nameAr: "شريحة من الحياة" },
  { mal_id: 30, name: "Sports", nameAr: "رياضي" },
  { mal_id: 37, name: "Supernatural", nameAr: "خوارق" },
  { mal_id: 41, name: "Suspense", nameAr: "إثارة" },
  { mal_id: 62, name: "Isekai", nameAr: "إيسيكاي" },
  { mal_id: 17, name: "Martial Arts", nameAr: "فنون قتالية" },
  { mal_id: 13, name: "Historical", nameAr: "تاريخي" }
];

export function getCuratedRecentEpisodes(): any[] {
  return CURATED_ANIME_LIST.map((anime, index) => ({
    _id: `recent-curated-${anime.mal_id}-${index}`,
    id: `${anime.mal_id}-episode-${anime.latestEpisode}`,
    title: anime.title_english || anime.title,
    episode: String(anime.latestEpisode),
    episodeNumber: String(anime.latestEpisode),
    imageUrl: anime.posterUrl,
    posterUrl: anime.posterUrl,
    thumbnailUrl: anime.posterUrl,
    link: `/anime/${anime.mal_id}`,
    animeId: {
      _id: String(anime.mal_id),
      id: String(anime.mal_id),
      mal_id: anime.mal_id,
      title: anime.title_english || anime.title,
      titleAr: anime.title_english || anime.title,
      posterUrl: anime.posterUrl,
      thumbnailUrl: anime.posterUrl,
    },
  }));
}

export function getCuratedTop5(): any[] {
  return CURATED_ANIME_LIST.slice(0, 8).map((anime) => ({
    _id: String(anime.mal_id),
    title: anime.title_english || anime.title,
    posterUrl: anime.posterUrl,
    rating: anime.rating,
    genres: anime.genres,
  }));
}

export function getCuratedSeasonAnime(season?: string, year?: string | number): any[] {
  let list = CURATED_ANIME_LIST;
  if (season && season !== 'now' && season !== 'auto') {
    const filtered = list.filter(a => a.season.toLowerCase() === season.toLowerCase());
    if (filtered.length > 0) list = filtered;
  }
  if (year && season !== 'now' && season !== 'auto') {
    const filteredYear = list.filter(a => a.releaseYear === String(year));
    if (filteredYear.length > 0) list = filteredYear;
  }
  return list.map((anime) => ({
    _id: String(anime.mal_id),
    title: anime.title_english || anime.title,
    posterUrl: anime.posterUrl,
    rating: anime.rating,
    genres: anime.genres,
    status: anime.status,
    releaseYear: anime.releaseYear,
    season: anime.season,
  }));
}

export function getCuratedAnimeById(id: string | number): any {
  const idStr = String(id).trim();
  let found: CuratedAnime | undefined;

  if (idStr === 'random') {
    found = CURATED_ANIME_LIST[Math.floor(Math.random() * CURATED_ANIME_LIST.length)];
  } else if (idStr.startsWith('search-')) {
    const q = decodeURIComponent(idStr.replace('search-', '')).toLowerCase().trim();
    found = CURATED_ANIME_LIST.find(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.title_english.toLowerCase().includes(q)
    );
  } else {
    const numId = Number(idStr.split('-')[0]);
    found = CURATED_ANIME_LIST.find((a) => a.mal_id === numId);
  }

  if (!found) {
    found = CURATED_ANIME_LIST[0];
  }
  
  const totalEps = Math.min(found.episodes || 12, 100);
  const episodesList = Array.from({ length: totalEps }, (_, i) => ({
    id: `${found!.mal_id}-episode-${i + 1}`,
    num: String(i + 1),
    title: `الحلقة ${i + 1} - ${found!.title_english || found!.title}`,
    link: `/anime/${found!.mal_id}/episode/${i + 1}`
  }));

  const otherAnime = CURATED_ANIME_LIST.filter(a => a.mal_id !== found!.mal_id);

  return {
    _id: String(found.mal_id),
    title: found.title_english || found.title,
    englishTitle: found.title_english,
    posterUrl: found.posterUrl,
    bannerUrl: found.bannerUrl || found.posterUrl,
    description: found.synopsis,
    episodes: episodesList,
    genres: found.genres,
    rating: found.rating,
    status: found.status,
    type: "تلفزيون (TV)",
    episodesCount: String(found.episodes || 12),
    releaseYear: found.releaseYear,
    season: found.season === 'winter' ? 'شتاء ' + found.releaseYear : found.season === 'spring' ? 'ربيع ' + found.releaseYear : found.season === 'summer' ? 'صيف ' + found.releaseYear : 'خريف ' + found.releaseYear,
    characters: [],
    related: [],
    jikanRecommendations: otherAnime.slice(0, 6).map(rec => ({
      id: rec.mal_id,
      title: rec.title_english || rec.title,
      posterUrl: rec.posterUrl
    })),
    pictures: [
      found.posterUrl,
      ...(found.bannerUrl ? [found.bannerUrl] : [])
    ]
  };
}

