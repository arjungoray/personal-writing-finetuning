import { NextResponse } from "next/server";
import { SettingsSchema, readSettings, updateSettings } from "@/lib/store/settings";

export async function GET() {
  return NextResponse.json(await readSettings());
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const patch = SettingsSchema.partial().parse(body);
  return NextResponse.json(await updateSettings(patch));
}
