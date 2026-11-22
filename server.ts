import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { google } from "googleapis";
import { GoogleGenAI, Type } from "@google/genai";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("FATAL: JWT_SECRET is missing or too short");
  process.exit(1);
}

// --- Google Sheets Configuration ---
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const MOCK_SPREADSHEET_ID = process.env.MOCK_SPREADSHEET_ID;
// Separate spreadsheet for the GMAT sectional tests (falls back to SPREADSHEET_ID if unset)
const GMAT_SPREADSHEET_ID = process.env.GMAT_SPREADSHEET_ID;
const GOOGLE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

const auth = new google.auth.JWT({
  email: GOOGLE_EMAIL,
  key: GOOGLE_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// Log configuration status on startup
if (SPREADSHEET_ID && GOOGLE_EMAIL && GOOGLE_KEY) {
  console.log("✅ Google Sheets credentials detected.");
  console.log(`- Spreadsheet ID: ${SPREADSHEET_ID}`);
  console.log(`- Service Account: ${GOOGLE_EMAIL}`);
  
  // Attempt a test read
  fetchSheetData("Students").then(data => {
    if (data) {
      console.log("🚀 Connection Test: SUCCESS. Can read 'Students' sheet.");
    } else {
      console.warn("⚠️ Connection Test: FAILED. Check backend logs for specific errors above.");
    }
  });
} else {
  console.warn("⚠️ Google Sheets NOT fully configured. Checking missing keys:");
  if (!SPREADSHEET_ID) console.warn("  - Missing SPREADSHEET_ID");
  if (!GOOGLE_EMAIL) console.warn("  - Missing GOOGLE_SERVICE_ACCOUNT_EMAIL");
  if (!GOOGLE_KEY) console.warn("  - Missing GOOGLE_PRIVATE_KEY");
}

/**
 * Maps sheet names to column structures for automated serialization
 */
const SHEET_CONFIG: Record<string, string[]> = {
  Students: ["id", "email", "password", "name", "phone", "registrationDate", "status", "role", "targetExam"],
  CourseMaterials: ["id", "topicName", "section", "googleSheetLink", "googleDriveLink", "description", "dateAdded", "targetExam"],
  VideoLectures: ["id", "topicName", "section", "googleSheetLink", "googleDriveLink", "duration", "instructorName", "dateUploaded", "targetExam"],
  UnverifiedQuestions: ["id", "section", "questionText", "options", "correctAnswer", "explanation", "difficulty", "passageId", "targetExam"],
  ApprovedQuestions: ["id", "section", "questionText", "options", "correctAnswer", "explanation", "difficulty", "passageId", "targetExam", "approvedDate"],
  DailyTests: ["id", "name", "testDate", "questionIds", "durationMinutes", "passageIds", "targetExam"],
  DailyPassages: ["id", "title", "text", "targetExam"],
  TestResults: ["id", "studentId", "testDate", "testId", "totalScore", "correctAnswers", "wrongAnswers", "skippedQuestions", "timeSpent", "sectionScores", "studentAnswers"],
   SectionalTests:   ["id", "name", "section", "durationMinutes", "questionIds", "passageIds", "targetExam", "publishedDate"],
  SectionalQuestions: ["id", "section", "questionText", "questionType", "options", "correctAnswer", "answerTolerance", "explanation", "difficulty", "passageId", "targetExam"],
  SectionalPassages:  ["id", "title", "text", "targetExam"],
  SectionalResults:   ["id", "studentId", "testId", "section", "totalScore", "correctAnswers", "wrongAnswers", "wrongTITA", "skippedQuestions", "timeSpent", "studentAnswers", "scaledScore", "submittedAt"],
   MockTests:      ["id", "name", "totalDurationMinutes", "sectionDurationMinutes", "questionIds", "passageIds", "targetExam", "publishedDate", "studentsAttempted"],
  MockQuestions:  ["id", "section", "questionText", "questionType", "options", "correctAnswer", "answerTolerance", "explanation", "difficulty", "passageId", "targetExam"],
  MockPassages:   ["id", "title", "text", "targetExam"],
  MockResults:    ["id", "studentId", "testId", "totalScore", "overallScaledScore", "percentile", "sectionResults", "studentAnswers", "timeSpent", "submittedAt"],
  PYQPapers:      ["id", "name", "year", "slot", "examDate", "totalDurationMinutes", "sectionDurationMinutes", "questionIds", "passageIds", "targetExam", "publishedDate", "studentsAttempted"],
  PYQQuestions:   ["id", "section", "questionText", "questionType", "options", "correctAnswer", "answerTolerance", "explanation", "difficulty", "passageId", "targetExam"],
  PYQPassages:    ["id", "title", "text", "targetExam"],
  PYQResults:     ["id", "studentId", "paperId", "totalScore", "overallScaledScore", "percentile", "sectionResults", "studentAnswers", "timeSpent", "submittedAt"],
  Announcements: ["id", "title", "content", "createdDate", "createdBy", "targetExam"],

  GmatSectionalTests:     ["id", "name", "section", "durationMinutes", "questionIds", "passageIds", "targetExam", "publishedDate"],
  GmatSectionalQuestions: ["id", "section", "questionType", "questionText", "options", "correctAnswer", "typeData", "explanation", "difficulty", "passageId", "targetExam"],
  GmatSectionalPassages:  ["id", "title", "kind", "text", "data", "chartImageUrl", "targetExam"],
  GmatMockTests:     ["id", "name", "description", "totalDurationMinutes", "sectionDurationMinutes", "questionIds", "passageIds", "targetExam", "publishedDate", "studentsAttempted"],
  GmatMockQuestions: ["id", "section", "questionType", "questionText", "options", "correctAnswer", "typeData", "explanation", "difficulty", "passageId", "targetExam"],
  GmatMockPassages:  ["id", "title", "kind", "text", "data", "chartImageUrl", "targetExam"],
  GmatMockResults:   ["id", "studentId", "testId", "totalScore", "overallScaledScore", "percentile", "sectionResults", "studentAnswers", "sectionOrder", "timeSpent", "submittedAt"],

  GmatSectionalResults:   ["id", "studentId", "testId", "section", "totalScore", "correctAnswers", "wrongAnswers", "skippedQuestions", "timeSpent", "studentAnswers", "scaledScore", "editsUsed", "reachedReview", "submittedAt"]
};

/**
 * Utility to fetch data from a Google Sheet
 * Robust version: uses row 1 as headers to map data correctly regardless of column order
 */
function normalizeKey(str: string): string {
  if (!str) return "";
  return str.toLowerCase().replace(/[\s_\-]/g, "");
}

const SECTIONAL_JSON_FIELDS = ["options", "typeData", "data"];
const SECTIONAL_OBJECT_FIELDS = ["typeData"];


function parseSheetJson(raw: string, label: string): any {
  const s = String(raw ?? "").trim();
  const attempts = [
    s,
    s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'"),
    s.replace(/[\u201C\u201D]/g, '"').replace(/\r?\n/g, "\\n").replace(/\t/g, "\\t"),
  ];
  for (const a of attempts) {
    try { return JSON.parse(a); } catch { /* try the next repair */ }
  }
  console.error(`⚠️  JSON.parse failed for ${label} (row will use empty default). Raw value (first 200 chars): ${s.slice(0, 200)}`);
  return undefined;
}

const isBlankVal = (v: any) =>
  v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);

// Older rows may still have the previous flat columns; they only fill gaps the blob leaves.
const LEGACY_QUESTION_COLUMNS = ["statements", "blanks", "twoPartOptions", "correctPart1", "correctPart2"];
const LEGACY_PASSAGE_COLUMNS = ["table", "tabs"];
const LEGACY_JSON_COLUMNS = ["statements", "blanks", "table", "tabs"]; // parsed server-side; unparseable -> omitted

const PACKED_QUESTION_RANGES = ["GmatSectionalQuestions", "GmatMockQuestions"];
const PACKED_PASSAGE_RANGES = ["GmatSectionalPassages", "GmatMockPassages"];

// "Quant" | "Verbal" | "DataInsights" from whatever is typed in the sheet
function normalizeSectionCell(v: any): string {
  const t = String(v ?? "").toLowerCase().replace(/[\s_\-]/g, "");
  return t.includes("quant") || t === "qr" || t === "qa" ? "Quant"
    : t.includes("verbal") || t === "vr" || t.includes("varc") ? "Verbal"
    : "DataInsights";
}

// options / twoPartOptions: a JSON array OR one option per line -> string[]
function toOptionList(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  const cell = String(v ?? "").trim();
  if (!cell) return [];
  if (cell.startsWith("[")) {
    const arr = parseSheetJson(cell, "an options list");
    if (Array.isArray(arr)) return arr.map((x: any) => String(x));
  }
  return cell.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}

function mapPackedSectionalRows(range: string, headers: string[], dataRows: any[][], expectedKeys: string[]) {
  const isMock = range.startsWith("GmatMock");
  const col = (row: any[], name: string) => {
    const i = headers.indexOf(normalizeKey(name));
    return i === -1 ? undefined : row[i];
  };
  // legacy flat column -> value to use (JSON-ish columns are parsed, bad ones are dropped)
  const legacyValue = (k: string, raw: any) => {
    if (!LEGACY_JSON_COLUMNS.includes(k)) return raw;
    const t = typeof raw === "string" ? raw.trim() : "";
    if (!(t.startsWith("[") || t.startsWith("{"))) return undefined;
    return parseSheetJson(t, `legacy column "${k}" in sheet "${range}"`);
  };

  return dataRows.map((row) => {
    const obj: any = {};
    expectedKeys.forEach((key) => {
      const index = headers.indexOf(normalizeKey(key));
      const emptyDefault = SECTIONAL_OBJECT_FIELDS.includes(key) ? {} : [];
      let val: any = index !== -1 ? row[index] || "" : "";
      if (SECTIONAL_JSON_FIELDS.includes(key)) {
        if (typeof val === "string" && (val.trim().startsWith("[") || val.trim().startsWith("{"))) {
          const parsed = parseSheetJson(val, `column "${key}" in sheet "${range}" (row id "${String(row[headers.indexOf("id")] ?? "?").trim()}")`);
          val = parsed === undefined ? emptyDefault : parsed;
        } else if (val === "") {
          val = emptyDefault;
        }
      }
      obj[key] = val;
    });
   
    if (typeof obj.id === "string") obj.id = obj.id.trim();
    if (typeof obj.passageId === "string") obj.passageId = obj.passageId.trim();

    if (PACKED_QUESTION_RANGES.includes(range)) {
      const { typeData, ...rest } = obj;
      const flat: any = typeData && typeof typeData === "object" && !Array.isArray(typeData) ? { ...rest, ...typeData } : rest;
      for (const k of LEGACY_QUESTION_COLUMNS) {
        if (!isBlankVal(flat[k])) continue;
        const legacy = legacyValue(k, col(row, k));
        if (!isBlankVal(legacy)) flat[k] = legacy;
      }
      if (isMock) {
        // mock clients expect clean lists and a canonical section name
        flat.section = normalizeSectionCell(flat.section);
        flat.options = toOptionList(flat.options);
        flat.twoPartOptions = toOptionList(flat.twoPartOptions);
      }
      return flat;
    }

    // passages
    const { data, ...rest } = obj;
    const kind = String(obj.kind || "").trim().toLowerCase();
    if (kind === "table" || kind === "tabs") {
      if (isBlankVal(data)) console.warn(`⚠️  ${range} row "${obj.id}" has kind="${kind}" but empty/missing "data" column.`);
      else rest[kind] = data;
    }
    for (const k of LEGACY_PASSAGE_COLUMNS) {
      if (!isBlankVal(rest[k])) continue;
      const legacy = legacyValue(k, col(row, k));
      if (!isBlankVal(legacy)) rest[k] = legacy;
    }
    return rest;
  });
}

// Question as written to the sheet (flat -> packed)
function packGmatQuestionForSheet(q: any, id: string) {
  return {
    id,
    section: q.section,
    questionType: q.questionType,
    questionText: q.questionText,
    options: q.options || [],
    correctAnswer: q.correctAnswer ?? "",
    typeData: {
      statements: q.statements,
      blanks: q.blanks,
      twoPartOptions: q.twoPartOptions,
      correctPart1: q.correctPart1,
      correctPart2: q.correctPart2,
    },
    explanation: q.explanation,
    difficulty: q.difficulty,
    passageId: q.passageId ?? "",
    targetExam: q.targetExam || "GMAT",
  };
}

// Local-DB fallback must mirror what the unpacking step above produces
function flattenGmatQuestion(packed: any) {
  const { typeData, ...rest } = packed;
  return { ...rest, ...(typeData || {}) };
}

// Passage as written to the sheet (table/tabs -> "data")
function packGmatPassageForSheet(body: any, id: string) {
  const kind = String(body.kind || "").trim().toLowerCase();
  const sheetData = kind === "table" ? body.table : kind === "tabs" ? body.tabs : undefined;
  return {
    id,
    title: body.title,
    kind: body.kind,
    text: body.text ?? "",
    data: sheetData,
    chartImageUrl: body.chartImageUrl ?? "",
    targetExam: body.targetExam || "GMAT",
  };
}

function flattenGmatPassage(packed: any) {
  const { data, ...rest } = packed;
  const kind = String(packed.kind || "").trim().toLowerCase();
  return kind === "table" ? { ...rest, table: data } : kind === "tabs" ? { ...rest, tabs: data } : rest;
}

const GMAT_MOCK_JSON_FIELDS = ["statements", "blanks", "table", "tabs", "sectionResults", "sectionOrder"];

async function fetchSheetData(range: string, spreadsheetId: string | undefined = SPREADSHEET_ID) {
  if (!spreadsheetId || !GOOGLE_EMAIL || !GOOGLE_KEY) {
    console.log(`Skipping Sheet read for [${range}]: Google Sheets not configured.`);
    return null;
  }

  try {
    console.log(`Fetching data from sheet: ${range}...`);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${range}!A1:Z`, // Include header row to map columns
    });

    const allRows = response.data.values || [];
    if (allRows.length < 2) {
      console.log(`Sheet [${range}] is empty or only has headers.`);
      return [];
    }

   const headers = allRows[0].map((h: string) => normalizeKey(h));
    const dataRows = allRows.slice(1);
    const expectedKeys = SHEET_CONFIG[range];

    console.log(`✅ Mapping ${dataRows.length} rows from ${range} using normalized headers: [${headers.join(", ")}]`);

    // Sectional + mock questions / passages use the same packed layout as the CAT sheets
    if (PACKED_QUESTION_RANGES.includes(range) || PACKED_PASSAGE_RANGES.includes(range)) {
      return mapPackedSectionalRows(range, headers, dataRows, expectedKeys);
    }

    return dataRows.map(row => {
      const obj: any = {};
      expectedKeys.forEach(key => {
        // GMAT mock sheets: clean up the simple columns the client can't forgive.
        if (range.startsWith("GmatMock")) {
          const gi = headers.indexOf(normalizeKey(key));
          const cell = gi !== -1 ? String(row[gi] ?? "").trim() : "";
          if (key === "id" || key === "passageId") { obj[key] = cell; return; }
          // (GmatMockQuestions / GmatMockPassages are handled by mapPackedSectionalRows above)
        }
        // GMAT mock sheets: structured columns (statements, blanks, table, tabs,
        // sectionResults, …) are stored as JSON text and handed to the client as
        // real objects. An empty / invalid cell becomes undefined (key omitted).
        if (range.startsWith("GmatMock") && GMAT_MOCK_JSON_FIELDS.includes(key)) {
          const ci = headers.indexOf(normalizeKey(key));
          const rawCell = ci !== -1 ? String(row[ci] ?? "").trim() : "";
          let parsed: any = undefined;
          if (rawCell.startsWith("[") || rawCell.startsWith("{")) {
            try { parsed = JSON.parse(rawCell); } catch { parsed = undefined; }
          }
          obj[key] = parsed;
          return;
        }
     const index = headers.indexOf(normalizeKey(key));
        if (index !== -1) {
          let val = row[index] || "";
          // Auto-parse JSON strings for complex fields
          if (["options", "questionIds", "sectionScores", "studentAnswers"].includes(key)) {
            if (typeof val === "string" && (val.startsWith("[") || val.startsWith("{"))) {
              try { val = JSON.parse(val); } catch (e) { val = []; }
            } else if (val === "") {
              val = [];
            }
          }
          obj[key] = val;
        } else {
          // If column is missing in sheet, use a default value
          obj[key] = (["options", "questionIds", "sectionScores", "studentAnswers"].includes(key)) ? [] : "";
        }
      });
      return obj;
    });
  } catch (err: any) {
    console.error(`❌ Error fetching sheet ${range}:`, err.message);
    if (String(err.message).includes("Unable to parse range")) {
      // Almost always a wrong tab name or the wrong spreadsheet ID — show what exists
      try {
        const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "properties.title,sheets.properties.title" });
        const tabs = (meta.data.sheets || []).map((sh: any) => `"${sh.properties?.title}"`).join(", ");
        console.error(`   ↳ Spreadsheet "${meta.data.properties?.title}" (${spreadsheetId}) has tabs: ${tabs}`);
        console.error(`   ↳ Looking for tab: "${range}"`);
      } catch (e: any) {
        console.error(`   ↳ Could not open spreadsheet ${spreadsheetId}: ${e.message} (check the ID and that the service account has access)`);
      }
    }
    return null;
  }
}

/**
 * Utility to append data to a Google Sheet
 * Header-aware: writes to columns based on the header row names
 */
async function appendSheetData(range: string, data: any, spreadsheetId: string | undefined = SPREADSHEET_ID) {
  if (!spreadsheetId || !GOOGLE_EMAIL || !GOOGLE_KEY) {
    console.log(`Skipping Sheet append for [${range}]: Google Sheets not configured.`);
    return;
  }

  try {
    // 1. Get the current headers to know which column is which
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${range}!A1:Z1`,
    });

   const headersRaw = headerRes.data.values?.[0] || [];
    const headers = headersRaw.map((h: string) => normalizeKey(h));
    
    if (headers.length === 0) {
      console.warn(`⚠️ Sheet [${range}] appears to have no headers. Appending in default order.`);
      const keys = SHEET_CONFIG[range];
      const row = keys.map(key => {
        let val = data[key];
        if (typeof val === "object") val = JSON.stringify(val);
        return val || "";
      });
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${range}!A:A`,
        valueInputOption: "RAW",
        requestBody: { values: [row] },
      });
      return;
    }

    // 2. Map data to the correct column indices
    const expectedKeys = SHEET_CONFIG[range];
   const row = headersRaw.map((headerRaw: string) => {
      const headerNormalized = normalizeKey(headerRaw);
      // Find the key that matches this header
      const key = expectedKeys.find(k => normalizeKey(k) === headerNormalized);
      if (!key) return "";
      let val = data[key];
      if (typeof val === "object") val = JSON.stringify(val);
      return val || "";
    });

    console.log(`Attempting to append row to sheet: ${range} (mapped to ${row.length} columns)...`);
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${range}!A:A`,
      valueInputOption: "RAW",
      requestBody: { values: [row] },
    });
    console.log(`✅ Successfully appended to ${range}. Updated Cells: ${res.data.updates?.updatedCells}`);
  } catch (err: any) {
    console.error(`❌ FAILED to append to sheet [${range}]: ${err.message}`);
  }
}

