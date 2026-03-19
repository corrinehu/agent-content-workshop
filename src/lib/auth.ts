import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
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

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  // Check if token needs refresh
  const now = new Date();
  const bufferMs = 5 * 60 * 1000; // 5 min buffer
  if (user.tokenExpiresAt && new Date(user.tokenExpiresAt.getTime() - bufferMs) < now) {
    try {
      const result = await refreshAccessToken(user.refreshToken);
      if (result.code === 0 && result.data) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            accessToken: result.data.accessToken,
            refreshToken: result.data.refreshToken || user.refreshToken,
            tokenExpiresAt: new Date(Date.now() + (result.data.expiresIn || 7200) * 1000),
          },
        });
        user.accessToken = result.data.accessToken;
      }
    } catch {
      console.warn("Token refresh failed, using existing token");
    }
  }

  return {
    id: user.id,
    secondmeUserId: user.secondmeUserId,
    name: user.name,
    avatar: user.avatar,
    accessToken: user.accessToken,
  };
}
