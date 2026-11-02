import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import {
  faAnglesDown,
  faAnglesUp,
  faArrowDownAZ,
  faCheck,
  faCircleExclamation,
  faCircleInfo,
  faClockRotateLeft,
  faCode,
  faCompress,
  faCopy,
  faDesktop,
  faDownload,
  faFileArrowUp,
  faFolderTree,
  faAlignLeft,
  faMoon,
  faPaste,
  faSun,
  faTrashCan,
  faWandMagicSparkles,
  faXmark,
  faDownLeftAndUpRightToCenter,
  faGlobe,
  faRotateRight,
  faSpinner,
  faUpRightAndDownLeftFromCenter,
} from '@fortawesome/free-solid-svg-icons';
import { HistoryEntry, HistoryService } from './history.service';
import { FoldCommand, JsonNode } from './json-node';
import { formatBytes, highlightChunks, parseJson, sortKeysDeep } from './json-utils';
import { isBoolean, oneOf, persistedSignal } from './prefs';
import { asHttpUrl, fetchText, fileNameFromUrl } from './url-fetch';
import { ThemeMode, ThemeService } from './theme.service';
import { UpdateService } from './update.service';

type Indent = '2' | '4' | 'tab';
type View = 'tree' | 'text';

/** Above this size the tree view and syntax highlighting get expensive. */
const LARGE = 2 * 1024 * 1024;
/** Above this size, re-parsing on every keystroke is noticeable, so typing is debounced. */
const DEBOUNCE_ABOVE = 100 * 1024;
const DEBOUNCE_MS = 300;
/** Documents smaller than this render with the whole tree expanded. */
const OPEN_ALL_BELOW = 64 * 1024;

