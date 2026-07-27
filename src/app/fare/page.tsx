import { RailRouteToolPage } from "@/components/railroute-product";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function FarePage() {
  return <RailRouteToolPage tool="fare" />;
}