// Simple JSON-based storage for local fallback
const DB_PATH = path.join(__dirname, "db.json");

interface DB {
  students: any[];
  courseMaterials: any[];
  videoLectures: any[];
  unverifiedQuestions: any[];
  approvedQuestions: any[];
  dailyTests: any[];
  dailyPassages: any[];
  testResults: any[];
  assignedTests: any[];
  announcements: any[];
    sectionalTests: any[];
sectionalQuestions: any[];
sectionalPassages: any[];
sectionalResults: any[];
  mockTests: any[];
mockQuestions: any[];
mockPassages: any[];
mockResults: any[];
  pyqPapers: any[];
  pyqQuestions: any[];
  pyqPassages: any[];
  pyqResults: any[];
  gmatSectionalTests: any[];
  gmatSectionalQuestions: any[];
  gmatSectionalPassages: any[];
  gmatSectionalResults: any[];
  gmatMockTests: any[];
  gmatMockQuestions: any[];
  gmatMockPassages: any[];
  gmatMockResults: any[];
}

const initialDB: DB = {
  students: [],
  courseMaterials: [
    {
      id: "CM001",
      topicName: "Number Systems",
      section: "Quantitative",
      googleSheetLink: "#",
      googleDriveLink: "#",
      description: "Basics of Number Systems for CAT.",
      dateAdded: new Date().toISOString(),
       targetExam: "CAT"
    }
  ],
  videoLectures: [
    {
      id: "VL001",
      topicName: "Arithmetic Basics",
      section: "Quantitative",
      googleSheetLink: "#",
      googleDriveLink: "#",
      duration: 45,
      instructorName: "Expert Tutor",
      dateUploaded: new Date().toISOString(),
       targetExam: "CAT"
    }
  ],
  unverifiedQuestions: [],
  approvedQuestions: [],
  dailyTests: [],
  testResults: [],
  assignedTests: [],
    sectionalTests: [],
sectionalQuestions: [],
sectionalPassages: [],
sectionalResults: [],
  mockTests: [],
mockQuestions: [],
mockPassages: [],
mockResults: [],
  pyqPapers: [],
  pyqQuestions: [],
  pyqPassages: [],
  pyqResults: [],
  gmatSectionalTests: [],
  gmatSectionalQuestions: [],
  gmatSectionalPassages: [],
  gmatSectionalResults: [],
  gmatMockTests: [],
  gmatMockQuestions: [],
  gmatMockPassages: [],
  gmatMockResults: [],
  announcements: [
    {
      id: "AN001",
      title: "Welcome to CAT Prep Pro",
      content: "Good luck with your preparation!",
      createdDate: new Date().toISOString(),
      createdBy: "Admin"
    }
  ]
};