@Component({
  selector: 'app-root',
  imports: [FaIconComponent, JsonNode],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly theme = inject(ThemeService);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly history = inject(HistoryService);
  protected readonly updates = inject(UpdateService);

  protected readonly icons = {
    faAnglesDown,
    faAnglesUp,
    faArrowDownAZ,
    faCheck,
    faCircleExclamation,
    faCircleInfo,
    faGithub,
    faClockRotateLeft,
    faCode,
    faCompress,
    faCopy,
    faDownload,
    faFileArrowUp,
    faFolderTree,
    faAlignLeft,
    faPaste,
    faTrashCan,
    faWandMagicSparkles,
    faXmark,
    faDownLeftAndUpRightToCenter,
    faGlobe,
    faRotateRight,
    faSpinner,
    faUpRightAndDownLeftFromCenter,
  };

  protected readonly themes: { mode: ThemeMode; icon: typeof faSun; label: string }[] = [
    { mode: 'light', icon: faSun, label: 'Light' },
    { mode: 'dark', icon: faMoon, label: 'Dark' },
    { mode: 'system', icon: faDesktop, label: 'System' },
  ];

  private readonly textarea = viewChild.required<ElementRef<HTMLTextAreaElement>>('editor');
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly help = viewChild.required<ElementRef<HTMLElement>>('help');

  /** What is in the editor right now. */
  protected readonly input = signal('');
  /** What has been handed to the parser (lags `input` while typing in large documents). */
  private readonly committed = signal('');
  private commitTimer?: ReturnType<typeof setTimeout>;
  protected readonly sourceName = signal<string | null>(null);
  // Remembered between visits.
  protected readonly indent = persistedSignal<Indent>('indent', '2', oneOf('2', '4', 'tab'));
  protected readonly sortKeys = persistedSignal('sortKeys', false, isBoolean);
  /** The view the user picked. Very large documents are shown as text without changing it. */
  protected readonly preferredView = persistedSignal<View>('view', 'tree', oneOf('tree', 'text'));
  protected readonly dragging = signal(false);
  protected readonly historyOpen = signal(false);
  protected readonly copied = signal(false);
  /** URL currently being fetched, if any. */
  protected readonly fetching = signal<string | null>(null);
  /** Why the last fetch failed, or the HTTP status if it wasn't 2xx. */
  protected readonly fetchError = signal<string | null>(null);
  private fetchAbort?: AbortController;
  protected readonly fold = signal<FoldCommand | null>(null);
  /** Output pane fills the whole work area (input and history hidden). */
  protected readonly maximized = signal(false);
  private dragDepth = 0;

  protected readonly parsed = computed(() => parseJson(this.committed()));

  protected readonly value = computed(() => {
    const p = this.parsed();
    if (p.ok !== true) return undefined;
    return this.sortKeys() ? sortKeysDeep(p.value) : p.value;
  });

  protected readonly formatted = computed(() => {
    const v = this.value();
    if (v === undefined) return '';
    const i = this.indent();
    return JSON.stringify(v, null, i === 'tab' ? '\t' : Number(i));
  });

  /** Small documents open fully; large ones start with only the top levels expanded. */
  protected readonly openDepth = computed(() =>
    this.committed().length > OPEN_ALL_BELOW ? 3 : Infinity,
  );

  protected readonly isLarge = computed(() => this.committed().length > LARGE);

  protected readonly view = computed<View>(() => (this.isLarge() ? 'text' : this.preferredView()));

  /**
   * Highlighted text view, split into line blocks so the browser can skip laying out
   * off-screen blocks (content-visibility). The HTML is built from escaped tokens in
   * json-utils, so Angular's (slow, for MBs of markup) sanitizer is bypassed.
   */
  protected readonly highlighted = computed(() =>
    this.isLarge()
      ? null
      : highlightChunks(this.formatted()).map((c) => ({
          lines: c.lines,
          html: this.sanitizer.bypassSecurityTrustHtml(c.html) as SafeHtml,
        })),
  );

  /** The input is just a URL (e.g. typed in): offer to fetch it instead of a parse error. */
  protected readonly inputUrl = computed(() => asHttpUrl(this.committed()));

  protected readonly summary = computed(() => describe(this.value()));
  protected readonly inputSize = computed(() => formatBytes(new Blob([this.committed()]).size));

  constructor() {
    // Write programmatic changes into the editor. Done by hand rather than via [value]:
    // that binding re-assigns the whole (possibly multi-MB) text on every keystroke.
    effect(() => {
      const text = this.input();
      const ta = this.textarea().nativeElement;
      if (ta.value !== text) ta.value = text;
    });
  }

  /** Replace the editor content and parse it immediately. */
  private setText(text: string): void {
    clearTimeout(this.commitTimer);
    this.input.set(text);
    this.committed.set(text);
    this.fold.set(null);
    this.fetchError.set(null);
  }

  private commitNow(): void {
    clearTimeout(this.commitTimer);
    this.committed.set(this.input());
  }

  // ── Input sources ────────────────────────────────────────────────

  protected onEdit(text: string): void {
    this.fetchError.set(null);
    this.input.set(text);
    this.sourceName.set(null);
    clearTimeout(this.commitTimer);
    if (text.length > DEBOUNCE_ABOVE) {
      this.commitTimer = setTimeout(() => this.commitNow(), DEBOUNCE_MS);
    } else {
      this.committed.set(text);
    }
  }

  /**
   * Paste into the textarea. A URL pasted into an empty editor (or over all of it) is fetched;
   * a URL pasted into the middle of a document is just text. Otherwise let the browser insert
   * the paste, then record it if valid.
   */
  protected onTextareaPaste(event: ClipboardEvent): void {
    const url = asHttpUrl(event.clipboardData?.getData('text/plain') ?? '');
    const ta = event.target as HTMLTextAreaElement;
    if (url && ta.selectionStart === 0 && ta.selectionEnd === ta.value.length) {
      event.preventDefault();
      void this.fetchUrl(url);
      return;
    }
    setTimeout(() => {
      this.commitNow();
      this.remember();
    });
  }

  /**
   * Alt+F toggles the maximized output. Matched on `code`, not `key`: on macOS Option+F
   * types "ƒ", so `key` is not "f". preventDefault stops that character being typed into
   * the editor and, where the browser allows it, its own Alt+F menu.
   */
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(e: KeyboardEvent): void {
    if (e.code === 'KeyF' && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      this.maximized.set(!this.maximized());
      return;
    }
    // "?" opens the help, unless the user is typing.
    const typing = (e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable]');
    if (e.key === '?' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.help().nativeElement.togglePopover();
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    // The browser closes an open popover (the help) on Esc by itself; leave the rest alone.
    if (this.helpOpen) return;
    // Close the innermost thing first: a running fetch, the history pane, a maximized output.
    if (this.fetching()) this.cancelFetch();
    else if (this.historyOpen() && !this.maximized()) this.historyOpen.set(false);
    else this.maximized.set(false);
  }

  /** Paste anywhere else on the page replaces the content. */
  @HostListener('document:paste', ['$event'])
  protected onDocumentPaste(event: ClipboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, [contenteditable]')) return;
    const text = event.clipboardData?.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    const url = asHttpUrl(text);
    if (url) void this.fetchUrl(url);
    else this.load(text, null);
  }

  protected async pasteFromClipboard(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      const url = asHttpUrl(text);
      if (url) void this.fetchUrl(url);
      else if (text) this.load(text, null);
    } catch {
      this.textarea().nativeElement.focus();
    }
  }

  protected openFilePicker(): void {
    this.fileInput().nativeElement.click();
  }

  protected async onFilePicked(event: Event): Promise<void> {
    const el = event.target as HTMLInputElement;
    const file = el.files?.[0];
    if (file) await this.loadFile(file);
    el.value = '';
  }

  protected onDragEnter(e: DragEvent): void {
    if (!hasFiles(e)) return;
    e.preventDefault();
    this.dragDepth++;
    this.dragging.set(true);
  }

  protected onDragOver(e: DragEvent): void {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }

  protected onDragLeave(): void {
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) this.dragging.set(false);
  }

  protected async onDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    this.dragDepth = 0;
    this.dragging.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      await this.loadFile(file);
    } else {
      const text = e.dataTransfer?.getData('text/plain');
      if (text) this.load(text, null);
    }
  }

  /** GET the URL and show the response. The URL stays visible in the editor until it arrives. */
  protected async fetchUrl(url: URL | null = this.inputUrl()): Promise<void> {
    if (!url) return;
    this.fetchAbort?.abort();
    const ctl = new AbortController();
    this.fetchAbort = ctl;
    this.setText(url.href);
    this.sourceName.set(null);
    this.fetching.set(url.href);
    try {
      const res = await fetchText(url, ctl.signal);
      if (!res.text.trim()) throw new Error(`HTTP ${res.status}: the response was empty`);
      this.load(res.text, url.href);
      if (!res.ok) this.fetchError.set(`HTTP ${res.status} ${res.statusText}`.trim());
    } catch (e) {
      if (ctl.signal.aborted) return; // cancelled, or replaced by a newer fetch
      this.fetchError.set(e instanceof Error ? e.message : String(e));
    } finally {
      if (this.fetchAbort === ctl) {
        this.fetchAbort = undefined;
        this.fetching.set(null);
      }
    }
  }

  /**
   * Tracked from the popover's toggle event. Esc arrives here after the browser has already
   * closed the popover, so a live :popover-open check would say "closed".
   */
  private helpOpen = false;

  protected onHelpToggle(e: Event): void {
    const open = (e as ToggleEvent).newState === 'open';
    // Defer "closed" so the Esc handler that runs right after this still sees it as open.
    if (open) this.helpOpen = true;
    else setTimeout(() => (this.helpOpen = false));
  }

  protected cancelFetch(): void {
    this.fetchAbort?.abort();
    this.fetchAbort = undefined;
    this.fetching.set(null);
  }

  private async loadFile(file: File): Promise<void> {
    this.load(await file.text(), file.name);
  }

  private load(text: string, name: string | null): void {
    this.setText(text);
    this.sourceName.set(name);
    this.remember();
  }

  /** Save the current input to history if it parses. */
  private remember(): void {
    if (this.parsed().ok !== true) return;
    void this.history.add(this.committed(), this.sourceName() ?? this.summary());
  }

  // ── Actions ──────────────────────────────────────────────────────

  protected formatInput(): void {
    if (!this.formatted()) return;
    this.setText(this.formatted());
    this.remember();
  }

  protected minifyInput(): void {
    const v = this.value();
    if (v === undefined) return;
    this.setText(JSON.stringify(v));
    this.remember();
  }

  protected clear(): void {
    this.setText('');
    this.sourceName.set(null);
    this.textarea().nativeElement.focus();
  }

  protected async copy(): Promise<void> {
    if (!this.formatted()) return;
    await navigator.clipboard.writeText(this.formatted());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }

  protected download(): void {
    if (!this.formatted()) return;
    const blob = new Blob([this.formatted()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const name = this.sourceName();
    a.download = !name ? 'formatted.json' : asHttpUrl(name) ? fileNameFromUrl(name) : name;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected setFold(collapsed: boolean): void {
    this.fold.set({ collapsed, seq: (this.fold()?.seq ?? 0) + 1 });
  }

  /** Move the caret in the editor to the parse error. */
  protected goToError(): void {
    const p = this.parsed();
    if (p.ok !== false || p.line == null) return;
    const lines = this.committed().split('\n');
    let offset = 0;
    for (let i = 0; i < p.line - 1 && i < lines.length; i++) offset += lines[i].length + 1;
    offset += Math.max(0, (p.column ?? 1) - 1);
    const ta = this.textarea().nativeElement;
    ta.focus();
    ta.setSelectionRange(offset, offset + 1);
  }

  // ── History ──────────────────────────────────────────────────────

  protected openEntry(entry: HistoryEntry): void {
    this.setText(entry.content);
    this.sourceName.set(entry.name.endsWith('.json') ? entry.name : null);
    if (window.matchMedia('(max-width: 1023px)').matches) this.historyOpen.set(false);
  }

  protected removeEntry(event: Event, entry: HistoryEntry): void {
    event.stopPropagation();
    if (entry.id != null) void this.history.remove(entry.id);
  }

  protected clearHistory(): void {
    if (confirm('Delete all saved history?')) void this.history.clear();
  }

  protected readonly formatBytes = formatBytes;
  protected readonly escapedExample = '{\\"a\\":1}';

  protected timeAgo(ts: number): string {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return new Date(ts).toLocaleDateString();
  }
}

const hasFiles = (e: DragEvent): boolean => {
  return !!e.dataTransfer?.types.includes('Files');
};

const describe = (v: unknown): string => {
  if (v === undefined) return '';
  if (Array.isArray(v)) return `Array · ${v.length} item${v.length === 1 ? '' : 's'}`;
  if (v && typeof v === 'object') {
    const n = Object.keys(v).length;
    return `Object · ${n} key${n === 1 ? '' : 's'}`;
  }
  return v === null ? 'null' : typeof v;
};
