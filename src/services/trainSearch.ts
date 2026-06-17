import { checkDirectTrains } from "@/services/trainService";
import { getTrainSchedule, searchDirectTrains } from "@/services/irctcService";

export async function getRoutes(source: string, destination: string, date: string, classType = "Any") {
  return checkDirectTrains(source, destination, date, classType);
}

export async function getTrainDetails(trainNo: string) {
  return getTrainSchedule(trainNo);
}

export async function getProviderTrainList(source: string, destination: string, date: string) {
  return searchDirectTrains(source, destination, date);
}
