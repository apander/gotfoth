"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

type Highlight = { start: number; end: number };
type ReadingState = {
  top?: number;
  left?: number;
  zoom?: number;
  fit?: "page" | "width" | "manual";
  transcript?: boolean;
  highlights?: Record<string, Highlight[]>;
};
export type SourceDeskState = {
  selected?: string;
  selections?: Record<string, string>;
  readers: Record<string, ReadingState>;
  pin?: {
    source: string;
    block: string;
    start?: number;
    end?: number;
    parts?: { block: string; start: number; end: number }[];
  };
};
export const emptySourceDeskState: SourceDeskState = { readers: {} };
type Table = { caption: string; columns: string[]; rows: string[][] };
type Block = {
  id: string;
  text?: string;
  figure?: { id: string; width?: number; height?: number; page?: number };
  table?: Table;
};
type Source = {
  key: string;
  label: string;
  title: string;
  blocks: Block[];
  fileId?: string;
  page?: number;
};

// Frozen content, rather than the question number, identifies a shared source.
function fingerprint(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}
function paragraphs(text: string): Block[] {
  return text
    .split(/\n\s*\n|\n/)
    .filter((line) => line.trim())
    .map((text, i) => ({ id: `text-${i}`, text }));
}
export function questionSources(question: any, resources: any[]): Source[] {
  const sources: Source[] = (question.extracts ?? [])
    .filter((e: any) => e.cited !== false)
    .map((extract: any) => ({
      key: `extract-${fingerprint([extract.label, extract.heading, extract.text, extract.figures])}`,
      label: `Extract ${extract.label}`,
      title:
        extract.heading && extract.heading !== extract.label
          ? extract.heading
          : `Extract ${extract.label}`,
      blocks: [
        ...(extract.figures ?? []).map((figure: any) => ({
          id: `figure-${figure.id}`,
          figure,
        })),
        ...paragraphs(extract.text ?? ""),
      ],
    }));
  for (const resource of resources.filter((r) =>
    question.resourceIds?.includes(r.id),
  )) {
    const key = `resource-${resource.id}-${fingerprint(resource)}`;
    if (resource.text?.trim() || !resource.table)
      sources.push({
        key,
        label: resource.title,
        title: resource.title,
        blocks: paragraphs(resource.text ?? ""),
        fileId: resource.fileId,
        page: resource.pages?.[0],
      });
    if (resource.table)
      sources.push({
        key: `${key}-table`,
        label: resource.table.caption || "Table",
        title: resource.table.caption || resource.title,
        blocks: [{ id: "table", table: resource.table }],
        fileId: resource.fileId,
        page: resource.pages?.[0],
      });
  }
  return sources;
}
export function hasQuestionSources(question: any, resources: any[]) {
  return questionSources(question, resources).length > 0;
}