function getLocalDB(): DB {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(initialDB, null, 2));
    return initialDB;
  }
  // Merge over defaults so an older db.json missing the newer collections still works
  return { ...initialDB, ...JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) };
}

function saveLocalDB(db: DB) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function parseDateRobustly(dateStr: any): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
  
  const str = String(dateStr).trim();
  if (!str) return null;

  // Try to parse standard numbers (timestamp)
  if (/^\d+$/.test(str)) {
    const num = parseInt(str, 10);
    const d = new Date(num);
    if (!isNaN(d.getTime())) return d;
  }

  // Check for DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  // E.g. "10/06/2026", "25-04-2026", "10.06.2026"
  const dmyMatch = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1; // 0-indexed in JS Date
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Check for YYYY/MM/DD or YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Fallback to standard JavaScript new Date() parsing
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  return null;
}
function parseTargetExams(targetExam: any): string[] {
  if (!targetExam) return [];
  if (Array.isArray(targetExam)) {
    return targetExam.map((e: string) => String(e).trim()).filter(Boolean);
  }
  return String(targetExam)
    .split(",")
    .map((e: string) => e.trim())
    .filter(Boolean);
}

function contentMatchesExam(contentTargetExam: any, studentExam: string): boolean {
  const exams = parseTargetExams(contentTargetExam);
  if (exams.length === 0) return false;
  return exams.includes("ALL") || exams.includes(studentExam);
}
function isAfterEnrollment(contentDateStr: string | undefined, enrollmentDateStr: string | undefined): boolean {
  if (!enrollmentDateStr) return true;
  if (!contentDateStr) return true;
  try {
     const contentDate = parseDateRobustly(contentDateStr);
    const enrollmentDate = parseDateRobustly(enrollmentDateStr);
    if (!contentDate || !enrollmentDate) {
      return true;
    }
      contentDate.setHours(0, 0, 0, 0);
    enrollmentDate.setHours(0, 0, 0, 0);
    return contentDate.getTime() >= enrollmentDate.getTime();
  } catch (err) {
    return true;
  }
}

async function getStudentRegistrationDate(reqUser: any): Promise<string | undefined> {
  if (reqUser.registrationDate) {
    return reqUser.registrationDate;
  }
  try {
    const students = await fetchSheetData("Students") || getLocalDB().students;
    const student = students.find((s: any) => s.id === reqUser.id);
    return student?.registrationDate;
  } catch (err) {
    return undefined;
  }
}
// PYQ papers are CAT-only: admins always pass, students must have targetExam = CAT
function canAccessPyq(user: any): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return String(user.targetExam || "").trim().toUpperCase() === "CAT";
}

