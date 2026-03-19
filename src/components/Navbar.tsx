"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface NavbarProps {
  userName?: string;
  userAvatar?: string;
}

export default function Navbar({ userName, userAvatar }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  if (!userName) return null;

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-border">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="text-lg font-bold text-primary">
          Agent Content Workshop
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            看板
          </Link>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 cursor-pointer"
            >
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt={userName}
                  className="w-7 h-7 rounded-full object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary-light flex items-center justify-center text-xs font-medium text-primary">
                  {userName[0]?.toUpperCase()}
                </div>
              )}
              <span className="text-sm font-medium hidden sm:inline">{userName}</span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-border py-1">
                <Link
                  href="/profile"
                  className="block px-4 py-2 text-sm text-muted hover:bg-card-hover"
                  onClick={() => setMenuOpen(false)}
                >
                  个人资料
                </Link>
                <a
                  href="/api/auth/logout"
                  className="block px-4 py-2 text-sm text-red-500 hover:bg-card-hover"
                  onClick={() => setMenuOpen(false)}
                >
                  退出登录
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