function MarkedText({
  text,
  ranges = [],
}: {
  text: string;
  ranges?: Highlight[];
}) {
  const points = [
    ...new Set([
      0,
      text.length,
      ...ranges.flatMap((r) => [
        Math.max(0, Math.min(text.length, r.start)),
        Math.max(0, Math.min(text.length, r.end)),
      ]),
    ]),
  ].sort((a, b) => a - b);
  return (
    <>
      {points
        .slice(0, -1)
        .map((start, i) =>
          ranges.some((r) => r.start <= start && r.end > start) ? (
            <mark key={start}>{text.slice(start, points[i + 1])}</mark>
          ) : (
            <span key={start}>{text.slice(start, points[i + 1])}</span>
          ),
        )}
    </>
  );
}
function SourceFigure({
  figure,
  label,
  onUnavailable,
}: {
  figure: NonNullable<Block["figure"]>;
  label: string;
  onUnavailable: () => void;
}) {
  const [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  return (
    <figure className="printed-figure">
      {failed ? (
        <div className="source-error" role="status">
          <p>
            The printed image could not load. Any available text is shown below.
          </p>
          <button
            type="button"
            className="button secondary small"
            onClick={() => {
              setFailed(false);
              setRetry((n) => n + 1);
            }}
          >
            Retry source image
          </button>
        </div>
      ) : (
        <img
          src={`/api/figures/${figure.id}${retry ? `?retry=${retry}` : ""}`}
          alt={`${label} as printed${figure.page ? ` · page ${figure.page}` : ""}`}
          width={figure.width}
          height={figure.height}
          onError={() => {
            setFailed(true);
            onUnavailable();
          }}
        />
      )}
      {figure.page && <figcaption>Source page {figure.page}</figcaption>}
    </figure>
  );
}
function SourceTable({ table }: { table: Table }) {
  return (
    <div className="exam-data-table">
      <table>
        <caption>{table.caption}</caption>
        <thead>
          <tr>
            {table.columns.map((column, i) => (
              <th scope="col" key={i}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) =>
                j === 0 ? (
                  <th scope="row" key={j}>
                    {cell}
                  </th>
                ) : (
                  <td key={j}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function pinnedSourceKey(pin: NonNullable<SourceDeskState["pin"]>) {
  return `pinned-${fingerprint([pin.source, pin.block, pin.start ?? 0, pin.end ?? null, pin.parts ?? null])}`;
}

function FitDocument({
  reader,
  fit,
  zoom,
  sourceKey,
  visible,
  children,
}: {
  reader: RefObject<HTMLDivElement | null>;
  fit: "page" | "width" | "manual";
  zoom: number;
  sourceKey: string;
  visible: boolean;
  children: ReactNode;
}) {
  const documentRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({
    width: 0,
    height: 0,
    paperWidth: 0,
    paperHeight: 0,
  });
  useLayoutEffect(() => {
    const viewport = reader.current,
      paper = documentRef.current;
    if (!viewport || !paper) return;
    function measure() {
      if (!viewport!.clientWidth || !viewport!.clientHeight) return;
      const next = {
        width: viewport!.clientWidth,
        height: viewport!.clientHeight,
        paperWidth: Math.max(paper!.offsetWidth, paper!.scrollWidth),
        paperHeight: Math.max(paper!.offsetHeight, paper!.scrollHeight),
      };
      setSize((previous) =>
        Object.keys(next).every(
          (key) =>
            next[key as keyof typeof next] ===
            previous[key as keyof typeof next],
        )
          ? previous
          : next,
      );
    }
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(paper);
    measure();
    return () => observer.disconnect();
  }, [reader, fit, zoom, sourceKey, visible]);
  const fitted = fit === "page" && size.width > 0 && size.paperHeight > 0;
  const scale = fitted
    ? Math.min(
        1,
        (size.width - 2) / size.paperWidth,
        (size.height - 2) / size.paperHeight,
      )
    : 1;
  return (
    <div
      className={`source-canvas ${fit === "page" ? "fit-page" : ""}`}
      data-scale={scale}
      style={
        fitted ? { height: Math.ceil(size.paperHeight * scale) } : undefined
      }
    >
      <div
        ref={documentRef}
        className="source-document"
        style={
          fitted
            ? {
                position: "absolute",
                width: size.width,
                top: 0,
                left: Math.max(0, (size.width - size.paperWidth * scale) / 2),
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                fontSize: "1rem",
              }
            : {
                width: `${(fit === "manual" ? zoom : 1) * 100}%`,
                fontSize: `${fit === "manual" ? zoom : 1}rem`,
              }
        }
      >
        {children}
      </div>
    </div>
  );
}

export function SourceDesk({
  question,
  resources,
  state,
  onChange,
  familyId,
  attemptId,
  visible = true,
}: {
  question: any;
  resources: any[];
  state: SourceDeskState;
  onChange: (update: (previous: SourceDeskState) => SourceDeskState) => void;
  familyId: string;
  attemptId: string;
  visible?: boolean;
}) {
  const originalSources = useMemo(
    () => questionSources(question, resources),
    [question, resources],
  );
  const pinSource = originalSources.find(
    (item) => item.key === state.pin?.source,
  );
  const pinBlock = pinSource?.blocks.find(
    (block) => block.id === state.pin?.block,
  );
  const pinKey = state.pin && pinBlock ? pinnedSourceKey(state.pin) : undefined;
  const sources =
    pinSource && pinBlock && pinKey
      ? [
          {
            ...pinSource,
            key: pinKey,
            label: `Pinned · ${pinSource.label}`,
            blocks: [pinBlock],
          },
          ...originalSources,
        ]
      : originalSources;
  const source =
    sources.find((s) => s.key === state.selections?.[question.id]) ??
    sources.find((s) => s.key === state.selected) ??
    sources[0];
  const reader = useRef<HTMLDivElement>(null);
  const selection = useRef<{ block: string; start: number; end: number }[]>([]);
  const [selectionReady, setSelectionReady] = useState(false),
    [announcement, setAnnouncement] = useState("");
  const [unavailable, setUnavailable] = useState<Record<string, boolean>>({});
  const reading = state.readers[source?.key] ?? {};
  const isPin = !!pinKey && source?.key === pinKey;
  const fit =
    reading.fit ??
    ((reading.zoom ?? 1) !== 1
      ? "manual"
      : source?.blocks.some((block) => block.table || block.figure) &&
          !reading.transcript
        ? "page"
        : "width");
  const readingRef = useRef(reading);
  readingRef.current = reading;
  const key = source?.key;
  function selectSource(selected: string) {
    onChange((previous) => ({
      ...previous,
      selected,
      selections: { ...previous.selections, [question.id]: selected },
    }));
  }
  function changeReading(update: Partial<ReadingState>) {
    if (!key) return;
    onChange((previous) => ({
      ...previous,
      readers: {
        ...previous.readers,
        [key]: { ...previous.readers[key], ...update },
      },
    }));
  }
  useLayoutEffect(() => {
    if (reader.current) {
      reader.current.scrollTop =
        fit === "page" ? 0 : (readingRef.current.top ?? 0);
      reader.current.scrollLeft =
        fit === "page" ? 0 : (readingRef.current.left ?? 0);
    }
    selection.current = [];
    setSelectionReady(false);
  }, [key, visible, fit]);
  useLayoutEffect(() => {
    if (!visible) return;
    const tab = document.getElementById(
        `source-tab-${sources.indexOf(source)}`,
      ),
      list = tab?.parentElement;
    if (!tab || !list) return;
    const item = tab.getBoundingClientRect(),
      frame = list.getBoundingClientRect();
    if (item.left < frame.left) list.scrollLeft -= frame.left - item.left;
    else if (item.right > frame.right)
      list.scrollLeft += item.right - frame.right;
  }, [key, visible]);
  useEffect(() => {
    function capture() {
      const selected = window.getSelection();
      if (!selected?.rangeCount || selected.isCollapsed || !reader.current)
        return;
      const range = selected.getRangeAt(0);
      if (!reader.current.contains(range.commonAncestorContainer)) return;
      const ranges: typeof selection.current = [];
      reader.current
        .querySelectorAll<HTMLElement>("[data-source-text]")
        .forEach((element) => {
          if (!range.intersectsNode(element)) return;
          const length = element.textContent?.length ?? 0;
          const prefix = document.createRange();
          prefix.selectNodeContents(element);
          let start = 0,
            end = length;
          if (element.contains(range.startContainer)) {
            prefix.setEnd(range.startContainer, range.startOffset);
            start = prefix.toString().length;
          }
          if (element.contains(range.endContainer)) {
            prefix.selectNodeContents(element);
            prefix.setEnd(range.endContainer, range.endOffset);
            end = prefix.toString().length;
          }
          if (end > start)
            ranges.push({ block: element.dataset.sourceText!, start, end });
        });
      selection.current = ranges;
      setSelectionReady(ranges.length > 0);
    }
    document.addEventListener("selectionchange", capture);
    return () => document.removeEventListener("selectionchange", capture);
  }, [key]);
  if (!source) return null;
  const hasFigures = source.blocks.some((b) => b.figure);
  const hasText = source.blocks.some((b) => b.text);
  function renderBlock(block: Block, pinned = false) {
    if (block.figure)
      return (
        <SourceFigure
          key={block.figure.id}
          figure={block.figure}
          label={(pinned ? pinSource : source)!.label}
          onUnavailable={() => {
            if (!pinned) {
              setUnavailable((previous) => ({
                ...previous,
                [source.key]: true,
              }));
              changeReading({ transcript: true });
            }
          }}
        />
      );
    if (block.table) return <SourceTable table={block.table} />;
    const text = block.text ?? "";
    return (
      <p
        className="source-paragraph"
        {...(!pinned ? { "data-source-text": block.id } : {})}
      >
        {pinned ? (
          state.pin?.parts?.length ? (
            state.pin.parts
              .map(
                (part) =>
                  pinSource?.blocks
                    .find((b) => b.id === part.block)
                    ?.text?.slice(part.start, part.end) ?? "",
              )
              .join("\n\n")
          ) : (
            text.slice(state.pin?.start ?? 0, state.pin?.end ?? text.length)
          )
        ) : (
          <MarkedText text={text} ranges={reading.highlights?.[block.id]} />
        )}
      </p>
    );
  }
  function savePin(value: NonNullable<SourceDeskState["pin"]>) {
    const selected = pinnedSourceKey(value);
    onChange((previous) => ({
      ...previous,
      pin: value,
      selected,
      selections: { ...previous.selections, [question.id]: selected },
    }));
    setAnnouncement(
      `${source.label} pinned. Return to it using the pinned reference tab.`,
    );
  }
  function pin(block: Block, start?: number, end?: number) {
    savePin({ source: source.key, block: block.id, start, end });
  }
  function showPin() {
    if (!pinSource || !state.pin) return;
    const block = state.pin.block;
    onChange((previous) => ({
      ...previous,
      selected: pinSource.key,
      selections: { ...previous.selections, [question.id]: pinSource.key },
      readers: {
        ...previous.readers,
        [pinSource.key]: {
          ...previous.readers[pinSource.key],
          transcript:
            !!pinBlock?.text || previous.readers[pinSource.key]?.transcript,
        },
      },
    }));
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const target = Array.from(
          reader.current?.querySelectorAll<HTMLElement>("[data-block]") ?? [],
        ).find((el) => el.dataset.block === block);
        if (target && reader.current) {
          reader.current.scrollTop =
            reader.current.scrollTop +
            target.getBoundingClientRect().top -
            reader.current.getBoundingClientRect().top -
            8;
          target.focus({ preventScroll: true });
        }
      }),
    );
  }
  return (
    <section className="exam-source-desk" aria-label="Source desk">
      <div className="source-desk-heading">
        <h2>Source material</h2>
        <span>Read alongside your answer</span>
      </div>
      <div className="source-tabs" role="tablist" aria-label="Sources">
        {sources.map((item, i) => (
          <button
            type="button"
            role="tab"
            key={item.key}
            id={`source-tab-${i}`}
            aria-controls="source-content"
            aria-label={item.label}
            title={item.label}
            aria-selected={item.key === source.key}
            tabIndex={item.key === source.key ? 0 : -1}
            onClick={() => selectSource(item.key)}
            onKeyDown={(event) => {
              let next = i;
              if (event.key === "ArrowRight") next = (i + 1) % sources.length;
              else if (event.key === "ArrowLeft")
                next = (i + sources.length - 1) % sources.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = sources.length - 1;
              else return;
              event.preventDefault();
              selectSource(sources[next].key);
              const tab = document.getElementById(`source-tab-${next}`);
              tab?.focus({ preventScroll: true });
              tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
            }}
          >
            {item.key === pinKey
              ? pinBlock?.table
                ? "Pinned table"
                : pinBlock?.figure
                  ? "Pinned figure"
                  : "Pinned passage"
              : item.label}
          </button>
        ))}
      </div>
      <div className="source-desk-toolbar">
        <label>
          Zoom
          <select
            aria-label="Source zoom"
            value={fit === "manual" ? String(reading.zoom ?? 1) : fit}
            onChange={(event) => {
              const value = event.target.value;
              changeReading(
                value === "page" || value === "width"
                  ? { fit: value }
                  : { fit: "manual", zoom: Number(value) },
              );
            }}
          >
            <option value="page">Fit page</option>
            <option value="width">Fit width</option>
            <option value="1">100%</option>
            <option value={1.25}>125%</option>
            <option value={1.5}>150%</option>
            <option value={2}>200%</option>
            <option value={3}>300%</option>
          </select>
        </label>
        {isPin && (
          <>
            <button type="button" className="link-button" onClick={showPin}>
              Show in context
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                const selected = pinSource!.key;
                onChange((previous) => ({
                  ...previous,
                  pin: undefined,
                  selected,
                  selections: {
                    ...previous.selections,
                    [question.id]: selected,
                  },
                }));
              }}
            >
              Unpin
            </button>
          </>
        )}
        {!isPin &&
          source.blocks.length === 1 &&
          (source.blocks[0].table || source.blocks[0].figure) && (
            <button
              type="button"
              className="link-button"
              onClick={() => pin(source.blocks[0])}
            >
              Pin {source.blocks[0].table ? "table" : "figure"}
            </button>
          )}
        {!isPin && hasFigures && hasText && (
          <button
            type="button"
            className="link-button"
            aria-pressed={!!reading.transcript}
            onClick={() => changeReading({ transcript: !reading.transcript })}
          >
            {reading.transcript ? "Printed source" : "Read as text"}
          </button>
        )}
        {!isPin && (!hasFigures || reading.transcript) && hasText && (
          <>
            <button
              type="button"
              className="link-button"
              disabled={!selectionReady}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const selected = selection.current;
                if (!selected.length) return;
                const highlights = { ...reading.highlights };
                for (const item of selected)
                  highlights[item.block] = [
                    ...(highlights[item.block] ?? []),
                    { start: item.start, end: item.end },
                  ];
                changeReading({ highlights });
                setAnnouncement(
                  "Selected text highlighted. Highlights are saved on this device.",
                );
                selection.current = [];
                setSelectionReady(false);
                window.getSelection()?.removeAllRanges();
              }}
            >
              Highlight selection
            </button>
            <button
              type="button"
              className="link-button"
              disabled={!selectionReady}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const first = selection.current[0];
                const block = source.blocks.find((b) => b.id === first?.block);
                if (block) {
                  const parts = [...selection.current];
                  savePin({ source: source.key, block: block.id, parts });
                  setAnnouncement(`${source.label} selection pinned.`);
                }
              }}
            >
              Pin selection
            </button>
            {!!Object.keys(reading.highlights ?? {}).length && (
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  changeReading({ highlights: {} });
                  setAnnouncement("Highlights cleared from this source.");
                }}
              >
                Clear highlights
              </button>
            )}
          </>
        )}
      </div>
      <div
        className="source-reader"
        ref={reader}
        data-fit={fit}
        id="source-content"
        role="tabpanel"
        aria-labelledby={`source-tab-${sources.indexOf(source)}`}
        tabIndex={0}
        onScroll={(event) => {
          if (fit !== "page" && event.currentTarget.clientHeight)
            changeReading({
              top: event.currentTarget.scrollTop,
              left: event.currentTarget.scrollLeft,
            });
        }}
      >
        <FitDocument
          reader={reader}
          fit={fit}
          zoom={reading.zoom ?? 1}
          sourceKey={source.key}
          visible={visible}
        >
          {isPin && pinBlock ? (
            <aside
              className="source-pinned-reference"
              aria-label="Pinned reference"
            >
              {renderBlock(pinBlock, true)}
            </aside>
          ) : (
            <>
              {source.blocks
                .filter(
                  (b) =>
                    !hasFigures ||
                    (reading.transcript
                      ? !b.figure || unavailable[source.key]
                      : !b.text),
                )
                .map((block, i) => (
                  <div
                    key={block.id}
                    data-block={block.id}
                    className="source-block"
                    tabIndex={-1}
                  >
                    {renderBlock(block)}
                    {!(
                      source.blocks.length === 1 &&
                      (block.table || block.figure)
                    ) && (
                      <button
                        type="button"
                        className="link-button source-pin-action"
                        title={block.figure ? "Pin figure" : "Pin passage"}
                        aria-label={`Pin ${block.table ? "table" : block.figure ? "figure" : `passage ${i + 1}`}`}
                        onClick={() => pin(block)}
                      >
                        Pin{" "}
                        {block.table
                          ? "table"
                          : block.figure
                            ? "figure"
                            : "passage"}
                      </button>
                    )}
                  </div>
                ))}
            </>
          )}
          {source.fileId && (
            <a
              className="link-button"
              target="_blank"
              rel="noreferrer"
              href={`/api/resource/${source.fileId}?family=${familyId}&attempt=${attemptId}#page=${source.page ?? 1}`}
            >
              View original source PDF · opens separately
            </a>
          )}
        </FitDocument>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
