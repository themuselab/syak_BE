import { gaDateRange, gaFunnelRequest, parseGaFunnel } from './GA4Funnel';

describe('GA-sourced funnel', () => {
  const now = Date.parse('2026-11-13T15:01:00Z'); // November 14 in Korea
  it('uses GA completed-day ranges including KST midnight', () => {
    expect(gaDateRange(7, now)).toEqual({ startDate: '2026-11-07', endDate: '2026-11-13' });
    expect(gaDateRange(1, now)).toEqual({ startDate: '2026-11-13', endDate: '2026-11-13' });
  });
  it('queries existing GA events with partner and Naver conditions, without synthetic sessions', () => {
    const body = gaFunnelRequest(7, 'partner', now);
    const events = body.funnel.steps.map(s => s.filterExpression.funnelEventFilter);
    expect(events.map(e => e.eventName)).toEqual(['session_start', 'shop_view', 'reserve_click']);
    expect(events[0].funnelParameterFilterExpression).toBeUndefined();
    expect(JSON.stringify(events[1])).toContain('partner');
    expect(JSON.stringify(events[2])).toContain('reservation_method');
    expect(JSON.stringify(events[2])).toContain('naver');
    expect(body.funnel.isOpenFunnel).toBe(false);
  });
  const fixture = () => ({ funnelTable: {
    dimensionHeaders: [{ name: 'funnelStepName' }],
    metricHeaders: ['funnelStepAbandonments', 'activeUsers', 'funnelStepCompletionRate'].map(name => ({ name })),
    rows: [[1696,1768,72/1768],[61,72,11/72],[0,11,1]].map((values, i) => ({
      dimensionValues: [{ value: `${i+1}. GA step` }], metricValues: values.map(value => ({ value: String(value) })),
    })), metadata: {},
  } });
  it('maps metrics by GA header names, preserving GA user counts and abandonment', () => {
    const {steps} = parseGaFunnel(fixture());
    expect(steps.map(s => s.users)).toEqual([1768,72,11]);
    expect(steps[1].abandonments).toBe(61);
    expect(steps[1].completionRate).toBe(11/72);
  });
  it('does not turn missing GA data into a zero-conversion chart', () => {
    const report=fixture();report.funnelTable.rows.pop();
    expect(() => parseGaFunnel(report)).toThrow('Incomplete');
  });
});