// Accepts a real array, a JSON string ("[\"Q1\",\"Q2\"]") or a plain comma list ("Q1, Q2")
function toIdList(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v !== "string" || !v.trim()) return [];
  const t = v.trim();
  if (t.startsWith("[")) {
    try { return toIdList(JSON.parse(t)); } catch { /* fall through to comma split */ }
  }
  return t.split(",").map((x) => x.trim()).filter(Boolean);
}

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        reportOnly: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'self'"],
        },
      },
    })
  );

  app.use(
    "/api/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 30,
      skipSuccessfulRequests: true,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: "Too many attempts. Please try again later." },
    })
  );

  app.use(express.json());

  // Auth Middleware
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  };
// Gemini AI Proxy Route
  app.post("/api/chat", authenticateToken, async (req: any, res) => {
    try {
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      res.json({ reply: result.response.text() });
    } catch (err: any) {
      console.error("Gemini API error:", err.message);
      res.status(500).json({ error: "AI request failed" });
    }
  });
  app.post("/api/generate-questions/:examType", authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
   const { examType } = req.params;
try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  const prompt = `Generate exactly 20 multiple-choice exam questions on Linear Equations of ${examType} exam. 
    Return exactly 20 questions in JSON format.
    Each question must have:
    - section: "Quantitative" | "DILR" | "VARC"
    - questionText: string
    - options: string[] (exactly 4)
    - correctAnswer: string (one of the options)
    - explanation: string
    - difficulty: "Easy" | "Medium"
    - targetExam: "${examType}"`

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              section: { type: Type.STRING },
              questionText: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctAnswer: { type: Type.STRING },
              explanation: { type: Type.STRING },
              difficulty: { type: Type.STRING },
              targetExam: { type: Type.STRING }
            },
            required: ["section", "questionText", "options", "correctAnswer", "explanation", "difficulty", "targetExam"]
          }
        }
      }
    });

    const questions = JSON.parse(response.text);
    res.json(questions);
  } catch (err: any) {
    console.error("Gemini error:", err.message);
    res.status(500).json({ error: "Failed to generate questions" });
  }
});
  // API Routes
  app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;
    
    let students = await fetchSheetData("Students");
    
    // Fallback to local DB if sheet fetch failed OR is empty (common for new setups)
    if (!students || students.length === 0) {
      console.log("Using local Students database (Sheet was empty or fetch failed).");
      students = getLocalDB().students;
    }

    const user = students.find(s => s.email === email);

    if (!user) {
      console.warn(`Login attempt for non-existent user: ${email}`);
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Robust password matching: support both bcrypt hashes and plaintext (for easy sheet editing)
    let isMatch = false;
    try {
      if (user.password.startsWith("$2a$") || user.password.startsWith("$2b$")) {
        isMatch = bcrypt.compareSync(password, user.password);
      } else {
        isMatch = password === user.password;
      }
    } catch (e) {
      isMatch = password === user.password;
    }

    if (isMatch) {
      const token = jwt.sign(
  { id: user.id, email: user.email, role: user.role, name: user.name, targetExam: user.targetExam, registrationDate: user.registrationDate }, 
        JWT_SECRET, 
        { expiresIn: '24h' }
      );
      res.json({ 
        token, 
      user: { id: user.id, email: user.email, role: user.role, name: user.name, targetExam: user.targetExam, registrationDate: user.registrationDate } 
      });
    } else {
      console.warn(`Login failed: Incorrect password for ${email}`);
      res.status(401).json({ message: "Invalid email or password" });
    }
  });

  app.get("/api/profile", authenticateToken, async (req: any, res) => {
    const students = await fetchSheetData("Students") || getLocalDB().students;
    const user = students.find(s => s.id === req.user.id);
    if (user) {
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } else {
      res.status(404).json({ message: "User not found" });
    }
  });

  app.get("/api/course-materials", authenticateToken, async (req: any, res) => {
    const materials = await fetchSheetData("CourseMaterials") || getLocalDB().courseMaterials;
    if (req.user.role === 'student') {
      const regDate = await getStudentRegistrationDate(req.user);
      return res.json(materials.filter((m: any) => contentMatchesExam(m.targetExam, req.user.targetExam) && isAfterEnrollment(m.dateAdded, regDate)));
    }
    res.json(materials);
  });

 app.get("/api/video-lectures", authenticateToken, async (req: any, res) => {
    const videos = await fetchSheetData("VideoLectures") || getLocalDB().videoLectures;
    if (req.user.role === 'student') {
 const regDate = await getStudentRegistrationDate(req.user);
      return res.json(videos.filter((v: any) => contentMatchesExam(v.targetExam, req.user.targetExam) && isAfterEnrollment(v.dateUploaded, regDate)));
    }
    res.json(videos);
  });

  app.post("/api/course-materials", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    await appendSheetData("CourseMaterials", req.body);
    
    // Update local for immediate feedback
    const db = getLocalDB();
    db.courseMaterials.push(req.body);
    saveLocalDB(db);
    
    res.json({ success: true });
  });

  app.post("/api/video-lectures", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    await appendSheetData("VideoLectures", req.body);
    
    // Update local for immediate feedback
    const db = getLocalDB();
    db.videoLectures.push(req.body);
    saveLocalDB(db);
    
    res.json({ success: true });
  });

   app.get("/api/announcements", authenticateToken, async (req: any, res) => {
    const anns = await fetchSheetData("Announcements") || getLocalDB().announcements;
    if (req.user.role === 'student') {
    const regDate = await getStudentRegistrationDate(req.user);
      return res.json(anns.filter((a: any) => (a.targetExam === "ALL" || a.targetExam === req.user.targetExam) && isAfterEnrollment(a.createdDate, regDate)));
    }
    res.json(anns);
  });

  // Student Management
  app.get("/api/students", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const students = await fetchSheetData("Students") || getLocalDB().students;
    res.json(students.filter(s => s.role === 'student'));
  });

  app.patch("/api/students/:id", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { id } = req.params;
    const { targetExam, status } = req.body;

    const db = getLocalDB();
    const studentIdx = db.students.findIndex(s => s.id === id);
    if (studentIdx !== -1) {
      if (targetExam) db.students[studentIdx].targetExam = targetExam;
      if (status) db.students[studentIdx].status = status;
      saveLocalDB(db);
      // Note: Updating specific rows in Sheets is complex, so we rely on local/revisit later if needed
      res.json(db.students[studentIdx]);
    } else {
      res.status(404).json({ message: "Student not found" });
    }
  });

  app.post("/api/daily-test/publish", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
   const { testDate, questionIds, targetExam, name } = req.body; // testDate format: YYYY-MM-DD
    
    if (!testDate || !questionIds || !Array.isArray(questionIds) || questionIds.length === 0 || !targetExam) {
      return res.status(400).json({ message: "Invalid test data (exam category required)" });
    }

    // targetExam may now be an array (multi-batch) from the frontend, or a string
    const targetExamStr = Array.isArray(targetExam) ? targetExam.join(",") : targetExam;

    const testId = `DT${Date.now()}`;
 const newTest = { id: testId, testDate, questionIds, targetExam: targetExamStr, name: name || `Practice Test ${testDate}` };
    
    await appendSheetData("DailyTests", newTest);
    
    // Sync local 
    const db = getLocalDB();
    db.dailyTests.push(newTest);
    saveLocalDB(db);
    
    res.json({ success: true, testId });
  });
    // ─── Admin: POST /api/daily-passages ── add an RC passage for daily tests ──
  app.post("/api/daily-passages", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    try {
      const passage = {
        ...req.body,
        id: req.body.id || `DP${Date.now()}`,
        targetExam: req.body.targetExam || "CAT",
      };
      await appendSheetData("DailyPassages", passage);
      const db = getLocalDB();
      db.dailyPassages.push(passage);
      saveLocalDB(db);
      res.json({ success: true, passageId: passage.id });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to add passage" });
    }
  });

  // ─── GET /api/daily-passages ── list all daily-test passages ───────────────
  app.get("/api/daily-passages", authenticateToken, async (req, res) => {
    res.json(await fetchSheetData("DailyPassages") || getLocalDB().dailyPassages);
  });

  // Question Management
  app.get("/api/unverified-questions", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    res.json(await fetchSheetData("UnverifiedQuestions") || getLocalDB().unverifiedQuestions);
  });

  app.get("/api/approved-questions", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    res.json(await fetchSheetData("ApprovedQuestions") || getLocalDB().approvedQuestions);
  });

  app.post("/api/questions/verify", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { questionIds, action } = req.body;
    
    // For verification, we still use local DB for logic then sync if needed, 
    // but here is a simple implementation:
    const unverified = await fetchSheetData("UnverifiedQuestions") || getLocalDB().unverifiedQuestions;
    
    if (action === 'approve') {
      const approved = unverified.filter(q => questionIds.includes(q.id));
      for (const q of approved) {
        await appendSheetData("ApprovedQuestions", { ...q, approvedDate: new Date().toISOString() });
      }
    }
    
    // Note: Deleting from Sheets is complex (requires batchUpdate). 
    // For now, we update local fallback.
    const db = getLocalDB();
    db.unverifiedQuestions = db.unverifiedQuestions.filter(q => !questionIds.includes(q.id));
    saveLocalDB(db);
    
    res.json({ success: true });
  });

  app.post("/api/questions/save-unverified", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { questions } = req.body;
    
    for (const q of questions) {
      const newQ = { ...q, id: `UQ${Date.now()}${Math.random().toString(36).substr(2, 5)}` };
      await appendSheetData("UnverifiedQuestions", newQ);
      
      // Fallback update
      const db = getLocalDB();
      db.unverifiedQuestions.push(newQ);
      saveLocalDB(db);
    }
    
    res.json({ success: true });
  });

