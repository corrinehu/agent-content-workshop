"use client";

import { useRouter } from "next/navigation";

export default function LoginButton() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push("/api/auth/login")}
      className="px-8 py-3 bg-primary text-white rounded-lg font-medium hover:bg-secondary transition-colors cursor-pointer"
    >
      使用 SecondMe 登录
    </button>
  );
}
