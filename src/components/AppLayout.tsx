import { Store, UserCircle, PlaySquare, Swords, Crown, Home, Bookmark, MoreHorizontal, Shuffle, Bell, Bot } from 'lucide-react';
import { ReactNode, useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import NotificationsModal from './NotificationsModal';
import { db, auth } from '../firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { useDeviceDisplay } from '../hooks/useDeviceDisplay';

export function AppLayout({
  children,
  activeTab,
  setActiveTab,
  onNavigateTo,
}: {
  children: ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onNavigateTo: (view: string, props?: any) => void;
}) {
  const { user, signIn } = useAuth();
  const display = useDeviceDisplay();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showNav, setShowNav] = useState(true);
  const lastScrollYRef = useRef(0);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);

  // Use ergonomic Side Navigation Rail on tablets, unfolded foldables (book mode), and desktop
  // Keep bottom thumb bar on phones, narrow foldable cover screens, and tabletop fold posture
  const useSideRail = display.isWideOrUnfolded && !display.isTabletopPosture && !display.isCoverScreen;

  useEffect(() => {
    if (!user || !auth.currentUser || auth.currentUser.uid !== user.id) {
      setUnreadNotifsCount(0);
      return;
    }

    const q = query(collection(db, 'users', user.id, 'notifications'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const count = snapshot.docs.filter((d) => !d.data().read).length;
        setUnreadNotifsCount(count);
      },
      (err) => {
        console.warn('Real-time notifications counter error:', err);
      }
    );

    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (useSideRail) {
      setShowNav(true);
      return;
    }
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (Math.abs(currentScrollY - lastScrollYRef.current) < 14) return;
      if (currentScrollY > lastScrollYRef.current && currentScrollY > 80) {
        setShowNav(false);
      } else {
        setShowNav(true);
      }
      lastScrollYRef.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [useSideRail]);

  const handleRandomAnime = () => {
    onNavigateTo('anime_details', { id: 'random', t: Date.now() });
  };

  const navItems = [
    { id: 'home', icon: Home, label: 'الرئيسية' },
    { id: 'watch', icon: PlaySquare, label: 'الأنمي' },
    { id: 'community', icon: Crown, label: 'النخبة' },
    { id: 'lists', icon: Bookmark, label: 'قائمتي' },
    { id: 'more', icon: MoreHorizontal, label: 'المزيد' },
  ];

  return (
    <div
      className={`min-h-[var(--vv-height,100dvh)] w-full bg-black text-neutral-200 font-sans relative ${
        useSideRail
          ? 'pb-10 pt-0 pr-[76px] xl:pr-56'
          : 'pb-24 pt-16'
      }`}
      style={{
        paddingLeft: 'var(--safe-left, 0px)',
        paddingBottom: useSideRail
          ? 'calc(var(--safe-bottom, 0px) + 2rem)'
          : 'calc(var(--safe-bottom, 0px) + 5.75rem)',
      }}
      dir="rtl"
    >
      {/* Side Navigation Rail for Tablets, Unfolded Foldables & Desktop (RTL Start/Right Edge) */}
      {useSideRail && (
        <aside
          aria-label="التنقل الرئيسي"
          style={{
            paddingTop: 'calc(var(--safe-top, 0px) + 1rem)',
            paddingBottom: 'calc(var(--safe-bottom, 0px) + 1rem)',
            paddingRight: 'var(--safe-right, 0px)',
          }}
          className="fixed top-0 right-0 bottom-0 w-[76px] xl:w-56 bg-[#07070b]/95 backdrop-blur-xl border-l border-white/10 z-50 flex flex-col justify-between px-2.5 xl:px-3.5 select-none"
        >
          <div className="space-y-5">
            {/* Brand / Profile Quick Entry */}
            <button
              onClick={() => (user ? onNavigateTo('profile') : signIn('login'))}
              className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition cursor-pointer justify-center xl:justify-start"
              title={user ? 'الملف الشخصي' : 'تسجيل الدخول'}
            >
              {user ? (
                user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt="Profile"
                    className="w-9 h-9 rounded-full object-cover border border-purple-500/40 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center font-black text-xs text-white shrink-0">
                    {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                  </div>
                )
              ) : (
                <div className="w-9 h-9 rounded-full bg-[#FF1744]/15 border border-[#FF1744]/30 flex items-center justify-center text-[#FF1744] shrink-0">
                  <UserCircle size={20} />
                </div>
              )}
              <div className="hidden xl:flex flex-col items-start min-w-0">
                <span className="text-sm font-black text-white truncate">
                  أنمي <span className="text-blue-400">MOD</span>
                </span>
                <span className="text-[11px] text-neutral-400 truncate max-w-[125px]">
                  {user ? user.displayName || 'حسابي' : 'تسجيل الدخول'}
                </span>
              </div>
            </button>

            {/* Primary Navigation Links */}
            <nav className="flex flex-col gap-1.5">
              {navItems.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    title={tab.label}
                    className={`w-full min-h-[44px] flex items-center gap-3 px-3 py-2.5 rounded-xl transition cursor-pointer justify-center xl:justify-start ${
                      isActive
                        ? 'bg-[#FF1744]/15 text-white border border-[#FF1744]/35 font-black'
                        : 'text-neutral-400 hover:text-white hover:bg-white/5 font-bold border border-transparent'
                    }`}
                  >
                    <Icon
                      strokeWidth={isActive ? 2.4 : 2}
                      size={20}
                      className={isActive ? 'text-[#FF1744] shrink-0' : 'shrink-0'}
                    />
                    <span className="hidden xl:inline text-xs whitespace-nowrap">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Utility Triggers */}
          <div className="flex flex-col gap-1.5 border-t border-white/10 pt-3">
            <button
              onClick={handleRandomAnime}
              title="أنمي عشوائي"
              className="w-full min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-xl text-orange-400 hover:bg-orange-500/10 transition cursor-pointer justify-center xl:justify-start"
            >
              <Shuffle size={18} className="shrink-0" />
              <span className="hidden xl:inline text-xs font-bold whitespace-nowrap">أنمي عشوائي</span>
            </button>

            {user && (
              <button
                onClick={() => onNavigateTo('notifications')}
                title="الإشعارات"
                className="w-full min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-xl text-blue-400 hover:bg-blue-500/10 transition cursor-pointer relative justify-center xl:justify-start"
              >
                <div className="relative shrink-0">
                  <Bell size={18} />
                  {unreadNotifsCount > 0 && (
                    <span className="absolute -top-1.5 -left-1.5 bg-red-600 text-white text-[10px] font-black min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center border border-black tabular-nums">
                      {unreadNotifsCount > 99 ? '99+' : unreadNotifsCount}
                    </span>
                  )}
                </div>
                <span className="hidden xl:inline text-xs font-bold whitespace-nowrap">الإشعارات</span>
              </button>
            )}

            <button
              onClick={() => window.dispatchEvent(new Event('open-ai-chat'))}
              title="صديقك الأوتاكو"
              className="w-full min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-500/10 transition cursor-pointer justify-center xl:justify-start"
            >
              <Bot size={18} className="shrink-0" />
              <span className="hidden xl:inline text-xs font-bold whitespace-nowrap">صديقك الأوتاكو</span>
            </button>
          </div>
        </aside>
      )}

      {/* Mobile / Cover Screen Floating Top Bar on Home */}
      {!useSideRail && activeTab === 'home' && (
        <div
          style={{
            paddingTop: 'calc(var(--safe-top, 0px) + 0.65rem)',
            paddingLeft: 'calc(var(--safe-left, 0px) + 0.75rem)',
            paddingRight: 'calc(var(--safe-right, 0px) + 0.75rem)',
          }}
          className={`fixed top-0 left-0 right-0 w-full z-50 bg-transparent flex justify-between items-center gap-2 transition-all duration-200 pointer-events-none ${
            showNav ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
          }`}
        >
          <div className="theme-keep-dark flex items-center gap-2 bg-black/70 backdrop-blur-md px-2.5 sm:px-3.5 py-1.5 rounded-full border border-white/15 shadow-xl pointer-events-auto min-w-0">
            {user ? (
              user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt="Profile"
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border border-purple-500/30 cursor-pointer shrink-0"
                  onClick={() => onNavigateTo('profile')}
                />
              ) : (
                <div
                  onClick={() => onNavigateTo('profile')}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center font-black text-xs cursor-pointer shrink-0"
                >
                  {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                </div>
              )
            ) : (
              <button
                onClick={() => signIn('login')}
                className="px-2.5 py-1 rounded-full bg-gradient-to-r from-[#FF1744] to-purple-600 text-white text-[11px] font-black cursor-pointer whitespace-nowrap shrink-0"
              >
                دخول
              </button>
            )}
            <h1
              className="text-xs sm:text-sm font-black tracking-tight text-white cursor-pointer whitespace-nowrap truncate"
              onClick={() => (user ? onNavigateTo('profile') : signIn('login'))}
            >
              أنمي <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">MOD</span>
            </h1>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto shrink-0">
            {user && (
              <button
                onClick={() => onNavigateTo('notifications')}
                aria-label="الإشعارات"
                className="w-9 h-9 rounded-full bg-blue-600/30 backdrop-blur-md border border-blue-500/30 flex items-center justify-center text-blue-400 hover:bg-blue-600 hover:text-white transition relative cursor-pointer"
              >
                <Bell size={16} />
                {unreadNotifsCount > 0 && (
                  <span className="absolute -top-1 -left-1 bg-red-600 text-white text-[10px] font-black min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center border border-black tabular-nums">
                    {unreadNotifsCount > 99 ? '99+' : unreadNotifsCount}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={handleRandomAnime}
              aria-label="أنمي عشوائي"
              className="w-9 h-9 rounded-full bg-orange-600/30 backdrop-blur-md border border-orange-500/30 flex items-center justify-center text-orange-400 hover:bg-orange-600 hover:text-white transition cursor-pointer"
            >
              <Shuffle size={16} />
            </button>
            <button
              onClick={() => window.dispatchEvent(new Event('open-ai-chat'))}
              aria-label="صديقك الأوتاكو"
              className="w-9 h-9 rounded-full bg-rose-600/30 backdrop-blur-md border border-rose-500/30 flex items-center justify-center text-rose-400 hover:bg-rose-600 hover:text-white transition cursor-pointer"
            >
              <Bot size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main
        className={`w-full h-full ${useSideRail ? 'mt-0' : '-mt-16'}`}
        style={{
          paddingTop: !useSideRail && activeTab !== 'home' ? 'var(--safe-top, 0px)' : useSideRail ? 'var(--safe-top, 0px)' : '0px',
          paddingRight: useSideRail ? '0px' : 'var(--safe-right, 0px)',
        }}
      >
        {children}
      </main>

      {showNotifications && (
        <NotificationsModal
          onClose={() => setShowNotifications(false)}
          onNavigate={(route, params) => {
            setShowNotifications(false);
            onNavigateTo(route, params);
          }}
        />
      )}

      {/* Thumb-Zone Floating Bottom Nav for Phones, Cover Screens & Tabletop Posture */}
      {!useSideRail && (
        <div
          style={{ bottom: 'calc(var(--safe-bottom, 0px) + 0.75rem)' }}
          className={`app-bottom-dock fixed left-0 right-0 mx-auto w-[calc(100%-1.5rem)] max-w-[440px] bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl py-1.5 px-2 shadow-[0_10px_40px_rgba(0,0,0,0.85)] z-50 transition-all duration-300 ${
            showNav ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex justify-between items-center w-full">
            {navItems.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center justify-center min-h-[44px] py-1 px-1 rounded-xl transition-all duration-200 flex-1 cursor-pointer ${
                    isActive
                      ? 'text-blue-400'
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  <Icon strokeWidth={isActive ? 2.5 : 2} size={isActive ? 22 : 20} className="transition-all" />
                  <span
                    className={`text-[10px] font-bold mt-0.5 whitespace-nowrap ${
                      isActive ? 'opacity-100' : display.isCoverScreen ? 'hidden' : 'opacity-70'
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
