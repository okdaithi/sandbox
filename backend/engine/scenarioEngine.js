'use strict';

/**
 * Scenario Engine — Game Master Module
 *
 * Processes team decisions against scenario rules_definition and advances
 * simulation state deterministically. Acts as the authoritative interpreter
 * of scenario logic; all state mutations flow through here.
 *
 * Integration point: called by POST /api/sessions/:id/decisions
 */

// ---------------------------------------------------------------------------
// Condition evaluator
// ---------------------------------------------------------------------------

const OPERATORS = {
  eq:  (a, b) => a === b,
  ne:  (a, b) => a !== b,
  gt:  (a, b) => a >   b,
  gte: (a, b) => a >=  b,
  lt:  (a, b) => a <   b,
  lte: (a, b) => a <=  b,
};

/**
 * Recursively evaluate a condition object against a variables map.
 * Condition shape:
 *   { variable, operator, value, and?: Condition, or?: Condition }
 * Returns true if condition passes, true if condition is null/undefined.
 */
function evaluateCondition(condition, variables) {
  if (!condition) return true;

  const { variable, operator, value, and: andCond, or: orCond } = condition;
  const current = variables[variable];
  const op = OPERATORS[operator];

  if (!op) return true; // unknown operator → pass-through

  const result = op(current, value);

  // Short-circuit on AND
  if (andCond && result && !evaluateCondition(andCond, variables)) return false;

  // OR: return true if either branch passes
  if (orCond) return result || evaluateCondition(orCond, variables);

  return result;
}

// ---------------------------------------------------------------------------
// Decision-to-option matcher
// ---------------------------------------------------------------------------

/**
 * Match free-text or structured decision input to the best option from a
 * decision point. Uses a keyword overlap score; falls back to first option.
 *
 * @param {string} input - Raw action text or option_id from the team
 * @param {Array}  options - Decision point option definitions
 * @returns {Object|null} Best matching option, or null if none available
 */
function matchOption(input, options) {
  if (!options || options.length === 0) return null;

  const normalised = (input || '').toLowerCase().trim();

  // 1. Exact option ID match
  const byId = options.find(o => o.id === normalised || o.id === input);
  if (byId) return byId;

  // 2. Keyword overlap scoring
  let best = null;
  let bestScore = 0;

  for (const opt of options) {
    const corpus = [
      opt.id,
      opt.label,
      ...(opt.keywords || []),
    ]
      .join(' ')
      .toLowerCase()
      .split(/\W+/)
      .filter(Boolean);

    const score = corpus.reduce(
      (acc, kw) => acc + (normalised.includes(kw) ? 1 : 0),
      0,
    );

    if (score > bestScore) {
      bestScore = score;
      best = opt;
    }
  }

  // 3. Fallback: first option (ensures deterministic execution in tests)
  return bestScore > 0 ? best : options[0];
}

// ---------------------------------------------------------------------------
// Active decision-point resolver
// ---------------------------------------------------------------------------

/**
 * Find the first decision point that is applicable to the current phase and
 * whose trigger_condition (if any) evaluates to true against current variables.
 *
 * Decision points are evaluated in array order; the first match wins.
 */
function findActiveDecisionPoint(rules, phase, variables) {
  if (!rules?.decision_points) return null;

  for (const dp of rules.decision_points) {
    // Phase filter — null/undefined phase means "any phase"
    if (dp.phase && dp.phase !== phase) continue;

    // Trigger condition guard
    if (dp.trigger_condition && !evaluateCondition(dp.trigger_condition, variables)) continue;

    return dp;
  }

  return null;
}

// ---------------------------------------------------------------------------
// State mutation helpers
// ---------------------------------------------------------------------------

/**
 * Apply a state_changes block from a matched option to the current state.
 * Supports both:
 * - absolute replacements via `variables`
 * - relative updates via `variables_delta`
 *
 * Delta values may be numeric shorthand:
 *   { customer_satisfaction: -8 }
 * or structured operations:
 *   { customer_satisfaction: { op: 'add', value: -8 } }
 */
function applyStateChanges(state, changes) {
  if (!changes) return state;

  const {
    variables: varChangesAbsolute,
    variables_delta: varChangesDelta,
    ...topLevelChanges
  } = changes;

  const next = { ...state, ...topLevelChanges };

  if (varChangesAbsolute || varChangesDelta) {
    const mergedVariables = { ...(state.variables || {}) };

    if (varChangesAbsolute) {
      Object.assign(mergedVariables, varChangesAbsolute);
    }

    if (varChangesDelta) {
      for (const [key, deltaSpec] of Object.entries(varChangesDelta)) {
        const current = mergedVariables[key];

        if (typeof deltaSpec === 'number') {
          const base = typeof current === 'number' ? current : 0;
          mergedVariables[key] = base + deltaSpec;
          continue;
        }

        if (
          deltaSpec
          && typeof deltaSpec === 'object'
          && deltaSpec.op === 'add'
          && typeof deltaSpec.value === 'number'
        ) {
          const base = typeof current === 'number' ? current : 0;
          mergedVariables[key] = base + deltaSpec.value;
        }
      }
    }

    next.variables = mergedVariables;
  }

  return next;
}

