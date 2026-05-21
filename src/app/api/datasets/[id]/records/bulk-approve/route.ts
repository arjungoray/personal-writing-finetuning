import { z } from "zod";
import { NextResponse } from "next/server";
import { bulkApproveDatasetRecords } from "@/lib/datasets/store";

const RequestSchema = z.object({
  recordIds: z.array(z.string()).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const input = RequestSchema.parse(await request.json().catch(() => ({})));
  return NextResponse.json(await bulkApproveDatasetRecords(id, input.recordIds));
}
