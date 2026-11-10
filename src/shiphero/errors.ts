/** A single entry from a ShipHero GraphQL `errors` array. */
export interface ShipHeroGraphQLError {
  message: string;
  /** ShipHero-specific numeric code. `30` means the credit quota was exhausted. */
  code?: number;
  operation?: string;
  request_id?: string;
  required_credits?: number;
  remaining_credits?: number;
  time_remaining?: string;
  path?: (string | number)[];
  locations?: { line: number; column: number }[];
  extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

export class ShipHeroError extends Error {
  /** HTTP status, when the failure was not a GraphQL-level error. */
  readonly status?: number;
  readonly errors: ShipHeroGraphQLError[];
  readonly requestId?: string;
  readonly operation?: string;
  readonly code?: number;
  readonly body?: unknown;

  constructor(
    message: string,
    details: {
      status?: number;
      errors?: ShipHeroGraphQLError[];
      requestId?: string;
      operation?: string;
      code?: number;
      body?: unknown;
    } = {}
  ) {
    super(message);
    this.name = 'ShipHeroError';
    this.status = details.status;
    this.errors = details.errors ?? [];
    this.requestId = details.requestId;
    this.operation = details.operation;
    this.code = details.code;
    this.body = details.body;
  }
}

/** Raised when authentication fails or no usable credential was supplied. */
export class ShipHeroAuthError extends ShipHeroError {
  constructor(message: string, details: { status?: number; body?: unknown } = {}) {
    super(message, details);
    this.name = 'ShipHeroAuthError';
  }
}

/**
 * Raised when the account's credit quota cannot satisfy the operation. Retryable
 * only when the operation fits inside the account maximum; a query that
 * structurally costs more than `max_available` will never succeed.
 */
export class ShipHeroThrottleError extends ShipHeroError {
  readonly requiredCredits?: number;
  readonly remainingCredits?: number;
  /** How long ShipHero says it will take to restore enough credits. */
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    details: {
      errors?: ShipHeroGraphQLError[];
      requestId?: string;
      operation?: string;
      requiredCredits?: number;
      remainingCredits?: number;
      retryAfterMs?: number;
      body?: unknown;
    } = {}
  ) {
    super(message, { ...details, code: THROTTLE_ERROR_CODE });
    this.name = 'ShipHeroThrottleError';
    this.requiredCredits = details.requiredCredits;
    this.remainingCredits = details.remainingCredits;
    this.retryAfterMs = details.retryAfterMs;
  }
}

/** ShipHero's error code for "not enough credits to perform the requested operation". */
export const THROTTLE_ERROR_CODE = 30;

/**
 * Parses ShipHero's human readable `time_remaining` ("4 seconds", "55 minutes")
 * into milliseconds.
 */
export function parseTimeRemaining(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/([\d.]+)\s*(second|minute|hour)/i);
  if (!match) return undefined;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;

  const unit = match[2].toLowerCase();
  const multiplier = unit === 'hour' ? 3_600_000 : unit === 'minute' ? 60_000 : 1000;
  return amount * multiplier;
}
