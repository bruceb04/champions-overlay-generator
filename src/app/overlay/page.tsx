import { OverlayClient } from "./overlay-client";

type OverlayPageProps = {
  searchParams: Promise<{
    id?: string;
  }>;
};

export default async function OverlayPage({ searchParams }: OverlayPageProps) {
  const { id = "" } = await searchParams;
  return <OverlayClient id={id} />;
}
