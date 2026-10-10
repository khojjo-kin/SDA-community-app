// Types for the shared src/lib/calls.tsx as the desktop uses it. The type check reads this instead
// of the file itself, because that file imports the iPhone call screen by relative path (the build
// swaps in src/ui/callscreen.tsx; see build.mjs).
import type React from 'react';
export type CallsApi = { startCall: (calleeId: string, kind: 'voice' | 'video', threadId?: string | null) => Promise<void>; inCall: boolean };
export declare function useCalls(): CallsApi;
export declare function CallProvider(props: { children: React.ReactNode }): React.ReactElement;
