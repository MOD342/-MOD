export interface GenreTaxonomyItem {
  mal_id: number;
  id: string;
  name: string;
  nameAr: string;
  anilistKind: 'genre' | 'tag';
  anilistValue: string;
  emoji?: string;
  aliases: string[];
}

export const ANILIST_NATIVE_GENRES = new Set<string>([
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
]);

export const GENRE_TAXONOMY: GenreTaxonomyItem[] = [
  {
    mal_id: 1,
    id: 'Action',
    name: 'Action',
    nameAr: 'أكشن',
    anilistKind: 'genre',
    anilistValue: 'Action',
    emoji: '⚔️',
    aliases: ['أكشن', 'اكشن', 'action'],
  },
  {
    mal_id: 2,
    id: 'Adventure',
    name: 'Adventure',
    nameAr: 'مغامرات',
    anilistKind: 'genre',
    anilistValue: 'Adventure',
    emoji: '🗺️',
    aliases: ['مغامرات', 'مغامرة', 'مغامره', 'adventure'],
  },
  {
    mal_id: 4,
    id: 'Comedy',
    name: 'Comedy',
    nameAr: 'كوميدي',
    anilistKind: 'genre',
    anilistValue: 'Comedy',
    emoji: '🎭',
    aliases: ['كوميدي', 'كوميديا', 'كوميدى', 'comedy'],
  },
  {
    mal_id: 8,
    id: 'Drama',
    name: 'Drama',
    nameAr: 'دراما',
    anilistKind: 'genre',
    anilistValue: 'Drama',
    emoji: '🎬',
    aliases: ['دراما', 'درامي', 'drama'],
  },
  {
    mal_id: 10,
    id: 'Fantasy',
    name: 'Fantasy',
    nameAr: 'فانتازيا',
    anilistKind: 'genre',
    anilistValue: 'Fantasy',
    emoji: '🔮',
    aliases: ['فانتازيا', 'خيالي', 'خيال', 'fantasy'],
  },
  {
    mal_id: 62,
    id: 'Isekai',
    name: 'Isekai',
    nameAr: 'إيسيكاي',
    anilistKind: 'tag',
    anilistValue: 'Isekai',
    emoji: '🌌',
    aliases: ['إيسيكاي', 'ايسيكاي', 'إسيكاي', 'عالم آخر', 'isekai'],
  },
  {
    mal_id: 7,
    id: 'Mystery',
    name: 'Mystery',
    nameAr: 'غموض',
    anilistKind: 'genre',
    anilistValue: 'Mystery',
    emoji: '🔍',
    aliases: ['غموض', 'غامض', 'mystery'],
  },
  {
    mal_id: 22,
    id: 'Romance',
    name: 'Romance',
    nameAr: 'رومانسي',
    anilistKind: 'genre',
    anilistValue: 'Romance',
    emoji: '💕',
    aliases: ['رومانسي', 'رومانسية', 'رومانسيه', 'romance'],
  },
  {
    mal_id: 24,
    id: 'Sci-Fi',
    name: 'Sci-Fi',
    nameAr: 'خيال علمي',
    anilistKind: 'genre',
    anilistValue: 'Sci-Fi',
    emoji: '🚀',
    aliases: ['خيال علمي', 'sci-fi', 'scifi', 'science fiction'],
  },
  {
    mal_id: 36,
    id: 'Slice of Life',
    name: 'Slice of Life',
    nameAr: 'شريحة من الحياة',
    anilistKind: 'genre',
    anilistValue: 'Slice of Life',
    emoji: '🌸',
    aliases: ['شريحة من الحياة', 'شريحه من الحياه', 'الحياة اليومية', 'slice of life'],
  },
  {
    mal_id: 30,
    id: 'Sports',
    name: 'Sports',
    nameAr: 'رياضي',
    anilistKind: 'genre',
    anilistValue: 'Sports',
    emoji: '⚽',
    aliases: ['رياضي', 'رياضة', 'رياضه', 'sports', 'sport'],
  },
  {
    mal_id: 37,
    id: 'Supernatural',
    name: 'Supernatural',
    nameAr: 'خوارق',
    anilistKind: 'genre',
    anilistValue: 'Supernatural',
    emoji: '✨',
    aliases: ['خوارق', 'قوى خارقة', 'قوى خارقه', 'فوق الطبيعة', 'supernatural'],
  },
  {
    mal_id: 41,
    id: 'Thriller',
    name: 'Thriller',
    nameAr: 'إثارة وتشويق',
    anilistKind: 'genre',
    anilistValue: 'Thriller',
    emoji: '⏳',
    aliases: ['إثارة', 'اثارة', 'إثارة وتشويق', 'اثاره', 'تشويق', 'suspense', 'thriller'],
  },
  {
    mal_id: 40,
    id: 'Psychological',
    name: 'Psychological',
    nameAr: 'نفسي',
    anilistKind: 'genre',
    anilistValue: 'Psychological',
    emoji: '🧠',
    aliases: ['نفسي', 'psychological'],
  },
  {
    mal_id: 14,
    id: 'Horror',
    name: 'Horror',
    nameAr: 'رعب',
    anilistKind: 'genre',
    anilistValue: 'Horror',
    emoji: '👻',
    aliases: ['رعب', 'horror'],
  },
  {
    mal_id: 27,
    id: 'Shounen',
    name: 'Shounen',
    nameAr: 'شونين',
    anilistKind: 'tag',
    anilistValue: 'Shounen',
    emoji: '🔥',
    aliases: ['شونين', 'شونن', 'shounen', 'shonen'],
  },
  {
    mal_id: 42,
    id: 'Seinen',
    name: 'Seinen',
    nameAr: 'سينين',
    anilistKind: 'tag',
    anilistValue: 'Seinen',
    emoji: '🗡️',
    aliases: ['سينين', 'seinen'],
  },
  {
    mal_id: 17,
    id: 'Martial Arts',
    name: 'Martial Arts',
    nameAr: 'فنون قتالية',
    anilistKind: 'tag',
    anilistValue: 'Martial Arts',
    emoji: '🥋',
    aliases: ['فنون قتالية', 'فنون قتاليه', 'قتال', 'martial arts'],
  },
  {
    mal_id: 13,
    id: 'Historical',
    name: 'Historical',
    nameAr: 'تاريخي',
    anilistKind: 'tag',
    anilistValue: 'Historical',
    emoji: '📜',
    aliases: ['تاريخي', 'تاريخى', 'historical'],
  },
  {
    mal_id: 23,
    id: 'School',
    name: 'School',
    nameAr: 'مدرسي',
    anilistKind: 'tag',
    anilistValue: 'School',
    emoji: '🏫',
    aliases: ['مدرسي', 'مدرسة', 'school'],
  },
  {
    mal_id: 18,
    id: 'Mecha',
    name: 'Mecha',
    nameAr: 'آليات',
    anilistKind: 'genre',
    anilistValue: 'Mecha',
    emoji: '🤖',
    aliases: ['آليات', 'ميكا', 'ميكا (آليات)', 'mecha'],
  },
  {
    mal_id: 19,
    id: 'Music',
    name: 'Music',
    nameAr: 'موسيقى',
    anilistKind: 'genre',
    anilistValue: 'Music',
    emoji: '🎵',
    aliases: ['موسيقى', 'موسيقى وغناء', 'music'],
  },
];

