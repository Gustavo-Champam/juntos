import type { AppUser } from "@/lib/auth/use-current-user";
import type { ProfileInput } from "./space";

export function profileFrom(user: AppUser): ProfileInput {
  return {
    name: user.displayName?.trim() || user.primaryEmail?.split("@")[0] || "Você",
    email: user.primaryEmail,
    avatarUrl: user.profileImageUrl,
  };
}
