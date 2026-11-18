import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Stethoscope } from 'lucide-react';
import { openDiagnosticsScreen, recordTelemetryError } from '../utils/errorTelemetry';

interface GlobalErrorBoundaryProps {
  children: ReactNode;
}

interface GlobalErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  errorStack: string;
}

export class GlobalErrorBoundary extends Component<
  GlobalErrorBoundaryProps,
  GlobalErrorBoundaryState
> {
  declare props: Readonly<GlobalErrorBoundaryProps>;
  declare state: GlobalErrorBoundaryState;
  declare setState: (
    updater:
      | Partial<GlobalErrorBoundaryState>
      | ((prevState: GlobalErrorBoundaryState) => Partial<GlobalErrorBoundaryState>),
    callback?: () => void
  ) => void;

  constructor(props: GlobalErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      errorStack: '',
    };
  }

  static getDerivedStateFromError(error: Error): GlobalErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'حدث خطأ غير متوقع في عرض الصفحة',
      errorStack: error?.stack || '',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    recordTelemetryError({
      source: 'react',
      severity: 'error',
      title: 'انهيار مكوّن واجهة (React ErrorBoundary)',
      message: error?.message || 'React render failure',
      stack: error?.stack,
      details: errorInfo?.componentStack || undefined,
    });
  }

  private handleOpenDiagnostics = () => {
    this.setState({ hasError: false, errorMessage: '', errorStack: '' }, () => {
      openDiagnosticsScreen('errors');
    });
  };

  private handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '', errorStack: '' });
  };

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      const isChunkError =
        this.state.errorMessage.includes('Failed to fetch dynamically imported module') ||
        this.state.errorMessage.includes('Importing a module script failed') ||
        this.state.errorMessage.includes('Loading chunk');

      return (
        <div
          className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-5 font-sans"
          dir="rtl"
        >
          <div className="max-w-lg w-full bg-zinc-900 border border-rose-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h1 className="text-base font-black text-white">
                  {isChunkError ? 'تحتاج الصفحة لتحديث سريع لإعادة تحميل الملفات' : 'تم رصد خطأ في تشغيل الواجهة'}
                </h1>
                <p className="text-xs text-zinc-400 mt-0.5">
                  تم تسجيل التفاصيل تلقائياً وتوجيهها إلى مركز التشخيص وفحص الشذوذ.
                </p>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-left" dir="ltr">
              <p className="text-xs font-mono text-rose-300 break-words">
                {this.state.errorMessage}
              </p>
              {this.state.errorStack && (
                <pre className="text-[10px] font-mono text-zinc-500 mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap break-all">
                  {this.state.errorStack}
                </pre>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                onClick={this.handleOpenDiagnostics}
                className="flex-1 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold py-3 px-4 rounded-xl transition cursor-pointer"
              >
                <Stethoscope size={16} />
                <span>فتح شاشة الأخطاء وتقرير الذكاء الاصطناعي</span>
              </button>
              <button
                type="button"
                onClick={isChunkError ? this.handleReload : this.handleRetry}
                className="flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold py-3 px-4 rounded-xl transition cursor-pointer border border-zinc-700"
              >
                <RotateCcw size={15} />
                <span>{isChunkError ? 'تحديث الصفحة' : 'إعادة المحاولة'}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface ViewErrorBoundaryProps {
  children: ReactNode;
  viewName?: string;
  resetKey?: string | number;
  onGoHome?: () => void;
}

interface ViewErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ViewErrorBoundary extends Component<
  ViewErrorBoundaryProps,
  ViewErrorBoundaryState
> {
  declare props: Readonly<ViewErrorBoundaryProps>;
  declare state: ViewErrorBoundaryState;
  declare setState: (
    updater:
      | Partial<ViewErrorBoundaryState>
      | ((prevState: ViewErrorBoundaryState) => Partial<ViewErrorBoundaryState>),
    callback?: () => void
  ) => void;

  constructor(props: ViewErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): ViewErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'حدث خطأ أثناء عرض هذه الصفحة',
    };
  }

  componentDidUpdate(prevProps: ViewErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    recordTelemetryError({
      source: 'react',
      severity: 'error',
      title: `خطأ في شاشة (${this.props.viewName || 'unknown'})`,
      message: error?.message || 'View render error',
      stack: error?.stack,
      details: errorInfo?.componentStack || undefined,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-[70vh] bg-black text-zinc-100 flex items-center justify-center p-5 font-sans"
          dir="rtl"
        >
          <div className="max-w-md w-full bg-zinc-900/95 border border-rose-500/30 rounded-2xl p-5 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
              <AlertTriangle size={24} />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-black text-white">تعذر عرض هذه الصفحة مؤقتاً</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {this.state.errorMessage}
              </p>
            </div>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, errorMessage: '' })}
                className="flex-1 flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition cursor-pointer"
              >
                <RotateCcw size={14} />
                <span>إعادة المحاولة</span>
              </button>
              {this.props.onGoHome && (
                <button
                  type="button"
                  onClick={() => {
                    this.setState({ hasError: false, errorMessage: '' });
                    this.props.onGoHome?.();
                  }}
                  className="flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold py-2.5 px-4 rounded-xl transition cursor-pointer border border-zinc-700"
                >
                  <span>الرئيسية</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
