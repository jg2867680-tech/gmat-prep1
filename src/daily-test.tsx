import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import "katex/dist/katex.min.css";
import Latex from "react-latex-next";
import {
  Clock,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BookOpen,
  BarChart3,
  ArrowLeft,
  Flag,
  Eye,
  ZoomIn,
  X,
  ListChecks,
  Lock,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ArrowUpDown as SortIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { apiRequest } from "@/src/lib/api";

// ─────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────

type GmatSection = "Quant" | "Verbal" | "DataInsights";

type QuestionType =
  | "standard_mcq" // Verbal, Quant, Data Sufficiency, and plain-MCQ MSR sub-questions
  | "table_analysis"
  | "graphics_interpretation"
  | "two_part_analysis"
  | "multi_source_reasoning";

type StimulusKind = "text" | "table" | "chart" | "tabs";

interface StimulusTable {
  columns: string[];
  rows: (string | number)[][];
}

interface StimulusTab {
  label: string;
  content: string | StimulusTable;
}

// The "Stimuli" sheet — one shared context object multiple questions can
// point to via question.passageId, same pattern as RC passages, just
// widened to also carry a table, a chart image, or a tab set.
interface Stimulus {
  id: string;
  title: string;
  kind: StimulusKind;
  text?: string;
  table?: StimulusTable;
  chartImageUrl?: string;
  tabs?: StimulusTab[];
}

interface StatementRow {
  id: string;
  text: string;
  correctAnswer: "Yes" | "No";
}

interface DropdownBlank {
  id: string;
  choices: string[];
  correctChoice: string;
}

interface SectionalQuestion {
  id: string;
  section: GmatSection;
  questionType: QuestionType;
  questionText: string;
  difficulty: "Easy" | "Medium" | "Hard";
  passageId?: string; // -> Stimulus.id

  // standard_mcq / Data Sufficiency / MSR plain-MCQ sub-questions
  options?: string[];
  correctAnswer?: string;

  // table_analysis, and MSR statement-grid sub-questions
  statements?: StatementRow[];

  // graphics_interpretation — questionText may embed {{blankId}} tokens
  blanks?: DropdownBlank[];

  // two_part_analysis
  twoPartOptions?: string[];
  correctPart1?: string;
  correctPart2?: string;

  explanation: string;
}

interface SectionalTest {
  id: string;
  name: string;
  section: GmatSection;
  durationMinutes: number;
  questions: SectionalQuestion[];
  passages?: Stimulus[];
}

interface SectionalResult {
  testId: string;
  section: string;
  totalScore: number; // accuracy %
  correctAnswers: number;
  wrongAnswers: number;
  skippedQuestions: number;
  timeSpent: number;
  studentAnswers: Record<string, QuestionAnswer>;
  scaledScore: number; // 60–90
  editsUsed?: number;
  reachedReview?: boolean;
}

// Polymorphic per-question answer — shape depends on the question's type.
type QuestionAnswer =
  | { kind: "single"; value: string }
  | { kind: "statements"; values: Record<string, "Yes" | "No"> }
  | { kind: "blanks"; values: Record<string, string> }
  | { kind: "twoPart"; part1?: string; part2?: string };

type AnswersMap = Record<string, QuestionAnswer>;

// ─────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────

const MAX_EDITS_PER_SECTION = 3;

const SECTION_META: Record<
  GmatSection,
  {
    label: string;
    short: string;
    color: string;
    lightColor: string;
    textColor: string;
    borderColor: string;
    questions: number;
    minutes: number;
  }
> = {
  Quant: {
    label: "Quantitative Reasoning",
    short: "Quant",
    color: "bg-emerald-500",
    lightColor: "bg-emerald-50",
    textColor: "text-emerald-700",
    borderColor: "border-emerald-200",
    questions: 21,
    minutes: 45,
  },
  Verbal: {
    label: "Verbal Reasoning",
    short: "Verbal",
    color: "bg-violet-500",
    lightColor: "bg-violet-50",
    textColor: "text-violet-700",
    borderColor: "border-violet-200",
    questions: 23,
    minutes: 45,
  },
  DataInsights: {
    label: "Data Insights",
    short: "DI",
    color: "bg-blue-500",
    lightColor: "bg-blue-50",
    textColor: "text-blue-700",
    borderColor: "border-blue-200",
    questions: 20,
    minutes: 45,
  },
};

const SECTION_ORDER: GmatSection[] = ["Quant", "Verbal", "DataInsights"];

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  standard_mcq: "Multiple Choice",
  table_analysis: "Table Analysis",
  graphics_interpretation: "Graphics Interpretation",
  two_part_analysis: "Two-Part Analysis",
  multi_source_reasoning: "Multi-Source Reasoning",
};

const STIMULUS_KIND_LABELS: Record<StimulusKind, string> = {
  text: "Passage",
  table: "Data Table",
  chart: "Chart",
  tabs: "Sources",
};

type SortKey = "section" | "name" | "duration" | "status";

// ─────────────────────────────────────────────────────────────────────────
// HELPERS — answer state
// ─────────────────────────────────────────────────────────────────────────

function emptyAnswerFor(q: SectionalQuestion): QuestionAnswer {
  switch (q.questionType) {
    case "table_analysis":
      return { kind: "statements", values: {} };
    case "graphics_interpretation":
      return { kind: "blanks", values: {} };
    case "two_part_analysis":
      return { kind: "twoPart" };
    case "multi_source_reasoning":
      return q.statements?.length ? { kind: "statements", values: {} } : { kind: "single", value: "" };
    default:
      return { kind: "single", value: "" };
  }
}

function isAnswerComplete(q: SectionalQuestion, ans?: QuestionAnswer): boolean {
  if (!ans) return false;
  switch (ans.kind) {
    case "single":
      return !!ans.value;
    case "statements": {
      const required = q.statements?.map((s) => s.id) ?? [];
      return required.length > 0 && required.every((id) => !!ans.values[id]);
    }
    case "blanks": {
      const required = q.blanks?.map((b) => b.id) ?? [];
      return required.length > 0 && required.every((id) => !!ans.values[id]);
    }
    case "twoPart":
      return !!ans.part1 && !!ans.part2;
  }
}

function isAnswerCorrect(q: SectionalQuestion, ans?: QuestionAnswer): boolean {
  if (!ans) return false;
  switch (ans.kind) {
    case "single":
      return ans.value === q.correctAnswer;
    case "statements":
      return (q.statements ?? []).every((s) => ans.values[s.id] === s.correctAnswer);
    case "blanks":
      return (q.blanks ?? []).every((b) => ans.values[b.id] === b.correctChoice);
    case "twoPart":
      return ans.part1 === q.correctPart1 && ans.part2 === q.correctPart2;
  }
}

function answersEqual(a: QuestionAnswer, b: QuestionAnswer): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ─────────────────────────────────────────────────────────────────────────
// HELPERS — misc
// ─────────────────────────────────────────────────────────────────────────

