import type { Label } from '@sagnex/contracts';
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { getLabelDisplayColor, LabelIconView } from './LabelIcon';

const TAG_GAP = 6;

export type TagRowLayout = { rows: number[][]; hidden: number[] };

export function layoutTagRows(widths: number[], availableWidth: number, overflowWidth: number): TagRowLayout {
  if (widths.length === 0) return { rows: [[], []], hidden: [] };
  if (widths.length === 1) return { rows: [[0], []], hidden: [] };

  function pack(reserveOverflow: boolean): TagRowLayout {
    const rows: number[][] = [[], []];
    const used = [0, 0];
    const secondRowCapacity = Math.max(0, availableWidth - (reserveOverflow ? overflowWidth + TAG_GAP : 0));
    const capacities = [availableWidth, secondRowCapacity];
    const hidden: number[] = [];
    let currentRow = 0;

    widths.forEach((width, index) => {
      if (width > availableWidth) {
        hidden.push(index);
        return;
      }
      for (let row = currentRow; row < 2; row += 1) {
        const nextWidth = used[row]! + (rows[row]!.length > 0 ? TAG_GAP : 0) + width;
        if (nextWidth <= capacities[row]!) {
          rows[row]!.push(index);
          used[row] = nextWidth;
          currentRow = row;
          return;
        }
      }
      hidden.push(index);
    });
    return { rows, hidden };
  }

  const fullLayout = pack(false);
  return fullLayout.hidden.length === 0 ? fullLayout : pack(true);
}

function TagChip({ label, measure = false }: { label: Label; measure?: boolean }) {
  return <span
    className="tag label-tag"
    title={measure ? undefined : label.name}
    data-tag-measure={measure ? '' : undefined}
    style={{ '--label-color': getLabelDisplayColor(label) } as CSSProperties}
  >
    <span className="label-tag-icon"><LabelIconView icon={label.icon} /></span>
    <span className="tag-name">{label.name}</span>
  </span>;
}

export function EventTagSummary({ labels, className = '', onOpen }: { labels: Label[]; className?: string; onOpen?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<TagRowLayout>(() => labels.length === 1 ? { rows: [[0], []], hidden: [] } : { rows: [[], []], hidden: labels.map((_, index) => index) });
  const labelKey = useMemo(() => labels.map((label) => `${label.id}:${label.name}:${label.icon}`).join('|'), [labels]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measurer = measureRef.current;
    if (!container || !measurer) return;

    const update = () => {
      const availableWidth = container.clientWidth;
      const widths = [...measurer.querySelectorAll<HTMLElement>('[data-tag-measure]')].map((element) => element.getBoundingClientRect().width);
      const overflowWidth = measurer.querySelector<HTMLElement>('[data-overflow-measure]')?.getBoundingClientRect().width ?? 32;
      if (availableWidth > 0 && widths.length === labels.length) setLayout(layoutTagRows(widths, availableWidth, overflowWidth));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [labelKey, labels.length]);

  if (labels.length === 0) return <div className={`event-tag-summary empty ${className}`}><span className="muted">未分类</span></div>;

  return <div
    ref={containerRef}
    className={`event-tag-summary ${labels.length === 1 ? 'single' : ''} ${className}`}
    onClick={(event) => {
      if ((event.target as HTMLElement).closest('details')) event.stopPropagation();
      else onOpen?.();
    }}
  >
    <div ref={measureRef} className="event-tag-measure" aria-hidden="true">
      {labels.map((label) => <TagChip key={label.id} label={label} measure />)}
      <span className="tag tag-count" data-overflow-measure>+{labels.length}</span>
    </div>
    {layout.rows.map((row, rowIndex) => <div className="event-tag-row" key={rowIndex}>
      {row.map((index) => <TagChip key={labels[index]!.id} label={labels[index]!} />)}
      {rowIndex === 1 && layout.hidden.length > 0 && <details className="tag-overflow">
        <summary aria-label={`还有 ${layout.hidden.length} 个标签`}>+{layout.hidden.length}</summary>
        <div className="tag-overflow-popover">
          {layout.hidden.map((index) => <TagChip key={labels[index]!.id} label={labels[index]!} />)}
        </div>
      </details>}
    </div>)}
  </div>;
}
