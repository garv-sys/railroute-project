const { PrismaClient } = require('./client')
const prisma = new PrismaClient()

const stations = [
  { code: 'NDLS', name: 'New Delhi', latitude: 28.6415, longitude: 77.2183 },
  { code: 'PNBE', name: 'Patna Junction', latitude: 25.6030, longitude: 85.1376 },
  { code: 'PRYJ', name: 'Prayagraj Junction', latitude: 25.4431, longitude: 81.8256 },
  { code: 'CNB', name: 'Kanpur Central', latitude: 26.4547, longitude: 80.3506 },
  { code: 'DDU', name: 'Pt. DD Upadhyaya Jn', latitude: 25.2755, longitude: 83.1189 },
  { code: 'BSB', name: 'Varanasi Junction', latitude: 25.3323, longitude: 82.9880 },
  { code: 'LKO', name: 'Lucknow NR', latitude: 26.8329, longitude: 80.9200 },
  { code: 'HWH', name: 'Howrah Junction', latitude: 22.5833, longitude: 88.3417 },
  { code: 'MMCT', name: 'Mumbai Central', latitude: 18.9696, longitude: 72.8193 },
  { code: 'SBC', name: 'KSR Bengaluru', latitude: 12.9781, longitude: 77.5695 },
  { code: 'MAS', name: 'MGR Chennai Central', latitude: 13.0827, longitude: 80.2707 },
  { code: 'BPL', name: 'Bhopal Junction', latitude: 23.2599, longitude: 77.4126 },
  { code: 'NGP', name: 'Nagpur', latitude: 21.1508, longitude: 79.0882 },
]

async function main() {
  console.log(`Start seeding ...`)
  for (const s of stations) {
    const station = await prisma.station.upsert({
      where: { code: s.code },
      update: {},
      create: s,
    })
    console.log(`Created station with code: ${station.code}`)
  }
  console.log(`Seeding finished.`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
