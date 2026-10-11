// The two pieces of react-native that the shared call code uses, for the desktop.
import React from 'react';
import { createPortal } from 'react-dom';

type AppStateValue = 'active' | 'background';

/** "active" while the window is in front, "background" when it is hidden. */
export const AppState = {
  get currentState(): AppStateValue {
    return document.hidden ? 'background' : 'active';
  },
  addEventListener(_type: 'change', fn: (state: AppStateValue) => void) {
    const onChange = () => fn(document.hidden ? 'background' : 'active');
    document.addEventListener('visibilitychange', onChange);
    window.addEventListener('focus', onChange);
    return {
      remove() {
        document.removeEventListener('visibilitychange', onChange);
        window.removeEventListener('focus', onChange);
      },
    };
  },
};

/** A full-window layer above everything, shown while `visible`. */
export function Modal({ visible, children }: { visible: boolean; children?: React.ReactNode; [k: string]: any }) {
  if (!visible) return null;
  return createPortal(<div className="call-layer">{children}</div>, document.body);
}

/** A computer doesn't vibrate when a call rings: the ringtone and the call screen are enough. */
export const Vibration = {
  vibrate(_pattern?: number | number[], _repeat?: boolean) {},
  cancel() {},
};
