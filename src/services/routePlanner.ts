import { checkDirectTrains, findMultiSplitRoutes, findSmartRoutes } from "@/services/trainService";

export async function getBestConnections(source: string, destination: string, date: string, classType = "Any", preferredHub = "") {
  const directTrains = await checkDirectTrains(source, destination, date, classType);
  const splitRoutes = await findSmartRoutes(source, destination, date, classType, directTrains, preferredHub);
  const multiSplitRoutes = await findMultiSplitRoutes(source, destination, date, classType, preferredHub);
  return { directTrains, splitRoutes, multiSplitRoutes };
}

export async function getAlternativeRoutes(source: string, destination: string, date: string, classType = "Any", preferredHub = "") {
  return findSmartRoutes(source, destination, date, classType, [], preferredHub);
}

export async function getMultiSplitRoutes(source: string, destination: string, date: string, classType = "Any", preferredHub = "") {
  return findMultiSplitRoutes(source, destination, date, classType, preferredHub);
}
