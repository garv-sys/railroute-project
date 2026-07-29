#!/underline/bin/env node
import { checkDirectTrains, findSmartRoutesForDate } from '../src/services/trainService';

async function runCliSearch() {
  const args = process.argv.slice(2);
  const source = (args[0] || 'PNBE').toUpperCase();
  const destination = (args[1] || 'JP').toUpperCase();
  const date = args[2] || '2026-08-05';
  const classType = (args[3] || '3A').toUpperCase();

  console.log('\n=============================================================');
  console.log(` 🚆 RAILROUTE TERMINAL SEARCH ENGINE`);
  console.log(` Route: ${source} ➔ ${destination} | Date: ${date} | Class: ${classType}`);
  console.log('=============================================================\n');

  console.log('🔍 [1/2] Searching direct trains...');
  const directTrains = await checkDirectTrains(source, destination, date, classType, {}, 'GN');

  console.log(`\n📌 DIRECT TRAINS (${directTrains.length} found):`);
  if (directTrains.length === 0) {
    console.log('   (No direct trains running on this exact date)');
  } else {
    directTrains.forEach((t, i) => {
      console.log(`   ${i + 1}. Train ${t.trainNo} - ${t.trainName}`);
      console.log(`      Dep: ${t.departureTime || '—'} (${t.source}) ➔ Arr: ${t.arrivalTime || '—'} (${t.destination})`);
      console.log(`      Fare/Status: ${t.availabilityStatus || 'CHECKED'} | ${t.fare ? '₹' + t.fare : 'Live'}`);
    });
  }

  console.log('\n🔍 [2/2] Searching Smart Split Routes across hubs...');
  const splitRoutes = await findSmartRoutesForDate(source, destination, date, classType, directTrains, '', {}, 'GN');

  console.log(`\n🔀 SMART SPLIT CONNECTIONS (${splitRoutes.length} found across hubs):`);
  if (splitRoutes.length === 0) {
    console.log('   (No split connections found)');
  } else {
    // Group by hub
    const hubMap: Record<string, typeof splitRoutes> = {};
    splitRoutes.forEach((s) => {
      const hub = s.hubStation || 'UNKNOWN';
      if (!hubMap[hub]) hubMap[hub] = [];
      hubMap[hub].push(s);
    });

    Object.entries(hubMap).forEach(([hub, list]) => {
      console.log(`\n   📍 HUB: ${hub} (${list.length} options):`);
      list.slice(0, 3).forEach((s, idx) => {
        const l1 = s.leg1 || {};
        const l2 = s.leg2 || {};
        console.log(`      ${idx + 1}. [${l1.trainNo || 'Leg1'}] ${l1.source || source} ➔ ${s.hubStation} (${l1.departureTime || ''} - ${l1.arrivalTime || ''})`);
        console.log(`         [${l2.trainNo || 'Leg2'}] ${s.hubStation} ➔ ${l2.destination || destination} (${l2.departureTime || ''} - ${l2.arrivalTime || ''})`);
        console.log(`         Layover: ${s.layoverDuration || '—'} | Total Fare: ₹${s.totalFare || '—'}`);
      });
      if (list.length > 3) {
        console.log(`      ... and ${list.length - 3} more options via ${hub}`);
      }
    });
  }

  console.log('\n=============================================================');
  console.log(` ✅ TOTAL COMBINED OPTIONS: ${directTrains.length + splitRoutes.length} (${directTrains.length} direct + ${splitRoutes.length} split)`);
  console.log('=============================================================\n');
}

runCliSearch().catch((err) => {
  console.error('Search failed:', err);
  process.exit(1);
});
