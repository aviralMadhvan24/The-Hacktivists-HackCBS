// Families, membership, roles and invitations.
//
// Roles (highest first):
//   owner  – everything, including roles of admins and deleting the family
//   admin  – manage members (not owner/admins), edit shared records, family settings
//   member – add own records, edit records they co-own, propose and vote
//   viewer – read shared records, comment; cannot create or vote
//
// Non-members get 404 (not 403) so family ids can't be probed.
const { randomUUID } = require('crypto');
const db = require('../db/pool');
const { audit } = require('../lib/audit');
const { randomToken, sha256 } = require('../lib/security');
const { forbidden, notFound, badRequest, conflict } = require('../lib/http');

const ROLE_RANK = { viewer: 1, member: 2, admin: 3, owner: 4 };
const INVITE_TTL_DAYS = 7;

async function getMembership(familyId, userId, client = db) {
  const { rows } = await client.query(
    `SELECT fm.role, f.id, f.name, f.approval_threshold
     FROM family_members fm JOIN families f ON f.id = fm.family_id
     WHERE fm.family_id = $1 AND fm.user_id = $2 AND fm.status = 'active'`,
    [familyId, userId]
  );
  return rows[0] || null;
}

/** Throws 404 for non-members and 403 for insufficient role. Returns membership. */
async function requireRole(familyId, userId, minRole = 'viewer', client = db) {
  if (!/^[0-9a-f-]{36}$/i.test(String(familyId))) throw notFound('Family not found.');
  const m = await getMembership(familyId, userId, client);
  if (!m) throw notFound('Family not found.');
  if (ROLE_RANK[m.role] < ROLE_RANK[minRole]) throw forbidden(`This needs the ${minRole} role or higher; you are a ${m.role}.`);
  return m;
}

async function activeMemberIds(familyId, client = db) {
  const { rows } = await client.query(
    "SELECT user_id FROM family_members WHERE family_id = $1 AND status = 'active'", [familyId]);
  return rows.map((r) => r.user_id);
}

async function createFamily(userId, name, ip) {
  const clean = String(name || '').trim();
  if (!clean || clean.length > 100) throw badRequest('Family name must be 1–100 characters.');
  const id = randomUUID();
  await db.withTransaction(async (c) => {
    await c.query('INSERT INTO families (id, name, created_by) VALUES ($1,$2,$3)', [id, clean, userId]);
    await c.query("INSERT INTO family_members (family_id, user_id, role) VALUES ($1,$2,'owner')", [id, userId]);
    await audit({ familyId: id, actorId: userId, action: 'family.create', entityType: 'family', entityId: id, ip }, c);
  });
  return getFamily(id, userId);
}

async function listFamilies(userId) {
  const { rows } = await db.query(
    `SELECT f.id, f.name, fm.role, f.created_at,
            (SELECT count(*)::int FROM family_members m WHERE m.family_id = f.id AND m.status = 'active') AS member_count
     FROM families f JOIN family_members fm ON fm.family_id = f.id
     WHERE fm.user_id = $1 AND fm.status = 'active' ORDER BY f.created_at`,
    [userId]
  );
  return rows.map((r) => ({ id: r.id, name: r.name, role: r.role, memberCount: r.member_count, createdAt: r.created_at }));
}

async function getFamily(familyId, userId) {
  const m = await requireRole(familyId, userId, 'viewer');
  const { rows } = await db.query(
    `SELECT u.id, u.name, u.email, fm.role, fm.joined_at FROM family_members fm JOIN users u ON u.id = fm.user_id
     WHERE fm.family_id = $1 AND fm.status = 'active' AND u.deleted_at IS NULL ORDER BY fm.joined_at`,
    [familyId]
  );
  return {
    id: m.id, name: m.name, approvalThreshold: m.approval_threshold, myRole: m.role,
    members: rows.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, joinedAt: r.joined_at })),
  };
}

async function updateFamily(familyId, actorId, { name, approvalThreshold }, ip) {
  await requireRole(familyId, actorId, 'admin');
  if (name !== undefined && (!String(name).trim() || String(name).length > 100)) throw badRequest('Family name must be 1–100 characters.');
  if (approvalThreshold !== undefined && !(Number.isInteger(approvalThreshold) && approvalThreshold >= 1 && approvalThreshold <= 20)) {
    throw badRequest('approvalThreshold must be a whole number from 1 to 20.');
  }
  await db.query(
    `UPDATE families SET name = COALESCE($2, name), approval_threshold = COALESCE($3, approval_threshold), updated_at = now() WHERE id = $1`,
    [familyId, name !== undefined ? String(name).trim() : null, approvalThreshold ?? null]
  );
  await audit({ familyId, actorId, action: 'family.update', entityType: 'family', entityId: familyId, details: { name, approvalThreshold }, ip });
  return getFamily(familyId, actorId);
}

