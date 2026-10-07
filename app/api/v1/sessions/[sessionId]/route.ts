import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseBody, rateLimitFor, readJsonBody, withApi } from "@/lib/http";
import {
  deleteSession,
  getSession,
  joinDealSession,
  updatePartyLegs,
  sealPartyBook,
  clearDealSession,
  updateEscrowState,
  settleDealSession,
} from "@/lib/deal-session";
import { priceAndNormalizeLegs } from "@/lib/positions";
import { backendKindSchema, walletSchema } from "@/lib/contracts";
import type { PositionLeg } from "@/lib/margin";

const BODY_LIMIT = 256 * 1024;

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("join"),
    walletB: walletSchema,
    labelB: z.string().trim().max(40).default("Desk B (Counterparty)"),
    legsB: z.array(z.record(z.unknown())).max(32).optional(),
  }),
  z.object({
    action: z.literal("update_legs"),
    partyId: z.enum(["A", "B"]),
    legs: z.array(z.record(z.unknown())).max(32),
  }),
  z.object({
    action: z.literal("seal"),
    partyId: z.enum(["A", "B"]),
    signature: z.string().min(8).max(512).optional(),
  }),
  z.object({ action: z.literal("clear") }),
  z.object({
    action: z.literal("deposit_escrow"),
    partyId: z.enum(["A", "B"]),
    amount: z.number().positive().max(100_000_000),
    txHash: z.string().min(8).max(128).optional(),
  }),
  z.object({ action: z.literal("settle") }),
]);

function notModified(session: unknown) {
  return NextResponse.json({ ok: true, session }, { status: 200 });
}

export const GET = withApi<{ sessionId: string }>(async ({ params }) => {
  const { sessionId } = params;
  const session = getSession(sessionId);
  if (!session) {
    throw ApiError.notFound("This deal room does not exist or has expired");
  }
  return NextResponse.json({ ok: true, session });
});

export const POST = withApi<{ sessionId: string }>(async ({ req, params }) => {
  rateLimitFor("default", req);
  const { sessionId } = params;

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > BODY_LIMIT) {
    throw ApiError.payloadTooLarge(0.25);
  }

  const session = getSession(sessionId);
  if (!session) {
    throw ApiError.notFound("This deal room does not exist or has expired");
  }

  const body = parseBody(postSchema, await readJsonBody(req));

  switch (body.action) {
    case "join": {
      if (session.partyB) {
        throw ApiError.badRequest("Desk B already joined this room");
      }
      let legs: PositionLeg[] = [];
      if (body.legsB && body.legsB.length > 0) {
        const priced = await priceAndNormalizeLegs("B", body.legsB, { source: "manual" });
        legs = priced.legs;
      }
      const updated = joinDealSession(sessionId, body.walletB, body.labelB, legs);
      return notModified(updated);
    }

    case "update_legs": {
      const priced = await priceAndNormalizeLegs(body.partyId, body.legs, { source: "manual" });
      const updated = updatePartyLegs(sessionId, body.partyId, priced.legs);
      if (!updated) throw ApiError.badRequest("Cannot update legs for a party that has not joined yet");
      return NextResponse.json({ ok: true, session: updated, warnings: priced.warnings });
    }

    case "seal": {
      const updated = sealPartyBook(sessionId, body.partyId, body.signature);
      if (!updated) throw ApiError.badRequest("Cannot seal: party has not joined");
      return notModified(updated);
    }

    case "clear": {
      try {
        const updated = await clearDealSession(sessionId);
        if (!updated) {
          throw ApiError.badRequest(
            "Clearing requires both desks joined and both books sealed first",
          );
        }
        return notModified(updated);
      } catch (err) {
        if (err instanceof ApiError) throw err;
        throw ApiError.unavailable(
          `Confidential engine failed — session kept sealed for retry: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }

    case "deposit_escrow": {
      const updated = updateEscrowState(sessionId, body.partyId, body.amount, body.txHash);
      if (!updated) throw ApiError.badRequest("Escrow requires both desks joined");
      return notModified(updated);
    }

    case "settle": {
      const updated = settleDealSession(sessionId);
      if (!updated) {
        throw ApiError.badRequest("Settlement requires escrow to be locked first");
      }
      return notModified(updated);
    }
  }
});

export const DELETE = withApi<{ sessionId: string }>(async ({ params }) => {
  const { sessionId } = params;
  const session = getSession(sessionId);
  if (!session) {
    throw ApiError.notFound("This deal room does not exist or has expired");
  }
  deleteSession(sessionId);
  return NextResponse.json({ ok: true, deleted: sessionId });
});