/**
 * Evaluate all event triggers and return those whose conditions fire against
 * current state variables. Also applies any variable_changes (absolute) and
 * variable_changes_delta (relative) from fired events.
 *
 * Returns { triggeredEvents, nextState } so variable cascades are included.
 */
function evaluateTriggers(triggers, state) {
  if (!triggers || triggers.length === 0) return { triggeredEvents: [], nextState: state };

  let nextState = state;
  const triggeredEvents = [];

  for (const trigger of triggers) {
    if (evaluateCondition(trigger.condition, nextState.variables)) {
      const event = trigger.event;
      triggeredEvents.push(event);

      // Apply any cascading variable changes from the triggered event
      if (event.variable_changes || event.variable_changes_delta) {
        nextState = applyStateChanges(nextState, {
          variables: event.variable_changes,
          variables_delta: event.variable_changes_delta,
        });
      }
    }
  }

  return { triggeredEvents, nextState };
}

/**
 * Scan outcome conditions in order and return the first that fires, or null.
 */
function checkOutcomeConditions(conditions, state) {
  if (!conditions || conditions.length === 0) return null;

  for (const cond of conditions) {
    if (evaluateCondition(cond.condition, state.variables)) {
      return {
        id:          cond.id,
        outcome:     cond.outcome,
        severity:    cond.severity,
        description: cond.description,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process a single team decision through the scenario engine.
 *
 * @param {Object}      scenario     - Full scenario row: { initial_state, rules_definition }
 * @param {Object|null} currentState - sessions.current_state from the DB (null for first round)
 * @param {Object}      decision     - Decision payload: { action, option_id?, team_id? }
 *
 * @returns {{
 *   state:           Object,         // New session state to persist
 *   feedback:        string,         // Human-readable outcome message for the team
 *   triggered_events: Array,         // Events that fired this round
 *   outcome_result:  Object|null,    // Termination condition if reached, else null
 *   decision_point:  Object|null,    // { id, title } of the matched decision point
 *   matched_option:  Object|null,    // { id, label } of the matched option
 * }}
 */
function processDecision(scenario, currentState, decision) {
  const rules    = scenario.rules_definition || {};
  const initState = scenario.initial_state   || {};

  // Bootstrap state for new sessions; preserve existing state otherwise
  const isNew = !currentState || Object.keys(currentState).length === 0;
  const state = isNew
    ? { ...initState, history: [] }
    : { ...currentState };

  const variables = state.variables || {};
  const phase     = state.phase     || 'initial';
  const round     = state.round     || 1;

  // ── 1. Find applicable decision point ────────────────────────────────────
  const decisionPoint = findActiveDecisionPoint(rules, phase, variables);

  // ── 2. Match team input to an option ─────────────────────────────────────
  const inputText   = decision.option_id || decision.action || '';
  const matchedOption = decisionPoint
    ? matchOption(inputText, decisionPoint.options)
    : null;

  const stateChanges = matchedOption?.state_changes || {};
  const feedback     = matchedOption?.feedback
    || 'Decision recorded. State advanced to next round.';

  // ── 3. Apply option state changes ────────────────────────────────────────
  let nextState = applyStateChanges(state, stateChanges);

  // ── 4. Evaluate event triggers (may cascade further variable changes) ────
  const { triggeredEvents, nextState: stateAfterEvents } =
    evaluateTriggers(rules.event_triggers || [], nextState);
  nextState = stateAfterEvents;

  // Merge newly fired events into active_events list (avoid duplicates by type)
  const existingTypes = new Set((nextState.active_events || []).map(e => e.type));
  const newEvents     = triggeredEvents.filter(e => !existingTypes.has(e.type));
  nextState.active_events = [...(nextState.active_events || []), ...newEvents];

  // ── 5. Advance round counter ──────────────────────────────────────────────
  nextState.round = round + 1;

  // ── 6. Append history entry ───────────────────────────────────────────────
  const historyEntry = {
    round,
    phase,
    decision:            decision.action || inputText,
    option_matched:      matchedOption?.id || null,
    decision_point_id:   decisionPoint?.id || null,
    state_changes_applied: stateChanges,
    triggered_events:    triggeredEvents.map(e => e.type),
    feedback,
    timestamp:           new Date().toISOString(),
  };

  nextState.history = [...(state.history || []), historyEntry];

  // ── 7. Check outcome/termination conditions ───────────────────────────────
  const outcomeResult = checkOutcomeConditions(
    rules.outcome_conditions || [],
    nextState,
  );

  return {
    state:            nextState,
    feedback,
    triggered_events: triggeredEvents,
    outcome_result:   outcomeResult,
    decision_point:   decisionPoint
      ? { id: decisionPoint.id, title: decisionPoint.title }
      : null,
    matched_option:   matchedOption
      ? { id: matchedOption.id, label: matchedOption.label }
      : null,
  };
}

module.exports = { processDecision };
