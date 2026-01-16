import { useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface DiagnosticCheck {
  name: string;
  status: 'success' | 'error' | 'warning' | 'loading';
  message: string;
  details?: string;
}

interface DiagnosticPanelProps {
  checks: DiagnosticCheck[];
  onClose?: () => void;
}

function StatusIcon({ status }: { status: DiagnosticCheck['status'] }) {
  switch (status) {
    case 'success':
      return <CheckCircle className="w-5 h-5 text-green-400" />;
    case 'error':
      return <XCircle className="w-5 h-5 text-red-400" />;
    case 'warning':
      return <AlertCircle className="w-5 h-5 text-yellow-400" />;
    case 'loading':
      return <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />;
  }
}

export function DiagnosticPanel({ checks, onClose }: DiagnosticPanelProps) {
  const [expandedChecks, setExpandedChecks] = useState<Set<number>>(new Set());

  const toggleExpand = (index: number) => {
    setExpandedChecks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const errorCount = checks.filter((c) => c.status === 'error').length;
  const warningCount = checks.filter((c) => c.status === 'warning').length;
  const successCount = checks.filter((c) => c.status === 'success').length;

  return (
    <Card className="bg-slate-900/95 border-slate-700 backdrop-blur max-w-2xl w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">System Diagnostics</CardTitle>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
        <div className="flex gap-4 text-sm mt-2">
          <span className="text-green-400">{successCount} OK</span>
          <span className="text-yellow-400">{warningCount} Warnings</span>
          <span className="text-red-400">{errorCount} Errors</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {checks.map((check, index) => (
            <div
              key={index}
              className="bg-slate-800 border border-slate-700 rounded-lg p-3"
            >
              <div className="flex items-start gap-3">
                <StatusIcon status={check.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm text-slate-200">
                      {check.name}
                    </p>
                    {check.details && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpand(index)}
                        className="h-6 w-6 p-0"
                      >
                        {expandedChecks.has(index) ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{check.message}</p>
                  {check.details && expandedChecks.has(index) && (
                    <pre className="text-xs text-slate-400 mt-2 bg-slate-900 p-2 rounded overflow-x-auto">
                      {check.details}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
