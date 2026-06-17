# Fare Trust Audit

Date: 2026-05-30

## Current Behavior

RailRoute now shows fare only when the selected-date availability provider returns fare for the exact train, source, destination, date, class, and quota.

If the provider does not return that exact context, the API returns:

- `fare: null`
- `fareKind: "unavailable"`
- UI label: "Live fare unavailable"

Generic route fare is no longer displayed anywhere in the fare API or fare UI.

## Provider Findings

The configured provider is `irctc-connect`, initialized from `IRCTC_API_KEY` in `.env.local`.

The only fare accepted as displayable is the fare returned by:

`getAvailability(trainNo, fromStnCode, toStnCode, date, coach, quota)`

The legacy fare flow did not accept journey date in the current integration. It has been disabled as a user-facing fare source because it cannot prove selected-date accuracy.

## Risks Removed

- Removed generic route fare fallback from `/api/fare`.
- Removed persistent fare cache.
- Removed persistent availability cache.
- Removed secondary IndianRailAPI train/fare/availability fallback paths that could mix provider semantics.
- Removed hardcoded API keys from local scratch/test scripts.
- Stopped displaying unavailable fare as a real amount.
- Stopped showing cache state as live fare/availability.

## IRCTC-Style Handling

IRCTC-style UX treats fare and availability as contextual to selected train, date, class, quota, and route. If that context is unavailable, the safer behavior is to show the train row and mark fare/availability unavailable, rather than substituting a generic route fare.

RailRoute follows that model:

- Selected-date provider result: show fare and availability with source metadata.
- Missing selected-date result: show "Live fare unavailable" / "Live data unavailable".
- No generic fare substitution.

## Recommended Policy

1. Only show fare when it comes from selected-date availability provider response.
2. Never infer fare from train class, distance, route, old provider tables, or previous dates.
3. Never cache fare or availability as live data.
4. Keep safe caching only for train search and route schedule.
5. Log provider failures with request context but never expose secrets.

## Trust Impact

The app will show fewer fares, but the fares it does show are tied to the selected travel context. This is the correct tradeoff for a railway utility where wrong fare/availability is worse than missing data.
