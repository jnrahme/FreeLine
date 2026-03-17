"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "../../components/admin-shell";
import { PanelHeader } from "../../components/panel-header";
import { adminFetch } from "../../lib/api";
import { toTone } from "../../lib/format";
import type { AdminSystemStatus } from "../../lib/types";

interface InviteCodeRecord {
  code: string;
  createdAt: string;
  currentUses: number;
  expiresAt: string | null;
  id: string;
  maxUses: number;
}

export default function SettingsPage() {
  const [inviteCodes, setInviteCodes] = useState<InviteCodeRecord[]>([]);
  const [systemStatus, setSystemStatus] = useState<AdminSystemStatus | null>(null);
  const [code, setCode] = useState("");
  const [maxUses, setMaxUses] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function loadInviteCodes() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await adminFetch<{ inviteCodes: InviteCodeRecord[] }>(
        "/v1/admin/invite-codes"
      );
      setInviteCodes(response.inviteCodes);
      const statusResponse = await adminFetch<{ status: AdminSystemStatus }>(
        "/v1/admin/system-status"
      );
      setSystemStatus(statusResponse.status);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load invite codes."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadInviteCodes();
  }, []);

  async function handleCreateInviteCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      await adminFetch("/v1/admin/invite-codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          code: code.trim() || null,
          maxUses: Number(maxUses)
        })
      });

      setCode("");
      setMaxUses("10");
      await loadInviteCodes();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create invite code."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AdminShell>
      <section className="admin-card">
        <PanelHeader
          eyebrow="Beta Controls"
          title="Invite-only access"
          description="This page is already backed by the new admin auth and invite routes. The rest of the settings surface will expand from here."
        />

        <div className="panel-grid">
          <article className="admin-card">
            <h2>Create invite code</h2>
            <form className="form-stack" onSubmit={handleCreateInviteCode}>
              <div className="field">
                <label htmlFor="invite-code">Code</label>
                <input
                  id="invite-code"
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  placeholder="Leave blank to auto-generate"
                  type="text"
                  value={code}
                />
              </div>

              <div className="field">
                <label htmlFor="invite-uses">Max uses</label>
                <input
                  id="invite-uses"
                  min="1"
                  onChange={(event) => setMaxUses(event.target.value)}
                  type="number"
                  value={maxUses}
                />
              </div>

              {error ? <div className="error-banner">{error}</div> : null}

              <div className="button-row">
                <button className="button-primary" disabled={isSaving} type="submit">
                  {isSaving ? "Creating..." : "Create invite code"}
                </button>
              </div>
            </form>
          </article>

          <article className="admin-card">
            <h2>Operator status</h2>
            {systemStatus ? (
              <div className="detail-list" style={{ marginBottom: 20 }}>
                <div className="detail-row">
                  <span>Beta mode</span>
                  <span className="pill" data-tone={systemStatus.betaMode ? "amber" : "green"}>
                    {systemStatus.betaMode ? "invite only" : "open"}
                  </span>
                </div>
                <div className="detail-row">
                  <span>Telephony provider</span>
                  <span className="pill" data-tone={toTone(systemStatus.telephonyProvider)}>
                    {systemStatus.telephonyProvider}
                  </span>
                </div>
                <div className="detail-row">
                  <span>A2P 10DLC</span>
                  <span
                    className="pill"
                    data-tone={systemStatus.a2p10dlcRegistered ? "green" : "red"}
                  >
                    {systemStatus.a2p10dlcRegistered ? "registered" : "pending"}
                  </span>
                </div>
                <div className="detail-row">
                  <span>Webhook signatures</span>
                  <span
                    className="pill"
                    data-tone={
                      systemStatus.webhookSignatureVerificationEnabled ? "green" : "red"
                    }
                  >
                    {systemStatus.webhookSignatureVerificationEnabled
                      ? "enforced"
                      : "disabled"}
                  </span>
                </div>
              </div>
            ) : null}

            <h2>Existing invite codes</h2>
            {isLoading ? (
              <p className="muted">Loading invite codes…</p>
            ) : (
              <div className="data-list">
                {inviteCodes.map((inviteCode) => (
                  <div className="data-row" key={inviteCode.id}>
                    <div>
                      <strong>{inviteCode.code}</strong>
                      <div className="muted">
                        {inviteCode.currentUses} / {inviteCode.maxUses} uses
                      </div>
                    </div>
                    <span
                      className="pill"
                      data-tone={
                        inviteCode.currentUses >= inviteCode.maxUses ? "red" : "green"
                      }
                    >
                      {inviteCode.currentUses >= inviteCode.maxUses
                        ? "exhausted"
                        : "active"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
      </section>
    </AdminShell>
  );
}
