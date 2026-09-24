import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import DocumentRenderer from './DocumentRenderer.jsx';

const MM_TO_PX = 96 / 25.4;
const PAGE_WIDTH_PX = 210 * MM_TO_PX;

/**
 * A4 paper preview that scales down to fit its container on screen.
 * In print the scaling wrapper is neutralised by print.css so output is 1:1.
 */
export default function PagePreview({ payload, maxScale = 1 }) {
  const outer = useRef(null);
  const inner = useRef(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = outer.current;
    if (!el) return undefined;
    const update = () => {
      const available = el.clientWidth - 2;
      setScale(Math.min(maxScale, Math.max(0.3, available / PAGE_WIDTH_PX)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxScale]);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return undefined;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="page-preview" ref={outer}>
      <div className="page-preview-sizer" style={{ height: height * scale, width: PAGE_WIDTH_PX * scale }}>
        <div className="page-preview-paper print-root" ref={inner} style={{ transform: `scale(${scale})` }}>
          <DocumentRenderer payload={payload} />
        </div>
      </div>
    </div>
  );
}
