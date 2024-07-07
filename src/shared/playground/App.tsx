import React, { useCallback, useEffect, useRef, useState } from 'react';
import dedent from 'dedent';

import { Editor } from './components';
import { Optional } from '@/types';

const WIDTH_OFFSET = 375;

const INITIAL_CODE = dedent`
  export default async function ({ page }: { page: Page }) {
    await page.goto('https://example.com', {
      waitUntil: 'domcontentloaded',
    });
    const title = await page.title();
    return { title };
  };
`;

export const App = () => {
  const [code, setCode] = useState<Optional<string>>(INITIAL_CODE);

  const editorRef = useRef<HTMLDivElement>(null);
  const resizerRef = useRef<HTMLDivElement>(null);
  const liveViewRef = useRef<HTMLIFrameElement>(null);

  const onHorizontalResize = useCallback((e: MouseEvent) => {
    e.preventDefault();

    let onMouseMove: any = (mouseEvent: MouseEvent) => {
      if (mouseEvent.buttons === 0) return;

      let posX = mouseEvent.clientX;

      if (posX < WIDTH_OFFSET) {
        posX = WIDTH_OFFSET;
      }

      const fromRight = window.innerWidth - posX;

      if (fromRight < WIDTH_OFFSET) {
        posX = window.innerWidth - WIDTH_OFFSET;
      }

      editorRef.current!.style.width = `${posX}px`;
      liveViewRef.current!.style.width = `${fromRight}px`;
      editorRef.current!.classList.add('pointer-events-none');
      liveViewRef.current!.classList.add('pointer-events-none');
    };

    let onMouseUp: any = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      onMouseMove = null;
      onMouseUp = null;
      editorRef.current!.classList.remove('pointer-events-none');
      liveViewRef.current!.classList.remove('pointer-events-none');
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  const onResetSize = useCallback(() => {
    editorRef.current!.style.removeProperty('width');
    liveViewRef.current!.style.removeProperty('width');
  }, []);

  useEffect(() => {
    resizerRef.current?.addEventListener('mousedown', onHorizontalResize);
    resizerRef.current?.addEventListener('dblclick', onResetSize);

    return () => {
      resizerRef.current?.removeEventListener('mousedown', onHorizontalResize);
      resizerRef.current?.removeEventListener('dblclick', onResetSize);
    };
  }, [resizerRef]);

  const handleRun = useCallback(async () => {
    console.log('Run code', code);
  }, [code]);

  return (
    <>
      <header className="h-14 flex justify-between p-3">
        <div></div>
        <button
          type="button"
          className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-full text-sm p-2.5 text-center inline-flex items-center me-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
          onClick={handleRun}
        >
          Run
        </button>
      </header>

      <main className="flex flex-1 flex-row h-full">
        <Editor
          ref={editorRef}
          className="w-1/2 h-full relative"
          value={code}
          onChange={(v) => setCode(v)}
        />

        <div ref={resizerRef} className="w-1 h-full bg-[#555] cursor-col-resize"></div>

        <iframe
          ref={liveViewRef}
          className="flex flex-1 flex-col w-full h-full"
          src="https://example.com"
        />
      </main>
    </>
  );
};
