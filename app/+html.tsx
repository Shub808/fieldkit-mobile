import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/** Web-only document shell: viewport, scroll reset and the authorship mark. */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="author" content="Shubham Naik" />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `body::after{content:"\\00a9  2026 Shubham Naik \\00b7  Portfolio project";position:fixed;right:10px;bottom:6px;z-index:50;font:500 11px/1 ui-monospace,Menlo,monospace;opacity:.5;pointer-events:none;user-select:none}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