function MultiParagraphLatex({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  const paras = text.split("\n\n");
  return (
    <>
      {paras.map((para, i) => (
        <p key={i} className={i > 0 ? `mt-2 ${className || ""}` : className}>
          <Latex>{para}</Latex>
        </p>
      ))}
    </>
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// GMAT Focus section scores are reported on a 60–90 scale in 1-point
// increments. GMAC's real item-adaptive algorithm is proprietary, so — same
// as third-party prep tools — this maps raw accuracy onto that band.
function calcScaledScore(correct: number, total: number) {
  if (total === 0) return 60;
  const accuracy = correct / total;
  return Math.round(60 + accuracy * 30);
}

const IMAGE_URL_REGEX =
  /(?:!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)|\[image:\s*(https?:\/\/[^\]]+)\]|(https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?[^\s]*)?(?=#|\s|$)))/gi;

type Segment = { type: "text"; content: string } | { type: "image"; url: string; alt?: string };

function parseSegments(text: string): Segment[] {
  const normalized = text.replace(/\\n/g, "\n");
  const segments: Segment[] = [];
  let lastIndex = 0;
  IMAGE_URL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMAGE_URL_REGEX.exec(normalized)) !== null) {
    const [fullMatch, mdAlt, mdUrl, tagUrl, bareUrl] = match;
    const url = mdUrl || tagUrl || bareUrl;
    const alt = mdAlt || undefined;
    if (match.index > lastIndex) segments.push({ type: "text", content: normalized.slice(lastIndex, match.index) });
    segments.push({ type: "image", url: url.trim(), alt });
    lastIndex = match.index + fullMatch.length;
  }
  if (lastIndex < normalized.length) segments.push({ type: "text", content: normalized.slice(lastIndex) });
  return segments;
}

function StimulusImage({ url, alt }: { url: string; alt?: string }) {
  const [lightbox, setLightbox] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="my-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
        <span>⚠️ Image failed to load:</span>
        <a href={url} target="_blank" rel="noopener noreferrer" className="underline truncate max-w-[200px]">
          {url}
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="my-3 relative group">
        {!loaded && (
          <div className="h-24 rounded-lg bg-secondary/40 animate-pulse flex items-center justify-center text-xs text-muted-foreground">
            Loading image…
          </div>
        )}
        <img
          src={url}
          alt={alt || "Stimulus image"}
          className={`max-w-full rounded-lg border border-border shadow-sm cursor-zoom-in transition-opacity ${
            loaded ? "opacity-100" : "opacity-0 absolute inset-0"
          }`}
          style={{ maxHeight: "320px", objectFit: "contain" }}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(true);
            setError(true);
          }}
          onClick={() => setLightbox(true)}
        />
        {loaded && !error && (
          <button
            onClick={() => setLightbox(true)}
            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            title="View full size"
          >
            <ZoomIn size={14} />
          </button>
        )}
      </div>
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(false)}>
          <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20" onClick={() => setLightbox(false)}>
            <X size={20} />
          </button>
          <img src={url} alt={alt || "Stimulus image"} className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

