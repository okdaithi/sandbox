'use strict';

const { processDecision } = require('../engine/scenarioEngine');

describe('scenarioEngine variable mutation semantics', () => {
  test('applies absolute replacement from state_changes.variables', () => {
    const scenario = {
      initial_state: {
        phase: 'initial',
        round: 1,
        variables: { customer_satisfaction: 75, cash_reserves: 1000000 },
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
              {
                id: 'opt_replace',
                label: 'Replace absolute value',
                state_changes: {
                  variables: { customer_satisfaction: 55 },
                },
                feedback: 'done',
              },
            ],
          },
        ],
        event_triggers: [],
        outcome_conditions: [],
      },
    };

    const result = processDecision(scenario, null, { option_id: 'opt_replace' });

    expect(result.state.variables.customer_satisfaction).toBe(55);
    expect(result.state.variables.cash_reserves).toBe(1000000);
  });

  test('applies delta changes from state_changes.variables_delta (numeric + structured)', () => {
    const scenario = {
      initial_state: {
        phase: 'initial',
        round: 1,
        variables: { customer_satisfaction: 75, inventory_level: 60 },
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
              {
                id: 'opt_delta',
                label: 'Apply deltas',
                state_changes: {
                  variables_delta: {
                    customer_satisfaction: -8,
                    inventory_level: { op: 'add', value: 5 },
                  },
                },
                feedback: 'done',
              },
            ],
          },
        ],
        event_triggers: [],
        outcome_conditions: [],
      },
    };

    const result = processDecision(scenario, null, { option_id: 'opt_delta' });

    expect(result.state.variables.customer_satisfaction).toBe(67);
    expect(result.state.variables.inventory_level).toBe(65);
  });

  test('applies event variable_changes (absolute) and variable_changes_delta (relative)', () => {
    const scenario = {
      initial_state: {
        phase: 'initial',
        round: 1,
        variables: { fuel_cost_index: 200, cash_reserves: 1000000, customer_satisfaction: 75 },
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
              {
                id: 'opt_noop',
                label: 'No-op',
                state_changes: {},
                feedback: 'done',
              },
            ],
          },
        ],
        event_triggers: [
          {
            id: 'evt_absolute',
            condition: { variable: 'fuel_cost_index', operator: 'gt', value: 190 },
            event: {
              type: 'fuel_spike',
              title: 'Fuel Spike',
              description: 'desc',
              severity: 'high',
              variable_changes: { cash_reserves: 900000 },
            },
          },
          {
            id: 'evt_delta',
            condition: { variable: 'fuel_cost_index', operator: 'gt', value: 190 },
            event: {
              type: 'customer_drop',
              title: 'Customer Drop',
              description: 'desc',
              severity: 'high',
              variable_changes_delta: {
                customer_satisfaction: { op: 'add', value: -10 },
              },
            },
          },
        ],
        outcome_conditions: [],
      },
    };

    const result = processDecision(scenario, null, { option_id: 'opt_noop' });

    expect(result.state.variables.cash_reserves).toBe(900000);
    expect(result.state.variables.customer_satisfaction).toBe(65);
    expect(result.triggered_events).toHaveLength(2);
  });
});
