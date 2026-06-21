import { dynamicSplitHubCandidates } from "./src/services/trainService";

function testRoute(source: string, dest: string) {
  console.log(`=== dynamicSplitHubCandidates("${source}", "${dest}") ===`);
  const candidates = dynamicSplitHubCandidates(source, dest, "", 50);
  console.log(`Returned Candidates Count: ${candidates.length}`);
  console.log("Returned Candidates:", candidates.join(", "));
}

testRoute("CKP", "JP");
testRoute("PNBE", "JP");