app.get("/api/daily-tests", authenticateToken, async (req: any, res) => {
   let dailyTests = await fetchSheetData("DailyTests") || getLocalDB().dailyTests;

if (req.user.role === 'student') {
  const regDate = await getStudentRegistrationDate(req.user);

  dailyTests = dailyTests.filter((t: any) =>
    contentMatchesExam(t.targetExam, req.user.targetExam) && isAfterEnrollment(t.testDate, regDate)
  );
}
    // Return all tests sorted by date (latest first)
    const sortedTests = [...dailyTests].sort((a, b) => b.testDate.localeCompare(a.testDate));
    res.json(sortedTests);
  });

 app.get("/api/daily-test/:id", authenticateToken, async (req: any, res) => {
    const { id } = req.params;
    const dailyTests = await fetchSheetData("DailyTests") || getLocalDB().dailyTests;
    const test = dailyTests.find(t => t.id === id);
    
    if (test) {
        if (req.user.role === 'student') {
        const regDate = await getStudentRegistrationDate(req.user);
         if (!isAfterEnrollment(test.testDate, regDate) || !contentMatchesExam(test.targetExam, req.user.targetExam)) {
          return res.status(403).json({ message: "You are not authorized to access this test." });
        }
      }
      const approved = await fetchSheetData("ApprovedQuestions") || getLocalDB().approvedQuestions;
      const questions = approved.filter(q => test.questionIds.includes(q.id));
      res.json({ ...test, questions });
    } else {
      res.status(404).json({ message: "Test not found." });
    }
  });

app.get("/api/daily-test", authenticateToken, async (req: any, res) => {
    const today = new Date().toISOString().split('T')[0];
    const dailyTests = await fetchSheetData("DailyTests") || getLocalDB().dailyTests;

    let test;
    if (req.user.role === 'student') {
      const regDate = await getStudentRegistrationDate(req.user);
      test = dailyTests.find(t =>
        t.testDate === today &&
        contentMatchesExam(t.targetExam, req.user.targetExam) &&
        isAfterEnrollment(t.testDate, regDate)
      );
    } else {
      test = dailyTests.find(t => t.testDate === today);
    }

    if (test) {
      const approved = await fetchSheetData("ApprovedQuestions") || getLocalDB().approvedQuestions;
      const questions = approved.filter(q => test.questionIds.includes(q.id));
      res.json({ ...test, questions });
    } else {
      res.status(404).json({ message: "No test available for today." });
    }
  });
  app.post("/api/test-results", authenticateToken, async (req: any, res) => {
    const { testId } = req.body;

    // Check for existing attempt
    const allResults = await fetchSheetData("TestResults") || getLocalDB().testResults;
    const existingResult = allResults.find(r => r.studentId === req.user.id && r.testId === testId);

    if (existingResult) {
      return res.status(400).json({ message: "You have already attempted this test." });
    }

    const result = {
      ...req.body,
      id: `TR${Date.now()}`,
      studentId: req.user.id,
      testDate: new Date().toISOString()
    };
    
    await appendSheetData("TestResults", result);
    
    const db = getLocalDB();
    db.testResults.push(result);
    saveLocalDB(db);
    
    res.json(result);
  });
app.get("/api/sectional-tests", authenticateToken, async (req: any, res) => {
  try {
    let tests = await fetchSheetData("SectionalTests") || getLocalDB().sectionalTests;
 
    // Students only see tests matching their exam (or "ALL")
 
    // Attach question count without sending full questions
    const questions =
      await fetchSheetData("SectionalQuestions") || getLocalDB().sectionalQuestions;
 
    const enriched = tests.map((t: any) => {
      const qIds: string[] = Array.isArray(t.questionIds) ? t.questionIds : [];
      return {
        ...t,
        questions: questions
          .filter((q: any) => qIds.includes(q.id))
          .map((q: any) => ({ id: q.id, section: q.section })), // minimal for list view
      };
    });
 
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load sectional tests" });
  }
});
 // ─── GET /api/mock-tests  ── list of mock tests for this student's exam ──────
app.get("/api/mock-tests", authenticateToken, async (req: any, res) => {
  try {
    let tests =
      (await fetchSheetData("MockTests", MOCK_SPREADSHEET_ID)) || getLocalDB().mockTests;
 
 
    const questions =
      (await fetchSheetData("MockQuestions", MOCK_SPREADSHEET_ID)) || getLocalDB().mockQuestions;
 
    const enriched = tests.map((t: any) => {
      const qIds: string[] = Array.isArray(t.questionIds) ? t.questionIds : [];
      return {
        ...t,
        studentsAttempted: Number(t.studentsAttempted),
        questions: questions
          .filter((q: any) => qIds.includes(q.id))
          .map((q: any) => ({ id: q.id, section: q.section })), // minimal for list view
      };
    });
 
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load mock tests" });
  }
});
 
// ─── GET /api/mock-test/:id  ── full test with all questions + passages ──────
app.get("/api/mock-test/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const tests =
      (await fetchSheetData("MockTests", MOCK_SPREADSHEET_ID)) || getLocalDB().mockTests;
    const test = tests.find((t: any) => t.id === id);
 
    if (!test) return res.status(404).json({ message: "Mock test not found" });
 
    const allQuestions =
      (await fetchSheetData("MockQuestions", MOCK_SPREADSHEET_ID)) || getLocalDB().mockQuestions;
    const allPassages =
      (await fetchSheetData("MockPassages", MOCK_SPREADSHEET_ID)) || getLocalDB().mockPassages;
 
    // passageIds is not auto-parsed by fetchSheetData, so accept array / JSON / comma list
    const qIds: string[] = toIdList(test.questionIds);
    const pIds: string[] = toIdList(test.passageIds);
 
    const questions = allQuestions.filter((q: any) => qIds.includes(q.id));
    // Include passages listed on the test AND any passage a selected question points to
    const neededPassageIds = new Set<string>([
      ...pIds,
      ...questions.map((q: any) => String(q.passageId || "").trim()).filter(Boolean),
    ]);
    const passages = allPassages.filter((p: any) => neededPassageIds.has(String(p.id).trim()));
 
    res.json({ ...test, questions, passages });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load mock test" });
  }
});
 
// ─── GET /api/mock-results  ── this student's past mock attempts ─────────────
app.get("/api/mock-results", authenticateToken, async (req: any, res) => {
  try {
    const results =
      (await fetchSheetData("MockResults", MOCK_SPREADSHEET_ID)) || getLocalDB().mockResults;
    res.json(results.filter((r: any) => r.studentId === req.user.id));
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load mock results" });
  }
});
 
// ─── POST /api/mock-results  ── save a completed mock attempt ────────────────
app.post("/api/mock-results", authenticateToken, async (req: any, res) => {
  try {
    const { testId } = req.body;
 
    const allResults =
      (await fetchSheetData("MockResults", MOCK_SPREADSHEET_ID)) || getLocalDB().mockResults;
    const existing = allResults.find(
      (r: any) => r.studentId === req.user.id && r.testId === testId
    );
    if (existing) {
      return res.status(400).json({ message: "Already attempted this mock test." });
    }
 
    const result = {
      ...req.body,
      id: `MR${Date.now()}`,
      studentId: req.user.id,
      submittedAt: new Date().toISOString(),
    };
 
    await appendSheetData("MockResults", result, MOCK_SPREADSHEET_ID);
 
    const db = getLocalDB();
    db.mockResults.push(result);
    saveLocalDB(db);
 
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to save mock result" });
  }
});
 
// ─── Admin: POST /api/mock-tests  ── publish a new full-length mock test ─────
app.post("/api/mock-tests", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  try {
    const {
      name,
      totalDurationMinutes,
      sectionDurationMinutes,
      questionIds,
      passageIds,
      targetExam,
    } = req.body;
 
    if (!name || !questionIds?.length) {
      return res.status(400).json({ message: "name and questionIds are required" });
    }
 
    const newTest = {
      id: `MT${Date.now()}`,
      name,
      totalDurationMinutes: totalDurationMinutes || 120,
      sectionDurationMinutes: sectionDurationMinutes || 40,
      questionIds,
      passageIds: passageIds || [],
      targetExam: targetExam || "CAT",
      publishedDate: new Date().toISOString(),
    };
 
    await appendSheetData("MockTests", newTest, MOCK_SPREADSHEET_ID);
 
    const db = getLocalDB();
    db.mockTests.push(newTest);
    saveLocalDB(db);
 
    res.json({ success: true, testId: newTest.id });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to publish mock test" });
  }
});
 
// ─── Admin: POST /api/mock-questions  ── add questions ────────────────────────
app.post("/api/mock-questions", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  try {
    const questions: any[] = req.body.questions;
    for (const q of questions) {
      const newQ = {
        ...q,
        id: q.id || `MQ${Date.now()}${Math.random().toString(36).substr(2, 4)}`,
        questionType: q.questionType === "TITA" ? "TITA" : "MCQ",
        options: q.questionType === "TITA" ? [] : (q.options || []),
      };
      await appendSheetData("MockQuestions", newQ, MOCK_SPREADSHEET_ID);
      const db = getLocalDB();
      db.mockQuestions.push(newQ);
      saveLocalDB(db);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to add mock questions" });
  }
});
 
// ─── Admin: POST /api/mock-passages  ── add RC passages ───────────────────────
app.post("/api/mock-passages", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  try {
    const passage = { ...req.body, id: req.body.id || `MP${Date.now()}` };
    await appendSheetData("MockPassages", passage, MOCK_SPREADSHEET_ID);
    const db = getLocalDB();
    db.mockPassages.push(passage);
    saveLocalDB(db);
    res.json({ success: true, passageId: passage.id });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to add mock passage" });
  }
});
 
