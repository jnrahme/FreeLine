"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "../../components/admin-shell";
import { PanelHeader } from "../../components/panel-header";
import { adminFetch } from "../../lib/api";
import { formatDateTime, toTone } from "../../lib/format";
import type { AdminNumberInventoryItem } from "../../lib/types";

export default function NumbersPage() {
  const [status, setStatus] = useState<"assigned" | "available" | "quarantined">(
    "assigned"
  );
  const [numbers, setNumbers] = useState<AdminNumberInventoryItem[]>([]);
  const [restoreTargets, setRestoreTargets] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activePhoneNumber, setActivePhoneNumber] = useState<string | null>(null);

  async function loadNumbers(nextStatus: "assigned" | "available" | "quarantined") {
    setIsLoading(true);
    setError(null);

    try {
      const response = await adminFetch<{ numbers: AdminNumberInventoryItem[] }>(
        `/v1/admin/numbers?status=${nextStatus}`
      );
      setNumbers(response.numbers);
      setRestoreTargets((current) => {
        const nextTargets = { ...current };
        for (const item of response.numbers) {
          if (item.phoneNumber && !nextTargets[item.phoneNumber]) {
            nextTargets[item.phoneNumber] = item.userId ?? "";
          }
        }
        return nextTargets;
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to load numbers."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadNumbers(status);
  }, [status]);

  async function restoreNumber(phoneNumber: string) {
    const userId = restoreTargets[phoneNumber]?.trim();
    if (!userId) {
      setError("A target user ID is required to restore a quarantined number.");
      return;
    }

    setActivePhoneNumber(phoneNumber);
    setError(null);

    try {
      await adminFetch("/v1/admin/numbers/restore", {
        body: JSON.stringify({
          phoneNumber,
          userId
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      await loadNumbers(status);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to restore number."
      );
    } finally {
      setActivePhoneNumber(null);
    }
  }

  return (
    <AdminShell>
      <section className="admin-card">
        <PanelHeader
          eyebrow="Inventory"
          title="Provisioned number state"
          description="Review assigned numbers, quarantined inventory, warning history, and restore targets without leaving the console."
        />

        <div className="button-row" style={{ marginBottom: 20 }}>
          {(["assigned", "quarantined", "available"] as const).map((value) => (
            <button
              className={status === value ? "button-primary" : "button-secondary"}
              key={value}
              onClick={() => setStatus(value)}
              type="button"
            >
              {value}
            </button>
          ))}
        </div>

        {error ? <div className="error-banner">{error}</div> : null}
        {isLoading ? <p className="muted">Loading number inventory…</p> : null}

        <div className="data-list">
          {numbers.map((item) => (
            <article className="admin-card inset-card" key={item.phoneNumberId}>
              <div className="detail-header">
                <div>
                  <h3 style={{ marginBottom: 4 }}>{item.phoneNumber}</h3>
                  <div className="muted">
                    {item.locality}, {item.region} · {item.provider}
                  </div>
                  <div className="muted">
                    {item.userEmail ?? "No active assignee"} · Assigned{" "}
                    {formatDateTime(item.assignedAt)}
                  </div>
                </div>
                <div className="button-row">
                  <span className="pill" data-tone={toTone(item.status)}>
                    {item.status}
                  </span>
                  {item.warningTypes.length > 0 ? (
                    <span className="pill" data-tone="amber">
                      {item.warningTypes.join(", ")}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="detail-list">
                <div className="detail-row">
                  <span>Release reason</span>
                  <strong>{item.releaseReason ?? "n/a"}</strong>
                </div>
                <div className="detail-row">
                  <span>Quarantine available</span>
                  <strong>{formatDateTime(item.quarantineAvailableAt)}</strong>
                </div>
                <div className="detail-row">
                  <span>Quarantine status</span>
                  <strong>{item.quarantineStatus ?? "n/a"}</strong>
                </div>
              </div>

              {item.status === "quarantined" ? (
                <div className="restore-form">
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor={`restore-${item.phoneNumberId}`}>Restore to user ID</label>
                    <input
                      id={`restore-${item.phoneNumberId}`}
                      onChange={(event) =>
                        setRestoreTargets((current) => ({
                          ...current,
                          [item.phoneNumber]: event.target.value
                        }))
                      }
                      type="text"
                      value={restoreTargets[item.phoneNumber] ?? ""}
                    />
                  </div>
                  <button
                    className="button-primary"
                    disabled={activePhoneNumber === item.phoneNumber}
                    onClick={() => void restoreNumber(item.phoneNumber)}
                    type="button"
                  >
                    {activePhoneNumber === item.phoneNumber ? "Restoring…" : "Restore number"}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}
