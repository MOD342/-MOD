import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import ViewportPortal from './ViewportPortal';

interface ImageLightboxModalProps {
  src: string | null;
  alt?: string;
  caption?: string;
  onClose: () => void;
  footer?: React.ReactNode;
}

export default function ImageLightboxModal({
  src,
  alt = 'صورة مكبرة',
  caption,
  onClose,
  footer,
}: ImageLightboxModalProps) {
  useEffect(() => {
    if (!src) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [src, onClose]);

  return (
    <ViewportPortal>
      <AnimatePresence>
        {src && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            style={{
              height: 'var(--vv-height, 100dvh)',
              paddingTop: 'calc(var(--safe-top, 0px) + 0.75rem)',
              paddingBottom: 'calc(var(--safe-bottom, 0px) + 0.75rem)',
              paddingLeft: 'calc(var(--safe-left, 0px) + 0.75rem)',
              paddingRight: 'calc(var(--safe-right, 0px) + 0.75rem)',
            }}
            className="theme-keep-dark fixed inset-0 z-[140] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center"
            dir="rtl"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-4xl w-full flex flex-col items-center gap-3"
            >
              {/* Safe top bar inside viewport */}
              <div className="w-full flex items-center justify-between gap-3 px-1">
                {caption ? (
                  <p className="text-xs sm:text-sm font-bold text-neutral-200 truncate">
                    {caption}
                  </p>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="إغلاق"
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-neutral-900/90 hover:bg-neutral-800 border border-white/15 text-neutral-200 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0 shadow-lg"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Full Uncropped Image */}
              <motion.div
                initial={{ scale: 0.94, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="w-full max-h-[78vh] flex items-center justify-center select-none"
              >
                <img
                  src={src}
                  alt={alt}
                  referrerPolicy="no-referrer"
                  className="max-h-[76vh] max-w-full w-auto h-auto rounded-2xl object-contain shadow-[0_24px_60px_rgba(0,0,0,0.85)] border border-white/10 bg-neutral-950"
                />
              </motion.div>

              {footer && <div className="w-full flex justify-center pt-1">{footer}</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </ViewportPortal>
  );
}
