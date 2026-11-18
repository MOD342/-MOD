import React from 'react';
import SupportPortalView from './SupportPortalView';

interface AdSupportViewProps {
  onBack: () => void;
}

export default function AdSupportView({ onBack }: AdSupportViewProps) {
  return <SupportPortalView onBack={onBack} initialTab="ad_support" />;
}
