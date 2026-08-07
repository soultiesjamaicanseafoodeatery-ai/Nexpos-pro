// Plain, dependency-free instrumentation store for the System Health dashboard.
// Deliberately NOT React state / context / a reducer — writing here must never
// trigger a re-render anywhere else in the app, and reading here must never be
// able to affect anything else. Every setter is wrapped so a bug in this file
// can never throw into a payment, print, or sync call site that calls it.
// SystemHealthPage.tsx is the only reader; it polls these plain values on its
// own local interval while it's open. Nothing else in the app depends on this
// module's contents.

export type ChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR' | 'JOINING' | 'unknown'

interface PrintOutcome { ok: boolean; ts: string }

interface HealthTelemetry {
  channelStatus: Record<string, ChannelStatus>
  reconnectCount: number
  lastSyncOk: string | null
  lastSyncFail: string | null
  failedWriteCount: number
  unsavedTransactionIds: number[]
  printInFlight: number
  lastPrintOk: string | null
  lastPrintByTx: Record<number, PrintOutcome>
}

const telemetry: HealthTelemetry = {
  channelStatus: {},
  reconnectCount: 0,
  lastSyncOk: null,
  lastSyncFail: null,
  failedWriteCount: 0,
  unsavedTransactionIds: [],
  printInFlight: 0,
  lastPrintOk: null,
  lastPrintByTx: {},
}

// Read-only snapshot for the dashboard — always returns a fresh shallow copy
// so the page can't accidentally mutate the live telemetry object.
export function getHealthSnapshot(): HealthTelemetry {
  try {
    return {
      ...telemetry,
      channelStatus: { ...telemetry.channelStatus },
      unsavedTransactionIds: [...telemetry.unsavedTransactionIds],
      lastPrintByTx: { ...telemetry.lastPrintByTx },
    }
  } catch {
    return { ...telemetry }
  }
}

export function recordChannelStatus(channel: string, status: string): void {
  try {
    const prev = telemetry.channelStatus[channel]
    telemetry.channelStatus[channel] = (status as ChannelStatus) ?? 'unknown'
    if (prev && prev === 'SUBSCRIBED' && (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED')) {
      telemetry.reconnectCount += 1
    }
  } catch { /* instrumentation must never throw */ }
}

export function recordSyncResult(ok: boolean): void {
  try {
    const now = new Date().toISOString()
    if (ok) telemetry.lastSyncOk = now
    else { telemetry.lastSyncFail = now; telemetry.failedWriteCount += 1 }
  } catch { /* instrumentation must never throw */ }
}

// Only ADD_TRANSACTION (a brand-new sale) failures populate this — a failed
// void/refund write is a different failure mode (the row already exists,
// just an update didn't land) and is covered by recordSyncResult alone.
export function recordTransactionWriteResult(txId: number, ok: boolean): void {
  try {
    recordSyncResult(ok)
    if (!ok) {
      if (!telemetry.unsavedTransactionIds.includes(txId)) telemetry.unsavedTransactionIds.push(txId)
    } else {
      telemetry.unsavedTransactionIds = telemetry.unsavedTransactionIds.filter(id => id !== txId)
    }
  } catch { /* instrumentation must never throw */ }
}

export function recordPrintStart(): void {
  try { telemetry.printInFlight += 1 } catch { /* noop */ }
}

export function recordPrintEnd(): void {
  try { telemetry.printInFlight = Math.max(0, telemetry.printInFlight - 1) } catch { /* noop */ }
}

export function recordPrintSuccess(correlationId?: number): void {
  try {
    const now = new Date().toISOString()
    telemetry.lastPrintOk = now
    if (typeof correlationId === 'number') {
      telemetry.lastPrintByTx[correlationId] = { ok: true, ts: now }
    }
  } catch { /* noop */ }
}

export function recordPrintFailure(correlationId?: number): void {
  try {
    if (typeof correlationId === 'number') {
      telemetry.lastPrintByTx[correlationId] = { ok: false, ts: new Date().toISOString() }
    }
  } catch { /* noop */ }
}