export const GENRE_DISPLAY_AR_MAP: Record<string, string> = {
  Action: 'أكشن',
  Adventure: 'مغامرات',
  Comedy: 'كوميدي',
  Drama: 'دراما',
  Fantasy: 'فانتازيا',
  Romance: 'رومانسي',
  'Sci-Fi': 'خيال علمي',
  'Slice of Life': 'شريحة من الحياة',
  Supernatural: 'خوارق',
  Suspense: 'إثارة وتشويق',
  Thriller: 'إثارة وتشويق',
  Mystery: 'غموض',
  Sports: 'رياضي',
  Horror: 'رعب',
  Psychological: 'نفسي',
  Isekai: 'إيسيكاي',
  'Martial Arts': 'فنون قتالية',
  Historical: 'تاريخي',
  School: 'مدرسي',
  Military: 'عسكري',
  Shounen: 'شونين',
  Seinen: 'سينين',
  Shoujo: 'شوجو',
  Josei: 'جوسي',
  Mecha: 'آليات',
  Music: 'موسيقى',
  'Mahou Shoujo': 'فتيات سحريات',
  Gourmet: 'طهي وطعام',
  'Award Winning': 'حائز على جوائز',
  Ecchi: 'إيتشي',
  'Avant Garde': 'طليعي',
  Workplace: 'بيئة عمل',
  'Boys Love': 'دراما شباب',
  'Girls Love': 'دراما فتيات',
};

function normalizeMatchText(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveGenreTaxonomyItem(input: string | number): GenreTaxonomyItem | null {
  if (typeof input === 'number' || /^\d+$/.test(String(input).trim())) {
    const idNum = Number(input);
    return GENRE_TAXONOMY.find((item) => item.mal_id === idNum) || null;
  }

  const normalized = normalizeMatchText(String(input));
  if (!normalized) return null;

  for (const item of GENRE_TAXONOMY) {
    if (
      normalizeMatchText(item.id) === normalized ||
      normalizeMatchText(item.name) === normalized ||
      normalizeMatchText(item.nameAr) === normalized ||
      item.aliases.some((alias) => normalizeMatchText(alias) === normalized)
    ) {
      return item;
    }
  }
  return null;
}

export function translateGenreToArabic(genre: string, withEmoji = false): string {
  const trimmed = String(genre || '').trim();
  if (!trimmed) return '';
  if (/[\u0600-\u06FF]/.test(trimmed)) return trimmed;

  const tax = resolveGenreTaxonomyItem(trimmed);
  if (tax) {
    return withEmoji && tax.emoji ? `${tax.nameAr} ${tax.emoji}` : tax.nameAr;
  }
  return GENRE_DISPLAY_AR_MAP[trimmed] || trimmed;
}

/**
 * Splits a mixed list of genre IDs/names/Arabic labels into native AniList `genre_in`
 * and AniList `tag_in` arrays so non-genre categories (Isekai, Martial Arts, Historical, Shounen, etc.)
 * return accurate AniList search results instead of failing `genre_in`.
 */
export function splitAniListGenresAndTags(items: Array<string | number>): {
  genreIn: string[];
  tagIn: string[];
  malIds: number[];
} {
  const genreIn = new Set<string>();
  const tagIn = new Set<string>();
  const malIds = new Set<number>();

  for (const raw of items) {
    const str = String(raw || '').trim();
    if (!str) continue;

    const resolved = resolveGenreTaxonomyItem(raw);
    if (resolved) {
      malIds.add(resolved.mal_id);
      if (resolved.anilistKind === 'genre') {
        genreIn.add(resolved.anilistValue);
      } else {
        tagIn.add(resolved.anilistValue);
      }
      continue;
    }

    if (ANILIST_NATIVE_GENRES.has(str)) {
      genreIn.add(str);
    } else if (str.toLowerCase() === 'suspense') {
      genreIn.add('Thriller');
    } else if (!/^\d+$/.test(str)) {
      tagIn.add(str);
    }
  }

  return {
    genreIn: Array.from(genreIn),
    tagIn: Array.from(tagIn),
    malIds: Array.from(malIds),
  };
}
