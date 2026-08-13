import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import ProjectView from "@/components/project/ProjectView";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getSessionUserId();
  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== userId) notFound();

  return (
    <ProjectView
      project={{
        id: project.id,
        title: project.title,
        idea: project.idea,
        status: project.status,
        interview: project.interview ? JSON.parse(project.interview) : null,
        blueprint: project.blueprint ? JSON.parse(project.blueprint) : null,
      }}
    />
  );
}
