import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseBody, rateLimitFor, readJsonBody, withApi } from "@/lib/http";
import {
  authorizedParties,
  deleteSession,
  getSession,
  hashPartyToken,
  issuePartyToken,
  joinDealSession,
  publicSession,
  saveSession,
  updatePartyLegs,
  sealPartyBook,
  clearDealSession,
  updateEscrowState,
  settleDealSession,
  verifyPartyToken,
} from "@/lib/deal-session";
import { priceAndNormalizeLegs } from "@/lib/positions";
import { walletSchema } from "@/lib/contracts";
import type { PositionLeg, PartyId } from "@/lib/margin";

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

const TOKEN_HEADER = "x-party-token";

function notModified(session: unknown) {
  return NextResponse.json({ ok: true, session }, { status: 200 });
}

function requireParty(
  session: Parameters<typeof verifyPartyToken>[0],
  party: PartyId,
  header: string | null,
) {
  // authorizedParties understands comma-joined token headers (both desks
  // consent for clear/settle) — take the acting party from that parse.
  if (!authorizedParties(session, header)[party]) {
    throw ApiError.unauthorized();
  }
}

export const GET = withApi<{ sessionId: string }>(async ({ req, params }) => {
  const { sessionId } = params;
  const session = getSession(sessionId);
  if (!session) {
    throw ApiError.notFound("This deal room does not exist or has expired");
  }
  // Without a party token the caller sees the room + status but neither
  // desk's plaintext book ("neither side can read the other's book").
  const auth = authorizedParties(session, req.headers.get(TOKEN_HEADER));
  return NextResponse.json({ ok: true, session: publicSession(session, auth) });
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

  const tokenHeader = req.headers.get(TOKEN_HEADER);
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
      if (!updated) throw ApiError.badRequest("Join failed — the room is no longer joinable");

      // Desk B capability token: returned exactly once, only its hash stored.
      const partyTokenB = issuePartyToken();
      updated.partyTokenHashes = { ...(updated.partyTokenHashes ?? {}), B: hashPartyToken(partyTokenB) };
      saveSession(updated);

      return NextResponse.json(
        {
          ok: true,
          session: publicSession(updated, { A: false, B: true }),
          partyTokenB,
        },
        { status: 200 },
      );
    }

    case "update_legs": {
      requireParty(session, body.partyId, tokenHeader);
      const priced = await priceAndNormalizeLegs(body.partyId, body.legs, { source: "manual" });
      const updated = updatePartyLegs(sessionId, body.partyId, priced.legs);
      if (!updated) throw ApiError.badRequest("Cannot update legs for a party that has not joined yet");
      return NextResponse.json({
        ok: true,
        session: publicSession(updated, authorizedParties(updated, tokenHeader)),
        warnings: priced.warnings,
      });
    }

    case "seal": {
      requireParty(session, body.partyId, tokenHeader);
      const updated = sealPartyBook(sessionId, body.partyId, body.signature);
      if (!updated) throw ApiError.badRequest("Cannot seal: party has not joined");
      return notModified(publicSession(updated, authorizedParties(updated, tokenHeader)));
    }

    case "clear": {
      // Clearing operates on BOTH sealed books — both desks must consent.
      requireParty(session, "A", tokenHeader);
      requireParty(session, "B", tokenHeader);
      if (session.partyA.legs.length === 0 && (session.partyB?.legs.length ?? 0) === 0) {
        throw ApiError.badRequest(
          "Both books are empty — add positions on at least one desk before netting",
        );
      }
      try {
        const updated = await clearDealSession(sessionId);
        if (!updated) {
          throw ApiError.badRequest(
            "Clearing requires both desks joined and both books sealed first",
          );
        }
        return notModified(publicSession(updated, authorizedParties(updated, tokenHeader)));
      } catch (err) {
        if (err instanceof ApiError) throw err;
        throw ApiError.unavailable(
          `Confidential engine failed — session kept sealed for retry: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }

    case "deposit_escrow": {
      requireParty(session, body.partyId, tokenHeader);
      const updated = updateEscrowState(sessionId, body.partyId, body.amount, body.txHash);
      if (!updated) throw ApiError.badRequest("Escrow requires both desks joined");
      return notModified(publicSession(updated, authorizedParties(updated, tokenHeader)));
    }

    case "settle": {
      requireParty(session, "A", tokenHeader);
      requireParty(session, "B", tokenHeader);
      const updated = settleDealSession(sessionId);
      if (!updated) {
        throw ApiError.badRequest("Settlement requires escrow to be locked first");
      }
      return notModified(publicSession(updated, authorizedParties(updated, tokenHeader)));
    }
  }
});

export const DELETE = withApi<{ sessionId: string }>(async ({ req, params }) => {
  const { sessionId } = params;
  const session = getSession(sessionId);
  if (!session) {
    throw ApiError.notFound("This deal room does not exist or has expired");
  }
  // Only the desk that created the room may delete it.
  requireParty(session, "A", req.headers.get(TOKEN_HEADER));
  deleteSession(sessionId);
  return NextResponse.json({ ok: true, deleted: sessionId });
});