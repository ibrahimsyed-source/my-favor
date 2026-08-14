import { prisma } from '../db';

// Settlement reconciliation. A favor whose status is 'completed' but whose
// settledAt is still null means the money side never finished: the process
// crashed after the status flip but before settle() stamped the watermark, or a
// live-mode Stripe charge could not collect. Either way it needs a human to
// reconcile (issue/verify the charge + ledger rows). We only flag rows older
// than the grace window so an in-flight settlement (completed a moment ago, about
// to be stamped) isn't reported as a false positive.

const GRACE_MS = 5 * 60 * 1000; // 5 minutes

export interface ReconcileResult {
  count: number;
  ids: string[];
}

// Find completed-but-unsettled favors older than the grace window and log a
// RECONCILE_NEEDED warning with their ids. Best-effort: any DB error is swallowed
// (returns an empty result) so this diagnostic can never take the server down.
export async function reconcileUnsettledFavors(now: Date = new Date()): Promise<ReconcileResult> {
  try {
    const cutoff = new Date(now.getTime() - GRACE_MS);
    const stuck = await prisma.favor.findMany({
      where: { status: 'completed', settledAt: null, updatedAt: { lt: cutoff } },
      select: { id: true },
      take: 500,
    });
    const ids = stuck.map((f) => f.id);
    if (ids.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          level: 'warn',
          msg: 'RECONCILE_NEEDED',
          reason: 'completed favors with no settlement watermark (settledAt=null) older than 5m',
          count: ids.length,
          favorIds: ids,
        }),
      );
    }
    return { count: ids.length, ids };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('reconcileUnsettledFavors failed:', err);
    return { count: 0, ids: [] };
  }
}
