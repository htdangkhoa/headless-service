import React, { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as monaco from 'monaco-editor';
import dedent from 'dedent';

const nodeTypes = (require as any).context('!!raw-loader!@types/node/', true, /\.d.ts$/);
const puppeteerTypes = require('!!raw-loader!puppeteer-core/lib/types.d.ts');

export type EditorProps = {
  className?: string;
};

declare global {
  interface Window {
    MonacoEnvironment: any;
  }
}

export const Editor = forwardRef<HTMLDivElement | null, EditorProps>(({ className }, ref) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>();

  useLayoutEffect(() => {
    self.MonacoEnvironment = {
      getWorkerUrl: function (_moduleId: any, label: string) {
        if (label === 'typescript' || label === 'javascript') {
          return './ts.worker.bundle.js';
        }
        return './editor.worker.bundle.js';
      },
    };

    nodeTypes.keys().forEach((key: string) => {
      monaco.languages.typescript.typescriptDefaults.addExtraLib(
        nodeTypes(key).default,
        'node_modules/@types/node/' + key.substring(2)
      );
    });

    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      puppeteerTypes.default
        .replace(`import type { ChildProcess } from 'child_process';`, '')
        .replace(`import { PassThrough } from 'stream';`, '')
        .replace(`import { Protocol } from 'devtools-protocol';`, '')
        .replace(
          `import type { ProtocolMapping } from 'devtools-protocol/types/protocol-mapping.js';`,
          ''
        )
        .replace(/export /g, 'declare '),
      'node_modules/@types/puppeteer/index.d.ts'
    );
  }, []);

  useEffect(() => {
    if (editorRef) {
      setEditor((e) => {
        if (e) return e;

        return monaco.editor.create(editorRef.current!, {
          value: dedent`
          export default async function ({ page }: { page: Page }) {
            await page.goto('https://example.com', {
              waitUntil: 'domcontentloaded',
            });
            const title = await page.title();
            return { title };
          };
        `,
          language: 'typescript',
          theme: 'vs-dark',
          // automaticLayout: true,
          minimap: {
            enabled: false,
          },
        });
      });
    }

    return () => {
      editor?.dispose();
    };
  }, [editorRef.current]);

  useEffect(() => {
    if (editorRef.current && editor) {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        requestAnimationFrame(() => {
          editor.layout({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
      });

      observer.observe(editorRef.current);

      return () => {
        observer.disconnect();
      };
    }
  }, [editorRef.current, editor]);

  return (
    <div
      ref={(val) => {
        editorRef.current = val;
        if (typeof ref === 'function') {
          ref(val);
        } else if (ref) {
          ref.current = val;
        }
      }}
      className={className}
    ></div>
  );
});
