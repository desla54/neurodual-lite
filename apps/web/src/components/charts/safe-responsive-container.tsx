import {
  cloneElement,
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

interface SafeResponsiveContainerProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}

function hasPositiveSize(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getElementSize(element: HTMLElement): { width: number; height: number } {
  const rect = element.getBoundingClientRect();
  return {
    width: Math.floor(rect.width),
    height: Math.floor(rect.height),
  };
}

export function SafeResponsiveContainer({
  children,
  className,
  style,
}: SafeResponsiveContainerProps): ReactNode {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      if (!hasPositiveSize(element)) {
        setSize({ width: 0, height: 0 });
        return;
      }
      setSize(getElementSize(element));
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const chart =
    size.width > 0 && size.height > 0 && isValidElement(children)
      ? cloneElement(children, {
          width: size.width,
          height: size.height,
        } as { width: number; height: number })
      : null;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%', minWidth: 0, ...style }}
    >
      {chart}
    </div>
  );
}
