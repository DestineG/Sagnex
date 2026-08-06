import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Sagnex] 页面渲染失败', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return <main className="fatal-error" role="alert">
      <div>
        <p className="fatal-error-kicker">SAGNEX</p>
        <h1>页面暂时无法显示</h1>
        <p>应用遇到了未预料的数据或渲染错误。刷新后仍未恢复时，请检查服务日志。</p>
        <code>{this.state.error.message}</code>
        <button className="button primary" type="button" onClick={() => window.location.reload()}>刷新页面</button>
      </div>
    </main>;
  }
}
