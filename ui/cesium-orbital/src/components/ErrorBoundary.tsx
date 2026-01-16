import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
          <Card className="max-w-2xl w-full bg-slate-900 border-red-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-red-400">
                <AlertTriangle className="w-6 h-6" />
                Application Error
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <p className="text-sm font-semibold text-red-300 mb-2">Error Message:</p>
                <p className="text-sm text-slate-300 font-mono">
                  {this.state.error?.message || 'An unexpected error occurred'}
                </p>
              </div>

              {this.state.error?.stack && (
                <details className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                  <summary className="text-sm font-semibold text-slate-300 cursor-pointer">
                    Stack Trace
                  </summary>
                  <pre className="text-xs text-slate-400 mt-2 overflow-x-auto whitespace-pre-wrap">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}

              {this.state.errorInfo?.componentStack && (
                <details className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                  <summary className="text-sm font-semibold text-slate-300 cursor-pointer">
                    Component Stack
                  </summary>
                  <pre className="text-xs text-slate-400 mt-2 overflow-x-auto whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}

              <div className="flex gap-3">
                <Button onClick={this.handleReset} className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Reload Application
                </Button>
              </div>

              <div className="text-xs text-slate-500 bg-slate-800/50 border border-slate-700 rounded p-3">
                <p className="font-semibold mb-1">Troubleshooting Tips:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Check the browser console (F12) for more details</li>
                  <li>Verify all environment variables are set correctly</li>
                  <li>Ensure Supabase database is properly configured</li>
                  <li>Check that Cesium token is valid</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
