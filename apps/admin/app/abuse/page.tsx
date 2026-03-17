"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "../../components/admin-shell";
import { PanelHeader } from "../../components/panel-header";
import { adminFetch } from "../../lib/api";
import { formatDateTime, toTone } from "../../lib/format";
import type { AdminAbuseQueueItem } from "../../lib/types";

export default function AbusePage() {
  const [status, setStatus] = useState<"open" | "all">("open");
  const [items, setItems] = useState<AdminAbuseQueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);

  async function loadQueue(nextStatus: "open" | "all") {
    setIsLoading(true);
    setError(null);

    try {
      const response = await adminFetch<{ items: AdminAbuseQueueItem[] }>(
        `/v1/admin/abuse-queue?status=${nextStatus}`
      );
      setItems(response.items);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to load abuse queue."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadQueue(status);
  }, [status]);

  async function reviewItem(eventId: string, action: "dismiss" | "confirm") {
    setActiveEventId(eventId);
    setError(null);

    try {
      await adminFetch(`/v1/admin/abuse-queue/${eventId}/${action}`, {
        method: "POST"
      });
      await loadQueue(status);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to review abuse event."
      );
    } finally {
      setActiveEventId(null);
    }
  }

  return (
    <AdminShell>
      <section className="admin-card">
        <PanelHeader
          eyebrow="Review Queue"
          title="Flagged abuse events"
          description="Review reports, spam heuristics, and prior suspension events in one queue, then confirm enforcement or dismiss noise."
        />

        <div className="button-row" style={{ marginBottom: 20 }}>
          <button
            className={status === "open" ? "button-primary" : "button-secondary"}
            onClick={() => setStatus("open")}
            type="button"
          >
            Open only
          </button>
          <button
            className={status === "all" ? "button-primary" : "button-secondary"}
            onClick={() => setStatus("all")}
            type="button"
          >
            All reviews
          </button>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}
        {isLoading ? <p className="muted">Loading abuse queue…</p> : null}

        <div className="data-list">
          {items.map((item) => (
            <article className="admin-card inset-card" key={item.id}>
              <div className="detail-header">
                <div>
                  <div className="eyebrow">{item.eventType}</div>
                  <h3 style={{ marginBottom: 4, marginTop: 12 }}>{item.userEmail}</h3>
                  <div className="muted">
                    {item.activeNumber ?? "No active number"} · Trust {item.userTrustScore}
                  </div>
                  <div className="muted">{formatDateTime(item.createdAt)}</div>
                </div>
                <span className="pill" data-tone={toTone(item.reviewAction ?? item.eventType)}>
                  {item.reviewAction ?? "open"}
                </span>
              </div>

              <div className="detail-list">
                {Object.entries(item.details).length === 0 ? (
                  <div className="muted">No additional event metadata.</div>
                ) : (
                  Object.entries(item.details).map(([key, value]) => (
                    <div className="detail-row" key={key}>
                      <span>{key}</span>
                      <strong>{String(value)}</strong>
                    </div>
                  ))
                )}
              </div>

              <div className="button-row">
                <button
                  className="button-secondary"
                  disabled={activeEventId === item.id}
                  onClick={() => void reviewItem(item.id, "dismiss")}
                  type="button"
                >
                  Dismiss
                </button>
                <button
                  className="button-primary"
                  disabled={activeEventId === item.id}
                  onClick={() => void reviewItem(item.id, "confirm")}
                  type="button"
                >
                  Confirm suspension
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}
