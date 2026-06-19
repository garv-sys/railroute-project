import MAJOR_TRAIN_ROUTES from '../data/major_train_routes.json';

export type RouteStop = {
  code: string;
  arrival: string;
  departure: string;
  distance: number;
  day: number;
};

export type TrainRouteData = {
  trainNo: string;
  trainName: string;
  runsOnDays: string;
  classes: string[];
  route: RouteStop[];
};

class RailwayGraph {
  private trains: TrainRouteData[] = [];
  private stationTrains = new Map<string, TrainRouteData[]>();

  constructor() {
    this.trains = MAJOR_TRAIN_ROUTES as TrainRouteData[];
    this.buildIndex();
  }

  private buildIndex() {
    this.stationTrains.clear();
    for (const train of this.trains) {
      for (const stop of train.route) {
        const code = stop.code.toUpperCase().trim();
        if (!this.stationTrains.has(code)) {
          this.stationTrains.set(code, []);
        }
        this.stationTrains.get(code)!.push(train);
      }
    }
  }

  /**
   * Dynamically add a train schedule to the graph to support self-learning path discovery.
   */
  public addTrainRoute(trainNo: string, trainName: string, runsOnDays: string, classes: string[], stops: RouteStop[]) {
    const cleanNo = String(trainNo).trim();
    const existingIndex = this.trains.findIndex(t => String(t.trainNo).trim() === cleanNo);
    
    const newTrain: TrainRouteData = {
      trainNo: cleanNo,
      trainName,
      runsOnDays: runsOnDays || "1111111",
      classes: classes || [],
      route: stops
    };

    if (existingIndex !== -1) {
      // Update existing if route data is richer
      if (stops.length > this.trains[existingIndex].route.length) {
        this.trains[existingIndex] = newTrain;
        this.buildIndex();
      }
    } else {
      this.trains.push(newTrain);
      this.buildIndex();
    }
  }

  /**
   * Find candidate hubs for a 2-leg split journey between source and destination.
   * Discovers hubs dynamically based on train connectivity.
   */
  public findSplitHubs(source: string, destination: string): string[] {
    const src = source.toUpperCase().trim();
    const dst = destination.toUpperCase().trim();

    const srcTrains = this.stationTrains.get(src) || [];
    const dstTrains = this.stationTrains.get(dst) || [];

    const hubs = new Set<string>();

    for (const t1 of srcTrains) {
      const srcIdx = t1.route.findIndex(s => s.code.toUpperCase().trim() === src);
      if (srcIdx === -1) continue;
      const t1AfterStops = t1.route.slice(srcIdx + 1).map(s => s.code.toUpperCase().trim());

      for (const t2 of dstTrains) {
        const cleanNo1 = String(t1.trainNo).trim();
        const cleanNo2 = String(t2.trainNo).trim();
        if (cleanNo1 === cleanNo2) continue; // Skip direct train route

        const dstIdx = t2.route.findIndex(s => s.code.toUpperCase().trim() === dst);
        if (dstIdx === -1) continue;
        const t2BeforeStops = t2.route.slice(0, dstIdx).map(s => s.code.toUpperCase().trim());

        // Find intersection of stops
        for (const stop of t1AfterStops) {
          if (t2BeforeStops.includes(stop) && stop !== src && stop !== dst) {
            hubs.add(stop);
          }
        }
      }
    }

    return Array.from(hubs);
  }
}

export const railwayGraph = new RailwayGraph();
