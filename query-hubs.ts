import { dynamicSplitHubCandidates } from './src/services/trainService';

const pairs = [
  { src: 'CKP', dst: 'JP' },
  { src: 'PNBE', dst: 'UDZ' },
  { src: 'PNBE', dst: 'AWR' },
  { src: 'JP', dst: 'CKP' },
  { src: 'UDZ', dst: 'PNBE' },
  { src: 'AWR', dst: 'PNBE' }
];

console.log("Candidate hubs for long distance routes:");
pairs.forEach(({ src, dst }) => {
  const hubs = dynamicSplitHubCandidates(src, dst);
  console.log(`\n${src} -> ${dst}: count=${hubs.length}`);
  console.log("  Top 15 hubs:", hubs.slice(0, 15));
  console.log("  Has NDLS?", hubs.includes("NDLS"));
  console.log("  Has DDU?", hubs.includes("DDU"));
  console.log("  Has PRYJ?", hubs.includes("PRYJ"));
  console.log("  Has LKO?", hubs.includes("LKO"));
  console.log("  Has CNB?", hubs.includes("CNB"));
});
