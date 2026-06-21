import { primaryClassCode, splitRouteStableKey, dedupeSplitRoutes, estimatedFareAmount } from "./src/components/shared/TrustSummary";

// Mock data based on the API response we got
const mockSplits = [
  {
    "hubStation": "DDU",
    "hubStationName": "Pandit DD Upadhyaya (DDU)",
    "layoverDuration": "1h 35m",
    "layoverHours": 1.5833333333333333,
    "leg1Date": "2026-06-21",
    "leg2Date": "2026-06-21",
    "leg1DepartureDate": "2026-06-21",
    "leg1ArrivalDate": "2026-06-21",
    "leg2DepartureDate": "2026-06-21",
    "leg1Fare": 0,
    "leg2Fare": 0,
    "totalFare": 0,
    "score": 53,
    "leg1": {
      "trainNo": "13005",
      "trainName": "HWH ASR MAIL",
      "source": "DURE",
      "destination": "DDU",
      "departureTime": "04:54",
      "arrivalTime": "08:05",
      "duration": "03:11 hrs",
      "availability": "Availability not requested yet for 3A.",
      "fare": "Fare not requested yet.",
      "journeyDate": "2026-06-21",
      "departureDate": "2026-06-21",
      "arrivalDate": "2026-06-21",
      "features": [],
      "classes": [],
      "runsOnDays": [true, true, true, true, true, true, true],
      "route": [],
      "selectedClass": "3A",
      "providerReturnedClass": [],
      "availabilityStatus": "NOT_CHECKED",
      "fareStatus": "NOT_CHECKED",
      "lookupReason": "Availability not requested yet for 3A.",
      "requestProof": {
        "trainNo": "13005",
        "source": "DURE",
        "destination": "DDU",
        "date": "2026-06-21",
        "classType": "3A",
        "quota": "GN"
      },
      "requestedSource": "DURE",
      "requestedDestination": "DDU",
      "isCityTerminalOption": false,
      "availabilitySourceStation": "DURE",
      "availabilityDestinationStation": "DDU",
      "trainSource": "DURE",
      "trainDestination": "DDU",
      "providerPair": "DURE_DDU",
      "dataSource": "Cached train list",
      "trustMeta": {
        "source": "cached",
        "provider": "irctc-connect",
        "isLive": false,
        "asOf": "2026-06-20T06:22:17.144Z",
        "expiresAt": "2026-06-20T06:25:17.144Z",
        "confidence": 0,
        "warning": "Train list came from a cached provider response. Fare and availability are fetched only when requested."
      },
      "classAvailability": {}
    },
    "leg2": {
      "trainNo": "12987",
      "trainName": "SDAH AII SF EXP",
      "source": "DDU",
      "destination": "JP",
      "departureTime": "09:40",
      "arrivalTime": "23:15",
      "duration": "13:35 hrs",
      "availability": "Availability not requested yet for 3A.",
      "fare": "Fare not requested yet.",
      "journeyDate": "2026-06-21",
      "departureDate": "2026-06-21",
      "arrivalDate": "2026-06-21",
      "features": [],
      "trainType": "Superfast",
      "classes": [],
      "runsOnDays": [true, true, true, true, true, true, true],
      "route": [],
      "selectedClass": "3A",
      "providerReturnedClass": [],
      "availabilityStatus": "NOT_CHECKED",
      "fareStatus": "NOT_CHECKED",
      "lookupReason": "Availability not requested yet for 3A.",
      "requestProof": {
        "trainNo": "12987",
        "source": "DDU",
        "destination": "JP",
        "date": "2026-06-21",
        "classType": "3A",
        "quota": "GN"
      },
      "requestedSource": "DDU",
      "requestedDestination": "JP",
      "isCityTerminalOption": false,
      "availabilitySourceStation": "DDU",
      "availabilityDestinationStation": "JP",
      "trainSource": "DDU",
      "trainDestination": "JP",
      "providerPair": "DDU_JP",
      "dataSource": "Cached train list",
      "trustMeta": {
        "source": "cached",
        "provider": "irctc-connect",
        "isLive": false,
        "asOf": "2026-06-20T06:22:17.160Z",
        "expiresAt": "2026-06-20T06:25:17.160Z",
        "confidence": 0,
        "warning": "Train list came from a cached provider response. Fare and availability are fetched only when requested."
      },
      "classAvailability": {}
    },
    "combinedConfirmationChance": null,
    "isHeritage": false
  }
];

function runTest() {
  const classType = "3A";
  const selectedSortClass = "3A";
  const searchQuery = "";

  const isExplicitlyUnbookable = (availText: string) => {
    if (!availText) return false;
    const status = availText.toUpperCase();
    if (/PROVIDER|DATA UNAVAILABLE|RATE_LIMIT/i.test(status)) return false;
    return /NOT BOOKABLE|NOT RUNNING|CLASS NOT AVAILABLE|TRAIN NOT ON SCHEDULED DATE|UNAVAILABLE/.test(status) && !/CHECK|TAP/.test(status);
  };

  const filteredSplits: any[] = []; // empty verified list

  const verified = filteredSplits;
  const verifiedKeys = new Set(verified.map(splitRouteStableKey));
  let unverified = dedupeSplitRoutes(mockSplits).filter(
    (split) => !verifiedKeys.has(splitRouteStableKey(split))
  );

  console.log("Unverified count before class/availability filter:", unverified.length);

  unverified = unverified.filter((split) => {
    const l1Class = selectedSortClass || primaryClassCode(split.leg1);
    const l2Class = selectedSortClass || primaryClassCode(split.leg2);
    const avail1 = split.leg1?.classAvailability?.[l1Class]?.[0]?.text || split.leg1?.classAvailability?.[l1Class]?.[0]?.availabilityText || split.leg1?.availability;
    const avail2 = split.leg2?.classAvailability?.[l2Class]?.[0]?.text || split.leg2?.classAvailability?.[l2Class]?.[0]?.availabilityText || split.leg2?.availability;
    
    console.log("l1Class:", l1Class, "l2Class:", l2Class);
    console.log("avail1:", avail1, "avail2:", avail2);
    console.log("isExplicitlyUnbookable(avail1):", isExplicitlyUnbookable(avail1));
    console.log("isExplicitlyUnbookable(avail2):", isExplicitlyUnbookable(avail2));
    
    return !isExplicitlyUnbookable(avail1) && !isExplicitlyUnbookable(avail2);
  });

  console.log("Unverified count after filter:", unverified.length);
}

runTest();
