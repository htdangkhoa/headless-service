import React, { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { editor, languages, IDisposable } from 'monaco-editor';

import { Nullable } from '@/types';

const nodeTypes = (require as any).context('!!raw-loader!@types/node/', true, /\.d.ts$/);
const puppeteerTypes = require('!!raw-loader!puppeteer-core/lib/types.d.ts');

export type EditorProps = {
  className?: string;
  value?: string;
  onChange?: (value: string | undefined, ev: editor.IModelContentChangedEvent) => void;
};

declare global {
  interface Window {
    MonacoEnvironment: any;
  }
}

export const Editor = forwardRef<Nullable<HTMLDivElement>, EditorProps>(
  ({ className, value, onChange }, ref) => {
    const divRef = useRef<Nullable<HTMLDivElement>>(null);
    const [isEditorReady, setIsEditorReady] = useState<boolean>(false);
    const subscriptionRef = useRef<Nullable<IDisposable>>(null);
    // const [editorRef, setEditorRef] = useState<Nullable<editor.IStandaloneCodeEditor>>(null);
    const editorRef = useRef<Nullable<editor.IStandaloneCodeEditor>>(null);

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
        languages.typescript.typescriptDefaults.addExtraLib(
          nodeTypes(key).default,
          'node_modules/@types/node/' + key.substring(2)
        );
      });

      languages.typescript.typescriptDefaults.addExtraLib(
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

    const disposeEditor = () => {
      subscriptionRef.current?.dispose();

      editorRef.current?.dispose();
    };

    useEffect(() => {
      return () => disposeEditor();
    }, []);

    useEffect(() => {
      if (divRef && !isEditorReady) {
        editorRef.current = editor.create(divRef.current!, {
          value,
          language: 'typescript',
          theme: 'vs-dark',
          // automaticLayout: true,
          minimap: {
            enabled: false,
          },
        });
        setIsEditorReady(true);
      }
    }, [isEditorReady, value]);

    useEffect(() => {
      if (isEditorReady && editor && onChange) {
        subscriptionRef.current?.dispose?.();
        subscriptionRef.current = editorRef.current!.onDidChangeModelContent((event) => {
          onChange(editorRef.current!.getValue(), event);
        });
      }
    }, [isEditorReady, editor, onChange]);

    useEffect(() => {
      if (divRef.current && editorRef) {
        const observer = new ResizeObserver((entries) => {
          const entry = entries[0];
          requestAnimationFrame(() => {
            editorRef.current!.layout({
              width: entry.contentRect.width,
              height: entry.contentRect.height,
            });
          });
        });

        observer.observe(divRef.current);

        return () => {
          observer.disconnect();
        };
      }
    }, [divRef.current, editorRef]);

    return (
      <div
        ref={(val) => {
          divRef.current = val;
          if (typeof ref === 'function') {
            ref(val);
          } else if (ref) {
            ref.current = val;
          }
        }}
        className={className}
      ></div>
    );
  }
);
