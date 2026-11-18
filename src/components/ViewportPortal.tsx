import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders modals, dialogs, and floating toast notifications directly inside document.body
 * so ancestor transforms, scroll offsets, or overflow rules never shift fixed overlays off-screen.
 */
export const ViewportPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (typeof document === 'undefined' || !document.body) {
    return <>{children}</>;
  }
  return createPortal(children, document.body);
};

export default ViewportPortal;
