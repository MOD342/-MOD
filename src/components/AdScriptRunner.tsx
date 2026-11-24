import React, { useMemo } from 'react';

interface AdScriptRunnerProps {
  scriptCode: string;
  compact?: boolean;
}

/**
 * Renders sponsor HTML/script snippets strictly inside an isolated sandboxed iframe
 * (without allow-same-origin) so third-party ad markup cannot access the parent DOM,
 * authentication tokens, localStorage, or window.AndroidNativeBridge.
 */
export default function AdScriptRunner({ scriptCode, compact = false }: AdScriptRunnerProps) {
  const safeSrcDoc = useMemo(() => {
    const raw = String(scriptCode || '').trim();
    if (!raw) return '';
    return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 4px;
      background: transparent;
      color: #f4f4f5;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100%;
      overflow: hidden;
    }
  </style>
</head>
<body>${raw}</body>
</html>`;
  }, [scriptCode]);

  if (!safeSrcDoc) return null;

  return (
    <iframe
      title="Sponsored Content Frame"
      srcDoc={safeSrcDoc}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      className={`w-full border-0 mx-auto rounded-xl bg-transparent ${
        compact ? 'min-h-[60px] max-w-[320px]' : 'min-h-[240px] max-w-3xl'
      }`}
      id="dynamic_ad_script_container"
    />
  );
}