// ─── Admin: GET /api/mock-questions  ── list all mock questions ───────────────
app.get("/api/mock-questions", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  const questions =
    (await fetchSheetData("MockQuestions", MOCK_SPREADSHEET_ID)) || getLocalDB().mockQuestions;
  res.json(questions);
});// ─── GET /api/pyq-papers  ── list of PYQ papers for this student ─────────────
app.get("/api/pyq-papers", authenticateToken, async (req: any, res) => {
  if (!canAccessPyq(req.user)) return res.status(403).json({ message: "PYQ papers are available to CAT students only." });
  try {
    let papers =
      (await fetchSheetData("PYQPapers", MOCK_SPREADSHEET_ID)) || getLocalDB().pyqPapers;

    const questions =
      (await fetchSheetData("PYQQuestions", MOCK_SPREADSHEET_ID)) || getLocalDB().pyqQuestions;

    const enriched = papers.map((p: any) => {
      const qIds: string[] = Array.isArray(p.questionIds) ? p.questionIds : [];
      return {
        ...p,
        studentsAttempted: Number(p.studentsAttempted),
        questions: questions
          .filter((q: any) => qIds.includes(q.id))
          .map((q: any) => ({ id: q.id, section: q.section })), // minimal for list view
      };
    });

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load PYQ papers" });
  }
});

// ─── GET /api/pyq-paper/:id  ── full paper with all questions + passages ─────
app.get("/api/pyq-paper/:id", authenticateToken, async (req: any, res) => {
  if (!canAccessPyq(req.user)) return res.status(403).json({ message: "PYQ papers are available to CAT students only." });
  const { id } = req.params;
  try {
    const papers =
      (await fetchSheetData("PYQPapers", MOCK_SPREADSHEET_ID)) || getLocalDB().pyqPapers;
    const paper = papers.find((p: any) => p.id === id);

    if (!paper) return res.status(404).json({ message: "PYQ paper not found" });

    const allQuestions =
      (await fetchSheetData("PYQQuestions", MOCK_SPREADSHEET_ID)) || getLocalDB().pyqQuestions;
    const allPassages =
      (await fetchSheetData("PYQPassages", MOCK_SPREADSHEET_ID)) || getLocalDB().pyqPassages;

    const qIds: string[] = Array.isArray(paper.questionIds) ? paper.questionIds : [];
    const pIds: string[] = Array.isArray(paper.passageIds) ? paper.passageIds : [];

    const questions = allQuestions.filter((q: any) => qIds.includes(q.id));
    const passages = allPassages.filter((p: any) => pIds.includes(p.id));

    res.json({ ...paper, questions, passages });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load PYQ paper" });
  }
});

// ─── GET /api/pyq-results  ── this student's past PYQ attempts ───────────────
app.get("/api/pyq-results", authenticateToken, async (req: any, res) => {
  if (!canAccessPyq(req.user)) return res.status(403).json({ message: "PYQ papers are available to CAT students only." });
  try {
    const results =
      (await fetchSheetData("PYQResults", MOCK_SPREADSHEET_ID)) || getLocalDB().pyqResults;
    res.json(results.filter((r: any) => r.studentId === req.user.id));
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load PYQ results" });
  }
});

// ─── POST /api/pyq-results  ── save a completed PYQ attempt ──────────────────
app.post("/api/pyq-results", authenticateToken, async (req: any, res) => {
  if (!canAccessPyq(req.user)) return res.status(403).json({ message: "PYQ papers are available to CAT students only." });
  try {
    const { paperId } = req.body;

    const allResults =
      (await fetchSheetData("PYQResults", MOCK_SPREADSHEET_ID)) || getLocalDB().pyqResults;
    const existing = allResults.find(
      (r: any) => r.studentId === req.user.id && r.paperId === paperId
    );
    if (existing) {
      return res.status(400).json({ message: "Already attempted this PYQ paper." });
    }

    const result = {
      ...req.body,
      id: `PR${Date.now()}`,
      studentId: req.user.id,
      submittedAt: new Date().toISOString(),
    };

    await appendSheetData("PYQResults", result, MOCK_SPREADSHEET_ID);

    const db = getLocalDB();
    db.pyqResults.push(result);
    saveLocalDB(db);

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to save PYQ result" });
  }
});

// ─── Admin: POST /api/pyq-papers  ── publish a new PYQ paper ─────────────────
app.post("/api/pyq-papers", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  try {
    const {
      name,
      year,
      slot,
      examDate,
      totalDurationMinutes,
      sectionDurationMinutes,
      questionIds,
      passageIds,
      targetExam,
    } = req.body;

    if (!name || !questionIds?.length) {
      return res.status(400).json({ message: "name and questionIds are required" });
    }

    const newPaper = {
      id: `PYQ${Date.now()}`,
      name,
      year: year || "",
      slot: slot || "",
      examDate: examDate || "",
      totalDurationMinutes: totalDurationMinutes || 120,
      sectionDurationMinutes: sectionDurationMinutes || 40,
      questionIds,
      passageIds: passageIds || [],
      targetExam: targetExam || "CAT",
      publishedDate: new Date().toISOString(),
    };

    await appendSheetData("PYQPapers", newPaper, MOCK_SPREADSHEET_ID);

    const db = getLocalDB();
    db.pyqPapers.push(newPaper);
    saveLocalDB(db);

    res.json({ success: true, paperId: newPaper.id });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to publish PYQ paper" });
  }
});

// ─── Admin: POST /api/pyq-questions  ── add questions ─────────────────────────
app.post("/api/pyq-questions", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  try {
    const questions: any[] = req.body.questions;
    for (const q of questions) {
      const newQ = {
        ...q,
        id: q.id || `PYQQ${Date.now()}${Math.random().toString(36).substr(2, 4)}`,
        questionType: q.questionType === "TITA" ? "TITA" : "MCQ",
        options: q.questionType === "TITA" ? [] : (q.options || []),
      };
      await appendSheetData("PYQQuestions", newQ, MOCK_SPREADSHEET_ID);
      const db = getLocalDB();
      db.pyqQuestions.push(newQ);
      saveLocalDB(db);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to add PYQ questions" });
  }
});

// ─── Admin: POST /api/pyq-passages  ── add RC passages ────────────────────────
app.post("/api/pyq-passages", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  try {
    const passage = { ...req.body, id: req.body.id || `PYQP${Date.now()}` };
    await appendSheetData("PYQPassages", passage, MOCK_SPREADSHEET_ID);
    const db = getLocalDB();
    db.pyqPassages.push(passage);
    saveLocalDB(db);
    res.json({ success: true, passageId: passage.id });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to add PYQ passage" });
  }
});

// ─── Admin: GET /api/pyq-questions  ── list all PYQ questions ────────────────
app.get("/api/pyq-questions", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  const questions =
    (await fetchSheetData("PYQQuestions", MOCK_SPREADSHEET_ID)) || getLocalDB().pyqQuestions;
  res.json(questions);
});
// ─── GET /api/sectional-test/:id  ── full test with questions + passages ─────
app.get("/api/sectional-test/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const tests =
      await fetchSheetData("SectionalTests") || getLocalDB().sectionalTests;
    const test = tests.find((t: any) => t.id === id);
 
    if (!test) return res.status(404).json({ message: "Test not found" });
 
    const allQuestions =
      await fetchSheetData("SectionalQuestions") || getLocalDB().sectionalQuestions;
    const allPassages =
      await fetchSheetData("SectionalPassages") || getLocalDB().sectionalPassages;
 
    // passageIds is not auto-parsed by fetchSheetData, so accept array / JSON / comma list
    const qIds: string[] = toIdList(test.questionIds);
    const pIds: string[] = toIdList(test.passageIds);
 
    const questions = allQuestions.filter((q: any) => qIds.includes(q.id));
    // Include passages listed on the test AND any passage a selected question points to
    const neededPassageIds = new Set<string>([
      ...pIds,
      ...questions.map((q: any) => String(q.passageId || "").trim()).filter(Boolean),
    ]);
    const passages = allPassages.filter((p: any) => neededPassageIds.has(String(p.id).trim()));
 
    res.json({ ...test, questions, passages });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load test" });
  }
});
 
// ─── GET /api/sectional-results  ── this student's past results ──────────────
app.get("/api/sectional-results", authenticateToken, async (req: any, res) => {
  try {
    const results =
      await fetchSheetData("SectionalResults") || getLocalDB().sectionalResults;
    res.json(results.filter((r: any) => r.studentId === req.user.id));
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load results" });
  }
});
 
