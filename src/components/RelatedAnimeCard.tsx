import React, { useEffect, useState } from 'react';
import { Play } from 'lucide-react';

const RELATION_TYPES_AR: Record<string, string> = {
  'sequel': 'تكملة',
  'prequel': 'موسم سابق',
  'alternative setting': 'قصة بديلة',
  'alternative version': 'نسخة بديلة',
  'side story': 'قصة جانبية',
  'summary': 'ملخص',
  'full story': 'قصة كاملة',
  'parent story': 'القصة الرئيسية',
  'spin-off': 'عمل فرعي',
  'adaptation': 'اقتباس',
  'character': 'شخصية',
  'other': 'إضافي'
};

const TYPE_AR: Record<string, string> = {
  'manga': 'مانجا',
  'anime': 'مسلسل',
  'tv': 'مسلسل',
  'tv_short': 'خاصة',
  'movie': 'فيلم',
  'ova': 'أوفا',
  'ona': 'أونا',
  'special': 'خاصة',
  'music': 'موسيقى',
  'novel': 'رواية',
  'light_novel': 'رواية خفيفة',
  'one_shot': 'ون شوت',
  'manhwa': 'مانهوا',
  'manhua': 'مانها'
};

export default function RelatedAnimeCard({ rel, onClick }: any) {
  const [poster, setPoster] = useState<string | null>(rel?.posterUrl || null);

  useEffect(() => {
    if (rel?.posterUrl) {
      setPoster(rel.posterUrl);
      return;
    }
    if (rel.mal_id) {
      fetch(`/api/anime/poster/${rel.mal_id}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.posterUrl) {
            setPoster(data.posterUrl);
          }
        })
        .catch(() => {});
    }
  }, [rel.mal_id, rel?.posterUrl]);

  const cleanRelation = rel.relation ? rel.relation.trim().toLowerCase() : '';
  const cleanType = rel.type ? rel.type.trim().toLowerCase() : '';

  // شارة واحدة فقط غير متكررة: تعرض رقم الموسم (مثلاً الموسم 1) أو نوع العمل (فيلم / أوفا / أونا / خاصة)
  const badgeLabel =
    rel.badge ||
    RELATION_TYPES_AR[cleanRelation] ||
    rel.relation ||
    TYPE_AR[cleanType] ||
    'مرتبط';

  return (
    <div 
      onClick={onClick}
      className="w-full relative group cursor-pointer"
    >
      <div className="w-full aspect-[2/3] rounded-xl overflow-hidden bg-[#121212] border border-neutral-800/80 shadow-md group-hover:border-[#FF1744] transition-all duration-300 flex flex-col relative">
        {poster ? (
          <img
            src={poster}
            alt={rel.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-2 bg-gradient-to-b from-neutral-800 to-[#121212]">
            <Play size={22} className="opacity-20 text-white" />
          </div>
        )}
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />

        {/* اسم الأنمي في الأسفل بخط رفيع وأنيق مقصور على سطرين كحد أقصى وبدون عدد حلقات */}
        <div className="absolute bottom-2 left-1.5 right-1.5 text-center z-10">
          <h4 className="text-[10px] font-light text-white/95 line-clamp-2 leading-snug">
            {rel.name}
          </h4>
        </div>

        {/* شارة علوية واحدة فقط بدون تكرار */}
        {badgeLabel && (
          <div className="absolute top-1.5 right-1.5 bg-black/75 text-white/95 text-[9px] font-light px-1.5 py-0.5 rounded backdrop-blur-md border border-white/10 z-10">
            {badgeLabel}
          </div>
        )}
      </div>
    </div>
  );
}
