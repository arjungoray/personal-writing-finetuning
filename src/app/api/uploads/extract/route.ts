import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { getDataSubdirectoryPath } from "@/lib/store/paths";
import { initializeDataDirectory } from "@/lib/store/init";

const execFileAsync = promisify(execFile);
const supportedExtensions = new Set([".txt", ".md", ".pdf", ".docx"]);

function sourceTypeForExtension(extension: string) {
  if (extension === ".txt") return "txt";
  if (extension === ".md") return "md";
  if (extension === ".pdf") return "pdf";
  if (extension === ".docx") return "docx";
  return "pasted_text";
}

export async function POST(request: Request) {
  await initializeDataDirectory();
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing upload file." }, { status: 400 });
  }

  const extension = extname(file.name).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    return NextResponse.json({ error: `Unsupported file type: ${extension || "unknown"}` }, { status: 400 });
  }

  const uploadId = randomUUID();
  const uploadDir = getDataSubdirectoryPath("uploads");
  await mkdir(uploadDir, { recursive: true });
  const uploadPath = join(uploadDir, `${uploadId}${extension}`);
  await writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));

  if (extension === ".txt" || extension === ".md") {
    const text = Buffer.from(await file.arrayBuffer()).toString("utf8");
    return NextResponse.json({
      uploadId,
      fileName: file.name,
      sourceType: sourceTypeForExtension(extension),
      text,
      warnings: [],
    });
  }

  try {
    const pythonPath = "worker/.venv/bin/python";
    const { stdout } = await execFileAsync(pythonPath, ["worker/extract_text.py", uploadPath], {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
    });
    const extracted = JSON.parse(stdout) as { text: string; warnings: string[] };
    return NextResponse.json({
      uploadId,
      fileName: file.name,
      sourceType: sourceTypeForExtension(extension),
      text: extracted.text,
      warnings: extracted.warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraction failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
