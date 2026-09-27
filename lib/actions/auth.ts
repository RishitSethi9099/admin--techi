"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().default("/")
});

export async function signIn(formData: FormData) {
  if (!hasSupabaseEnv()) return { success: true, next: "/" };

  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid email and password." };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password
  });

  if (error) return { error: error.message };
  return { success: true, next: parsed.data.next };
}

export async function signOut() {
  if (!hasSupabaseEnv()) redirect("/");

  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
