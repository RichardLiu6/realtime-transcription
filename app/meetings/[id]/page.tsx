"use client";

import { useParams } from "next/navigation";
import MeetingDetailView from "@/components/meetings/MeetingDetailView";

// One saved meeting (also opened inside the app's phone layout, over the
// recording page — see components/phone/PhoneChrome)
export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  return <MeetingDetailView id={id} />;
}
