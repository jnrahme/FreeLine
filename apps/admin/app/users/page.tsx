"use client";

import { useCallback, useEffect, useState } from "react";

import { AdminShell } from "../../components/admin-shell";
import { PanelHeader } from "../../components/panel-header";
import { adminFetch } from "../../lib/api";
import { formatDateTime, toTone } from "../../lib/format";
import type { AdminUserDetail, AdminUserSummary } from "../../lib/types";

export default function UsersPage() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const loadUsers = useCallback(async (nextQuery: string) => {
    setIsLoadingUsers(true);
    setError(null);

    try {
      const response = await adminFetch<{ users: AdminUserSummary[] }>(
        `/v1/admin/users?q=${encodeURIComponent(nextQuery)}`
      );
      setUsers(response.users);

      if (!selectedUserId || !response.users.some((user) => user.id === selectedUserId)) {
        setSelectedUserId(response.users[0]?.id ?? null);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to load users."
      );
    } finally {
      setIsLoadingUsers(false);
    }
  }, [selectedUserId]);

  async function loadUserDetail(userId: string) {
    setIsLoadingDetail(true);
    setError(null);

    try {
      const response = await adminFetch<{ user: AdminUserDetail }>(`/v1/admin/users/${userId}`);
      setSelectedUser(response.user);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to load user detail."
      );
    } finally {
      setIsLoadingDetail(false);
    }
  }

  useEffect(() => {
    void loadUsers("");
  }, [loadUsers]);

  useEffect(() => {
    if (!selectedUserId) {
      setSelectedUser(null);
      return;
    }

    void loadUserDetail(selectedUserId);
  }, [selectedUserId]);

  async function handleUserMutation(
    path: string,
    options: RequestInit = {},
    successMessage?: string
  ) {
    if (!selectedUserId) {
      return;
    }

    setIsMutating(true);
    setError(null);

    try {
      await adminFetch(path, {
        method: "POST",
        ...options
      });
      await Promise.all([loadUsers(query), loadUserDetail(selectedUserId)]);
      if (successMessage) {
        setError(successMessage);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to update user."
      );
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <AdminShell>
      <section className="admin-card">
        <PanelHeader
          eyebrow="User Ops"
          title="Search, trust, and enforcement"
          description="Find a user by email, phone number, or user ID, then inspect allowance posture, linked devices, and moderation history before acting."
        />

        <div className="panel-split">
          <article className="admin-card inset-card">
            <form
              className="search-form"
              onSubmit={(event) => {
                event.preventDefault();
                void loadUsers(query);
              }}
            >
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="user-query">Search users</label>
                <input
                  id="user-query"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Email, +1 phone number, or user ID"
                  type="text"
                  value={query}
                />
              </div>
              <button className="button-primary" type="submit">
                Search
              </button>
            </form>

            {isLoadingUsers ? <p className="muted">Loading users…</p> : null}

            <div className="data-list">
              {users.map((user) => (
                <button
                  className="interactive-row"
                  data-active={String(user.id === selectedUserId)}
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id)}
                  type="button"
                >
                  <div>
                    <strong>{user.displayName ?? user.email}</strong>
                    <div className="muted">{user.email}</div>
                    <div className="meta-row">
                      <span>{user.activeNumber ?? "No active number"}</span>
                      <span>Trust {user.trustScore}</span>
                    </div>
                  </div>
                  <span className="pill" data-tone={toTone(user.status)}>
                    {user.status}
                  </span>
                </button>
              ))}
            </div>
          </article>

          <article className="admin-card inset-card">
            {error ? <div className="error-banner">{error}</div> : null}

            {isLoadingDetail ? (
              <p className="muted">Loading user detail…</p>
            ) : selectedUser ? (
              <div className="stack">
                <div className="detail-header">
                  <div>
                    <h2 style={{ marginBottom: 4 }}>{selectedUser.displayName ?? selectedUser.email}</h2>
                    <div className="muted">{selectedUser.id}</div>
                  </div>
                  <div className="button-row">
                    <span className="pill" data-tone={toTone(selectedUser.status)}>
                      {selectedUser.status}
                    </span>
                    <span className="pill" data-tone={toTone(selectedUser.usage.messageAllowance.tier)}>
                      {selectedUser.usage.messageAllowance.tier}
                    </span>
                  </div>
                </div>

                <div className="stat-grid">
                  <div className="stat-card">
                    <span className="muted">Active number</span>
                    <strong>{selectedUser.assignedNumber?.phoneNumber ?? "Not assigned"}</strong>
                    <span className="muted">
                      Assigned {formatDateTime(selectedUser.assignedNumber?.assignedAt ?? null)}
                    </span>
                  </div>
                  <div className="stat-card">
                    <span className="muted">Texts this month</span>
                    <strong>{selectedUser.totalTextEventsThisMonth}</strong>
                    <span className="muted">
                      {selectedUser.usage.messageAllowance.monthlyRemaining} remaining
                    </span>
                  </div>
                  <div className="stat-card">
                    <span className="muted">Call minutes this month</span>
                    <strong>{selectedUser.totalCallMinutesThisMonth}</strong>
                    <span className="muted">
                      {selectedUser.usage.callAllowance.monthlyRemainingMinutes} remaining
                    </span>
                  </div>
                  <div className="stat-card">
                    <span className="muted">Trust score</span>
                    <strong>{selectedUser.trustScore}</strong>
                    <span className="muted">Created {formatDateTime(selectedUser.createdAt)}</span>
                  </div>
                </div>

                <div className="button-row">
                  {selectedUser.status === "suspended" ? (
                    <button
                      className="button-primary"
                      disabled={isMutating}
                      onClick={() =>
                        void handleUserMutation(`/v1/admin/users/${selectedUser.id}/unsuspend`)
                      }
                      type="button"
                    >
                      {isMutating ? "Updating…" : "Unsuspend account"}
                    </button>
                  ) : (
                    <button
                      className="button-primary"
                      disabled={isMutating}
                      onClick={() =>
                        void handleUserMutation(`/v1/admin/users/${selectedUser.id}/suspend`, {
                          body: JSON.stringify({
                            reason: "admin_console_review"
                          }),
                          headers: {
                            "Content-Type": "application/json"
                          }
                        })
                      }
                      type="button"
                    >
                      {isMutating ? "Updating…" : "Suspend account"}
                    </button>
                  )}

                  <button
                    className="button-secondary"
                    disabled={isMutating || !selectedUser.assignedNumber}
                    onClick={() =>
                      void handleUserMutation(
                        `/v1/admin/users/${selectedUser.id}/force-release-number`
                      )
                    }
                    type="button"
                  >
                    Force release number
                  </button>
                </div>

                <div className="panel-grid">
                  <section className="admin-card inset-card">
                    <h3>Linked devices</h3>
                    <div className="data-list">
                      {selectedUser.devices.length === 0 ? (
                        <p className="muted">No device history recorded yet.</p>
                      ) : (
                        selectedUser.devices.map((device) => (
                          <div className="data-row" key={device.fingerprint}>
                            <div>
                              <strong>{device.platform ?? "unknown"} · {device.fingerprint}</strong>
                              <div className="muted">
                                Last seen {formatDateTime(device.lastSeenAt ?? device.updatedAt)}
                              </div>
                            </div>
                            <span
                              className="pill"
                              data-tone={device.blockedAt ? "red" : "green"}
                            >
                              {device.blockedAt ? "blocked" : "usable"}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="admin-card inset-card">
                    <h3>Abuse history</h3>
                    <div className="data-list">
                      {selectedUser.abuseEvents.length === 0 ? (
                        <p className="muted">No abuse events recorded.</p>
                      ) : (
                        selectedUser.abuseEvents.map((event) => (
                          <div className="data-row" key={event.id}>
                            <div>
                              <strong>{event.eventType}</strong>
                              <div className="muted">{formatDateTime(event.createdAt)}</div>
                            </div>
                            <span
                              className="pill"
                              data-tone={toTone(event.reviewAction ?? event.eventType)}
                            >
                              {event.reviewAction ?? "open"}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </div>
              </div>
            ) : (
              <p className="muted">Select a user to inspect moderation detail.</p>
            )}
          </article>
        </div>
      </section>
    </AdminShell>
  );
}