async function inviteMember(familyId, actorId, { email, role }, ip) {
  const m = await requireRole(familyId, actorId, 'admin');
  if (!['admin', 'member', 'viewer'].includes(role)) throw badRequest('Role must be admin, member or viewer.');
  if (role === 'admin' && m.role !== 'owner') throw forbidden('Only the owner can invite admins.');
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw badRequest('Please enter a valid email address.');
  const existing = await db.query(
    `SELECT 1 FROM family_members fm JOIN users u ON u.id = fm.user_id
     WHERE fm.family_id = $1 AND u.email = $2 AND fm.status = 'active'`, [familyId, cleanEmail]);
  if (existing.rowCount) throw conflict('That person is already a member of this family.');
  const token = randomToken(24);
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000);
  await db.query(
    `INSERT INTO family_invitations (id, family_id, email, role, token_hash, invited_by, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, familyId, cleanEmail, role, sha256(token), actorId, expiresAt]
  );
  await audit({ familyId, actorId, action: 'family.invite', entityType: 'invitation', entityId: id, details: { email: cleanEmail, role }, ip });
  // No email service is configured: the token is returned once so the inviter can share the link.
  return { id, email: cleanEmail, role, expiresAt, token };
}

async function listInvitations(familyId, actorId) {
  await requireRole(familyId, actorId, 'admin');
  const { rows } = await db.query(
    `SELECT id, email, role, created_at, expires_at, accepted_at, revoked_at FROM family_invitations
     WHERE family_id = $1 ORDER BY created_at DESC LIMIT 100`, [familyId]);
  return rows.map((r) => ({
    id: r.id, email: r.email, role: r.role, createdAt: r.created_at, expiresAt: r.expires_at,
    status: r.accepted_at ? 'accepted' : r.revoked_at ? 'revoked' : new Date(r.expires_at) < new Date() ? 'expired' : 'pending',
  }));
}

async function revokeInvitation(familyId, actorId, invitationId, ip) {
  await requireRole(familyId, actorId, 'admin');
  const r = await db.query(
    'UPDATE family_invitations SET revoked_at = now() WHERE id = $1 AND family_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL',
    [invitationId, familyId]);
  if (!r.rowCount) throw notFound('Pending invitation not found.');
  await audit({ familyId, actorId, action: 'family.invite_revoked', entityType: 'invitation', entityId: invitationId, ip });
}

/** Pending invitations addressed to the signed-in user's email. */
async function myInvitations(user) {
  const { rows } = await db.query(
    `SELECT i.id, i.role, i.expires_at, f.name AS family_name, u.name AS invited_by
     FROM family_invitations i JOIN families f ON f.id = i.family_id JOIN users u ON u.id = i.invited_by
     WHERE i.email = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()`, [user.email]);
  return rows.map((r) => ({ id: r.id, familyName: r.family_name, role: r.role, invitedBy: r.invited_by, expiresAt: r.expires_at }));
}

/** Accepts by token (shared link) or by invitation id (in-app, email must match). */
async function acceptInvitation(user, { token, invitationId }, ip) {
  let rows;
  if (token) ({ rows } = await db.query('SELECT * FROM family_invitations WHERE token_hash = $1', [sha256(String(token))]));
  else ({ rows } = await db.query('SELECT * FROM family_invitations WHERE id = $1', [invitationId]));
  const inv = rows[0];
  if (!inv || inv.email !== user.email) throw notFound('Invitation not found for this account.');
  if (inv.accepted_at) throw conflict('This invitation has already been used.');
  if (inv.revoked_at || new Date(inv.expires_at) < new Date()) throw badRequest('This invitation has expired or was revoked.');
  await db.withTransaction(async (c) => {
    await c.query(
      `INSERT INTO family_members (family_id, user_id, role, status) VALUES ($1,$2,$3,'active')
       ON CONFLICT (family_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active', joined_at = now()`,
      [inv.family_id, user.id, inv.role]);
    await c.query('UPDATE family_invitations SET accepted_at = now() WHERE id = $1', [inv.id]);
    await audit({ familyId: inv.family_id, actorId: user.id, action: 'family.join', entityType: 'invitation', entityId: inv.id, details: { role: inv.role }, ip }, c);
  });
  return getFamily(inv.family_id, user.id);
}

async function changeRole(familyId, actorId, targetId, role, ip) {
  const actor = await requireRole(familyId, actorId, 'admin');
  if (!['admin', 'member', 'viewer'].includes(role)) throw badRequest('Role must be admin, member or viewer.');
  const target = await getMembership(familyId, targetId);
  if (!target) throw notFound('Member not found.');
  if (target.role === 'owner') throw forbidden("The owner's role can't be changed.");
  if (actor.role !== 'owner' && (target.role === 'admin' || role === 'admin')) throw forbidden('Only the owner can grant or change admin roles.');
  await db.query('UPDATE family_members SET role = $3 WHERE family_id = $1 AND user_id = $2', [familyId, targetId, role]);
  await audit({ familyId, actorId, action: 'family.role_change', entityType: 'member', entityId: targetId, details: { from: target.role, to: role }, ip });
}

async function removeMember(familyId, actorId, targetId, ip) {
  const self = actorId === targetId;
  const actor = await requireRole(familyId, actorId, self ? 'viewer' : 'admin');
  const target = await getMembership(familyId, targetId);
  if (!target) throw notFound('Member not found.');
  if (target.role === 'owner') throw forbidden('The owner cannot leave or be removed. Transfer ownership or delete the family.');
  if (!self && actor.role !== 'owner' && target.role === 'admin') throw forbidden('Only the owner can remove an admin.');
  await db.query("UPDATE family_members SET status = 'removed' WHERE family_id = $1 AND user_id = $2", [familyId, targetId]);
  await audit({ familyId, actorId, action: self ? 'family.leave' : 'family.remove_member', entityType: 'member', entityId: targetId, ip });
}

async function deleteFamily(familyId, actorId, ip) {
  await requireRole(familyId, actorId, 'owner');
  await audit({ familyId, actorId, action: 'family.delete', entityType: 'family', entityId: familyId, ip });
  await db.query('DELETE FROM families WHERE id = $1', [familyId]);
}

module.exports = {
  ROLE_RANK, getMembership, requireRole, activeMemberIds, createFamily, listFamilies, getFamily, updateFamily,
  inviteMember, listInvitations, revokeInvitation, myInvitations, acceptInvitation, changeRole, removeMember, deleteFamily,
};
