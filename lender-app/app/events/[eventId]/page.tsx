import { EventDetailClient } from "@/components/events/EventDetailClient";
import type { Id } from "@/convex/_generated/dataModel";

type Props = { params: Promise<{ eventId: string }> };

export default async function EventDetailPage({ params }: Props) {
  const { eventId } = await params;
  return (
    <EventDetailClient eventId={eventId as Id<"events">} />
  );
}
