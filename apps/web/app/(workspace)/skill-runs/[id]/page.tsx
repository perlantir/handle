import { SkillRunScreen } from "@/components/skills/SkillRunScreen";

export default async function SkillRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SkillRunScreen runId={id} />;
}
