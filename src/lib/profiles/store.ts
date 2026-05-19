import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { generateStyleProfileWithMastra } from "@/ai/workflows/profile-dataset";
import { getDataSubdirectoryPath, getIndexPath } from "@/lib/store/paths";
import { readJsonFile, writeJsonFile } from "@/lib/store/json";
import { emptyIndex, initializeDataDirectory, type VoiceLabIndex } from "@/lib/store/init";
import { readSettings } from "@/lib/store/settings";
import { listWritingRecords } from "@/lib/writings/store";
import { StyleProfileSchema, UserDirectiveSchema, type StyleProfile } from "@/lib/profiles/types";

export const GenerateProfileRequestSchema = z.object({
  writingIds: z.array(z.string()).min(1),
  userDirectives: z.array(z.object({ text: z.string().min(1) })).default([]),
});

function profilePath(id: string) {
  return join(getDataSubdirectoryPath("profiles"), `${id}.json`);
}

export async function listProfiles(): Promise<StyleProfile[]> {
  await initializeDataDirectory();
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(getDataSubdirectoryPath("profiles"))).filter((file) => file.endsWith(".json"));
  const profiles = await Promise.all(files.map((file) => readJsonFile<StyleProfile | null>(join(getDataSubdirectoryPath("profiles"), file), null)));
  return profiles.filter((profile): profile is StyleProfile => profile !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function generateProfile(input: z.infer<typeof GenerateProfileRequestSchema>): Promise<StyleProfile> {
  await initializeDataDirectory();
  const settings = await readSettings();
  const writings = (await listWritingRecords()).filter((writing) => input.writingIds.includes(writing.id));
  if (writings.length !== input.writingIds.length) {
    throw new Error("One or more writing samples could not be found.");
  }

  const profile = StyleProfileSchema.parse(await generateStyleProfileWithMastra({
    settings,
    writings,
    userDirectives: input.userDirectives.map((directive) => UserDirectiveSchema.parse({ id: randomUUID(), text: directive.text })),
  }));

  await writeJsonFile(profilePath(profile.id), profile);
  const index = await readJsonFile<VoiceLabIndex>(getIndexPath(), emptyIndex);
  await writeJsonFile(getIndexPath(), {
    ...index,
    profiles: Array.from(new Set([...index.profiles, profile.id])),
    updatedAt: profile.updatedAt,
  });
  return profile;
}

export async function approveProfile(id: string): Promise<StyleProfile> {
  const current = StyleProfileSchema.parse(await readJsonFile(profilePath(id), null));
  const approved = StyleProfileSchema.parse({ ...current, status: "approved", updatedAt: new Date().toISOString() });
  await writeJsonFile(profilePath(id), approved);
  return approved;
}

export async function readProfile(id: string): Promise<StyleProfile> {
  return StyleProfileSchema.parse(await readJsonFile(profilePath(id), null));
}
