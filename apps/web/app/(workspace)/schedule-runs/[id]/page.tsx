import { ScheduleRunScreen } from "@/components/schedules/ScheduleRunScreen";

export default async function ScheduleRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ScheduleRunScreen runId={id} />;
}
