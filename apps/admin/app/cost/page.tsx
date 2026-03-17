"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "../../components/admin-shell";
import { PanelHeader } from "../../components/panel-header";
import { adminFetch } from "../../lib/api";
import { formatCompactNumber, formatCurrency, toTone } from "../../lib/format";
import type { AdminCostDashboard, AdminSystemStatus } from "../../lib/types";

export default function CostPage() {
  const [cost, setCost] = useState<AdminCostDashboard | null>(null);
  const [status, setStatus] = useState<AdminSystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const [costResponse, statusResponse] = await Promise.all([
          adminFetch<{ cost: AdminCostDashboard }>("/v1/admin/cost"),
          adminFetch<{ status: AdminSystemStatus }>("/v1/admin/system-status")
        ]);
        setCost(costResponse.cost);
        setStatus(statusResponse.status);
      } catch (requestError) {
        setError(
          requestError instanceof Error ? requestError.message : "Unable to load cost dashboard."
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, []);

  return (
    <AdminShell>
      <section className="admin-card">
        <PanelHeader
          eyebrow="Telecom Spend"
          title="Spend and launch posture"
          description="Monitor estimated telecom cost, active-user burden, and whether the beta is still operating inside the margin guardrails."
        />

        {error ? <div className="error-banner">{error}</div> : null}
        {isLoading ? <p className="muted">Loading cost dashboard…</p> : null}

        {cost && status ? (
          <div className="stack">
            <div className="stat-grid">
              <div className="stat-card">
                <span className="muted">Active numbers</span>
                <strong>{formatCompactNumber(cost.activeNumbers)}</strong>
                <span className="muted">{formatCurrency(cost.numberCostUsd)} monthly number cost</span>
              </div>
              <div className="stat-card">
                <span className="muted">Text events this month</span>
                <strong>{formatCompactNumber(cost.textEventsThisMonth)}</strong>
                <span className="muted">{formatCurrency(cost.smsCostUsd)} estimated SMS spend</span>
              </div>
              <div className="stat-card">
                <span className="muted">Call minutes this month</span>
                <strong>{formatCompactNumber(cost.callMinutesThisMonth)}</strong>
                <span className="muted">{formatCurrency(cost.voiceCostUsd)} estimated voice spend</span>
              </div>
              <div className="stat-card">
                <span className="muted">Cost per active user</span>
                <strong>{formatCurrency(cost.costPerActiveUserUsd)}</strong>
                <span className="muted">
                  Threshold {formatCurrency(cost.alertThresholdUsd)}
                </span>
              </div>
            </div>

            <div className="button-row">
              <span className="pill" data-tone={cost.isAlertTriggered ? "red" : "green"}>
                {cost.isAlertTriggered ? "margin alert" : "within guardrail"}
              </span>
              <span className="pill" data-tone={status.betaMode ? "amber" : "green"}>
                beta mode {status.betaMode ? "on" : "off"}
              </span>
              <span className="pill" data-tone={toTone(status.telephonyProvider)}>
                {status.telephonyProvider}
              </span>
            </div>

            <article className="admin-card inset-card">
              <h3>Total estimated spend</h3>
              <div className="metric-strip">
                <strong>{formatCurrency(cost.totalEstimatedSpendUsd)}</strong>
                <span className="muted">
                  A2P {status.a2p10dlcRegistered ? "registered" : "not registered"}
                </span>
              </div>
            </article>

            <article className="admin-card inset-card">
              <h3>30-day trend</h3>
              <div className="mini-chart">
                {cost.trend.map((point) => {
                  const fill = Math.min(
                    100,
                    Math.max(
                      6,
                      cost.totalEstimatedSpendUsd > 0
                        ? (point.estimatedSpendUsd / cost.totalEstimatedSpendUsd) * 100
                        : 0
                    )
                  );

                  return (
                    <div className="mini-bar" key={point.date}>
                      <div className="detail-row">
                        <span>{point.date}</span>
                        <strong>{formatCurrency(point.estimatedSpendUsd)}</strong>
                      </div>
                      <div className="mini-bar-track">
                        <div className="mini-bar-fill" style={{ width: `${fill}%` }} />
                      </div>
                      <div className="meta-row">
                        <span>{point.textEvents} texts</span>
                        <span>{point.callMinutes} call min</span>
                        <span>{point.activeNumbers} active nums</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          </div>
        ) : null}
      </section>
    </AdminShell>
  );
}
