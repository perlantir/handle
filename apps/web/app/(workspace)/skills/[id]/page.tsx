import { SkillDetailScreen } from "@/components/skills/SkillDetailScreen";

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SkillDetailScreen skillId={id} />;
}
