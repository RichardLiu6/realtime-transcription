"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, UserPlus, Trash2, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface User {
  email: string;
  name: string;
  addedAt: string;
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (res.ok) setUsers(data.users);
    } catch {
      setError("获取用户列表失败");
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleAdd = async () => {
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "添加失败");
        return;
      }
      setSuccess(`已添加 ${data.user.email}`);
      setEmail("");
      setName("");
      fetchUsers();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (userEmail: string) => {
    setError("");
    setSuccess("");
    setDeleting(userEmail);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "删除失败");
        return;
      }
      setSuccess(`已删除 ${userEmail}`);
      fetchUsers();
    } catch {
      setError("网络错误");
    } finally {
      setDeleting(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && email.trim() && !loading) handleAdd();
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-lg space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">用户管理</h1>
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="size-4 mr-1" />
              返回首页
            </Button>
          </Link>
        </div>

        {/* Add user form */}
        <div className="space-y-3 rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium text-muted-foreground">
            添加用户
          </h2>
          <div className="flex gap-2" onKeyDown={handleKeyDown}>
            <Input
              type="email"
              placeholder="邮箱地址"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1"
              disabled={loading}
            />
            <Input
              type="text"
              placeholder="姓名（选填）"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-32"
              disabled={loading}
            />
            <Button onClick={handleAdd} disabled={!email.trim() || loading}>
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}
        {success && (
          <p className="text-sm text-green-600 text-center">{success}</p>
        )}

        {/* User list */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            已授权用户 ({users.length})
          </h2>
          {users.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              暂无用户，请添加
            </p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {users.map((user) => (
                <div
                  key={user.email}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {user.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <span className="text-xs text-muted-foreground">
                      {user.addedAt}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(user.email)}
                      disabled={deleting === user.email}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      {deleting === user.email ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
