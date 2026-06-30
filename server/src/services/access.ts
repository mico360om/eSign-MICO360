import { prisma } from "../lib/prisma";

/** Profile IDs a user belongs to (the access boundary for documents/signatories/groups). */
export async function userProfileIds(userId: string): Promise<string[]> {
  const links = await prisma.profileMember.findMany({
    where: { userId },
    select: { profileId: true },
  });
  return links.map((l) => l.profileId);
}

/** True if requester and signatory share at least one profile (signatory selection rule). */
export async function shareProfile(requesterId: string, signatoryId: string): Promise<boolean> {
  const mine = await userProfileIds(requesterId);
  if (mine.length === 0) return false;
  const count = await prisma.profileMember.count({
    where: { userId: signatoryId, profileId: { in: mine } },
  });
  return count > 0;
}
