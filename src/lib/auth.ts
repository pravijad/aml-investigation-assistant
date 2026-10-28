import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, type Role } from "@/lib/session";

// Used when the email doesn't exist, so a wrong email takes as long as a wrong
// password. This stops attackers discovering which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  return passwordMatches ? user : null;
}

// Call at the top of any protected page or action.
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

// Call when only some roles may see a page or perform an action.
export async function requireRole(allowed: Role[]) {
  const session = await requireUser();
  if (!allowed.includes(session.role)) redirect("/alerts?denied=1");
  return session;
}