function RichText({ text }: { text: string }) {
  const segments = parseSegments(text || "");
  return (
    <div className="space-y-1">
      {segments.map((seg, i) =>
        seg.type === "image" ? (
          <StimulusImage key={i} url={seg.url} alt={seg.alt} />
        ) : (
          <div key={i}>
            {seg.content
              .split("\n\n")
              .map((p) => p.trim())
              .filter(Boolean)
              .map((p, j) => (
                <p key={j} className="mb-2 last:mb-0">
                  {p}
                </p>
              ))}
          </div>
        )
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Type guard — distinguishes a StimulusTable ({columns, rows}) from a plain
// string, used by SourceTabs to pick SortableTable vs. RichText per tab.
// ─────────────────────────────────────────────────────────────────────────

function isTableContent(content: string | StimulusTable): content is StimulusTable {
  return typeof content === "object" && content !== null && Array.isArray((content as StimulusTable).columns);
}

// ─────────────────────────────────────────────────────────────────────────
// BOARD — SortableTable (Table Analysis / MSR table tab)
// Interactive: has its own local sort state, independent of the answer.
// ─────────────────────────────────────────────────────────────────────────

function SortableTable({ columns, rows }: StimulusTable) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);

  const sortedRows = useMemo(() => {
    if (sortCol === null || sortDir === null) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      const an = typeof av === "number" ? av : parseFloat(String(av));
      const bn = typeof bv === "number" ? bv : parseFloat(String(bv));
      const cmp = !isNaN(an) && !isNaN(bn) ? an - bn : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortCol, sortDir]);

  const handleHeaderClick = (idx: number) => {
    if (sortCol !== idx) {
      setSortCol(idx);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortCol(null);
      setSortDir(null);
    }
  };

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="overflow-x-auto max-h-72 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-secondary/60 backdrop-blur z-10">
            <tr>
              {columns.map((col, idx) => {
                const isActive = sortCol === idx;
                return (
                  <th
                    key={col}
                    onClick={() => handleHeaderClick(idx)}
                    className={`px-3 py-2 text-left font-bold text-xs uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:bg-secondary transition-colors ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                    title="Click to sort"
                  >
                    <span className="inline-flex items-center gap-1">
                      {col}
                      {isActive ? (
                        sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                      ) : (
                        <ArrowUpDown size={12} className="opacity-30" />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, rIdx) => (
              <tr key={rIdx} className={rIdx % 2 === 0 ? "bg-background" : "bg-secondary/20"}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="px-3 py-2 border-t whitespace-nowrap">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-1.5 bg-secondary/30 border-t text-[11px] text-muted-foreground">
        Click a column header to sort · click again to reverse · a third click resets order
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BOARD — SourceTabs (Multi-Source Reasoning)
// Interactive: has its own local active-tab state, independent of the answer.
// ─────────────────────────────────────────────────────────────────────────

function SourceTabs({ tabs }: { tabs: StimulusTab[] }) {
  const [active, setActive] = useState(0);
  if (!tabs?.length) return null;
  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="flex border-b bg-secondary/40 overflow-x-auto">
        {tabs.map((t, idx) => (
          <button
            key={t.label}
            onClick={() => setActive(idx)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors whitespace-nowrap ${
              active === idx ? "bg-background text-primary border-b-2 border-primary" : "text-muted-foreground hover:bg-secondary/60"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-4 text-sm leading-relaxed max-h-72 overflow-y-auto">
         {tabs[active] && isTableContent(tabs[active].content) ? (
    <SortableTable columns={(tabs[active].content as StimulusTable).columns} rows={(tabs[active].content as StimulusTable).rows} />
  ) : (
    <RichText text={(tabs[active]?.content as string) ?? ""} />
  )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BOARD dispatcher — renders whatever Stimulus.kind requires
// ─────────────────────────────────────────────────────────────────────────

function StimulusBoard({ stimulus }: { stimulus: Stimulus }) {
  switch (stimulus.kind) {
    case "text":
      return (
        <div className="text-sm leading-relaxed text-muted-foreground max-h-56 overflow-y-auto pr-2">
          <RichText text={stimulus.text ?? ""} />
        </div>
      );
    case "table":
      return stimulus.table ? <SortableTable columns={stimulus.table.columns} rows={stimulus.table.rows} /> : null;
    case "chart":
      return stimulus.chartImageUrl ? <StimulusImage url={stimulus.chartImageUrl} alt={stimulus.title} /> : null;
    case "tabs":
      return stimulus.tabs ? <SourceTabs tabs={stimulus.tabs} /> : null;
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ANSWER WIDGETS — one per question type
// ─────────────────────────────────────────────────────────────────────────

function OptionPicker({
  options,
  value,
  onSelect,
  disabled,
}: {
  options: string[];
  value: string;
  onSelect: (val: string) => void;
  disabled?: boolean;
}) {
  return (
    <RadioGroup value={value} onValueChange={onSelect}>
      {options.filter(Boolean).map((opt, idx) => {
        const isSelected = value === opt;
        const blocked = disabled && !isSelected;
        return (
          <Label
            key={opt}
            className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${
              blocked ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            } ${isSelected ? "border-primary bg-blue-50 ring-1 ring-primary" : "border-border hover:border-primary/30 hover:bg-secondary/30"}`}
          >
            <RadioGroupItem value={opt} className="sr-only" disabled={blocked} />
            <div
              className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center font-bold text-xs border ${
                isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border"
              }`}
            >
              {String.fromCharCode(65 + idx)}
            </div>
            <span className="text-sm">
              <Latex>{opt}</Latex>
            </span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}

function StatementGrid({
  statements,
  values,
  onSelect,
  disabled,
}: {
  statements: StatementRow[];
  values: Record<string, string>;
  onSelect: (stId: string, val: "Yes" | "No") => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      {statements.map((s, idx) => (
        <div key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border">
          <span className="text-sm flex-1">
            <span className="font-bold text-muted-foreground mr-1">{idx + 1}.</span>
            {s.text}
          </span>
          <div className="flex gap-1.5 shrink-0">
            {(["Yes", "No"] as const).map((opt) => (
              <button
                key={opt}
                disabled={disabled}
                onClick={() => onSelect(s.id, opt)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-colors ${
                  values[s.id] === opt ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"
                } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GraphicsBlanksSentence({
  text,
  blanks,
  values,
  onSelect,
  disabled,
}: {
  text: string;
  blanks: DropdownBlank[];
  values: Record<string, string>;
  onSelect: (blankId: string, val: string) => void;
  disabled?: boolean;
}) {
  const tokenRe = /\{\{(\w+)\}\}/g;
  const hasTokens = /\{\{(\w+)\}\}/.test(text);

  const dropdown = (b: DropdownBlank) => (
    <select
      key={b.id}
      disabled={disabled}
      value={values[b.id] || ""}
      onChange={(e) => onSelect(b.id, e.target.value)}
      className={`mx-1 border-2 rounded-lg px-2 py-1 text-sm font-semibold bg-background ${
        values[b.id] ? "border-primary bg-blue-50" : "border-dashed border-muted-foreground/40"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <option value="" disabled>
        Select…
      </option>
      {b.choices.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );

  if (!hasTokens) {
    return (
      <div className="space-y-3">
        <p className="text-sm">{text}</p>
        <div className="flex flex-wrap gap-4">
          {blanks.map((b, idx) => (
            <div key={b.id} className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground">Blank {idx + 1}</span>
              {dropdown(b)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    const blank = blanks.find((b) => b.id === m![1]);
    if (blank) parts.push(dropdown(blank));
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));

  return <p className="text-sm leading-loose">{parts}</p>;
}

function TwoPartGrid({
  options,
  part1,
  part2,
  onSelectPart1,
  onSelectPart2,
  disabled,
}: {
  options: string[];
  part1?: string;
  part2?: string;
  onSelectPart1: (val: string) => void;
  onSelectPart2: (val: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-bold uppercase text-muted-foreground">Value</th>
            <th className="px-3 py-2 text-center text-xs font-bold uppercase text-muted-foreground">Part 1</th>
            <th className="px-3 py-2 text-center text-xs font-bold uppercase text-muted-foreground">Part 2</th>
          </tr>
        </thead>
        <tbody>
          {options.map((opt, idx) => (
            <tr key={opt} className={idx % 2 === 0 ? "bg-background" : "bg-secondary/20"}>
              <td className="px-3 py-2 border-t font-medium">
                <Latex>{opt}</Latex>
              </td>
              <td className="px-3 py-2 border-t text-center">
                <input
                  type="radio"
                  name={`two-part-1`}
                  disabled={disabled}
                  checked={part1 === opt}
                  onChange={() => onSelectPart1(opt)}
                  className="w-4 h-4 accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                />
              </td>
              <td className="px-3 py-2 border-t text-center">
                <input
                  type="radio"
                  name={`two-part-2`}
                  disabled={disabled}
                  checked={part2 === opt}
                  onChange={() => onSelectPart2(opt)}
                  className="w-4 h-4 accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Dispatcher — picks the right answer widget for the question's type.
function QuestionBody({
  question,
  answer,
  disabled,
  onSelectSingle,
  onSelectStatement,
  onSelectBlank,
  onSelectPart1,
  onSelectPart2,
}: {
  question: SectionalQuestion;
  answer?: QuestionAnswer;
  disabled?: boolean;
  onSelectSingle: (val: string) => void;
  onSelectStatement: (stId: string, val: "Yes" | "No") => void;
  onSelectBlank: (blankId: string, val: string) => void;
  onSelectPart1: (val: string) => void;
  onSelectPart2: (val: string) => void;
}) {
  switch (question.questionType) {
    case "table_analysis": {
      const values = answer?.kind === "statements" ? answer.values : {};
      return <StatementGrid statements={question.statements ?? []} values={values} onSelect={onSelectStatement} disabled={disabled} />;
    }
    case "graphics_interpretation": {
      const values = answer?.kind === "blanks" ? answer.values : {};
      return (
        <GraphicsBlanksSentence
          text={question.questionText}
          blanks={question.blanks ?? []}
          values={values}
          onSelect={onSelectBlank}
          disabled={disabled}
        />
      );
    }
    case "two_part_analysis": {
      const part1 = answer?.kind === "twoPart" ? answer.part1 : undefined;
      const part2 = answer?.kind === "twoPart" ? answer.part2 : undefined;
      return (
        <TwoPartGrid
          options={question.twoPartOptions ?? []}
          part1={part1}
          part2={part2}
          onSelectPart1={onSelectPart1}
          onSelectPart2={onSelectPart2}
          disabled={disabled}
        />
      );
    }
    case "multi_source_reasoning": {
      if (question.statements?.length) {
        const values = answer?.kind === "statements" ? answer.values : {};
        return <StatementGrid statements={question.statements} values={values} onSelect={onSelectStatement} disabled={disabled} />;
      }
      const value = answer?.kind === "single" ? answer.value : "";
      return <OptionPicker options={question.options ?? []} value={value} onSelect={onSelectSingle} disabled={disabled} />;
    }
    default: {
      const value = answer?.kind === "single" ? answer.value : "";
      return <OptionPicker options={question.options ?? []} value={value} onSelect={onSelectSingle} disabled={disabled} />;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Question palette dot (Review & Edit screen)
// ─────────────────────────────────────────────────────────────────────────

function StatusDot({
  answered,
  flagged,
  current,
  idx,
  onClick,
}: {
  answered: boolean;
  flagged: boolean;
  current: boolean;
  idx: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-9 h-9 rounded-lg text-xs font-bold transition-all flex items-center justify-center relative
        ${current ? "ring-2 ring-offset-1 ring-primary scale-110" : ""}
        ${answered ? "bg-blue-500 text-white" : "bg-secondary text-muted-foreground hover:bg-secondary/80"}
      `}
    >
      {idx + 1}
      {flagged && <span className="absolute -top-1 -right-1 w-3 h-3 bg-orange-400 rounded-full" />}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────

export default function sectionalTest({ user }: { user: any }) {
  const [view, setView] = useState<"list" | "instructions" | "test" | "reviewEdit" | "result">("list");
  const [availableTests, setAvailableTests] = useState<SectionalTest[]>([]);
  const [attempts, setAttempts] = useState<Record<string, SectionalResult>>({});
  const [selectedTest, setSelectedTest] = useState<SectionalTest | null>(null);
  const [loading, setLoading] = useState(true);
  const [testLoading, setTestLoading] = useState(false);

  // List sorting
  const [sortKey, setSortKey] = useState<SortKey>("section");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Sequential test state
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<AnswersMap>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<SectionalResult | null>(null);
  const [activeStimulus, setActiveStimulus] = useState<Stimulus | null>(null);
  const [reviewMode, setReviewMode] = useState(false); // post-submission full answer review

  // Question Review & Edit (mid-section, pre-submission)
  const [reviewIdx, setReviewIdx] = useState(0);
  const [editedQuestions, setEditedQuestions] = useState<Set<string>>(new Set());
  const reachedReviewRef = useRef(false);

  const editsUsed = editedQuestions.size;
  const editsLeft = MAX_EDITS_PER_SECTION - editsUsed;

  // ── Load tests ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadTests();
  }, []);

  const loadTests = async () => {
    setLoading(true);
    try {
      const [tests, prevResults] = await Promise.all([apiRequest("/sectional-tests"), apiRequest("/sectional-results")]);
      setAvailableTests(tests || []);
      const map: Record<string, SectionalResult> = {};
      (prevResults || []).forEach((r: SectionalResult) => {
        map[r.testId] = r;
      });
      setAttempts(map);
    } catch (err: any) {
      toast.error("Failed to load sectional tests");
    } finally {
      setLoading(false);
    }
  };

  // ── Timer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if ((view !== "test" && view !== "reviewEdit") || submitted || timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft((p) => p - 1), 1000);
    return () => clearInterval(t);
  }, [view, submitted, timeLeft]);

  useEffect(() => {
    if ((view === "test" || view === "reviewEdit") && !submitted && timeLeft === 0) {
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  // ── questionById lookup ───────────────────────────────────────────────
  const questionById = useMemo(() => {
    const map: Record<string, SectionalQuestion> = {};
    (selectedTest?.questions ?? []).forEach((q) => (map[q.id] = q));
    return map;
  }, [selectedTest]);

  // ── Active stimulus for whichever question is on screen ────────────────
  const displayedIdx = view === "reviewEdit" ? reviewIdx : currentIdx;
  useEffect(() => {
    if (!selectedTest || (view !== "test" && view !== "reviewEdit")) return;
    const q = selectedTest.questions[displayedIdx];
    if (q?.passageId && selectedTest.passages) {
      setActiveStimulus(selectedTest.passages.find((s) => s.id === q.passageId) || null);
    } else {
      setActiveStimulus(null);
    }
  }, [displayedIdx, selectedTest, view]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const startTest = async (test: SectionalTest) => {
    if (attempts[test.id]) {
      setTestLoading(true);
      try {
        const fullTest = await apiRequest(`/sectional-test/${test.id}`);
        setSelectedTest(fullTest);
        setResult(attempts[test.id]);
        setAnswers(attempts[test.id].studentAnswers || {});
        setView("result");
      } catch {
        toast.error("Failed to load test");
      } finally {
        setTestLoading(false);
      }
      return;
    }

    setTestLoading(true);
    try {
      const fullTest = await apiRequest(`/sectional-test/${test.id}`);
      if (!fullTest?.questions?.length) {
        toast.error("This test has no questions yet. Please check the sheet data.");
        return;
      }
      setSelectedTest(fullTest);
      setView("instructions");
    } catch (err: any) {
      toast.error("Failed to load test questions. Check server connection.");
    } finally {
      setTestLoading(false);
    }
  };

  const beginTest = () => {
    if (!selectedTest) return;
    const questions = selectedTest.questions;
    if (!questions?.length) {
      toast.error("No questions found in this test.");
      return;
    }
    setCurrentIdx(0);
    setReviewIdx(0);
    setAnswers({});
    setFlagged(new Set());
    setEditedQuestions(new Set());
    reachedReviewRef.current = false;
    setTimeLeft((selectedTest.durationMinutes || 45) * 60);
    setSubmitted(false);
    setResult(null);
    setReviewMode(false);
    setView("test");
  };

  const toggleFlag = useCallback((qId: string) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      next.has(qId) ? next.delete(qId) : next.add(qId);
      return next;
    });
  }, []);

  // Forward phase: free to change your mind on the CURRENT (unlocked)
  // question as many times as you like — no edit cost.
  const forwardChange = (qId: string, mutate: (prev: QuestionAnswer) => QuestionAnswer) => {
    const q = questionById[qId];
    if (!q) return;
    setAnswers((prev) => {
      const current = prev[qId] ?? emptyAnswerFor(q);
      return { ...prev, [qId]: mutate(current) };
    });
  };

  // Review phase: every question is already locked. Changing ANY part of a
  // question's answer for the first time during review consumes 1 of the 3
  // edits for the whole section; further tweaks to that same question
  // during review are then free (the section's edit budget is spent per
  // QUESTION changed, not per individual click — this matters once a
  // question can have several sub-parts, like Table Analysis's 3
  // statements, which shouldn't burn the whole budget in one question).
  const reviewChange = (qId: string, mutate: (prev: QuestionAnswer) => QuestionAnswer) => {
    const q = questionById[qId];
    if (!q) return;
    const current = answers[qId] ?? emptyAnswerFor(q);
    const next = mutate(current);
    if (answersEqual(current, next)) return;

    const alreadyEdited = editedQuestions.has(qId);
    if (!alreadyEdited && editsLeft <= 0) {
      toast.error("You've used all 3 answer changes allowed for this section.");
      return;
    }
    setAnswers((prev) => ({ ...prev, [qId]: next }));
    if (!alreadyEdited) {
      setEditedQuestions((prev) => new Set(prev).add(qId));
    }
  };

  const changeAnswer = view === "reviewEdit" ? reviewChange : forwardChange;

  const setSingle = (qId: string, val: string) => changeAnswer(qId, () => ({ kind: "single", value: val }));
  const setStatement = (qId: string, stId: string, val: "Yes" | "No") =>
    changeAnswer(qId, (prev) => ({
      kind: "statements",
      values: { ...(prev.kind === "statements" ? prev.values : {}), [stId]: val },
    }));
  const setBlank = (qId: string, blankId: string, val: string) =>
    changeAnswer(qId, (prev) => ({
      kind: "blanks",
      values: { ...(prev.kind === "blanks" ? prev.values : {}), [blankId]: val },
    }));
  const setPart1 = (qId: string, val: string) =>
    changeAnswer(qId, (prev) => ({ kind: "twoPart", part1: val, part2: prev.kind === "twoPart" ? prev.part2 : undefined }));
  const setPart2 = (qId: string, val: string) =>
    changeAnswer(qId, (prev) => ({ kind: "twoPart", part2: val, part1: prev.kind === "twoPart" ? prev.part1 : undefined }));

  const goNext = () => {
    if (!selectedTest) return;
    const questions = selectedTest.questions;
    const currentQ = questions[currentIdx];
    if (!isAnswerComplete(currentQ, answers[currentQ.id])) {
      toast.error("You must complete this question before moving to the next one.");
      return;
    }
    if (currentIdx < questions.length - 1) {
      setCurrentIdx((i) => i + 1);
    } else {
      reachedReviewRef.current = true;
      setReviewIdx(0);
      setView("reviewEdit");
    }
  };

  const handleSubmit = useCallback(async () => {
    if (!selectedTest || submitted) return;
    setSubmitted(true);

    let correct = 0,
      wrong = 0,
      skipped = 0;

    selectedTest.questions.forEach((q) => {
      const ans = answers[q.id];
      if (!isAnswerComplete(q, ans)) {
        skipped++;
      } else if (isAnswerCorrect(q, ans)) {
        correct++;
      } else {
        wrong++;
      }
    });

    const total = selectedTest.questions.length;
    const scaledScore = calcScaledScore(correct, total);
    const totalScore = Math.round((correct / total) * 100);
    const timeSpent = selectedTest.durationMinutes * 60 - timeLeft;

    const payload: SectionalResult = {
      testId: selectedTest.id,
      section: selectedTest.section,
      totalScore,
      correctAnswers: correct,
      wrongAnswers: wrong,
      skippedQuestions: skipped,
      timeSpent,
      studentAnswers: answers,
      scaledScore,
      editsUsed,
      reachedReview: reachedReviewRef.current,
    };

    try {
      await apiRequest("/sectional-results", { method: "POST", body: JSON.stringify(payload) });
      setResult(payload);
      setAttempts((prev) => ({ ...prev, [selectedTest.id]: payload }));
      setView("result");
      toast.success("Section submitted!");
    } catch (err: any) {
      toast.error("Failed to save result");
      setResult(payload);
      setView("result");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTest, submitted, answers, timeLeft, editsUsed]);

  // ── Sorting for the list view ───────────────────────────────────────────
  const sortedTests = useMemo(() => {
    const rank = (s: GmatSection) => SECTION_ORDER.indexOf(s);
    const copy = [...availableTests];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "section":
          cmp = rank(a.section) - rank(b.section) || a.name.localeCompare(b.name);
          break;
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "duration":
          cmp = a.durationMinutes - b.durationMinutes;
          break;
        case "status": {
          const aDone = attempts[a.id] ? 1 : 0;
          const bDone = attempts[b.id] ? 1 : 0;
          cmp = aDone - bDone || a.name.localeCompare(b.name);
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [availableTests, sortKey, sortDir, attempts]);

  // ─────────────────────────────────────────────────────────────────────
  // VIEWS
  // ─────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── LIST ────────────────────────────────────────────────────────────────
  if (view === "list") {
    const groupedBySection = sortKey === "section";
    const grouped = groupedBySection
      ? (sortDir === "asc" ? SECTION_ORDER : [...SECTION_ORDER].reverse()).reduce((acc, sec) => {
          acc[sec] = sortedTests.filter((t) => t.section === sec);
          return acc;
        }, {} as Record<GmatSection, SectionalTest[]>)
      : null;

    const renderCard = (t: SectionalTest) => {
      const meta = SECTION_META[t.section];
      const attempted = attempts[t.id];
      return (
        <Card key={t.id} className={`hover:shadow-md transition-all border-t-4 ${meta.color.replace("bg-", "border-t-")}`}>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <Badge variant="outline" className={`${meta.lightColor} ${meta.textColor} ${meta.borderColor} text-[10px] font-bold`}>
                {meta.short}
              </Badge>
              {attempted ? (
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none text-[10px]">Completed</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  Pending
                </Badge>
              )}
            </div>
            <CardTitle className="text-base mt-2">{t.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock size={12} /> {t.durationMinutes} min
              </span>
              <span className="flex items-center gap-1">
                <BookOpen size={12} /> {t.questions?.length ?? "–"} Qs
              </span>
            </div>
            {attempted && (
              <div className={`p-3 rounded-xl ${meta.lightColor} border ${meta.borderColor}`}>
                <div className="flex gap-4 text-center">
                  <div className="flex-1">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Score</p>
                    <p className={`text-xl font-black ${meta.textColor}`}>{attempted.scaledScore}</p>
                  </div>
                  <div className="w-px bg-border" />
                  <div className="flex-1">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Correct</p>
                    <p className="text-xl font-black text-green-600">{attempted.correctAnswers}</p>
                  </div>
                  <div className="w-px bg-border" />
                  <div className="flex-1">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">Acc.</p>
                    <p className="text-xl font-black">{attempted.totalScore}%</p>
                  </div>
                </div>
              </div>
            )}
            <Button className="w-full" variant={attempted ? "outline" : "default"} onClick={() => startTest(t)} disabled={testLoading}>
              {testLoading && selectedTest?.id === t.id ? "Loading..." : attempted ? "Review Attempt" : "Start Section"}
            </Button>
          </CardContent>
        </Card>
      );
    };

    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">GMAT Sectional Tests</h1>
          <p className="text-muted-foreground mt-1">GMAT Focus Edition section-wise mocks · 45 min · Real exam interface</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SECTION_ORDER.map((sec) => {
            const meta = SECTION_META[sec];
            return (
              <div key={sec} className={`rounded-xl p-4 border ${meta.lightColor} ${meta.borderColor}`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full ${meta.color}`} />
                  <span className={`text-xs font-bold uppercase tracking-wider ${meta.textColor}`}>{meta.short}</span>
                </div>
                <p className="font-semibold text-sm">{meta.label}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {meta.questions} Qs · {meta.minutes} min
                </p>
              </div>
            );
          })}
        </div>

        {availableTests.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center border border-dashed rounded-2xl bg-background">
            <BookOpen className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="font-bold text-lg">No Sectional Tests Available</h3>
            <p className="text-muted-foreground max-w-sm mt-1">Your admin hasn't published any sectional tests yet. Check back soon.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Sort controls */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold text-muted-foreground flex items-center gap-1.5">
                <SortIcon size={14} /> Sort by
              </span>
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="section">Section</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="duration">Duration</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                title="Reverse order"
              >
                {sortDir === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                {sortDir === "asc" ? "Ascending" : "Descending"}
              </Button>
            </div>

            {groupedBySection && grouped ? (
              <div className="space-y-8">
                {(sortDir === "asc" ? SECTION_ORDER : [...SECTION_ORDER].reverse()).map((sec) => {
                  const tests = grouped[sec];
                  if (!tests?.length) return null;
                  const meta = SECTION_META[sec];
                  return (
                    <div key={sec}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-3 h-3 rounded-full ${meta.color}`} />
                        <h2 className="font-bold text-lg">{meta.label}</h2>
                        <Badge variant="secondary">{tests.length} tests</Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{tests.map(renderCard)}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{sortedTests.map(renderCard)}</div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── INSTRUCTIONS ─────────────────────────────────────────────────────────
  if (view === "instructions" && selectedTest) {
    const meta = SECTION_META[selectedTest.section];
    const rules = [
      "This is a timed section test. The timer starts the moment you click Begin, and keeps running through the review screen described below.",
      "Questions appear one at a time and you cannot skip ahead. You must complete the current question before the Next button unlocks.",
      "There is no negative marking — an incorrect answer costs you nothing beyond the question itself. But an unanswered question is not allowed; you cannot leave one blank to look at a later question.",
      "While moving forward, you can bookmark (flag) any question, as many as you like, to find it quickly later.",
      "If you answer the final question with time still on the clock, you'll reach the Question Review & Edit screen. There you can open any question in the section — but you may change at most 3 answers in total for the whole section.",
      "If the timer hits zero before you finish answering every question, the section submits immediately with whatever you've answered so far, and the Review & Edit screen will not appear.",
      "Once you submit the section — manually or because time ran out — your answers are final and cannot be changed.",
    ];
    if (selectedTest.section === "DataInsights") {
      rules.push(
        "This section mixes several question formats — plain multiple choice, sortable data tables, chart-based dropdowns, two-part linked answers, and multi-source tabs. Read each question's format carefully before answering."
      );
    }

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="ghost" className="gap-2" onClick={() => setView("list")}>
          <ArrowLeft size={16} /> Back
        </Button>
        <Card className={`border-2 ${meta.borderColor}`}>
          <CardHeader className={`${meta.lightColor} rounded-t-xl`}>
            <div className={`text-xs font-bold uppercase tracking-widest ${meta.textColor} mb-1`}>{meta.short}</div>
            <CardTitle className="text-2xl">{selectedTest.name}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                ["Questions", selectedTest.questions?.length],
                ["Duration", `${selectedTest.durationMinutes} min`],
                ["Marking", "No penalty"],
              ].map(([label, val]) => (
                <div key={label} className="p-4 bg-secondary/30 rounded-xl">
                  <p className="text-2xl font-black">{val}</p>
                  <p className="text-xs text-muted-foreground font-bold uppercase mt-1">{label}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <h3 className="font-bold text-sm uppercase tracking-wide text-muted-foreground">Instructions</h3>
              {rules.map((rule, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <span className={`w-5 h-5 shrink-0 rounded-full ${meta.color} text-white flex items-center justify-center text-[10px] font-bold mt-0.5`}>
                    {i + 1}
                  </span>
                  <p className="text-muted-foreground">{rule}</p>
                </div>
              ))}
            </div>

            <Button size="lg" className="w-full" onClick={beginTest}>
              Begin Section · {selectedTest.durationMinutes} min
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── SEQUENTIAL TEST VIEW ─────────────────────────────────────────────────
  if (view === "test" && selectedTest) {
    const questions = selectedTest.questions || [];
    if (!questions.length) {
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <p className="text-muted-foreground">No questions found in this test.</p>
          <Button onClick={() => setView("list")}>Back to Tests</Button>
        </div>
      );
    }
    const currentQ = questions[currentIdx];
    if (!currentQ) return null;
    const meta = SECTION_META[selectedTest.section];
    const answeredCount = questions.filter((q) => isAnswerComplete(q, answers[q.id])).length;
    const progress = (answeredCount / questions.length) * 100;
    const isLast = currentIdx === questions.length - 1;
    const answered = isAnswerComplete(currentQ, answers[currentQ.id]);
    const showHeaderPrompt = currentQ.questionType !== "graphics_interpretation";

    return (
      <div className="flex flex-col h-full min-h-screen">
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b shadow-sm">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Badge className={`${meta.color} text-white border-none`}>{meta.short}</Badge>
              <span className="text-sm font-medium hidden sm:block truncate max-w-[200px]">{selectedTest.name}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-bold text-foreground">{currentIdx + 1}</span> / {questions.length}
              </div>
              <div
                className={`flex items-center gap-2 font-mono font-bold text-sm px-3 py-1.5 rounded-lg ${
                  timeLeft < 300 ? "bg-red-100 text-red-600 animate-pulse" : "bg-secondary text-foreground"
                }`}
              >
                <Clock size={14} />
                {formatTime(timeLeft)}
              </div>
            </div>
          </div>
          <Progress value={progress} className="h-1 rounded-none" />
        </div>

        <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 space-y-4">
          {activeStimulus && (
            <Card className="border-l-4 border-l-violet-400">
              <CardHeader className="pb-2">
                <span className="text-xs font-bold uppercase text-muted-foreground tracking-wide">
                  {STIMULUS_KIND_LABELS[activeStimulus.kind]} · {activeStimulus.title}
                </span>
              </CardHeader>
              <CardContent>
                <StimulusBoard stimulus={activeStimulus} />
              </CardContent>
            </Card>
          )}

          <Card className="shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${meta.lightColor} ${meta.textColor}`}>
                    Q {currentIdx + 1} / {questions.length}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {QUESTION_TYPE_LABELS[currentQ.questionType]}
                  </Badge>
                  {!answered && (
                    <span className="text-[10px] font-bold text-orange-500 flex items-center gap-1">
                      <AlertCircle size={12} /> Complete this question to continue
                    </span>
                  )}
                </div>
                <button
                  onClick={() => toggleFlag(currentQ.id)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    flagged.has(currentQ.id) ? "text-orange-500 bg-orange-50" : "text-muted-foreground hover:bg-secondary"
                  }`}
                  title="Bookmark for review"
                >
                  <Flag size={16} fill={flagged.has(currentQ.id) ? "currentColor" : "none"} />
                </button>
              </div>
              {showHeaderPrompt && (
                <p className="text-base font-semibold leading-relaxed mt-3">
                  <MultiParagraphLatex text={currentQ.questionText} />
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              <QuestionBody
                question={currentQ}
                answer={answers[currentQ.id]}
                onSelectSingle={(val) => setSingle(currentQ.id, val)}
                onSelectStatement={(stId, val) => setStatement(currentQ.id, stId, val)}
                onSelectBlank={(blankId, val) => setBlank(currentQ.id, blankId, val)}
                onSelectPart1={(val) => setPart1(currentQ.id, val)}
                onSelectPart2={(val) => setPart2(currentQ.id, val)}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end items-center">
            <Button onClick={goNext} disabled={!answered} className="gap-1" size="lg">
              {isLast ? (
                <>
                  Answer & Continue to Review <ChevronRight size={16} />
                </>
              ) : (
                <>
                  Next Question <ChevronRight size={16} />
                </>
              )}
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            You can bookmark this question, but you cannot skip it or come back to it until the Review & Edit screen.
          </p>
        </div>
      </div>
    );
  }

  // ── QUESTION REVIEW & EDIT VIEW ──────────────────────────────────────────
  if (view === "reviewEdit" && selectedTest) {
    const questions = selectedTest.questions;
    const meta = SECTION_META[selectedTest.section];
    const reviewQ = questions[reviewIdx];
    if (!reviewQ) return null;
    const canEditThisQuestion = editedQuestions.has(reviewQ.id) || editsLeft > 0;
    const answeredCount = questions.filter((q) => isAnswerComplete(q, answers[q.id])).length;
    const showHeaderPrompt = reviewQ.questionType !== "graphics_interpretation";

    return (
      <div className="flex flex-col h-full min-h-screen">
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b shadow-sm">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Badge className={`${meta.color} text-white border-none`}>{meta.short}</Badge>
              <span className="text-sm font-bold flex items-center gap-1">
                <ListChecks size={14} /> Question Review &amp; Edit
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div
                className={`hidden sm:flex items-center gap-2 text-xs font-bold px-2.5 py-1 rounded-lg ${
                  editsLeft === 0 ? "bg-red-100 text-red-600" : "bg-secondary text-foreground"
                }`}
              >
                {editsLeft === 0 ? <Lock size={12} /> : null}
                {editsLeft} of {MAX_EDITS_PER_SECTION} edits left
              </div>
              <div
                className={`flex items-center gap-2 font-mono font-bold text-sm px-3 py-1.5 rounded-lg ${
                  timeLeft < 300 ? "bg-red-100 text-red-600 animate-pulse" : "bg-secondary text-foreground"
                }`}
              >
                <Clock size={14} />
                {formatTime(timeLeft)}
              </div>
              <Button size="sm" variant="destructive" onClick={handleSubmit}>
                Submit Section
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
              You can open any question below. Changing the answer on a question for the first time this review uses one of your{" "}
              <strong>{MAX_EDITS_PER_SECTION} edits</strong> for this section — after that, you can keep adjusting that same
              question for free. Viewing a question never costs an edit.
            </div>

            {activeStimulus && (
              <Card className="border-l-4 border-l-violet-400">
                <CardHeader className="pb-2">
                  <span className="text-xs font-bold uppercase text-muted-foreground tracking-wide">
                    {STIMULUS_KIND_LABELS[activeStimulus.kind]} · {activeStimulus.title}
                  </span>
                </CardHeader>
                <CardContent>
                  <StimulusBoard stimulus={activeStimulus} />
                </CardContent>
              </Card>
            )}

            <Card className="shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${meta.lightColor} ${meta.textColor}`}>
                      Q {reviewIdx + 1} / {questions.length}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {QUESTION_TYPE_LABELS[reviewQ.questionType]}
                    </Badge>
                    {editedQuestions.has(reviewQ.id) && (
                      <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-none text-[10px]">Edited</Badge>
                    )}
                  </div>
                  <button
                    onClick={() => toggleFlag(reviewQ.id)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      flagged.has(reviewQ.id) ? "text-orange-500 bg-orange-50" : "text-muted-foreground hover:bg-secondary"
                    }`}
                    title="Bookmark"
                  >
                    <Flag size={16} fill={flagged.has(reviewQ.id) ? "currentColor" : "none"} />
                  </button>
                </div>
                {showHeaderPrompt && (
                  <p className="text-base font-semibold leading-relaxed mt-3">
                    <MultiParagraphLatex text={reviewQ.questionText} />
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                <QuestionBody
                  question={reviewQ}
                  answer={answers[reviewQ.id]}
                  disabled={!canEditThisQuestion}
                  onSelectSingle={(val) => setSingle(reviewQ.id, val)}
                  onSelectStatement={(stId, val) => setStatement(reviewQ.id, stId, val)}
                  onSelectBlank={(blankId, val) => setBlank(reviewQ.id, blankId, val)}
                  onSelectPart1={(val) => setPart1(reviewQ.id, val)}
                  onSelectPart2={(val) => setPart2(reviewQ.id, val)}
                />
                {!canEditThisQuestion && (
                  <p className="text-xs text-red-600 flex items-center gap-1 mt-2">
                    <Lock size={12} /> You've used all {MAX_EDITS_PER_SECTION} answer changes for this section — this question's
                    answer is now locked.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between items-center">
              <Button variant="outline" onClick={() => setReviewIdx((i) => Math.max(0, i - 1))} disabled={reviewIdx === 0} className="gap-1">
                <ChevronLeft size={16} /> Previous
              </Button>
              {reviewIdx < questions.length - 1 ? (
                <Button variant="outline" onClick={() => setReviewIdx((i) => Math.min(questions.length - 1, i + 1))} className="gap-1">
                  Next <ChevronRight size={16} />
                </Button>
              ) : (
                <Button variant="destructive" onClick={handleSubmit}>
                  Submit Section
                </Button>
              )}
            </div>
          </div>

          <div className="lg:sticky lg:top-[88px] self-start space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">All Questions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-1.5 mb-4">
                  {questions.map((q, idx) => (
                    <StatusDot
                      key={q.id}
                      idx={idx}
                      answered={isAnswerComplete(q, answers[q.id])}
                      flagged={flagged.has(q.id)}
                      current={idx === reviewIdx}
                      onClick={() => setReviewIdx(idx)}
                    />
                  ))}
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground border-t pt-3">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-blue-500" />
                    Answered ({answeredCount})
                  </div>
                  <div className="flex items-center gap-2 relative">
                    <div className="w-4 h-4 rounded bg-secondary border relative">
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-orange-400 rounded-full" />
                    </div>
                    Bookmarked ({flagged.size})
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={`border ${meta.borderColor}`}>
              <CardContent className="pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Edits remaining</span>
                  <span className={`font-bold ${editsLeft === 0 ? "text-red-600" : meta.textColor}`}>
                    {editsLeft} / {MAX_EDITS_PER_SECTION}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bookmarked</span>
                  <span className="font-bold text-orange-500">{flagged.size}</span>
                </div>
              </CardContent>
            </Card>

            <Button className="w-full gap-2" size="lg" variant="destructive" onClick={handleSubmit}>
              Submit Section
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── RESULT VIEW ───────────────────────────────────────────────────────────
  if (view === "result" && result && selectedTest) {
    const meta = SECTION_META[selectedTest.section as GmatSection];
    const questions = selectedTest.questions;

    if (reviewMode) {
      return (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => setReviewMode(false)} className="gap-1">
              <ArrowLeft size={16} /> Back to Results
            </Button>
            <span className="font-bold">{selectedTest.name} · Review</span>
          </div>
          <div className="space-y-4">
            {questions.map((q, idx) => {
              const studentAns = result.studentAnswers[q.id];
              const complete = isAnswerComplete(q, studentAns);
              const isCorrect = complete && isAnswerCorrect(q, studentAns);
              const stimulus = q.passageId && selectedTest.passages ? selectedTest.passages.find((s) => s.id === q.passageId) : null;

              return (
                <Card key={q.id} className={`border-l-4 ${isCorrect ? "border-l-green-500" : !complete ? "border-l-yellow-400" : "border-l-red-500"}`}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="outline">{SECTION_META[q.section]?.short ?? q.section}</Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {QUESTION_TYPE_LABELS[q.questionType]}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {q.difficulty}
                        </Badge>
                      </div>
                      {isCorrect ? (
                        <span className="text-green-600 flex items-center gap-1 text-xs font-bold">
                          <CheckCircle2 size={14} /> Correct
                        </span>
                      ) : !complete ? (
                        <span className="text-yellow-600 flex items-center gap-1 text-xs font-bold">
                          <AlertCircle size={14} /> Skipped
                        </span>
                      ) : (
                        <span className="text-red-600 flex items-center gap-1 text-xs font-bold">
                          <XCircle size={14} /> Incorrect
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-sm mt-2">
                      <span>Q{idx + 1}. </span>
                      <MultiParagraphLatex text={q.questionText} />
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {stimulus && (
                      <div className="rounded-lg border p-3 bg-secondary/20">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2">
                          {STIMULUS_KIND_LABELS[stimulus.kind]} · {stimulus.title}
                        </p>
                        <StimulusBoard stimulus={stimulus} />
                      </div>
                    )}

                    <QuestionBody
                      question={q}
                      answer={studentAns}
                      disabled
                      onSelectSingle={() => {}}
                      onSelectStatement={() => {}}
                      onSelectBlank={() => {}}
                      onSelectPart1={() => {}}
                      onSelectPart2={() => {}}
                    />

                    {q.questionType === "standard_mcq" || (q.questionType === "multi_source_reasoning" && !q.statements?.length) ? (
                      <div className="grid gap-1.5">
                        {(q.options ?? []).map((opt) => (
                          <div
                            key={opt}
                            className={`px-3 py-2 rounded-lg text-sm border ${
                              opt === q.correctAnswer
                                ? "bg-green-50 border-green-200 text-green-800 font-medium"
                                : opt === (studentAns?.kind === "single" ? studentAns.value : undefined)
                                ? "bg-red-50 border-red-200 text-red-800"
                                : "bg-secondary/20 border-transparent"
                            }`}
                          >
                            <Latex> {opt}</Latex>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {q.explanation && (
                      <div className="bg-secondary/30 p-3 rounded-lg text-sm">
                        <p className="font-bold text-xs uppercase mb-1">Explanation</p>
                        <div className="text-muted-foreground">
                          <MultiParagraphLatex text={q.explanation} />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      );
    }

    const attemptRate = Math.round(((result.correctAnswers + result.wrongAnswers) / questions.length) * 100);

    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => setView("list")} className="gap-1">
            <ArrowLeft size={16} /> All Tests
          </Button>
        </div>

        <Card className={`border-2 ${meta.borderColor} overflow-hidden`}>
          <div className={`${meta.color} px-6 py-5 text-white`}>
            <p className="text-sm font-bold uppercase tracking-widest opacity-80">{meta.label}</p>
            <h2 className="text-2xl font-black mt-1">{selectedTest.name}</h2>
          </div>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              {[
                { label: "Scaled Score", val: `${result.scaledScore}`, color: meta.textColor, big: true },
                { label: "Correct / Total", val: `${result.correctAnswers}/${questions.length}`, color: "text-foreground" },
                { label: "Accuracy", val: `${result.totalScore}%`, color: "text-foreground" },
                { label: "Time Taken", val: `${Math.floor(result.timeSpent / 60)}m ${result.timeSpent % 60}s`, color: "text-foreground" },
              ].map(({ label, val, color, big }) => (
                <div key={label} className="p-4 bg-secondary/20 rounded-xl">
                  <p className="text-xs font-bold uppercase text-muted-foreground mb-1">{label}</p>
                  <p className={`font-black ${big ? "text-4xl" : "text-2xl"} ${color}`}>{val}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground text-center mt-3">
              Scaled score (60–90) is a practice-test approximation based on accuracy, since GMAC's real adaptive scoring algorithm isn't public.
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5 text-center border-t-4 border-t-green-500">
            <CheckCircle2 className="mx-auto text-green-500 mb-2" size={24} />
            <p className="text-3xl font-black text-green-600">{result.correctAnswers}</p>
            <p className="text-xs font-bold uppercase text-muted-foreground mt-1">Correct</p>
          </Card>
          <Card className="p-5 text-center border-t-4 border-t-red-500">
            <XCircle className="mx-auto text-red-500 mb-2" size={24} />
            <p className="text-3xl font-black text-red-600">{result.wrongAnswers}</p>
            <p className="text-xs font-bold uppercase text-muted-foreground mt-1">Incorrect</p>
            <p className="text-xs text-muted-foreground font-semibold mt-1">No penalty</p>
          </Card>
          <Card className="p-5 text-center border-t-4 border-t-yellow-400">
            <AlertCircle className="mx-auto text-yellow-500 mb-2" size={24} />
            <p className="text-3xl font-black text-yellow-600">{result.skippedQuestions}</p>
            <p className="text-xs font-bold uppercase text-muted-foreground mt-1">Skipped</p>
          </Card>
        </div>

        <Card className="p-5">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-bold">Attempt Rate</span>
            <span className="text-sm font-bold">{attemptRate}%</span>
          </div>
          <Progress value={attemptRate} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">
            You attempted {result.correctAnswers + result.wrongAnswers} of {questions.length} questions.
            {typeof result.editsUsed === "number" && (
              <>
                {" "}
                Used {result.editsUsed} of {MAX_EDITS_PER_SECTION} answer edits.
              </>
            )}
            {result.reachedReview === false && <> The Review &amp; Edit screen was not reached because time ran out first.</>}
          </p>
        </Card>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 gap-2" onClick={() => setReviewMode(true)}>
            <Eye size={16} /> Review All Questions
          </Button>
          <Button className="flex-1 gap-2" onClick={() => setView("list")}>
            <BarChart3 size={16} /> Back to Tests
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
