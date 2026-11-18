import React, { useEffect, useRef } from 'react';

interface AdScriptRunnerProps {
  scriptCode: string;
  compact?: boolean;
}

export default function AdScriptRunner({ scriptCode, compact = false }: AdScriptRunnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !scriptCode) return;

    container.innerHTML = '';

    try {
      const range = document.createRange();
      const fragment = range.createContextualFragment(scriptCode);

      const childNodes = Array.from(fragment.childNodes);

      // Append nodes in exact source order so container divs (e.g. NativeBanner) & scripts stay paired
      childNodes.forEach(node => {
        if (node.nodeName === 'SCRIPT') {
          const oldScript = node as HTMLScriptElement;
          const newScript = document.createElement('script');

          Array.from(oldScript.attributes).forEach(attr => {
            newScript.setAttribute(attr.name, attr.value);
          });

          // Preserve strict execution order for atOptions + invoke.js bundles
          if (!oldScript.hasAttribute('async')) {
            newScript.async = false;
          }

          if (oldScript.textContent) {
            newScript.textContent = oldScript.textContent;
          }

          container.appendChild(newScript);
        } else {
          container.appendChild(node.cloneNode(true));
        }
      });
    } catch (e) {
      console.error('Failed to dynamically evaluate ad script code:', e);
      container.innerHTML = scriptCode;
    }

    return () => {
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [scriptCode]);

  return (
    <div
      ref={containerRef}
      className={`w-full flex flex-col items-center justify-center overflow-x-hidden overflow-y-auto text-zinc-100 mx-auto rounded-xl ${
        compact ? 'min-h-[50px] max-w-[320px]' : 'min-h-[160px] max-w-3xl'
      }`}
      id="dynamic_ad_script_container"
    />
  );
}
