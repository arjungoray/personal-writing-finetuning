import { NextResponse } from "next/server";
import { getAppEnvironment } from "@/lib/config/env";
import { getFirstRunChecklist } from "@/lib/setup/checklist";
import { initializeDataDirectory } from "@/lib/store/init";

export async function GET() {
  const initialized = await initializeDataDirectory();
  const env = getAppEnvironment();

  return NextResponse.json({
    initialized,
    checks: getFirstRunChecklist(env),
  });
}