// ─── POST /api/sectional-results  ── save a new result ───────────────────────
app.post("/api/sectional-results", authenticateToken, async (req: any, res) => {
  try {
    const { testId } = req.body;
 
    // Prevent double submission
    const allResults =
      await fetchSheetData("SectionalResults") || getLocalDB().sectionalResults;
    const existing = allResults.find(
      (r: any) => r.studentId === req.user.id && r.testId === testId
    );
    if (existing) {
      return res.status(400).json({ message: "Already attempted this test." });
    }
 
    const result = {
      ...req.body,
      id: `SR${Date.now()}`,
      studentId: req.user.id,
      submittedAt: new Date().toISOString(),
    };
 
    await appendSheetData("SectionalResults", result);
 
    const db = getLocalDB();
    db.sectionalResults.push(result);
    saveLocalDB(db);
 
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to save result" });
  }
});
 
// ─── Admin: POST /api/sectional-tests  ── publish a new sectional test ───────
app.post("/api/sectional-tests", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  try {
    const { name, section, durationMinutes, questionIds, passageIds, targetExam } = req.body;
 
    if (!name || !section || !questionIds?.length) {
      return res.status(400).json({ message: "name, section, and questionIds are required" });
    }
 
    const newTest = {
      id: `ST${Date.now()}`,
      name,
      section,
      durationMinutes: durationMinutes || 40,
      questionIds,
      passageIds: passageIds || [],
      targetExam: targetExam || "CAT",
      publishedDate: new Date().toISOString(),
    };
 
    await appendSheetData("SectionalTests", newTest);
 
    const db = getLocalDB();
    db.sectionalTests.push(newTest);
    saveLocalDB(db);
 
    res.json({ success: true, testId: newTest.id });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to publish test" });
  }
});
 
// ─── Admin: POST /api/sectional-questions  ── add questions ──────────────────
app.post("/api/sectional-questions", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  try {
    const questions: any[] = req.body.questions;
    for (const q of questions) {
      const newQ = {
        ...q,
        id: q.id || `SQ${Date.now()}${Math.random().toString(36).substr(2, 4)}`,
        questionType: q.questionType === "TITA" ? "TITA" : "MCQ",
        options: q.questionType === "TITA" ? [] : (q.options || []),
      };
      await appendSheetData("SectionalQuestions", newQ);
      const db = getLocalDB();
      db.sectionalQuestions.push(newQ);
      saveLocalDB(db);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to add questions" });
  }
});
 
// ─── Admin: POST /api/sectional-passages  ── add RC passages ─────────────────
app.post("/api/sectional-passages", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  try {
    const passage = {
      ...req.body,
      id: req.body.id || `SP${Date.now()}`,
    };
    await appendSheetData("SectionalPassages", passage);
    const db = getLocalDB();
    db.sectionalPassages.push(passage);
    saveLocalDB(db);
    res.json({ success: true, passageId: passage.id });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to add passage" });
  }
});
 
// ─── Admin: GET /api/sectional-questions  ── list all questions ───────────────
app.get("/api/sectional-questions", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  const questions =
    await fetchSheetData("SectionalQuestions") || getLocalDB().sectionalQuestions;
  res.json(questions);
});

// ═════════════════════════════════════════════════════════════════════════════
// GMAT SECTIONAL TESTS — stored in a separate spreadsheet (GMAT_SPREADSHEET_ID)
// Tabs: GmatSectionalTests, GmatSectionalQuestions, GmatSectionalPassages,
//       GmatSectionalResults
// ═════════════════════════════════════════════════════════════════════════════

// ─── GET /api/gmat-sectional-tests  ── list (questions trimmed to id/section) ─
app.get("/api/gmat-sectional-tests", authenticateToken, async (req: any, res) => {
  try {
    const tests =
      (await fetchSheetData("GmatSectionalTests", GMAT_SPREADSHEET_ID)) || getLocalDB().gmatSectionalTests;
    const questions =
      (await fetchSheetData("GmatSectionalQuestions", GMAT_SPREADSHEET_ID)) || getLocalDB().gmatSectionalQuestions;

    const enriched = tests.map((t: any) => {
      const qIds = toIdList(t.questionIds);
      return {
        ...t,
        questions: questions
          .filter((q: any) => qIds.includes(q.id))
          .map((q: any) => ({ id: q.id, section: q.section })),
      };
    });
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load GMAT sectional tests" });
  }
});

// ─── GET /api/gmat-sectional-test/:id  ── full test with questions + stimuli ─
app.get("/api/gmat-sectional-test/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const tests =
      (await fetchSheetData("GmatSectionalTests", GMAT_SPREADSHEET_ID)) || getLocalDB().gmatSectionalTests;
    const test = tests.find((t: any) => t.id === id);
    if (!test) return res.status(404).json({ message: "Test not found" });

    const allQuestions =
      (await fetchSheetData("GmatSectionalQuestions", GMAT_SPREADSHEET_ID)) || getLocalDB().gmatSectionalQuestions;
    const allPassages =
      (await fetchSheetData("GmatSectionalPassages", GMAT_SPREADSHEET_ID)) || getLocalDB().gmatSectionalPassages;

    const qIds = toIdList(test.questionIds);
    const pIds = toIdList(test.passageIds);

    // Keep the order the test lists its questions in
    const questions = qIds
      .map((qid) => allQuestions.find((q: any) => q.id === qid))
      .filter(Boolean);
    const passages = allPassages.filter((p: any) => pIds.includes(p.id));

    res.json({ ...test, questions, passages });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load GMAT test" });
  }
});

// ─── GET /api/gmat-sectional-results  ── this student's past GMAT results ────
app.get("/api/gmat-sectional-results", authenticateToken, async (req: any, res) => {
  try {
    const results =
      (await fetchSheetData("GmatSectionalResults", GMAT_SPREADSHEET_ID)) || getLocalDB().gmatSectionalResults;
    res.json(results.filter((r: any) => r.studentId === req.user.id));
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load results" });
  }
});

// ─── POST /api/gmat-sectional-results  ── save a GMAT attempt ────────────────
app.post("/api/gmat-sectional-results", authenticateToken, async (req: any, res) => {
  try {
    const { testId } = req.body;

    const allResults =
      (await fetchSheetData("GmatSectionalResults", GMAT_SPREADSHEET_ID)) || getLocalDB().gmatSectionalResults;
    const existing = allResults.find(
      (r: any) => r.studentId === req.user.id && r.testId === testId
    );
    if (existing) {
      return res.status(400).json({ message: "Already attempted this test." });
    }

    const result = {
      ...req.body,
      id: `GSR${Date.now()}`,
      studentId: req.user.id,
      submittedAt: new Date().toISOString(),
    };

    await appendSheetData("GmatSectionalResults", result, GMAT_SPREADSHEET_ID);

    const db = getLocalDB();
    db.gmatSectionalResults.push(result);
    saveLocalDB(db);

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to save result" });
  }
});

// ─── Admin: POST /api/gmat-sectional-tests  ── publish a GMAT sectional test ─
app.post("/api/gmat-sectional-tests", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  try {
    const { name, section, durationMinutes, questionIds, passageIds, targetExam } = req.body;
    if (!name || !section || !questionIds?.length) {
      return res.status(400).json({ message: "name, section, and questionIds are required" });
    }

    const newTest = {
      id: `GST${Date.now()}`,
      name,
      section,
      durationMinutes: durationMinutes || 45,
      questionIds,
      passageIds: passageIds || [],
      targetExam: targetExam || "GMAT",
      publishedDate: new Date().toISOString(),
    };

    await appendSheetData("GmatSectionalTests", newTest, GMAT_SPREADSHEET_ID);

    const db = getLocalDB();
    db.gmatSectionalTests.push(newTest);
    saveLocalDB(db);

    res.json({ success: true, testId: newTest.id });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to publish test" });
  }
});

// ─── Admin: POST /api/gmat-sectional-questions  ── add GMAT questions ────────
app.post("/api/gmat-sectional-questions", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  try {
    const questions: any[] = req.body.questions;
    for (const q of questions) {
      const newQ = packGmatQuestionForSheet(q, q.id || `GSQ${Date.now()}${Math.random().toString(36).substr(2, 4)}`);
      await appendSheetData("GmatSectionalQuestions", newQ, GMAT_SPREADSHEET_ID);
      const db = getLocalDB();
      db.gmatSectionalQuestions.push(flattenGmatQuestion(newQ)); // local fallback keeps the unpacked shape
      saveLocalDB(db);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to add questions" });
  }
});

// ─── Admin: POST /api/gmat-sectional-passages  ── add GMAT stimuli ───────────
app.post("/api/gmat-sectional-passages", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  try {
    // Packed exactly like /api/sectional-passages: table / tabs go into the "data" column
    const passage = packGmatPassageForSheet(req.body, req.body.id || `GSP${Date.now()}`);
    await appendSheetData("GmatSectionalPassages", passage, GMAT_SPREADSHEET_ID);
    const db = getLocalDB();
    db.gmatSectionalPassages.push(flattenGmatPassage(passage)); // local fallback keeps the unpacked shape
    saveLocalDB(db);
    res.json({ success: true, passageId: passage.id });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to add passage" });
  }
});

