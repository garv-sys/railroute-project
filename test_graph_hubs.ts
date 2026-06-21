import { railwayGraph } from "./src/lib/railway-graph";

const ROUTES = [
  { from: "UDZ", to: "NDLS", label: "Udaipur to Delhi" },
  { from: "UDZ", to: "PNBE", label: "Udaipur to Patna" },
  { from: "UDZ", to: "CKP", label: "Udaipur to Chakradharpur" },
  { from: "UDZ", to: "HWH", label: "Udaipur to Kolkata" },
  { from: "PNBE", to: "JP", label: "Patna to Jaipur" },
  { from: "PNBE", to: "UDZ", label: "Patna to Udaipur" },
  { from: "PNBE", to: "AWR", label: "Patna to Alwar" },
  { from: "PNBE", to: "JU", label: "Patna to Jodhpur" },
  { from: "RNC", to: "JU", label: "Ranchi to Jodhpur" },
  { from: "RNC", to: "UDZ", label: "Ranchi to Udaipur" },
  { from: "RNC", to: "AWR", label: "Ranchi to Alwar" },
  { from: "PNBE", to: "GHY", label: "Patna to Guwahati" },
  { from: "PNBE", to: "BKN", label: "Patna to Bikaner" },
  { from: "PNBE", to: "BHL", label: "Patna to Bhilwara" },
  { from: "PNBE", to: "HYB", label: "Patna to Hyderabad" },
  { from: "PNBE", to: "SML", label: "Patna to Shimla" },
  { from: "PNBE", to: "ERS", label: "Patna to Kochi" },
  { from: "PNBE", to: "MAS", label: "Patna to Chennai" },
  { from: "PNBE", to: "SBC", label: "Patna to Bangalore" },
  { from: "PNBE", to: "RPO", label: "Patna to Sikkim" },
  { from: "NDLS", to: "CKP", label: "Delhi to Chakradharpur" },
];

for (const r of ROUTES) {
  const hubs = railwayGraph.findSplitHubs(r.from, r.to);
  console.log(`${r.label} (${r.from} -> ${r.to}): Found ${hubs.length} graph hubs: ${hubs.slice(0, 10).join(", ")}${hubs.length > 10 ? "..." : ""}`);
}
