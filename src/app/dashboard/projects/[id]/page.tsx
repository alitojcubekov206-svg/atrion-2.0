import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/backend/db";
import { getSessionUserId } from "@/backend/auth";
import ProjectView from "@/frontend/components/project/ProjectView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, select: { title: true } });
  return { title: project?.title || "Проект" };
}

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
