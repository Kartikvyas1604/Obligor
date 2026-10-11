import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseBody, rateLimitFor, readJsonBody, withApi } from "@/lib/http";
import { priceAndNormalizeLegs, rawLegsSchema } from "@/lib/positions";
import { siloedIm } from "@/lib/margin";
import { hashLegs } from "@/lib/commitment";
import { getComputation } from "@/lib/computation-registry";
import { makeLogger } from "@/lib/logger";

const log = makeLogger("net-margin-verify");

const bodySchema = z.object({
  computationId: z.string().trim().min(8).max(64),
  commitmentHash: z.string().trim().min(8).max(80),
  party: z.enum(["A", "B", "C"]),
  legs: z.array(rawLegsSchema.element).min(1).max(32),
});

/**
 * POST /api/v1/net-margin/verify
 * Verifiable output for the judge flow: the caller re-submits only THEIR OWN
 * legs plus the computationId/commitmentHash they were shown. The server
 * re-derives that party's leg hash from canonical serialization and checks it
 * against the one-way hashes committed at compute time.
 *
 * Privacy invariant: the registry stores only hashes, so verify can prove a
 * computation was committed with exactly these inputs without ever reading —
 * or returning — the counterparty's book.
 *
 * Honest framing: `siloedContributionUsd` is recomputed from the caller's own
 * inputs; `combinedNettedUsd` is the registered aggregate scalar both parties
 * were already shown at commit time (the scalar is public to both, so echoing
 * it back reveals nothing new).
 */
export const POST = withApi(async ({ req }) => {
  rateLimitFor("compute", req);
  const bodyRaw = await readJsonBody(req);
  const body = parseBody(bodySchema, bodyRaw);

  const record = getComputation(body.computationId);
  if (!record) {
    log.warn("verify for unknown computation", { computationId: body.computationId });
    throw ApiError.notFound(
      "No computation is registered under that computationId. The server restarted or the compute was never registered.",
    );
  }

  // Strip `party` from raw legs — identity comes from the envelope, not the leg.
  const raw = body.legs.map((l) => {
    const copy = { ...l };
    delete (copy as { party?: unknown }).party;
    return copy;
  });
  const priced = await priceAndNormalizeLegs(body.party, raw, { source: "manual" });

  const storedPartyHash = record.partyLegHashes[body.party];
  const recomputedHash = hashLegs(priced.legs);
  const hashMatch = Boolean(storedPartyHash) && recomputedHash === storedPartyHash;
  const commitmentValid =
    record.computationId === body.computationId && record.commitmentHash === body.commitmentHash;

  const verified = hashMatch && commitmentValid;

  log.info("verify result", {
    computationId: body.computationId,
    party: body.party,
    verified,
    hashMatch,
    commitmentValid,
  });

  return NextResponse.json({
    ok: true,
    verified,
    hashMatch,
    commitmentValid,
    computationId: record.computationId,
    party: body.party,
    recomputedHash: recomputedHash.slice(0, 12),
    storedHashPrefix: storedPartyHash ? storedPartyHash.slice(0, 12) : null,
    siloedContributionUsd: siloedIm(priced.legs),
    combinedNettedUsd: record.combinedNettedUsd,
    registeredAt: record.createdAt,
    backendKind: record.backendKind,
    note: verified
      ? "Verified — your re-submitted legs hash to the commitment registered at compute time."
      : "Hash mismatch. The legs you re-submitted do not match what was committed.",
  });
});