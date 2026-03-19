import { cookies } from "next/headers";
import { findUserById, updateUser } from "@/lib/db";
import { refreshAccessToken } from "@/lib/secondme";

export interface AuthUser {
  id: string;
  secondmeUserId: string;
  name: string | null;
  avatar: string | null;
  accessToken: string;
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value;

  if (!userId) return null;

  const user = await findUserById(userId);
  if (!user) return null;

  // Check if token needs refresh
  const now = new Date();
  const bufferMs = 5 * 60 * 1000; // 5 min buffer
  if (user.token_expires_at && new Date(new Date(user.token_expires_at).getTime() - bufferMs) < now) {
    try {
      const result = await refreshAccessToken(user.refresh_token);
      if (result.code === 0 && result.data) {
        await updateUser(user.id, {
          accessToken: result.data.accessToken,
          refreshToken: result.data.refreshToken || user.refresh_token,
          tokenExpiresAt: new Date(Date.now() + (result.data.expiresIn || 7200) * 1000),
        });
        return {
          id: user.id,
          secondmeUserId: user.secondme_user_id,
          name: user.name,
          avatar: user.avatar,
          accessToken: result.data.accessToken,
        };
      }
    } catch {
      console.warn("Token refresh failed, using existing token");
    }
  }

  return {
    id: user.id,
    secondmeUserId: user.secondme_user_id,
    name: user.name,
    avatar: user.avatar,
    accessToken: user.access_token,
  };
}