// ─── Admin: GET /api/gmat-sectional-questions  ── list all GMAT questions ────
app.get("/api/gmat-sectional-questions", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  const questions =
    (await fetchSheetData("GmatSectionalQuestions", GMAT_SPREADSHEET_ID)) || getLocalDB().gmatSectionalQuestions;
  res.json(questions);
});

// ═════════════════════════════════════════════════════════════════════════════
// GMAT FULL-LENGTH MOCK TESTS — separate spreadsheet (GMAT_SPREADSHEET_ID)
// Tabs: GmatMockTests, GmatMockQuestions, GmatMockPassages, GmatMockResults
// ═════════════════════════════════════════════════════════════════════════════

// ─── GET /api/gmat-mock-tests  ── list (questions trimmed to id/section) ─────
app.get("/api/gmat-mock-tests", authenticateToken, async (req: any, res) => {
  try {
    const tests =
      (await fetchSheetData("GmatMockTests", GMAT_SPREADSHEET_ID)) || getLocalDB().gmatMockTests;
    const questions =
      (await fetchSheetData("GmatMockQuestions", GMAT_SPREADSHEET_ID)) || getLocalDB().gmatMockQuestions;

    const enriched = tests.map((t: any) => {
      const qIds = toIdList(t.questionIds);
      return {
        ...t,
        totalDurationMinutes: Number(t.totalDurationMinutes) || 135,
        sectionDurationMinutes: Number(t.sectionDurationMinutes) || 45,
        studentsAttempted: Number(t.studentsAttempted) || 0,
        questions: questions
          .filter((q: any) => qIds.includes(q.id))
          .map((q: any) => ({ id: q.id, section: q.section })),
      };
    });
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load GMAT mock tests" });
  }
});

// ─── GET /api/gmat-mock-test/:id  ── full mock with questions + stimuli ─────
app.get("/api/gmat-mock-test/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const tests =
      (await fetchSheetData("GmatMockTests", GMAT_SPREADSHEET_ID)) || getLocalDB().gmatMockTests;
    const test = tests.find((t: any) => t.id === id);
    if (!test) return res.status(404).json({ message: "Mock test not found" });

    const allQuestions =
      (await fetchSheetData("GmatMockQuestions", GMAT_SPREADSHEET_ID)) || getLocalDB().gmatMockQuestions;
    const allPassages =
      (await fetchSheetData("GmatMockPassages", GMAT_SPREADSHEET_ID)) || getLocalDB().gmatMockPassages;

    const qIds = toIdList(test.questionIds);
    const pIds = toIdList(test.passageIds);

    // Keep the order the mock lists its questions in
    const questions = qIds
      .map((qid) => allQuestions.find((q: any) => q.id === qid))
      .filter(Boolean);
    const passages = allPassages.filter((p: any) => pIds.includes(p.id));

    res.json({
      ...test,
      totalDurationMinutes: Number(test.totalDurationMinutes) || 135,
      sectionDurationMinutes: Number(test.sectionDurationMinutes) || 45,
      questions,
      passages,
    });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load GMAT mock test" });
  }
});

// ─── GET /api/gmat-mock-results  ── this student's past GMAT mock attempts ───
app.get("/api/gmat-mock-results", authenticateToken, async (req: any, res) => {
  try {
    const results =
      (await fetchSheetData("GmatMockResults", GMAT_SPREADSHEET_ID)) || getLocalDB().gmatMockResults;
    res.json(results.filter((r: any) => r.studentId === req.user.id));
  } catch (err: any) {
    res.status(500).json({ message: "Failed to load GMAT mock results" });
  }
});

// ─── POST /api/gmat-mock-results  ── save a completed GMAT mock attempt ─────
app.post("/api/gmat-mock-results", authenticateToken, async (req: any, res) => {
  try {
    const { testId } = req.body;

    const allResults =
      (await fetchSheetData("GmatMockResults", GMAT_SPREADSHEET_ID)) || getLocalDB().gmatMockResults;
    const existing = allResults.find(
      (r: any) => r.studentId === req.user.id && r.testId === testId
    );
    if (existing) {
      return res.status(400).json({ message: "Already attempted this mock test." });
    }

    const result = {
      ...req.body,
      id: `GMR${Date.now()}`,
      studentId: req.user.id,
      submittedAt: new Date().toISOString(),
    };

    await appendSheetData("GmatMockResults", result, GMAT_SPREADSHEET_ID);

    const db = getLocalDB();
    db.gmatMockResults.push(result);
    saveLocalDB(db);

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to save GMAT mock result" });
  }
});

// ─── Admin: POST /api/gmat-mock-tests  ── publish a GMAT mock test ───────────
app.post("/api/gmat-mock-tests", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  try {
    const { name, description, totalDurationMinutes, sectionDurationMinutes, questionIds, passageIds, targetExam } = req.body;
    if (!name || !questionIds?.length) {
      return res.status(400).json({ message: "name and questionIds are required" });
    }

    const newTest = {
      id: `GMT${Date.now()}`,
      name,
      description: description || "",
      totalDurationMinutes: totalDurationMinutes || 135,
      sectionDurationMinutes: sectionDurationMinutes || 45,
      questionIds,
      passageIds: passageIds || [],
      targetExam: targetExam || "GMAT",
      publishedDate: new Date().toISOString(),
      studentsAttempted: 0,
    };

    await appendSheetData("GmatMockTests", newTest, GMAT_SPREADSHEET_ID);

    const db = getLocalDB();
    db.gmatMockTests.push(newTest);
    saveLocalDB(db);

    res.json({ success: true, testId: newTest.id });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to publish GMAT mock test" });
  }
});

// ─── Admin: POST /api/gmat-mock-questions  ── add GMAT mock questions ────────
app.post("/api/gmat-mock-questions", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  try {
    const questions: any[] = req.body.questions;
    for (const q of questions) {
      const newQ = packGmatQuestionForSheet(q, q.id || `GMQ${Date.now()}${Math.random().toString(36).substr(2, 4)}`);
      await appendSheetData("GmatMockQuestions", newQ, GMAT_SPREADSHEET_ID);
      const db = getLocalDB();
      db.gmatMockQuestions.push(flattenGmatQuestion(newQ)); // local fallback keeps the unpacked shape
      saveLocalDB(db);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to add GMAT mock questions" });
  }
});

// ─── Admin: POST /api/gmat-mock-passages  ── add GMAT mock stimuli ───────────
app.post("/api/gmat-mock-passages", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  try {
    // Packed exactly like /api/gmat-sectional-passages: table / tabs go into the "data" column
    const passage = packGmatPassageForSheet(req.body, req.body.id || `GMP${Date.now()}`);
    await appendSheetData("GmatMockPassages", passage, GMAT_SPREADSHEET_ID);
    const db = getLocalDB();
    db.gmatMockPassages.push(flattenGmatPassage(passage)); // local fallback keeps the unpacked shape
    saveLocalDB(db);
    res.json({ success: true, passageId: passage.id });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to add GMAT mock passage" });
  }
});

// ─── Admin: GET /api/gmat-mock-questions  ── list all GMAT mock questions ────
app.get("/api/gmat-mock-questions", authenticateToken, async (req: any, res) => {
  if (req.user.role !== "admin") return res.sendStatus(403);
  const questions =
    (await fetchSheetData("GmatMockQuestions", GMAT_SPREADSHEET_ID)) || getLocalDB().gmatMockQuestions;
  res.json(questions);
});
  app.get("/api/performance", authenticateToken, async (req: any, res) => {
    try {
      const results = await fetchSheetData("TestResults") || getLocalDB().testResults;
      const userResults = results.filter((r: any) => r.studentId === req.user.id);

      let dailyTests: any[] = [];
      try {
        dailyTests = await fetchSheetData("DailyTests") || getLocalDB().dailyTests;
      } catch (e) {
        dailyTests = [];
      }

      const enriched = userResults.map((r: any) => {
        const test = dailyTests.find((t: any) => t.id === r.testId);
        return {
          ...r,
          targetExam: test ? test.targetExam : null,
          testName: test ? `${test.targetExam} Daily Test` : "Practice Test",
          name: test ? `${test.targetExam} Daily Test` : "Practice Test"
        };
      });
      res.json(enriched);
    } catch (err: any) {
      console.error("Error in /api/performance:", err?.message || err);
      res.status(500).json({ message: "Failed to load performance" });
    }
  });

  // Vite middleware for development or fallback
  const isProd = process.env.NODE_ENV === "production";
  const distPath = path.join(process.cwd(), "dist");
  const hasDist = fs.existsSync(distPath);

  if (!isProd || !hasDist) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
