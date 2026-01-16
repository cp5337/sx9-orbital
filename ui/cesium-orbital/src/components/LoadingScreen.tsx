import { Globe, Loader2 } from 'lucide-react';
import { Card, CardContent } from './ui/card';

interface LoadingScreenProps {
  message?: string;
  subMessage?: string;
}

export function LoadingScreen({ message = 'Loading...', subMessage }: LoadingScreenProps) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-950">
      <Card className="bg-slate-900/90 border-slate-700 backdrop-blur max-w-md w-full">
        <CardContent className="pt-6 pb-6">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="relative">
              <Globe className="w-16 h-16 text-blue-400 animate-pulse" />
              <Loader2 className="w-8 h-8 text-cyan-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-lg font-semibold text-slate-200">{message}</p>
              {subMessage && (
                <p className="text-sm text-slate-400">{subMessage}</p>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0s' }} />
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
