// Placeholder replaced in Phase D (Meko integration). Feature-gated: when Meko is
// not enabled, context operations are skipped and say so explicitly.
async function deleteAllForUser() {
  return { ok: true, skipped: true, reason: 'Meko integration not enabled.' };
}
module.exports = { deleteAllForUser };
