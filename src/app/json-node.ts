import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, signal } from '@angular/core';

/** Broadcast to every node: expand or collapse all. `seq` makes repeated clicks re-fire. */
export interface FoldCommand {
  collapsed: boolean;
  seq: number;
}

/** Children rendered per container before a "show more" button. */
const PAGE = 100;

/**
 * One node of the JSON tree. Children are only created when the node is expanded,
 * and large containers are paged, so the DOM stays proportional to what is visible.
 * The caret is a plain glyph (not an icon component) because there can be thousands.
 */
@Component({
  selector: 'app-json-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let k = key();
    @if (isContainer()) {
      <button
        type="button"
        class="-ml-4 inline-flex cursor-pointer items-baseline rounded text-left hover:bg-slate-200/70 dark:hover:bg-slate-800"
        (click)="collapsed.set(!collapsed())"
        [attr.aria-expanded]="!collapsed()"
      >
        <span class="inline-block w-4 shrink-0 text-center text-[0.65rem] text-slate-400 transition-transform" [class.rotate-90]="!collapsed()" aria-hidden="true">▶</span>
        @if (k !== null) {
          @if (isIndex()) {
            <span class="text-slate-400">{{ k }}</span><span class="tok-punct">:&nbsp;</span>
          } @else {
            <span class="tok-key">"{{ k }}"</span><span class="tok-punct">:&nbsp;</span>
          }
        }
        <span class="tok-punct">{{ open() }}</span>
        @if (collapsed()) {
          <span class="mx-1 text-xs text-slate-400 dark:text-slate-500">{{ count() }} {{ kind() === 'array' ? 'items' : 'keys' }}</span>
          <span class="tok-punct">{{ close() }}{{ last() ? '' : ',' }}</span>
        }
      </button>
      @if (!collapsed()) {
        <!-- Children are only built once they scroll into view, so "expand all" on a
             large document creates the visible rows, not the whole tree. -->
        @defer (on viewport) {
        <div class="ml-1.5 border-l border-slate-200 pl-5 dark:border-slate-800">
          @for (e of visible(); track e[0]; let l = $last) {
            <app-json-node
              [key]="e[0]"
              [value]="e[1]"
              [last]="l && !hidden()"
              [depth]="depth() + 1"
              [openDepth]="openDepth()"
              [fold]="fold()"
            />
          }
          @if (hidden()) {
            <button
              type="button"
              class="my-0.5 cursor-pointer rounded px-1.5 text-xs text-sky-700 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-slate-800"
              (click)="limit.set(limit() + PAGE * 5)"
            >
              Show {{ nextPage() }} more of {{ hidden() }} remaining
            </button>
          }
        </div>
        } @placeholder {
          <div class="ml-1.5 border-l border-slate-200 pl-5 text-slate-400 dark:border-slate-800">…</div>
        }
        <div><span class="tok-punct">{{ close() }}{{ last() ? '' : ',' }}</span></div>
      }
    } @else {
      <div class="break-all">
        @if (k !== null) {
          @if (isIndex()) {
            <span class="text-slate-400">{{ k }}</span><span class="tok-punct">:&nbsp;</span>
          } @else {
            <span class="tok-key">"{{ k }}"</span><span class="tok-punct">:&nbsp;</span>
          }
        }
        <span [class]="valueClass()">{{ display() }}</span><span class="tok-punct">{{ last() ? '' : ',' }}</span>
      </div>
    }
  `,
})
export class JsonNode {
  readonly key = input<string | number | null>(null);
  readonly value = input.required<unknown>();
  readonly last = input(true);
  readonly depth = input(0);
  /** Nodes deeper than this start collapsed. */
  readonly openDepth = input(Infinity);
  readonly fold = input<FoldCommand | null>(null);

  protected readonly PAGE = PAGE;

  /** Starts from openDepth; follows expand/collapse-all; the user's click overrides it. */
  protected readonly collapsed = linkedSignal(() => {
    const cmd = this.fold();
    // Collapse-all keeps the root open so the structure stays visible.
    if (cmd) return cmd.collapsed && this.depth() > 0;
    return this.depth() >= this.openDepth();
  });

  protected readonly limit = signal(PAGE);

  protected readonly kind = computed(() => {
    const v = this.value();
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v as 'object' | 'string' | 'number' | 'boolean';
  });

  /** Empty arrays/objects render inline like a primitive (`[]`, `{}`). */
  protected readonly isContainer = computed(
    () => (this.kind() === 'object' || this.kind() === 'array') && this.count() > 0,
  );
  protected readonly isIndex = computed(() => typeof this.key() === 'number');

  protected readonly count = computed(() => {
    const v = this.value();
    return Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0;
  });

  /** Only materialise the entries that will actually be rendered. */
  protected readonly visible = computed<[string | number, unknown][]>(() => {
    const v = this.value();
    const n = this.limit();
    if (Array.isArray(v)) return v.slice(0, n).map((x, i) => [i, x]);
    if (v && typeof v === 'object') {
      const out: [string, unknown][] = [];
      for (const k in v) {
        if (out.length >= n) break;
        out.push([k, (v as Record<string, unknown>)[k]]);
      }
      return out;
    }
    return [];
  });

  protected readonly hidden = computed(() => Math.max(0, this.count() - this.limit()));
  protected readonly nextPage = computed(() => Math.min(this.hidden(), PAGE * 5));

  protected readonly open = computed(() => (this.kind() === 'array' ? '[' : '{'));
  protected readonly close = computed(() => (this.kind() === 'array' ? ']' : '}'));

  protected readonly display = computed(() => {
    const v = this.value();
    if (Array.isArray(v)) return '[]';
    if (v !== null && typeof v === 'object') return '{}';
    return typeof v === 'string' ? JSON.stringify(v) : String(v);
  });

  protected readonly valueClass = computed(() => {
    const k = this.kind();
    return k === 'array' || k === 'object' ? 'tok-punct' : 'tok-' + k;
  });
}
