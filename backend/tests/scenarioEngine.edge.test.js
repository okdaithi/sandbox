'use strict';

/**
 * Scenario engine — edge case tests
 *
 * Covers the limit cases identified during user-test planning:
 *   DEC-003  Gibberish input silently falls back to first option
 *   DEC-013  Keyword tie resolved by first-found, not best-match
 *   EDGE-007 Float precision in delta accumulation
 *   EDGE-008 max_rounds not enforced by engine (documents current behaviour)
 *   EDGE-009 Absolute vs delta event variable changes
 *   DEC-010  History and round counter accumulate correctly
 *   DEC-011  Outcome condition fires when threshold is crossed
 *   SESS-005 First decision bootstraps from initial_state when current_state is null/empty
 */

const { processDecision } = require('../engine/scenarioEngine');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScenario(overrides = {}) {
  return {
    initial_state: {
      phase: 'initial',
      round: 1,
      variables: { health: 100, stock: 50 },
      active_events: [],
      history: [],
      max_rounds: 3,
      ...overrides.initial_state,
    },
    rules_definition: {
      decision_points: [
        {
          id: 'dp_main',
          phase: 'initial',
          title: 'Main Decision',
          options: [
            {
              id: 'opt_alpha',
              label: 'Alpha option',
              keywords: ['alpha', 'first', 'one'],
              state_changes: { variables: { health: 90 } },
              feedback: 'Alpha chosen',
            },
            {
              id: 'opt_beta',
              label: 'Beta option',
              keywords: ['beta', 'second', 'two'],
              state_changes: { variables_delta: { stock: -10 } },
              feedback: 'Beta chosen',
            },
          ],
        },
      ],
      event_triggers: [],
      outcome_conditions: [],
      ...overrides.rules_definition,
    },
  };
}

// ---------------------------------------------------------------------------
// DEC-003 — Gibberish input falls back to first option (silent)
// ---------------------------------------------------------------------------

