/**
 * دالة تنظيف أسماء الأنمي لضمان ظهور اسم الأنمي الصافي فقط
 * إزالة أي نصوص عربية زائدة (مثل: انمي، الحلقة، الموسم، والأخيرة، مترجم، أون لاين)
 * واستخراج اسم الأنمي الصافي بدون تشويه
 */
export function cleanAnimeTitle(rawTitle: string | null | undefined): string {
  if (!rawTitle) return 'Anime';
  let text = String(rawTitle).trim();

  // تحويل علامات الاقتباس والشرطات الخاصة إلى صيغتها القياسية
  text = text
    .replace(/[’‘`´]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/["“”]/g, '');

  // 1. إذا كان الاسم يحتوي على قوسين بداخلهما اسم إنجليزي مثل: "سولو ليفلينغ (Solo Leveling)"
  const bracketEnglishMatch = text.match(/\(([^)]*[a-zA-Z]{2,}[^)]*)\)/);
  if (bracketEnglishMatch && bracketEnglishMatch[1]) {
    const candidate = bracketEnglishMatch[1].trim();
    if (candidate.length >= 2) {
      return candidate;
    }
  }

  // 2. إزالة الكلمات الزائدة والتوصيفات العربية الملحقة من مواقع المشاهدة
  const noisePatterns = [
    /\b(انمي|أنمي)\b/gi,
    /\bالموسم\s*\d+\b/gi,
    /\bالموسم\s*(الأول|الثاني|الثالث|الرابع|الخامس|الأخير|الاول)\b/gi,
    /\b(والأخيرة|والاخيرة|الأخيرة|الاخيرة|النهائية)\b/gi,
    /\bحلقة\s*خاصة\b/gi,
    /\b(خاصة|أوفا|اوفا|فلم|فيلم)\b/gi,
    /\bالحلقة\s*\d+\b/gi,
    /\bحلقة\s*\d+\b/gi,
    /\b\d+\s*الحلقة\b/gi,
    /\bمترجم[ة]?\b/gi,
    /\b(أون\s*لاين|اون\s*لاين)\b/gi,
    /\bكامل[ة]?\b/gi,
    /\bمدبلج[ة]?\b/gi,
    /\bالجزء\s*\d+\b/gi,
    /\b(HD|FHD|4K|1080p|720p)\b/gi,
  ];

  for (const pattern of noisePatterns) {
    text = text.replace(pattern, ' ');
  }

  // 3. إذا كان النص يحتوي على جزء إنجليزي/لاتيني، نستخرجه حصراً للتخلص من النص العربي المصاحب
  // مثل: "ون بيس One Piece" => "One Piece"
  // "المحقق كونان Detective Conan" => "Detective Conan"
  // "Mushoku Tensei: Isekai Ittara Honki Dasu" => "Mushoku Tensei: Isekai Ittara Honki Dasu"
  const englishMatch = text.match(/[A-Za-z0-9][A-Za-z0-9\s\:\'\-\,\.\!\?\&]*[A-Za-z0-9]/);
  if (englishMatch && englishMatch[0]) {
    const cleanEng = englishMatch[0].trim();
    // إذا كان المقطع الإنجليزي مكون من حرفين أو أكثر وله معنى
    if (cleanEng.length >= 2) {
      return cleanEng.replace(/\s+/g, ' ');
    }
  }

  // 4. إزالة الأقواس والرموز غير المرغوبة
  text = text.replace(/[\(\)\[\]\{\}\:\-\_\|\/\\]+/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();

  return text || 'Anime';
}
