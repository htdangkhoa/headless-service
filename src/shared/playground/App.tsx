import React, { useCallback, useEffect, useRef } from 'react';
import { Editor } from './components';

const WIDTH_OFFSET = 375;

export const App = () => {
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

  return (
    <>
      <header className="h-14 flex justify-between p-3">
        <div></div>
        <button
          type="button"
          className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-full text-sm p-2.5 text-center inline-flex items-center me-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
        >
          Run
        </button>
      </header>

      <main className="flex flex-1 flex-row h-full">
        <Editor ref={editorRef} className="w-1/2 h-full relative" />

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
