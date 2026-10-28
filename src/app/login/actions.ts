"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { verifyCredentials } from "@/lib/auth";
import { createSession, deleteSession } from "@/lib/session";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(formData: FormData) {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/login?error=1");

  const user = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user) redirect("/login?error=1");

  await createSession({ userId: user.id, role: user.role, name: user.name });
  redirect("/alerts");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
