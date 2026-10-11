import { motion, AnimatePresence } from 'motion/react';
import { Bot, X, Sparkles, Send, Trash2, Lock, Award, Clock } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isStaffEmail } from '../services/moderationService';

const QUICK_PROMPTS = [
  'اقترح لي أنمي قصير ومكتمل يحبس الأنفاس 🔥',
  'أريد أنمي غموض وتحقيق بمستوى Death Note 🧠',
  'ما هي أفضل أنميات الموسم الحالي؟ 🌟',
  'اشرح لي ترتيب مشاهدة سلسلة Fate ⚔️',
];

export default function AiChatWidget() {
  const { user, userData, userRole } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const MIN_LEVEL = 10;
  const userLevel = userData?.level || 1;
  const isStaff =
    userRole === 'owner' ||
    userRole === 'admin' ||
    userRole === 'moderator' ||
    isStaffEmail(user?.email);
  const isUnlocked = userLevel >= MIN_LEVEL || isStaff;

  const [chat, setChat] = useState<{ sender: string; text: string }[]>(() => {
    try {
      const saved = localStorage.getItem('otaku_widget_chat_v2');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        sender: 'bot',
        text: 'مرحباً بك يا ناكاما في أنمي MOD! 🌟 أنا مساعدك الذكي (السينباي المخضرم). يمكنني اقتراح أنميات على ذوقك، شرح النهايات والنظريات، أو إعطائك ترتيب المشاهدة الصحيح لأي سلسلة. كيف أساعدك اليوم؟',
      },
    ];
  });

  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener('open-ai-chat', handler);
    return () => window.removeEventListener('open-ai-chat', handler);
  }, []);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = setInterval(() => {
      setCooldownSec((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSec]);

  useEffect(() => {
    try {
      localStorage.setItem('otaku_widget_chat_v2', JSON.stringify(chat.slice(-20)));
    } catch {}
    if (isOpen && isUnlocked) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    }
  }, [chat, isOpen, isUnlocked]);

  const sendText = async (textToSend: string) => {
    if (!textToSend.trim() || loading || cooldownSec > 0 || !isUnlocked) return;
    const userMsg = textToSend.trim().slice(0, 500);
    const newChat = [...chat, { sender: 'user', text: userMsg }];
    setChat(newChat);
    setMsg('');
    setLoading(true);
    setCooldownSec(3); // 3-second cooldown per message to prevent spam across thousands of users

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          messages: newChat.slice(-6),
          mood: 'متحمس ومستعد للمشاهدة 🔥',
          status: 'أبحث عن توصية أو نقاش أنمي 📺',
        }),
      });
      const data = await res.json();
      if (res.status === 429 || data.rateLimited) {
        if (data.retryAfterSec) setCooldownSec(data.retryAfterSec);
        setChat((prev) => [
          ...prev,
          { sender: 'bot', text: data.message || 'يرجى الانتظار قليلاً قبل إرسال رسالة جديدة للحفاظ على سرعة الخادم.' },
        ]);
      } else if (data.success && data.text) {
        setChat((prev) => [...prev, { sender: 'bot', text: data.text }]);
      } else {
        setChat((prev) => [
          ...prev,
          { sender: 'bot', text: 'عذراً يا صديقي، حدث ضغط مؤقت في الخادم. جرب إرسال رسالتك مرة أخرى!' },
        ]);
      }
    } catch (e) {
      setChat((prev) => [
        ...prev,
        { sender: 'bot', text: 'عذراً، تعذر الاتصال بالشبكة حالياً. تأكد من اتصالك وحاول مجدداً.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const resetChat = () => {
    const initial = [
      {
        sender: 'bot',
        text: 'تم فتح صفحة نقاش جديدة يا ناكاما! 🌟 أخبرني، ما هو نوع الأنمي الذي تبحث عنه الآن؟',
      },
    ];
    setChat(initial);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[95]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            dir="rtl"
            className="fixed inset-x-3 top-[7%] bottom-[8%] max-w-md mx-auto bg-[#0b0b10] border border-purple-500/25 rounded-3xl shadow-[0_0_50px_rgba(147,51,234,0.25)] overflow-hidden z-[100] flex flex-col"
          >
            {/* Header */}
            <div className="bg-gradient-to-l from-purple-900/90 via-indigo-950 to-[#0b0b10] p-4 shrink-0 flex justify-between items-center relative overflow-hidden border-b border-white/10">
              <Sparkles className="absolute left-4 top-2 text-purple-400 opacity-15 pointer-events-none" size={44} />
              <div className="flex items-center gap-3 relative z-10">
                <div className="w-10 h-10 bg-purple-500/20 rounded-2xl flex items-center justify-center backdrop-blur shadow-lg border border-purple-400/30">
                  <Bot size={22} className="text-purple-300" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-white font-black text-sm">مساعد أنمي MOD الذكي</h3>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <p className="text-[10px] text-purple-300 font-bold">ميزة حصرية للمستوى {MIN_LEVEL}+</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 relative z-10">
                {isUnlocked && (
                  <button
                    onClick={resetChat}
                    title="محادثة جديدة"
                    className="text-white/60 hover:text-white transition bg-white/5 hover:bg-white/10 rounded-full p-2 border border-white/10 cursor-pointer"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-white/60 hover:text-white transition bg-white/5 hover:bg-white/10 rounded-full p-2 border border-white/10 cursor-pointer"
                >
                  <X size={17} />
                </button>
              </div>
            </div>

            {!isUnlocked ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-[#0b0b10] to-black">
                <div className="w-20 h-20 rounded-3xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center mb-4 relative shadow-[0_0_30px_rgba(168,85,247,0.15)]">
                  <Lock size={34} className="text-purple-400" />
                  <Award size={20} className="text-yellow-400 absolute -bottom-1.5 -left-1.5" />
                </div>
                <h4 className="text-white font-black text-base mb-1.5">المساعد الذكي مقفل حالياً 🔒</h4>
                <p className="text-neutral-400 text-xs leading-relaxed mb-5 max-w-xs">
                  لضمان أعلى سرعة وجودة لخوادم الذكاء الاصطناعي لجميع الأعضاء، يفتح "السينباي الذكي" عند وصولك إلى <span className="text-purple-400 font-black">المستوى {MIN_LEVEL}</span>.
                </p>

                <div className="w-full bg-white/[0.03] border border-white/10 rounded-2xl p-4 mb-5 space-y-2.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-neutral-400">مستواك الحالي:</span>
                    <span className="text-pink-400">المستوى {userLevel}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-neutral-400">المستوى المطلوب:</span>
                    <span className="text-purple-400">المستوى {MIN_LEVEL}</span>
                  </div>
                  <div className="w-full h-2 bg-neutral-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-600 to-pink-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, (userLevel / MIN_LEVEL) * 100)}%` }}
                    />
                  </div>
                </div>

                <p className="text-[11px] text-neutral-500 leading-relaxed">
                  💡 اجمع نقاط الخبرة (EXP) بسرعة عبر مشاهدة الحلقات، المشاركة في المجتمع، واللعب في ساحة الأوتاكو!
                </p>
              </div>
            ) : (
              <>
                {/* Quick Prompts */}
                <div className="px-3 py-2 bg-white/[0.02] border-b border-white/5 flex gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                  {QUICK_PROMPTS.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => sendText(q)}
                      disabled={loading || cooldownSec > 0}
                      className="shrink-0 text-[10px] font-bold bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 px-2.5 py-1.5 rounded-xl transition cursor-pointer disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-black/60">
                  {chat.map((c, i) => (
                    <div key={i} className={`flex ${c.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[86%] p-3.5 text-xs sm:text-sm leading-relaxed rounded-2xl shadow-md whitespace-pre-wrap ${
                          c.sender === 'user'
                            ? 'bg-gradient-to-l from-purple-600 to-indigo-600 text-white rounded-tl-sm font-medium'
                            : 'bg-[#15151e] text-neutral-100 border border-white/10 rounded-tr-sm'
                        }`}
                      >
                        {c.text}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="bg-[#15151e] text-purple-300 border border-purple-500/20 px-3.5 py-2.5 rounded-2xl rounded-tr-sm text-xs font-bold flex items-center gap-2">
                        <Bot size={15} className="animate-spin" />
                        <span>جاري التفكير وكتابة الرد...</span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-3 bg-[#0f0f16] border-t border-white/10 shrink-0">
                  <div className="flex items-center gap-2 bg-black border border-white/15 focus-within:border-purple-500/60 rounded-2xl p-1.5 pr-3.5 shadow-inner transition-colors">
                    <input
                      type="text"
                      value={msg}
                      maxLength={500}
                      onChange={(e) => setMsg(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendText(msg)}
                      placeholder={cooldownSec > 0 ? `انتظر ${cooldownSec} ثوانٍ للإرسال...` : 'اسأل عن أي أنمي أو اطلب توصية...'}
                      disabled={loading || cooldownSec > 0}
                      className="flex-1 bg-transparent text-xs sm:text-sm text-white focus:outline-none disabled:opacity-50"
                    />
                    <button
                      onClick={() => sendText(msg)}
                      disabled={loading || cooldownSec > 0 || !msg.trim()}
                      className="w-9 h-9 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-lg hover:brightness-110 active:scale-95 transition disabled:opacity-40 cursor-pointer"
                    >
                      {cooldownSec > 0 ? (
                        <span className="text-[10px] font-black">{cooldownSec}s</span>
                      ) : (
                        <Send size={15} />
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