describe('DEC-003 — gibberish input', () => {
  test('returns first option when no keyword matches (score = 0)', () => {
    const scenario = makeScenario();
    const result = processDecision(scenario, null, { action: 'xqzwplm sdfghj zzzzz' });

    expect(result.matched_option.id).toBe('opt_alpha');
    expect(result.feedback).toBe('Alpha chosen');
  });

  test('there is no indication in the response that the fallback occurred', () => {
    const scenario = makeScenario();
    const result = processDecision(scenario, null, { action: 'totally random nonsense here' });

    // The engine returns a confident feedback with no "keyword_matched" flag
    expect(result).not.toHaveProperty('keyword_matched');
    expect(result.matched_option).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DEC-013 — Keyword tie resolved by first option in array
// ---------------------------------------------------------------------------

describe('DEC-013 — keyword tie', () => {
  test('first option in array wins when two options share the same keyword', () => {
    const scenario = makeScenario({
      rules_definition: {
        decision_points: [
          {
            id: 'dp_tie',
            phase: 'initial',
            title: 'Tie Decision',
            options: [
              {
                id: 'opt_first',
                label: 'First',
                keywords: ['shared', 'unique_a'],
                state_changes: {},
                feedback: 'First wins',
              },
              {
                id: 'opt_second',
                label: 'Second',
                keywords: ['shared', 'unique_b'],
                state_changes: {},
                feedback: 'Second wins',
              },
            ],
          },
        ],
        event_triggers: [],
        outcome_conditions: [],
      },
    });

    // "shared" gives score 1 to both; opt_first is encountered first
    const result = processDecision(scenario, null, { action: 'shared' });
    expect(result.matched_option.id).toBe('opt_first');
  });

  test('higher-scoring option beats the first-found option', () => {
    const scenario = makeScenario({
      rules_definition: {
        decision_points: [
          {
            id: 'dp_score',
            phase: 'initial',
            title: 'Score Decision',
            options: [
              {
                id: 'opt_low',
                label: 'Low score',
                keywords: ['shared'],
                state_changes: {},
                feedback: 'Low',
              },
              {
                id: 'opt_high',
                label: 'High score',
                keywords: ['shared', 'extra', 'more'],
                state_changes: {},
                feedback: 'High',
              },
            ],
          },
        ],
        event_triggers: [],
        outcome_conditions: [],
      },
    });

    // "shared extra more" gives opt_low score 1, opt_high score 3
    const result = processDecision(scenario, null, { action: 'shared extra more' });
    expect(result.matched_option.id).toBe('opt_high');
  });
});

// ---------------------------------------------------------------------------
// EDGE-007 — Float precision in delta accumulation
// ---------------------------------------------------------------------------

describe('EDGE-007 — float precision in delta accumulation', () => {
  test('fractional deltas produce floating-point drift — engine applies no rounding', () => {
    // 6.4 + (-5.1) in IEEE 754 = 1.3000000000000007, not exactly 1.3
    const scenario = makeScenario({
      initial_state: {
        phase: 'initial',
        round: 1,
        variables: { score: 6.4 },
        active_events: [],
        history: [],
      },
      rules_definition: {
        decision_points: [
          {
            id: 'dp_float',
            phase: 'initial',
            title: 'Float delta',
            options: [
              {
                id: 'opt_sub',
                label: 'Subtract',
                keywords: ['sub'],
                state_changes: { variables_delta: { score: -5.1 } },
                feedback: 'Subtracted',
              },
            ],
          },
        ],
        event_triggers: [],
        outcome_conditions: [],
      },
    });

    const result = processDecision(scenario, null, { option_id: 'opt_sub' });
    // Engine performs no rounding; result is 1.3000000000000007, not 1.3
    expect(result.state.variables.score).not.toBe(1.3);
    // Confirm it is close to 1.3 but drifted
    expect(result.state.variables.score).toBeCloseTo(1.3, 10);
    expect(Math.abs(result.state.variables.score - 1.3)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// EDGE-008 — max_rounds not enforced by engine (documents current behaviour)
// ---------------------------------------------------------------------------

describe('EDGE-008 — max_rounds not enforced', () => {
  test('engine processes a decision beyond max_rounds without error', () => {
    const scenario = makeScenario({
      initial_state: {
        phase: 'initial',
        round: 1,
        variables: { health: 100 },
        active_events: [],
        history: [],
        max_rounds: 1, // already at the limit
      },
    });

    // First decision: round advances from 1 → 2 (already past max_rounds=1)
    const r1 = processDecision(scenario, null, { option_id: 'opt_alpha' });
    expect(r1.state.round).toBe(2);
    expect(r1.outcome_result).toBeNull(); // no outcome fired for exceeding max_rounds

    // Second decision: round advances to 3 — engine does not stop
    const r2 = processDecision(scenario, r1.state, { option_id: 'opt_alpha' });
    expect(r2.state.round).toBe(3);
    expect(r2.outcome_result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// EDGE-009 — Event variable_changes (absolute) vs variable_changes_delta
// ---------------------------------------------------------------------------

describe('EDGE-009 — event variable changes: absolute vs delta', () => {
  test('absolute variable_changes replaces the current value', () => {
    const scenario = makeScenario({
      initial_state: {
        phase: 'initial',
        round: 1,
        variables: { cash: 1000000, trigger_flag: 99 },
        active_events: [],
        history: [],
      },
      rules_definition: {
        decision_points: [
          {
            id: 'dp1',
            phase: 'initial',
            title: 'Decision',
            options: [
              { id: 'opt_noop', label: 'Noop', state_changes: {}, feedback: 'ok', keywords: [] },
            ],
          },
        ],
        event_triggers: [
          {
            id: 'evt_abs',
            condition: { variable: 'trigger_flag', operator: 'gte', value: 1 },
            event: {
              type: 'cash_reset',
              title: 'Cash Reset',
              description: 'Absolute override',
              severity: 'high',
              variable_changes: { cash: 500000 }, // absolute
            },
          },
        ],
        outcome_conditions: [],
      },
    });

    const result = processDecision(scenario, null, { option_id: 'opt_noop' });
    // Regardless of starting cash, absolute sets it to exactly 500000
    expect(result.state.variables.cash).toBe(500000);
  });

  test('variable_changes_delta adjusts from the current value', () => {
    const scenario = makeScenario({
      initial_state: {
        phase: 'initial',
        round: 1,
        variables: { cash: 1000000, trigger_flag: 99 },
        active_events: [],
        history: [],
      },
      rules_definition: {
        decision_points: [
          {
            id: 'dp1',
            phase: 'initial',
            title: 'Decision',
            options: [
              { id: 'opt_noop', label: 'Noop', state_changes: {}, feedback: 'ok', keywords: [] },
            ],
          },
        ],
        event_triggers: [
          {
            id: 'evt_delta',
            condition: { variable: 'trigger_flag', operator: 'gte', value: 1 },
            event: {
              type: 'cash_loss',
              title: 'Cash Loss',
              description: 'Relative decrease',
              severity: 'high',
              variable_changes_delta: { cash: -400000 }, // delta
            },
          },
        ],
        outcome_conditions: [],
      },
    });

    const result = processDecision(scenario, null, { option_id: 'opt_noop' });
    expect(result.state.variables.cash).toBe(600000); // 1000000 - 400000
  });
});

// ---------------------------------------------------------------------------
// DEC-010 — History and round counter accumulate correctly
// ---------------------------------------------------------------------------

describe('DEC-010 — sequential decision state accumulation', () => {
  test('round increments and history grows with each decision', () => {
    const scenario = makeScenario();

    const r1 = processDecision(scenario, null, { option_id: 'opt_alpha' });
    expect(r1.state.round).toBe(2);
    expect(r1.state.history).toHaveLength(1);
    expect(r1.state.history[0].round).toBe(1);

    const r2 = processDecision(scenario, r1.state, { option_id: 'opt_beta' });
    expect(r2.state.round).toBe(3);
    expect(r2.state.history).toHaveLength(2);
    expect(r2.state.history[1].round).toBe(2);
    expect(r2.state.history[1].option_matched).toBe('opt_beta');
  });

  test('state from previous round is preserved across rounds', () => {
    const scenario = makeScenario({
      initial_state: {
        phase: 'initial',
        round: 1,
        variables: { health: 100, stock: 50 },
        active_events: [],
        history: [],
      },
    });

    // Round 1: set health to 90 (absolute)
    const r1 = processDecision(scenario, null, { option_id: 'opt_alpha' });
    expect(r1.state.variables.health).toBe(90);
    expect(r1.state.variables.stock).toBe(50); // unchanged

    // Round 2: subtract 10 from stock (delta)
    const r2 = processDecision(scenario, r1.state, { option_id: 'opt_beta' });
    expect(r2.state.variables.health).toBe(90); // preserved from round 1
    expect(r2.state.variables.stock).toBe(40); // 50 - 10
  });
});

// ---------------------------------------------------------------------------
// DEC-011 — Outcome condition detection
// ---------------------------------------------------------------------------

describe('DEC-011 — outcome conditions', () => {
  test('outcome fires when a condition variable crosses its threshold', () => {
    const scenario = makeScenario({
      initial_state: {
        phase: 'initial',
        round: 1,
        variables: { inventory: 5 }, // already below threshold
        active_events: [],
        history: [],
      },
      rules_definition: {
        decision_points: [
          {
            id: 'dp1',
            phase: 'initial',
            title: 'Decision',
            options: [
              { id: 'opt_noop', label: 'Noop', state_changes: {}, feedback: 'ok', keywords: [] },
            ],
          },
        ],
        event_triggers: [],
        outcome_conditions: [
          {
            id: 'oc_collapse',
            condition: { variable: 'inventory', operator: 'lt', value: 10 },
            outcome: 'collapse',
            severity: 'catastrophic',
            description: 'Stock depleted',
          },
        ],
      },
    });

    const result = processDecision(scenario, null, { option_id: 'opt_noop' });
    expect(result.outcome_result).not.toBeNull();
    expect(result.outcome_result.outcome).toBe('collapse');
    expect(result.outcome_result.severity).toBe('catastrophic');
  });

  test('outcome does not fire when condition is not met', () => {
    const scenario = makeScenario({
      initial_state: {
        phase: 'initial',
        round: 1,
        variables: { inventory: 50 }, // well above threshold
        active_events: [],
        history: [],
      },
      rules_definition: {
        decision_points: [
          {
            id: 'dp1',
            phase: 'initial',
            title: 'Decision',
            options: [
              { id: 'opt_noop', label: 'Noop', state_changes: {}, feedback: 'ok', keywords: [] },
            ],
          },
        ],
        event_triggers: [],
        outcome_conditions: [
          {
            id: 'oc_collapse',
            condition: { variable: 'inventory', operator: 'lt', value: 10 },
            outcome: 'collapse',
            severity: 'catastrophic',
            description: 'Stock depleted',
          },
        ],
      },
    });

    const result = processDecision(scenario, null, { option_id: 'opt_noop' });
    expect(result.outcome_result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SESS-005 — State bootstrap from initial_state when current_state is null
// ---------------------------------------------------------------------------

describe('DEC-008 — state bootstrap', () => {
  test('null current_state uses initial_state with empty history', () => {
    const scenario = makeScenario({
      initial_state: {
        phase: 'initial',
        round: 1,
        variables: { health: 100, stock: 50 },
        active_events: ['evt_existing'],
        history: [],
      },
    });

    const result = processDecision(scenario, null, { option_id: 'opt_alpha' });

    expect(result.state.round).toBe(2);
    expect(result.state.history).toHaveLength(1);
    expect(result.state.variables.health).toBe(90); // absolute from opt_alpha
  });

  test('empty-object current_state is also treated as a new session', () => {
    const scenario = makeScenario();
    const result = processDecision(scenario, {}, { option_id: 'opt_alpha' });
    expect(result.state.round).toBe(2);
  });

  test('existing current_state is preserved rather than reset', () => {
    const scenario = makeScenario();

    // Simulate a prior round result stored in current_state
    const priorState = {
      phase: 'initial',
      round: 5,
      variables: { health: 70, stock: 30 },
      active_events: [],
      history: [{ round: 1 }, { round: 2 }, { round: 3 }, { round: 4 }],
    };

    const result = processDecision(scenario, priorState, { option_id: 'opt_alpha' });
    expect(result.state.round).toBe(6); // advances from 5, not reset to 2
    expect(result.state.history).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Compound condition: AND / OR logic
// ---------------------------------------------------------------------------

describe('EDGE-010 — compound condition evaluation (and/or)', () => {
  function scenarioWithOutcome(condition) {
    return makeScenario({
      initial_state: {
        phase: 'initial',
        round: 1,
        variables: { a: 80, b: 3 },
        active_events: [],
        history: [],
      },
      rules_definition: {
        decision_points: [
          {
            id: 'dp1',
            phase: 'initial',
            title: 'Decision',
            options: [
              { id: 'opt_noop', label: 'Noop', state_changes: {}, feedback: 'ok', keywords: [] },
            ],
          },
        ],
        event_triggers: [],
        outcome_conditions: [
          {
            id: 'oc_test',
            condition,
            outcome: 'success',
            severity: 'positive',
            description: 'Conditions met',
          },
        ],
      },
    });
  }

  test('AND condition: both must be true', () => {
    const condition = {
      variable: 'a', operator: 'gte', value: 70,
      and: { variable: 'b', operator: 'lt', value: 5 },
    };
    // a=80 >= 70 AND b=3 < 5  → true
    const pass = processDecision(scenarioWithOutcome(condition), null, { option_id: 'opt_noop' });
    expect(pass.outcome_result).not.toBeNull();

    // Change b to 6 so AND fails
    const failScenario = scenarioWithOutcome(condition);
    failScenario.initial_state.variables.b = 6;
    const fail = processDecision(failScenario, null, { option_id: 'opt_noop' });
    expect(fail.outcome_result).toBeNull();
  });

  test('OR condition: either can be true', () => {
    const condition = {
      variable: 'a', operator: 'gt', value: 200, // false
      or: { variable: 'b', operator: 'lt', value: 5 }, // true
    };
    const result = processDecision(scenarioWithOutcome(condition), null, { option_id: 'opt_noop' });
    expect(result.outcome_result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase filtering on decision points
// ---------------------------------------------------------------------------

describe('Phase filtering', () => {
  test('decision point with wrong phase is skipped; null phase matches any phase', () => {
    const scenario = makeScenario({
      initial_state: {
        phase: 'escalation',
        round: 1,
        variables: {},
        active_events: [],
        history: [],
      },
      rules_definition: {
        decision_points: [
          {
            id: 'dp_wrong_phase',
            phase: 'initial', // won't match
            title: 'Wrong Phase',
            options: [{ id: 'wrong', label: 'Wrong', state_changes: {}, feedback: 'wrong', keywords: [] }],
          },
          {
            id: 'dp_any_phase',
            phase: null, // matches any
            title: 'Any Phase',
            options: [{ id: 'correct', label: 'Correct', state_changes: {}, feedback: 'correct', keywords: [] }],
          },
        ],
        event_triggers: [],
        outcome_conditions: [],
      },
    });

    const result = processDecision(scenario, null, { option_id: 'wrong' });
    // dp_wrong_phase skipped; dp_any_phase matched; option 'wrong' not found by ID in dp_any_phase
    // → falls back to dp_any_phase.options[0] = 'correct'
    expect(result.decision_point.id).toBe('dp_any_phase');
  });
});
