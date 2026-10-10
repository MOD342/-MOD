import React, { useEffect, useRef } from 'react';

interface AdScriptRunnerProps {
  scriptCode: string;
  compact?: boolean;
}

export default function AdScriptRunner({ scriptCode, compact = false }: AdScriptRunnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !scriptCode) return;

    // Clear previous elements
    containerRef.current.innerHTML = '';

    try {
      // Create a document fragment to parse the HTML and extract scripts
      const range = document.createRange();
      const fragment = range.createContextualFragment(scriptCode);

      // Extract scripts
      const scripts = Array.from(fragment.querySelectorAll('script'));

      // Copy other non-script HTML elements (e.g., ins, iframe, div) to the DOM first
      const nonScripts = Array.from(fragment.childNodes).filter(node => node.nodeName !== 'SCRIPT');
      nonScripts.forEach(node => {
        containerRef.current?.appendChild(node.cloneNode(true));
      });

      // Rebuild and append each script element sequentially to force browser compilation & execution
      scripts.forEach(oldScript => {
        const newScript = document.createElement('script');

        // Copy all attributes (e.g. src, data-zone, async, defer, type, data-cfasync)
        Array.from(oldScript.attributes).forEach(attr => {
          newScript.setAttribute(attr.name, attr.value);
        });

        // Set inner content/inline script source (supports Adsterra atOptions, Google, A-Ads, etc.)
        if (oldScript.textContent) {
          newScript.textContent = oldScript.textContent;
        }

        containerRef.current?.appendChild(newScript);
      });
    } catch (e) {
      console.error('Failed to dynamically evaluate ad script code:', e);
      if (containerRef.current) {
        containerRef.current.innerHTML = scriptCode;
      }
    }

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [scriptCode]);

  return (
    <div
      ref={containerRef}
      className={`w-full flex flex-col items-center justify-center overflow-hidden text-zinc-100 mx-auto rounded-xl ${
        compact ? 'min-h-[50px] max-w-[320px]' : 'min-h-[90px] max-w-[340px]'
      }`}
      id="dynamic_ad_script_container"
    />
  );
}

